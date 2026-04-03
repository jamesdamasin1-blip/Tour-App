import { GlassView } from '@/components/GlassView';
import { Calculations } from '@/src/utils/mathUtils';
import { CATEGORY_THEME } from '@/src/constants/categories';
import { ExpenseCategory } from '@/src/types/models';
import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import Svg, { Circle, G } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export type TotalMode = 'overall' | 'planned' | 'spontaneous';

interface ModeData {
    totalSpent: number;
    categoryData: { color: string; amount: number }[];
}

export interface BudgetComparisonData {
    allotted: number;
    actualSpent: number;
    walletInitial: number;
    walletAdded: number;
    walletTotal: number;
    homeCurrency: string;
    allottedByCategory?: Record<string, number>;
}

interface DonutChartProps {
    totalBudget: number;
    overall: ModeData;
    planned: ModeData;
    spontaneous: ModeData;
    mode: TotalMode;
    onModeChange: (mode: TotalMode) => void;
    budgetComparison?: BudgetComparisonData | null;
}

const TABS: { key: TotalMode; label: string }[] = [
    { key: 'overall',     label: 'OVERALL' },
    { key: 'planned',     label: 'PLANNED' },
    { key: 'spontaneous', label: 'SPONT.' },
];

export const DonutChartCard = React.memo(({ totalBudget, overall, planned, spontaneous, mode, onModeChange, budgetComparison }: DonutChartProps) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';
    const [page, setPage] = useState<0 | 1>(0);

    const swipe = Gesture.Pan()
        .activeOffsetX([-15, 15])
        .onEnd((event: any) => {
            if (event.translationX < -40) runOnJS(setPage)(1);
            else if (event.translationX > 40) runOnJS(setPage)(0);
        });

    const active = mode === 'overall' ? overall : mode === 'planned' ? planned : spontaneous;
    const { totalSpent, categoryData } = active;

    const size = 200;
    const strokeWidth = 25;
    const center = size / 2;
    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;

    const percentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const segments = useMemo(() => {
        let currentOffset = 0;
        return categoryData.map((data) => {
            const segmentPercentage = totalSpent > 0 ? (data.amount / totalSpent) : 0;
            const strokeDasharray = `${circumference * segmentPercentage} ${circumference}`;
            const strokeDashoffset = currentOffset;
            currentOffset -= (circumference * segmentPercentage);
            return { color: data.color, strokeDasharray, strokeDashoffset };
        });
    }, [categoryData, totalSpent, circumference]);

    return (
        <GestureDetector gesture={swipe}>
            <GlassView
                style={styles.container}
                intensity={isDark ? 50 : 80}
                borderRadius={24}
                backgroundColor={isDark ? "rgba(40, 44, 38, 0.45)" : "rgba(255, 255, 255, 0.3)"}
                borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.2)"}
                borderWidth={1}
                hasShadow={true}
                shadowOpacity={isDark ? 0.2 : 0.1}
                shadowRadius={12}
                elevation={5}
            >
                {page === 0 ? (
                    /* ── Page 0: Donut Chart ── */
                    <View className="p-6 items-center w-full">
                        <Text className={`text-xs font-bold uppercase tracking-widest mb-4 ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                            Total Spending
                        </Text>

                        {/* Toggle */}
                        <View style={{
                            flexDirection: 'row', padding: 3, borderRadius: 12, marginBottom: 20, width: '100%',
                            backgroundColor: isDark ? 'rgba(30, 34, 28, 0.6)' : 'rgba(93, 109, 84, 0.08)',
                            borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(93,109,84,0.12)',
                        }}>
                            {TABS.map(({ key, label }) => (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => onModeChange(key)}
                                    style={{
                                        flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center',
                                        backgroundColor: mode === key ? (isDark ? '#B2C4AA' : '#5D6D54') : 'transparent',
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase',
                                        color: mode === key ? (isDark ? '#1A1C18' : 'white') : (isDark ? '#9EB294' : '#5D6D54'),
                                    }}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Donut */}
                        <View className="relative items-center justify-center">
                            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                                <G rotation="-90" origin={`${center}, ${center}`}>
                                    <Circle cx={center} cy={center} r={radius}
                                        stroke={isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6"}
                                        strokeWidth={strokeWidth} fill="transparent"
                                    />
                                    {segments.map((segment, index) => {
                                        const gap = 3;
                                        const parts = segment.strokeDasharray.split(' ');
                                        const segLen = Math.max(0, parseFloat(parts[0]) - gap);
                                        return (
                                            <Circle key={index} cx={center} cy={center} r={radius}
                                                stroke={segment.color} strokeWidth={strokeWidth} fill="transparent"
                                                strokeDasharray={`${segLen} ${parseFloat(parts[1]) + gap}`}
                                                strokeDashoffset={segment.strokeDashoffset}
                                                strokeLinecap="round"
                                            />
                                        );
                                    })}
                                </G>
                            </Svg>
                            <View className="absolute inset-0 items-center justify-center">
                                <Text className={`text-xl font-extrabold ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>
                                    {Calculations.formatCurrency(totalSpent, budgetComparison?.homeCurrency || 'PHP')}
                                </Text>
                                <Text className={`text-[10px] font-semibold ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                                    of {Calculations.formatCurrency(totalBudget, budgetComparison?.homeCurrency || 'PHP')}
                                </Text>
                            </View>
                        </View>

                        <Text className={`text-sm italic mt-6 ${percentage > 100 ? 'text-red-400' : isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                            {percentage > 100
                                ? `Over budget by ${percentage - 100}%`
                                : `You've used ${percentage}% of your trip budget`}
                        </Text>

                        {/* Page indicator */}
                        {budgetComparison && budgetComparison.walletTotal > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }} />
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(158,178,148,0.25)' : 'rgba(93,109,84,0.2)' }} />
                            </View>
                        )}
                    </View>
                ) : (
                    /* ── Page 1: Budget Allocation Bars ── */
                    <View className="p-6 w-full">
                        <Text className={`text-xs font-bold uppercase tracking-widest mb-5 text-center ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                            Budget Allocation
                        </Text>

                        {budgetComparison && budgetComparison.walletTotal > 0 ? (
                            <BudgetBars data={budgetComparison} isDark={isDark} />
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#9EB294' : '#9CA3AF' }}>
                                    No budget data available
                                </Text>
                            </View>
                        )}

                        {/* Page indicator */}
                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(158,178,148,0.25)' : 'rgba(93,109,84,0.2)' }} />
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }} />
                        </View>
                    </View>
                )}
            </GlassView>
        </GestureDetector>
    );
});

DonutChartCard.displayName = 'DonutChartCard';

/* ── Budget Bars Sub-component ── */
const BudgetBars = ({ data, isDark }: { data: BudgetComparisonData; isDark: boolean }) => {
    const { allotted, actualSpent, walletInitial, walletAdded, walletTotal, homeCurrency, allottedByCategory } = data;
    const maxValue = Math.max(allotted, actualSpent, walletTotal, 1);
    const [showAllottedBreakdown, setShowAllottedBreakdown] = useState(false);

    const barColor = (value: number) =>
        value > walletTotal ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54');

    const categoryEntries = useMemo(() => {
        if (!allottedByCategory) return [];
        return Object.entries(allottedByCategory)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
    }, [allottedByCategory]);

    return (
        <View>
            {/* Allotted — tappable */}
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => categoryEntries.length > 0 && setShowAllottedBreakdown(p => !p)}
            >
                <InlineBarRow
                    label="ALLOTTED"
                    sublabel="Planned activity budgets"
                    value={allotted}
                    maxValue={maxValue}
                    color={barColor(allotted)}
                    currency={homeCurrency}
                    isDark={isDark}
                    showChevron={categoryEntries.length > 0}
                    expanded={showAllottedBreakdown}
                />
            </TouchableOpacity>

            {/* Category breakdown for allotted */}
            {showAllottedBreakdown && categoryEntries.length > 0 && (
                <View style={{ marginBottom: 14, marginLeft: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.12)' }}>
                    {categoryEntries.map(([cat, amount]) => {
                        const theme = CATEGORY_THEME[cat as ExpenseCategory] || CATEGORY_THEME.Other;
                        const pct = allotted > 0 ? Math.round((amount / allotted) * 100) : 0;
                        const fillWidth = Math.min(pct, 100);
                        const formatted = `${Calculations.formatCurrency(amount, homeCurrency)} (${pct}%)`;
                        return (
                            <View key={cat} style={{ marginBottom: 10 }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 0.3, marginBottom: 3 }}>
                                    {cat.toUpperCase()}
                                </Text>
                                <View style={{ height: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: isDark ? 'rgba(158,178,148,0.06)' : 'rgba(158,178,148,0.1)' }}>
                                    <View style={{ height: '100%', borderRadius: 11, width: `${fillWidth}%`, backgroundColor: theme.color, opacity: 0.8, justifyContent: 'center' }}>
                                        {fillWidth > 30 && (
                                            <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff', paddingHorizontal: 8 }} numberOfLines={1}>
                                                {formatted}
                                            </Text>
                                        )}
                                    </View>
                                    {fillWidth <= 30 && (
                                        <View style={{ position: 'absolute', top: 0, bottom: 0, right: 8, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 8, fontWeight: '900', color: isDark ? '#9EB294' : '#6B7280' }} numberOfLines={1}>
                                                {formatted}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}

            {/* Actually Spent */}
            <InlineBarRow
                label="ACTUALLY SPENT"
                sublabel="Planned + spontaneous"
                value={actualSpent}
                maxValue={maxValue}
                color={barColor(actualSpent)}
                currency={homeCurrency}
                isDark={isDark}
            />

            {/* Wallet (stacked) */}
            <View style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View>
                            <Text style={{ fontSize: 10, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 0.5 }}>
                                WALLET
                            </Text>
                            <Text style={{ fontSize: 8, fontWeight: '600', color: isDark ? '#9EB294' : '#9CA3AF', marginTop: 1 }}>
                                Initial + added funds
                            </Text>
                        </View>
                    </View>
                </View>
                <View style={{
                    height: 26, borderRadius: 13, overflow: 'hidden', flexDirection: 'row',
                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(158, 178, 148, 0.12)',
                }}>
                    <View style={{
                        height: '100%',
                        width: `${Math.min((walletInitial / maxValue) * 100, 100)}%`,
                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.45)' : 'rgba(93, 109, 84, 0.35)',
                        borderTopLeftRadius: 13, borderBottomLeftRadius: 13,
                        justifyContent: 'center',
                    }}>
                        {/* Amount inside the wallet bar */}
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff', paddingHorizontal: 10 }} numberOfLines={1}>
                            {Calculations.formatCurrency(walletTotal, homeCurrency)}
                        </Text>
                    </View>
                    {walletAdded > 0 && (
                        <View style={{
                            height: '100%',
                            width: `${Math.min((walletAdded / maxValue) * 100, 100)}%`,
                            backgroundColor: isDark ? 'rgba(158, 178, 148, 0.22)' : 'rgba(93, 109, 84, 0.18)',
                            borderTopRightRadius: 13, borderBottomRightRadius: 13,
                        }} />
                    )}
                </View>
            </View>

            {/* Legend */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 14 }}>
                <LegendDot color={isDark ? 'rgba(158,178,148,0.45)' : 'rgba(93,109,84,0.35)'} label="INITIAL" isDark={isDark} />
                {walletAdded > 0 && (
                    <LegendDot color={isDark ? 'rgba(158,178,148,0.22)' : 'rgba(93,109,84,0.18)'} label="ADDED" isDark={isDark} />
                )}
            </View>
        </View>
    );
};

/** Bar with label above and value rendered INSIDE the filled portion */
const InlineBarRow = ({ label, sublabel, value, maxValue, color, currency, isDark, showChevron, expanded }: {
    label: string; sublabel: string; value: number; maxValue: number;
    color: string; currency: string; isDark: boolean; showChevron?: boolean; expanded?: boolean;
}) => {
    const fillPct = Math.min((value / maxValue) * 100, 100);
    const formatted = Calculations.formatCurrency(value, currency);
    // If the bar is wide enough, render text inside; otherwise render outside
    const textFitsInside = fillPct > 35;

    return (
        <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 0.5 }}>
                            {label}
                        </Text>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: isDark ? '#9EB294' : '#9CA3AF', marginTop: 1 }}>
                            {sublabel}
                        </Text>
                    </View>
                    {showChevron && (
                        <Feather
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={12}
                            color={isDark ? '#9EB294' : '#6B7280'}
                            style={{ marginLeft: 6 }}
                        />
                    )}
                </View>
            </View>
            <View style={{
                height: 26, borderRadius: 13, overflow: 'hidden',
                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(158, 178, 148, 0.12)',
            }}>
                <View style={{
                    height: '100%', borderRadius: 13,
                    width: `${fillPct}%`,
                    backgroundColor: color,
                    justifyContent: 'center',
                }}>
                    {textFitsInside && (
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff', paddingHorizontal: 10 }} numberOfLines={1}>
                            {formatted}
                        </Text>
                    )}
                </View>
                {!textFitsInside && (
                    <View style={{ position: 'absolute', top: 0, bottom: 0, right: 8, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '900', color: isDark ? '#9EB294' : '#6B7280' }} numberOfLines={1}>
                            {formatted}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const LegendDot = ({ color, label, isDark }: { color: string; label: string; isDark: boolean }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 4 }} />
        <Text style={{ fontSize: 8, fontWeight: '700', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { marginBottom: 24, marginTop: 16, width: '100%' }
});
