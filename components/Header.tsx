import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useStore } from '@/src/store/useStore';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
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
    bottomElement?: React.ReactNode; 
    showThemeToggle?: boolean;
}

export const Header = React.memo(({ 
    title, 
    subtitle, 
    showBack = true, 
    onBack, 
    showMenu = false, 
    onMenuPress, 
    rightElement, 
    leftElement, 
    bottomElement,
    showThemeToggle = true,
}: HeaderProps) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme, toggleTheme } = useStore();

    const isDark = theme === 'dark';

    return (
        <View style={[styles.container, styles.containerRounded, { paddingTop: insets.top }]}>
            {/* Glass blur background */}
            {Platform.OS === 'ios' ? (
                <BlurView 
                    intensity={70} 
                    tint={isDark ? "dark" : "light"} 
                    style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }]} 
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }, { backgroundColor: isDark ? 'rgba(26, 28, 24, 0.95)' : 'rgba(255, 255, 255, 0.92)' }]} />
            )}
            {/* Subtle top highlight */}
            <View style={styles.highlight} />

            {/* Main Header Row */}
            <View style={styles.interactionRow}>
                <View style={styles.sideBtnContainer}>
                    {leftElement ? (
                        leftElement
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
                            style={styles.backBtnInner}
                        >
                            <Feather name="chevron-left" size={28} color={isDark ? "#9EB294" : "#4b5563"} />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.centerSection}>
                    <Text 
                        style={[styles.title, isDark && { color: '#F2F0E8' }]} 
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                    >
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={styles.subtitle}>{subtitle}</Text>
                    ) : null}
                </View>

                <View style={styles.rightBtnContainer}>
                    {rightElement ? (
                        rightElement
                    ) : showThemeToggle ? (
                        <TouchableOpacity 
                            onPress={toggleTheme} 
                            activeOpacity={0.7}
                            style={[
                                styles.themeToggle,
                                { backgroundColor: isDark ? '#3A3F37' : '#F2F0E8' }
                            ]}
                        >
                            <Feather 
                                name={isDark ? "sun" : "moon"} 
                                size={18} 
                                color={isDark ? "#E9E4BF" : "#5D6D54"} 
                            />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Tier 3: Bottom Notch */}
            {bottomElement && (
                <View style={{ alignItems: 'center' }}>
                    {bottomElement}
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        zIndex: 10,
        backgroundColor: 'transparent',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 4,
    },
    containerRounded: {
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    highlight: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.6)',
        zIndex: 1,
    },
    interactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 8, // Compact bottom padding
    },
    sideBtnContainer: {
        minWidth: 50,
        minHeight: 60,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    rightBtnContainer: {
        minWidth: 50,
        minHeight: 60,
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingRight: 4,
    },
    centerSection: {
        flex: 1,
        minHeight: 60,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    backBtnInner: {
        padding: 8,
    },
    themeToggle: {
        width: 40, 
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(158, 178, 148, 0.12)',
    },
    title: {
        fontSize: 18, // Increased for legibility
        fontWeight: '900',
        color: '#111827',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginRight: -0.5,
    },
    subtitle: {
        fontSize: 10, // Compact
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9EB294',
        marginTop: 0,
        marginRight: -2, // Compensate for letter spacing to ensure true centering
    },
});
