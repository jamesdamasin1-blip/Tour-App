/**
 * DEVICE GUARD
 * Answers: "Did this payload originate from the current device?"
 *
 * Prevents self-echo: when this device pushes a change, Supabase realtime
 * bounces it back. Without this guard, the device would re-apply its own
 * write, potentially triggering redundant FIFO deductions or merge conflicts.
 */
import { getDeviceId } from '../../auth/googleAuth';

/**
 * Returns true if the payload was emitted by the current device.
 * When true, the caller must skip applying the change to local state.
 *
 * Checks `payload.new` first (INSERT/UPDATE), falls back to `payload.old` (DELETE).
 */
export function isSelfEmitted(
    payload: { new?: Record<string, any> | null; old?: Record<string, any> | null }
): boolean {
    const row = payload.new ?? payload.old;
    if (!row) return false;
    return row.last_device_id === getDeviceId();
}
