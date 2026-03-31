/**
 * ACTIVITY MAPPER
 * Single source of truth for Activity ↔ Supabase DB row conversion.
 * Used by both realtime postgres_changes handlers and pull-sync SELECT rows.
 *
 * Rule: mapping only — no business logic, no FIFO, no side effects.
 * Note: `expenses` is a local join — never stored in DB, never mapped here.
 */
import type { Activity } from '../types/models';

/** Convert a DB value to a safe finite number (never NaN/Infinity). */
const safeNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Map a Supabase row (snake_case) → Activity (camelCase), without expenses.
 * Caller is responsible for seeding `expenses` from local state as needed.
 */
export function mapActivityFromDb(row: Record<string, any>): Omit<Activity, 'expenses'> {
    return {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        title: row.title ?? '',
        category: row.category ?? 'general',
        date: safeNum(row.date),
        time: safeNum(row.time),
        endTime: row.end_time != null ? safeNum(row.end_time) : undefined,
        allocatedBudget: safeNum(row.allocated_budget),
        budgetCurrency: row.budget_currency ?? 'PHP',
        isCompleted: row.is_completed ?? false,
        isSpontaneous: row.is_spontaneous === true || row.is_spontaneous === 1 || row.is_spontaneous === 'true',
        lastModified: safeNum(row.last_modified, Date.now()),
        description: row.description ?? undefined,
        location: row.location ?? undefined,
        countries: row.countries ?? [],
        createdBy: row.created_by ?? undefined,
        lastModifiedBy: row.last_modified_by ?? undefined,
        version: safeNum(row.version, 1),
        updatedBy: row.updated_by ?? undefined,
        deletedAt: row.deleted_at ?? null,
        fieldUpdates: row.field_updates ?? {},
        lastDeviceId: row.last_device_id ?? undefined,
    };
}

/**
 * Map an Activity (camelCase) → Supabase columns (snake_case).
 * Used by syncEngine push path.
 * Does NOT include sync-managed columns (updated_by, last_device_id, version).
 */
export function mapActivityToDb(data: Partial<Activity> & { id: string }): Record<string, any> {
    return {
        id: data.id,
        trip_id: data.tripId,
        wallet_id: data.walletId,
        title: data.title,
        category: data.category,
        date: data.date,
        time: data.time,
        end_time: data.endTime,
        allocated_budget: data.allocatedBudget,
        budget_currency: data.budgetCurrency,
        is_completed: data.isCompleted,
        is_spontaneous: data.isSpontaneous === true,
        last_modified: data.lastModified,
        description: data.description,
        location: data.location,
        countries: data.countries,
        created_by: data.createdBy,
        last_modified_by: data.lastModifiedBy,
        field_updates: data.fieldUpdates,
    };
}
