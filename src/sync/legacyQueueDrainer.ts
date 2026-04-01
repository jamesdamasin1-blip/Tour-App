import type { AuthState } from '../auth/googleAuth';
import { markSynced } from '../storage/localDB';
import { supabase } from '../utils/supabase';
import { mapActivityToDb } from '../mappers/activity.mapper';
import { mapExpenseToDb } from '../mappers/expense.mapper';
import { mapTripToDb } from '../mappers/trip.mapper';
import { mapFundingLotToDb, mapWalletToDb } from '../mappers/wallet.mapper';
import { getPendingEvents, getRetryableEvents, markDone, markFailed, markProcessing } from './syncQueue';
import { summarizeTrip, summarizeWallets, syncTrace } from './debug';

const LEGACY_SHARED_QUEUE_TABLES = new Set(['trips', 'wallets', 'funding_lots', 'expenses', 'activities']);
const DEBUG_QUEUE_LOGS = false;
const DEBUG_QUEUE_TIMING = false;

export const getErrorSummary = (error: unknown): string => {
    if (typeof error === 'string') return error;

    if (error && typeof error === 'object') {
        const candidate = error as Record<string, any>;
        const parts = [
            candidate.message,
            candidate.details,
            candidate.hint,
            candidate.code,
            candidate.status,
            candidate.statusCode,
        ].filter(value => value !== undefined && value !== null && value !== '');

        if (parts.length > 0) return parts.join(' ');
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

export const isRecoverableSyncError = (error: unknown): boolean => {
    if (error && typeof error === 'object') {
        const candidate = error as Record<string, any>;
        const numericStatus = Number(candidate.status ?? candidate.statusCode);
        if (Number.isFinite(numericStatus) && numericStatus >= 500) {
            return true;
        }
    }

    const summary = getErrorSummary(error).toLowerCase();
    return [
        'error code: 502',
        'error code: 503',
        'error code: 504',
        'bad gateway',
        'service unavailable',
        'gateway timeout',
        'failed to fetch',
        'fetch failed',
        'network request failed',
        'network error',
        'timeout',
        'timed out',
        'aborterror',
        'connection terminated unexpectedly',
    ].some(token => summary.includes(token));
};

export const logSyncIssue = (prefix: string, error: unknown, ...details: unknown[]) => {
    const summary = getErrorSummary(error);
    if (isRecoverableSyncError(error)) {
        console.warn(prefix, summary, ...details);
        return;
    }

    console.error(prefix, summary, ...details);
};

const mapTableName = (local: string): string => {
    const map: Record<string, string> = {
        trips: 'trips',
        wallets: 'wallets',
        funding_lots: 'funding_lots',
        expenses: 'expenses',
        activities: 'activities',
    };
    return map[local] || local;
};

const mapToSupabase = (tableName: string, data: any): Record<string, any> => {
    switch (tableName) {
        case 'trips': return mapTripToDb(data);
        case 'activities': return mapActivityToDb(data);
        case 'expenses': return mapExpenseToDb(data);
        case 'wallets': return mapWalletToDb(data);
        case 'funding_lots': return mapFundingLotToDb(data);
        default: return data;
    }
};

const sanitizeSupabasePayload = (tableName: string, data: Record<string, any>): Record<string, any> => {
    const sanitized = { ...data };

    if (tableName === 'trips') {
        delete sanitized.removed_member_user_ids;
        delete sanitized.removedMemberUserIds;
    }

    return sanitized;
};

export const pushPendingChanges = async (auth: AuthState): Promise<number> => {
    const events = [...getPendingEvents(), ...getRetryableEvents()];
    if (DEBUG_QUEUE_LOGS && events.length > 0) {
        const pending = getPendingEvents().length;
        const failed = getRetryableEvents().length;
        console.log(`[SyncEngine] Pushing ${events.length} events... (Pending: ${pending}, Retrying: ${failed})`);
    }
    let pushed = 0;

    for (const event of events) {
        markProcessing(event.id);
        try {
            if (LEGACY_SHARED_QUEUE_TABLES.has(event.table_name)) {
                console.warn(
                    `[SyncEngine] Dropping legacy shared queue event ${event.type} ${event.table_name}/${event.recordId} in cloud-first mode`
                );
                syncTrace('SyncEngine', 'drop_legacy_shared_queue_event', {
                    queueId: event.id,
                    type: event.type,
                    table: event.table_name,
                    recordId: event.recordId,
                });
                markDone(event.id);
                continue;
            }

            const payload = JSON.parse(event.payload);
            const table = mapTableName(event.table_name);
            syncTrace('SyncEngine', 'push_event_start', {
                queueId: event.id,
                type: event.type,
                table: event.table_name,
                recordId: event.recordId,
                payloadTrip: event.table_name === 'trips' ? summarizeTrip(payload) : null,
                payloadWallets: event.table_name === 'wallets' ? summarizeWallets([payload]) : null,
            });

            if (event.type === 'DELETE') {
                const { error } = await supabase.from(table).update({
                    deleted_at: new Date().toISOString(),
                    updated_by: auth.userId,
                }).eq('id', event.recordId);

                if (error) throw error;
            } else {
                const mapped = sanitizeSupabasePayload(
                    event.table_name,
                    mapToSupabase(event.table_name, payload)
                );
                const upsertPayload: any = {
                    ...mapped,
                    updated_by: auth.userId,
                    updated_at: event.timestamp,
                    last_device_id: auth.deviceId,
                };

                if (event.type === 'INSERT') {
                    upsertPayload.user_id = auth.userId;
                }

                const t1 = Date.now();
                if (DEBUG_QUEUE_TIMING) {
                    console.log(`[SYNC_TIMING] T1_PUSH_START ${event.table_name}/${event.recordId} t=${t1}`);
                }
                const { error } = await supabase.from(table).upsert(upsertPayload);
                if (DEBUG_QUEUE_TIMING) {
                    console.log(`[SYNC_TIMING] T1_PUSH_DONE ${event.table_name}/${event.recordId} elapsed=${Date.now() - t1}ms`);
                }
                if (error) throw error;
            }

            if (DEBUG_QUEUE_LOGS) {
                console.log(`[SyncEngine] Pushed ${event.type} ${event.table_name}/${event.recordId}`);
            }
            syncTrace('SyncEngine', 'push_event_done', {
                queueId: event.id,
                type: event.type,
                table: event.table_name,
                recordId: event.recordId,
            });
            markDone(event.id);
            markSynced(event.table_name, event.recordId);
            pushed++;
        } catch (err: any) {
            logSyncIssue(
                `[SyncEngine] Push FAILED ${event.type} ${event.table_name}/${event.recordId}:`,
                err,
                err?.details || ''
            );
            syncTrace('SyncEngine', 'push_event_failed', {
                queueId: event.id,
                type: event.type,
                table: event.table_name,
                recordId: event.recordId,
                message: err?.message || String(err),
                details: err?.details || '',
            });
            markFailed(event.id);
        }
    }

    return pushed;
};
