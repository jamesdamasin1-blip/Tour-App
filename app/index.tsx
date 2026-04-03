import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getAuthState } from '@/src/auth/googleAuth';
import { setSyncMeta } from '@/src/storage/localDB';

/**
 * Root index — Auth gate.
 * Redirects to auth entry if never logged in, otherwise to tabs.
 */
export default function RootIndex() {
    const [ready, setReady] = useState(false);
    const [goToTabs, setGoToTabs] = useState(false);

    useEffect(() => {
        (async () => {
            const auth = await getAuthState();
            setSyncMeta('skippedAuth', 'false');

            if (auth.isAuthenticated) {
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
