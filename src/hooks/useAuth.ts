/**
 * AUTH HOOK — React integration for auth state.
 * Manages login/logout, triggers sync on auth changes,
 * and handles automatic token refresh.
 *
 * Pull-sync merge logic lives in sync/pull.handler.ts.
 * This hook owns ONLY: auth lifecycle, session management, sync orchestration.
 */
import { useState, useCallback } from 'react';
import { useMountEffect } from './useMountEffect';
import {
    type AuthState,
    getAuthState,
    signInWithGoogle,
    signOut,
    onAuthStateChange,
    linkLocalDataToUser,
} from '../auth/googleAuth';
import { startSyncLoop, stopSyncLoop, runSync, onRemoteUpdate } from '../sync/syncEngine';
import { handlePullUpdate } from '../sync/pull.handler';
import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';

export const useAuth = () => {
    const [auth, setAuth] = useState<AuthState>({
        userId: null,
        email: null,
        displayName: null,
        isAuthenticated: false,
        isAnonymous: true,
        deviceId: '',
    });
    const [loading, setLoading] = useState(true);

    useMountEffect(() => {
        // Bridge pull-sync engine → Zustand store.
        // Registered once at mount; pull.handler.ts owns all merge + FIFO logic.
        onRemoteUpdate(handlePullUpdate);

        // Initialize auth state
        getAuthState().then(state => {
            setAuth(state);
            if (state.isAuthenticated) startSyncLoop();
        }).catch(err => {
            console.error('[useAuth] Failed to get initial auth state:', err);
        }).finally(() => {
            setLoading(false);
        });

        // Listen for auth changes (includes TOKEN_REFRESHED events from Supabase)
        const unsubscribe = onAuthStateChange((state) => {
            console.log(`[useAuth] Auth state changed: authenticated=${state.isAuthenticated} userId=${state.userId}`);
            if (!state.isAuthenticated) {
                console.warn('[useAuth] ⚠ Setting UNAUTHENTICATED — user will see login screen. Stack:', new Error().stack);
            }
            setAuth(state);
            useStore.getState().setCurrentUserId(state.userId ?? null);
            if (state.isAuthenticated && state.userId) {
                linkLocalDataToUser(state.userId);
                startSyncLoop();
                runSync().catch(console.error);
            } else {
                stopSyncLoop();
            }
        });

        // Supabase auto-refreshes tokens via onAuthStateChange.
        // If the session expires in the background, force a refresh on next foreground.
        const refreshOnFocus = () => {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session) getAuthState().then(setAuth).catch(console.error);
            }).catch(err => {
                console.error('[useAuth] Session check failed:', err);
            });
        };

        const sessionCheck = setInterval(refreshOnFocus, 5 * 60 * 1000);

        return () => {
            unsubscribe();
            stopSyncLoop();
            clearInterval(sessionCheck);
        };
    });

    const login = useCallback(async () => {
        setLoading(true);
        try {
            const state = await signInWithGoogle();
            setAuth(state);
            return state;
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async (clearData = false) => {
        setLoading(true);
        try {
            stopSyncLoop();
            const state = await signOut(clearData);
            setAuth(state);
            return state;
        } finally {
            setLoading(false);
        }
    }, []);

    return { ...auth, loading, login, logout };
};
