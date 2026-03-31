/**
 * EXPENSE MAPPER
 * Single source of truth for Expense ↔ Supabase DB row conversion.
 * Used by both realtime postgres_changes handlers and pull-sync SELECT rows.
 *
 * Rule: mapping only — no business logic, no FIFO, no side effects.
 */
import type { Expense } from '../types/models';

/** Convert a DB value to a safe finite number (never NaN/Infinity). */
export const safeNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Map a Supabase row (snake_case) → Expense (camelCase).
 * Works for both realtime payloads and pull-sync SELECT rows.
 * Defensive: uses safeNum on all numeric fields, never returns NaN.
 */
export function mapExpenseFromDb(row: Record<string, any>): Expense {
    return {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        activityId: row.activity_id ?? undefined,
        name: row.name ?? '',
        amount: safeNum(row.amount),
        currency: row.currency ?? 'PHP',
        convertedAmountHome: safeNum(row.converted_amount_home),
        convertedAmountTrip: safeNum(row.converted_amount_trip),
        category: row.category,
        time: safeNum(row.time),
        date: safeNum(row.date),
        originalAmount: row.original_amount != null ? safeNum(row.original_amount) : undefined,
        originalCurrency: row.original_currency ?? undefined,
        createdBy: row.created_by ?? undefined,
        lastModifiedBy: row.last_modified_by ?? undefined,
        version: safeNum(row.version, 1),
        lastModified: row.updated_at ? safeNum(row.updated_at) : undefined,
        updatedBy: row.updated_by ?? undefined,
        deletedAt: row.deleted_at ?? null,
        fieldUpdates: row.field_updates ?? {},
        lastDeviceId: row.last_device_id ?? undefined,
        lotBreakdown: row.lot_breakdown ?? undefined,
    };
}

/**
 * Map an Expense (camelCase) → Supabase columns (snake_case).
 * Used by syncEngine push path.
 * Does NOT include sync-managed columns (updated_by, last_device_id, version).
 */
export function mapExpenseToDb(data: Partial<Expense> & { id: string }): Record<string, any> {
    return {
        id: data.id,
        trip_id: data.tripId,
        activity_id: data.activityId,
        wallet_id: data.walletId,
        name: data.name,
        amount: data.amount,
        currency: data.currency,
        converted_amount_home: data.convertedAmountHome,
        converted_amount_trip: data.convertedAmountTrip,
        category: data.category,
        time: data.time,
        date: data.date,
        original_amount: data.originalAmount,
        original_currency: data.originalCurrency,
        created_by: data.createdBy,
        last_modified_by: data.lastModifiedBy,
        field_updates: data.fieldUpdates,
        lot_breakdown: data.lotBreakdown,
    };
}
