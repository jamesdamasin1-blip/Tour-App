/**
 * SYNC HELPERS — Shared robust merging logic for CRDT-lite architectures.
 */

export interface SyncEntity {
    id: string;
    lastModified?: number;
    version: number;
    updatedBy?: string;
    fieldUpdates?: Record<string, number>;
    lastDeviceId?: string;
}

/**
 * Universal CRDT-Lite element merge.
 * Reconciles the local object with incoming partial data by using field-level
 * timestamps (if available) or falls back to the object's overarching lastModified.
 *
 * @param local The current local source of truth entity
 * @param incoming The incoming remote payload entity
 * @param fields The list of strictly manageable fields for this entity
 */
export function mergeEntity<T extends SyncEntity>(
    local: T, 
    incoming: Partial<T>, 
    fields: (keyof T)[]
): T {
    if (!local) return incoming as T;

    const result = { ...local } as any;

    for (const field of fields) {
        const incomingHasField = incoming[field] !== undefined;
        if (!incomingHasField) continue;

        const localFieldTs = local.fieldUpdates?.[field as string] ?? local.lastModified ?? 0;
        const incomingFieldTs = incoming.fieldUpdates?.[field as string] ?? incoming.lastModified ?? 0;

        // If the incoming field is strictly newer than the local field.
        if (incomingFieldTs > localFieldTs) {
            result[field] = incoming[field];
            result.fieldUpdates = {
                ...(result.fieldUpdates || {}),
                [field as string]: incomingFieldTs,
            };
        }
    }

    // Always keep latest metadata to prevent version regression
    if ((incoming.lastModified ?? 0) > (local.lastModified ?? 0)) {
        result.lastModified = incoming.lastModified!;
        result.updatedBy = incoming.updatedBy;
        result.version = incoming.version ?? local.version;
    }

    // Retain origin tracker for debug/audits
    if (incoming.lastDeviceId) {
        result.lastDeviceId = incoming.lastDeviceId;
    }

    return result as T;
}
