import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    ScrollView,
    Dimensions,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { GlassView } from './GlassView';
import { AnimatedModal } from './AnimatedModal';
import { PressableScale } from './PressableScale';
import { RippleButton } from './RippleButton';
import { CurrencyInput } from './CurrencyInput';
import { useStore } from '@/src/store/useStore';
import { CATEGORY_THEME } from '@/src/constants/categories';
import { ExpenseCategory } from '@/src/types/models';
import { CurrencyService } from '@/src/services/currency';
import { CurrencyConversionService } from '@/src/services/currencyConversion';
import { useTripWallet } from '../src/features/trip/hooks/useTripWallet';
import { useWalletExchangeRate } from '@/src/hooks/useWalletExchangeRate';

interface SpontaneousExpenseModalProps {
    visible: boolean;
    onClose: () => void;
    onLog: (data: {
        walletId: string;
        title: string;
        amount: number;
        category: ExpenseCategory;
        originalAmount?: number;
        originalCurrency?: string;
        convertedAmountHome?: number;
        convertedAmountTrip?: number;
        date: number;
    }) => void;
    tripId: string;
    date: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SpontaneousExpenseModal = ({ visible, onClose, onLog, tripId, date }: SpontaneousExpenseModalProps) => {
    const { theme, currencyRates } = useStore();
    const isDark = theme === 'dark';

    const { walletsStats, homeCurrency } = useTripWallet(tripId);

    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<ExpenseCategory>('Other');
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('PHP');
    const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);

    const activeWallet = useMemo(() => {
        return walletsStats.find(w => w.walletId === selectedWalletId) || walletsStats[0];
    }, [walletsStats, selectedWalletId]);

    const tripCurrency = activeWallet?.currency || 'PHP';

    const { baselineRate } = useWalletExchangeRate(tripId, selectedWalletId || activeWallet?.walletId || '');

    // Sync wallet and currency on visible
    useEffect(() => {
        if (visible && walletsStats.length > 0) {
            const initialWallet = walletsStats[0];
            setSelectedWalletId(initialWallet.walletId);
            setSelectedCurrency(initialWallet.currency);
        }
    }, [visible, walletsStats]);

    const categories: ExpenseCategory[] = ['Food', 'Transport', 'Hotel', 'Sightseeing', 'Other'];

    // Calculate conversions using baseline rate (same logic as useAddExpense)
    const conversions = useMemo(() => {
        const value = CurrencyService.parseInput(amount);
        if (value <= 0) return { home: 0, trip: 0 };

        let amountInTrip = 0;
        let amountInHome = 0;

        if (selectedCurrency === tripCurrency) {
            amountInTrip = value;
            amountInHome = CurrencyConversionService.toHome(value, baselineRate);
        } else if (selectedCurrency === homeCurrency) {
            amountInHome = value;
            amountInTrip = CurrencyConversionService.fromHome(value, baselineRate);
        } else {
            // Fallback for random currencies
            const rates = (currencyRates.rates || {}) as any;
            const hRate = rates[homeCurrency] || 1;
            const tRate = rates[tripCurrency] || 1;
            const eRate = rates[selectedCurrency] || 1;
            amountInTrip = CurrencyService.convert(value, eRate, tRate);
            amountInHome = CurrencyService.convert(value, eRate, hRate);
        }

        return { home: amountInHome, trip: amountInTrip };
    }, [amount, selectedCurrency, tripCurrency, homeCurrency, currencyRates, baselineRate]);

    const handleLog = () => {
        if (!title || !amount || !selectedWalletId) return;
        
        const value = CurrencyService.parseInput(amount);
        if (value <= 0) return;

        onLog({
            walletId: selectedWalletId,
            title,
            amount: conversions.trip,
            category,
            originalAmount: value,
            originalCurrency: selectedCurrency,
            convertedAmountHome: conversions.home,
            convertedAmountTrip: conversions.trip,
            date: date
        });

        setTitle('');
        setAmount('');
        setCategory('Other');
        onClose();
    };

