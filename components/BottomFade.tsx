import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';

interface BottomFadeProps {
    visible: boolean;
    height?: number;
    bottomOffset?: number;
    opacity?: number;
}

const BOTTOM_FADE_OVERLAP = 28;

/**
 * A LinearGradient scroll-fade overlay anchored to the screen bottom.
 * Replaces a ~30-line pattern duplicated across index, analysis, and trip detail screens.
 */
export const BottomFade: React.FC<BottomFadeProps> = ({
    visible,
    height = 260,
    bottomOffset = 0,
    opacity = 1,
}) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

    if (!visible) return null;

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                bottom: bottomOffset,
                left: 0,
                right: 0,
                height: height + insets.bottom + BOTTOM_FADE_OVERLAP,
                zIndex: 5,
                opacity,
            }}
        >
            <LinearGradient
                colors={[
                    isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                    isDark ? 'rgba(26, 28, 24, 0.12)' : 'rgba(242, 240, 232, 0.14)',
                    isDark ? 'rgba(26, 28, 24, 0.4)' : 'rgba(242, 240, 232, 0.44)',
                    isDark ? 'rgba(26, 28, 24, 0.82)' : 'rgba(242, 240, 232, 0.86)',
                    isDark ? 'rgba(26, 28, 24, 1)' : 'rgba(242, 240, 232, 1)',
                ]}
                locations={[0, 0.28, 0.56, 0.82, 1]}
                style={{ flex: 1 }}
            />
        </View>
    );
};
