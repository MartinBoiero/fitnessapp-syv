-- Ejecutá este archivo completo una vez en Supabase > SQL Editor.
-- El primer administrador se crea al final del archivo, después de registrarte desde la app.
create type public.app_role as enum ('ADMIN', 'PROFESOR', 'CLIENT');
create type public.account_status as enum ('ACTIVE', 'PENDING', 'REJECTED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null unique,
  role public.app_role not null default 'CLIENT',
  status public.account_status not null default 'ACTIVE',
  profesor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.exercises (
  id bigint generated always as identity primary key,
  nombre text not null, musculo text not null, descripcion text,
  imagen_url text, video_url text,
  created_by_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.training_plans (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  sets integer not null check (sets > 0), reps integer not null check (reps > 0),
  peso_sugerido numeric, notas_extras text, created_at timestamptz not null default now()
);
create table public.exercise_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  peso_usado numeric not null check (peso_usado >= 0),
  reps_realizadas integer not null check (reps_realizadas > 0),
  sets_realizados integer not null check (sets_realizados > 0),
  notas text, fecha timestamptz not null default now()
);
create index profiles_profesor_id_idx on public.profiles(profesor_id);
create index plans_client_id_idx on public.training_plans(client_id);
create index progress_user_id_idx on public.exercise_progress(user_id);
create extension if not exists pgcrypto with schema extensions;

-- El perfil se crea en el servidor al crear auth.users. Así funciona tanto si
-- la confirmación de email está activa como si Supabase entrega sesión inmediata.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_role public.app_role;
  professor_email text;
  professor_id uuid;
begin
  requested_role := coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'CLIENT'::public.app_role);
  professor_email := new.raw_user_meta_data ->> 'profesor_email';
  -- El rol ADMIN sólo puede provenir del seed SQL, que marca app_metadata.
  -- El navegador no puede asignarse app_metadata, por lo que un registro público
  -- nunca puede escalar privilegios.
  if requested_role = 'ADMIN' and coalesce(new.raw_app_meta_data ->> 'bootstrap_admin', 'false') <> 'true' then
    raise exception 'No se puede registrar un administrador';
  end if;
  if requested_role = 'CLIENT' then
    select id into professor_id from public.profiles
      where lower(email) = lower(professor_email) and role = 'PROFESOR' and status = 'ACTIVE';
    if professor_id is null then raise exception 'No existe un profesor activo con ese email'; end if;
  end if;
  insert into public.profiles (id, nombre, email, role, status, profesor_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    requested_role,
    case when requested_role = 'PROFESOR' then 'PENDING'::public.account_status else 'ACTIVE'::public.account_status end,
    professor_id
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- ADMINISTRADOR INICIAL
-- Antes de ejecutar este archivo, reemplazá los tres valores siguientes por los tuyos.
-- No dejes una contraseña conocida en un repositorio público.
do $$
declare
  bootstrap_email constant text := 'admin123@example.com';
  bootstrap_name constant text := 'Admin 1';
  bootstrap_password constant text := 'CAMBIAR-por-una-clave-fuerte-antes-de-ejecutar';
  bootstrap_id uuid := extensions.gen_random_uuid();
begin
  if bootstrap_password = 'CAMBIAR-por-una-clave-fuerte-antes-de-ejecutar' then
    raise exception 'Editá bootstrap_password antes de ejecutar el schema';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(bootstrap_email)) then
    raise exception 'Ya existe un usuario con el email de administrador elegido';
  end if;
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    bootstrap_id, 'authenticated', 'authenticated', lower(bootstrap_email),
    extensions.crypt(bootstrap_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'bootstrap_admin', true),
    jsonb_build_object('nombre', bootstrap_name, 'role', 'ADMIN'),
    now(), now()
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  values (bootstrap_id, bootstrap_id, jsonb_build_object('sub', bootstrap_id::text, 'email', lower(bootstrap_email), 'email_verified', true, 'phone_verified', false), 'email', bootstrap_id::text, now(), now());
end;
$$;

-- Funciones SECURITY DEFINER: validan relaciones sin exponer datos de otros usuarios.
create or replace function public.is_admin() returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE');
$$;
create or replace function public.is_active_professor() returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'PROFESOR' and status = 'ACTIVE');
$$;
create or replace function public.register_profile(p_nombre text, p_role public.app_role, p_profesor_email text default null) returns void language plpgsql security definer set search_path = public as $$
declare p_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_role = 'ADMIN' then raise exception 'No se puede registrar un administrador'; end if;
  if p_role = 'CLIENT' then
    select id into p_id from profiles where lower(email) = lower(p_profesor_email) and role = 'PROFESOR' and status = 'ACTIVE';
    if p_id is null then raise exception 'No existe un profesor activo con ese email'; end if;
  end if;
  insert into profiles(id,nombre,email,role,status,profesor_id)
  select auth.uid(), p_nombre, lower(email), p_role, case when p_role='PROFESOR' then 'PENDING'::account_status else 'ACTIVE'::account_status end, p_id
  from auth.users where id=auth.uid();
end $$;
create or replace function public.change_my_professor(p_profesor_email text) returns void language plpgsql security definer set search_path = public as $$
declare p_id uuid;
begin
  select id into p_id from profiles where lower(email)=lower(p_profesor_email) and role='PROFESOR' and status='ACTIVE';
  if p_id is null then raise exception 'No existe un profesor activo con ese email'; end if;
  update profiles set profesor_id=p_id where id=auth.uid() and role='CLIENT';
  if not found then raise exception 'Solo un cliente puede cambiar de profesor'; end if;
end $$;
grant execute on function public.register_profile(text, public.app_role, text) to authenticated;
grant execute on function public.change_my_professor(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.training_plans enable row level security;
alter table public.exercise_progress enable row level security;

create policy "profiles own, admin or their professor" on profiles for select to authenticated using (
  id=auth.uid() or is_admin() or (role='CLIENT' and profesor_id=auth.uid())
);
create policy "admin updates profiles" on profiles for update to authenticated using (is_admin()) with check (is_admin());
create policy "authenticated read exercises" on exercises for select to authenticated using (true);
create policy "active professors manage own exercises" on exercises for all to authenticated using (is_active_professor() and created_by_id=auth.uid()) with check (is_active_professor() and created_by_id=auth.uid());
create policy "client sees own plans" on training_plans for select to authenticated using (client_id=auth.uid());
create policy "professor manages their clients plans" on training_plans for all to authenticated using (exists(select 1 from profiles p where p.id=training_plans.client_id and p.profesor_id=auth.uid()) and is_active_professor()) with check (exists(select 1 from profiles p where p.id=training_plans.client_id and p.profesor_id=auth.uid()) and is_active_professor());
create policy "user logs own progress" on exercise_progress for select to authenticated using (user_id=auth.uid() or exists(select 1 from profiles p where p.id=exercise_progress.user_id and p.profesor_id=auth.uid()));
create policy "client inserts own progress" on exercise_progress for insert to authenticated with check (user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('exercise-media','exercise-media',true,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']) on conflict (id) do nothing;
create policy "authenticated upload exercise media" on storage.objects for insert to authenticated with check (bucket_id='exercise-media' and is_active_professor());
create policy "public exercise media read" on storage.objects for select to public using (bucket_id='exercise-media');

-- DESPUÉS de registrar la primera cuenta en la app, convertíla en admin una única vez:
-- update public.profiles set role='ADMIN', status='ACTIVE' where email='tu-email@ejemplo.com';
