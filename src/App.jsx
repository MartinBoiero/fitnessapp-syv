import { useEffect, useState } from 'react'
import { configured, fail, supabase, uploadMedia } from './supabase'

const MUSCLES = ['Pecho', 'Espalda', 'Bíceps', 'Tríceps', 'Hombros', 'Abdomen', 'Piernas']
const msg = e => e?.message || 'No se pudo completar la operación.'

function Auth({ onReady }) {
  const [mode, setMode] = useState('login'), [role, setRole] = useState('CLIENT')
  const [form, setForm] = useState({ nombre: '', email: '', password: '', profesorEmail: '' }), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const change = e => setForm({ ...form, [e.target.name]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'login') { const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password }); if (error) fail(error) }
      else {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { nombre: form.nombre, role, profesor_email: role === 'CLIENT' ? form.profesorEmail : null },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) fail(error)
        if (!data.user || data.user.identities?.length === 0) throw new Error('Ya existe una cuenta con este email. Iniciá sesión o confirmá el correo recibido.')
        if (!data.session) {
          alert('Cuenta creada. Revisá tu correo, confirmá la cuenta y luego iniciá sesión.')
          setMode('login')
        } else if (role === 'PROFESOR') alert('Tu cuenta fue creada y quedó pendiente de aprobación.')
      }
    } catch (e) { setError(msg(e)) } finally { setBusy(false) }
  }
  return <section className="auth"><form className="card auth-card" onSubmit={submit}><h1>Fitnessapp Planes</h1><p>{mode === 'login' ? 'Ingresá a tu espacio' : 'Creá tu cuenta'}</p>{error && <div className="error">{error}</div>}
    {mode === 'register' && <><div className="tabs"><button type="button" className={role === 'CLIENT' ? 'active' : ''} onClick={() => setRole('CLIENT')}>Soy cliente</button><button type="button" className={role === 'PROFESOR' ? 'active' : ''} onClick={() => setRole('PROFESOR')}>Soy profesor</button></div><label>Nombre completo<input name="nombre" value={form.nombre} onChange={change} required /></label></>}
    <label>Email<input type="email" name="email" value={form.email} onChange={change} required /></label><label>Contraseña<input type="password" minLength="6" name="password" value={form.password} onChange={change} required /></label>
    {mode === 'register' && role === 'CLIENT' && <label>Email de tu profesor<input type="email" name="profesorEmail" value={form.profesorEmail} onChange={change} required /></label>}
    <button className="primary" disabled={busy}>{busy ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Registrarme'}</button><button className="link" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '¿No tenés cuenta? Registrate' : 'Ya tengo una cuenta'}</button>
  </form></section>
}

function Admin() {
  const [pending, setPending] = useState([]), [error, setError] = useState('')
  const load = async () => { const { data, error } = await supabase.from('profiles').select('*').eq('role', 'PROFESOR').eq('status', 'PENDING').order('created_at'); if (error) setError(msg(error)); else setPending(data) }
  useEffect(() => { load() }, [])
  const decide = async (id, status) => { const { error } = await supabase.from('profiles').update({ status }).eq('id', id); if (error) setError(msg(error)); else load() }
  return <Panel title="Administración"><h2>Solicitudes de profesores</h2>{error && <div className="error">{error}</div>}{pending.length ? pending.map(p => <div className="row card" key={p.id}><div><strong>{p.nombre}</strong><small>{p.email}</small></div><div><button className="primary" onClick={() => decide(p.id, 'ACTIVE')}>Aprobar</button><button className="danger" onClick={() => decide(p.id, 'REJECTED')}>Rechazar</button></div></div>) : <Empty text="No hay solicitudes pendientes." />}</Panel>
}

