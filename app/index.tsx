import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getAuthState } from '@/src/auth/googleAuth';
import { getSyncMeta } from '@/src/storage/localDB';

/**
 * Root index — Auth gate.
 * Redirects to auth entry if never logged in, otherwise to tabs.
 * "Continue Offline" sets a flag so users aren't asked again.
 */
export default function RootIndex() {
    const [ready, setReady] = useState(false);
    const [goToTabs, setGoToTabs] = useState(false);

    useEffect(() => {
        (async () => {
            // Check if user previously chose offline or is authenticated
            const skippedAuth = getSyncMeta('skippedAuth');
            const auth = await getAuthState();

            if (auth.isAuthenticated || skippedAuth === 'true') {
                setGoToTabs(true);
            }
            setReady(true);
        })();
    }, []);

    if (!ready) return null;

    if (goToTabs) {
        return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/(auth)/entry" />;
}
