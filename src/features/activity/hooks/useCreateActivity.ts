import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useStore } from '../../../store/useStore';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Calculations as MathUtils } from '../../../utils/mathUtils';
import { findCurrentTripMember, getDisplayTripMembers } from '../../../utils/memberAttribution';
import { useTripWallet } from '../../trip/hooks/useTripWallet';
import {
    buildActualExpense,
    calculateDisplayedActualTotal,
    reconcileActualExpenses,
} from './createActivity.helpers';

export const useCreateActivity = (tripId: string, activityId?: string) => {
    const router = useRouter();
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const addActivity = useStore(state => state.addActivity);
    const updateActivity = useStore(state => state.updateActivity);
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
    const [isSaving, setIsSaving] = useState(false);

    // Member attribution — auto-detect from auth
    const { userId, email } = useAuth();
    const tripMembers = useMemo(() => getDisplayTripMembers(currentTrip), [currentTrip]);
    const currentMember = useMemo(() => {
        return findCurrentTripMember(currentTrip, { userId, email });
    }, [currentTrip, email, userId]);
    const currentMemberId = currentMember?.id ?? null;

    // Country-based wallet (used for default currency derivation — breaks circular dep)
    const countryWallet = useMemo(() => {
        const primaryCountry = selectedCountries[0] || currentTrip?.countries[0];
        return walletsStats.find(w => w.country === primaryCountry) || walletsStats[0];
    }, [walletsStats, selectedCountries, currentTrip]);

    const tripCurrency = countryWallet?.currency || '';

    const [budgetCurrency, setBudgetCurrency] = useState(tripCurrency);
    const [actualCurrency, setActualCurrencyState] = useState(tripCurrency);

    // Active wallet: routes to currency-matching wallet when budgetCurrency differs
    const activeWallet = useMemo(() => {
        if (budgetCurrency && budgetCurrency !== countryWallet?.currency) {
            const walletByCurrency = walletsStats.find(w => w.currency === budgetCurrency);
            if (walletByCurrency) return walletByCurrency;
        }
        return countryWallet;
    }, [walletsStats, budgetCurrency, countryWallet]);
    const budgetAvailableCurrencies = useMemo(() => {
        const currencies = new Set<string>();
        const scopedCountries = selectedCountries.length > 0 ? selectedCountries : (currentTrip?.countries || []);
        const scopedWallets = walletsStats.filter(wallet =>
            scopedCountries.length === 0 || scopedCountries.includes(wallet.country)
        );

        scopedWallets.forEach(wallet => {
            if (wallet.currency) currencies.add(wallet.currency);
        });
        if (homeCurrency) currencies.add(homeCurrency);

        return Array.from(currencies);
    }, [currentTrip?.countries, homeCurrency, selectedCountries, walletsStats]);
    const actualAvailableCurrencies = useMemo(() => {
        const currencies = new Set<string>();
        if (activeWallet?.currency) currencies.add(activeWallet.currency);
        if (homeCurrency) currencies.add(homeCurrency);
        return Array.from(currencies);
    }, [activeWallet?.currency, homeCurrency]);

    const effectiveRate = activeWallet?.effectiveRate || 1;
    const activeWalletBalanceTrip = activeWallet?.balance || 0;
    const activeWalletBalanceHome = activeWallet?.homeEquivalent ?? (activeWalletBalanceTrip * effectiveRate);
    const reclaimableTripAmount = useMemo(() => {
        if (!editingActivity?.expenses?.length || !activeWallet?.walletId) return 0;
        return editingActivity.expenses.reduce((sum, exp) => (
            exp.walletId === activeWallet.walletId
                ? sum + (exp.convertedAmountTrip || exp.amount || 0)
                : sum
        ), 0);
    }, [activeWallet?.walletId, editingActivity?.expenses]);
    const reclaimableHomeAmount = useMemo(() => {
        if (!editingActivity?.expenses?.length || !activeWallet?.walletId) return 0;
        return editingActivity.expenses.reduce((sum, exp) => (
            exp.walletId === activeWallet.walletId
                ? sum + (exp.convertedAmountHome || 0)
                : sum
        ), 0);
    }, [activeWallet?.walletId, editingActivity?.expenses]);
    const actualWalletAvailableSelected = actualCurrency === homeCurrency
        ? activeWalletBalanceHome
        : activeWalletBalanceTrip;
    const actualCostCapacitySelected = actualCurrency === homeCurrency
        ? activeWalletBalanceHome + reclaimableHomeAmount
        : activeWalletBalanceTrip + reclaimableTripAmount;
    const parsedActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;
    const actualCostValidationError = parsedActualCost !== null && parsedActualCost > actualCostCapacitySelected + 0.01
        ? `Not enough balance in this wallet. Editable limit: ${MathUtils.formatCurrency(actualCostCapacitySelected, actualCurrency || tripCurrency || homeCurrency)}.`
        : '';
    const actualCostHelperText = (editingActivity?.expenses?.length ?? 0) > 0
        ? `Available in wallet now: ${MathUtils.formatCurrency(actualWalletAvailableSelected, actualCurrency || tripCurrency || homeCurrency)}.${actualCostCapacitySelected > actualWalletAvailableSelected + 0.01 ? ` Editable limit: ${MathUtils.formatCurrency(actualCostCapacitySelected, actualCurrency || tripCurrency || homeCurrency)} including this activity's current expense.` : ''}`
        : `Available in wallet now: ${MathUtils.formatCurrency(actualWalletAvailableSelected, actualCurrency || tripCurrency || homeCurrency)}. Add an expense first to enable editing the actual cost.`;

    // Modals
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
    const [currencyTarget, setCurrencyTarget] = useState<'budget' | 'actual'>('budget');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    // Initialize form state once when editing — uses a ref guard so that sync
    // updates to the same activity never overwrite the user's in-progress edits.
    const initRef = useRef<string | null>(null);
    const saveLockRef = useRef(false);
    const costInitRef = useRef(false);

    useEffect(() => {
        if (editingActivity) {
            if (initRef.current === editingActivity.id) return;

            initRef.current = editingActivity.id;
            costInitRef.current = false;
            setTitle(editingActivity.title);
            setAllocatedBudget((editingActivity.allocatedBudget || 0).toString());
            setBudgetCurrency(editingActivity.budgetCurrency || tripCurrency);
            setSelectedCountries(editingActivity.countries || []);
            setCategory(editingActivity.category);
            setDate(dayjs(editingActivity.date));
            setStartTime(dayjs(editingActivity.time));
            setEndTime(dayjs(editingActivity.endTime || editingActivity.time + 3600000));
            setDescription(editingActivity.description || '');
            setActualCurrencyState(tripCurrency);
            return;
        }

        if (!currentTrip || initRef.current === currentTrip.id) return;

        initRef.current = currentTrip.id;
        costInitRef.current = false;
        setSelectedCountries(currentTrip.countries || []);
    }, [currentTrip, editingActivity, tripCurrency]);

    useEffect(() => {
        if (!budgetAvailableCurrencies.length) return;
        if (!budgetAvailableCurrencies.includes(budgetCurrency)) {
            setBudgetCurrency(budgetAvailableCurrencies[0]);
        }
    }, [budgetAvailableCurrencies, budgetCurrency]);

    useEffect(() => {
        if (!actualAvailableCurrencies.length) return;
        if (!actualAvailableCurrencies.includes(actualCurrency)) {
            setActualCurrencyState(actualAvailableCurrencies[0]);
        }
    }, [actualAvailableCurrencies, actualCurrency]);

    // Dynamic calculation of actual cost in selected currency
    const calculatedTotalSpent = useMemo(() => {
        if (!editingActivity?.expenses?.length) return 0;
        return calculateDisplayedActualTotal(
            editingActivity.expenses,
            actualCurrency,
            tripCurrency,
            homeCurrency,
            effectiveRate
        );
    }, [editingActivity?.expenses, actualCurrency, tripCurrency, homeCurrency, effectiveRate]);

    // Initialize actualCost once from calculated total — uses same ref guard
    // so sync updates never overwrite the user's typed value.
    useEffect(() => {
        if (!editingActivity || costInitRef.current || calculatedTotalSpent <= 0) return;
        costInitRef.current = true;
        setActualCost(calculatedTotalSpent.toFixed(2));
    }, [calculatedTotalSpent, editingActivity]);

    // When the user explicitly changes currency, recalculate displayed cost.
    // Wrapped in a handler so it only fires on user action, not on sync.
    const handleActualCurrencyChange = (newCurrency: string) => {
        setActualCurrencyState(newCurrency);
        if (editingActivity) {
            const recalc = calculateDisplayedActualTotal(
                editingActivity.expenses || [],
                newCurrency,
                tripCurrency,
                homeCurrency,
                effectiveRate
            );
            setActualCost(recalc > 0 ? recalc.toFixed(2) : '');
        }
    };

    const handleSave = async () => {
        if (saveLockRef.current) return;
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
        if (actualCostValidationError) {
            setErrors({ ...newErrors, actualCost: actualCostValidationError });
            return;
        }

        saveLockRef.current = true;
        setIsSaving(true);

        try {
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
                activityData.expenses = reconcileActualExpenses({
                    actualCost,
                    actualCurrency,
                    activeWalletCurrency: activeWallet?.currency || tripCurrency,
                    currentMemberId,
                    currentSpent: calculatedTotalSpent,
                    editingActivity: editingActivity || {},
                    effectiveRate,
                    homeCurrency,
                    tripCurrency,
                    tripId,
                    walletId: walletId || '',
                    activityId,
                });
                await updateActivity(activityId, activityData);
            } else {
                const initialExpense = buildActualExpense({
                    actualCost,
                    actualCurrency,
                    activeWalletCurrency: activeWallet?.currency || tripCurrency,
                    category,
                    currentMemberId,
                    dateValue: date!.valueOf(),
                    effectiveRate,
                    homeCurrency,
                    title,
                    tripCurrency,
                    tripId,
                    walletId: walletId || '',
                });
                if (initialExpense) {
                    activityData.expenses = [initialExpense];
                }
                await addActivity(activityData);
            }

            router.replace(`/trip/${tripId}` as any);
        } finally {
            saveLockRef.current = false;
            setIsSaving(false);
        }
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
        actualCurrency, setActualCurrency: handleActualCurrencyChange,
        selectedCountries, setSelectedCountries,
        date, setDate,
        startTime, setStartTime,
        endTime, setEndTime,
        actualCost, setActualCost,
        errors, setErrors,
        actualCostHelperText,
        actualCostValidationError,
        
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
        budgetAvailableCurrencies,
        actualAvailableCurrencies,
        totalWalletBalanceHome, totalExchangedHome,
        tripMembers, currentMemberId,

        // Derived
        hasExpenses: (editingActivity?.expenses?.length ?? 0) > 0,
        isSaving,

        // Actions
        handleSave, toggleCountry
    };
};
