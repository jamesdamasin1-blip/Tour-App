import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatedModal } from './AnimatedModal';
import { CurrencyInput } from './CurrencyInput';
import { GlassView } from './GlassView';
import { PressableScale } from './PressableScale';
import { RippleButton } from './RippleButton';
import { useStore } from '@/src/store/useStore';
import { Activity, ExpenseCategory } from '@/src/types/models';
import { CurrencyService } from '@/src/services/currency';
import { CurrencyConversionService } from '@/src/services/currencyConversion';
import { useTripWallet } from '../src/features/trip/hooks/useTripWallet';
import { useWalletExchangeRate } from '@/src/hooks/useWalletExchangeRate';
import { syncTrace } from '@/src/sync/debug';
import {
    PRIMARY_ACTION_HEIGHT,
    PRIMARY_ACTION_RADIUS,
    PRIMARY_ACTION_TEXT_SIZE,
} from '@/src/styles/primaryAction';
import { SpontaneousCategoryPicker } from '@/src/features/activity/components/spontaneous/SpontaneousCategoryPicker';
import { SpontaneousTripEquivalent } from '@/src/features/activity/components/spontaneous/SpontaneousTripEquivalent';
import { SpontaneousWalletSelector } from '@/src/features/activity/components/spontaneous/SpontaneousWalletSelector';

export interface SpontaneousExpenseFormData {
    walletId: string;
    title: string;
    amount: number;
    category: ExpenseCategory;
    originalAmount?: number;
    originalCurrency?: string;
    convertedAmountHome?: number;
    convertedAmountTrip?: number;
    date: number;
}

