# Fitnessapp Planes — Vercel + Supabase

Clon funcional de la app original sin Spring Boot, VPS ni Docker. El navegador se conecta a Supabase para autenticación, PostgreSQL y archivos; Vercel sólo publica el frontend estático.

## Puesta en marcha

1. Creá un proyecto gratuito en [Supabase](https://supabase.com/dashboard/projects) y abrí **SQL Editor**.
2. Pegá y ejecutá completo [`supabase/schema.sql`](./supabase/schema.sql). Esto crea las tablas, restricciones, RLS y el bucket multimedia.
3. En Supabase, Authentication > URL Configuration, agregá `http://localhost:5173` y luego tu URL de Vercel. Podés mantener la confirmación de email activada: el perfil se crea automáticamente y el usuario sólo debe confirmar el correo antes de iniciar sesión.
4. Copiá `.env.example` como `.env.local` y cargá la **Project URL** y la **anon public key** desde Supabase > Settings > API. La clave `service_role` nunca se usa ni debe ir al frontend.
5. Instalá y ejecutá:

   ```bash
   npm install
   npm run dev
   ```

6. Antes de ejecutar el esquema, elegí el email, nombre y una contraseña fuerte para el administrador inicial en el bloque `ADMINISTRADOR INICIAL` de `schema.sql`. Al terminar, iniciá sesión directamente con esas credenciales: no requiere registro ni confirmación por email.
7. Desde el admin aprobá profesores. Los clientes sólo podrán registrarse usando el email de un profesor activo.

## Deploy en Vercel

1. Subí **esta carpeta** a un repositorio GitHub (el `.gitignore` excluye secretos).
2. En Vercel importá el repositorio. El preset se detecta como Vite: build `npm run build`, output `dist`.
3. En Vercel > Settings > Environment Variables agregá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para Production, Preview y Development.
4. Hacé deploy y agregá la URL resultante en Supabase > Authentication > URL Configuration.

## Equivalencias con el proyecto original

| Antes | Ahora |
|---|---|
| Spring Boot + JWT | Supabase Auth |
| PostgreSQL en Docker | Postgres administrado por Supabase |
| Cloudinary | Supabase Storage (`exercise-media`) |
| API REST propia | Cliente `@supabase/supabase-js` con RLS |

Las políticas RLS restringen cada rol: el admin gestiona solicitudes; profesores activos administran sus ejercicios y planes de sus clientes; cada cliente únicamente ve su plan y registra su propio avance.

## Si ya habías creado la base de datos

Ejecutá una vez [`supabase/migrations/20261017_create_profile_on_signup.sql`](./supabase/migrations/20261017_create_profile_on_signup.sql) en el SQL Editor. Es la corrección para registros con confirmación de email.

Para crear el administrador inicial en una base existente, editá y ejecutá después [`supabase/migrations/20261017140000_create_bootstrap_admin.sql`](./supabase/migrations/20261017140000_create_bootstrap_admin.sql). Incluye los tres valores que debés elegir arriba; no deja una contraseña predeterminada insegura.

## Reiniciar una base de pruebas

Si no hay datos para conservar, usá [`supabase/reset_and_setup.sql`](./supabase/reset_and_setup.sql). El archivo borra solamente los datos de esta aplicación y los usuarios Auth del proyecto, recrea todo y deja un administrador inicial listo para iniciar sesión. Cambiá `bootstrap_password` antes de ejecutarlo.

Si ya ejecutaste una versión anterior del reset y el administrador no puede iniciar sesión, aplicá [`supabase/repair_bootstrap_admin_login.sql`](./supabase/repair_bootstrap_admin_login.sql) con el mismo email y la contraseña elegida.
