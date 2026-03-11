import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { useStore } from '@/src/store/useStore';

interface ProgressBarProps {
    progress: number; // 0 to 100
    color?: string; // e.g., '#3b82f6'
    gradientColors?: readonly [string, string, ...string[]]; // At least 2 colors required
    trackColor?: string; // e.g., '#e5e7eb'
    height?: number;
    showPercentage?: boolean;
    floatingLabel?: string;
    secondaryLabel?: string;
    fontSize?: number;
}

export const ProgressBar = React.memo(({
    progress,
    color = '#3b82f6',
    gradientColors,
    trackColor = '#e5e7eb',
    height = 8,
    showPercentage = false,
    floatingLabel,
    secondaryLabel,
    fontSize = 11
}: ProgressBarProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const [width, setWidth] = useState(0);

    // Clamp between 0 and 100
    const clampedProgress = Math.min(Math.max(progress, 0), 100);

    const handleLayout = (event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
    };

    // Construct the text label
    let label = '';
    if (floatingLabel) {
        label = floatingLabel;
    } else if (showPercentage) {
        label = `${Math.round(clampedProgress)}%`;
        if (secondaryLabel) {
            label += ` • ${secondaryLabel}`;
        }
    } else if (secondaryLabel) {
        label = secondaryLabel;
    }

    const InnerBarContent = gradientColors && gradientColors.length > 1 ? (
        <LinearGradient
            colors={gradientColors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="h-full rounded-full"
            style={{ width: '100%' }}
        />
    ) : (
        <View
            className="h-full rounded-full"
            style={{ width: '100%', backgroundColor: color }}
        />
    );

    return (
        <View
            onLayout={handleLayout}
            className="w-full rounded-full overflow-hidden relative"
            style={{ height, backgroundColor: trackColor }}
        >
            {/* 1. Bottom Text Layer (Visible on track) */}
            {label.length > 0 && (
                <View className="absolute inset-0 items-center justify-center pointer-events-none">
                    <Text
                        style={{ 
                            fontSize, 
                            color: isDark ? 'rgba(242, 240, 232, 0.6)' : '#000000', 
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 1.2,
                            textAlign: 'center'
                        }}
                        numberOfLines={1}
                    >
                        {label}
                    </Text>
                </View>
            )}

            {/* 2. Top Fill Bar + Clipping Text Layer */}
            <View
                className="h-full rounded-full overflow-hidden absolute left-0 top-0 bottom-0"
                style={{ width: `${clampedProgress}%` }}
            >
                {/* The Color Fill */}
                <View className="absolute inset-0">
                    {InnerBarContent}
                </View>

                {/* 3. Top Text Layer (White contrast, clipped by parent width) */}
                {label.length > 0 && width > 0 && (
                    <View
                        style={{ width, height: '100%', alignItems: 'center', justifyContent: 'center' }}
                        className="pointer-events-none"
                    >
                        <Text
                            style={{ 
                                fontSize, 
                                color: '#FFFFFF', 
                                fontWeight: '900',
                                textTransform: 'uppercase',
                                letterSpacing: 1.2,
                                textAlign: 'center',
                                position: 'absolute',
                                top: (height - fontSize * 1.2) / 2
                            }}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
});
