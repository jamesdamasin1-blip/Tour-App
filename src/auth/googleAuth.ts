/**
 * GOOGLE AUTH — Supabase-native Google OAuth.
 * Manages user state: anonymous → authenticated.
 * Local data is NEVER overwritten on login.
 */
import { supabase } from '../utils/supabase';
import * as WebBrowser from 'expo-web-browser';
import { getSyncMeta, setSyncMeta, clearAllUserData } from '../storage/localDB';
import { generateId } from '../utils/mathUtils';

WebBrowser.maybeCompleteAuthSession();

// ─── Email / Password ─────────────────────────────────────────────

export interface AuthState {
    userId: string | null;
    email: string | null;
    displayName: string | null;
    isAuthenticated: boolean;
    isAnonymous: boolean;
    deviceId: string;
}

/** Get or create a persistent device ID */
export const getDeviceId = (): string => {
    let deviceId = getSyncMeta('deviceId');
    if (!deviceId) {
        deviceId = generateId();
        setSyncMeta('deviceId', deviceId);
    }
    return deviceId;
};

/** Get current auth state from Supabase session */
export const getAuthState = async (): Promise<AuthState> => {
    const deviceId = getDeviceId();

    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        // Handle expired/invalid refresh token — clear stale session
        if (error) {
            console.warn('[Auth] Session error, clearing stale session:', error.message);
            await supabase.auth.signOut().catch(() => {});
            return {
                userId: null,
                email: null,
                displayName: null,
                isAuthenticated: false,
                isAnonymous: true,
                deviceId,
            };
        }

        if (session?.user) {
            return {
                userId: session.user.id,
                email: session.user.email ?? null,
                displayName: session.user.user_metadata?.full_name ?? null,
                isAuthenticated: true,
                isAnonymous: false,
                deviceId,
            };
        }
    } catch (err: any) {
        // Catch network errors, invalid token errors, etc.
        console.warn('[Auth] Failed to get session, treating as anonymous:', err?.message);
        // Try to sign out to clear corrupted token state
        await supabase.auth.signOut().catch(() => {});
    }

    return {
        userId: null,
        email: null,
        displayName: null,
        isAuthenticated: false,
        isAnonymous: true,
        deviceId,
    };
};

/**
 * Unified email auth flow — always routes to register/login screen.
 * We intentionally do NOT check if an email exists to prevent enumeration attacks.
 * Instead, the user always enters their email + password, and Supabase returns
 * appropriate errors ("Invalid login credentials" for wrong password, etc).
 */

/** Sign up with email and password */
export const signUpWithEmail = async (
    email: string,
    password: string,
    displayName?: string
): Promise<{ authState: AuthState; needsVerification: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: displayName || '' },
        },
    });

    if (error) throw new Error(error.message);

    // If email confirmation is required, user won't have a session yet
    const needsVerification = !data.session && !!data.user;
    const authState = await getAuthState();
    return { authState, needsVerification };
};

/** Sign in with email and password */
export const signInWithEmail = async (
    email: string,
    password: string
): Promise<AuthState> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return getAuthState();
};

/** Resend verification email */
export const resendVerification = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
    });
    if (error) throw new Error(error.message);
};

/** Update user profile (display name) */
export const updateUserProfile = async (displayName: string): Promise<AuthState> => {
    const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName },
    });
    if (error) throw new Error(error.message);
    return getAuthState();
};

// Google Client ID loaded from environment via app.config.js
// const GOOGLE_CLIENT_ID = Constants.expoConfig?.extra?.googleClientId;

/** Sign in with Google via Supabase OAuth */
export const signInWithGoogle = async (): Promise<AuthState> => {
    const redirectUrl = 'aliqual://auth/callback';
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' },
        },
    });

    if (error) throw new Error(`Google Auth failed: ${error.message}`);
    if (!data.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
        { showInRecents: true }
    );

    if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
            const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
            });
            if (sessionError) throw new Error(`Session failed: ${sessionError.message}`);
        } else {
            // PKCE flow fallback
            const code = url.searchParams.get('code');
            if (code) {
                const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
                if (sessionError) throw new Error(`Session exchange failed: ${sessionError.message}`);
            }
        }
    } else if (result.type === 'cancel') {
        throw new Error('Sign in was cancelled');
    }

    return getAuthState();
};

/** Sign out — clears sensitive session data */
export const signOut = async (clearLocalData = false): Promise<AuthState> => {
    await supabase.auth.signOut();

    // Clear auth-related metadata
    setSyncMeta('linkedUserId', '');

    // Optionally clear all user data (full logout)
    if (clearLocalData) {
        clearAllUserData();
    }

    return getAuthState();
};

/** Listen for auth state changes */
export const onAuthStateChange = (
    callback: (state: AuthState) => void
): (() => void) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const deviceId = getDeviceId();
        if (session?.user) {
            callback({
                userId: session.user.id,
                email: session.user.email ?? null,
                displayName: session.user.user_metadata?.full_name ?? null,
                isAuthenticated: true,
                isAnonymous: false,
                deviceId,
            });
        } else {
            callback({
                userId: null,
                email: null,
                displayName: null,
                isAuthenticated: false,
                isAnonymous: true,
                deviceId,
            });
        }
    });

    return () => subscription.unsubscribe();
};

/** Link existing local trips to authenticated user */
export const linkLocalDataToUser = (userId: string) => {
    setSyncMeta('linkedUserId', userId);
};
