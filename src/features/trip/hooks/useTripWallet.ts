import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { getFundingTotalGlobalHome, getDefaultLot } from '../../../finance/wallet/walletEngine';
import {
    getNormalizedFundingRate,
    getNormalizedLotTripAmount,
    getWalletBaselineHomeRate,
} from '../../../finance/wallet/walletRate';

export const useTripWallet = (tripId: string) => {
    const trip = useStore(state => state.trips.find(t => t.id === tripId));
    const allExpenses = useStore(state => state.expenses);
    const homeCurrency = trip?.homeCurrency || 'PHP';

    const walletSpendTotals = useMemo(() => {
        return allExpenses
            .filter(expense => expense.tripId === tripId)
            .reduce<Record<string, { trip: number; home: number }>>((acc, expense) => {
                const walletId = expense.walletId || '';
                if (!walletId) return acc;

                if (!acc[walletId]) {
                    acc[walletId] = { trip: 0, home: 0 };
                }

                acc[walletId].trip += Number(expense.convertedAmountTrip || expense.amount || 0);
                acc[walletId].home += Number(expense.convertedAmountHome || 0);
                return acc;
            }, {});
    }, [allExpenses, tripId]);

    const walletsStats = useMemo(() => {
        if (!trip?.wallets) return [];

        return trip.wallets.map(wallet => {
            const lots = (wallet as any).lots || [];
            const latestFundingAt = lots.reduce((latest: number, lot: any) => {
                const createdAt = Number(lot?.createdAt || 0);
                return createdAt > latest ? createdAt : latest;
            }, 0);
            // Use the latest/default lot for future conversions, but keep totals
            // historical by summing each lot at its own stored rate.
            const defaultLot = getDefaultLot(wallet as any);
            const effectiveRate = getNormalizedFundingRate({
                homeCurrency,
                sourceCurrency: defaultLot?.sourceCurrency || homeCurrency,
                storedRate: Number(defaultLot?.lockedRate || 0),
                wallet,
            }) || getWalletBaselineHomeRate(wallet as any) || 1;

            const fundingTotalBase = getFundingTotalGlobalHome(wallet as any, homeCurrency);
            const totalExchangedTrip = lots.reduce(
                (sum: number, lot: any) => sum + getNormalizedLotTripAmount(lot, wallet as any, homeCurrency),
                0
            );
            const addedBudget = lots.reduce((sum: number, lot: any, index: number) => {
                const entryKind = lot.entryKind || (index === 0 ? 'initial' : 'top_up');
                if (entryKind === 'initial') return sum;
                return sum + getNormalizedLotTripAmount(lot, wallet as any, homeCurrency);
            }, 0);
            const spentTrip = walletSpendTotals[wallet.id]?.trip ?? Number(wallet.spentAmount || 0);
            const spentHome = walletSpendTotals[wallet.id]?.home ?? 0;
            const cycleSpend = allExpenses.reduce((sum, expense) => {
                if (expense.tripId !== tripId || expense.walletId !== wallet.id) return sum;
                const expenseTimestamp = Number(expense.time || expense.date || 0);
                if (latestFundingAt > 0 && expenseTimestamp < latestFundingAt) return sum;

                return {
                    trip: sum.trip + Number(expense.convertedAmountTrip || expense.amount || 0),
                    home: sum.home + Number(expense.convertedAmountHome || 0),
                };
            }, { trip: 0, home: 0 });
            const balance = Math.max(0, totalExchangedTrip - spentTrip);
            const homeEquivalent = Math.max(0, fundingTotalBase - spentHome);
            const cycleCapacityTrip = Math.max(balance + cycleSpend.trip, balance, totalExchangedTrip > 0 ? Math.min(totalExchangedTrip, balance + cycleSpend.trip) : 0);
            const cycleCapacityHome = Math.max(homeEquivalent + cycleSpend.home, homeEquivalent, fundingTotalBase > 0 ? Math.min(fundingTotalBase, homeEquivalent + cycleSpend.home) : 0);

            return {
                walletId: wallet.id,
                country: wallet.country,
                currency: wallet.currency,
                totalSpent: spentTrip,
                addedBudget,
                totalExchangedTrip,
                totalExchangedHome: fundingTotalBase,
                balance,
                effectiveRate,
                defaultRate: wallet.defaultRate,
                cycleCapacityTrip,
                cycleCapacityHome,
                // Server wallet lots can be rebuilt without expense deductions, so derive
                // remaining home value from funding totals minus synced expense totals.
                homeEquivalent,
            };
        });
    }, [allExpenses, homeCurrency, trip, tripId, walletSpendTotals]);

    const totalWalletBalanceHome = useMemo(
        () => walletsStats.reduce((sum, w) => sum + w.homeEquivalent, 0),
        [walletsStats]
    );

    const totalWalletBalanceTrip = useMemo(
        () => walletsStats.reduce((sum, w) => sum + w.balance, 0),
        [walletsStats]
    );

    const totalExchangedHome = useMemo(
        () => walletsStats.reduce((sum, w) => sum + w.totalExchangedHome, 0),
        [walletsStats]
    );

    const totalCycleCapacityHome = useMemo(
        () => walletsStats.reduce((sum, w) => sum + w.cycleCapacityHome, 0),
        [walletsStats]
    );

    const totalCycleCapacityTrip = useMemo(
        () => walletsStats.reduce((sum, w) => sum + w.cycleCapacityTrip, 0),
        [walletsStats]
    );

    return {
        trip,
        walletsStats,
        totalWalletBalanceHome,
        totalWalletBalanceTrip,
        totalExchangedHome,
        totalCycleCapacityHome,
        totalCycleCapacityTrip,
        homeCurrency,
    };
};
