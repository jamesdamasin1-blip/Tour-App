/**
 * CONFLICT RESOLVER v2 — Version-based Last-Write-Wins.
 *
 * Rules:
 * 1. PRIMARY: Compare version (server-managed integer, monotonically increasing)
 *    - incoming.version > local.version → apply remote
 *    - incoming.version < local.version → keep local
 *    - incoming.version == local.version → fallback to updatedAt/lastModified
 * 2. SECONDARY: updatedAt/lastModified timestamp (only for tie-breaking)
 * 3. Funding lots & expenses: append-only by id, version-checked per record
 * 4. Soft-deleted records (deletedAt != null) are always removed from local state
 */

export type MergeResult<T> = {
    merged: T;
    action: 'keep_local' | 'keep_remote' | 'merged';
};

/** Version-based LWW for mutable records (trips, activities) */
export const resolveByVersion = <T extends { version?: number; updatedAt?: number; lastModified?: number }>(
    local: T,
    remote: T
): MergeResult<T> => {
    const localVersion = local.version ?? 0;
    const remoteVersion = remote.version ?? 0;

    // Primary: version comparison
    if (remoteVersion > localVersion) {
        return { merged: remote, action: 'keep_remote' };
    }
    if (remoteVersion < localVersion) {
        return { merged: local, action: 'keep_local' };
    }

    // Secondary: timestamp fallback for same version
    const localTime = local.updatedAt ?? local.lastModified ?? 0;
    const remoteTime = remote.updatedAt ?? remote.lastModified ?? 0;

    if (remoteTime > localTime) {
        return { merged: remote, action: 'keep_remote' };
    }
    return { merged: local, action: 'keep_local' };
};

/** @deprecated Use resolveByVersion instead */
export const resolveByTimestamp = resolveByVersion;

/** Check if incoming record should be applied over local */
export const shouldApplyRemote = (
    local: { version?: number; updatedAt?: number; lastModified?: number } | undefined,
    remote: { version?: number; updatedAt?: number; lastModified?: number }
): boolean => {
    if (!local) return true; // No local record, always apply
    const result = resolveByVersion(local, remote);
    return result.action === 'keep_remote';
};

/** Append-only merge for immutable ledger records (lots, expenses), with version awareness */
export const mergeAppendOnly = <T extends { id: string; version?: number; deletedAt?: string | null }>(
    localRecords: T[],
    remoteRecords: T[]
): { merged: T[]; newFromRemote: T[]; updatedFromRemote: T[] } => {
    const localMap = new Map(localRecords.map(r => [r.id, r]));
    const newFromRemote: T[] = [];
    const updatedFromRemote: T[] = [];

    for (const remote of remoteRecords) {
        // Skip soft-deleted records
        if (remote.deletedAt) continue;

        const local = localMap.get(remote.id);
        if (!local) {
            newFromRemote.push(remote);
            localMap.set(remote.id, remote);
        } else if ((remote.version ?? 0) > (local.version ?? 0)) {
            updatedFromRemote.push(remote);
            localMap.set(remote.id, remote);
        }
    }

    // Filter out locally-held records that are soft-deleted remotely
    const deletedRemoteIds = new Set(
        remoteRecords.filter(r => r.deletedAt).map(r => r.id)
    );

    const merged = Array.from(localMap.values()).filter(r => !deletedRemoteIds.has(r.id));

    return { merged, newFromRemote, updatedFromRemote };
};

/** Merge wallets: keep local financial state, version-check remote lots */
export const mergeWallets = (
    localWallet: any,
    remoteWallet: any
): MergeResult<any> => {
    if (!remoteWallet) return { merged: localWallet, action: 'keep_local' };
    if (!localWallet) return { merged: remoteWallet, action: 'keep_remote' };

    const localLots = localWallet.lots || [];
    const remoteLots = remoteWallet.lots || [];
    const { merged: mergedLots } = mergeAppendOnly(localLots, remoteLots);

    // FIFO order maintained by sorting on createdAt
    const sortedLots = mergedLots.sort((a: any, b: any) => a.createdAt - b.createdAt);

    // Re-derive default: latest lot is default
    const finalLots = sortedLots.map((lot: any, idx: number) => ({
        ...lot,
        isDefault: idx === sortedLots.length - 1,
    }));

    return {
        merged: {
            ...localWallet,
            lots: finalLots,
        },
        action: 'merged',
    };
};

/** Merge a full trip: version-based LWW for metadata, append-only for wallets/lots */
export const mergeTrip = (localTrip: any, remoteTrip: any): MergeResult<any> => {
    if (!remoteTrip) return { merged: localTrip, action: 'keep_local' };
    if (!localTrip) return { merged: remoteTrip, action: 'keep_remote' };

    // Soft delete check
    if (remoteTrip.deletedAt) {
        return { merged: remoteTrip, action: 'keep_remote' };
    }

    // Version-based metadata selection
    const { merged: metaBase } = resolveByVersion(localTrip, remoteTrip);

    // Wallets: merge each by id
    const localWallets = localTrip.wallets || [];
    const remoteWallets = remoteTrip.wallets || [];
    const walletMap = new Map<string, any>();

    for (const w of localWallets) walletMap.set(w.id, w);
    for (const w of remoteWallets) {
        const local = walletMap.get(w.id);
        if (local) {
            walletMap.set(w.id, mergeWallets(local, w).merged);
        } else {
            walletMap.set(w.id, w);
        }
    }

    // Members: always prefer remote (managed server-side by RPC)
    const members = remoteTrip.members || localTrip.members || [];

    return {
        merged: {
            ...metaBase,
            wallets: Array.from(walletMap.values()),
            members,
            version: Math.max(localTrip.version ?? 0, remoteTrip.version ?? 0),
        },
        action: 'merged',
    };
};

/** Merge expenses with version awareness and soft-delete filtering */
export const mergeExpenses = (local: any[], remote: any[]): any[] => {
    const { merged } = mergeAppendOnly(local, remote);
    return merged;
};

/** Check if a record is financially immutable */
export const isImmutableRecord = (tableName: string): boolean => {
    return ['funding_lots'].includes(tableName);
};
