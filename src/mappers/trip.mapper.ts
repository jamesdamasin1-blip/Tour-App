/**
 * TRIP MAPPER
 * Single source of truth for TripPlan ↔ Supabase DB row conversion.
 * Used by both realtime postgres_changes handlers and pull-sync SELECT rows.
 *
 * Rule: mapping only — no business logic, no sync guards, no side effects.
 *
 * IMPORTANT: wallet-derived aggregates (tripCurrency, totalBudget, etc.) are
 * always computed from `wallets` when present. The realtime payload may omit
 * `wallets` for partial updates — callers must merge with existing local state.
 */
import type { TripPlan } from '../types/models';

/** Convert a DB value to a safe finite number (never NaN/Infinity). */
const safeNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Map a Supabase row (snake_case) → TripPlan (camelCase).
 * Works for both realtime payloads and pull-sync SELECT rows.
 *
 * Wallet-derived fields are recomputed whenever `wallets` is present.
 * When `wallets` is absent from the payload (partial realtime update),
 * the caller must preserve local wallet state.
 */
export function mapTripFromDb(row: Record<string, any>): Partial<TripPlan> & { id: string } {
    const wallets: any[] = row.wallets ?? [];
    const hasWallets = 'wallets' in row;

    const base: Partial<TripPlan> & { id: string } = {
        id: row.id,
        isCloudSynced: true,
    };

    if ('title' in row) base.title = row.title;
    if ('destination' in row) base.destination = row.destination;
    if ('start_date' in row && row.start_date && safeNum(row.start_date) > 0)
        base.startDate = safeNum(row.start_date);
    if ('end_date' in row && row.end_date && safeNum(row.end_date) > 0)
        base.endDate = safeNum(row.end_date);
    if ('home_country' in row) base.homeCountry = row.home_country;
    if ('home_currency' in row) base.homeCurrency = row.home_currency;
    if ('total_budget_home_cached' in row)
        base.totalBudgetHomeCached = safeNum(row.total_budget_home_cached);
    if ('countries' in row) base.countries = row.countries ?? [];
    if ('members' in row) base.members = row.members ?? [];
    if ('removed_member_user_ids' in row)
        base.removedMemberUserIds = row.removed_member_user_ids ?? [];
    if ('is_completed' in row) base.isCompleted = row.is_completed ?? false;
    if ('last_modified' in row)
        base.lastModified = safeNum(row.last_modified, Date.now());
    if ('version' in row) base.version = safeNum(row.version, 1);
    if ('updated_by' in row) base.updatedBy = row.updated_by ?? undefined;
    if ('deleted_at' in row) base.deletedAt = row.deleted_at ?? null;
    if ('field_updates' in row) base.fieldUpdates = row.field_updates ?? {};
    if ('last_device_id' in row) base.lastDeviceId = row.last_device_id ?? undefined;
    if ('spontaneous_events' in row) base.spontaneousEvents = row.spontaneous_events ?? [];
    if ('user_id' in row) (base as any).userId = row.user_id ?? undefined;

    // Wallet-derived aggregates — always recompute when wallets are present.
    if (hasWallets) {
        base.wallets = wallets;
        base.tripCurrency = wallets[0]?.currency ?? row.home_currency;
        base.totalBudgetTrip = wallets[0]?.totalBudget ?? 0;
        base.totalBudget = wallets.reduce(
            (acc: number, w: any) => acc + (w.totalBudget / (w.defaultRate || 1)),
            0
        );
        base.currency = wallets[0]?.currency ?? row.home_currency;
    }

    return base;
}

/**
 * Map a TripPlan (camelCase) → Supabase columns (snake_case).
 * Used by syncEngine push path.
 * Does NOT include sync-managed columns (updated_by, last_device_id, version).
 */
export function mapTripToDb(data: Partial<TripPlan> & { id: string }): Record<string, any> {
    return {
        id: data.id,
        title: data.title,
        destination: data.destination,
        start_date: data.startDate,
        end_date: data.endDate,
        home_country: data.homeCountry,
        home_currency: data.homeCurrency,
        wallets: data.wallets,
        total_budget_home_cached: data.totalBudgetHomeCached,
        spontaneous_events: data.spontaneousEvents ?? [],
        countries: data.countries,
        members: data.members,
        removed_member_user_ids: data.removedMemberUserIds ?? [],
        is_completed: data.isCompleted,
        last_modified: data.lastModified,
        field_updates: data.fieldUpdates,
    };
}
