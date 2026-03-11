import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://smvexxzndteksfbzlelr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_o6kYgQy-TrUeoZBa1uU_iw_Nzlffvsn';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
