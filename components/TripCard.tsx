import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { getFlagUrl } from '../src/data/countryMapping';
import { useStore } from '../src/store/useStore';
import { Calculations as MathUtils } from '../src/utils/mathUtils';
import { GlassView } from './GlassView';
import { ProgressBar } from './ProgressBar';

interface TripCardProps {
    id: string;
    title: string;
    countries?: string[];
    startDate: number;
    endDate: number;
    budget: number;
    spent: number;
    balance?: string;
    balanceDetail?: string;
    tripCurrency?: string;
    isCompleted?: boolean;
    onPress: () => void;
    onLongPress?: () => void;
    onDelete?: (id: string) => void;
    onEdit?: (id: string) => void;
}

const MAX_SWIPE = 110;
const ACTION_TRIGGER = 80;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

export const TripCard = React.memo(({ id, title, countries = [], startDate, endDate, budget, spent, balance, balanceDetail, tripCurrency = 'PHP', isCompleted = false, onPress, onLongPress, onDelete, onEdit }: TripCardProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateRange = `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const percentage = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;

    const translateX = useSharedValue(0);
    const hapticFiredRight = useSharedValue(false);
    const hapticFiredLeft = useSharedValue(false);

    const triggerHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const triggerDelete = () => onDelete?.(id);
    const triggerEdit = () => onEdit?.(id);

    const pan = Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onUpdate((e) => {
            const clamped = Math.max(-MAX_SWIPE, Math.min(isCompleted ? 0 : MAX_SWIPE, e.translationX));
            translateX.value = clamped;

            if (clamped < -ACTION_TRIGGER && !hapticFiredRight.value) {
                hapticFiredRight.value = true;
                runOnJS(triggerHaptic)();
            }
            if (clamped > -ACTION_TRIGGER && hapticFiredRight.value) {
                hapticFiredRight.value = false;
            }
            if (clamped > ACTION_TRIGGER && !hapticFiredLeft.value) {
                hapticFiredLeft.value = true;
                runOnJS(triggerHaptic)();
            }
            if (clamped < ACTION_TRIGGER && hapticFiredLeft.value) {
                hapticFiredLeft.value = false;
            }
        })
        .onEnd(() => {
            if (translateX.value < -ACTION_TRIGGER) {
                translateX.value = withSpring(0, SPRING_CONFIG);
                runOnJS(triggerDelete)();
            } else if (translateX.value > ACTION_TRIGGER) {
                translateX.value = withSpring(0, SPRING_CONFIG);
                runOnJS(triggerEdit)();
            } else {
                translateX.value = withSpring(0, SPRING_CONFIG);
            }
        });

    const cardAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const shadowAnimStyle = useAnimatedStyle(() => {
        const shadowRadius = interpolate(Math.abs(translateX.value), [0, MAX_SWIPE], [20, 30]);
        const shadowOpacity = interpolate(Math.abs(translateX.value), [0, MAX_SWIPE], [0.06, 0.14]);
        return { shadowRadius, shadowOpacity };
    });

    const deleteOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-ACTION_TRIGGER, 0], [1, 0], 'clamp'),
    }));

    const editOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, ACTION_TRIGGER], [0, 1], 'clamp'),
    }));

    const deleteIconStyle = useAnimatedStyle(() => {
        const scale = interpolate(Math.abs(translateX.value), [0, ACTION_TRIGGER, MAX_SWIPE], [0.5, 0.85, 1], 'clamp');
        const opacity = interpolate(Math.abs(translateX.value), [0, ACTION_TRIGGER / 2, ACTION_TRIGGER], [0, 0, 1], 'clamp');
        return { transform: [{ scale }], opacity };
    });

    const editIconStyle = useAnimatedStyle(() => {
        const scale = interpolate(translateX.value, [0, ACTION_TRIGGER, MAX_SWIPE], [0.5, 0.85, 1], 'clamp');
        const opacity = interpolate(translateX.value, [0, ACTION_TRIGGER / 2, ACTION_TRIGGER], [0, 0, 1], 'clamp');
        return { transform: [{ scale }], opacity };
    });

    return (
        <View style={styles.rootWrapper}>
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.cardWrapper, cardAnimStyle, shadowAnimStyle]}>
                    <TouchableOpacity 
                        onPress={onPress} 
                        onLongPress={onLongPress}
                        activeOpacity={0.92}
                        delayLongPress={500}
                    >
                        <GlassView
                            intensity={isDark ? 50 : 40}
                            borderRadius={28}
                            backgroundColor={isCompleted 
                                ? (isDark ? "rgba(30, 34, 28, 0.5)" : "rgba(220, 220, 220, 0.85)")
                                : (isDark ? "rgba(60, 68, 56, 0.8)" : "rgba(255, 255, 255, 0.75)")
                            }
                        >
                            {/* Flag overlay */}
                            <View style={styles.flagsOverlay}>
                                {countries.map((country, index) => {
                                    const flagUrl = getFlagUrl(country);
                                    if (!flagUrl) return null;
                                    return (
                                        <Image
                                            key={`${country}-${index}`}
                                            source={{ uri: flagUrl }}
                                            style={styles.flagImage}
                                        />
                                    );
                                })}
                            </View>

                            {/* Delete gradient tint */}
                            <Animated.View style={[StyleSheet.absoluteFillObject, styles.overlayRadius, deleteOverlayStyle]} pointerEvents="none">
                                <LinearGradient
                                    colors={['transparent', 'rgba(239, 68, 68, 0.5)']}
                                    start={{ x: 0.2, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                <Animated.View style={[styles.edgeIcon, styles.edgeIconRight, deleteIconStyle]}>
                                    <Feather name="trash-2" size={22} color="rgba(200,40,40,0.95)" />
                                </Animated.View>
                            </Animated.View>

                            {/* Edit gradient tint */}
                            {!isCompleted && (
                                <Animated.View style={[StyleSheet.absoluteFillObject, styles.overlayRadius, editOverlayStyle]} pointerEvents="none">
                                    <LinearGradient
                                        colors={['rgba(59, 130, 246, 0.5)', 'transparent']}
                                        start={{ x: 0, y: 0.5 }}
                                        end={{ x: 0.8, y: 0.5 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <Animated.View style={[styles.edgeIcon, styles.edgeIconLeft, editIconStyle]}>
                                        <Feather name="edit-2" size={22} color="rgba(37,99,235,0.95)" />
                                    </Animated.View>
                                </Animated.View>
                            )}

                            {isCompleted && (
                                <View style={styles.backgroundIconContainer} pointerEvents="none">
                                    <Feather
                                        name="check-circle"
                                        size={140}
                                        color={isDark ? "rgba(158, 178, 148, 0.08)" : "rgba(93, 109, 84, 0.12)"}
                                    />
                                </View>
                            )}

                            {/* Content */}
                            <View style={styles.cardPadding}>
                                <Text 
                                    style={[styles.title, isDark && { color: '#F2F0E8' }]} 
                                    numberOfLines={2}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {title}
                                </Text>
                                
                                {balance && (
                                    <View style={[styles.balanceBadge, { backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.04)' }]}>
                                        <Text style={[styles.balanceAmount, { color: isDark ? '#B2C4AA' : '#5D6D54' }]}>
                                        {balance}
                                    </Text>
                                        {balanceDetail && (
                                            <Text style={styles.balanceDetail}>
                                                {balanceDetail}
                                            </Text>
                                        )}
                                    </View>
                                )}

                                <View style={styles.dateRow}>
                                    <Feather name="calendar" size={10} color={isDark ? '#9EB294' : '#6b7280'} style={{ marginRight: 4, opacity: 0.7 }} />
                                    <Text style={[styles.dateText, isDark && { color: '#9EB294' }]}>{dateRange}</Text>
                                </View>
 
                                <ProgressBar
                                    progress={percentage}
                                    gradientColors={['#B5C0A2', '#5D6D54']}
                                    trackColor={isDark ? "rgba(158, 178, 148, 0.15)" : "rgba(93, 109, 84, 0.12)"}
                                    height={32}
                                    fontSize={13}
                                    showPercentage={false}
                                    floatingLabel={`${MathUtils.formatCurrency(spent, tripCurrency)} / ${MathUtils.formatCurrency(budget, tripCurrency)} (${percentage}%)`}
                                />
                            </View>
                        </GlassView>
                    </TouchableOpacity>
                </Animated.View>
            </GestureDetector>
        </View>
    );
});

const styles = StyleSheet.create({
    rootWrapper: { marginBottom: 16 },
    cardWrapper: {
        borderRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 6,
    },
    flagsOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', opacity: 0.05 },
    flagImage: { flex: 1, height: '100%', resizeMode: 'cover' },
    overlayRadius: { borderRadius: 28 },
    edgeIcon: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    edgeIconRight: { right: 0 },
    edgeIconLeft: { left: 0 },
    cardPadding: {
        paddingHorizontal: 20,
        paddingVertical: 18,
        zIndex: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111827',
        textTransform: 'uppercase',
        lineHeight: 22,
        textAlign: 'left',
        marginBottom: 4,
    },
    balanceBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(158, 178, 148, 0.2)',
        marginBottom: 12,
    },
    balanceAmount: {
        fontSize: 17,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    balanceDetail: {
        fontSize: 9,
        fontWeight: '800',
        color: '#9EB294',
        textTransform: 'uppercase',
        marginTop: -1,
        letterSpacing: 0.5,
        opacity: 0.8,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    dateText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#6b7280',
        textTransform: 'uppercase',
        opacity: 0.7,
        textAlign: 'left',
    },
    backgroundIconContainer: { position: 'absolute', right: -15, top: -45, width: 150, zIndex: 0, opacity: 0.8 },
});
