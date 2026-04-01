/**
 * AUTH HOOK — React integration for the shared auth runtime.
 * Multiple components can consume this hook without creating duplicate
 * Supabase listeners or startup sync runs.
 */
import { useCallback, useState } from 'react';
import { useMountEffect } from './useMountEffect';
import { signInWithGoogle, signOut } from '../auth/googleAuth';
import {
    bootstrapAuthState,
    ensureAuthRuntime,
    getAuthRuntimeSnapshot,
    subscribeAuthRuntime,
} from '../auth/authRuntime';

export const useAuth = () => {
    const [snapshot, setSnapshot] = useState(() => getAuthRuntimeSnapshot());

    useMountEffect(() => {
        const unsubscribe = subscribeAuthRuntime(setSnapshot);
        ensureAuthRuntime().catch(err => {
            console.error('[useAuth] Failed to start auth runtime:', err);
        });

        return unsubscribe;
    });

    const login = useCallback(async () => {
        setSnapshot(current => ({ ...current, loading: true }));
        try {
            const state = await signInWithGoogle();
            bootstrapAuthState(state, { triggerSync: state.isAuthenticated });
            return state;
        } finally {
            setSnapshot(getAuthRuntimeSnapshot());
        }
    }, []);

    const logout = useCallback(async (clearData = false) => {
        setSnapshot(current => ({ ...current, loading: true }));
        try {
            const state = await signOut(clearData);
            bootstrapAuthState(state);
            return state;
        } finally {
            setSnapshot(getAuthRuntimeSnapshot());
        }
    }, []);

    return { ...snapshot.auth, loading: snapshot.loading, login, logout };
};
