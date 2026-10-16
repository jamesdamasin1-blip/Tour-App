import { BottomFade } from '@/components/BottomFade';
import { CategoryCard } from '@/components/CategoryCard';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { AnalysisSectionHeader } from '@/src/features/analysis/components/AnalysisSectionHeader';
import { AnalysisTripSelector } from '@/src/features/analysis/components/AnalysisTripSelector';
import { useBudgetAnalysisData } from '@/src/features/analysis/hooks/useBudgetAnalysisData';
import type { BreakdownMode } from '@/src/hooks/useFilteredBreakdown';
import { useStore } from '@/src/store/useStore';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';

type TabType = 'DAILY' | 'TOTAL';
const ANALYSIS_FADE_HEIGHT = 170;

export default function BudgetAnalysisScreen() {
    const router = useRouter();
    const theme = useStore(state => state.theme);
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const deferredActivities = useDeferredValue(activities);

    const [activeTab, setActiveTab] = useState<TabType>('TOTAL');
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('all');
    const [totalMode, setTotalMode] = useState<'overall' | 'planned' | 'spontaneous'>('overall');
    const [showBottomFade, setShowBottomFade] = useState(false);
    const isDark = theme === 'dark';
    const viewportHeightRef = React.useRef(0);
    const contentHeightRef = React.useRef(0);

    useFocusEffect(
        useCallback(() => {
            setSelectedTripId(null);
            setSelectedDay(null);
            setBreakdownMode('all');
            setTotalMode('overall');
        }, [])
    );

    const {
        selectedTrip,
        totalBudget,
        spendingTotals,
        budgetComparison,
        dailyData,
        totalCategoryByMode,
        dailyCategoryData,
        dailyIsOverBudget,
        averageDailySpending,
        averageDailyBudget,
        durationSubtitle,
    } = useBudgetAnalysisData({
        trips,
        activities: deferredActivities,
        selectedTripId,
        activeTab,
        selectedDay,
        breakdownMode,
    });

    const categoryData = useMemo(
        () => activeTab === 'TOTAL' ? totalCategoryByMode[totalMode].cards : dailyCategoryData,
        [activeTab, dailyCategoryData, totalCategoryByMode, totalMode]
    );

    const handleBack = useCallback(() => {
        if (selectedDay) {
            setSelectedDay(null);
        } else if (selectedTripId) {
            setSelectedTripId(null);
        } else {
            router.navigate('/');
        }
    }, [router, selectedDay, selectedTripId]);

    const updateBottomFade = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isScrollable = contentSize.height > layoutMeasurement.height + 8;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    const updateBottomFadeFromSizes = useCallback(() => {
        const isScrollable = contentHeightRef.current > viewportHeightRef.current + 8;
        setShowBottomFade(isScrollable);
    }, []);

    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        updateBottomFade(event);
    }, [updateBottomFade]);

    React.useEffect(() => {
        setShowBottomFade(false);
    }, [selectedTripId, selectedDay, activeTab, totalMode, breakdownMode]);

    const sectionHeader = useMemo(() => (
        <AnalysisSectionHeader
            isDark={isDark}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            totalBudget={totalBudget}
            totalMode={totalMode}
            setTotalMode={setTotalMode}
            spendingTotals={spendingTotals}
            totalCategoryByMode={totalCategoryByMode}
            budgetComparison={budgetComparison}
            dailyData={dailyData}
            breakdownMode={breakdownMode}
            setBreakdownMode={setBreakdownMode}
            averageDailySpending={averageDailySpending}
            averageDailyBudget={averageDailyBudget}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
        />
    ), [
        activeTab,
        averageDailyBudget,
        averageDailySpending,
        breakdownMode,
        budgetComparison,
        dailyData,
        isDark,
        selectedDay,
        spendingTotals,
        totalBudget,
        totalCategoryByMode,
        totalMode,
    ]);

    return (
        <MeshBackground>
            <Header
                title={selectedTrip ? selectedTrip.title : 'Budget Analysis'}
                subtitle={durationSubtitle}
                showBack
                onBack={handleBack}
                showMenu={false}
                showThemeToggle={false}
            />

            {!selectedTripId ? (
                <AnalysisTripSelector
                    trips={trips}
                    isDark={isDark}
                    onSelectTrip={setSelectedTripId}
                />
            ) : (
                <FlatList
                    data={categoryData}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <View className="px-6">
                            <CategoryCard
                                title={item.title}
                                spent={item.spent}
                                percentage={item.percentage}
                                danger={activeTab === 'DAILY' && dailyIsOverBudget}
                            />
                        </View>
                    )}
                    ListHeaderComponent={sectionHeader}
                    ListFooterComponent={<View className="h-10" />}
                    contentContainerStyle={{ paddingBottom: 250 }}
                    bounces={false}
                    overScrollMode="never"
                    showsVerticalScrollIndicator={false}
                    className="flex-1"
                    removeClippedSubviews
                    onLayout={(event) => {
                        viewportHeightRef.current = event.nativeEvent.layout.height;
                        updateBottomFadeFromSizes();
                    }}
                    onContentSizeChange={(_, height) => {
                        contentHeightRef.current = height;
                        updateBottomFadeFromSizes();
                    }}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                />
            )}

            <BottomFade
                visible={!!selectedTripId && showBottomFade}
                height={ANALYSIS_FADE_HEIGHT}
                bottomOffset={0}
            />
        </MeshBackground>
    );
}
