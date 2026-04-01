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

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || '';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(true);
    const [syncStatus, setSyncStatus] = useState(getSyncStatus());
    const [queueStats, setQueueStats] = useState({ pending: 0, failed: 0, total: 0 });
    const wasOffline = useRef(false);

    // Poll connectivity with a lightweight fetch
    useMountEffect(() => {
        const checkConnectivity = async () => {
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
                    // Connection restored — trigger immediate sync + start loop
                    runSync().then(() => {
                        setSyncStatus(getSyncStatus());
                        setQueueStats(getQueueStats());
                    }).catch(err => console.warn('[NetworkStatus] Reconnect sync failed:', err));
                    startSyncLoop();
                }
                setIsOnline(true);
            } catch {
                wasOffline.current = true;
                setIsOnline(false);
                stopSyncLoop();
            }
        };

        checkConnectivity();
        const interval = setInterval(checkConnectivity, 15_000);

        // Sync when app comes to foreground
        const handleAppState = (state: AppStateStatus) => {
            if (state === 'active') {
                setSyncStatus(getSyncStatus());
                setQueueStats(getQueueStats());
                runSync().then(() => {
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
        const result = await runSync();
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
