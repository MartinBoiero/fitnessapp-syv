import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

export async function uploadMedia(file) {
  if (!file) return null
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('exercise-media').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return supabase.storage.from('exercise-media').getPublicUrl(path).data.publicUrl
}

export function fail(error) { throw new Error(error?.message || 'Ocurrió un error inesperado.') }
