/**
 * DELETION GUARD
 * Answers: "Does this payload represent a record that should be removed from UI state?"
 *
 * Two deletion paths exist:
 *  1. Soft delete  — row still exists in DB, deleted_at is set to a timestamp.
 *     This is the standard path. All deletions go through soft delete.
 *  2. Hard delete  — row was physically removed from DB (eventType === 'DELETE').
 *     Only possible if RLS or a migration physically removes a row. Rare.
 *
 * Both cases require evicting the record from local UI state.
 */

/**
 * Returns true if a DB row has been soft-deleted (deleted_at is non-null).
 */
export function isSoftDeleted(row: Record<string, any>): boolean {
    return row.deleted_at != null;
}

/**
 * Returns true if the postgres_changes event is a physical row deletion.
 */
export function isHardDeleted(eventType: string): boolean {
    return eventType === 'DELETE';
}

/**
 * Returns true if the record should be evicted from UI state.
 * Covers both soft and hard delete paths.
 */
export function isDeletion(eventType: string, row: Record<string, any>): boolean {
    return isHardDeleted(eventType) || isSoftDeleted(row);
}
