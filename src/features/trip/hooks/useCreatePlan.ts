import { useState, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { useStore } from '@/src/store/useStore';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { COUNTRY_CURRENCY_MAPPING } from '@/src/data/currencyMapping';
import { CurrencyService } from '../../../services/currency';
import { TripPlan } from '@/src/types/models';

export const useCreatePlan = () => {
    const router = useRouter();
    const { editId } = useLocalSearchParams<{ editId: string }>();
    const { addTrip, updateTrip, trips, theme } = useStore();
    const isDark = theme === 'dark';
    const isEditing = !!editId;

    const [title, setTitle] = useState('');
    const [homeCountry, setHomeCountry] = useState('');
    const [homeCurrency, setHomeCurrency] = useState('');
    
    // walletBudgets maps "countryCode" to budget string in Trip Currency
    const [walletBudgets, setWalletBudgets] = useState<{ [country: string]: string }>({});
    // walletHomeBudgets maps "countryCode" to budget string in Home Currency
    const [walletHomeBudgets, setWalletHomeBudgets] = useState<{ [country: string]: string }>({});
    const [walletRates, setWalletRates] = useState<{ [country: string]: string }>({});
    
    const [startDate, setStartDate] = useState<dayjs.Dayjs | null>(null);
    const [endDate, setEndDate] = useState<dayjs.Dayjs | null>(null);
    const [countries, setCountries] = useState<string[]>([]);
    
    const [validationMessage, setValidationMessage] = useState<string | null>(null);
    const [titleError, setTitleError] = useState(false);
    const [homeCountryError, setHomeCountryError] = useState(false);
    const [durationError, setDurationError] = useState(false);
    const [countriesError, setCountriesError] = useState(false);
    const [budgetErrors, setBudgetErrors] = useState<string[]>([]);

    // Update home currency when home country changes
    useEffect(() => {
        if (!homeCountry) {
            setHomeCurrency('');
            return;
        }
        const currency = COUNTRY_CURRENCY_MAPPING[homeCountry] || 'PHP';
        setHomeCurrency(currency);
        
        // Remove from trip countries if it was selected there
        setCountries(prev => prev.filter(c => c !== homeCountry));
    }, [homeCountry]);

    // Initialize budgets and rates when countries change
    useEffect(() => {
        setWalletBudgets(prev => {
            const next = { ...prev };
            countries.forEach(c => {
                if (!next[c]) next[c] = '';
            });
            // Cleanup removed countries
            Object.keys(next).forEach(k => {
                if (!countries.includes(k)) delete next[k];
            });
            return next;
        });

        setWalletHomeBudgets(prev => {
            const next = { ...prev };
            countries.forEach(c => {
                if (!next[c]) next[c] = '';
            });
            // Cleanup removed countries
            Object.keys(next).forEach(k => {
                if (!countries.includes(k)) delete next[k];
            });
            return next;
        });

        setWalletRates(prev => {
            const next = { ...prev };
            countries.forEach(c => {
                if (!next[c]) next[c] = '1';
            });
            // Cleanup removed countries
            Object.keys(next).forEach(k => {
                if (!countries.includes(k)) delete next[k];
            });
            return next;
        });
    }, [countries]);

    useEffect(() => {
        if (isEditing && editId) {
            const trip = trips.find(t => t.id === editId);
            if (trip) {
                setTitle(trip.title);
                setHomeCountry(trip.homeCountry || 'Philippines');
                setStartDate(dayjs(trip.startDate));
                setEndDate(dayjs(trip.endDate));
                setCountries(trip.countries || []);
                
                const budgets: { [c: string]: string } = {};
                const homeBudgets: { [c: string]: string } = {};
                const rates: { [c: string]: string } = {};
                trip.wallets?.forEach(w => {
                    budgets[w.country] = MathUtils.formatCurrencyInput(w.totalBudget.toString());
                    // Multiplier standard: 1 TripCurrency = X HomeCurrency
                    const rateToHome = w.baselineExchangeRate || (1 / (w.defaultRate || 1));
                    const homeVal = w.totalBudget * rateToHome;
                    homeBudgets[w.country] = MathUtils.formatCurrencyInput(homeVal.toFixed(2));
                    rates[w.country] = (w.defaultRate || 1).toString();
                });
                setWalletBudgets(budgets);
                setWalletHomeBudgets(homeBudgets);
                setWalletRates(rates);
            }
        }
    }, [isEditing, editId, trips]);

    const handleStart = () => {
        let hasError = false;
        setTitleError(false);
        setHomeCountryError(false);
        setDurationError(false);
        setCountriesError(false);
        setBudgetErrors([]);

        if (!title.trim()) { setTitleError(true); hasError = true; }
        if (!homeCountry) { setHomeCountryError(true); hasError = true; }
        if (!startDate || !endDate) { setDurationError(true); hasError = true; }
        if (countries.length === 0) { setCountriesError(true); hasError = true; }

        const currentBudgetErrors: string[] = [];
        countries.forEach(c => {
            const budgetVal = walletBudgets[c];
            const homeVal = walletHomeBudgets[c];
            const numericBudget = MathUtils.parseCurrencyInput(budgetVal || '');
            const numericHome = MathUtils.parseCurrencyInput(homeVal || '');
            
            if (!budgetVal || numericBudget <= 0 || !homeVal || numericHome <= 0) {
                currentBudgetErrors.push(c);
                hasError = true;
            }
        });
        setBudgetErrors(currentBudgetErrors);

        if (hasError) {
            setValidationMessage('Please properly fill the highlighted fields.');
            return;
        }

        const existingTrip = isEditing ? trips.find(t => t.id === editId) : null;

        const wallets = countries.map(c => {
            const currency = COUNTRY_CURRENCY_MAPPING[c] || 'USD';
            const budget = MathUtils.parseCurrencyInput(walletBudgets[c]);
            const homeEquivalent = MathUtils.parseCurrencyInput(walletHomeBudgets[c]);
            // Calculate legacy rate: TripBudget / HomeBudget
            const legacyRate = homeEquivalent > 0 ? budget / homeEquivalent : 1;
            // Calculate baseline rate: HomeBudget / TripBudget (Multiplier)
            const baselineRate = budget > 0 ? homeEquivalent / budget : 1;

            // When editing, preserve existing wallet lots (FIFO deductions) and adjust by delta
            const existingWallet = existingTrip?.wallets?.find((w: any) => w.country === c);
            if (existingWallet) {
                const oldBudget = existingWallet.totalBudget || 0;
                const delta = budget - oldBudget;

                const adjustedLots = (existingWallet.lots || []).map((lot: any) => {
                    if (lot.isDefault) {
                        return {
                            ...lot,
                            originalConvertedAmount: budget,
                            sourceAmount: homeEquivalent,
                            remainingAmount: Math.max(0, (lot.remainingAmount || 0) + delta),
                            lockedRate: baselineRate,
                        };
                    }
                    return lot;
                });

                return {
                    ...existingWallet,
                    totalBudget: budget,
                    defaultRate: legacyRate,
                    baselineExchangeRate: baselineRate,
                    lots: adjustedLots,
                };
            }

            return {
                country: c,
                currency,
                totalBudget: budget,
                defaultRate: legacyRate,
                baselineExchangeRate: baselineRate,
                baselineSource: 'initial',
                createdAt: Date.now(),
                lots: [{
                    id: MathUtils.generateId(),
                    walletCurrency: currency,
                    sourceCurrency: homeCurrency,
                    sourceAmount: homeEquivalent,
                    originalConvertedAmount: budget,
                    remainingAmount: budget,
                    lockedRate: baselineRate,
                    rateBaseCurrency: 1, // source IS home, multiplier is 1
                    isDefault: true, // first lot is always default
                    createdAt: Date.now()
                }]
            };
        });

        const tripData: any = {
            title: title.trim(),
            startDate: startDate!.valueOf(),
            endDate: endDate!.valueOf(),
            countries,
            homeCountry,
            homeCurrency,
            wallets,
            totalBudgetHomeCached: wallets.reduce((acc, w) => {
                const rateToHome = w.baselineExchangeRate || (1 / (w.defaultRate || 1));
                return acc + (w.totalBudget * rateToHome);
            }, 0),
        };

        if (isEditing && editId) {
            updateTrip(editId, tripData);
            router.back();
        } else {
            const newId = addTrip(tripData);
            router.replace(`/trip/${newId}` as any);
        }
    };

    return {
        state: {
            title, homeCountry, homeCurrency, startDate, endDate, countries,
            walletBudgets, walletHomeBudgets, walletRates,
            isDark, isEditing, validationMessage, titleError, homeCountryError, durationError, countriesError, budgetErrors
        },
        actions: {
            setTitle, setHomeCountry, setStartDate, setEndDate, setCountries,
            setWalletBudgets: (country: string, val: string) => setWalletBudgets(prev => ({ ...prev, [country]: val })),
            setWalletHomeBudgets: (country: string, val: string) => setWalletHomeBudgets(prev => ({ ...prev, [country]: val })),
            setWalletRates: (country: string, val: string) => setWalletRates(prev => ({ ...prev, [country]: val })),
            setValidationMessage, handleStart
        }
    };
};
