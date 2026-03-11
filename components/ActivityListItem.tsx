import { Activity } from '@/src/types/models';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { getCategoryTheme } from '../src/constants/categories';
import { useStore } from '../src/store/useStore';
import { ActivitySummaryModal } from './ActivitySummaryModal';
import { GlassView } from './GlassView';
import { ProgressBar } from './ProgressBar';

interface ActivityListItemProps {
    activity: Activity;
    onPress?: (activity: Activity) => void;
    onDelete?: (activity: Activity) => void;
    onEdit?: (activity: Activity) => void;
    onToggleComplete?: () => void;
}

const MAX_SWIPE_RIGHT = 110;
const MAX_SWIPE_LEFT = 110;
const ACTION_TRIGGER = 80;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

export const ActivityListItem = React.memo(({
    activity,
    onPress,
    onDelete,
    onEdit,
    onToggleComplete,
}: ActivityListItemProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const [isSummaryVisible, setIsSummaryVisible] = useState(false);

    const totalSpent = useMemo(() =>
        (activity.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0),
        [activity.expenses]
    );
    const allocatedBudget = activity.allocatedBudget || 0;
    const spendPercentage = allocatedBudget > 0
        ? Math.round((totalSpent / allocatedBudget) * 100)
        : 0;
    const variance = Math.abs(allocatedBudget - totalSpent);
    const isOverBudget = totalSpent > allocatedBudget;

    const dateString = new Date(activity.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeString = activity.time
        ? new Date(activity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '--:--';

    const translateX = useSharedValue(0);
    const hapticFiredRight = useSharedValue(false);
    const hapticFiredLeft = useSharedValue(false);

    const triggerHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const triggerDelete = () => onDelete?.(activity);
    const triggerEdit = () => onEdit?.(activity);

    const pan = Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onUpdate((e) => {
            const clamped = Math.max(-MAX_SWIPE_RIGHT, Math.min(activity.isCompleted ? 0 : MAX_SWIPE_LEFT, e.translationX));
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
        const shadowRadius = interpolate(Math.abs(translateX.value), [0, MAX_SWIPE_RIGHT], [20, 30]);
        const shadowOpacity = interpolate(Math.abs(translateX.value), [0, MAX_SWIPE_RIGHT], [0.06, 0.14]);
        return { shadowRadius, shadowOpacity };
    });

    const deleteOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [-ACTION_TRIGGER, 0], [1, 0], 'clamp'),
    }));

    const editOverlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, ACTION_TRIGGER], [0, 1], 'clamp'),
    }));


    const deleteIconStyle = useAnimatedStyle(() => {
        const scale = interpolate(Math.abs(translateX.value), [0, ACTION_TRIGGER, MAX_SWIPE_RIGHT], [0.5, 0.85, 1], 'clamp');
        const opacity = interpolate(Math.abs(translateX.value), [0, ACTION_TRIGGER / 2, ACTION_TRIGGER], [0, 0, 1], 'clamp');
        return { transform: [{ scale }], opacity };
    });

    const editIconStyle = useAnimatedStyle(() => {
        const scale = interpolate(translateX.value, [0, ACTION_TRIGGER, MAX_SWIPE_LEFT], [0.5, 0.85, 1], 'clamp');
        const opacity = interpolate(translateX.value, [0, ACTION_TRIGGER / 2, ACTION_TRIGGER], [0, 0, 1], 'clamp');
        return { transform: [{ scale }], opacity };
    });

    return (
        <View style={styles.rootWrapper}>
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.cardWrapper, cardAnimStyle, shadowAnimStyle]}>
                    <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => {
                            if (activity.expenses.length > 0) setIsSummaryVisible(true);
                            else onPress?.(activity);
                        }}
                        onLongPress={() => setIsSummaryVisible(true)}
                    >
                        <GlassView
                            intensity={isDark ? 50 : 40}
                            borderRadius={28}
                            backgroundColor={activity.isCompleted 
                                ? (isDark ? "rgba(30, 34, 28, 0.5)" : "rgba(220, 220, 220, 0.85)")
                                : (isDark ? "rgba(60, 68, 56, 0.8)" : "rgba(255, 255, 255, 0.75)")
                            }
                        >
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
                            {!activity.isCompleted && (
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


                            {activity.isCompleted && (
                                <View style={styles.backgroundIconContainer} pointerEvents="none">
                                    <Feather
                                        name={isOverBudget ? "alert-circle" : "check-circle"}
                                        size={160}
                                        color={isOverBudget 
                                            ? (isDark ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.15)")
                                            : (isDark ? "rgba(158, 178, 148, 0.08)" : "rgba(93, 109, 84, 0.15)")
                                        }
                                    />
                                </View>
                            )}

                            {/* Content — zIndex: 10 keeps it above gradients */}
                            <View style={styles.cardPadding}>
                                <View style={styles.header}>
                                    <View style={styles.headerLeft}>
                                        <View style={[styles.iconBox, { backgroundColor: getCategoryTheme(activity.category).bg, opacity: isDark ? 0.9 : 1 }]}>
                                            <Feather name={getCategoryTheme(activity.category).icon as any} size={22} color={getCategoryTheme(activity.category).color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.title, isDark && { color: '#F2F0E8' }]} numberOfLines={1}>{activity.title.toUpperCase()}</Text>
                                            <Text style={[styles.subtitle, isDark && { color: '#9EB294' }]}>{dateString} • {timeString}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.headerRight}>
                                        <Text style={[styles.statusLabel, { color: isOverBudget ? '#ef4444' : (isDark ? '#9EB294' : '#5D6D54') }]}>
                                            {isOverBudget ? 'EXCEEDED BY' : 'SAVED'}
                                        </Text>
                                        <Text style={[styles.statusAmount, { color: isOverBudget ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54') }]}>
                                            ₱{variance.toLocaleString()}
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ 
                                    backgroundColor: isOverBudget 
                                        ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2') 
                                        : (isDark ? 'rgba(158, 178, 148, 0.1)' : '#f1f5f1'), 
                                    borderRadius: 12, 
                                    marginTop: 4 
                                }}>
                                    <ProgressBar
                                        progress={Math.min(spendPercentage, 100)}
                                        color={isOverBudget ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54')}
                                        trackColor="transparent"
                                        height={24}
                                        fontSize={11}
                                        floatingLabel={`₱${totalSpent.toLocaleString()} / ₱${allocatedBudget.toLocaleString()} (${spendPercentage}%)`}
                                    />
                                </View>
                            </View>
                        </GlassView>
                    </TouchableOpacity>
                </Animated.View>
            </GestureDetector>

            <ActivitySummaryModal
                isVisible={isSummaryVisible}
                activity={activity}
                onClose={() => setIsSummaryVisible(false)}
                onDelete={() => { setIsSummaryVisible(false); onDelete?.(activity); }}
                onEdit={() => { setIsSummaryVisible(false); onEdit?.(activity); }}
                onToggleComplete={() => { onToggleComplete?.(); }}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    rootWrapper: { marginBottom: 12, marginHorizontal: 24 },
    cardWrapper: {
        borderRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 6,
    },
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
    // zIndex: 10 ensures content always renders above the gradient layers
    cardPadding: { padding: 20, zIndex: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    title: { fontSize: 16, fontWeight: '900', color: '#111827', flex: 1 },
    subtitle: { fontSize: 10, fontWeight: '700', color: '#6b7280', marginTop: 2, opacity: 0.8 },
    headerRight: { alignItems: 'flex-end' },
    statusLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginBottom: 1 },
    statusAmount: { fontSize: 12, fontWeight: '900' },
    backgroundIconContainer: { position: 'absolute', right: -25, top: -62, width: 180, zIndex: 0 },
});
