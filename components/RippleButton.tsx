import React, { useCallback } from 'react';
import { Pressable, ViewStyle, StyleProp, StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    interpolate,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 14, stiffness: 280, mass: 0.5 };

interface RippleButtonProps {
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
    disabled?: boolean;
    /** Glow color (default: rgba(158, 178, 148, 0.4)) */
    glowColor?: string;
    /** Ripple color (default: rgba(255,255,255,0.25)) */
    rippleColor?: string;
    /** Enable haptic feedback (default: true) */
    haptic?: boolean;
}

export function RippleButton({
    onPress,
    style,
    children,
    disabled = false,
    glowColor = 'rgba(158, 178, 148, 0.4)',
    rippleColor = 'rgba(255,255,255,0.25)',
    haptic = true,
}: RippleButtonProps) {
    const scale = useSharedValue(1);
    const rippleProgress = useSharedValue(0);
    const glowOpacity = useSharedValue(0);

    const handlePressIn = useCallback(() => {
        scale.value = withSpring(0.95, PRESS_SPRING);
        glowOpacity.value = withTiming(1, { duration: 150 });
    }, []);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, PRESS_SPRING);
        glowOpacity.value = withTiming(0, { duration: 400 });
    }, []);

    const handlePress = useCallback(() => {
        if (disabled) return;
        // Trigger ripple
        rippleProgress.value = 0;
        rippleProgress.value = withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.quad),
        });
        // Pulse scale for satisfying feedback
        scale.value = withSequence(
            withSpring(0.93, { damping: 10, stiffness: 400, mass: 0.3 }),
            withSpring(1, { damping: 12, stiffness: 200, mass: 0.5 }),
        );
        if (haptic) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
    }, [disabled, onPress, haptic]);

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const rippleStyle = useAnimatedStyle(() => ({
        opacity: interpolate(rippleProgress.value, [0, 0.1, 1], [0, 0.45, 0]),
        transform: [{ scale: interpolate(rippleProgress.value, [0, 1], [0, 2.2]) }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value * 0.5,
    }));

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            disabled={disabled}
            style={[containerStyle, style, { overflow: 'hidden' }]}
        >
            {/* Glow layer — fills button shape, no borderRadius so it doesn't shrink to a circle */}
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: glowColor,
                    },
                    glowStyle,
                ]}
                pointerEvents="none"
            />

            {/* Ripple layer */}
            <Animated.View
                style={[
                    {
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 200,
                        height: 200,
                        marginLeft: -100,
                        marginTop: -100,
                        borderRadius: 100,
                        backgroundColor: rippleColor,
                    },
                    rippleStyle,
                ]}
                pointerEvents="none"
            />

            {/* Content */}
            {children}
        </AnimatedPressable>
    );
}
