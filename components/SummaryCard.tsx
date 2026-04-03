import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { AnimatedValueText } from './AnimatedValueText';
import { GlassView } from './GlassView';
import { ProgressBar } from './ProgressBar';

interface SummaryCardProps {
    spentAmount: number;
    totalAmount: number;
}

export const SummaryCard = React.memo(({ spentAmount, totalAmount }: SummaryCardProps) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';
    const router = useRouter();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const animateScale = (toValue: number) => {
        Animated.spring(scaleAnim, {
            toValue,
            useNativeDriver: true,
            friction: 8,
            tension: 40,
        }).start();
    };

    const percentage = useMemo(() => {
        if (totalAmount === 0) return 0;
        return Math.min(Math.round((spentAmount / totalAmount) * 100), 100);
    }, [spentAmount, totalAmount]);

    const isOverBudget = spentAmount > totalAmount;

    return (
        <Animated.View
            style={{ transform: [{ scale: scaleAnim }] }}
            onPointerEnter={() => animateScale(1.02)}
            onPointerLeave={() => animateScale(1)}
        >
            <TouchableOpacity
                activeOpacity={1}
                onPressIn={() => animateScale(1.02)}
                onPressOut={() => animateScale(1)}
                onPress={() => router.push('/analysis')}
            >
                <GlassView
                    style={[styles.container, isDark && { shadowColor: '#000' }]}
                    intensity={isDark ? 50 : 80}
                    borderRadius={32}
                    borderColor={isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(255, 255, 255, 0.4)'}
                    backgroundColor={isDark ? 'rgba(40, 44, 38, 0.8)' : 'rgba(255, 255, 255, 0.6)'}
                >
                    <View className="p-6 w-full">
                        <Text className={`text-[10px] font-black mb-3 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]'}`}>
                            Your Spending
                        </Text>

                        <View className="flex-row items-end justify-between mb-5">
                            <View className="flex-row items-baseline">
                                <AnimatedValueText
                                    text={`P${spentAmount.toLocaleString()}`}
                                    style={{ fontSize: 36, fontWeight: '900', lineHeight: 36, color: isDark ? '#F2F0E8' : '#111827' }}
                                />
                                <AnimatedValueText
                                    text={` / P${totalAmount.toLocaleString()}`}
                                    style={{ fontSize: 14, fontWeight: '700', marginLeft: 6, opacity: 0.8, color: isDark ? '#9EB294' : '#9CA3AF' }}
                                />
                            </View>
                            <View
                                className="px-2 py-1 rounded-lg"
                                style={{ backgroundColor: isOverBudget ? 'rgba(239, 68, 68, 0.1)' : 'rgba(158, 178, 148, 0.1)' }}
                            >
                                <AnimatedValueText
                                    text={`${percentage}%`}
                                    style={{ fontSize: 12, fontWeight: '900', color: isOverBudget ? '#ef4444' : '#9EB294' }}
                                />
                            </View>
                        </View>

                        <ProgressBar
                            progress={percentage}
                            color={isOverBudget ? '#ef4444' : (isDark ? '#B2C4AA' : '#9EB294')}
                            trackColor={isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(255, 255, 255, 0.4)'}
                        />

                        <View
                            className={`mt-6 flex-row items-center justify-center py-3.5 rounded-2xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white/30 border-white/50'}`}
                        >
                            <Text style={{ color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: '900', fontSize: 13, marginRight: 8, letterSpacing: -0.3 }}>
                                VIEW BUDGET ANALYSIS
                            </Text>
                            <Feather name="trending-up" size={16} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                    </View>
                </GlassView>
            </TouchableOpacity>
        </Animated.View>
    );
});

SummaryCard.displayName = 'SummaryCard';

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 24,
        marginTop: 16,
        marginBottom: 24,
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.12,
        shadowRadius: 25,
        elevation: 8,
    },
});
