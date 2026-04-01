import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MeshBackground } from './MeshBackground';
import { useTheme } from '@/src/hooks/useTheme';

/**
 * Full-screen loading overlay shown during auth → home transition.
 * Matches the app's visual language with fade-in animation.
 */
export const AuthLoadingOverlay = ({ message = 'Preparing your trips...' }: { message?: string }) => {
    const { isDark } = useTheme();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const dotAnim = useRef(new Animated.Value(0)).current;

    const colors = {
        text: isDark ? '#F2F0E8' : '#1A1C18',
        subtext: isDark ? 'rgba(242,240,232,0.5)' : 'rgba(26,28,24,0.5)',
        accent: isDark ? '#B2C4AA' : '#5D6D54',
    };

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 60,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();

        // Pulsing dot animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(dotAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(dotAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [dotAnim, fadeAnim, scaleAnim]);

    return (
        <MeshBackground style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
                    <Ionicons name="wallet-outline" size={32} color="#fff" />
                </View>
                <Text style={[styles.appName, { color: colors.text }]}>Aliqual</Text>
                <View style={styles.loadingRow}>
                    {[0, 1, 2].map(i => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.dot,
                                { backgroundColor: colors.accent },
                                {
                                    opacity: dotAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.3, 1],
                                    }),
                                    transform: [{
                                        scale: dotAnim.interpolate({
                                            inputRange: [0, 0.5, 1],
                                            outputRange: i === 1 ? [0.8, 1.2, 0.8] : [1, 0.8, 1],
                                        }),
                                    }],
                                },
                            ]}
                        />
                    ))}
                </View>
                <Text style={[styles.message, { color: colors.subtext }]}>{message}</Text>
            </Animated.View>
        </MeshBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    logoCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    appName: {
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: -0.5,
        marginBottom: 24,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    message: {
        fontSize: 14,
        fontWeight: '500',
    },
});
