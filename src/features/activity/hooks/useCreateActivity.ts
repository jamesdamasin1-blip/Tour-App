import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { useStore } from '../../../store/useStore';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import { Calculations as MathUtils } from '../../../utils/mathUtils';
import { useTripWallet } from '../../trip/hooks/useTripWallet';
import { Expense } from '../../../types/models';

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

    // Initialize form state once when editing — uses a ref guard so that sync
    // updates to the same activity never overwrite the user's in-progress edits.
    const initRef = useRef<string | null>(null);
    if (editingActivity && initRef.current !== editingActivity.id) {
        initRef.current = editingActivity.id;
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
    } else if (!editingActivity && currentTrip && initRef.current !== currentTrip.id) {
        initRef.current = currentTrip.id;
        setSelectedCountries(currentTrip.countries || []);
    }

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

    // Initialize actualCost once from calculated total — uses same ref guard
    // so sync updates never overwrite the user's typed value.
    const costInitRef = useRef(false);
    if (editingActivity && !costInitRef.current && calculatedTotalSpent > 0) {
        costInitRef.current = true;
        setActualCost(calculatedTotalSpent.toFixed(2));
    }

    // When the user explicitly changes currency, recalculate displayed cost.
    // Wrapped in a handler so it only fires on user action, not on sync.
    const handleActualCurrencyChange = (newCurrency: string) => {
        setActualCurrency(newCurrency);
        if (editingActivity) {
            // Recalculate using the new currency selection
            const recalc = (editingActivity.expenses || []).reduce((sum, exp) => {
                if (newCurrency === tripCurrency) {
                    return sum + (exp.convertedAmountTrip || exp.amount);
                }
                if (newCurrency === homeCurrency) {
                    return sum + (exp.convertedAmountHome || (exp.amount / (effectiveRate || 1)));
                }
                if (exp.currency === newCurrency) return sum + exp.amount;
                return sum;
            }, 0);
            setActualCost(recalc > 0 ? recalc.toFixed(2) : '');
        }
    };

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

        const buildActualExpense = (expenseActivityId?: string): Expense | null => {
            const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;
            if (numericActualCost === null || numericActualCost <= 0) return null;

            let amountInTrip = numericActualCost;
            let amountInHome = numericActualCost;
            if (actualCurrency === homeCurrency) {
                amountInTrip = numericActualCost / (effectiveRate || 1);
                amountInHome = numericActualCost;
            } else {
                amountInTrip = numericActualCost;
                amountInHome = numericActualCost * (effectiveRate || 1);
            }

            return {
                id: MathUtils.generateId(),
                tripId,
                walletId: walletId || '',
                activityId: expenseActivityId,
                name: title.trim() || 'Manual Entry',
                category: category as any,
                amount: amountInTrip,
                currency: activeWallet?.currency || tripCurrency,
                convertedAmountHome: amountInHome,
                convertedAmountTrip: amountInTrip,
                date: date!.valueOf(),
                time: Date.now(),
                originalAmount: numericActualCost,
                originalCurrency: actualCurrency,
                createdBy: currentMemberId || undefined,
                lastModifiedBy: currentMemberId || undefined,
                version: 1,
            };
        };

        if (activityId) {
            let finalExpenses = editingActivity ? [...editingActivity.expenses] : [];
            const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;

            if (numericActualCost !== null) {
                const currentSpent = calculatedTotalSpent;

                const diff = numericActualCost - currentSpent;
                if (diff > 0.01) {
                    // User increased cost: add an adjustment expense for the difference.
                    // effectiveRate = home per wallet (e.g. 1 MYR = 15.3 PHP → rate=15.3)
                    let amountInTrip = diff;
                    let amountInHome = diff;
                    if (actualCurrency === homeCurrency) {
                        amountInTrip = diff / (effectiveRate || 1);
                        amountInHome = diff;
                    } else {
                        amountInTrip = diff;
                        amountInHome = diff * (effectiveRate || 1);
                    }

                    finalExpenses.push({
                        id: MathUtils.generateId(),
                        tripId,
                        walletId: walletId || '',
                        activityId: activityId || '',
                        name: editingActivity?.title || 'Cost Adjustment',
                        category: (editingActivity?.category as any) || 'Other',
                        amount: amountInTrip,
                        currency: activeWallet?.currency || tripCurrency,
                        convertedAmountHome: amountInHome,
                        convertedAmountTrip: amountInTrip,
                        date: Date.now(),
                        time: Date.now(),
                        originalAmount: diff,
                        originalCurrency: actualCurrency,
                        createdBy: currentMemberId || undefined,
                        version: 1,
                    });
                } else if (diff < -0.01) {
                    // User reduced cost: replace ALL existing expenses with a single new one
                    // at the specified amount. The FIFO reversal happens inside updateActivity.
                    let amountInTrip: number;
                    let amountInHome: number;
                    if (actualCurrency === homeCurrency) {
                        amountInHome = numericActualCost;
                        amountInTrip = numericActualCost / (effectiveRate || 1);
                    } else {
                        amountInTrip = numericActualCost;
                        amountInHome = numericActualCost * (effectiveRate || 1);
                    }

                    finalExpenses = [{
                        id: MathUtils.generateId(),
                        tripId,
                        walletId: walletId || '',
                        activityId: activityId || '',
                        name: editingActivity?.title || 'Manual Entry',
                        category: (editingActivity?.category as any) || 'Other',
                        amount: amountInTrip,
                        currency: activeWallet?.currency || tripCurrency,
                        convertedAmountHome: amountInHome,
                        convertedAmountTrip: amountInTrip,
                        date: Date.now(),
                        time: Date.now(),
                        originalAmount: numericActualCost,
                        originalCurrency: actualCurrency,
                        createdBy: currentMemberId || undefined,
                        version: 1,
                    }];
                }
            }
            activityData.expenses = finalExpenses;
            updateActivity(activityId, activityData);
        } else {
            const initialExpense = buildActualExpense();
            if (initialExpense) {
                activityData.expenses = [initialExpense];
            }
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
        actualCurrency, setActualCurrency: handleActualCurrencyChange,
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

        // Derived
        hasExpenses: (editingActivity?.expenses?.length ?? 0) > 0,

        // Actions
        handleSave, toggleCountry
    };
};
