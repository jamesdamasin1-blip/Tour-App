import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { DailyBarChart } from '@/components/DailyBarChart';
import { DonutChartCard } from '@/components/DonutChartCard';
import { SectionHeader } from '@/components/SectionHeader';
import type { BreakdownMode } from '@/src/hooks/useFilteredBreakdown';

type TabType = 'DAILY' | 'TOTAL';
type TotalMode = 'overall' | 'planned' | 'spontaneous';

type AnalysisSectionHeaderProps = {
    isDark: boolean;
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;
    totalBudget: number;
    totalMode: TotalMode;
    setTotalMode: (mode: TotalMode) => void;
    spendingTotals: {
        overall: number;
        planned: number;
        spontaneous: number;
    };
    totalCategoryByMode: {
        overall: { cards: { color: string; spent: number }[] };
        planned: { cards: { color: string; spent: number }[] };
        spontaneous: { cards: { color: string; spent: number }[] };
    };
    budgetComparison: any;
    dailyData: any[];
    breakdownMode: BreakdownMode;
    setBreakdownMode: (mode: BreakdownMode) => void;
    averageDailySpending: number;
    averageDailyBudget: number;
    selectedDay: string | null;
    setSelectedDay: (day: string | null) => void;
};

const ToggleButton = ({
    active,
    label,
    isDark,
    onPress,
}: {
    active: boolean;
    label: string;
    isDark: boolean;
    onPress: () => void;
}) => (
    <TouchableOpacity
        onPress={onPress}
        style={{
            flex: 1,
            backgroundColor: active
                ? (isDark ? '#B2C4AA' : '#5D6D54')
                : 'transparent',
            paddingVertical: 10,
            borderRadius: 12,
            alignItems: 'center',
        }}
    >
        <Text
            style={{
                fontSize: 10,
                fontWeight: '900',
                color: active
                    ? (isDark ? '#1A1C18' : 'white')
                    : (isDark ? '#9EB294' : '#5D6D54'),
                letterSpacing: 1.5,
                textTransform: 'uppercase',
            }}
        >
            {label}
        </Text>
    </TouchableOpacity>
);

export const AnalysisSectionHeader = ({
    isDark,
    activeTab,
    setActiveTab,
    totalBudget,
    totalMode,
    setTotalMode,
    spendingTotals,
    totalCategoryByMode,
    budgetComparison,
    dailyData,
    breakdownMode,
    setBreakdownMode,
    averageDailySpending,
    averageDailyBudget,
    selectedDay,
    setSelectedDay,
}: AnalysisSectionHeaderProps) => (
    <View>
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <View
                style={{
                    flexDirection: 'row',
                    padding: 4,
                    borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(40, 44, 38, 0.8)' : 'rgba(93, 109, 84, 0.1)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.15)',
                }}
            >
                <ToggleButton
                    active={activeTab === 'DAILY'}
                    label="DAILY BREAKDOWN"
                    isDark={isDark}
                    onPress={() => {
                        setActiveTab('DAILY');
                        setSelectedDay(null);
                    }}
                />
                <ToggleButton
                    active={activeTab === 'TOTAL'}
                    label="TOTAL ANALYSIS"
                    isDark={isDark}
                    onPress={() => {
                        setActiveTab('TOTAL');
                        setSelectedDay(null);
                    }}
                />
            </View>
        </View>

        {activeTab === 'TOTAL' ? (
            <View className="px-6 mt-4">
                <DonutChartCard
                    totalBudget={totalBudget}
                    mode={totalMode}
                    onModeChange={setTotalMode}
                    overall={{
                        totalSpent: spendingTotals.overall,
                        categoryData: totalCategoryByMode.overall.cards.map(c => ({ color: c.color, amount: c.spent })),
                    }}
                    planned={{
                        totalSpent: spendingTotals.planned,
                        categoryData: totalCategoryByMode.planned.cards.map(c => ({ color: c.color, amount: c.spent })),
                    }}
                    spontaneous={{
                        totalSpent: spendingTotals.spontaneous,
                        categoryData: totalCategoryByMode.spontaneous.cards.map(c => ({ color: c.color, amount: c.spent })),
                    }}
                    budgetComparison={budgetComparison}
                />
                <SectionHeader title="ALL-TIME BREAKDOWN" />
            </View>
        ) : (
            <View className="px-6 mt-4">
                <DailyBarChart
                    data={dailyData}
                    breakdownMode={breakdownMode}
                    onBreakdownChange={(mode) => {
                        setBreakdownMode(mode);
                        setSelectedDay(null);
                    }}
                    spendingTotals={spendingTotals}
                    averageSpent={averageDailySpending}
                    averageBudget={averageDailyBudget}
                    totalBudget={totalBudget}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                />

                {selectedDay ? (
                    <View className="items-center mb-6">
                        <Text className={`font-black text-lg uppercase tracking-tight text-center ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                            {dailyData.find(day => day.date === selectedDay)?.label || selectedDay} BREAKDOWN
                        </Text>
                    </View>
                ) : null}
            </View>
        )}
    </View>
);
