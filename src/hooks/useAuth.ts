/**
 * AUTH HOOK — React integration for auth state.
 * Manages login/logout, triggers sync on auth changes,
 * and handles automatic token refresh.
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

    useMountEffect(() => {
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
                const { reverseFIFO, recomputeWalletSpent } = require('../store/storeHelpers');
                useStore.setState(s => {
                    // Reverse each deleted expense's FIFO deduction from wallet lots
                    const deletedSet = new Set(deletedExpenseIds);
                    const deletedExpenses = s.expenses.filter(e => deletedSet.has(e.id));
                    const remainingExpenses = s.expenses.filter(e => !deletedSet.has(e.id));

                    let updatedTrips = s.trips;
                    if (deletedExpenses.length > 0) {
                        const affectedTripIds = new Set(deletedExpenses.map(e => e.tripId));
                        updatedTrips = s.trips.map(t => {
                            if (!affectedTripIds.has(t.id)) return t;
                            const toReverse = deletedExpenses.filter(e => e.tripId === t.id);
                            let wallets = t.wallets || [];
                            for (const exp of toReverse) {
                                wallets = wallets.map((w: any) => {
                                    if (w.id !== exp.walletId) return w;
                                    return { ...w, lots: reverseFIFO(w, exp) };
                                });
                            }
                            wallets = recomputeWalletSpent(wallets, remainingExpenses.filter(e => e.tripId === t.id));
                            return { ...t, wallets };
                        });
                    }

                    return {
                        expenses: remainingExpenses,
                        activities: s.activities.map(a => ({
                            ...a,
                            expenses: a.expenses.filter(e => !deletedSet.has(e.id)),
                        })),
                        trips: updatedTrips,
                    };
                });
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
                                // Remote is newer — full replace, keep isCloudSynced.
                                // Preserve local wallet lots: trips.wallets JSONB is stale with
                                // respect to FIFO spending — lot.remainingAmount is only accurate
                                // locally (updated by applyExpenseFIFO). The wallets table
                                // (synced separately via realtime) carries the authoritative lots.
                                const mergedWallets = (remote.wallets || []).map((rw: any) => {
                                    const lw = (local.wallets || []).find((w: any) => w.id === rw.id);
                                    return lw ? { ...rw, lots: lw.lots } : rw;
                                });
                                updated[idx] = { ...local, ...remote, wallets: mergedWallets };
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

            // Returns all trip IDs the user has locally — sync should apply to all trips,
            // not just shared ones, so single-user multi-device scenarios also work.
            const getAllTripIds = (s: typeof useStore extends { getState: () => infer S } ? S : never) =>
                s.trips.map(t => t.id);

            if (sharedTripIds?.length && activities) {
                useStore.setState(s => {
                    const memberTripIds = getAllTripIds(s);
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
                    const memberTripIds = getAllTripIds(s);
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
                    const allExpenses = [...kept, ...merged];

                    // Embed expenses back into their activities so progress bars reflect latest state.
                    const updatedActivities = s.activities.map(a => {
                        if (!memberTripIds.includes(a.tripId)) return a;
                        return { ...a, expenses: allExpenses.filter(e => e.activityId === a.id) };
                    });

                    // Apply FIFO for genuinely new expenses so wallet balances update correctly.
                    // Only apply expenses that were NOT already in local state (to avoid double-deduction).
                    const brandNewExpenses = merged.filter(e => !localMap.has(e.id));
                    let updatedTrips = s.trips;
                    if (brandNewExpenses.length > 0) {
                        const { applyExpenseFIFO } = require('../finance/expense/expenseEngine');
                        updatedTrips = s.trips.map(t => {
                            if (!memberTripIds.includes(t.id)) return t;
                            const tripNew = brandNewExpenses.filter(e => e.tripId === t.id);
                            if (!tripNew.length) return t;

                            const updatedWallets = (t.wallets || []).map((w: any) => {
                                const walletNew = tripNew.filter(e => e.walletId === w.id);
                                let lots = w.lots || [];
                                for (const exp of walletNew) {
                                    const amount = Number(exp.convertedAmountTrip || exp.amount || 0);
                                    if (amount > 0) {
                                        try {
                                            const result = applyExpenseFIFO({ ...w, lots } as any, amount);
                                            lots = result.updatedWallet.lots;
                                        } catch {
                                            // Wallet may be overdrawn on member side — skip FIFO silently
                                        }
                                    }
                                }
                                return { ...w, lots };
                            });
                            return { ...t, wallets: updatedWallets };
                        });
                    }

                    // Re-apply FIFO for expenses whose amount changed: reverse old deduction, apply new.
                    const amountChangedExpenses = merged.filter(e => {
                        const local = localMap.get(e.id);
                        return local &&
                            (e.version ?? 0) > (local.version ?? 0) &&
                            Number(local.convertedAmountTrip) !== Number(e.convertedAmountTrip);
                    });
                    if (amountChangedExpenses.length > 0) {
                        const { reverseFIFO } = require('../store/storeHelpers');
                        const { applyExpenseFIFO } = require('../finance/expense/expenseEngine');
                        updatedTrips = updatedTrips.map((t: any) => {
                            if (!memberTripIds.includes(t.id)) return t;
                            const tripChanged = amountChangedExpenses.filter((e: any) => e.tripId === t.id);
                            if (!tripChanged.length) return t;
                            const updatedWallets = (t.wallets || []).map((w: any) => {
                                const walletChanged = tripChanged.filter((e: any) => e.walletId === w.id);
                                if (!walletChanged.length) return w;
                                let lots = w.lots || [];
                                for (const exp of walletChanged) {
                                    const oldExp = localMap.get(exp.id);
                                    if (oldExp) {
                                        lots = reverseFIFO({ ...w, lots } as any, oldExp);
                                    }
                                    const amount = Number(exp.convertedAmountTrip || 0);
                                    if (amount > 0) {
                                        try {
                                            const result = applyExpenseFIFO({ ...w, lots } as any, amount);
                                            lots = result.updatedWallet.lots;
                                        } catch {
                                            // wallet may be overdrawn — skip
                                        }
                                    }
                                }
                                return { ...w, lots };
                            });
                            return { ...t, wallets: updatedWallets };
                        });
                    }

                    return { expenses: allExpenses, activities: updatedActivities, trips: updatedTrips };
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

    return {
        ...auth,
        loading,
        login,
        logout,
    };
};