interface SpontaneousExpenseModalProps {
    visible: boolean;
    onClose: () => void;
    onLog: (data: SpontaneousExpenseFormData) => void | Promise<void>;
    tripId: string;
    date: number;
    initialActivity?: Activity | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES: ExpenseCategory[] = ['Food', 'Transport', 'Hotel', 'Sightseeing', 'Other'];

const formatInputAmount = (value?: number | null) => {
    if (!value || !Number.isFinite(value)) return '';
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

export const SpontaneousExpenseModal = ({
    visible,
    onClose,
    onLog,
    tripId,
    date,
    initialActivity = null,
}: SpontaneousExpenseModalProps) => {
    const { theme, currencyRates } = useStore();
    const isDark = theme === 'dark';
    const isEditing = !!initialActivity;
    const initForOpenRef = useRef(false);

    const { walletsStats, homeCurrency } = useTripWallet(tripId);

    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<ExpenseCategory>('Other');
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('PHP');
    const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const activeWallet = useMemo(
        () => walletsStats.find(wallet => wallet.walletId === selectedWalletId) || walletsStats[0],
        [walletsStats, selectedWalletId]
    );
    const tripCurrency = activeWallet?.currency || 'PHP';

    const { baselineRate } = useWalletExchangeRate(
        tripId,
        selectedWalletId || activeWallet?.walletId || ''
    );
    const effectiveRate = activeWallet?.effectiveRate || baselineRate || 1;

    const reclaimableTripAmount = useMemo(() => {
        if (!initialActivity?.expenses?.length || !selectedWalletId) return 0;
        return initialActivity.expenses.reduce((sum, expense) => (
            expense.walletId === selectedWalletId
                ? sum + (expense.convertedAmountTrip || expense.amount || 0)
                : sum
        ), 0);
    }, [initialActivity?.expenses, selectedWalletId]);
    const reclaimableHomeAmount = useMemo(() => {
        if (!initialActivity?.expenses?.length || !selectedWalletId) return 0;
        return initialActivity.expenses.reduce((sum, expense) => (
            expense.walletId === selectedWalletId
                ? sum + (expense.convertedAmountHome || 0)
                : sum
        ), 0);
    }, [initialActivity?.expenses, selectedWalletId]);

    const currentWalletTripBalance = activeWallet?.balance || 0;
    const currentWalletHomeBalance = activeWallet?.homeEquivalent ?? (currentWalletTripBalance * effectiveRate);
    const editableTripCapacity = currentWalletTripBalance + reclaimableTripAmount;
    const editableHomeCapacity = currentWalletHomeBalance + reclaimableHomeAmount;

    useEffect(() => {
        if (!visible) {
            initForOpenRef.current = false;
            return;
        }
        if (initForOpenRef.current || walletsStats.length === 0) return;
        initForOpenRef.current = true;

        if (initialActivity) {
            const initialExpense = initialActivity.expenses?.[0];
            const initialWalletId =
                initialExpense?.walletId ||
                initialActivity.walletId ||
                walletsStats[0].walletId;
            const wallet = walletsStats.find(item => item.walletId === initialWalletId) || walletsStats[0];
            const initialCurrency =
                initialExpense?.originalCurrency ||
                initialExpense?.currency ||
                wallet.currency;
            const initialAmount = initialExpense?.originalAmount ?? (
                initialCurrency === homeCurrency
                    ? initialExpense?.convertedAmountHome
                    : initialExpense?.convertedAmountTrip ?? initialExpense?.amount
            );

            setTitle(initialActivity.title || '');
            setAmount(formatInputAmount(initialAmount));
            setCategory(initialActivity.category || 'Other');
            setSelectedWalletId(initialWalletId);
            setSelectedCurrency(initialCurrency);
            return;
        }

        const initialWallet = walletsStats[0];
        setTitle('');
        setAmount('');
        setCategory('Other');
        setSelectedWalletId(initialWallet.walletId);
        setSelectedCurrency(initialWallet.currency);
    }, [visible, walletsStats, initialActivity, homeCurrency]);

    const conversions = useMemo(() => {
        const value = CurrencyService.parseInput(amount);
        if (value <= 0) return { home: 0, trip: 0 };

        if (selectedCurrency === tripCurrency) {
            return {
                trip: value,
                home: CurrencyConversionService.toHome(value, effectiveRate),
            };
        }

        if (selectedCurrency === homeCurrency) {
            return {
                home: value,
                trip: CurrencyConversionService.fromHome(value, effectiveRate),
            };
        }

        const rates = (currencyRates.rates || {}) as Record<string, number>;
        const homeRate = rates[homeCurrency] || 1;
        const tripRate = rates[tripCurrency] || 1;
        const inputRate = rates[selectedCurrency] || 1;

        return {
            trip: CurrencyService.convert(value, inputRate, tripRate),
            home: CurrencyService.convert(value, inputRate, homeRate),
        };
    }, [amount, currencyRates, effectiveRate, homeCurrency, selectedCurrency, tripCurrency]);

    const currentWalletSelectedBalance = selectedCurrency === homeCurrency
        ? currentWalletHomeBalance
        : currentWalletTripBalance;
    const editableSelectedCapacity = selectedCurrency === homeCurrency
        ? editableHomeCapacity
        : editableTripCapacity;
    const amountExceedsWallet = conversions.trip > editableTripCapacity + 0.01;
    const amountValidationError = amountExceedsWallet
        ? `Amount exceeds editable limit ${selectedCurrency} ${editableSelectedCapacity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        : '';
    const amountHelperText = reclaimableTripAmount > 0
        ? `Available in wallet now: ${selectedCurrency} ${currentWalletSelectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Editable limit: ${selectedCurrency} ${editableSelectedCapacity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
        : `Available in wallet now: ${selectedCurrency} ${currentWalletSelectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;

    const handleLog = async () => {
        if (isSaving || !title || !amount || !selectedWalletId) return;

        const value = CurrencyService.parseInput(amount);
        if (value <= 0 || amountExceedsWallet) return;

        syncTrace('SpontaneousModal', 'submit_pressed', {
            tripId,
            isEditing,
            selectedWalletId,
            selectedCurrency,
            title,
            enteredAmount: value,
            convertedTrip: conversions.trip,
            convertedHome: conversions.home,
            category,
            date,
        });

        try {
            setIsSaving(true);
            await Promise.resolve(onLog({
                walletId: selectedWalletId,
                title,
                amount: conversions.trip,
                category,
                originalAmount: value,
                originalCurrency: selectedCurrency,
                convertedAmountHome: conversions.home,
                convertedAmountTrip: conversions.trip,
                date,
            }));
            syncTrace('SpontaneousModal', 'submit_completed', {
                tripId,
                isEditing,
                selectedWalletId,
                title,
                convertedTrip: conversions.trip,
                convertedHome: conversions.home,
            });
            onClose();
        } catch (error: any) {
            syncTrace('SpontaneousModal', 'submit_failed', {
                tripId,
                isEditing,
                selectedWalletId,
                message: error?.message,
            });
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatedModal visible={visible} onClose={onClose}>
            <GlassView
                intensity={isDark ? 50 : 95}
                borderRadius={32}
                backgroundColor={isDark ? 'rgba(30, 32, 28, 0.98)' : 'rgba(255, 255, 255, 0.98)'}
                style={styles.modalView}
            >
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, isDark && { color: '#F2F0E8' }]}>
                        {isEditing ? 'EDIT SPONTANEOUS' : 'SPONTANEOUS LOG'}
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Feather name="x" size={24} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    <View style={styles.inputSection}>
                        <Text style={[styles.label, isDark && { color: '#B2C4AA', opacity: 0.6 }]}>
                            WHAT DID YOU BUY?
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                isDark && {
                                    color: '#F2F0E8',
                                    backgroundColor: 'rgba(0,0,0,0.2)',
                                    borderColor: 'rgba(158,178,148,0.3)',
                                },
                            ]}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="e.g. Street food, Souvenir..."
                            placeholderTextColor={isDark ? 'rgba(178,196,170,0.3)' : '#9ca3af'}
                        />
                    </View>

                    {walletsStats.length > 1 && (
                        <SpontaneousWalletSelector
                            isDark={isDark}
                            activeWallet={activeWallet}
                            onPress={() => setIsWalletModalVisible(true)}
                        />
                    )}

                    <CurrencyInput
                        label="AMOUNT SPENT"
                        amount={amount}
                        onAmountChange={setAmount}
                        currency={selectedCurrency}
                        onCurrencyChange={setSelectedCurrency}
                        options={tripCurrency !== homeCurrency ? [tripCurrency, homeCurrency] : [tripCurrency]}
                        editable
                        error={amountValidationError}
                        helperText={amountHelperText}
                    />

                    {selectedCurrency !== tripCurrency && (
                        <SpontaneousTripEquivalent
                            isDark={isDark}
                            tripCurrency={tripCurrency}
                            tripAmount={conversions.trip}
                        />
                    )}

                    <SpontaneousCategoryPicker
                        isDark={isDark}
                        category={category}
                        categories={CATEGORIES}
                        onSelect={setCategory}
                    />
                </ScrollView>

                <RippleButton
                    style={[
                        styles.logButton,
                        { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' },
                        (isSaving || !title || !amount || amountExceedsWallet) && styles.logButtonDisabled,
                    ]}
                    onPress={handleLog}
                    disabled={isSaving || !title || !amount || amountExceedsWallet}
                    glowColor={isDark ? 'rgba(178, 196, 170, 0.5)' : 'rgba(93, 109, 84, 0.4)'}
                >
                    {isSaving ? (
                        <ActivityIndicator color={isDark ? '#1a1a1a' : '#FFFFFF'} size="small" />
                    ) : (
                        <>
                            <Text style={[styles.logButtonText, { color: isDark ? '#1a1a1a' : '#fff' }]}>
                                {isEditing ? 'SAVE CHANGES' : 'LOG EXPENSE'}
                            </Text>
                            <Feather
                                name="check-circle"
                                size={20}
                                color={isDark ? '#1a1a1a' : '#fff'}
                                style={{ marginLeft: 8 }}
                            />
                        </>
                    )}
                </RippleButton>
            </GlassView>

            <AnimatedModal visible={isWalletModalVisible} onClose={() => setIsWalletModalVisible(false)}>
                <GlassView
                    style={{ borderRadius: 32, padding: 32, width: SCREEN_WIDTH - 64 }}
                    intensity={isDark ? 80 : 95}
                    backgroundColor={isDark ? '#1a1a1a' : 'white'}
                >
                    <Text style={styles.walletModalTitle}>Select Wallet</Text>
                    {walletsStats.map(wallet => (
                        <PressableScale
                            key={wallet.walletId}
                            style={[
                                styles.currencyItem,
                                wallet.walletId === selectedWalletId && {
                                    backgroundColor: isDark
                                        ? 'rgba(158,178,148,0.1)'
                                        : 'rgba(93,109,84,0.05)',
                                    borderColor: isDark ? '#B2C4AA' : '#5D6D54',
                                },
                            ]}
                            onPress={() => {
                                setSelectedWalletId(wallet.walletId);
                                setSelectedCurrency(wallet.currency);
                                setIsWalletModalVisible(false);
                            }}
                        >
                            <View>
                                <Text
                                    style={[
                                        styles.currencyItemText,
                                        { color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                    ]}
                                >
                                    {wallet.country}
                                </Text>
                                <Text style={styles.currencySubtext}>{wallet.currency}</Text>
                            </View>
                            {wallet.walletId === selectedWalletId && (
                                <Feather
                                    name="check-circle"
                                    size={20}
                                    color={isDark ? '#B2C4AA' : '#5D6D54'}
                                />
                            )}
                        </PressableScale>
                    ))}
                </GlassView>
            </AnimatedModal>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    modalView: {
        width: '100%',
        padding: 24,
        paddingBottom: 28,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#5D6D54',
    },
    closeButton: {
        padding: 4,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    inputSection: {
        marginBottom: 24,
    },
    label: {
        fontSize: 10,
        fontWeight: '900',
        color: '#9ca3af',
        marginBottom: 12,
        letterSpacing: 1,
    },
    input: {
        height: 56,
        backgroundColor: 'rgba(93, 109, 84, 0.05)',
        borderRadius: 16,
        paddingHorizontal: 20,
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    logButton: {
        height: PRIMARY_ACTION_HEIGHT,
        backgroundColor: '#5D6D54',
        borderRadius: PRIMARY_ACTION_RADIUS,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    logButtonDisabled: {
        opacity: 0.5,
    },
    logButtonText: {
        color: '#fff',
        fontSize: PRIMARY_ACTION_TEXT_SIZE,
        fontWeight: '900',
        letterSpacing: 2,
    },
    walletModalTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1a1a1a',
        textTransform: 'uppercase',
        marginBottom: 24,
        textAlign: 'center',
    },
    currencyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 8,
    },
    currencyItemText: {
        fontSize: 18,
        fontWeight: '900',
    },
    currencySubtext: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
    },
});
