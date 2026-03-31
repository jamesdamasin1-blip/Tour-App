import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const { width } = Dimensions.get('window');

interface TabBgProps {
    color?: string;
}

export const TabBg: React.FC<TabBgProps> = ({ color }) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    
    const insets = useSafeAreaInsets();
    
    const defaultColor = isDark ? '#1A1C18' : '#F2F0E8';
    const finalColor = color || defaultColor;
    // SVG Path calculation for smooth circular cutout using cubic beziers
    // Transition points: center-60 (start bend), center-35 (enter dip), center+35 (exit dip), center+60 (end bend)
    const curveWidth = 65; // Horizontal span of the transition
    const dipWidth = 35;  // Core radius of the dip
    const dipDepth = 35;  // Depth of the dip
    const center = width / 2;
    const height = 64 + insets.bottom;     // Total height to cover area

    const d = `
        M 0 ${height}
        L 0 0
        L ${center - curveWidth} 0
        C ${center - dipWidth - 5} 0, ${center - dipWidth - 5} ${dipDepth}, ${center} ${dipDepth}
        C ${center + dipWidth + 5} ${dipDepth}, ${center + dipWidth + 5} 0, ${center + curveWidth} 0
        L ${width} 0
        L ${width} ${height}
        Z
    `;

    return (
        <View style={[styles.container, { height }]}>
            <Svg width={width} height={height}>
                <Path
                    d={d}
                    fill={finalColor}
                />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width,
        backgroundColor: 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 5,
    }
});
