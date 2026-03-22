/**
 * AUTH HOOK — React integration for auth state.
 * Manages login/logout, triggers sync on auth changes,
 * and handles automatic token refresh.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    type AuthState,
    getAuthState,
    signInWithGoogle,
    signOut,
    onAuthStateChange,
    linkLocalDataToUser,
} from '../auth/googleAuth';
import { startSyncLoop, stopSyncLoop, runSync, onRemoteUpdate } from '../sync/syncEngine';
import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';
import { deleteRecord as deleteLocalRecord, upsertRecord as upsertLocalRecord } from '../storage/localDB';

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

    useEffect(() => {
        // Bridge sync engine pulls → Zustand store using version-based merge
        onRemoteUpdate(({ trips, activities, expenses, sharedTripIds, currentUserId, deletedTripIds, deletedActivityIds, deletedExpenseIds }) => {
            console.log(`[onRemoteUpdate] trips=${trips?.length || 0}, activities=${activities?.length || 0}, expenses=${expenses?.length || 0}, deleted: ${deletedTripIds?.length || 0}T/${deletedActivityIds?.length || 0}A/${deletedExpenseIds?.length || 0}E`);

            // ── Handle soft-deleted records first ────────────────
            if (deletedTripIds?.length) {
                useStore.setState(s => ({
                    trips: s.trips.filter(t => !deletedTripIds.includes(t.id)),
                    activities: s.activities.filter(a => !deletedTripIds.includes(a.tripId)),
                    expenses: s.expenses.filter(e => !deletedTripIds.includes(e.tripId)),
                }));
                for (const id of deletedTripIds) deleteLocalRecord('trips', id);
            }

            if (deletedActivityIds?.length) {
                useStore.setState(s => ({
                    activities: s.activities.filter(a => !deletedActivityIds.includes(a.id)),
                }));
                for (const id of deletedActivityIds) deleteLocalRecord('activities', id);
            }

            if (deletedExpenseIds?.length) {
                useStore.setState(s => ({
                    expenses: s.expenses.filter(e => !deletedExpenseIds.includes(e.id)),
                    activities: s.activities.map(a => ({
                        ...a,
                        expenses: a.expenses.filter(e => !deletedExpenseIds!.includes(e.id)),
                    })),
                }));
                for (const id of deletedExpenseIds) deleteLocalRecord('expenses', id);
            }

            // ── Version-aware trip merge ─────────────────────────
            if (trips?.length) {
                useStore.setState(s => {
                    const updated = [...s.trips];
                    for (const remote of trips) {
                        const idx = updated.findIndex(t => t.id === remote.id);
                        if (idx >= 0) {
                            const local = updated[idx];
                            const localVersion = local.version ?? 0;
                            const remoteVersion = remote.version ?? 0;

                            if (remoteVersion > localVersion) {
                                // Remote is newer — full replace, keep isCloudSynced
                                updated[idx] = { ...local, ...remote };
                            }
                            // Local is newer or equal — keep local as-is (members are
                            // now pushed via syncEngine, so version-based merge handles them)
                        } else {
                            updated.push(remote);
                        }
                    }
                    return { trips: updated };
                });
            }

            // ── Version-aware activity/expense merge for shared trips ─
            const getMemberTripIds = (s: typeof useStore extends { getState: () => infer S } ? S : never) => {
                return s.trips
                    .filter(t => {
                        const members = t.members || [];
                        const isMember = members.some((m: any) => m.userId === currentUserId);
                        if (!isMember) return false;
                        const isOwner = (t as any).userId === currentUserId || (t as any).user_id === currentUserId;
                        return !isOwner;
                    })
                    .map(t => t.id);
            };

            if (sharedTripIds?.length && activities) {
                useStore.setState(s => {
                    const memberTripIds = getMemberTripIds(s);
                    if (memberTripIds.length === 0) return s;

                    const remoteForMemberTrips = activities.filter(a => memberTripIds.includes(a.tripId));
                    const remoteMap = new Map(remoteForMemberTrips.map(a => [a.id, a]));
                    const localMemberActivities = s.activities.filter(a => memberTripIds.includes(a.tripId));
                    const localMap = new Map(localMemberActivities.map(a => [a.id, a]));

                    const merged: any[] = [];
                    for (const [id, remote] of remoteMap) {
                        const local = localMap.get(id);
                        // Version-based: apply if remote version > local version
                        if (!local || (remote.version ?? 0) > (local.version ?? 0)) {
                            merged.push({
                                ...remote,
                                expenses: remote.expenses?.length ? remote.expenses : (local?.expenses || []),
                            });
                        } else {
                            merged.push(local);
                        }
                    }

                    // Activities in local but not remote → soft-deleted on server
                    for (const [id] of localMap) {
                        if (!remoteMap.has(id)) {
                            deleteLocalRecord('activities', id);
                        }
                    }
                    for (const a of merged) {
                        upsertLocalRecord('activities', a.id, a, { tripId: a.tripId, walletId: a.walletId || '' });
                    }

                    const kept = s.activities.filter(a => !memberTripIds.includes(a.tripId));
                    return { activities: [...kept, ...merged] };
                });
            }

            if (sharedTripIds?.length && expenses) {
                useStore.setState(s => {
                    const memberTripIds = getMemberTripIds(s);
                    if (memberTripIds.length === 0) return s;

                    const remoteForMemberTrips = expenses.filter(e => memberTripIds.includes(e.tripId));
                    const remoteMap = new Map(remoteForMemberTrips.map(e => [e.id, e]));
                    const localMemberExpenses = s.expenses.filter(e => memberTripIds.includes(e.tripId));
                    const localMap = new Map(localMemberExpenses.map(e => [e.id, e]));

                    const merged: any[] = [];
                    for (const [id, remote] of remoteMap) {
                        const local = localMap.get(id);
                        // Version-based: apply if remote version > local version
                        if (!local || (remote.version ?? 0) > (local.version ?? 0)) {
                            merged.push(remote);
                        } else {
                            merged.push(local);
                        }
                    }

                    for (const [id] of localMap) {
                        if (!remoteMap.has(id)) {
                            deleteLocalRecord('expenses', id);
                        }
                    }
                    for (const e of merged) {
                        upsertLocalRecord('expenses', e.id, e, { tripId: e.tripId, walletId: e.walletId || '', activityId: e.activityId || '' });
                    }

                    const kept = s.expenses.filter(e => !memberTripIds.includes(e.tripId));
                    return { expenses: [...kept, ...merged] };
                });
            }
        });

        // Initialize auth state
        getAuthState().then(state => {
            setAuth(state);
            if (state.isAuthenticated) {
                startSyncLoop();
            }
        }).catch(err => {
            console.error('[useAuth] Failed to get initial auth state:', err);
        }).finally(() => {
            setLoading(false);
        });

        // Listen for auth changes (includes TOKEN_REFRESHED events from Supabase)
        const unsubscribe = onAuthStateChange((state) => {
            setAuth(state);
            if (state.isAuthenticated && state.userId) {
                linkLocalDataToUser(state.userId);
                startSyncLoop();
                runSync().catch(console.error);
            } else {
                stopSyncLoop();
            }
        });

        // Supabase auto-refreshes tokens via onAuthStateChange.
        // If the session expires while the app is in background,
        // force a refresh on next foreground.
        const refreshOnFocus = () => {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session) {
                    // Session expired — update state
                    getAuthState().then(setAuth).catch(console.error);
                }
            }).catch(err => {
                console.error('[useAuth] Session check failed:', err);
            });
        };

        // Check session validity periodically (every 5 min)
        const sessionCheck = setInterval(refreshOnFocus, 5 * 60 * 1000);

        return () => {
            unsubscribe();
            stopSyncLoop();
            clearInterval(sessionCheck);
        };
    }, []);

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

    return {
        ...auth,
        loading,
        login,
        logout,
    };
};
