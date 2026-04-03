import { type AuthState, getAuthState, linkLocalDataToUser, onAuthStateChange } from './googleAuth';
import { startSyncLoop, stopSyncLoop, runSync } from '../sync/syncEngine';
import { useStore } from '../store/useStore';
import { syncTrace, traceDuration } from '../sync/debug';

type AuthRuntimeSnapshot = {
    auth: AuthState;
    loading: boolean;
};

const EMPTY_AUTH_STATE: AuthState = {
    userId: null,
    email: null,
    displayName: null,
    isAuthenticated: false,
    isAnonymous: true,
    deviceId: '',
};

let snapshot: AuthRuntimeSnapshot = {
    auth: EMPTY_AUTH_STATE,
    loading: true,
};

let initPromise: Promise<void> | null = null;
let authRuntimeStarted = false;
let lastAppliedAuthKey = 'anonymous';
let lastSyncedUserId: string | null = null;

const listeners = new Set<(nextSnapshot: AuthRuntimeSnapshot) => void>();

const sameAuthState = (left: AuthState, right: AuthState): boolean =>
    left.userId === right.userId &&
    left.email === right.email &&
    left.displayName === right.displayName &&
    left.isAuthenticated === right.isAuthenticated &&
    left.isAnonymous === right.isAnonymous &&
    left.deviceId === right.deviceId;

const emitSnapshot = (): void => {
    const nextSnapshot = { ...snapshot };
    listeners.forEach(listener => listener(nextSnapshot));
};

const updateSnapshot = (nextAuth: AuthState, loading: boolean): void => {
    if (snapshot.loading === loading && sameAuthState(snapshot.auth, nextAuth)) {
        return;
    }

    snapshot = {
        auth: nextAuth,
        loading,
    };
    emitSnapshot();
};

const applyAuthState = (
    nextAuth: AuthState,
    options: { triggerSync?: boolean } = {}
): void => {
    const startedAt = Date.now();
    const authKey = `${nextAuth.isAuthenticated ? 'auth' : 'anon'}:${nextAuth.userId ?? ''}`;
    const authChanged = authKey !== lastAppliedAuthKey;
    lastAppliedAuthKey = authKey;

    useStore.getState().setCurrentUserId(nextAuth.userId ?? null);

    if (!nextAuth.isAuthenticated || !nextAuth.userId) {
        lastSyncedUserId = null;
        stopSyncLoop();
        traceDuration('AuthRuntime', 'apply_auth_state_anon', startedAt, {
            authChanged,
        });
        return;
    }

    linkLocalDataToUser(nextAuth.userId);
    startSyncLoop();

    const shouldTriggerSync = options.triggerSync === true &&
        (authChanged || lastSyncedUserId !== nextAuth.userId);

    if (shouldTriggerSync) {
        lastSyncedUserId = nextAuth.userId;
        syncTrace('AuthRuntime', 'trigger_sync_after_auth', {
            userId: nextAuth.userId,
            authChanged,
        });
        runSync().catch(console.error);
    }

    traceDuration('AuthRuntime', 'apply_auth_state_auth', startedAt, {
        userId: nextAuth.userId,
        authChanged,
        shouldTriggerSync,
    });
};

const handleAuthState = (
    nextAuth: AuthState,
    options: { triggerSync?: boolean } = {}
): void => {
    applyAuthState(nextAuth, options);
    updateSnapshot(nextAuth, false);
};

export const bootstrapAuthState = (
    nextAuth: AuthState,
    options: { triggerSync?: boolean } = {}
): void => {
    handleAuthState(nextAuth, options);
};

export const ensureAuthRuntime = async (): Promise<void> => {
    if (!authRuntimeStarted) {
        authRuntimeStarted = true;
        syncTrace('AuthRuntime', 'start_listener');
        onAuthStateChange(nextAuth => {
            syncTrace('AuthRuntime', 'on_auth_state_change', {
                userId: nextAuth.userId,
                isAuthenticated: nextAuth.isAuthenticated,
            });
            handleAuthState(nextAuth, { triggerSync: true });
        });
    }

    if (!initPromise) {
        const startedAt = Date.now();
        syncTrace('AuthRuntime', 'initial_auth_bootstrap_start');
        initPromise = getAuthState()
            .then(nextAuth => {
                handleAuthState(nextAuth, { triggerSync: nextAuth.isAuthenticated });
                traceDuration('AuthRuntime', 'initial_auth_bootstrap_done', startedAt, {
                    userId: nextAuth.userId,
                    isAuthenticated: nextAuth.isAuthenticated,
                });
            })
            .catch(err => {
                traceDuration('AuthRuntime', 'initial_auth_bootstrap_failed', startedAt, {
                    message: err instanceof Error ? err.message : String(err),
                });
                console.error('[useAuth] Failed to initialize auth runtime:', err);
                updateSnapshot(EMPTY_AUTH_STATE, false);
            });
    }

    await initPromise;
};

export const getAuthRuntimeSnapshot = (): AuthRuntimeSnapshot => ({ ...snapshot });

export const subscribeAuthRuntime = (
    listener: (nextSnapshot: AuthRuntimeSnapshot) => void
): (() => void) => {
    listeners.add(listener);
    listener(getAuthRuntimeSnapshot());

    return () => {
        listeners.delete(listener);
    };
};
