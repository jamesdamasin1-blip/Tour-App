import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');

interface TabBgProps {
    color?: string;
    overlapTop?: number;
}

export const TabBg: React.FC<TabBgProps> = ({ color, overlapTop = 0 }) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';
    
    const insets = useSafeAreaInsets();
    
    const defaultColor = isDark ? '#1A1C18' : '#F2F0E8';
    const finalColor = color || defaultColor;
    const gradientId = `tabBgFill-${isDark ? 'dark' : 'light'}-${color ? 'custom' : 'default'}`;
    // SVG Path calculation for smooth circular cutout using cubic beziers
    // Transition points: center-60 (start bend), center-35 (enter dip), center+35 (exit dip), center+60 (end bend)
    const curveWidth = 65; // Horizontal span of the transition
    const dipWidth = 35;  // Core radius of the dip
    const dipDepth = 35;  // Depth of the dip
    const center = width / 2;
    const height = 64 + insets.bottom;
    const svgHeight = height + overlapTop;
    const topY = overlapTop;

    const d = `
        M 0 ${svgHeight}
        L 0 ${topY}
        L ${center - curveWidth} ${topY}
        C ${center - dipWidth - 5} ${topY}, ${center - dipWidth - 5} ${topY + dipDepth}, ${center} ${topY + dipDepth}
        C ${center + dipWidth + 5} ${topY + dipDepth}, ${center + dipWidth + 5} ${topY}, ${center + curveWidth} ${topY}
        L ${width} ${topY}
        L ${width} ${svgHeight}
        Z
    `;

    return (
        <View style={[styles.container, { height: svgHeight, marginTop: -overlapTop }]}>
            <Svg width={width} height={svgHeight}>
                <Defs>
                    <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={finalColor} stopOpacity={isDark ? '0.96' : '0.965'} />
                        <Stop offset="0.12" stopColor={finalColor} stopOpacity={isDark ? '0.99' : '0.992'} />
                        <Stop offset="0.3" stopColor={finalColor} stopOpacity="1" />
                        <Stop offset="0.56" stopColor={finalColor} stopOpacity="1" />
                        <Stop offset="1" stopColor={finalColor} stopOpacity="1" />
                    </SvgLinearGradient>
                </Defs>
                <Path
                    d={d}
                    fill={`url(#${gradientId})`}
                />
                <Path
                    d={d}
                    fill="none"
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)'}
                    strokeWidth={1}
                />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width,
        backgroundColor: 'transparent',
    }
});
