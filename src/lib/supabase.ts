import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://ndvrfjszytiodogekoqu.supabase.co';
const defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdnJmanN6eXRpb2RvZ2Vrb3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjE1OTEsImV4cCI6MjA5NTczNzU5MX0.2ULyJNDBfc63wmlthwrdyPyU5AR-F9gKPlZkJ9HzDRQ';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Sesión persistente requerida por la especificación
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
