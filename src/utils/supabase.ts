import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey;
const SUPABASE_AUTH_STORAGE_KEY = SUPABASE_URL
    ? `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
    : '';

if (!SUPABASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL - check .env and app.config.js');
}
if (!SUPABASE_ANON_KEY) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY - check .env and app.config.js');
}

type PersistedSupabaseSession = {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_at?: unknown;
};

const isSecureAuthStorageSupported = Platform.OS !== 'web';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
    keychainService: 'aliqual.supabase.auth',
};

const getStoredAuthValue = async (key: string): Promise<string | null> => {
    if (!isSecureAuthStorageSupported) {
        return AsyncStorage.getItem(key);
    }

    try {
        const secureValue = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
        if (secureValue) {
            return secureValue;
        }
    } catch {
        // Fall back to AsyncStorage below if SecureStore is unavailable on the device.
    }

    const legacyValue = await AsyncStorage.getItem(key);
    if (!legacyValue) {
        return null;
    }

    try {
        await SecureStore.setItemAsync(key, legacyValue, SECURE_STORE_OPTIONS);
        await AsyncStorage.removeItem(key);
    } catch {
        // Keep returning the legacy value so the session stays usable.
    }

    return legacyValue;
};

const setStoredAuthValue = async (key: string, value: string): Promise<void> => {
    if (!isSecureAuthStorageSupported) {
        await AsyncStorage.setItem(key, value);
        return;
    }

    try {
        await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
        await AsyncStorage.removeItem(key);
    } catch {
        await AsyncStorage.setItem(key, value);
    }
};

const removeStoredAuthValue = async (key: string): Promise<void> => {
    if (!isSecureAuthStorageSupported) {
        await AsyncStorage.removeItem(key);
        return;
    }

    try {
        await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    } catch {
        // Ignore SecureStore cleanup failures and still clear AsyncStorage.
    }

    await AsyncStorage.removeItem(key);
};

const isPersistedSessionShapeValid = (value: PersistedSupabaseSession | null): boolean =>
    !!value &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0 &&
    typeof value.refresh_token === 'string' &&
    value.refresh_token.length > 0 &&
    typeof value.expires_at === 'number' &&
    Number.isFinite(value.expires_at);

export const clearPersistedSupabaseSession = async (): Promise<void> => {
    if (!SUPABASE_AUTH_STORAGE_KEY) {
        return;
    }

    await Promise.all([
        SUPABASE_AUTH_STORAGE_KEY,
        `${SUPABASE_AUTH_STORAGE_KEY}-user`,
        `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`,
    ].map(removeStoredAuthValue));
};

const supabaseAuthStorage = {
    getItem: async (key: string): Promise<string | null> => {
        const value = await getStoredAuthValue(key);
        if (!value || key !== SUPABASE_AUTH_STORAGE_KEY) {
            return value;
        }

        try {
            const parsed = JSON.parse(value) as PersistedSupabaseSession | null;
            if (!isPersistedSessionShapeValid(parsed)) {
                await clearPersistedSupabaseSession();
                return null;
            }
        } catch {
            await clearPersistedSupabaseSession();
            return null;
        }

        return value;
    },
    setItem: (key: string, value: string): Promise<void> => setStoredAuthValue(key, value),
    removeItem: (key: string): Promise<void> => removeStoredAuthValue(key),
};

const extractErrorMessage = (value: unknown): string => {
    if (value instanceof Error) {
        return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const isHandledInvalidRefreshTokenError = (args: unknown[]): boolean => {
    const details = args.map(extractErrorMessage).join('\n').toLowerCase();
    return details.includes('invalid refresh token') &&
        details.includes('refresh token not found') &&
        details.includes('_recoverandrefresh');
};

const installSupabaseAuthErrorFilter = (): void => {
    const consoleWithMarker = console as typeof console & {
        __aliqualSupabaseAuthErrorFilterInstalled?: boolean;
    };

    if (consoleWithMarker.__aliqualSupabaseAuthErrorFilterInstalled) {
        return;
    }

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        if (isHandledInvalidRefreshTokenError(args)) {
            return;
        }

        originalError(...args);
    };
    consoleWithMarker.__aliqualSupabaseAuthErrorFilterInstalled = true;
};

installSupabaseAuthErrorFilter();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: supabaseAuthStorage,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
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
