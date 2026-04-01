import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useStore } from '@/src/store/useStore';
import { getFundingTotalGlobalHome } from '@/src/finance/wallet/walletEngine';
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
    const { homeCurrency } = useTripWallet(tripId);

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
        return [
            homeCurrency,
            ...wallets
                .map((wallet: any) => wallet.currency)
                .filter((currency: string) => currency !== homeCurrency),
        ];
    }, [homeCurrency, trip]);

    const activeFundsCurrency = walletCurrencies[fundsCurrencyIdx] ?? homeCurrency;

    const activeFundsAmount = useMemo(() => {
        if (!trip) return 0;
        if (fundsCurrencyIdx === 0) {
            return (trip.wallets || []).reduce(
                (sum, wallet) => sum + getFundingTotalGlobalHome(wallet as any, homeCurrency),
                0
            );
        }

        const wallet = (trip?.wallets || []).find((item: any) => item.currency === activeFundsCurrency);
        return wallet
            ? ((wallet as any).lots || []).reduce(
                (sum: number, lot: any) => sum + Number(lot.originalConvertedAmount || 0),
                0
            )
            : 0;
    }, [activeFundsCurrency, fundsCurrencyIdx, homeCurrency, trip]);

    const fullTimeline = useMemo(() => {
        const timeline: any[] = [];
        if (!trip) return timeline;

        (trip.wallets || []).forEach(wallet => {
            const lots = (wallet as any).lots || [];
            let topUpIndex = 0;

            lots.forEach((lot: any, idx: number) => {
                const entryKind = lot.entryKind || (idx === 0 ? 'initial' : 'top_up');
                if (entryKind === 'top_up') topUpIndex += 1;

                const homeAmount = lot.sourceCurrency === homeCurrency
                    ? Number(lot.sourceAmount || 0)
                    : Number(lot.originalConvertedAmount || 0) * Number(lot.rateBaseCurrency || lot.lockedRate || 0);

                timeline.push({
                    type: 'deposit',
                    lot,
                    idx,
                    entryKind,
                    topUpIndex,
                    walletCurrency: wallet.currency,
                    homeAmount,
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
                homeAmount: -(expense.convertedAmountHome || expense.amount || 0),
                timestamp: expense.time,
            });
        });

        timeline.sort((a, b) => a.timestamp - b.timestamp);

        let runningBalanceHome = 0;
        return timeline.map(entry => {
            runningBalanceHome += entry.homeAmount;
            return {
                ...entry,
                balanceAfterHome: runningBalanceHome,
            };
        });
    }, [homeCurrency, trip, tripActivities, tripExpenses]);

    const movementsTimeline = useMemo(
        () => groupTimelineByDate(fullTimeline.filter(entry => entry.type === 'deposit')),
        [fullTimeline]
    );

    const spendingTimeline = useMemo(
        () => groupTimelineByDate(fullTimeline.filter(
            entry => entry.type === 'expense' && entry.expense?.name !== 'Manual Adjustment'
        )),
        [fullTimeline]
    );

    return {
        homeCurrency,
        activeFundsAmount,
        activeFundsCurrency,
        movementsTimeline,
        spendingTimeline,
        walletCurrencies,
    };
}
