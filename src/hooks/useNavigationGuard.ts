import { useCallback, useRef } from 'react';

/**
 * A hook to prevent double-clicks from triggering multiple navigations.
 * It locks the navigation for a short period (500ms) after a click.
 */
export function useNavigationGuard() {
    const isNavigating = useRef(false);

    const safeNavigate = useCallback((navigateFn: () => void) => {
        if (isNavigating.current) return;

        isNavigating.current = true;
        navigateFn();

        // Reset the lock after a short delay
        setTimeout(() => {
            isNavigating.current = false;
        }, 500);
    }, []);

    return { safeNavigate };
}
