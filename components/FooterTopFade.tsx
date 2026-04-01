import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';

type FooterTopFadeProps = {
    isDark: boolean;
    top?: number;
    height?: number;
};

export function FooterTopFade({
    isDark,
    top = -42,
    height = 94,
}: FooterTopFadeProps) {
    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                height,
            }}
        >
            <LinearGradient
                colors={[
                    isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                    isDark ? 'rgba(26, 28, 24, 0.025)' : 'rgba(242, 240, 232, 0.03)',
                    isDark ? 'rgba(26, 28, 24, 0.075)' : 'rgba(242, 240, 232, 0.085)',
                    isDark ? 'rgba(26, 28, 24, 0.16)' : 'rgba(242, 240, 232, 0.17)',
                    isDark ? 'rgba(26, 28, 24, 0.28)' : 'rgba(242, 240, 232, 0.26)',
                ]}
                locations={[0, 0.28, 0.52, 0.78, 1]}
                style={{ flex: 1 }}
            />
        </View>
    );
}
