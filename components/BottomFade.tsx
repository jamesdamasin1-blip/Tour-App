import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';

interface BottomFadeProps {
    visible: boolean;
}

/**
 * A LinearGradient scroll-fade overlay anchored to the screen bottom.
 * Replaces a ~30-line pattern duplicated across index, analysis, and trip detail screens.
 */
export const BottomFade: React.FC<BottomFadeProps> = ({ visible }) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

    if (!visible) return null;

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 200 + insets.bottom,
                zIndex: 5,
            }}
        >
            <LinearGradient
                colors={[
                    isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                    isDark ? 'rgba(26, 28, 24, 0.4)' : 'rgba(242, 240, 232, 0.4)',
                    isDark ? 'rgba(26, 28, 24, 0.8)' : 'rgba(242, 240, 232, 0.8)',
                    isDark ? 'rgba(26, 28, 24, 1)' : 'rgba(242, 240, 232, 1)'
                ]}
                style={{ flex: 1 }}
            />
        </View>
    );
};
