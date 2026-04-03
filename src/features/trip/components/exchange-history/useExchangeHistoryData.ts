import { useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { useStore } from '@/src/store/useStore';
import {
    getNormalizedFundingHomeAmount,
    getNormalizedFundingRate,
    getNormalizedFundingTripAmount,
} from '@/src/finance/wallet/walletRate';
import { useTripWallet } from '../../hooks/useTripWallet';

const groupTimelineByDate = (logs: any[]) => logs.reduce((acc: Record<string, any[]>, log: any) => {
    const date = dayjs(log.timestamp).isSame(dayjs(), 'day')
        ? 'Today'
        : dayjs(log.timestamp).isSame(dayjs().subtract(1, 'day'), 'day')
            ? 'Yesterday'
            : dayjs(log.timestamp).format('MMM D');
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
}, {});

export function useExchangeHistoryData(tripId: string, fundsCurrencyIdx: number) {
    const trip = useStore(state => state.trips.find(item => item.id === tripId));
    const allExpenses = useStore(state => state.expenses);
    const allActivities = useStore(state => state.activities);
    const { homeCurrency, totalExchangedHome, walletsStats } = useTripWallet(tripId);

    const tripExpenses = useMemo(
        () => allExpenses.filter(expense => expense.tripId === tripId),
        [allExpenses, tripId]
    );

    const tripActivities = useMemo(
        () => allActivities.filter(activity => activity.tripId === tripId),
        [allActivities, tripId]
    );

    const walletCurrencies = useMemo(() => {
        const wallets = trip?.wallets || [];
        return Array.from(
            new Set([
                homeCurrency,
                ...wallets
                    .map((wallet: any) => wallet.currency)
                    .filter((currency: string) => currency !== homeCurrency),
            ])
        );
    }, [homeCurrency, trip]);

    const activeFundsCurrency = walletCurrencies[fundsCurrencyIdx] ?? homeCurrency;
    const activeFundsRateToHome = useMemo(() => {
        if (activeFundsCurrency === homeCurrency) return 1;
        return walletsStats.find(item => item.currency === activeFundsCurrency)?.effectiveRate ?? 0;
    }, [activeFundsCurrency, homeCurrency, walletsStats]);

    const convertHomeToActive = useCallback((homeAmount: number) => {
        if (activeFundsCurrency === homeCurrency) return homeAmount;
        if (activeFundsRateToHome <= 0) return 0;
        return homeAmount / activeFundsRateToHome;
    }, [activeFundsCurrency, activeFundsRateToHome, homeCurrency]);

    const activeFundsAmount = useMemo(() => {
        if (!trip) return 0;
        return convertHomeToActive(totalExchangedHome);
    }, [convertHomeToActive, totalExchangedHome, trip]);

    const activeFundsEquivalentHome = useMemo(() => {
        if (!trip || activeFundsCurrency === homeCurrency) return null;
        return totalExchangedHome;
    }, [activeFundsCurrency, homeCurrency, totalExchangedHome, trip]);

    const fullTimeline = useMemo(() => {
        const timeline: any[] = [];
        if (!trip) return timeline;

        (trip.wallets || []).forEach(wallet => {
            const lots = (wallet as any).lots || [];
            let topUpIndex = 0;

            lots.forEach((lot: any, idx: number) => {
                const entryKind = lot.entryKind || (idx === 0 ? 'initial' : 'top_up');
                if (entryKind === 'top_up') topUpIndex += 1;

                const walletAmount = getNormalizedFundingTripAmount({
                    homeCurrency,
                    sourceAmount: Number(lot.sourceAmount || 0),
                    sourceCurrency: lot.sourceCurrency,
                    storedRate: Number(lot.lockedRate || 0),
                    storedTripAmount: Number(lot.originalConvertedAmount || lot.convertedAmount || 0),
                    wallet: wallet as any,
                });
                const homeAmount = getNormalizedFundingHomeAmount({
                    homeCurrency,
                    sourceAmount: Number(lot.sourceAmount || 0),
                    sourceCurrency: lot.sourceCurrency,
                    storedRate: Number(lot.lockedRate || 0),
                    storedTripAmount: Number(lot.originalConvertedAmount || lot.convertedAmount || 0),
                    wallet: wallet as any,
                });
                const normalizedRate = getNormalizedFundingRate({
                    homeCurrency,
                    sourceCurrency: lot.sourceCurrency,
                    storedRate: Number(lot.lockedRate || 0),
                    wallet: wallet as any,
                });

                timeline.push({
                    type: 'deposit',
                    lot,
                    idx,
                    entryKind,
                    topUpIndex,
                    walletCurrency: wallet.currency,
                    walletAmount,
                    homeAmount,
                    normalizedRate,
                    timestamp: lot.createdAt,
                });
            });
        });

        tripExpenses.forEach(expense => {
            const activity = tripActivities.find(item => item.id === expense.activityId);
            const wallet = (trip.wallets || []).find((item: any) => item.id === expense.walletId);
            timeline.push({
                type: 'expense',
                expense,
                activity,
                walletCurrency: wallet?.currency || expense.currency,
                walletExchangeRate: wallet?.baselineExchangeRate || 0,
                walletAmount: -(expense.convertedAmountTrip || expense.amount || 0),
                homeAmount: -(expense.convertedAmountHome || expense.amount || 0),
                timestamp: expense.time,
            });
        });

        timeline.sort((a, b) => a.timestamp - b.timestamp);

        let runningBalanceHome = 0;
        const runningBalanceByWallet = new Map<string, number>();
        return timeline.map(entry => {
            const balanceBeforeHome = runningBalanceHome;
            const walletCurrency = entry.walletCurrency || '';
            const balanceBeforeWallet = walletCurrency
                ? (runningBalanceByWallet.get(walletCurrency) || 0)
                : null;

            runningBalanceHome += entry.homeAmount;
            const nextWalletBalance = walletCurrency
                ? (balanceBeforeWallet || 0) + (entry.walletAmount || 0)
                : null;

            if (walletCurrency && nextWalletBalance !== null) {
                runningBalanceByWallet.set(walletCurrency, nextWalletBalance);
            }

            return {
                ...entry,
                balanceBeforeHome,
                balanceAfterHome: runningBalanceHome,
                balanceBeforeWallet,
                balanceAfterWallet: nextWalletBalance,
            };
        });
    }, [homeCurrency, trip, tripActivities, tripExpenses]);

    const convertedTimeline = useMemo(() => fullTimeline.map(entry => {
        const displayAmount = Math.abs(convertHomeToActive(Math.abs(entry.homeAmount || 0)));
        const equivalentAmount = activeFundsCurrency === homeCurrency
            ? (entry.walletCurrency && entry.walletCurrency !== homeCurrency
                ? Math.abs(entry.walletAmount || 0)
                : null)
            : Math.abs(entry.homeAmount || 0);
        const equivalentCurrency = activeFundsCurrency === homeCurrency
            ? (entry.walletCurrency && entry.walletCurrency !== homeCurrency ? entry.walletCurrency : null)
            : homeCurrency;
        const displayRate = activeFundsCurrency === homeCurrency
            ? (entry.walletCurrency && entry.walletCurrency !== homeCurrency ? entry.normalizedRate : null)
            : activeFundsRateToHome;
        const displayRateQuoteCurrency = activeFundsCurrency === homeCurrency
            ? entry.walletCurrency
            : activeFundsCurrency;

        return {
            ...entry,
            displayAmount,
            displayCurrency: activeFundsCurrency,
            equivalentAmount,
            equivalentCurrency,
            displayRate,
            displayRateBaseCurrency: homeCurrency,
            displayRateQuoteCurrency,
            displayBalanceBefore: convertHomeToActive(entry.balanceBeforeHome || 0),
            displayBalanceAfter: convertHomeToActive(entry.balanceAfterHome || 0),
        };
    }), [activeFundsCurrency, activeFundsRateToHome, convertHomeToActive, fullTimeline, homeCurrency]);

    const movementsTimeline = useMemo(
        () => groupTimelineByDate(
            convertedTimeline.filter(entry => entry.type === 'deposit')
        ),
        [convertedTimeline]
    );

    const spendingTimeline = useMemo(
        () => groupTimelineByDate(convertedTimeline.filter(entry =>
            entry.type === 'expense' && entry.expense?.name !== 'Manual Adjustment'
        )),
        [convertedTimeline]
    );

    return {
        homeCurrency,
        activeFundsAmount,
        activeFundsCurrency,
        activeFundsEquivalentHome,
        activeFundsRateToHome,
        movementsTimeline,
        spendingTimeline,
        walletCurrencies,
    };
}
