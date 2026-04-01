import React, { useCallback } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 15, stiffness: 300, mass: 0.4 };

interface PressableScaleProps extends PressableProps {
    /** Scale when pressed (default 0.96) */
    activeScale?: number;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export function PressableScale({
    activeScale = 0.96,
    style,
    children,
    onPressIn,
    onPressOut,
    ...rest
}: PressableScaleProps) {
    const scale = useSharedValue(1);

    const handlePressIn = useCallback((e: any) => {
        scale.value = withSpring(activeScale, PRESS_SPRING);
        onPressIn?.(e);
    }, [activeScale, onPressIn, scale]);

    const handlePressOut = useCallback((e: any) => {
        scale.value = withSpring(1, PRESS_SPRING);
        onPressOut?.(e);
    }, [onPressOut, scale]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <AnimatedPressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[animStyle, style]}
            {...rest}
        >
            {children}
        </AnimatedPressable>
    );
}
