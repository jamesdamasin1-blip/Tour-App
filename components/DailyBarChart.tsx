import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { CATEGORY_THEME } from '../src/constants/categories';
import { ExpenseCategory } from '@/src/types/models';
import { GlassView } from './GlassView';

interface DailyData {
    date: string; // ISO date string
    label: string; // Full date label
    shortLabel: string; // Short date label e.g. "04/16/26"
    spent: number;
    budget: number;
    categories: Record<string, number>;
}

interface DailyBarChartProps {
    data: DailyData[];
    averageSpent: number;
    averageBudget: number;
    totalBudget: number;
    selectedDay: string | null;
    onSelectDay: (date: string | null) => void;
}

export const DailyBarChart = React.memo(({ data, averageSpent, averageBudget, totalBudget, selectedDay, onSelectDay }: DailyBarChartProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    
    // Find the max value to scale the bars height dynamically
    const maxVal = useMemo(() => {
        const allValues = data.flatMap(d => [d.spent, d.budget]);
        return Math.max(...allValues, 100);
    }, [data]);

    return (
        <GlassView
            style={styles.container}
            intensity={isDark ? 50 : 80}
            borderRadius={24}
            backgroundColor={isDark ? "rgba(40, 44, 38, 0.45)" : "rgba(255, 255, 255, 0.45)"}
            borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.3)"}
            borderWidth={1}
        >
            <View className="p-5 w-full">
                <View className="flex-row justify-between items-end mb-6">
                    <View className="flex-1">
                        <Text className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-[#9EB294]/60' : 'text-gray-400'}`}>Average Daily Spending</Text>
                        <Text className={`text-2xl font-black ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`} numberOfLines={1}>
                            ₱{averageSpent.toLocaleString()}
                        </Text>
                    </View>
                    <View className="flex-1 items-end">
                        <Text className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-[#9EB294]/60' : 'text-gray-400'}`}>Average Allotted Budget</Text>
                        <Text className={`text-2xl font-black ${isDark ? 'text-[#B2C4AA]/60' : 'text-[#5D6D54]/60'}`} numberOfLines={1}>
                            ₱{averageBudget.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* Scrollable Bar Graph Container */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: 10,
                        paddingRight: 20
                    }}
                >
                    <View className="flex-row items-end h-[250px]">
                        {data.map((item) => {
                            const isSelected = item.date === selectedDay;
                            const isOverBudget = item.spent > item.budget && item.budget > 0;
                            const isUnderBudget = item.budget >= item.spent && item.budget > 0;

                            return (
                                <TouchableOpacity
                                    key={item.date}
                                    onPress={() => onSelectDay(isSelected ? null : item.date)}
                                    activeOpacity={0.8}
                                    className="mr-6 items-center"
                                >
                                    {/* Subtle Overlay Glow */}
                                    <View
                                        className="absolute inset-x-0 -mx-1 -my-1 top-0 bottom-0 rounded-2xl"
                                        style={{
                                            backgroundColor: isOverBudget
                                                ? 'rgba(239, 68, 68, 0.08)'
                                                : isUnderBudget
                                                    ? 'rgba(34, 197, 94, 0.08)'
                                                    : 'transparent'
                                        }}
                                    />

                                    <View className="flex-row items-end h-[200px] pt-4 px-1">
                                        {/* 1. Expense Stacked Bar */}
                                        <View
                                            className="w-[28px] rounded-[4px] overflow-hidden justify-end mr-1.5 relative"
                                            style={{
                                                height: '100%',
                                                borderWidth: isSelected ? 1.5 : 0.5,
                                                borderColor: isSelected ? (isDark ? '#B2C4AA' : '#5D6D54') : (isDark ? '#4A5046' : '#e5e7eb'),
                                                backgroundColor: 'transparent'
                                            }}
                                        >
                                            {Object.entries(item.categories).map(([cat, amount]) => {
                                                const segmentHeight = (amount / maxVal) * 200;
                                                if (segmentHeight < 1) return null;
                                                const pct = Math.round((amount / (item.spent || 1)) * 100);

                                                return (
                                                    <View
                                                        key={cat}
                                                        style={{
                                                            height: segmentHeight,
                                                            backgroundColor: CATEGORY_THEME[cat as ExpenseCategory]?.color || '#9ca3af',
                                                            justifyContent: 'center',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        {segmentHeight > 14 && (
                                                            <Text className="text-[6px] font-black text-white/90">
                                                                {pct}%
                                                            </Text>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>

                                        {/* 2. Budget Bar */}
                                        <View
                                            className="w-[22px] rounded-[4px] overflow-hidden justify-end"
                                            style={{ height: '100%', backgroundColor: 'transparent' }}
                                        >
                                            <View
                                                style={{
                                                    height: (item.budget / maxVal) * 200,
                                                    backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                                                    opacity: isDark ? 0.3 : 0.5
                                                }}
                                            />
                                        </View>
                                    </View>

                                    {/* X-Axis Labels */}
                                    <View className="mt-3 items-center">
                                        <Text className={`text-[12px] font-black text-center ${isSelected ? (isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]') : (isDark ? 'text-[#9EB294]' : 'text-gray-500')}`} style={{ lineHeight: 14 }}>
                                            ₱{item.spent.toLocaleString()}
                                        </Text>
                                        <Text className={`text-[10px] font-bold text-center mt-0.5 ${isSelected ? (isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]') : (isDark ? 'text-[#9EB294]/60' : 'text-gray-400')}`} style={{ lineHeight: 12 }}>
                                            {item.shortLabel}
                                        </Text>
                                        {isOverBudget && (
                                            <View className="mt-1">
                                                <Feather name="alert-circle" size={10} color="#ef4444" />
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </GlassView>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
        marginTop: 16,
    }
});
