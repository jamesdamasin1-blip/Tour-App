import { CurrencyInput } from '@/components/CurrencyInput';
import { GlassTimePicker } from '@/components/GlassTimePicker';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { useStore } from '@/src/store/useStore';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { MeshBackground } from '@/components/MeshBackground';
import { COUNTRIES } from '@/src/data/countries';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from 'react-native-ui-datepicker';

export default function CreateActivityScreen() {
    const router = useRouter();
    const { tripId, activityId } = useLocalSearchParams<{ tripId: string, activityId: string }>();
    const insets = useSafeAreaInsets();
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const addActivity = useStore(state => state.addActivity);
    const updateActivity = useStore(state => state.updateActivity);

    const editingActivity = useMemo(() => activities.find(a => a.id === activityId), [activities, activityId]);

    const currentTrip = useMemo(() => trips.find(t => t.id === tripId), [trips, tripId]);
    const tripCountries = useMemo(() => currentTrip?.countries || [], [currentTrip]);

    const [title, setTitle] = useState('');
    const [allocatedBudget, setAllocatedBudget] = useState('');
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [category, setCategory] = useState('Sightseeing');
    const [description, setDescription] = useState('');
    const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');

    const [date, setDate] = useState<dayjs.Dayjs | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [startTime, setStartTime] = useState<dayjs.Dayjs | null>(null);
    const [endTime, setEndTime] = useState<dayjs.Dayjs | null>(null);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    const [actualCost, setActualCost] = useState('');
    const [actualCurrency, setActualCurrency] = useState('PHP');
    const [isActualCurrencyModalVisible, setIsActualCurrencyModalVisible] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Initialize state if editing
    React.useEffect(() => {
        if (editingActivity) {
            setTitle(editingActivity.title);
            setAllocatedBudget(editingActivity.allocatedBudget.toString());
            setSelectedCountries(editingActivity.countries || []);
            setCategory(editingActivity.category);
            setDate(dayjs(editingActivity.date));
            setStartTime(dayjs(editingActivity.time));
            setEndTime(dayjs(editingActivity.endTime || editingActivity.time + 3600000));
            setDescription(editingActivity.description || '');

            if (editingActivity.expenses && editingActivity.expenses.length > 0) {
                // Try to find the most common original currency
                const currencyCounts: Record<string, number> = {};
                editingActivity.expenses.forEach(e => {
                    const c = e.originalCurrency || 'PHP';
                    currencyCounts[c] = (currencyCounts[c] || 0) + 1;
                });
                const dominantCurrency = Object.keys(currencyCounts).reduce((a, b) => currencyCounts[a] > currencyCounts[b] ? a : b, 'PHP');
                setActualCurrency(dominantCurrency);

                if (dominantCurrency === 'PHP') {
                    const currentSpent = editingActivity.expenses.reduce((sum, exp) => sum + exp.amount, 0);
                    setActualCost(currentSpent > 0 ? currentSpent.toString() : '');
                } else {
                    // Sum original amounts if they match the dominant currency
                    const totalOriginal = editingActivity.expenses.reduce((sum, exp) => {
                        if (exp.originalCurrency === dominantCurrency) {
                            return sum + (exp.originalAmount || 0);
                        }
                        // Fallback: convert PHP back to original using a rate (tricky) or just ignore
                        // For simplicity, let's assume linking was consistent
                        return sum;
                    }, 0);
                    setActualCost(totalOriginal > 0 ? totalOriginal.toString() : '');
                }
            } else {
                setActualCost('');
                // If no expenses, suggest currency from activity (if it has countries)
                if (editingActivity.countries?.length > 0) {
                    const { getCurrencyForCountry } = require('@/src/data/currencyMapping');
                    setActualCurrency(getCurrencyForCountry(editingActivity.countries[0]));
                } else {
                    setActualCurrency('PHP');
                }
            }
        }
    }, [editingActivity]);

    const handleSave = () => {
        const newErrors: Record<string, string> = {};
        if (!title.trim()) newErrors.title = 'Title is required';
        if (!allocatedBudget) newErrors.budget = 'Budget is required';
        if (selectedCountries.length === 0) newErrors.countries = 'Select at least one country';
        if (!date) newErrors.date = 'Date is required';
        if (!startTime) newErrors.startTime = 'Start time is required';
        if (!endTime) newErrors.endTime = 'End time is required';
        if (!category) newErrors.category = 'Category is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const numericBudget = MathUtils.parseCurrencyInput(allocatedBudget);
        if (numericBudget <= 0) {
            setErrors({ ...newErrors, budget: 'Budget must be greater than 0' });
            return;
        }

        if (!tripId) {
            setErrors({ ...newErrors, general: 'Trip ID is missing' });
            return;
        }

        const activityData: any = {
            tripId: tripId!,
            title: title.trim(),
            allocatedBudget: numericBudget,
            date: date!.valueOf(),
            time: startTime!.valueOf(),
            endTime: endTime!.valueOf(),
            countries: selectedCountries,
            category,
            description: description.trim(),
            isCompleted: editingActivity?.isCompleted || false,
        };

        if (activityId) {
            let finalExpenses = editingActivity ? [...editingActivity.expenses] : [];
            const numericActualCost = actualCost.trim() !== '' ? MathUtils.parseCurrencyInput(actualCost) : null;

            if (numericActualCost !== null) {
                // Re-calculate based on what we are showing
                let currentSpentInShownCurrency = 0;
                let currentSpentInPHP = 0;

                editingActivity?.expenses.forEach(e => {
                    currentSpentInPHP += e.amount;
                    if ((e.originalCurrency || 'PHP') === actualCurrency) {
                        currentSpentInShownCurrency += (e.originalAmount || e.amount);
                    }
                });

                if (numericActualCost !== currentSpentInShownCurrency) {
                    const diff = numericActualCost - currentSpentInShownCurrency;
                    
                    // We need a rate to store the PHP amount
                    let rate = 1;
                    if (actualCurrency !== 'PHP') {
                        const { useStore } = require('@/src/store/useStore');
                        const rates = useStore.getState().currencyRates.rates;
                        const rateInCache = (rates as any)[actualCurrency];
                        if (rateInCache) {
                            rate = 1 / rateInCache;
                        }
                    }

                    finalExpenses.push({
                        id: MathUtils.generateId(),
                        name: 'Manual Adjustment',
                        category: 'Other',
                        amount: diff * rate,
                        time: Date.now(),
                        originalAmount: diff,
                        originalCurrency: actualCurrency
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

    const availableCurrencies = useMemo(() => {
        const { getCurrencyForCountry } = require('@/src/data/currencyMapping');
        const countriesToUse = selectedCountries.length > 0 ? selectedCountries : tripCountries;
        const countryCodes = countriesToUse.map(c => getCurrencyForCountry(c));
        return Array.from(new Set([...countryCodes, 'PHP']));
    }, [selectedCountries, tripCountries]);

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
            >
            <Header
                title={activityId ? 'EDIT ACTIVITY' : 'NEW TRIP ACTIVITY'}
                showBack={true}
            />

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: 24,
                    paddingTop: 24,
                    paddingBottom: insets.bottom + 100,
                    flexGrow: 1,
                }}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[styles.cardContainer, isDark && { shadowColor: '#000' }]}>
                    <GlassView
                        intensity={isDark ? 40 : 60}
                        borderRadius={32}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(93, 109, 84, 0.15)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.8)" : "rgba(255, 255, 255, 0.75)"}
                        style={{ overflow: 'hidden' }}
                    >
                        <View className="px-5 py-6">
                            <Text className={`text-sm font-bold mb-4 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Activity Details</Text>

                             <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>TITLE</Text>
                             <View 
                                 className="flex-row items-center border rounded-2xl px-4 py-4 mb-1"
                                 style={{ 
                                     backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)', 
                                     borderColor: errors.title ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)'),
                                     marginBottom: 24 
                                 }}
                             >
                                 <Feather name="map" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                 <TextInput
                                     placeholder="e.g. Eiffel Tower Visit"
                                     placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                                     value={title}
                                     onChangeText={(text) => {
                                         setTitle(text);
                                         if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
                                     }}
                                     className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'} ${errors.title ? 'text-red-500' : ''}`}
                                 />
                             </View>
                            {errors.title && <Text className="text-red-500 text-[10px] font-bold mt-[-16px] mb-4 ml-4 uppercase">{errors.title}</Text>}

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>COUNTRIES</Text>
                            <TouchableOpacity
                                onPress={() => setIsCountryModalVisible(true)}
                                className="flex-row items-center border rounded-2xl px-4 py-4 mb-4"
                                style={{ 
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)', 
                                    borderColor: errors.countries ? '#ef4444' : (isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)'),
                                }}
                            >
                                <Feather name="map-pin" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                 <Text className={`flex-1 text-base ml-3 font-semibold ${selectedCountries.length > 0 ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>
                                     {selectedCountries.length > 0 ? "Add more countries" : "Select Countries..."}
                                 </Text>
                                {selectedCountries.length === 0 ? (
                                    <Feather name="chevron-down" size={18} color={errors.countries ? "#ef4444" : (isDark ? "#B2C4AA" : "#9EB294")} />
                                ) : (
                                    <View className="w-6 h-6 rounded-full items-center justify-center" style={{ borderWidth: 1, borderColor: isDark ? '#B2C4AA' : '#9EB294' }}>
                                        <Feather name="plus" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                    </View>
                                )}
                            </TouchableOpacity>
                            {errors.countries && <Text className="text-red-500 text-[10px] font-bold mt-2 mb-4 ml-4 uppercase">{errors.countries}</Text>}

                            {/* Render Country Chips */}
                            {selectedCountries.length > 0 && (
                                <View className="flex-row flex-wrap gap-2 mb-6 mt-2">
                                    {selectedCountries.map((c) => (
                                        <View key={c} className={`flex-row items-center px-3 py-1.5 rounded-full shadow-sm border ${isDark ? 'bg-[#3A3F37] border-[#9EB294]/30' : 'bg-[#E9E4BF] border-[#5D6D54]/20'}`}>
                                            <Text className={`font-bold text-sm mr-2 ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>{c}</Text>
                                            <TouchableOpacity onPress={() => setSelectedCountries(selectedCountries.filter(sc => sc !== c))}>
                                                <Feather name="x-circle" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                            {selectedCountries.length === 0 && <View className="mb-6" />}

                            <CurrencyInput
                                label="Allocated Budget"
                                amount={allocatedBudget}
                                onAmountChange={(text) => {
                                    setAllocatedBudget(MathUtils.formatCurrencyInput(text));
                                    if (errors.budget) setErrors(prev => ({ ...prev, budget: '' }));
                                }}
                                currency={actualCurrency}
                                onCurrencyChange={setActualCurrency}
                                onCurrencyPress={() => setIsActualCurrencyModalVisible(true)}
                                manualRate=""
                                onManualRateChange={() => { }}
                            />
                            {errors.budget && <Text style={styles.errorText}>{errors.budget}</Text>}

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>CATEGORY</Text>
                            <View className="flex-row flex-wrap gap-2 mb-6">
                                {[
                                    { label: 'Transport', value: 'Transport' },
                                    { label: 'Food', value: 'Food' },
                                    { label: 'Hotel', value: 'Hotel' },
                                    { label: 'Sightseeing', value: 'Sightseeing' },
                                    { label: 'Other', value: 'Other' }
                                ].map((cat) => (
                                    <TouchableOpacity
                                        key={cat.value}
                                        onPress={() => setCategory(cat.value)}
                                        style={[
                                            { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
                                            category === cat.value
                                                ? { backgroundColor: '#5D6D54', borderColor: '#5D6D54' }
                                                : { 
                                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)', 
                                                    borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)' 
                                                  }
                                        ]}
                                    >
                                        <Text style={[{ fontSize: 12, fontWeight: '700' }, category === cat.value ? { color: 'white' } : { color: isDark ? '#B2C4AA' : '#5D6D54' }]}>
                                            {cat.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {activityId && (
                                <>
                                    <CurrencyInput
                                        label="Actual Cost"
                                        amount={actualCost}
                                        onAmountChange={(text) => setActualCost(MathUtils.formatCurrencyInput(text))}
                                        currency={actualCurrency}
                                        onCurrencyChange={setActualCurrency}
                                        onCurrencyPress={() => {
                                            // Show same currency selection modal logic as add-expense
                                            // For now, let's just allow toggling if we implement the modal here too
                                            setIsActualCurrencyModalVisible(true);
                                        }}
                                        manualRate=""
                                        onManualRateChange={() => { }}
                                    />
                                </>
                            )}

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>NOTES</Text>
                            <View style={{ 
                                flexDirection: 'row', 
                                alignItems: 'flex-start', 
                                borderWidth: 1, 
                                borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)', 
                                borderRadius: 16, 
                                paddingHorizontal: 16, 
                                paddingVertical: 14, 
                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)', 
                                marginBottom: 24 
                            }}>
                                <Feather name="align-left" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} style={{ marginTop: 2 }} />
                                <TextInput
                                     placeholder="Add notes for this activity..."
                                     placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                                    multiline
                                    numberOfLines={4}
                                    value={description}
                                    onChangeText={setDescription}
                                    className={`flex-1 text-base ml-3 font-semibold min-h-[80px] ${isDark ? 'text-white' : 'text-gray-900'}`}
                                    textAlignVertical="top"
                                />
                            </View>

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>SCHEDULE</Text>
                            <View className="gap-4">
                                <TouchableOpacity
                                    onPress={() => setShowDatePicker(true)}
                                    style={{ 
                                        flexDirection: 'row', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        borderWidth: 1, 
                                        borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)', 
                                        borderRadius: 16, 
                                        paddingVertical: 16, 
                                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)' 
                                    }}
                                >
                                    <Feather name="calendar" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} className="mr-2" />
                                     <Text className={`font-bold ml-2 ${date ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>
                                         {date ? date.format('MMMM D, YYYY') : 'Select Date'}
                                     </Text>
                                </TouchableOpacity>
                                {errors.date && <Text className="text-red-500 text-[10px] font-bold mt-[-8px] ml-4 uppercase">{errors.date}</Text>}

                                <Modal
                                    transparent
                                    visible={showDatePicker}
                                    animationType="fade"
                                    onRequestClose={() => setShowDatePicker(false)}
                                >
                                    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 24 }}>
                                        <View style={{
                                            backgroundColor: isDark ? '#282C26' : 'rgba(242, 240, 228, 0.98)',
                                            borderRadius: 32,
                                            padding: 24,
                                            borderWidth: 1,
                                            borderColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(255,255,255,0.4)',
                                        }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                                <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F2F0E8' : '#1a1a1a', textTransform: 'uppercase', letterSpacing: -0.5 }}>Select Date</Text>
                                                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ padding: 8 }}>
                                                    <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                                </TouchableOpacity>
                                            </View>

                                            <DateTimePicker
                                                mode="single"
                                                date={date?.toDate() || new Date()}
                                                minDate={currentTrip?.startDate ? dayjs(currentTrip.startDate).startOf('day').toDate() : undefined}
                                                maxDate={currentTrip?.endDate ? dayjs(currentTrip.endDate).endOf('day').toDate() : undefined}
                                                onChange={(params) => {
                                                    if (params.date) setDate(dayjs(params.date));
                                                    setShowDatePicker(false);
                                                }}
                                                styles={{
                                                    header: { paddingVertical: 10 },
                                                    month_selector_label: { fontWeight: 'bold', color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                                    year_selector_label: { fontWeight: 'bold', color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                                    weekday_label: { color: isDark ? '#B2C4AA' : '#9EB294', fontWeight: 'bold' },
                                                    selected: { backgroundColor: '#5D6D54' },
                                                    selected_label: { color: 'white', fontWeight: 'bold' },
                                                    day_label: { color: isDark ? '#B2C4AA' : '#333' },
                                                    disabled_label: { color: isDark ? '#4A5046' : '#cbd5e1' },
                                                    button_next: { backgroundColor: isDark ? '#3A3F37' : '#E9E4BF', borderRadius: 12, padding: 6 },
                                                    button_prev: { backgroundColor: isDark ? '#3A3F37' : '#E9E4BF', borderRadius: 12, padding: 6 },
                                                }}
                                            />
                                        </View>
                                    </View>
                                </Modal>

                                <View className="flex-row gap-4 mb-1">
                                    <View className="flex-1">
                                        <TouchableOpacity
                                            onPress={() => setShowStartTimePicker(true)}
                                            style={{ 
                                                flexDirection: 'row', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                borderWidth: 1, 
                                                borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)', 
                                                borderRadius: 16, 
                                                paddingVertical: 16, 
                                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)' 
                                            }}
                                        >
                                            <Feather name="clock" size={16} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                            <View className="ml-2">
                                                 <Text className={`text-[8px] font-black uppercase ${isDark ? 'text-[#B2C4AA]' : 'text-[#9EB294]'}`}>Starts</Text>
                                                 <Text className={`font-bold ${startTime ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>{startTime ? startTime.format('h:mm A') : '- - : - -'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        {errors.startTime && <Text className="text-red-500 text-[10px] font-bold mt-2 ml-4 uppercase">{errors.startTime}</Text>}
                                    </View>

                                    <View className="flex-1">
                                        <TouchableOpacity
                                            onPress={() => setShowEndTimePicker(true)}
                                            style={{ 
                                                flexDirection: 'row', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                borderWidth: 1, 
                                                borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)', 
                                                borderRadius: 16, 
                                                paddingVertical: 16, 
                                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)' 
                                            }}
                                        >
                                            <Feather name="clock" size={16} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                            <View className="ml-2">
                                                 <Text className={`text-[8px] font-black uppercase ${isDark ? 'text-[#B2C4AA]' : 'text-[#9EB294]'}`}>Ends</Text>
                                                 <Text className={`font-bold ${endTime ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>{endTime ? endTime.format('h:mm A') : '- - : - -'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        {errors.endTime && <Text className="text-red-500 text-[10px] font-bold mt-2 ml-4 uppercase">{errors.endTime}</Text>}
                                    </View>
                                </View>

                                <GlassTimePicker
                                    visible={showStartTimePicker}
                                    onClose={() => setShowStartTimePicker(false)}
                                    value={startTime || dayjs().set('hour', 9).set('minute', 0)}
                                    onChange={(selectedDate) => setStartTime(selectedDate)}
                                    title="SET START TIME"
                                />

                                <GlassTimePicker
                                    visible={showEndTimePicker}
                                    onClose={() => setShowEndTimePicker(false)}
                                    value={endTime || dayjs().set('hour', 10).set('minute', 0)}
                                    onChange={(selectedDate) => setEndTime(selectedDate)}
                                    title="SET END TIME"
                                />
                            </View>
                        </View>
                    </GlassView>
                </View>

                <TouchableOpacity
                    onPress={handleSave}
                    className="w-full mt-6 py-4 rounded-2xl shadow-sm"
                    style={{ backgroundColor: '#5D6D54', elevation: 8, shadowColor: '#5D6D54', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
                >
                    <Text className="text-white font-black text-center text-lg uppercase tracking-wider">
                        {activityId ? 'Update Activity' : 'Add Activity'}
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            <Modal
                transparent
                visible={isCountryModalVisible}
                animationType="slide"
                onRequestClose={() => { setIsCountryModalVisible(false); setCountrySearch(''); }}
            >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <View style={{
                        height: '60%',
                        backgroundColor: isDark ? '#282C26' : 'rgba(242, 240, 228, 0.98)',
                        borderTopLeftRadius: 32,
                        borderTopRightRadius: 32,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(158,178,148,0.1)' : 'transparent',
                    }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 12 }}>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F2F0E8' : '#1a1a1a', textTransform: 'uppercase', letterSpacing: -0.5 }}>Select Country</Text>
                            <TouchableOpacity onPress={() => { setIsCountryModalVisible(false); setCountrySearch(''); }} style={{ padding: 8 }}>
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>

                        {/* Search */}
                        <View style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            marginHorizontal: 24, 
                            marginBottom: 12, 
                            backgroundColor: isDark ? 'rgba(58,63,55,0.8)' : 'rgba(255,255,255,0.6)', 
                            borderRadius: 16, 
                            paddingHorizontal: 14, 
                            paddingVertical: 10, 
                            borderWidth: 1, 
                            borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(255,255,255,0.5)' 
                        }}>
                            <Feather name="search" size={16} color={isDark ? "#B2C4AA" : "#9EB294"} />
                            <TextInput
                                placeholder="Search countries..."
                                placeholderTextColor={isDark ? "rgba(178,196,170,0.4)" : "#9ca3af"}
                                value={countrySearch}
                                onChangeText={setCountrySearch}
                                style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '600', color: isDark ? '#F2F0E8' : '#111827' }}
                            />
                        </View>

                        {/* Country List */}
                        <FlatList
                            data={tripCountries.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))}
                            keyExtractor={(item) => item}
                            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item: c }) => (
                                <TouchableOpacity
                                    onPress={() => {
                                        if (!selectedCountries.includes(c)) {
                                            setSelectedCountries([...selectedCountries, c]);
                                        }
                                        setIsCountryModalVisible(false);
                                        setCountrySearch('');
                                    }}
                                    style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <Text style={{ fontSize: 16, fontWeight: '600', color: selectedCountries.includes(c) ? (isDark ? '#F2F0E8' : '#5D6D54') : (isDark ? '#B2C4AA' : '#374151') }}>{c}</Text>
                                    {selectedCountries.includes(c) && <Feather name="check" size={18} color={isDark ? "#F2F0E8" : "#5D6D54"} />}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <Modal
                transparent
                visible={isActualCurrencyModalVisible}
                animationType="fade"
                onRequestClose={() => setIsActualCurrencyModalVisible(false)}
            >
                <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={1}
                    onPress={() => setIsActualCurrencyModalVisible(false)}
                >
                    <GlassView
                        style={{ width: '80%', maxHeight: '60%' }}
                        intensity={isDark ? 80 : 95}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    >
                        <View style={{ padding: 24 }}>
                            <Text style={[styles.sectionLabel, isDark && { color: '#B2C4AA' }]}>Select Currency</Text>
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
                                            setActualCurrency(item);
                                            setIsActualCurrencyModalVisible(false);
                                        }}
                                    >
                                        <Text style={{ fontSize: 18, fontWeight: '900', color: actualCurrency === item ? (isDark ? '#F2F0E8' : '#5D6D54') : (isDark ? '#B2C4AA' : '#111827') }}>
                                            {item}
                                        </Text>
                                        {actualCurrency === item && (
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
    cardContainer: {
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.15,
        shadowRadius: 30,
        elevation: 8,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: -16,
        marginBottom: 16,
        marginLeft: 16,
        textTransform: 'uppercase',
    },
    sectionLabel: { 
        fontSize: 14, 
        fontWeight: '900', 
        color: '#5D6D54', 
        marginBottom: 16, 
        textTransform: 'uppercase', 
        letterSpacing: 1 
    }
});
