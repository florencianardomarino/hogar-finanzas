import { createClient } from '@supabase/supabase-js';

// Las variables de entorno en Vite se leen usando import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-placeholder-supabase-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-placeholder-anon-key';

if (
  supabaseUrl === 'https://your-placeholder-supabase-url.supabase.co' || 
  supabaseAnonKey === 'your-placeholder-anon-key'
) {
  console.warn(
    'Supabase URL or Anon Key is missing. Please configure your .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Sesión persistente requerida por la especificación
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
