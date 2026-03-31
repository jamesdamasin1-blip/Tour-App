/**
 * VERSION GUARD
 * Answers: "Should this incoming payload win over local state?"
 *
 * Two resolution strategies are exported:
 *
 * 1. shouldApplyMerge — used by trip/activity/expense handlers.
 *    These entities use CRDT-lite field-level merging (mergeEntity).
 *    The version guard here only decides whether to call mergeEntity at all.
 *    When local and incoming are the same version but have different authors,
 *    we still merge (concurrent edit from another device in the same "tick").
 *
 * 2. shouldApplyStrict — used by funding lot handler.
 *    Funding lots have no field-level merging; incoming must be strictly newer
 *    to win (LWW). Same-version tie is broken by different updatedBy.
 *
 * Note: when incoming version < local version, we always skip.
 * When local does not exist yet, the caller should always apply.
 */

interface Versioned {
    version?: number;
    updatedBy?: string;
}

/**
 * Returns true if the incoming entity should be merged into local state.
 * Used for trip, activity, and expense — entities that support field-level merge.
 *
 * Applies when:
 *  - incoming is strictly newer (version > local), OR
 *  - same version but different author (concurrent edit on separate devices)
 */
export function shouldApplyMerge(local: Versioned, incoming: Versioned): boolean {
    const localV = local.version ?? 0;
    const incomingV = incoming.version ?? 0;

    if (incomingV > localV) return true;

    // Same version, different author: concurrent edit — merge to capture both changes.
    if (
        incomingV === localV &&
        incoming.updatedBy &&
        incoming.updatedBy !== local.updatedBy
    ) return true;

    return false;
}

/**
 * Returns true if the incoming entity should strictly replace local state.
 * Used for funding lots and other entities without field-level merge support.
 *
 * Applies when:
 *  - incoming is strictly newer (version > local), OR
 *  - same version but different author (last-writer-wins tie-break)
 */
export function shouldApplyStrict(local: Versioned, incoming: Versioned): boolean {
    const localV = local.version ?? 0;
    const incomingV = incoming.version ?? 0;

    if (incomingV > localV) return true;

    if (
        incomingV === localV &&
        incoming.updatedBy &&
        incoming.updatedBy !== local.updatedBy
    ) return true;

    return false;
}
