import { isSelfEmitted } from '../guards/device.guard';
import { isDeletion } from '../guards/deletion.guard';
import { mapExpenseFromDb } from '../../mappers/expense.mapper';
import type { StateSnapshot, HandlerResult } from './types';
import { syncTrace, summarizeRealtimePayload } from '../debug';

export function handleExpenseChange(payload: any, state: StateSnapshot): HandlerResult {
    if (isSelfEmitted(payload)) {
        syncTrace('ExpenseRT', 'skip_self_emitted', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const row = payload.new ?? payload.old;
    if (!row?.id) {
        syncTrace('ExpenseRT', 'skip_missing_id', summarizeRealtimePayload(payload));
        return { patch: null };
    }

    const incoming = mapExpenseFromDb(row);

    if (isDeletion(payload.eventType, row)) {
        syncTrace('ExpenseRT', 'delete_patch_only', {
            payload: summarizeRealtimePayload(payload),
            expenseId: incoming.id,
            tripId: incoming.tripId,
        });
        return {
            patch: {
                expenses: state.expenses.filter(e => e.id !== incoming.id),
                activities: state.activities.map(a => ({
                    ...a,
                    expenses: (a.expenses ?? []).filter(e => e.id !== incoming.id),
                })),
            },
        };
    }

    const tripExists = state.trips.some(t => t.id === incoming.tripId);
    if (!tripExists) {
        syncTrace('ExpenseRT', 'missing_trip_refetch', {
            payload: summarizeRealtimePayload(payload),
            expenseId: incoming.id,
            tripId: incoming.tripId,
        });
        return {
            patch: null,
            triggerRefetchTripId: incoming.tripId,
        };
    }

    // If the expense references an activity we don't have yet (e.g. spontaneous expense
    // whose activity realtime event hasn't arrived), schedule a debounced refetch so the
    // activity card appears promptly. The expense patch is still applied so balance is
    // accurate; the refetch is cancelled if the activity event arrives within 250ms.
    const activityMissing =
        !!incoming.activityId &&
        !state.activities.some(a => a.id === incoming.activityId);

    syncTrace('ExpenseRT', 'patch_expense_row', {
        payload: summarizeRealtimePayload(payload),
        expenseId: incoming.id,
        tripId: incoming.tripId,
        activityMissing,
    });
    const nextExpenses = [
        ...state.expenses.filter(e => e.id !== incoming.id),
        incoming,
    ];
    return {
        patch: {
            expenses: nextExpenses,
            activities: state.activities.map(activity =>
                activity.tripId !== incoming.tripId
                    ? activity
                    : {
                        ...activity,
                        expenses: nextExpenses.filter(expense => expense.activityId === activity.id),
                    }
            ),
        },
        ...(activityMissing ? { triggerRefetchTripId: incoming.tripId } : {}),
    };
}
