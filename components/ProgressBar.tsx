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
    settleMs = 180,
    animated = Platform.OS !== 'android',
}: ProgressBarProps) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    const [width, setWidth] = useState(0);
    const clampedProgress = Math.min(Math.max(progress, 0), 100);
    const progressAnim = useRef(new Animated.Value(clampedProgress)).current;
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const [displayedProgress, setDisplayedProgress] = useState(clampedProgress);
    const [displayedLabel, setDisplayedLabel] = useState(nextLabel);

    useEffect(() => {
        if (!animated) return;

        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        if (freezeWhile || (displayedProgress === clampedProgress && displayedLabel === nextLabel)) {
            return () => {
                if (settleTimerRef.current) {
                    clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
            };
        }

        settleTimerRef.current = setTimeout(() => {
            setDisplayedProgress(clampedProgress);
            setDisplayedLabel(nextLabel);
            settleTimerRef.current = null;
        }, settleMs);

        return () => {
            if (settleTimerRef.current) {
                clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, [animated, clampedProgress, displayedLabel, displayedProgress, freezeWhile, nextLabel, settleMs]);

    useEffect(() => {
        if (!animated) return;
        Animated.timing(progressAnim, {
            toValue: displayedProgress,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [animated, displayedProgress, progressAnim]);

    const handleLayout = (event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
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

    const resolvedProgress = animated ? displayedProgress : clampedProgress;
    const resolvedLabel = animated ? displayedLabel : nextLabel;
    const resolvedWidth = width > 0 ? (resolvedProgress / 100) * width : 0;

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
                    style={{ width: resolvedWidth }}
                >
                    <View className="absolute inset-0">
                        {innerBarContent}
                    </View>

                    {resolvedLabel.length > 0 && width > 0 && (
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
                    width: progressAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: [0, width || 0],
                        extrapolate: 'clamp',
                    }),
                }}
            >
                <View className="absolute inset-0">
                    {innerBarContent}
                </View>

                {resolvedLabel.length > 0 && width > 0 && (
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