function Professor() {
  const [tab, setTab] = useState('clients'), [clients, setClients] = useState([]), [selected, setSelected] = useState(null), [exercises, setExercises] = useState([]), [error, setError] = useState('')
  const load = async () => { const [{ data: c, error: ce }, { data: x, error: xe }] = await Promise.all([supabase.from('profiles').select('*').eq('role','CLIENT'), supabase.from('exercises').select('*').order('created_at', { ascending: false })]); if (ce || xe) setError(msg(ce || xe)); else { setClients(c); setExercises(x) } }
  useEffect(() => { load() }, [])
  return <Panel title="Panel profesor" tab={tab} setTab={setTab} items={['clients','exercises']}><>{error && <div className="error">{error}</div>}{tab === 'clients' ? <><h2>Mis clientes</h2>{clients.length ? clients.map(c => <div key={c.id} className="row card"><div><strong>{c.nombre}</strong><small>{c.email}</small></div><button className="primary" onClick={() => setSelected(c)}>Ver y asignar plan</button></div>) : <Empty text="Aún no tenés clientes." />}</> : <ExerciseManager exercises={exercises} reload={load} setError={setError} />}{selected && <PlanModal client={selected} exercises={exercises} close={() => setSelected(null)} />}</></Panel>
}

function ExerciseManager({ exercises, reload, setError }) {
  const [editing, setEditing] = useState(null)
  async function remove(id) { if (!confirm('¿Eliminar este ejercicio?')) return; const { error } = await supabase.from('exercises').delete().eq('id', id); if (error) setError(msg(error)); else reload() }
  return <><div className="heading"><h2>Catálogo de ejercicios</h2><button className="primary" onClick={() => setEditing({})}>Nuevo ejercicio</button></div>{exercises.length ? exercises.map(x => <div className="row card" key={x.id}><div><strong>{x.nombre}</strong><small>{x.musculo} · {x.descripcion}</small></div><div><button onClick={() => setEditing(x)}>Editar</button><button className="danger" onClick={() => remove(x.id)}>Eliminar</button></div></div>) : <Empty text="Todavía no hay ejercicios." />}{editing && <ExerciseModal exercise={editing} close={() => setEditing(null)} reload={reload} />}</>
}

function ExerciseModal({ exercise, close, reload }) {
  const [form, setForm] = useState({ nombre: exercise.nombre || '', musculo: exercise.musculo || MUSCLES[0], descripcion: exercise.descripcion || '', imagen_url: exercise.imagen_url || '', video_url: exercise.video_url || '' }), [image, setImage] = useState(), [video, setVideo] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const change = e => setForm({ ...form, [e.target.name]: e.target.value })
  async function save(e) { e.preventDefault(); setBusy(true); try { const imagen_url = image ? await uploadMedia(image) : form.imagen_url; const video_url = video ? await uploadMedia(video) : form.video_url; const payload = { ...form, imagen_url, video_url }; const query = exercise.id ? supabase.from('exercises').update(payload).eq('id', exercise.id) : supabase.from('exercises').insert(payload); const { error } = await query; if (error) fail(error); await reload(); close() } catch (e) { setError(msg(e)) } finally { setBusy(false) } }
  return <Modal close={close}><h2>{exercise.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>{error && <div className="error">{error}</div>}<form onSubmit={save}><label>Nombre<input name="nombre" value={form.nombre} onChange={change} required /></label><label>Grupo muscular<select name="musculo" value={form.musculo} onChange={change}>{MUSCLES.map(m => <option key={m}>{m}</option>)}</select></label><label>Descripción<textarea name="descripcion" value={form.descripcion} onChange={change}/></label><label>Imagen (archivo opcional)<input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])}/></label><label>o URL de imagen<input name="imagen_url" value={form.imagen_url} onChange={change}/></label><label>Video (archivo opcional)<input type="file" accept="video/*" onChange={e => setVideo(e.target.files[0])}/></label><label>o URL de video<input name="video_url" value={form.video_url} onChange={change}/></label><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></form></Modal>
}

