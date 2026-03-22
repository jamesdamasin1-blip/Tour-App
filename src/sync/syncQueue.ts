/**
 * SYNC QUEUE — Append-only, persistent mutation log.
 * Every store mutation enqueues an event here.
 * Events are consumed by the sync engine when online.
 */
import { getDB } from '../storage/localDB';
import { generateId } from '../utils/mathUtils';

export interface SyncEvent {
    id: string;
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name: string;
    recordId: string;
    payload: string; // JSON
    timestamp: number;
    retryCount: number;
    status: 'pending' | 'processing' | 'failed' | 'done';
}

/** Enqueue a mutation for eventual sync */
export const enqueueSync = (
    type: SyncEvent['type'],
    tableName: string,
    recordId: string,
    payload: Record<string, any>
) => {
    const db = getDB();
    const event: SyncEvent = {
        id: generateId(),
        type,
        table_name: tableName,
        recordId,
        payload: JSON.stringify(payload),
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending',
    };

    db.runSync(
        `INSERT INTO sync_queue (id, type, table_name, recordId, payload, timestamp, retryCount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.id, event.type, event.table_name, event.recordId, event.payload, event.timestamp, 0, 'pending']
    );

    return event.id;
};

/** Get all pending events, oldest first */
export const getPendingEvents = (): SyncEvent[] => {
    const db = getDB();
    return db.getAllSync<SyncEvent>(
        `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY timestamp ASC`
    );
};

/** Get failed events eligible for retry (max 5 retries) */
export const getRetryableEvents = (): SyncEvent[] => {
    const db = getDB();
    return db.getAllSync<SyncEvent>(
        `SELECT * FROM sync_queue WHERE status = 'failed' AND retryCount < 5 ORDER BY timestamp ASC`
    );
};

/** Mark event as processing (lock) */
export const markProcessing = (eventId: string) => {
    const db = getDB();
    db.runSync(`UPDATE sync_queue SET status = 'processing' WHERE id = ?`, [eventId]);
};

/** Mark event as done (successfully synced) */
export const markDone = (eventId: string) => {
    const db = getDB();
    db.runSync(`UPDATE sync_queue SET status = 'done' WHERE id = ?`, [eventId]);
};

/** Mark event as failed with retry increment */
export const markFailed = (eventId: string) => {
    const db = getDB();
    db.runSync(
        `UPDATE sync_queue SET status = 'failed', retryCount = retryCount + 1 WHERE id = ?`,
        [eventId]
    );
};

/** Clean up completed events older than 24 hours */
export const pruneCompletedEvents = () => {
    const db = getDB();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    db.runSync(`DELETE FROM sync_queue WHERE status = 'done' AND timestamp < ?`, [cutoff]);
};

/** Get queue stats for UI display */
export const getQueueStats = (): { pending: number; failed: number; total: number } => {
    const db = getDB();
    const pending = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'`);
    const failed = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'failed'`);
    const total = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) as c FROM sync_queue WHERE status != 'done'`);
    return {
        pending: pending?.c ?? 0,
        failed: failed?.c ?? 0,
        total: total?.c ?? 0,
    };
};

/** Batch enqueue — wraps multiple mutations in a single transaction */
export const enqueueBatch = (
    events: Array<{ type: SyncEvent['type']; tableName: string; recordId: string; payload: Record<string, any> }>
) => {
    const db = getDB();
    const now = Date.now();
    db.execSync('BEGIN TRANSACTION');
    try {
        for (const e of events) {
            const id = generateId();
            db.runSync(
                `INSERT INTO sync_queue (id, type, table_name, recordId, payload, timestamp, retryCount, status)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`,
                [id, e.type, e.tableName, e.recordId, JSON.stringify(e.payload), now]
            );
        }
        db.execSync('COMMIT');
    } catch (err) {
        db.execSync('ROLLBACK');
        throw err;
    }
};
