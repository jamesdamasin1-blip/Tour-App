/**
 * LOCAL DATABASE — Source of truth for offline-first operation.
 * Uses expo-sqlite for persistent, transactional storage.
 * All financial data lives here; Zustand reads from this on hydration.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aliqual_ledger.db';
let _db: SQLite.SQLiteDatabase | null = null;

export const getDB = (): SQLite.SQLiteDatabase => {
    if (!_db) {
        _db = SQLite.openDatabaseSync(DB_NAME);
    }
    return _db;
};

/** Sync status for every record */
export type SyncStatus = 'pending' | 'synced' | 'conflict';

// ─── SQL Injection Protection ─────────────────────────────────────
const VALID_TABLES = new Set([
    'trips', 'wallets', 'funding_lots', 'expenses',
    'activities', 'sync_queue', 'sync_metadata',
]);

const VALID_COLUMNS = new Set([
    'id', 'data', 'syncStatus', 'createdAt', 'updatedAt',
    'userId', 'deviceId', 'tripId', 'walletId', 'activityId',
    'type', 'table_name', 'recordId', 'payload', 'timestamp',
    'retryCount', 'status', 'key', 'value',
]);

const assertValidTable = (table: string) => {
    if (!VALID_TABLES.has(table)) {
        throw new Error(`Invalid table name: ${table}`);
    }
};

const assertValidColumns = (cols: string[]) => {
    for (const col of cols) {
        if (!VALID_COLUMNS.has(col)) {
            throw new Error(`Invalid column name: ${col}`);
        }
    }
};

/** Initialize all tables — idempotent, call on app start */
export const initializeDB = () => {
    const db = getDB();

    db.execSync(`
        CREATE TABLE IF NOT EXISTS trips (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            userId TEXT,
            deviceId TEXT,
            syncStatus TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallets (
            id TEXT PRIMARY KEY,
            tripId TEXT NOT NULL,
            data TEXT NOT NULL,
            syncStatus TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS funding_lots (
            id TEXT PRIMARY KEY,
            walletId TEXT NOT NULL,
            tripId TEXT NOT NULL,
            data TEXT NOT NULL,
            syncStatus TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            walletId TEXT NOT NULL,
            tripId TEXT NOT NULL,
            activityId TEXT,
            data TEXT NOT NULL,
            syncStatus TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            tripId TEXT NOT NULL,
            walletId TEXT NOT NULL,
            data TEXT NOT NULL,
            syncStatus TEXT DEFAULT 'pending',
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            table_name TEXT NOT NULL,
            recordId TEXT NOT NULL,
            payload TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            retryCount INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
};

// ─── Generic CRUD for JSON-blob tables ───────────────────────────

export const upsertRecord = (
    table: string,
    id: string,
    data: Record<string, any>,
    extra: Record<string, any> = {}
) => {
    assertValidTable(table);
    const db = getDB();
    const now = Date.now();
    const json = JSON.stringify(data);
    const cols = Object.keys(extra);
    assertValidColumns(cols);
    const extraCols = cols.length ? ', ' + cols.join(', ') : '';
    const extraPlaceholders = cols.length ? ', ' + cols.map(() => '?').join(', ') : '';
    const extraVals = cols.map(k => extra[k]);

    db.runSync(
        `INSERT INTO ${table} (id, data, syncStatus, createdAt, updatedAt${extraCols})
         VALUES (?, ?, 'pending', ?, ?${extraPlaceholders})
         ON CONFLICT(id) DO UPDATE SET data=?, syncStatus='pending', updatedAt=?`,
        [id, json, now, now, ...extraVals, json, now]
    );
};

export const getRecord = <T>(table: string, id: string): T | null => {
    assertValidTable(table);
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>(`SELECT data FROM ${table} WHERE id = ?`, [id]);
    return row ? JSON.parse(row.data) : null;
};

export const getAllRecords = <T>(table: string, whereColumn?: string, params?: any[]): T[] => {
    assertValidTable(table);
    const db = getDB();
    let sql = `SELECT data FROM ${table}`;
    if (whereColumn) {
        assertValidColumns([whereColumn]);
        sql += ` WHERE ${whereColumn} = ?`;
    }
    const rows = db.getAllSync<{ data: string }>(sql, params || []);
    return rows.map(r => JSON.parse(r.data));
};

export const deleteRecord = (table: string, id: string) => {
    assertValidTable(table);
    const db = getDB();
    db.runSync(`DELETE FROM ${table} WHERE id = ?`, [id]);
};

export const getPendingRecords = (table: string) => {
    assertValidTable(table);
    const db = getDB();
    return db.getAllSync<{ id: string; data: string }>(
        `SELECT id, data FROM ${table} WHERE syncStatus = 'pending'`
    );
};

export const markSynced = (table: string, id: string) => {
    assertValidTable(table);
    const db = getDB();
    db.runSync(`UPDATE ${table} SET syncStatus = 'synced' WHERE id = ?`, [id]);
};

export const getSyncMeta = (key: string): string | null => {
    const db = getDB();
    const row = db.getFirstSync<{ value: string }>(
        `SELECT value FROM sync_metadata WHERE key = ?`, [key]
    );
    return row?.value ?? null;
};

export const setSyncMeta = (key: string, value: string) => {
    const db = getDB();
    db.runSync(
        `INSERT INTO sync_metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?`,
        [key, value, value]
    );
};

/** Clear all user data from local DB (used on logout) */
export const clearAllUserData = () => {
    const db = getDB();
    db.execSync(`
        DELETE FROM trips;
        DELETE FROM wallets;
        DELETE FROM funding_lots;
        DELETE FROM expenses;
        DELETE FROM activities;
        DELETE FROM sync_queue;
        DELETE FROM sync_metadata;
    `);
};
