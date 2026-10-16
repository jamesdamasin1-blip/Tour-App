import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, Text, View } from 'react-native';
import { useStore } from '@/src/store/useStore';

interface ProgressBarProps {
    progress: number;
    color?: string;
    gradientColors?: readonly [string, string, ...string[]];
    trackColor?: string;
    height?: number;
    showPercentage?: boolean;
    floatingLabel?: string;
    secondaryLabel?: string;
    fontSize?: number;
    freezeWhile?: boolean;
    settleMs?: number;
    animated?: boolean;
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
    fontSize = 11,
    freezeWhile = false,
    settleMs: _settleMs = 180,
    animated = Platform.OS !== 'android',
}: ProgressBarProps) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    const [width, setWidth] = useState(0);
    const clampedProgress = Math.min(Math.max(progress, 0), 100);
    const progressAnim = useRef(new Animated.Value(clampedProgress)).current;
    const lastMeasuredWidthRef = useRef(0);

    const buildLabel = (value: number) => {
        if (floatingLabel) return floatingLabel;
        if (showPercentage) {
            let next = `${Math.round(value)}%`;
            if (secondaryLabel) next += ` • ${secondaryLabel}`;
            return next;
        }
        return secondaryLabel || '';
    };

    const nextLabel = buildLabel(clampedProgress);

    useEffect(() => {
        if (!animated || freezeWhile) return;
        progressAnim.stopAnimation();
        Animated.timing(progressAnim, {
            toValue: clampedProgress,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [animated, clampedProgress, freezeWhile, progressAnim]);

    const handleLayout = (event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0) {
            lastMeasuredWidthRef.current = nextWidth;
        }
        setWidth(nextWidth);
    };

    const innerBarContent = gradientColors && gradientColors.length > 1 ? (
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

    const resolvedProgress = clampedProgress;
    const resolvedLabel = nextLabel;
    const effectiveWidth = width > 0 ? width : lastMeasuredWidthRef.current;
    const resolvedWidth = effectiveWidth > 0 ? (resolvedProgress / 100) * effectiveWidth : 0;

    if (!animated) {
        return (
            <View
                onLayout={handleLayout}
                className="w-full rounded-full overflow-hidden relative"
                style={{ height, backgroundColor: trackColor }}
            >
                {resolvedLabel.length > 0 && (
                    <View className="absolute inset-0 items-center justify-center pointer-events-none">
                        <Text
                            style={{
                                fontSize,
                                color: isDark ? 'rgba(242, 240, 232, 0.6)' : '#000000',
                                fontWeight: '900',
                                textTransform: 'uppercase',
                                letterSpacing: 1.2,
                                textAlign: 'center',
                            }}
                            numberOfLines={1}
                        >
                            {resolvedLabel}
                        </Text>
                    </View>
                )}

                <View
                    className="h-full rounded-full overflow-hidden absolute left-0 top-0 bottom-0"
                    style={{ width: resolvedWidth, minWidth: resolvedProgress > 0 ? 2 : 0 }}
                >
                    <View className="absolute inset-0">
                        {innerBarContent}
                    </View>

                    {resolvedLabel.length > 0 && effectiveWidth > 0 && (
                        <View
                            style={{ width: effectiveWidth, height: '100%', alignItems: 'center', justifyContent: 'center' }}
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
                                    top: (height - fontSize * 1.2) / 2,
                                }}
                                numberOfLines={1}
                            >
                                {resolvedLabel}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View
            onLayout={handleLayout}
            className="w-full rounded-full overflow-hidden relative"
            style={{ height, backgroundColor: trackColor }}
        >
            {resolvedLabel.length > 0 && (
                <View className="absolute inset-0 items-center justify-center pointer-events-none">
                    <Text
                        style={{
                            fontSize,
                            color: isDark ? 'rgba(242, 240, 232, 0.6)' : '#000000',
                            fontWeight: '900',
                            textTransform: 'uppercase',
                            letterSpacing: 1.2,
                            textAlign: 'center',
                        }}
                        numberOfLines={1}
                    >
                        {resolvedLabel}
                    </Text>
                </View>
            )}

            <Animated.View
                className="h-full rounded-full overflow-hidden absolute left-0 top-0 bottom-0"
                style={{
                    minWidth: resolvedProgress > 0 ? 2 : 0,
                    width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: [0, effectiveWidth],
                        extrapolate: 'clamp',
                    }),
                }}
            >
                <View className="absolute inset-0">
                    {innerBarContent}
                </View>

                {resolvedLabel.length > 0 && effectiveWidth > 0 && (
                    <View
                        style={{ width: effectiveWidth, height: '100%', alignItems: 'center', justifyContent: 'center' }}
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
                                top: (height - fontSize * 1.2) / 2,
                            }}
                            numberOfLines={1}
                        >
                            {resolvedLabel}
                        </Text>
                    </View>
                )}
            </Animated.View>
        </View>
    );
});

ProgressBar.displayName = 'ProgressBar';
