import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useStore } from '../../../store/useStore';
import { CurrencyService } from '../../../services/currency';
import { useTripWallet } from '../../trip/hooks/useTripWallet';
import { useWalletExchangeRate } from '../../../hooks/useWalletExchangeRate';
import { CurrencyConversionService } from '../../../services/currencyConversion';
import dayjs from 'dayjs';
import { usePermissions } from '../../../hooks/usePermissions';

export const useAddExpense = (activityId: string) => {
    const router = useRouter();
    const { theme, addExpense, activities, trips, currencyRates } = useStore();
    const isDark = theme === 'dark';

    const activity = useMemo(() => activities.find(a => a.id === activityId), [activities, activityId]);
    const trip = useMemo(() => trips.find(t => t.id === activity?.tripId), [trips, activity]);

    const {
        walletsStats,
        homeCurrency
    } = useTripWallet(activity?.tripId || '');

    const walletStats = useMemo(() =>
        walletsStats.find(w => w.walletId === activity?.walletId),
    [walletsStats, activity?.walletId]);

    const tripCurrency = walletStats?.currency || '';

    // Currency Consistency System: Get the baseline rate
    const { baselineRate } = useWalletExchangeRate(activity?.tripId || '', activity?.walletId || '');

    const { canEdit: isAdmin, currentMember } = usePermissions(activity?.tripId || '');
    
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState(tripCurrency);
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);

    // Sync currency with trip currency on load
    useEffect(() => {
        if (tripCurrency) {
            setCurrency(tripCurrency);
        }
    }, [tripCurrency]);

    const availableCurrencies = useMemo(() => {
        return [tripCurrency, homeCurrency];
    }, [tripCurrency, homeCurrency]);

    // Always convert using the baseline rate set at trip creation stage
    const conversions = useMemo(() => {
        const value = CurrencyService.parseInput(amount);
        if (value <= 0) return { home: 0, trip: 0 };

        let amountInTrip = 0;
        let amountInHome = 0;

        if (currency === tripCurrency) {
            amountInTrip = value;
            amountInHome = CurrencyConversionService.toHome(value, baselineRate);
        } else if (currency === homeCurrency) {
            amountInHome = value;
            amountInTrip = CurrencyConversionService.fromHome(value, baselineRate);
        } else {
            // Fallback for any other currency — use baselineRate best-effort
            amountInTrip = value;
            amountInHome = CurrencyConversionService.toHome(value, baselineRate);
        }

        return { home: amountInHome, trip: amountInTrip };
    }, [amount, currency, baselineRate, tripCurrency, homeCurrency]);

    const handleSave = () => {
        if (!isAdmin || !trip || !activity) return;
        
        const value = CurrencyService.parseInput(amount);
        if (value <= 0) {
            alert('Please enter a valid amount.');
            return;
        }

        addExpense(trip.id, activity.walletId, activityId, {
            name: activity.title,
            amount: conversions.trip, // Expense Layer in Trip Currency (for wallet/budget)
            currency: tripCurrency,
            category: activity.category as any,
            date: Date.now(),
            time: Date.now(),
            originalAmount: value, // Preserving Expense Layer
            originalCurrency: currency,
            convertedAmountHome: conversions.home, // Pre-computed Home Layer
            convertedAmountTrip: conversions.trip, // Pre-computed Trip Layer
            createdBy: currentMember?.id,
        });
        
        router.back();
    };

    return {
        // State
        amount, setAmount,
        currency, setCurrency,
        isCurrencyModalVisible, setIsCurrencyModalVisible,
        
        // Data
        isDark, isAdmin,
        activity, trip,
        tripCurrency, homeCurrency,
        availableCurrencies,
        conversions,
        
        // Actions
        handleSave
    };
};