function PlanModal({ client, exercises, close }) {
  const [plans, setPlans] = useState([]), [logs, setLogs] = useState([]), [form, setForm] = useState({ exercise_id: '', sets: 3, reps: 10, peso_sugerido: '', notas_extras: '' }), [error, setError] = useState('')
  const load = async () => { const [{ data: p, error: pe }, { data: l, error: le }] = await Promise.all([supabase.from('training_plans').select('*, exercises(*)').eq('client_id', client.id), supabase.from('exercise_progress').select('*, exercises(nombre)').eq('user_id', client.id).order('fecha', { ascending: false })]); if (pe || le) setError(msg(pe || le)); else { setPlans(p); setLogs(l) } }
  useEffect(() => { load() }, [])
  async function add(e) { e.preventDefault(); const { error } = await supabase.from('training_plans').insert({ ...form, client_id: client.id, exercise_id: form.exercise_id, peso_sugerido: form.peso_sugerido || null }); if (error) setError(msg(error)); else { setForm({ ...form, exercise_id: '' }); load() } }
  const remove = async id => { const { error } = await supabase.from('training_plans').delete().eq('id', id); if (error) setError(msg(error)); else load() }
  return <Modal close={close}><h2>{client.nombre}</h2>{error && <div className="error">{error}</div>}<h3>Asignar ejercicio</h3><form onSubmit={add} className="compact"><select required value={form.exercise_id} onChange={e => setForm({...form, exercise_id:e.target.value})}><option value="">Elegí un ejercicio</option>{exercises.map(x => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select><input type="number" min="1" value={form.sets} onChange={e => setForm({...form,sets:+e.target.value})}/><input type="number" min="1" value={form.reps} onChange={e => setForm({...form,reps:+e.target.value})}/><input type="number" step=".5" placeholder="Peso kg" value={form.peso_sugerido} onChange={e => setForm({...form,peso_sugerido:e.target.value})}/><input placeholder="Notas" value={form.notas_extras} onChange={e => setForm({...form,notas_extras:e.target.value})}/><button className="primary">Asignar</button></form><h3>Rutina actual</h3>{plans.map(p => <div className="row" key={p.id}><span>{p.exercises?.nombre} · {p.sets}×{p.reps}</span><button className="danger" onClick={() => remove(p.id)}>Quitar</button></div>)}<h3>Últimos progresos</h3>{logs.length ? logs.slice(0,10).map(l => <p key={l.id}>{l.exercises?.nombre}: {l.peso_usado} kg · {l.sets_realizados}×{l.reps_realizadas} — {new Date(l.fecha).toLocaleDateString()}</p>) : <Empty text="Sin progresos todavía." />}</Modal>
}

function Client({ profile }) {
  const [plans, setPlans] = useState([]), [logs, setLogs] = useState([]), [open, setOpen] = useState(null), [newProfessor, setNewProfessor] = useState(''), [message, setMessage] = useState('')
  const load = async () => { const [{ data: p }, { data: l }] = await Promise.all([supabase.from('training_plans').select('*, exercises(*)').eq('client_id', profile.id), supabase.from('exercise_progress').select('*, exercises(nombre)').eq('user_id', profile.id).order('fecha', { ascending: false })]); setPlans(p || []); setLogs(l || []) }
  useEffect(() => { load() }, [])
  async function changeProfessor(e) { e.preventDefault(); const { error } = await supabase.rpc('change_my_professor', { p_profesor_email: newProfessor }); setMessage(error ? msg(error) : 'Profesor actualizado.'); if (!error) setNewProfessor('') }
  return <Panel title="Mi espacio"><h2>Mi plan de entrenamiento</h2>{plans.length ? <div className="grid">{plans.map(p => <article className="card exercise" key={p.id}>{p.exercises?.imagen_url && <img src={p.exercises.imagen_url} alt=""/>}<h3>{p.exercises?.nombre}</h3><small>{p.exercises?.musculo}</small><p>{p.sets} series × {p.reps} repeticiones {p.peso_sugerido && `· ${p.peso_sugerido} kg`}</p>{p.exercises?.video_url && <a href={p.exercises.video_url} target="_blank">Ver video demostrativo</a>}<button className="primary" onClick={() => setOpen(p)}>Registrar progreso</button></article>)}</div> : <Empty text="Todavía no tenés una rutina asignada." />}<h2>Historial reciente</h2>{logs.length ? <div className="card table">{logs.slice(0,10).map(l => <p key={l.id}>{l.exercises?.nombre} · <b>{l.peso_usado} kg</b> · {l.sets_realizados}×{l.reps_realizadas} · {new Date(l.fecha).toLocaleDateString()}</p>)}</div> : <Empty text="Todavía no registraste progreso."/>}<form className="card compact" onSubmit={changeProfessor}><h3>Cambiar profesor</h3>{message && <p>{message}</p>}<input type="email" required placeholder="Email del nuevo profesor" value={newProfessor} onChange={e => setNewProfessor(e.target.value)}/><button>Guardar cambio</button></form>{open && <ProgressModal plan={open} close={() => setOpen(null)} done={() => {setOpen(null);load()}}/>}</Panel>
}

function ProgressModal({ plan, close, done }) { const [form,setForm] = useState({peso_usado:plan.peso_sugerido || '', sets_realizados:plan.sets, reps_realizadas:plan.reps, notas:''}), [error,setError]=useState(''); const save=async e=>{e.preventDefault();const {error}=await supabase.from('exercise_progress').insert({...form,exercise_id:plan.exercise_id, fecha:new Date().toISOString()});if(error)setError(msg(error));else done()};return <Modal close={close}><h2>Registrar: {plan.exercises?.nombre}</h2>{error&&<div className="error">{error}</div>}<form onSubmit={save}><label>Peso (kg)<input type="number" step=".5" required value={form.peso_usado} onChange={e=>setForm({...form,peso_usado:+e.target.value})}/></label><label>Series<input type="number" min="1" required value={form.sets_realizados} onChange={e=>setForm({...form,sets_realizados:+e.target.value})}/></label><label>Repeticiones<input type="number" min="1" required value={form.reps_realizadas} onChange={e=>setForm({...form,reps_realizadas:+e.target.value})}/></label><label>Notas<textarea value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})}/></label><button className="primary">Guardar progreso</button></form></Modal> }

