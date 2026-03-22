import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useStore } from '../../../store/useStore';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Calculations as MathUtils } from '../../../utils/mathUtils';
import { useTripWallet } from '../../trip/hooks/useTripWallet';
import { Activity } from '../../../types/models';

export const useCreateActivity = (tripId: string, activityId?: string) => {
    const router = useRouter();
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const addActivity = useStore(state => state.addActivity);
    const updateActivity = useStore(state => state.updateActivity);
    const currencyRates = useStore(state => state.currencyRates);
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    const editingActivity = useMemo(() => activities.find(a => a.id === activityId), [activities, activityId]);
    const currentTrip = useMemo(() => trips.find(t => t.id === tripId), [trips, tripId]);
    const tripCountries = useMemo(() => currentTrip?.countries || [], [currentTrip]);
    const { canEdit: isAdmin } = usePermissions(tripId);

    const { 
        walletsStats, 
        homeCurrency,
        totalWalletBalanceHome,
        totalExchangedHome
    } = useTripWallet(tripId);
    
    // Form State
    const [title, setTitle] = useState('');
    const [allocatedBudget, setAllocatedBudget] = useState('');
    const [category, setCategory] = useState('Sightseeing');
    const [description, setDescription] = useState('');
    const [selectedCountries, setSelectedCountries] = useState<string[]>(editingActivity?.countries || currentTrip?.countries || []);
    const [date, setDate] = useState<dayjs.Dayjs | null>(editingActivity ? dayjs(editingActivity.date) : null);
    const [startTime, setStartTime] = useState<dayjs.Dayjs | null>(editingActivity ? dayjs(editingActivity.time) : (date ? date.hour(9).minute(0) : dayjs().hour(9).minute(0)));
    const [endTime, setEndTime] = useState<dayjs.Dayjs | null>(editingActivity ? dayjs(editingActivity.endTime || editingActivity.time + 3600000) : (date ? date.hour(10).minute(0) : dayjs().hour(10).minute(0)));
    const [actualCost, setActualCost] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Member attribution — auto-detect from auth
    const { userId } = useAuth();
    const tripMembers = currentTrip?.members || [];
    const currentMember = useMemo(() => {
        if (!userId) return tripMembers.find(m => m.isCreator) || null;
        return tripMembers.find(m => m.userId === userId) || tripMembers.find(m => m.isCreator) || null;
    }, [tripMembers, userId]);
    const currentMemberId = currentMember?.id ?? null;

    // Country-based wallet (used for default currency derivation — breaks circular dep)
    const countryWallet = useMemo(() => {
        const primaryCountry = selectedCountries[0] || currentTrip?.countries[0];
        return walletsStats.find(w => w.country === primaryCountry) || walletsStats[0];
    }, [walletsStats, selectedCountries, currentTrip]);

    const tripCurrency = countryWallet?.currency || '';

    const [budgetCurrency, setBudgetCurrency] = useState(tripCurrency);
    const [actualCurrency, setActualCurrency] = useState(tripCurrency);

    // Active wallet: routes to currency-matching wallet when budgetCurrency differs
    const activeWallet = useMemo(() => {
        if (budgetCurrency && budgetCurrency !== countryWallet?.currency) {
            const walletByCurrency = walletsStats.find(w => w.currency === budgetCurrency);
            if (walletByCurrency) return walletByCurrency;
        }
        return countryWallet;
    }, [walletsStats, budgetCurrency, countryWallet]);

    const effectiveRate = activeWallet?.effectiveRate || 1;

    // Modals
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
    const [currencyTarget, setCurrencyTarget] = useState<'budget' | 'actual'>('budget');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    // Initialize state if editing
    useEffect(() => {
        if (editingActivity) {
            setTitle(editingActivity.title);
            setAllocatedBudget((editingActivity.allocatedBudget || 0).toString());
            setBudgetCurrency(editingActivity.budgetCurrency || tripCurrency);
            setSelectedCountries(editingActivity.countries || []);
            setCategory(editingActivity.category);
            setDate(dayjs(editingActivity.date));
            setStartTime(dayjs(editingActivity.time));
            setEndTime(dayjs(editingActivity.endTime || editingActivity.time + 3600000));
            setDescription(editingActivity.description || '');
            setActualCurrency(tripCurrency);
        } else if (currentTrip) {
            setSelectedCountries(currentTrip.countries || []);
        }
    }, [editingActivity, currentTrip]);

    // Dynamic calculation of actual cost in selected currency
    const calculatedTotalSpent = useMemo(() => {
        if (!editingActivity?.expenses?.length) return 0;
        
        return editingActivity.expenses.reduce((sum, exp) => {
            // Use pre-converted amounts matching the UI selection
            if (actualCurrency === tripCurrency) {
                return sum + (exp.convertedAmountTrip || exp.amount);
            }
            if (actualCurrency === homeCurrency) {
                return sum + (exp.convertedAmountHome || (exp.amount / (effectiveRate || 1)));
            }
            
            // Fallback for other currencies (though UI only allows trip/home for now)
            if (exp.currency === actualCurrency) return sum + exp.amount;
            
            return sum;
        }, 0);
    }, [editingActivity?.expenses, actualCurrency, tripCurrency, homeCurrency, effectiveRate]);

    // Update actualCost input when currency changes or expenses change
    useEffect(() => {
        if (editingActivity) {
            setActualCost(calculatedTotalSpent > 0 ? calculatedTotalSpent.toFixed(2) : '');
        }
    }, [actualCurrency, calculatedTotalSpent]);

    const handleSave = () => {
        if (!isAdmin) return;
        const newErrors: Record<string, string> = {};
        if (!title.trim()) newErrors.title = 'Title is required';
        if (allocatedBudget === '' || allocatedBudget === undefined) newErrors.budget = 'Budget is required';
        if (!date) newErrors.date = 'Date is required';
        if (!startTime) newErrors.startTime = 'Start time is required';
        if (!endTime) newErrors.endTime = 'End time is required';
        if (!category) newErrors.category = 'Category is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const numericBudget = MathUtils.parseCurrencyInput(allocatedBudget);
        if (numericBudget < 0) {
            setErrors({ ...newErrors, budget: 'Budget cannot be negative' });
            return;
        }

        // Route to wallet by currency first, then by country
        const walletByCurrency = currentTrip?.wallets?.find(w => w.currency === budgetCurrency);
        const primaryCountry = selectedCountries[0] || currentTrip?.countries[0];
        const countryMatchWallet = currentTrip?.wallets?.find(w => w.country === primaryCountry);
        const walletId = (walletByCurrency || countryMatchWallet)?.id || currentTrip?.wallets?.[0]?.id;

        const activityData: any = {
            tripId,
            walletId,
            title: title.trim(),
            allocatedBudget: numericBudget,
            budgetCurrency,
            date: date!.valueOf(),
            time: startTime!.valueOf(),
            endTime: endTime!.valueOf(),
            countries: selectedCountries,
            category,
            description: description.trim(),
            isCompleted: editingActivity?.isCompleted || false,
            createdBy: editingActivity?.createdBy || currentMemberId || undefined,
            lastModifiedBy: currentMemberId || undefined,
        };

        if (activityId) {
            let finalExpenses = editingActivity ? [...editingActivity.expenses] : [];
            const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;

            if (numericActualCost !== null) {
                const currentSpent = calculatedTotalSpent;

                if (Math.abs(numericActualCost - currentSpent) > 0.01) {
                    const diff = numericActualCost - currentSpent;
                    
                    // Convert diff to wallet (trip) currency and home currency
                    // effectiveRate = home per wallet (e.g. 1 MYR = 15.3 PHP → rate=15.3)
                    // fromHome: homeAmount / rate  |  toHome: tripAmount * rate
                    let amountInTrip = diff;
                    let amountInHome = diff;
                    if (actualCurrency === homeCurrency) {
                        // diff is in home currency → convert to wallet currency
                        amountInTrip = diff / (effectiveRate || 1);
                        amountInHome = diff;
                    } else {
                        // diff is in wallet/trip currency → convert to home
                        amountInTrip = diff;
                        amountInHome = diff * (effectiveRate || 1);
                    }

                    finalExpenses.push({
                        id: MathUtils.generateId(),
                        tripId,
                        walletId: walletId || '',
                        activityId: activityId || '',
                        name: 'Manual Adjustment',
                        category: 'Other',
                        amount: amountInTrip,
                        currency: activeWallet?.currency || tripCurrency,
                        convertedAmountHome: amountInHome,
                        convertedAmountTrip: amountInTrip,
                        date: Date.now(),
                        time: Date.now(),
                        originalAmount: diff,
                        originalCurrency: actualCurrency,
                        createdBy: currentMemberId || undefined,
                    });
                }
            }
            activityData.expenses = finalExpenses;
            updateActivity(activityId, activityData);
        } else {
            addActivity(activityData);
        }

        router.back();
    };

    const toggleCountry = (c: string) => {
        if (selectedCountries.includes(c)) {
            setSelectedCountries(selectedCountries.filter(item => item !== c));
        } else {
            setSelectedCountries([...selectedCountries, c]);
        }
        if (errors.countries) setErrors(prev => ({ ...prev, countries: '' }));
    };

    return {
        // State
        title, setTitle,
        allocatedBudget, setAllocatedBudget,
        category, setCategory,
        description, setDescription,
        budgetCurrency, setBudgetCurrency,
        actualCurrency, setActualCurrency,
        selectedCountries, setSelectedCountries,
        date, setDate,
        startTime, setStartTime,
        endTime, setEndTime,
        actualCost, setActualCost,
        errors, setErrors,
        
        // UI State
        isDark, isAdmin,
        isCurrencyModalVisible, setIsCurrencyModalVisible,
        currencyTarget, setCurrencyTarget,
        showDatePicker, setShowDatePicker,
        showStartTimePicker, setShowStartTimePicker,
        showEndTimePicker, setShowEndTimePicker,
        
        // Data
        tripCurrency, homeCurrency,
        tripCountries, currentTrip, editingActivity,
        availableCurrencies: [tripCurrency, homeCurrency].filter(Boolean),
        totalWalletBalanceHome, totalExchangedHome,
        tripMembers, currentMemberId,

        // Actions
        handleSave, toggleCountry
    };
};
