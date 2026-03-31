/**
 * REALTIME HANDLER CONTRACTS
 * Shared types for all realtime handler functions.
 *
 * StateSnapshot — minimal read-only slice of Zustand state passed into handlers.
 * HandlerResult — what handlers return; caller applies patch to the store.
 *
 * Handlers are pure functions: (payload, snapshot) → HandlerResult.
 * No useStore, no React, no side effects.
 */
import type { TripPlan, Activity, Expense, ExchangeEvent } from '../../types/models';

/** Minimal state slice required by realtime handlers. */
export interface StateSnapshot {
    trips: TripPlan[];
    activities: Activity[];
    expenses: Expense[];
    exchangeEvents: ExchangeEvent[];
    currentUserId: string | null;
}

/** What a handler returns. `patch: null` means "skip — do not update state". */
export interface HandlerResult {
    /** Partial state update to pass to useStore.setState. Null = no-op. */
    patch: Partial<Pick<StateSnapshot, 'trips' | 'activities' | 'expenses' | 'exchangeEvents'>> | null;
    /** When true, caller must trigger a full runSync() after applying the patch. */
    triggerSync?: boolean;
    /** IMPORTANT: Signals a hard refetch strategy for a specific trip */
    triggerRefetchTripId?: string;
}
