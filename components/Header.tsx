import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useStore } from '@/src/store/useStore';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    showMenu?: boolean;
    onMenuPress?: () => void;
    rightElement?: React.ReactNode;
    leftElement?: React.ReactNode;
}

export const Header = React.memo(({ title, subtitle, showBack = true, onBack, showMenu = false, onMenuPress, rightElement, leftElement }: HeaderProps) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme, toggleTheme } = useStore();

    const isDark = theme === 'dark';

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Glass blur background */}
            {Platform.OS === 'ios' ? (
                <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(26, 28, 24, 0.95)' : 'rgba(255, 255, 255, 0.92)' }]} />
            )}
            {/* Subtle top highlight */}
            <View style={styles.highlight} />

            <View style={styles.row}>
                {leftElement ? (
                    <View style={styles.backBtn}>
                        {leftElement}
                    </View>
                ) : showBack && (
                    <TouchableOpacity
                        onPress={() => {
                            if (onBack) {
                                onBack();
                            } else {
                                try {
                                    router.back();
                                } catch (e) {
                                    console.warn('Navigation not ready');
                                }
                            }
                        }}
                        style={styles.backBtn}
                    >
                        <Feather name="chevron-left" size={28} color={isDark ? "#9EB294" : "#4b5563"} />
                    </TouchableOpacity>
                )}

                <View style={styles.titleArea}>
                    <Text style={[styles.title, isDark && { color: '#F2F0E8' }]} numberOfLines={1}>{title}</Text>
                    {subtitle && (
                        <Text style={[styles.subtitle, isDark && { color: '#9EB294', opacity: 0.8 }]}>{subtitle}</Text>
                    )}
                </View>

                {rightElement ? (
                    <View style={styles.menuBtn}>
                        {rightElement}
                    </View>
                ) : (
                    <TouchableOpacity onPress={toggleTheme} style={styles.menuBtn}>
                        <Feather name={isDark ? "sun" : "moon"} size={22} color={isDark ? "#E9E4BF" : "#5D6D54"} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        zIndex: 10,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 4,
    },
    highlight: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.6)',
        zIndex: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingBottom: 20,
        minHeight: 60,
        position: 'relative',
    },
    backBtn: {
        padding: 8,
        position: 'absolute',
        left: 16,
        zIndex: 20,
    },
    menuBtn: {
        padding: 8,
        position: 'absolute',
        right: 16,
        zIndex: 20,
    },
    titleArea: {
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111827',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        textShadowColor: 'rgba(93, 109, 84, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    subtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9EB294',
        marginTop: 1,
    },
});
