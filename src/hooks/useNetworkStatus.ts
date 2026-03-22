/**
 * NETWORK STATUS — Monitors connectivity and triggers sync.
 * - On reconnect: runs sync immediately
 * - While online: runs sync periodically (every 30s)
 * - On app foreground: refreshes status
 */
import { useState, useEffect, useRef } from 'react';
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
    useEffect(() => {
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
                    }).catch(console.error);
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
        return () => clearInterval(interval);
    }, []); // stable deps — wasOffline is a ref, setters are stable

    // Sync loop lifecycle is managed by useAuth (starts after authentication).
    // This hook only restarts it on reconnection after offline periods.
    // Stop sync loop on unmount as a safety cleanup.
    useEffect(() => {
        return () => stopSyncLoop();
    }, []);

    // Sync when app comes to foreground
    useEffect(() => {
        const handleAppState = (state: AppStateStatus) => {
            if (state === 'active') {
                setSyncStatus(getSyncStatus());
                setQueueStats(getQueueStats());
                // Trigger a sync when app comes back to foreground
                runSync().then(() => {
                    setSyncStatus(getSyncStatus());
                    setQueueStats(getQueueStats());
                }).catch(console.error);
            }
        };

        const sub = AppState.addEventListener('change', handleAppState);
        return () => sub.remove();
    }, []);

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
