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
            // Rate is always from the default lot, established at trip creation
            const defaultLot = getDefaultLot(wallet as any);
            // lockedRate = sourceCurrency per walletCurrency, so to get home per wallet:
            // If sourceCurrency === homeCurrency, then 1 walletCurrency = lockedRate homeCurrency
            const lockedRate = defaultLot?.lockedRate || (wallet as any).baselineExchangeRate || 1;

            const balance = getWalletBalance(wallet as any);
            const fundingTotalBase = getFundingTotalGlobalHome(wallet as any, homeCurrency);
            const addedBudget = lots.length > 1
                ? lots.slice(1).reduce((sum: number, lot: any) => sum + (lot.originalConvertedAmount ?? lot.convertedAmount ?? 0), 0)
                : 0;

            return {
                walletId: wallet.id,
                country: wallet.country,
                currency: wallet.currency,
                totalSpent: lots.reduce((sum: number, lot: any) => sum + ((lot.originalConvertedAmount ?? lot.convertedAmount ?? 0) - (lot.remainingAmount || 0)), 0),
                addedBudget,
                totalExchangedTrip: lots.reduce((sum: number, lot: any) => sum + (lot.originalConvertedAmount ?? lot.convertedAmount ?? 0), 0),
                totalExchangedHome: fundingTotalBase,  // locked PHP total
                balance,
                effectiveRate: lockedRate,  // locked rate from trip creation, never live
                defaultRate: wallet.defaultRate,
                homeEquivalent: balance * lockedRate    // [F9] remaining balance in home currency, not total funded
            };
        });
    }, [trip, homeCurrency]);

    const totalWalletBalanceHome = useMemo(() =>
        walletsStats.reduce((sum, w) => sum + w.homeEquivalent, 0),
    [walletsStats]);

    const totalWalletBalanceTrip = useMemo(() =>
        walletsStats.reduce((sum, w) => sum + w.balance, 0),
    [walletsStats]);

    const totalExchangedHome = useMemo(() =>
        walletsStats.reduce((sum, w) => sum + w.totalExchangedHome, 0),
    [walletsStats]);

    return {
        trip,
        walletsStats,
        totalWalletBalanceHome,
        totalWalletBalanceTrip,
        totalExchangedHome,
        homeCurrency
    };
};
