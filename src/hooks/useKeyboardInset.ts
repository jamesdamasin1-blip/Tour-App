import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

export function useKeyboardInset() {
    const [keyboardInset, setKeyboardInset] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const handleShow = (event: KeyboardEvent) => {
            setKeyboardInset(event.endCoordinates?.height ?? 0);
        };

        const handleHide = () => {
            setKeyboardInset(0);
        };

        const showSubscription = Keyboard.addListener(showEvent, handleShow);
        const hideSubscription = Keyboard.addListener(hideEvent, handleHide);

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return keyboardInset;
}
