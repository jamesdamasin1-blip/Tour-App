import { useEffect } from 'react';
import { router } from 'expo-router';

/** Deep link landing — openAuthSessionAsync handles the code exchange,
 *  so this screen just dismisses itself immediately. */
export default function AuthCallback() {
    useEffect(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
    }, []);
    return null;
}
