import React, { useRef, useState } from 'react';
import {
    Dimensions, NativeScrollEvent, NativeSyntheticEvent,
    ScrollView, Text, View,
} from 'react-native';
import { GlassView } from '@/components/GlassView';
import { useStore } from '@/src/store/useStore';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { SpendingTotals } from '@/src/hooks/useSpendingTotals';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;

interface Props {
    totals: SpendingTotals;
    totalBudget: number;
    currency: string;
}

const VIEWS = [
    { key: 'overall'     as const, label: 'TOTAL SPENT',   hint: 'swipe for planned →' },
    { key: 'planned'     as const, label: 'PLANNED SPENT', hint: '← overall  spontaneous →' },
    { key: 'spontaneous' as const, label: 'SPONTANEOUS',   hint: '← swipe for overall' },
];

export const TotalSpendingCarousel = React.memo(({ totals, totalBudget, currency }: Props) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [activeIndex, setActiveIndex] = useState(0);

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
        setActiveIndex(Math.max(0, Math.min(idx, VIEWS.length - 1)));
    };

    return (
        <View style={{ marginBottom: 4 }}>
            <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                decelerationRate="fast"
                snapToInterval={CARD_WIDTH}
                snapToAlignment="start"
                contentContainerStyle={{ paddingHorizontal: 16 }}
            >
                {VIEWS.map(({ key, label }) => {
                    const amount = totals[key];
                    const pct = totalBudget > 0
                        ? Math.min(Math.round((amount / totalBudget) * 100), 999)
                        : 0;
                    const isOver = amount > totalBudget && totalBudget > 0;

                    return (
                        <GlassView
                            key={key}
                            intensity={isDark ? 50 : 80}
                            borderRadius={24}
                            borderColor={isDark ? 'rgba(158,178,148,0.1)' : 'rgba(255,255,255,0.4)'}
                            backgroundColor={isDark ? 'rgba(40,44,38,0.6)' : 'rgba(255,255,255,0.6)'}
                            style={{ width: CARD_WIDTH - 32, padding: 20, marginRight: 32 }}
                        >
                            <Text style={{
                                fontSize: 9, fontWeight: '900',
                                color: isDark ? '#9EB294' : '#6B7280',
                                letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
                            }}>
                                {label}
                            </Text>
                            <Text
                                style={{
                                    fontSize: 28, fontWeight: '900',
                                    color: isOver ? '#ef4444' : (isDark ? '#F2F0E8' : '#111827'),
                                    marginBottom: 4,
                                }}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                            >
                                {MathUtils.formatCurrency(amount, currency)}
                            </Text>
                            {totalBudget > 0 && (
                                <Text style={{
                                    fontSize: 10, fontWeight: '700',
                                    color: isOver
                                        ? '#ef4444'
                                        : (isDark ? '#9EB294' : '#5D6D54'),
                                }}>
                                    {pct}% OF BUDGET{isOver ? ' — EXCEEDED' : ''}
                                </Text>
                            )}
                        </GlassView>
                    );
                })}
            </ScrollView>

            {/* Dot indicators */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 }}>
                {VIEWS.map((_, i) => (
                    <View
                        key={i}
                        style={{
                            width: activeIndex === i ? 18 : 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: activeIndex === i
                                ? (isDark ? '#B2C4AA' : '#5D6D54')
                                : (isDark ? '#4A5046' : '#D1D5DB'),
                        }}
                    />
                ))}
            </View>
        </View>
    );
});
