import { useCallback, useMemo } from 'react';
import { CATEGORY_THEME } from '@/src/constants/categories';
import { getFundingTotalGlobalHome } from '@/src/finance/wallet/walletEngine';
import { getNormalizedLotHomeAmount } from '@/src/finance/wallet/walletRate';
import { useFilteredBreakdown, type BreakdownMode } from '@/src/hooks/useFilteredBreakdown';
import { useSpendingTotals } from '@/src/hooks/useSpendingTotals';
import type { Activity, TripPlan } from '@/src/types/models';
import { Calculations } from '@/src/utils/mathUtils';
import { formatTripDate, getTripDurationDays } from '@/src/utils/tripDates';

type TabType = 'DAILY' | 'TOTAL';

export const useBudgetAnalysisData = ({
    trips,
    activities,
    selectedTripId,
    activeTab,
    selectedDay,
    breakdownMode,
}: {
    trips: TripPlan[];
    activities: Activity[];
    selectedTripId: string | null;
    activeTab: TabType;
    selectedDay: string | null;
    breakdownMode: BreakdownMode;
}) => {
    const selectedTrip = useMemo(
        () => trips.find(trip => trip.id === selectedTripId),
        [trips, selectedTripId]
    );

    const filteredActivities = useMemo(
        () => selectedTripId ? activities.filter(activity => activity.tripId === selectedTripId) : [],
        [activities, selectedTripId]
    );

    const homeCurrency = selectedTrip?.homeCurrency || 'PHP';

    const totalBudget = useMemo(() => {
        if (!selectedTrip) return 0;
        if (selectedTrip.wallets?.length) {
            return selectedTrip.wallets.reduce(
                (sum, wallet) => sum + getFundingTotalGlobalHome(wallet as any, selectedTrip.homeCurrency || 'PHP'),
                0
            );
        }
        return selectedTrip.totalBudgetHomeCached || selectedTrip.totalBudget || 0;
    }, [selectedTrip]);

    const spendingTotals = useSpendingTotals(filteredActivities);

    const walletRateMap = useMemo(() => {
        const map: Record<string, number> = {};
        selectedTrip?.wallets?.forEach(wallet => {
            map[wallet.id] = wallet.baselineExchangeRate || (wallet.defaultRate ? 1 / wallet.defaultRate : 1);
        });
        return map;
    }, [selectedTrip]);

    const budgetComparison = useMemo(() => {
        if (!selectedTrip?.wallets) return null;

        const allotted = filteredActivities
            .filter(activity => !activity.isSpontaneous)
            .reduce((sum, activity) => {
                const budget = activity.allocatedBudget || 0;
                const budgetCurrency = activity.budgetCurrency || '';
                if (homeCurrency && budgetCurrency === homeCurrency) return sum + budget;
                const rate = walletRateMap[activity.walletId || ''] ?? 1;
                return sum + budget * rate;
            }, 0);

        const actualSpent = filteredActivities.reduce(
            (sum, activity) => sum + (activity.expenses || []).reduce(
                (expenseSum, expense) => expenseSum + (expense.convertedAmountHome || 0),
                0
            ),
            0
        );

        let walletInitial = 0;
        let walletAdded = 0;

        selectedTrip.wallets.forEach(wallet => {
            const lots = (wallet as any).lots || [];
            lots.forEach((lot: any, index: number) => {
                const entryKind = lot.entryKind || (index === 0 ? 'initial' : 'top_up');
                const homeAmount = getNormalizedLotHomeAmount(lot, wallet as any, homeCurrency);
                if (entryKind === 'initial') {
                    walletInitial += homeAmount;
                } else {
                    walletAdded += homeAmount;
                }
            });
        });

        const allottedByCategory: Record<string, number> = {};
        filteredActivities
            .filter(activity => !activity.isSpontaneous)
            .forEach(activity => {
                const budget = activity.allocatedBudget || 0;
                const budgetCurrency = activity.budgetCurrency || '';
                const homeAmount = (homeCurrency && budgetCurrency === homeCurrency)
                    ? budget
                    : budget * (walletRateMap[activity.walletId || ''] ?? 1);
                const category = activity.category || 'Other';
                allottedByCategory[category] = (allottedByCategory[category] || 0) + homeAmount;
            });

        return {
            allotted,
            actualSpent,
            walletInitial,
            walletAdded,
            walletTotal: walletInitial + walletAdded,
            homeCurrency,
            allottedByCategory,
        };
    }, [filteredActivities, homeCurrency, selectedTrip, walletRateMap]);

    const { filtered: breakdownActivities, dailyData } = useFilteredBreakdown(
        filteredActivities,
        breakdownMode,
        walletRateMap,
        homeCurrency
    );

    const displayActivities = useMemo(() => {
        if (activeTab !== 'DAILY') return breakdownActivities || [];
        if (!selectedDay) return [];

        return (breakdownActivities || [])
            .filter(activity => {
                if (!activity.date) return false;
                const date = new Date(activity.date);
                if (Number.isNaN(date.getTime())) return false;
                return date.toISOString().split('T')[0] === selectedDay;
            })
            .sort((left, right) => left.time - right.time);
    }, [activeTab, breakdownActivities, selectedDay]);

    const buildCategoryData = useCallback((items: Activity[]) => {
        const spent = items.reduce(
            (sum, activity) => sum + (activity.expenses || []).reduce(
                (expenseSum, expense) => expenseSum + (expense.convertedAmountHome || 0),
                0
            ),
            0
        );
        const categoryMap = Calculations.getExpensesByCategory(items);

        return {
            spent,
            cards: [
                { id: 'Food', title: 'Food', spent: categoryMap.Food || 0, percentage: Calculations.getPercentageSpent(categoryMap.Food || 0, spent), color: CATEGORY_THEME.Food.color },
                { id: 'Transport', title: 'Transport', spent: categoryMap.Transport || 0, percentage: Calculations.getPercentageSpent(categoryMap.Transport || 0, spent), color: CATEGORY_THEME.Transport.color },
                { id: 'Hotel', title: 'Hotel', spent: categoryMap.Hotel || 0, percentage: Calculations.getPercentageSpent(categoryMap.Hotel || 0, spent), color: CATEGORY_THEME.Hotel.color },
                { id: 'Sightseeing', title: 'Sightseeing', spent: categoryMap.Sightseeing || 0, percentage: Calculations.getPercentageSpent(categoryMap.Sightseeing || 0, spent), color: CATEGORY_THEME.Sightseeing.color },
                { id: 'Other', title: 'Other', spent: categoryMap.Other || 0, percentage: Calculations.getPercentageSpent(categoryMap.Other || 0, spent), color: CATEGORY_THEME.Other.color },
            ].filter(card => card.spent > 0).sort((left, right) => right.spent - left.spent),
        };
    }, []);

    const totalCategoryByMode = useMemo(() => ({
        overall: buildCategoryData(filteredActivities),
        planned: buildCategoryData(filteredActivities.filter(activity => !activity.isSpontaneous)),
        spontaneous: buildCategoryData(filteredActivities.filter(activity => !!activity.isSpontaneous)),
    }), [buildCategoryData, filteredActivities]);

    const dailyCategoryData = useMemo(
        () => buildCategoryData(displayActivities).cards,
        [buildCategoryData, displayActivities]
    );

    const dailyIsOverBudget = useMemo(() => {
        const totals = displayActivities.reduce((acc, activity) => {
            const budget = activity.allocatedBudget || 0;
            const budgetCurrency = activity.budgetCurrency || '';
            const normalizedBudget = budgetCurrency === homeCurrency
                ? budget
                : budget * (walletRateMap[activity.walletId || ''] ?? 1);
            const spent = (activity.expenses || []).reduce(
                (sum, expense) => sum + (expense.convertedAmountHome || 0),
                0
            );

            acc.budget += normalizedBudget;
            acc.spent += spent;
            return acc;
        }, { budget: 0, spent: 0 });

        return totals.spent > totals.budget && totals.budget > 0;
    }, [displayActivities, homeCurrency, walletRateMap]);

    const averageDailySpending = useMemo(() => {
        const daysWithSpending = dailyData.filter(day => day.spent > 0).length;
        if (daysWithSpending === 0) return 0;
        return spendingTotals.overall / daysWithSpending;
    }, [dailyData, spendingTotals.overall]);

    const averageDailyBudget = useMemo(() => {
        if (!filteredActivities.length) return 0;

        const totalAllocated = filteredActivities.reduce((sum, activity) => {
            const rawBudget = activity.allocatedBudget || 0;
            const budgetCurrency = activity.budgetCurrency || '';
            if (homeCurrency && budgetCurrency === homeCurrency) return sum + rawBudget;
            const walletRate = walletRateMap[activity.walletId || ''] ?? 1;
            return sum + rawBudget * walletRate;
        }, 0);

        const uniqueDays = new Set(
            filteredActivities
                .filter(activity => activity.date)
                .map(activity => new Date(activity.date).toISOString().split('T')[0])
        ).size;

        return uniqueDays > 0 ? totalAllocated / uniqueDays : 0;
    }, [filteredActivities, homeCurrency, walletRateMap]);

    const durationSubtitle = useMemo(() => {
        if (!selectedTrip) return 'Trip Insights';
        const start = formatTripDate({
            dateKey: selectedTrip.startDateKey,
            timestamp: selectedTrip.startDate,
            homeCountry: selectedTrip.homeCountry,
            locale: 'en-US',
            options: {
                month: 'short',
                day: '2-digit',
            },
        });
        const end = formatTripDate({
            dateKey: selectedTrip.endDateKey,
            timestamp: selectedTrip.endDate,
            homeCountry: selectedTrip.homeCountry,
            locale: 'en-US',
            options: {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
            },
        });
        const days = getTripDurationDays(
            selectedTrip.startDateKey,
            selectedTrip.endDateKey,
            selectedTrip.startDate,
            selectedTrip.endDate,
            selectedTrip.homeCountry
        );
        return `${start} - ${end} • ${days} ${days === 1 ? 'Day' : 'Days'}`;
    }, [selectedTrip]);

    return {
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
    };
};
