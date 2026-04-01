import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey;

if (!SUPABASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL — check .env and app.config.js');
}
if (!SUPABASE_ANON_KEY) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY — check .env and app.config.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

const DEBUG_SUPABASE_AUTH_LOGS = false;

if (DEBUG_SUPABASE_AUTH_LOGS) {
    supabase.auth.onAuthStateChange((event, session) => {
        console.log(
            `[Supabase.auth] event="${event}" hasSession=${!!session} userId=${session?.user?.id ?? 'null'} expiresAt=${session?.expires_at ?? 'n/a'}`
        );
    });
}
