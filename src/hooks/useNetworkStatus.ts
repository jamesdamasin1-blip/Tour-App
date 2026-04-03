/**
 * NETWORK STATUS — Monitors connectivity and triggers sync.
 * - On reconnect: runs sync immediately
 * - While online: runs sync periodically (every 30s)
 * - On app foreground: refreshes status
 */
import { useState, useRef } from 'react';
import { useMountEffect } from './useMountEffect';
import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { runSync, getSyncStatus, startSyncLoop, stopSyncLoop } from '../sync/syncEngine';
import { getQueueStats } from '../sync/syncQueue';
import { syncTrace, traceDuration } from '../sync/debug';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || '';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(true);
    const [syncStatus, setSyncStatus] = useState(getSyncStatus());
    const [queueStats, setQueueStats] = useState({ pending: 0, failed: 0, total: 0 });
    const wasOffline = useRef(false);

    // Poll connectivity with a lightweight fetch
    useMountEffect(() => {
        const checkConnectivity = async () => {
            const startedAt = Date.now();
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                await fetch(`${SUPABASE_URL}/rest/v1/`, {
                    method: 'HEAD',
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                if (wasOffline.current) {
                    wasOffline.current = false;
                    syncTrace('Network', 'connectivity_restored');
                    // Connection restored — trigger immediate sync + start loop
                    const reconnectSyncStartedAt = Date.now();
                    runSync().then(() => {
                        traceDuration('Network', 'reconnect_sync_done', reconnectSyncStartedAt, getQueueStats());
                        setSyncStatus(getSyncStatus());
                        setQueueStats(getQueueStats());
                    }).catch(err => console.warn('[NetworkStatus] Reconnect sync failed:', err));
                    startSyncLoop();
                }
                traceDuration('Network', 'connectivity_check_online', startedAt);
                setIsOnline(true);
            } catch {
                if (!wasOffline.current) {
                    syncTrace('Network', 'connectivity_lost');
                }
                wasOffline.current = true;
                traceDuration('Network', 'connectivity_check_offline', startedAt);
                setIsOnline(false);
                stopSyncLoop();
            }
        };

        checkConnectivity();
        const interval = setInterval(checkConnectivity, 15_000);

        // Sync when app comes to foreground
        const handleAppState = (state: AppStateStatus) => {
            syncTrace('Network', 'app_state_change', { state });
            if (state === 'active') {
                setSyncStatus(getSyncStatus());
                setQueueStats(getQueueStats());
                const foregroundSyncStartedAt = Date.now();
                runSync().then(() => {
                    traceDuration('Network', 'foreground_sync_done', foregroundSyncStartedAt, getQueueStats());
                    setSyncStatus(getSyncStatus());
                    setQueueStats(getQueueStats());
                }).catch(err => console.warn('[NetworkStatus] Foreground sync failed:', err));
            }
        };
        const sub = AppState.addEventListener('change', handleAppState);

        return () => {
            clearInterval(interval);
            sub.remove();
            stopSyncLoop();
        };
    });

    const triggerSync = async () => {
        if (!isOnline) return { pushed: 0, pulled: 0 };
        const startedAt = Date.now();
        syncTrace('Network', 'manual_trigger_sync');
        const result = await runSync();
        traceDuration('Network', 'manual_trigger_sync_done', startedAt, result);
        setSyncStatus(getSyncStatus());
        setQueueStats(getQueueStats());
        return result;
    };

    return {
        isOnline,
        syncStatus,
        queueStats,
        triggerSync,
    };
};
