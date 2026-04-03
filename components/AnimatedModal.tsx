import React, { useEffect, useCallback } from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
    runOnJS,
    Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useStore } from '@/src/store/useStore';

const { height: SCREEN_H } = Dimensions.get('window');

const SPRING_IN = { damping: 18, stiffness: 180, mass: 0.8 };

interface AnimatedModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Where the modal slides/scales from */
    origin?: 'center' | 'bottom';
    /** Dismiss on backdrop tap (default true) */
    dismissable?: boolean;
    /** Shift the modal above the software keyboard when inputs focus. */
    keyboardAware?: boolean;
    keyboardVerticalOffset?: number;
}

export function AnimatedModal({
    visible,
    onClose,
    children,
    origin = 'center',
    dismissable = true,
    keyboardAware = false,
    keyboardVerticalOffset = 24,
}: AnimatedModalProps) {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    // 0 = hidden, 1 = fully visible
    const progress = useSharedValue(0);
    const [modalVisible, setModalVisible] = React.useState(visible);

    const openModal = useCallback(() => {
        setModalVisible(true);
        progress.value = withSpring(1, SPRING_IN);
    }, [progress]);

    const closeModal = useCallback(() => {
        progress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }, (fin) => {
            if (fin) runOnJS(setModalVisible)(false);
        });
    }, [progress]);

    useEffect(() => {
        if (visible) openModal();
        else if (modalVisible) closeModal();
    }, [closeModal, modalVisible, openModal, visible]);

    const isBottom = origin === 'bottom';

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0, 1]),
    }));

    const contentStyle = useAnimatedStyle(() => {
        if (origin === 'bottom') {
            return {
                opacity: interpolate(progress.value, [0, 0.3, 1], [0, 1, 1]),
                transform: [
                    { translateY: interpolate(progress.value, [0, 1], [SCREEN_H * 0.15, 0]) },
                    { scale: interpolate(progress.value, [0, 1], [0.92, 1]) },
                ],
            };
        }
        // center origin — scale + subtle curve
        return {
            opacity: interpolate(progress.value, [0, 0.4, 1], [0, 1, 1]),
            transform: [
                { scale: interpolate(progress.value, [0, 1], [0.82, 1]) },
                { translateY: interpolate(progress.value, [0, 1], [30, 0]) },
            ],
        };
    });

    if (!modalVisible && !visible) return null;

    const modalContent = (
        <TouchableOpacity
            style={[styles.fill, isBottom && styles.fillBottom]}
            activeOpacity={1}
            onPress={dismissable ? onClose : undefined}
        >
            <Animated.View style={[styles.contentWrap, isBottom && styles.contentWrapBottom, contentStyle]} pointerEvents="box-none">
                <TouchableOpacity activeOpacity={1} onPress={() => {}} style={isBottom ? { flex: 1 } : undefined}>
                    {children}
                </TouchableOpacity>
            </Animated.View>
        </TouchableOpacity>
    );

    return (
        <Modal visible={modalVisible} transparent statusBarTranslucent onRequestClose={onClose}>
            {/* Backdrop */}
            <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
                <BlurView
                    intensity={isDark ? 60 : 40}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
            </Animated.View>

            {keyboardAware ? (
                <KeyboardAvoidingView
                    style={styles.keyboardAvoider}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={keyboardVerticalOffset}
                    pointerEvents="box-none"
                >
                    {modalContent}
                </KeyboardAvoidingView>
            ) : modalContent}
        </Modal>
    );
}

/**
 * Animated wrapper for transitioning between steps inside a modal.
 * Wraps the content that changes between steps with a smooth crossfade + slide.
 */
interface StepTransitionProps {
    stepKey: string | number;
    direction?: 'forward' | 'backward';
    children: React.ReactNode;
}

export function StepTransition({ stepKey, direction = 'forward', children }: StepTransitionProps) {
    const opacity = useSharedValue(0);
    const translateX = useSharedValue(direction === 'forward' ? 40 : -40);

    useEffect(() => {
        // Reset for new step
        opacity.value = 0;
        translateX.value = direction === 'forward' ? 40 : -40;

        // Animate in
        opacity.value = withSpring(1, { damping: 20, stiffness: 200, mass: 0.6 });
        translateX.value = withSpring(0, { damping: 20, stiffness: 200, mass: 0.6 });
    }, [direction, opacity, stepKey, translateX]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }],
    }));

    return <Animated.View style={animStyle}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    fillBottom: {
        justifyContent: 'flex-end',
        alignItems: 'stretch',
        paddingHorizontal: 0,
    },
    contentWrap: {
        width: '100%',
        maxWidth: 440,
    },
    contentWrapBottom: {
        flex: 1,
        maxWidth: undefined,
    },
    keyboardAvoider: {
        flex: 1,
    },
});
