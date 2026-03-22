import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { CurrencyConversionService } from '../services/currencyConversion';

export const useWalletExchangeRate = (tripId: string, walletId: string) => {
    const { trips, updateTrip } = useStore();
    const trip = useStore(state => state.trips.find(t => t.id === tripId));
    const wallet = useMemo(() => trip?.wallets.find(w => w.id === walletId), [trip, walletId]);

    const baselineRate = useMemo(() => {
        // Preference: 1. baselineExchangeRate (New System), 2. defaultRate (Legacy/Initialization)
        return wallet?.baselineExchangeRate || (1 / (wallet?.defaultRate || 1));
    }, [wallet]);

    const setBaselineRate = (rate: number, source: 'initial' | 'user' = 'user') => {
        if (!trip || !wallet) return;

        const updatedWallets = trip.wallets.map(w => 
            w.id === walletId ? { ...w, baselineExchangeRate: rate, baselineSource: source } : w
        );

        updateTrip(tripId, { wallets: updatedWallets });
    };

    return {
        baselineRate,
        baselineSource: wallet?.baselineSource,
        setBaselineRate,
        isBaselineSet: !!wallet?.baselineExchangeRate
    };
};
