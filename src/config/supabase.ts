import { createClient } from '@supabase/supabase-js';

export const getSupabaseClient = (supabaseUrl: string, supabaseAnonKey: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
};
