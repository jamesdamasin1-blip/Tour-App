import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { CategoryCard } from '@/components/CategoryCard';
import { DailyBarChart } from '@/components/DailyBarChart';
import { DonutChartCard } from '@/components/DonutChartCard';
import { Header } from '@/components/Header';
import { SectionHeader } from '@/components/SectionHeader';
import { TripSelectionItem } from '@/components/TripSelectionItem';
import { CATEGORY_THEME } from '@/src/constants/categories';
import { MeshBackground } from '@/components/MeshBackground';
import { useStore } from '@/src/store/useStore';
import { useSpendingTotals } from '@/src/hooks/useSpendingTotals';
import { useFilteredBreakdown, BreakdownMode } from '@/src/hooks/useFilteredBreakdown';

type TabType = 'DAILY' | 'TOTAL';

export default function BudgetAnalysisScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>('TOTAL');
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [showBottomFade, setShowBottomFade] = useState(false);
    const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('all');
    const [totalMode, setTotalMode] = useState<'overall' | 'planned' | 'spontaneous'>('overall');

    useFocusEffect(
        useCallback(() => {
            setSelectedTripId(null);
            setSelectedDay(null);
            setBreakdownMode('all');
            setTotalMode('overall');
        }, [])
    );
    
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;

        // Only show fade if content is actually scrollable and we aren't at the bottom
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    const activities = useStore(state => state.activities);
    const trips = useStore(state => state.trips);

    const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId), [trips, selectedTripId]);

    const filteredActivities = useMemo(() => {
        if (!selectedTripId) return [];
        return activities.filter(a => a.tripId === selectedTripId);
    }, [activities, selectedTripId]);

    const totalBudget = useMemo(() => selectedTrip?.totalBudget || 0, [selectedTrip]);
    const homeCurrency = selectedTrip?.homeCurrency || 'PHP';

    const spendingTotals = useSpendingTotals(filteredActivities);

    // Wallet rate map: walletId -> rate (1 WalletCurrency = X HomeCurrency)
    const walletRateMap = useMemo(() => {
        const map: Record<string, number> = {};
        selectedTrip?.wallets?.forEach(w => {
            map[w.id] = w.baselineExchangeRate || (w.defaultRate ? 1 / w.defaultRate : 1);
        });
        return map;
    }, [selectedTrip]);

    // Budget comparison data for analysis chart
    const budgetComparison = useMemo(() => {
        if (!selectedTrip?.wallets) return null;

        // Allotted: sum of planned activity budgets in home currency
        const allotted = filteredActivities
            .filter(a => !a.isSpontaneous)
            .reduce((sum, a) => {
                const budget = a.allocatedBudget || 0;
                const bCur = a.budgetCurrency || '';
                if (homeCurrency && bCur === homeCurrency) return sum + budget;
                const rate = walletRateMap[a.walletId || ''] ?? 1;
                return sum + budget * rate;
            }, 0);

        // Actually spent: all expenses (planned + spontaneous) in home currency
        const actualSpent = filteredActivities.reduce((sum, a) =>
            sum + (a.expenses || []).reduce((s, e) => s + (e.convertedAmountHome || 0), 0), 0);

        // Initial wallet budget (default lot only)
        let walletInitial = 0;
        let walletAdded = 0;
        selectedTrip.wallets.forEach(wallet => {
            const lots = (wallet as any).lots || [];
            lots.forEach((lot: any, i: number) => {
                const homeAmount = lot.sourceCurrency === homeCurrency
                    ? lot.sourceAmount
                    : (lot.originalConvertedAmount || 0) * (wallet.baselineExchangeRate || wallet.defaultRate || 1);
                if (lot.isDefault || i === 0) {
                    walletInitial += homeAmount;
                } else {
                    walletAdded += homeAmount;
                }
            });
        });

        const walletTotal = walletInitial + walletAdded;

        // Allotted per category
        const allottedByCategory: Record<string, number> = {};
        filteredActivities
            .filter(a => !a.isSpontaneous)
            .forEach(a => {
                const budget = a.allocatedBudget || 0;
                const bCur = a.budgetCurrency || '';
                const homeAmount = (homeCurrency && bCur === homeCurrency)
                    ? budget
                    : budget * (walletRateMap[a.walletId || ''] ?? 1);
                const cat = a.category || 'Other';
                allottedByCategory[cat] = (allottedByCategory[cat] || 0) + homeAmount;
            });

        return { allotted, actualSpent, walletInitial, walletAdded, walletTotal, homeCurrency, allottedByCategory };
    }, [filteredActivities, selectedTrip, walletRateMap, homeCurrency]);


    // Daily breakdown — independent from TOTAL tab
    const { filtered: breakdownActivities, dailyData } = useFilteredBreakdown(filteredActivities, breakdownMode, walletRateMap, homeCurrency);

    const displayActivities = useMemo(() => {
        if (activeTab === 'DAILY') {
            if (!selectedDay) return [];
            return (breakdownActivities || [])
                .filter(act => {
                    if (!act.date) return false;
                    const d = new Date(act.date);
                    if (isNaN(d.getTime())) return false;
                    return d.toISOString().split('T')[0] === selectedDay;
                })
                .sort((a, b) => a.time - b.time);
        }
        return breakdownActivities || [];
    }, [breakdownActivities, activeTab, selectedDay]);

    // TOTAL tab category data — keyed by type, independent of dailyBreakdownMode
    const buildCategoryData = (acts: typeof filteredActivities) => {
        const spent = acts.reduce((sum, a) => sum + (a.expenses || []).reduce((s, e) => s + (e.convertedAmountHome || 0), 0), 0);
        const map = Calculations.getExpensesByCategory(acts);
        return {
            spent,
            cards: [
                { id: 'Food',        title: 'Food',        spent: map.Food        || 0, percentage: Calculations.getPercentageSpent(map.Food        || 0, spent), color: CATEGORY_THEME.Food.color },
                { id: 'Transport',   title: 'Transport',   spent: map.Transport   || 0, percentage: Calculations.getPercentageSpent(map.Transport   || 0, spent), color: CATEGORY_THEME.Transport.color },
                { id: 'Hotel',       title: 'Hotel',       spent: map.Hotel       || 0, percentage: Calculations.getPercentageSpent(map.Hotel       || 0, spent), color: CATEGORY_THEME.Hotel.color },
                { id: 'Sightseeing', title: 'Sightseeing', spent: map.Sightseeing || 0, percentage: Calculations.getPercentageSpent(map.Sightseeing || 0, spent), color: CATEGORY_THEME.Sightseeing.color },
                { id: 'Other',       title: 'Other',       spent: map.Other       || 0, percentage: Calculations.getPercentageSpent(map.Other       || 0, spent), color: CATEGORY_THEME.Other.color },
            ].filter(v => v.spent > 0).sort((a, b) => b.spent - a.spent),
        };
    };

    const totalCategoryByMode = useMemo(() => ({
        overall:     buildCategoryData(filteredActivities),
        planned:     buildCategoryData(filteredActivities.filter(a => !a.isSpontaneous)),
        spontaneous: buildCategoryData(filteredActivities.filter(a => !!a.isSpontaneous)),
    }), [filteredActivities]);

    // Daily breakdown category cards (day-filtered, type-filtered)
    const dailyCategoryData = useMemo(() => {
        return buildCategoryData(displayActivities).cards;
    }, [displayActivities]);

    // Category cards shown below chart — synced to the active mode toggle
    const categoryData = activeTab === 'TOTAL'
        ? totalCategoryByMode[totalMode].cards
        : dailyCategoryData;

    const averageDailySpending = useMemo(() => {
        const daysWithSpending = dailyData.filter(d => d.spent > 0).length;
        if (daysWithSpending === 0) return 0;
        return spendingTotals.overall / daysWithSpending;
    }, [dailyData, spendingTotals.overall]);

    const averageDailyBudget = useMemo(() => {
        if (!filteredActivities.length) return 0;
        const totalAllocated = filteredActivities.reduce((sum, a) => {
            const rawBudget = a.allocatedBudget || 0;
            const budgetCurrency = a.budgetCurrency || '';
            if (homeCurrency && budgetCurrency === homeCurrency) return sum + rawBudget;
            const walletRate = walletRateMap[a.walletId || ''] ?? 1;
            return sum + rawBudget * walletRate;
        }, 0);
        const uniqueDays = new Set(
            filteredActivities
                .filter(a => a.date)
                .map(a => new Date(a.date).toISOString().split('T')[0])
        ).size;
        return uniqueDays > 0 ? totalAllocated / uniqueDays : 0;
    }, [filteredActivities, walletRateMap, homeCurrency]);

    const durationSubtitle = useMemo(() => {
        if (!selectedTrip) return "Trip Insights";
        const start = new Date(selectedTrip.startDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        const end = new Date(selectedTrip.endDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        const days = Math.ceil((selectedTrip.endDate - selectedTrip.startDate) / (1000 * 60 * 60 * 24)) + 1;
        return `${start} - ${end} • ${days} ${days === 1 ? 'Day' : 'Days'}`;
    }, [selectedTrip]);

    const renderSectionHeader = () => (
        <View>
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
                <View style={{
                    flexDirection: 'row',
                    padding: 4,
                    borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(40, 44, 38, 0.8)' : 'rgba(93, 109, 84, 0.1)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.15)'
                }}>
                    <TouchableOpacity
                        onPress={() => {
                            setActiveTab('DAILY');
                            setSelectedDay(null);
                        }}
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'DAILY'
                                ? (isDark ? '#B2C4AA' : '#5D6D54')
                                : 'transparent',
                            paddingVertical: 10,
                            borderRadius: 12,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '900',
                            color: activeTab === 'DAILY'
                                ? (isDark ? '#1A1C18' : 'white')
                                : (isDark ? '#9EB294' : '#5D6D54'),
                            letterSpacing: 1.5,
                            textTransform: 'uppercase'
                        }}>DAILY BREAKDOWN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            setActiveTab('TOTAL');
                            setSelectedDay(null);
                        }}
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'TOTAL'
                                ? (isDark ? '#B2C4AA' : '#5D6D54')
                                : 'transparent',
                            paddingVertical: 10,
                            borderRadius: 12,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '900',
                            color: activeTab === 'TOTAL'
                                ? (isDark ? '#1A1C18' : 'white')
                                : (isDark ? '#9EB294' : '#5D6D54'),
                            letterSpacing: 1.5,
                            textTransform: 'uppercase'
                        }}>TOTAL ANALYSIS</Text>
                    </TouchableOpacity>
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
                        onBreakdownChange={(m) => { setBreakdownMode(m); setSelectedDay(null); }}
                        spendingTotals={spendingTotals}
                        averageSpent={averageDailySpending}
                        averageBudget={averageDailyBudget}
                        totalBudget={totalBudget}
                        selectedDay={selectedDay}
                        onSelectDay={setSelectedDay}
                    />

                    {selectedDay && (
                        <View className="items-center mb-6">
                            <Text className={`font-black text-lg uppercase tracking-tight text-center ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                                {dailyData.find(d => d.date === selectedDay)?.label || selectedDay} BREAKDOWN
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );

    const renderEmptyState = () => (
        <View className="flex-1 items-center justify-center px-10 py-20">
            <View className="p-8 rounded-3xl mb-8 shadow-xl" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.2)' }}>
                <Feather name="bar-chart-2" size={56} color={isDark ? "#B2C4AA" : "#5D6D54"} />
            </View>
            <Text className={`text-3xl font-black mb-4 text-center uppercase tracking-tighter ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>no data to analyze yet</Text>
            <Text className={`text-center font-medium text-base ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>Create a trip and log some expenses to see your budget breakdown!</Text>
        </View>
    );



    const handleBack = useCallback(() => {
        if (selectedDay) {
            setSelectedDay(null);
        } else if (selectedTripId) {
            setSelectedTripId(null);
        } else {
            router.navigate('/');
        }
    }, [selectedDay, selectedTripId, router]);

    return (
        <MeshBackground>

            <Header
                title={selectedTrip ? selectedTrip.title : "Budget Analysis"}
                subtitle={durationSubtitle}
                showBack={true}
                onBack={handleBack}
                showMenu={false}
                showThemeToggle={false}
            />

            {!selectedTripId ? (
                <FlatList
                    data={trips}
                    keyExtractor={item => item.id}
                    removeClippedSubviews={true}
                    initialNumToRender={8}
                    windowSize={5}
                    ListHeaderComponent={(
                        <View className="px-6 pt-4 mb-6">
                            <Text className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">SELECT TRIP TO ANALYZE</Text>
                        </View>
                    )}
                    renderItem={({ item }) => (
                        <View className="px-6 mb-4">
                            <TripSelectionItem
                                title={item.title}
                                startDate={item.startDate}
                                endDate={item.endDate}
                                countries={item.countries}
                                onSelect={() => setSelectedTripId(item.id)}
                                intensity={isDark ? 50 : 90}
                                backgroundColor={isDark ? "rgba(40, 44, 38, 0.7)" : "rgba(255, 255, 255, 0.6)"}
                            />
                        </View>
                    )}
                    ListEmptyComponent={renderEmptyState}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 250 }}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                    overScrollMode="never"
                    className="flex-1"
                />
            ) : (
                <FlatList
                    data={categoryData}
                    keyExtractor={item => item.id}
                    removeClippedSubviews={true}
                    initialNumToRender={5}
                    windowSize={5}
                    extraData={[activeTab, selectedDay, categoryData]}
                    ListHeaderComponent={renderSectionHeader}
                    renderItem={({ item }) => (
                        <View className="px-6">
                            <CategoryCard
                                title={item.title}
                                spent={item.spent}
                                percentage={item.percentage}
                            />
                        </View>
                    )}
                    ListFooterComponent={<View className="h-10" />}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 250 }}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                    overScrollMode="never"
                    className="flex-1"
                />
            )}

            {/* Dynamic Bottom Fade Overlay */}
            {showBottomFade && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 140 + insets.bottom,
                        zIndex: 5,
                    }}
                >
                    <LinearGradient
                        colors={[
                            isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)', 
                            isDark ? 'rgba(26, 28, 24, 0.8)' : 'rgba(242, 240, 232, 0.8)', 
                            isDark ? 'rgba(26, 28, 24, 1)' : 'rgba(242, 240, 232, 1)'
                        ]}
                        style={{ flex: 1 }}
                    />
                </View>
            )}
        </MeshBackground>
    );
}