function Panel({ title, children, tab, setTab, items }) { return <div className="layout"><aside><h2>{title}</h2>{items?.map(x => <button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x === 'clients' ? 'Mis clientes' : 'Ejercicios'}</button>)}</aside><main>{children}</main></div> }
function Modal({ children, close }) { return <div className="overlay" onMouseDown={close}><section className="modal card" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button>{children}</section></div> }
function Empty({ text }) { return <p className="empty">{text}</p> }

export default function App() {
  const [session, setSession] = useState(), [profile, setProfile] = useState(), [error, setError] = useState('')
  useEffect(() => { if (!configured) return; supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>subscription.unsubscribe() }, [])
  useEffect(() => { if (!session) return setProfile(null); supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data,error})=>{setProfile(data);setError(error?msg(error):'')}) }, [session])
  if (!configured) return <section className="auth"><div className="card auth-card"><h1>Configuración requerida</h1><p>Copiá <code>.env.example</code> como <code>.env.local</code> y agregá las claves públicas de Supabase.</p></div></section>
  if (!session) return <Auth />
  if (!profile) return <section className="auth"><div className="card auth-card"><p>{error || 'Cargando tu perfil…'}</p></div></section>
  return <><header><b>Fitnessapp Planes</b><span>Hola, {profile.nombre}</span><button onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></header>{profile.role==='ADMIN'?<Admin/>:profile.role==='PROFESOR'?(profile.status==='ACTIVE'?<Professor/>:<section className="auth"><div className="card auth-card"><h2>Cuenta pendiente</h2><p>Un administrador debe aprobar tu perfil antes de habilitar el panel.</p></div></section>):<Client profile={profile}/>}</>
}
