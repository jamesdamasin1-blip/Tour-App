/**
 * WALLET + FUNDING LOT MAPPER
 * Single source of truth for Wallet and ExchangeEvent ↔ Supabase DB row conversion.
 * Used by both realtime postgres_changes handlers and pull-sync SELECT rows.
 *
 * Rule: mapping only — no business logic, no lot balance computation, no side effects.
 */
import type { Wallet, ExchangeEvent } from '../types/models';

/** Convert a DB value to a safe finite number (never NaN/Infinity). */
const safeNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const toTimestampValue = (value: unknown): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') return value;

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;

    return new Date(numeric).toISOString();
};

/**
 * Map a Supabase wallets row (snake_case) → Wallet (camelCase).
 * `existingWallet` is passed to preserve locally-held fields not stored in DB
 * (e.g. `country`, `createdAt`) when processing realtime partial payloads.
 */
export function mapWalletFromDb(
    row: Record<string, any>,
    existingWallet?: Wallet
): Wallet {
    return {
        id: row.id,
        tripId: row.trip_id,
        // `country` is not a DB column — preserve from local state if available
        country: existingWallet?.country ?? '',
        currency: row.currency,
        totalBudget: safeNum(row.total_budget),
        spentAmount: safeNum(row.spent_amount),
        defaultRate: safeNum(row.default_rate, 1),
        baselineExchangeRate: row.baseline_exchange_rate != null
            ? safeNum(row.baseline_exchange_rate)
            : undefined,
        lots: row.lots ?? [],
        // `createdAt` is not in the wallets DB table — preserve from local state
        createdAt: existingWallet?.createdAt ?? Date.now(),
        version: safeNum(row.version, 1),
        updatedBy: row.updated_by ?? undefined,
        deletedAt: row.deleted_at ?? null,
        fieldUpdates: row.field_updates ?? {},
        lastDeviceId: row.last_device_id ?? undefined,
        lastModified: safeNum(row.updated_at, Date.now()),
    };
}

/**
 * Map a Wallet (camelCase) → Supabase columns (snake_case).
 * Used by syncEngine push path.
 */
export function mapWalletToDb(data: Partial<Wallet> & { id: string }): Record<string, any> {
    return {
        id: data.id,
        trip_id: data.tripId,
        currency: data.currency,
        total_budget: data.totalBudget,
        spent_amount: data.spentAmount,
        lots: data.lots,
        baseline_exchange_rate: data.baselineExchangeRate,
        default_rate: data.defaultRate,
        field_updates: data.fieldUpdates,
        updated_at: data.lastModified,
    };
}

/**
 * Map a Supabase funding_lots row (snake_case) → ExchangeEvent (camelCase).
 * Used by both realtime and pull-sync paths.
 */
export function mapFundingLotFromDb(row: Record<string, any>): ExchangeEvent {
    const rate = safeNum(row.rate);
    const sourceAmount = safeNum(row.source_amount);
    return {
        id: row.id,
        tripId: row.trip_id,
        walletId: row.wallet_id,
        homeAmount: sourceAmount,
        tripAmount: rate > 0 ? sourceAmount / rate : 0,
        rate,
        date: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        sourceCurrency: row.source_currency ?? undefined,
        targetCurrency: row.target_currency ?? undefined,
        entryKind: row.entry_kind ?? undefined,
        notes: row.notes ?? undefined,
        version: safeNum(row.version, 1),
        updatedBy: row.updated_by ?? undefined,
        deletedAt: row.deleted_at ?? null,
        fieldUpdates: row.field_updates ?? {},
        lastDeviceId: row.last_device_id ?? undefined,
    };
}

/**
 * Map an ExchangeEvent (camelCase) → Supabase funding_lots columns (snake_case).
 * Used by syncEngine push path.
 */
export function mapFundingLotToDb(data: Partial<ExchangeEvent> & { id: string }): Record<string, any> {
    return {
        id: data.id,
        wallet_id: data.walletId,
        trip_id: data.tripId,
        source_currency: (data as any).sourceCurrency ?? 'PHP',
        target_currency: (data as any).targetCurrency,
        source_amount: data.homeAmount ?? (data as any).sourceAmount,
        rate: data.rate,
        entry_kind: data.entryKind,
        notes: data.notes,
        created_at: toTimestampValue(data.date ?? (data as any).createdAt),
        field_updates: data.fieldUpdates,
    };
}
