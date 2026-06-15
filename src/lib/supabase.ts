import { createClient } from '@supabase/supabase-js';

// Vite expõe variáveis com VITE_ no frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || 'https://esoobldjrakphbemxnpp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzb29ibGRqcmFrcGhiZW14bnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NzMyMTUsImV4cCI6MjA5NzA0OTIxNX0.T1XIzBlcAA2EMSPqppIVpxtcYYh1db-lWMH1KPrq-y4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
