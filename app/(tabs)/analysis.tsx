import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryCard } from '@/components/CategoryCard';
import { DailyBarChart } from '@/components/DailyBarChart';
import { DonutChartCard } from '@/components/DonutChartCard';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { SectionHeader } from '@/components/SectionHeader';
import { TripSelectionItem } from '@/components/TripSelectionItem';
import { CATEGORY_THEME } from '@/src/constants/categories';
import { MeshBackground } from '@/components/MeshBackground';
import { useStore } from '@/src/store/useStore';

type TabType = 'DAILY' | 'TOTAL';

export default function BudgetAnalysisScreen() {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState<TabType>('TOTAL');
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [showBottomFade, setShowBottomFade] = useState(false);
    
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
    const totalSpent = useMemo(() => Calculations.getTotalTripSpent(filteredActivities), [filteredActivities]);

    const displayActivities = useMemo(() => {
        if (activeTab === 'DAILY') {
            if (!selectedDay) return [];

            return filteredActivities
                .filter(act => {
                    if (!act.date) return false;
                    const d = new Date(act.date);
                    if (isNaN(d.getTime())) return false;
                    const dateStr = d.toISOString().split('T')[0];
                    return dateStr === selectedDay;
                })
                .sort((a, b) => a.time - b.time);
        }
        return filteredActivities;
    }, [filteredActivities, activeTab, selectedDay]);

    const categoryData = useMemo(() => {
        const spent = activeTab === 'DAILY' && selectedDay
            ? Calculations.getTotalTripSpent(displayActivities)
            : totalSpent;

        // Use global trip activities for Total mode, or daily filtered ones for Daily mode
        const analysisActivities = activeTab === 'TOTAL' ? filteredActivities : displayActivities;
        const map = Calculations.getExpensesByCategory(analysisActivities);

        return [
            { id: 'Food', title: 'Food', spent: map.Food || 0, percentage: Calculations.getPercentageSpent(map.Food || 0, spent), color: CATEGORY_THEME.Food.color },
            { id: 'Transport', title: 'Transport', spent: map.Transport || 0, percentage: Calculations.getPercentageSpent(map.Transport || 0, spent), color: CATEGORY_THEME.Transport.color },
            { id: 'Hotel', title: 'Hotel', spent: map.Hotel || 0, percentage: Calculations.getPercentageSpent(map.Hotel || 0, spent), color: CATEGORY_THEME.Hotel.color },
            { id: 'Sightseeing', title: 'Sightseeing', spent: map.Sightseeing || 0, percentage: Calculations.getPercentageSpent(map.Sightseeing || 0, spent), color: CATEGORY_THEME.Sightseeing.color },
            { id: 'Other', title: 'Other', spent: map.Other || 0, percentage: Calculations.getPercentageSpent(map.Other || 0, spent), color: CATEGORY_THEME.Other.color },
        ].filter(v => (v.spent || 0) > 0).sort((a, b) => (b.spent || 0) - (a.spent || 0));
    }, [displayActivities, filteredActivities, totalSpent, activeTab, selectedDay]);

    const dailyData = useMemo(() => {
        return Calculations.getDailySpending(filteredActivities);
    }, [filteredActivities]);

    const averageDailySpending = useMemo(() => {
        const daysWithSpending = dailyData.filter(d => d.spent > 0).length;
        if (daysWithSpending === 0) return 0;
        return totalSpent / daysWithSpending;
    }, [dailyData, totalSpent]);

    const averageDailyBudget = useMemo(() => {
        if (!filteredActivities.length) return 0;
        const totalAllocated = filteredActivities.reduce((sum, a) => sum + (a.allocatedBudget || 0), 0);
        const uniqueDays = new Set(
            filteredActivities
                .filter(a => a.date)
                .map(a => new Date(a.date).toISOString().split('T')[0])
        ).size;
        return uniqueDays > 0 ? totalAllocated / uniqueDays : 0;
    }, [filteredActivities]);

    const durationSubtitle = useMemo(() => {
        if (!selectedTrip) return "Trip Insights";
        const start = new Date(selectedTrip.startDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        const end = new Date(selectedTrip.endDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        const days = Math.ceil((selectedTrip.endDate - selectedTrip.startDate) / (1000 * 60 * 60 * 24)) + 1;
        return `${start} - ${end} • ${days} ${days === 1 ? 'Day' : 'Days'}`;
    }, [selectedTrip]);

    const renderSectionHeader = () => (
        <View>
            <View className="px-6 mt-6">
                <GlassView
                    intensity={80}
                    borderRadius={16}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.45)" : "rgba(255, 255, 255, 0.45)"}
                    borderColor="rgba(255, 255, 255, 0.3)"
                    borderWidth={1}
                    style={{ padding: 4 }}
                >
                    <View className="flex-row">
                        <TouchableOpacity
                            onPress={() => {
                                setActiveTab('DAILY');
                                setSelectedDay(null);
                            }}
                            className={`flex-1 py-3 items-center rounded-xl ${activeTab === 'DAILY' ? (isDark ? 'bg-[#5D6D54]/30 shadow-sm' : 'bg-white shadow-sm') : 'bg-transparent'}`}
                        >
                            <Text className={`font-black uppercase tracking-widest text-[10px] ${activeTab === 'DAILY' ? (isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]') : (isDark ? 'text-[#9EB294]/40' : 'text-[#5D6D54]/50')}`}>
                                Daily Breakdown
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => {
                                setActiveTab('TOTAL');
                                setSelectedDay(null);
                            }}
                            className={`flex-1 py-3 items-center rounded-xl ${activeTab === 'TOTAL' ? (isDark ? 'bg-[#5D6D54]/30 shadow-sm' : 'bg-white shadow-sm') : 'bg-transparent'}`}
                        >
                            <Text className={`font-black uppercase tracking-widest text-[10px] ${activeTab === 'TOTAL' ? (isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]') : (isDark ? 'text-[#9EB294]/40' : 'text-[#5D6D54]/50')}`}>
                                Total Analysis
                            </Text>
                        </TouchableOpacity>
                    </View>
                </GlassView>
            </View>

            {activeTab === 'TOTAL' ? (
                <View className="px-6 mt-4">
                    <DonutChartCard
                        totalSpent={totalSpent}
                        totalBudget={totalBudget}
                        categoryData={categoryData.map(c => ({ color: c.color, amount: c.spent || 0 }))}
                    />
                    <SectionHeader title="ALL-TIME BREAKDOWN" />
                </View>
            ) : (
                <View className="px-6 mt-4">
                    <DailyBarChart
                        data={dailyData}
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
            <View className="p-6 rounded-3xl mb-6 shadow-xl" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.2)' }}>
                <Feather name="bar-chart-2" size={48} color={isDark ? "#B2C4AA" : "#5D6D54"} />
            </View>
            <Text className={`text-2xl font-black mb-2 text-center uppercase tracking-tighter ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>no data to analyze yet</Text>
            <Text className={`text-center font-medium ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>Create a trip and log some expenses to see your budget breakdown!</Text>
        </View>
    );

    const renderTripSelection = () => (
        <FlatList
            data={trips}
            keyExtractor={item => item.id}
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
    );

    const handleBack = useCallback(() => {
        if (selectedDay) setSelectedDay(null);
        else setSelectedTripId(null);
    }, [selectedDay]);

    return (
        <MeshBackground>

            <Header
                title={selectedTrip ? selectedTrip.title : "Budget Analysis"}
                subtitle={durationSubtitle}
                showBack={!!selectedTrip}
                onBack={handleBack}
                showMenu={false}
            />

            {!selectedTripId ? (
                renderTripSelection()
            ) : (
                <FlatList
                    data={categoryData}
                    keyExtractor={item => item.id}
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
