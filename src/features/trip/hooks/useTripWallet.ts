import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { getWalletBalance, getFundingTotalGlobalHome, getDefaultLot } from '../../../finance/wallet/walletEngine';

export const useTripWallet = (tripId: string) => {
    const trip = useStore(state => state.trips.find(t => t.id === tripId));
    const homeCurrency = trip?.homeCurrency || 'PHP';

    const walletsStats = useMemo(() => {
        if (!trip?.wallets) return [];

        return trip.wallets.map(wallet => {
            const lots = (wallet as any).lots || [];
            // Use the latest/default lot for future conversions, but keep totals
            // historical by summing each lot at its own stored rate.
            const defaultLot = getDefaultLot(wallet as any);
            const lockedRate = defaultLot?.lockedRate || (wallet as any).baselineExchangeRate || 1;

            const balance = getWalletBalance(wallet as any);
            const fundingTotalBase = getFundingTotalGlobalHome(wallet as any, homeCurrency);
            const addedBudget = lots.reduce((sum: number, lot: any, index: number) => {
                const entryKind = lot.entryKind || (index === 0 ? 'initial' : 'top_up');
                if (entryKind === 'initial') return sum;
                return sum + (lot.originalConvertedAmount ?? lot.convertedAmount ?? 0);
            }, 0);

            return {
                walletId: wallet.id,
                country: wallet.country,
                currency: wallet.currency,
                totalSpent: lots.reduce(
                    (sum: number, lot: any) =>
                        sum + ((lot.originalConvertedAmount ?? lot.convertedAmount ?? 0) - (lot.remainingAmount || 0)),
                    0
                ),
                addedBudget,
                totalExchangedTrip: lots.reduce(
                    (sum: number, lot: any) => sum + (lot.originalConvertedAmount ?? lot.convertedAmount ?? 0),
                    0
                ),
                totalExchangedHome: fundingTotalBase,
                balance,
                effectiveRate: lockedRate,
                defaultRate: wallet.defaultRate,
                // Keep remaining balances historical per lot. Repricing all leftover
                // funds using the newest default rate distorts wallets after top-ups.
                homeEquivalent: lots.reduce((sum: number, lot: any) => {
                    const originalConvertedAmount = Number(lot.originalConvertedAmount ?? lot.convertedAmount ?? 0);
                    const remainingAmount = Number(lot.remainingAmount || 0);
                    if (remainingAmount <= 0) return sum;

                    if (lot.sourceCurrency === homeCurrency) {
                        const sourceAmount = Number(lot.sourceAmount || 0);
                        const proportionalHome = originalConvertedAmount > 0
                            ? (sourceAmount * remainingAmount) / originalConvertedAmount
                            : remainingAmount * Number(lot.lockedRate || lockedRate || 0);
                        return sum + proportionalHome;
                    }

                    const homeRate = Number(lot.rateBaseCurrency || 0);
                    if (homeRate > 0) {
                        return sum + (remainingAmount * homeRate);
                    }

                    const sourceAmount = Number(lot.sourceAmount || 0);
                    const fallbackHome = originalConvertedAmount > 0
                        ? (sourceAmount * remainingAmount) / originalConvertedAmount
                        : 0;
                    return sum + fallbackHome;
                }, 0),
            };
        });
    }, [trip, homeCurrency]);

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

    return {
        trip,
        walletsStats,
        totalWalletBalanceHome,
        totalWalletBalanceTrip,
        totalExchangedHome,
        homeCurrency,
    };
};
