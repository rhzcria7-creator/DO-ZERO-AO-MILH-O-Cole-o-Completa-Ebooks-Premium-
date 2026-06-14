import { createClient } from '@supabase/supabase-js';

// Vite expõe variáveis com VITE_ no frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
