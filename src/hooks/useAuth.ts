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
import { syncTrace, traceDuration } from '../sync/debug';

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
        const startedAt = Date.now();
        syncTrace('AuthUI', 'login_start');
        setSnapshot(current => ({ ...current, loading: true }));
        try {
            const state = await signInWithGoogle();
            bootstrapAuthState(state, { triggerSync: state.isAuthenticated });
            traceDuration('AuthUI', 'login_success', startedAt, {
                userId: state.userId,
                email: state.email,
                isAuthenticated: state.isAuthenticated,
            });
            return state;
        } catch (error) {
            traceDuration('AuthUI', 'login_failed', startedAt, {
                message: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            setSnapshot(getAuthRuntimeSnapshot());
        }
    }, []);

    const logout = useCallback(async (clearData = false) => {
        const startedAt = Date.now();
        syncTrace('AuthUI', 'logout_start', { clearData });
        setSnapshot(current => ({ ...current, loading: true }));
        try {
            const state = await signOut(clearData);
            bootstrapAuthState(state);
            traceDuration('AuthUI', 'logout_success', startedAt, {
                clearData,
                userId: state.userId,
                isAuthenticated: state.isAuthenticated,
            });
            return state;
        } catch (error) {
            traceDuration('AuthUI', 'logout_failed', startedAt, {
                clearData,
                message: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            setSnapshot(getAuthRuntimeSnapshot());
        }
    }, []);

    return { ...snapshot.auth, loading: snapshot.loading, login, logout };
};
