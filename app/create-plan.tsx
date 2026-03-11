import { CurrencyInput } from '@/components/CurrencyInput';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { TripPlan } from '@/src/types/models';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from 'react-native-ui-datepicker';
import { COUNTRIES } from '../src/data/countries';
import { useStore } from '../src/store/useStore';
import { Alert } from 'react-native';

export default function CreatePlanScreen() {
    const router = useRouter();
    const { editId } = useLocalSearchParams<{ editId: string }>();
    const insets = useSafeAreaInsets();
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const addTrip = useStore(state => state.addTrip);
    const updateTrip = useStore(state => state.updateTrip);
    const importTrip = useStore(state => state.importTrip);
    const trips = useStore(state => state.trips);

    const isEditing = !!editId;

    const [title, setTitle] = useState('');
    const [budget, setBudget] = useState('');
    const [currency, setCurrency] = useState('PHP');
    const [startDate, setStartDate] = useState<dayjs.Dayjs | null>(null);
    const [endDate, setEndDate] = useState<dayjs.Dayjs | null>(null);

    const [showPicker, setShowPicker] = useState(false);
    const [validationMessage, setValidationMessage] = useState<string | null>(null);

    const [titleError, setTitleError] = useState(false);
    const [budgetError, setBudgetError] = useState(false);
    const [durationError, setDurationError] = useState(false);
    const [countriesError, setCountriesError] = useState(false);

    // Country logic
    const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');
    const [countries, setCountries] = useState<string[]>([]);
    
    const { ALL_CURRENCIES } = require('../src/data/currencyMapping');

    useEffect(() => {
        if (isEditing && editId) {
            const trip = trips.find(t => t.id === editId);
            if (trip) {
                setTitle(trip.title);
                setBudget(MathUtils.formatCurrencyInput(trip.totalBudget.toString()));
                setStartDate(dayjs(trip.startDate));
                setEndDate(dayjs(trip.endDate));
                setCountries(trip.countries || []);
            }
        }
    }, [isEditing, editId, trips]);

    const handleAddCountry = (c: string) => {
        if (!countries.includes(c)) {
            setCountries([...countries, c]);
        }
        setIsCountryModalVisible(false);
        setCountrySearch('');
        setCountriesError(false);
    };

    const removeCountry = (cToRemove: string) => {
        setCountries(countries.filter(c => c !== cToRemove));
    };

    const handleStart = () => {
        let hasError = false;

        if (!title.trim()) {
            setTitleError(true);
            hasError = true;
        } else {
            setTitleError(false);
        }

        const numericBudget = MathUtils.parseCurrencyInput(budget);
        if (!budget.trim() || numericBudget <= 0) {
            setBudgetError(true);
            hasError = true;
        } else {
            setBudgetError(false);
        }

        if (!startDate || !endDate) {
            setDurationError(true);
            hasError = true;
        } else {
            setDurationError(false);
        }

        if (countries.length === 0) {
            setCountriesError(true);
            hasError = true;
        } else {
            setCountriesError(false);
        }

        if (hasError) {
            setValidationMessage('Please properly fill the highlighted fields.');
            return;
        }

        if (startDate && endDate && endDate.isBefore(startDate)) {
            setValidationMessage('End date cannot be before start date.');
            return;
        }

        const tripData: Omit<TripPlan, 'id' | 'activities'> = {
            title: title.trim(),
            totalBudget: numericBudget,
            startDate: startDate!.valueOf(),
            endDate: endDate!.valueOf(),
            countries,
            currency: currency,
            isCompleted: false,
            lastModified: Date.now()
        };

        if (isEditing && editId) {
            updateTrip(editId, tripData);
            router.back();
        } else {
            const newId = addTrip(tripData as any);
            router.replace(`/trip/${newId}` as any);
        }
    };

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <Header
                    title={isEditing ? 'EDIT TRIP PLAN' : 'CREATE NEW PLAN'}
                    showBack={true}
                />

                <ScrollView className="flex-1 px-6 py-6" showsVerticalScrollIndicator={false}>
                    <View style={[styles.cardContainer, isDark && { shadowColor: '#000' }]}>
                        <GlassView
                            intensity={isDark ? 50 : 80}
                            borderRadius={32}
                            borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                            backgroundColor={isDark ? "rgba(40, 44, 38, 0.8)" : "rgba(255, 255, 255, 0.50)"}
                            style={{ paddingHorizontal: 20, paddingVertical: 24 }}
                        >
                            <Text className={`text-sm font-bold mb-4 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Trip Details</Text>

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>TRIP NAME</Text>
                            <View 
                                className="flex-row items-center border rounded-2xl px-4 py-4 mb-1" 
                                style={{ 
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
                                    borderColor: titleError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)')
                                }}
                            >
                                <Feather name="briefcase" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                <TextInput
                                    placeholder="e.g. Boracay Summer 2024"
                                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                                    value={title}
                                    onChangeText={setTitle}
                                    className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                                />
                            </View>
                            {titleError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD TRIP NAME</Text>}
                            {!titleError && <View className="mb-6" />}

                            <CurrencyInput
                                label="Total Budget"
                                amount={budget}
                                onAmountChange={(text) => setBudget(MathUtils.formatCurrencyInput(text))}
                                currency={currency}
                                onCurrencyChange={setCurrency}
                                onCurrencyPress={() => setIsCurrencyModalVisible(true)}
                                manualRate=""
                                onManualRateChange={() => { }}
                                placeholder="0.00"
                                hasError={budgetError}
                            />
                            {budgetError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD BUDGET</Text>}
                            {!budgetError && <View className="mb-6" />}

                            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>DURATION</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowPicker(true);
                                    setDurationError(false);
                                }}
                                className="flex-row gap-4 mb-2 items-center border rounded-2xl p-4" 
                                style={{ 
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
                                    borderColor: durationError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)')
                                }}
                            >
                                <View className="flex-1">
                                    <Text className={`text-[9px] font-black uppercase mb-1 ${isDark ? 'text-[#9EB294]' : 'text-[#9EB294]'}`}>Starts</Text>
                                    <View className="flex-row items-center">
                                        <Feather name="calendar" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                        <Text className={`font-bold ml-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {startDate ? startDate.format('MMM D') : '-'}
                                        </Text>
                                    </View>
                                </View>

                                <View className="flex-1">
                                    <Text className={`text-[9px] font-black uppercase mb-1 ${isDark ? 'text-[#9EB294]' : 'text-[#9EB294]'}`}>Ends</Text>
                                    <View className="flex-row items-center">
                                        <Feather name="calendar" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                        <Text className={`font-bold ml-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {endDate ? endDate.format('MMM D') : '-'}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                            {durationError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD DURATION</Text>}
                            {!durationError && <View className="mb-6" />}

                            <Text className={`text-[10px] font-black mb-2 mt-4 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>COUNTRIES</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setIsCountryModalVisible(true);
                                    setCountriesError(false);
                                }}
                                className="flex-row items-center border rounded-2xl px-4 py-4 mb-1"
                                style={{ 
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
                                    borderColor: countriesError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.20)' : 'rgba(93, 109, 84, 0.15)')
                                }}
                            >
                                <Feather name="map-pin" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                <Text className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400'}`}>
                                    {countries.length > 0 ? "Add more countries" : "Select Countries..."}
                                </Text>
                                {countries.length === 0 ? (
                                    <Feather name="chevron-down" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                ) : (
                                    <View className="w-6 h-6 rounded-full items-center justify-center" style={{ borderWidth: 1, borderColor: isDark ? '#B2C4AA' : '#9EB294' }}>
                                        <Feather name="plus" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                    </View>
                                )}
                            </TouchableOpacity>
                            {countriesError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD AT LEAST ONE COUNTRY</Text>}
                            {!countriesError && <View className="mb-4" />}

                            {/* Render Country Chips */}
                            {countries.length > 0 && (
                                <View className="flex-row flex-wrap gap-2 mb-2">
                                    {countries.map((c) => (
                                        <View key={c} className={`flex-row items-center px-3 py-1.5 rounded-full shadow-sm border ${isDark ? 'bg-[#3A3F37] border-[#9EB294]/30' : 'bg-[#E9E4BF] border-[#5D6D54]/20'}`}>
                                            <Text className={`font-bold text-sm mr-2 ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>{c}</Text>
                                            <TouchableOpacity onPress={() => removeCountry(c)}>
                                                <Feather name="x-circle" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </GlassView>
                    </View>

                    {/* Start Button */}
                    <TouchableOpacity
                        onPress={handleStart}
                        className="w-full mt-6 py-4 rounded-2xl shadow-sm"
                        style={{ backgroundColor: '#5D6D54', elevation: 8, shadowColor: '#5D6D54', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
                    >
                        <Text className="text-white font-black text-center text-lg uppercase tracking-wider">
                            {isEditing ? 'UPDATE PLAN' : 'COMPLETE'}
                        </Text>
                    </TouchableOpacity>

                    <View className="h-40" />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Modals outside KeyboardAvoidingView for stability */}

            <Modal
                transparent
                visible={!!validationMessage}
                animationType="fade"
                onRequestClose={() => setValidationMessage(null)}
            >
                <View className="flex-1 justify-center items-center bg-black/40 px-6">
                    <GlassView
                        intensity={isDark ? 80 : 85}
                        borderRadius={32}
                        borderWidth={1}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                        backgroundColor={isDark ? "#282C26" : "rgba(242, 240, 228, 0.85)"}
                        style={{ width: '100%', padding: 24 }}
                    >
                        <View className="items-center">
                            <View className="w-16 h-16 bg-[#FFE5E5] rounded-full items-center justify-center mb-4">
                                <Feather name="alert-circle" size={32} color="#FF3B30" />
                            </View>
                            <Text className={`text-xl font-black mb-2 uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : '#1a1a1a'}`}>Missing Details</Text>
                            <Text className={`text-center mb-8 font-medium ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]/80'}`}>
                                {validationMessage}
                            </Text>

                            <View className="flex-row gap-3 w-full">
                                <TouchableOpacity
                                    onPress={() => setValidationMessage(null)}
                                    className="flex-1 py-4 rounded-2xl bg-[#5D6D54]"
                                >
                                    <Text className="text-white font-bold text-center">GOT IT</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </GlassView>
                </View>
            </Modal>

            {/* Select Duration Modal */}
            <Modal
                transparent
                visible={showPicker}
                animationType="fade"
                onRequestClose={() => setShowPicker(false)}
            >
                <View className="flex-1 justify-center bg-black/40 px-6">
                    <GlassView
                        intensity={isDark ? 80 : 95}
                        borderRadius={32}
                        borderWidth={1}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                        style={{ padding: 24, minHeight: 400 }}
                    >
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : '#1a1a1a'}`}>Select Duration</Text>
                            <TouchableOpacity onPress={() => setShowPicker(false)} className="p-2">
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>

                        <DateTimePicker
                            mode="range"
                            minDate={dayjs().startOf('day')}
                            startDate={startDate || undefined}
                            endDate={endDate || undefined}
                            onChange={(params) => {
                                if (params.startDate) setStartDate(dayjs(params.startDate));
                                if (params.endDate) {
                                    setEndDate(dayjs(params.endDate));
                                    setShowPicker(false);
                                } else if (params.startDate) {
                                    setEndDate(null);
                                }
                            }}
                            styles={{
                                header: { paddingVertical: 10 },
                                month_selector_label: { fontWeight: 'bold', color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                year_selector_label: { fontWeight: 'bold', color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                weekday_label: { color: isDark ? '#B2C4AA' : '#9EB294', fontWeight: 'bold' },
                                day_label: { color: isDark ? '#B2C4AA' : '#333' },
                                selected: { backgroundColor: '#5D6D54' },
                                range_fill: { backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(93, 109, 84, 0.2)' },
                                range_start: { backgroundColor: '#5D6D54' },
                                range_end: { backgroundColor: '#5D6D54' },
                                selected_label: { color: 'white', fontWeight: 'bold' },
                                range_start_label: { color: 'white', fontWeight: 'bold' },
                                range_end_label: { color: 'white', fontWeight: 'bold' },
                                button_next: { backgroundColor: isDark ? '#3A3F37' : '#E9E4BF', borderRadius: 12, padding: 6 },
                                button_prev: { backgroundColor: isDark ? '#3A3F37' : '#E9E4BF', borderRadius: 12, padding: 6 },
                            }}
                        />
                        
                        {!endDate && (
                            <TouchableOpacity 
                                onPress={() => setShowPicker(false)} 
                                className="mt-6 py-4 bg-[#5D6D54] rounded-2xl items-center shadow-sm"
                            >
                                <Text className="text-white font-bold uppercase tracking-wider">Confirm</Text>
                            </TouchableOpacity>
                        )}
                    </GlassView>
                </View>
            </Modal>

            {/* Select Country Modal */}
            <Modal
                transparent
                visible={isCountryModalVisible}
                animationType="slide"
                onRequestClose={() => setIsCountryModalVisible(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setIsCountryModalVisible(false)}
                    className="flex-1 justify-end bg-black/40"
                >
                    <GlassView
                        intensity={isDark ? 80 : 95}
                        borderRadius={32}
                        borderWidth={1}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                        style={{ height: '80%', padding: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                    >
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : '#1a1a1a'}`}>Select Country</Text>
                            <TouchableOpacity onPress={() => setIsCountryModalVisible(false)} className="p-2">
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>

                        <View 
                            className={`flex-row items-center border rounded-2xl px-4 py-3 mb-6 ${isDark ? 'border-[#9EB294]/20' : 'bg-white/60 border-white/50'}`}
                            style={isDark ? { backgroundColor: 'rgba(58, 63, 55, 0.8)' } : {}}
                        >
                            <Feather name="search" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                            <TextInput
                                placeholder="Search countries..."
                                placeholderTextColor={isDark ? "rgba(178,196,170,0.4)" : "#9ca3af"}
                                value={countrySearch}
                                onChangeText={setCountrySearch}
                                className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                                autoFocus
                            />
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                            <View className="pb-10">
                                {COUNTRIES.filter((c: string) => c.toLowerCase().includes(countrySearch.toLowerCase())).map((c: string) => (
                                    <TouchableOpacity
                                        key={c}
                                        onPress={() => handleAddCountry(c)}
                                        className={`py-4 border-b flex-row items-center justify-between ${isDark ? 'border-white/05' : 'border-white/30'}`}
                                    >
                                        <Text className={`text-lg font-semibold ${countries.includes(c) ? (isDark ? '#F2F0E8' : '#5D6D54') : (isDark ? '#B2C4AA' : 'text-gray-700')}`}>
                                            {c}
                                        </Text>
                                        {countries.includes(c) && (
                                            <Feather name="check" size={20} color={isDark ? "#F2F0E8" : "#5D6D54"} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </GlassView>
                </TouchableOpacity>
            </Modal>

            {/* Select Currency Modal */}
            <Modal
                transparent
                visible={isCurrencyModalVisible}
                animationType="slide"
                onRequestClose={() => setIsCurrencyModalVisible(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setIsCurrencyModalVisible(false)}
                    className="flex-1 justify-end bg-black/40"
                >
                    <GlassView
                        intensity={isDark ? 80 : 95}
                        borderRadius={32}
                        borderWidth={1}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                        style={{ height: '60%', padding: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                    >
                        <View className="flex-row items-center justify-between mb-6">
                            <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : '#1a1a1a'}`}>Select Currency</Text>
                            <TouchableOpacity onPress={() => setIsCurrencyModalVisible(false)} className="p-2">
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                            <View className="flex-row flex-wrap gap-2">
                                {ALL_CURRENCIES.map((curr: any) => (
                                    <TouchableOpacity
                                        key={curr.code}
                                        onPress={() => {
                                            setCurrency(curr.code);
                                            setIsCurrencyModalVisible(false);
                                        }}
                                        className={`flex-row items-center px-4 py-3 rounded-2xl border ${currency === curr.code ? (isDark ? 'bg-[#5D6D54] border-[#9EB294]' : 'bg-[#5D6D54] border-[#5D6D54]') : (isDark ? 'bg-[#3A3F37] border-[#9EB294]/20' : 'bg-white border-gray-200')}`}
                                    >
                                        <Text className={`font-bold mr-2 ${currency === curr.code ? 'text-white' : (isDark ? 'text-[#F2F0E8]' : 'text-gray-900')}`}>{curr.code}</Text>
                                        <Text className={`text-xs ${currency === curr.code ? 'text-white/70' : (isDark ? 'text-[#B2C4AA]' : 'text-gray-500')}`}>{curr.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </GlassView>
                </TouchableOpacity>
            </Modal>
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
    }
});
