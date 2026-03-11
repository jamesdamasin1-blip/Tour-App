import { CurrencyInput } from '@/components/CurrencyInput';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { useStore } from '@/src/store/useStore';
import { getCurrencyForCountry } from '@/src/data/currencyMapping';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { CurrencyUtils } from '@/src/utils/currencyUtils';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AddExpenseScreen() {
    const router = useRouter();
    const activityId = useLocalSearchParams<{ activityId: string }>().activityId;
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const addExpense = useStore(state => state.addExpense);
    const activity = useStore(state => state.activities.find(a => a.id === activityId));
    const [amount, setAmount] = useState('');
    const currencyRates = useStore(state => state.currencyRates);
    const cacheRates = useStore(state => state.cacheRates);
    
    // Suggest currency based on activity
    const suggestedCurrency = useMemo(() => {
        if (!activity?.countries?.length) return 'PHP';
        return getCurrencyForCountry(activity.countries[0]);
    }, [activity]);

    const [currency, setCurrency] = useState(suggestedCurrency);
    const [conversionMode, setConversionMode] = useState<'auto' | 'manual'>('manual');
    const [manualRate, setManualRate] = useState('');
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);

    // Get available currencies
    const availableCurrencies = useMemo(() => {
        const codes = (activity?.countries || []).map(c => getCurrencyForCountry(c));
        return Array.from(new Set([...codes, 'PHP']));
    }, [activity]);

    useEffect(() => {
        setCurrency(suggestedCurrency);
        CurrencyUtils.fetchRates(currencyRates, cacheRates);
    }, [suggestedCurrency]);

    const phpEquivalent = useMemo(() => {
        const value = MathUtils.parseCurrencyInput(amount);
        if (value <= 0) return 0;
        if (currency === 'PHP') return value;

        if (conversionMode === 'auto') {
            const rates = currencyRates.rates;
            const rateInCache = (rates as any)[currency];
            if (rateInCache) return value * (1 / rateInCache);
        } else {
            const mRate = MathUtils.parseCurrencyInput(manualRate);
            if (mRate > 0) return value * mRate;
        }
        
        return 0;
    }, [amount, currency, manualRate, conversionMode, currencyRates.rates]);

    if (!activity) {
        return (
            <MeshBackground style={{ justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#B2C4AA' : '#5D6D54' }}>Activity not found</Text>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#5D6D54' }}
                >
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>GO BACK</Text>
                </TouchableOpacity>
            </MeshBackground>
        );
    }

    const handleSave = () => {
        const value = MathUtils.parseCurrencyInput(amount);
        if (amount.trim() === '') {
            alert('Please enter a valid amount.');
            return;
        }

        if (currency !== 'PHP') {
            if (conversionMode === 'auto') {
                const liveRate = (currencyRates.rates as any)[currency];
                if (!liveRate) {
                    alert(`No live rate found for ${currency}. Please use manual conversion.`);
                    return;
                }
            } else {
                if (MathUtils.parseCurrencyInput(manualRate) <= 0) {
                    alert('Please enter a valid manual exchange rate.');
                    return;
                }
            }
        }

        addExpense(activityId, {
            name: activity.title,
            amount: phpEquivalent,
            category: activity.category as any,
            time: Date.now(),
            originalAmount: MathUtils.parseCurrencyInput(amount),
            originalCurrency: currency,
        });
        router.back();
    };

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
            <Header
                title="ADD AN EXPENSE"
                showBack={true}
            />

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }} showsVerticalScrollIndicator={false}>
                <GlassView
                    style={[styles.cardContainer, isDark && { shadowColor: '#000' }]}
                    intensity={isDark ? 50 : 80}
                    borderRadius={32}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.8)" : "rgba(255, 255, 255, 0.6)"}
                >
                    <View style={{ padding: 20 }}>
                        <Text style={[styles.sectionLabel, isDark && { color: '#9EB294' }]}>Linking To</Text>
                        <View style={[styles.linkInfo, { backgroundColor: isDark ? 'rgba(58, 63, 55, 0.8)' : 'rgba(255, 255, 255, 0.3)', borderColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(255, 255, 255, 0.5)' }]}>
                            <Feather name="link-2" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                            <Text style={[styles.linkText, isDark && { color: '#F2F0E8' }]}>{activity.title}</Text>
                        </View>

                        <CurrencyInput
                            label="Actual Cost"
                            amount={amount}
                            onAmountChange={(text) => setAmount(MathUtils.formatCurrencyInput(text))}
                            currency={currency}
                            onCurrencyChange={(curr) => setCurrency(curr)}
                            onCurrencyPress={() => setIsCurrencyModalVisible(true)}
                            manualRate={manualRate}
                            onManualRateChange={(text) => setManualRate(MathUtils.formatCurrencyInput(text))}
                            placeholder="0.00"
                        />

                         {currency !== 'PHP' && (
                            <View className="mb-6">
                                <View 
                                    className="flex-row items-center justify-between p-4 rounded-2xl border" 
                                    style={{ 
                                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
                                        borderColor: isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)'
                                    }}
                                >
                                    <TouchableOpacity 
                                        onPress={() => setConversionMode('auto')}
                                        className={`flex-1 py-2 items-center rounded-lg ${conversionMode === 'auto' ? 'bg-[#5D6D54]' : ''}`}
                                    >
                                        <Text className={`text-[10px] font-black uppercase ${conversionMode === 'auto' ? 'text-white' : (isDark ? '#B2C4AA' : '#5D6D54')}`}>Real-time</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => setConversionMode('manual')}
                                        className={`flex-1 py-2 items-center rounded-lg ${conversionMode === 'manual' ? 'bg-[#5D6D54]' : ''}`}
                                    >
                                        <Text className={`text-[10px] font-black uppercase ${conversionMode === 'manual' ? 'text-white' : (isDark ? '#B2C4AA' : '#5D6D54')}`}>Manual</Text>
                                    </TouchableOpacity>
                                </View>

                                 {conversionMode === 'manual' && (
                                    <View className="mb-4">
                                        <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#9EB294]/60' : 'text-gray-400'}`}>MANUAL RATE</Text>
                                        <View 
                                            className="flex-row items-center border rounded-2xl px-4 py-4" 
                                            style={{ 
                                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
                                                borderColor: isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)'
                                            }}
                                        >
                                            <Feather name="trending-up" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                            <TextInput
                                                placeholder="1.00"
                                                placeholderTextColor={isDark ? "rgba(178,196,170,0.4)" : "#9ca3af"}
                                                value={manualRate}
                                                onChangeText={(text) => setManualRate(MathUtils.formatCurrencyInput(text))}
                                                keyboardType="decimal-pad"
                                                className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                                            />
                                        </View>
                                    </View>
                                )}

                                 <View className={`p-4 rounded-2xl border border-dashed ${isDark ? 'border-[#9EB294]/30 bg-[#3A3F37]/40' : 'border-[#5D6D54]/30 bg-[#5D6D54]/5'}`}>
                                    <View className="flex-row justify-between items-baseline mb-1">
                                        <Text className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]/60' : 'text-[#5D6D54]/60'}`}>Converted To</Text>
                                        <View className="flex-row items-center">
                                            <Feather name={conversionMode === 'auto' ? "refresh-cw" : "edit-3"} size={10} color={isDark ? "#B2C4AA" : "#5D6D54"} style={{ marginRight: 4 }} />
                                            <Text className={`text-[10px] font-bold ${isDark ? 'text-[#B2C4AA]/60' : 'text-[#5D6D54]/60'}`}>{conversionMode === 'auto' ? 'Live Rates Applied' : 'Manual Rate Applied'}</Text>
                                        </View>
                                    </View>
                                    <View className="flex-row items-center">
                                        <Text className={`text-xl font-black ${isDark ? 'text-[#F2F0E8]' : '#5D6D54'}`}>PHP</Text>
                                        <Text className={`text-2xl font-black ml-2 ${isDark ? 'text-[#F2F0E8]' : '#5D6D54'}`}>
                                            {phpEquivalent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={amount.trim() === ''}
                            style={[
                                styles.saveButton,
                                amount.trim() === '' && { backgroundColor: '#9ca3af' }
                            ]}
                        >
                            <Text style={styles.saveButtonText}>SAVE EXPENSE</Text>
                        </TouchableOpacity>
                    </View>
                </GlassView>
                <View style={{ height: 40 }} />
            </ScrollView>

            <Modal
                transparent
                visible={isCurrencyModalVisible}
                animationType="fade"
                onRequestClose={() => setIsCurrencyModalVisible(false)}
            >
                <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={1}
                    onPress={() => setIsCurrencyModalVisible(false)}
                >
                     <GlassView
                        style={{ width: '80%', maxHeight: '60%' }}
                        intensity={isDark ? 80 : 95}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    >
                         <View style={{ padding: 24 }}>
                            <Text className={`text-sm font-black mb-4 uppercase tracking-widest text-center ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Select Currency</Text>
                            <FlatList
                                data={availableCurrencies}
                                keyExtractor={(item) => item}
                                renderItem={({ item }: { item: string }) => (
                                     <TouchableOpacity
                                        style={{ 
                                            flexDirection: 'row', 
                                            alignItems: 'center', 
                                            paddingVertical: 16,
                                            borderBottomWidth: 1,
                                            borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0, 0, 0, 0.05)'
                                        }}
                                        onPress={() => {
                                            setCurrency(item);
                                            setIsCurrencyModalVisible(false);
                                        }}
                                    >
                                        <Text style={{ fontSize: 18, fontWeight: '900', color: currency === item ? (isDark ? '#F2F0E8' : '#5D6D54') : (isDark ? '#B2C4AA' : '#111827') }}>
                                            {item}
                                        </Text>
                                        {currency === item && (
                                            <Feather name="check" size={20} color={isDark ? "#F2F0E8" : "#5D6D54"} style={{ marginLeft: 'auto' }} />
                                        )}
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </GlassView>
                </TouchableOpacity>
            </Modal>
            </KeyboardAvoidingView>
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 16, minHeight: 60, position: 'relative' },
    backButton: { position: 'absolute', left: 24, padding: 8, marginLeft: -8, zIndex: 10 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textTransform: 'uppercase', letterSpacing: 1 },
    cardContainer: { 
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        borderRadius: 32,
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
    },
    sectionLabel: { fontSize: 10, fontWeight: '900', color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    linkInfo: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 24 },
    linkText: { flex: 1, fontSize: 16, color: '#111827', fontWeight: 'bold', marginLeft: 12 },
    saveButton: { backgroundColor: '#5D6D54', borderRadius: 20, paddingVertical: 18, alignItems: 'center', shadowColor: '#5D6D54', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginTop: 12 },
    saveButtonText: { color: 'white', fontWeight: '900', fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }
});
