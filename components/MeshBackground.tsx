import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useStore } from '@/src/store/useStore';

/**
 * MeshBackground
 * Simulates a soft multi-blob mesh gradient using stacked LinearGradients.
 * Color palette: sage greens, warm cream, and soft dusty gold — the app's theme.
 * Inspired by the dreamy aurora-style reference image, adapted to sage hues.
 */
export const MeshBackground: React.FC<{ children?: React.ReactNode; style?: any }> = ({ children, style }) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    return (
        <View style={[{ flex: 1, backgroundColor: isDark ? '#1A1C18' : '#F2F0E8' }, style]}>
            {/* Premium Mesh Background Layers - Hardware Accelerated */}
            <View 
                style={StyleSheet.absoluteFill} 
                pointerEvents="none"
                renderToHardwareTextureAndroid={true}
                shouldRasterizeIOS={true}
            >
                {/* Top-left blob: soft sage blue-green */}
                <LinearGradient
                    colors={[isDark ? 'rgba(93, 109, 84, 0.40)' : 'rgba(178, 196, 170, 0.60)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.75, y: 0.75 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Top-right blob: soft warm wheat / dusty gold */}
                <LinearGradient
                    colors={['transparent', isDark ? 'rgba(74, 82, 64, 0.35)' : 'rgba(220, 210, 168, 0.50)', 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Bottom-right blob: deeper sage warmth */}
                <LinearGradient
                    colors={['transparent', isDark ? 'rgba(57, 66, 51, 0.45)' : 'rgba(158, 178, 148, 0.40)', 'transparent']}
                    start={{ x: 0.3, y: 0.5 }}
                    end={{ x: 1, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Bottom-left accent: soft olive mist */}
                <LinearGradient
                    colors={['transparent', isDark ? 'rgba(75, 85, 69, 0.30)' : 'rgba(196, 208, 182, 0.35)', 'transparent']}
                    start={{ x: 0.6, y: 0.6 }}
                    end={{ x: 0, y: 0.85 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Center brightener: keeps middle airy & light */}
                <LinearGradient
                    colors={['transparent', isDark ? 'rgba(93, 109, 84, 0.15)' : 'rgba(255, 255, 255, 0.35)', 'transparent']}
                    start={{ x: 0.2, y: 0.2 }}
                    end={{ x: 0.8, y: 0.8 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            {children}
        </View>
    );
};