    return (
        <AnimatedModal visible={visible} onClose={onClose}>
                    <GlassView
                        intensity={isDark ? 50 : 95}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(30, 32, 28, 0.98)" : "rgba(255, 255, 255, 0.98)"}
                        style={styles.modalView}
                    >
                        <View style={styles.header}>
                            <Text style={[styles.headerTitle, isDark && { color: '#F2F0E8' }]}>SPONTANEOUS LOG</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                            <View style={styles.inputSection}>
                                <Text style={[styles.label, isDark && { color: '#B2C4AA', opacity: 0.6 }]}>WHAT DID YOU BUY?</Text>
                                <TextInput
                                    style={[styles.input, isDark && { color: '#F2F0E8', backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(158,178,148,0.3)' }]}
                                    value={title}
                                    onChangeText={setTitle}
                                    placeholder="e.g. Street food, Souvenir..."
                                    placeholderTextColor={isDark ? "rgba(178,196,170,0.3)" : "#9ca3af"}
                                />
                            </View>

                            {walletsStats.length > 1 && (
                                <View style={styles.inputSection}>
                                    <Text style={[styles.label, isDark && { color: '#B2C4AA', opacity: 0.6 }]}>SELECT COUNTRY WALLET</Text>
                                    <TouchableOpacity 
                                        style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, isDark && { backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(158,178,148,0.3)' }]}
                                        onPress={() => setIsWalletModalVisible(true)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F2F0E8' : '#111827' }}>{activeWallet?.country}</Text>
                                            <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#9EB294' : '#64748b', marginLeft: 8 }}>({activeWallet?.currency})</Text>
                                        </View>
                                        <Feather name="chevron-down" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                    </TouchableOpacity>
                                </View>
                            )}

                            <CurrencyInput
                                label="AMOUNT SPENT"
                                amount={amount}
                                onAmountChange={setAmount}
                                currency={selectedCurrency}
                                onCurrencyChange={setSelectedCurrency}
                                options={tripCurrency !== homeCurrency ? [tripCurrency, homeCurrency] : [tripCurrency]}
                                editable={true}
                            />

                            {selectedCurrency !== tripCurrency && (
                                <View style={{ marginBottom: 24 }}>
                                    <View style={[styles.previewContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(93, 109, 84, 0.05)', borderColor: isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)' }]}>
                                        <Text style={[styles.previewLabel, { color: isDark ? '#B2C4AA' : '#5D6D54' }]}>TRIP CURRENCY EQUIVALENT</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#B2C4AA' : '#5D6D54' }}>{tripCurrency}</Text>
                                            <Text style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#F2F0E8' : '#1a1a1a', marginLeft: 8 }}>
                                                {conversions.trip.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            <View style={styles.inputSection}>
                                <Text style={[styles.label, isDark && { color: '#B2C4AA', opacity: 0.6 }]}>CATEGORY</Text>
                                <View style={styles.categoriesContainer}>
                                    {categories.map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[
                                                styles.categoryItem,
                                                { backgroundColor: category === cat ? CATEGORY_THEME[cat].color : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') },
                                                { borderColor: category === cat ? CATEGORY_THEME[cat].color : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }
                                            ]}
                                            onPress={() => setCategory(cat)}
                                        >
                                            <Feather 
                                                name={CATEGORY_THEME[cat].icon as any} 
                                                size={16} 
                                                color={category === cat ? '#fff' : (isDark ? '#B2C4AA' : CATEGORY_THEME[cat].color)} 
                                            />
                                            <Text style={[
                                                styles.categoryText,
                                                { color: category === cat ? '#fff' : (isDark ? '#F2F0E8' : '#1a1a1a') }
                                            ]}>{cat.toUpperCase()}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </ScrollView>

                        <RippleButton
                            style={[styles.logButton, { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }, (!title || !amount) && styles.logButtonDisabled]}
                            onPress={handleLog}
                            disabled={!title || !amount}
                            glowColor={isDark ? 'rgba(178, 196, 170, 0.5)' : 'rgba(93, 109, 84, 0.4)'}
                        >
                            <Text style={[styles.logButtonText, { color: isDark ? '#1a1a1a' : '#fff' }]}>LOG EXPENSE</Text>
                            <Feather name="check-circle" size={20} color={isDark ? "#1a1a1a" : "#fff"} style={{ marginLeft: 8 }} />
                        </RippleButton>
                    </GlassView>

            {/* Wallet Selection Modal */}
            <AnimatedModal visible={isWalletModalVisible} onClose={() => setIsWalletModalVisible(false)}>
                        <GlassView
                            style={{ borderRadius: 32, padding: 32, width: SCREEN_WIDTH - 64 }}
                            intensity={isDark ? 80 : 95}
                            backgroundColor={isDark ? "#1a1a1a" : "white"}
                        >
                            <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#1a1a1a', textTransform: 'uppercase', marginBottom: 24, textAlign: 'center' }}>Select Wallet</Text>
                            {walletsStats.map((wallet) => (
                                <PressableScale
                                    key={wallet.walletId}
                                    style={[styles.currencyItem, wallet.walletId === selectedWalletId && { backgroundColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(93,109,84,0.05)', borderColor: isDark ? '#B2C4AA' : '#5D6D54' }]}
                                    onPress={() => {
                                        setSelectedWalletId(wallet.walletId);
                                        setSelectedCurrency(wallet.currency);
                                        setIsWalletModalVisible(false);
                                    }}
                                >
                                    <View>
                                        <Text style={[styles.currencyItemText, { color: isDark ? '#F2F0E8' : '#1a1a1a' }]}>{wallet.country}</Text>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#9EB294' : '#64748b' }}>{wallet.currency}</Text>
                                    </View>
                                    {wallet.walletId === selectedWalletId && <Feather name="check-circle" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />}
                                </PressableScale>
                            ))}
                        </GlassView>
            </AnimatedModal>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '100%',
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    cardWrapper: {
        width: '100%',
        maxWidth: 420,
    },
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
    modeToggle: { flexDirection: 'row', borderRadius: 16, padding: 4, borderWidth: 1, marginBottom: 16 },
    modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
    modeButtonText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    rateInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, height: 56, marginBottom: 12 },
    manualTextInput: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 12 },
    previewContainer: { padding: 16, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', marginBottom: 24 },
    previewLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
    categoriesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    categoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '800',
        marginLeft: 8,
        letterSpacing: 0.5,
    },
    logButton: {
        height: 60,
        backgroundColor: '#5D6D54',
        borderRadius: 20,
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
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 2,
    },
    currencyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
    currencyItemText: { fontSize: 18, fontWeight: '900' }
});
