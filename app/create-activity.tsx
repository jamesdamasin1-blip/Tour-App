import React, { useCallback, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Text, Modal, ActivityIndicator } from 'react-native';
import { BottomFade } from '../components/BottomFade';
import { RippleButton } from '../components/RippleButton';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';

import { MeshBackground } from '../components/MeshBackground';
import { Header } from '../components/Header';
import { GlassView } from '../components/GlassView';
import { GlassTimePicker } from '../components/GlassTimePicker';

import { useCreateActivity } from '../src/features/activity/hooks/useCreateActivity';
import { ActivityFormDetails } from '../src/features/activity/components/ActivityFormDetails';
import { ActivityFormSchedule } from '../src/features/activity/components/ActivityFormSchedule';
import { ActivityFormFinance } from '../src/features/activity/components/ActivityFormFinance';
import {
    PRIMARY_ACTION_HEIGHT,
    PRIMARY_ACTION_RADIUS,
    PRIMARY_ACTION_TEXT_SIZE,
} from '../src/styles/primaryAction';

export default function CreateActivityScreen() {
    const { tripId, activityId } = useLocalSearchParams<{ tripId: string, activityId: string }>();
    const insets = useSafeAreaInsets();
    const [showBottomFade, setShowBottomFade] = useState(false);
    
    const {
        // State & Actions
        title, setTitle,
        allocatedBudget, setAllocatedBudget,
        category, setCategory,
        description, setDescription,
        budgetCurrency, setBudgetCurrency,
        actualCurrency, setActualCurrency,
        date, setDate,
        startTime, setStartTime,
        endTime, setEndTime,
        actualCost, setActualCost,
        errors, setErrors,
        actualCostHelperText,
        actualCostValidationError,
        handleSave,
        isSaving,
        
        // UI State
        isDark, isAdmin,
        showDatePicker, setShowDatePicker,
        showStartTimePicker, setShowStartTimePicker,
        showEndTimePicker, setShowEndTimePicker,
        
        // Data
        currentTrip,
        budgetAvailableCurrencies,
        actualAvailableCurrencies,
        hasExpenses,
    } = useCreateActivity(tripId, activityId);

    const handleScroll = useCallback((event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);


    return (
        <MeshBackground>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
            >
                <Header 
                    title={activityId ? "Edit Activity" : "New Activity"} 
                    showBack 
                    showThemeToggle={false}
                />

                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 80 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                >
                    <GlassView intensity={isDark ? 50 : 80} borderRadius={32} style={{ padding: 2 }}>
                        <ActivityFormDetails
                            title={title}
                            setTitle={setTitle}
                            category={category}
                            setCategory={setCategory}
                            description={description}
                            setDescription={setDescription}
                            isDark={isDark}
                            isAdmin={isAdmin}
                            errors={errors}
                            setErrors={setErrors}
                        />

                        <ActivityFormSchedule
                            date={date}
                            setShowDatePicker={setShowDatePicker}
                            startTime={startTime}
                            setShowStartTimePicker={setShowStartTimePicker}
                            endTime={endTime}
                            setShowEndTimePicker={setShowEndTimePicker}
                            isDark={isDark}
                            errors={errors}
                        />

                        <ActivityFormFinance
                            allocatedBudget={allocatedBudget}
                            setAllocatedBudget={setAllocatedBudget}
                            budgetCurrency={budgetCurrency}
                            setBudgetCurrency={setBudgetCurrency}
                            actualCost={actualCost}
                            setActualCost={setActualCost}
                            actualCurrency={actualCurrency}
                            setActualCurrency={setActualCurrency}
                            budgetAvailableCurrencies={budgetAvailableCurrencies}
                            actualAvailableCurrencies={actualAvailableCurrencies}
                            isDark={isDark}
                            isAdmin={isAdmin}
                            activityId={activityId}
                            hasExpenses={hasExpenses}
                            errors={errors}
                            actualCostHelperText={actualCostHelperText}
                            actualCostValidationError={actualCostValidationError}
                        />
                    </GlassView>

                    {/* Button below the card */}
                    <RippleButton
                        onPress={handleSave}
                        disabled={isSaving}
                        glowColor={isDark ? 'rgba(178, 196, 170, 0.5)' : 'rgba(93, 109, 84, 0.4)'}
                        style={{
                            marginTop: 24,
                            height: PRIMARY_ACTION_HEIGHT,
                            borderRadius: PRIMARY_ACTION_RADIUS,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                            opacity: isSaving ? 0.7 : 1,
                            shadowColor: isDark ? '#B2C4AA' : '#5D6D54',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.18,
                            shadowRadius: 10,
                            elevation: 5,
                        }}
                    >
                        {isSaving ? (
                            <ActivityIndicator color={isDark ? '#1A1C18' : '#FFFFFF'} size="small" />
                        ) : (
                            <Text
                                style={{
                                    fontWeight: '900',
                                    fontSize: PRIMARY_ACTION_TEXT_SIZE,
                                    letterSpacing: 2,
                                    textTransform: 'uppercase',
                                    color: isDark ? '#1A1C18' : '#FFFFFF',
                                }}
                            >
                                {activityId ? 'UPDATE ACTIVITY' : 'CREATE ACTIVITY'}
                            </Text>
                        )}
                    </RippleButton>
                </ScrollView>
            </KeyboardAvoidingView>

            <BottomFade visible={showBottomFade} height={190} />

            {/* Modals */}

            {/* Date Picker Modal */}
            <Modal transparent visible={showDatePicker} animationType="fade">
                <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 24 }}>
                    <View style={{
                        backgroundColor: isDark ? '#282C26' : 'rgba(242, 240, 228, 0.98)',
                        borderRadius: 32,
                        padding: 24,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(255,255,255,0.4)',
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? '#F2F0E8' : '#1a1a1a', textTransform: 'uppercase' }}>Select Date</Text>
                            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ padding: 8 }}>
                                <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>
                        <DateTimePicker
                            mode="single"
                            date={date?.toDate() || (currentTrip?.startDate ? new Date(currentTrip.startDate) : new Date())}
                            onChange={(params) => {
                                if (params.date) setDate(dayjs(params.date));
                                setShowDatePicker(false);
                            }}
                            minDate={currentTrip?.startDate ? new Date(currentTrip.startDate) : undefined}
                            maxDate={currentTrip?.endDate ? new Date(currentTrip.endDate) : undefined}
                            components={{
                                IconPrev: <Feather name="chevron-left" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />,
                                IconNext: <Feather name="chevron-right" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />,
                            }}
                            styles={{
                                month_selector_label: { color: isDark ? '#F2F0E8' : '#1a1a1a', fontWeight: 'bold' },
                                year_selector_label: { color: isDark ? '#F2F0E8' : '#1a1a1a', fontWeight: 'bold' },
                                weekday_label: { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: '900' },
                                day_label: { color: isDark ? '#F2F0E8' : '#1a1a1a' },
                                selected: { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' },
                                selected_label: { color: isDark ? '#1a1a1a' : '#fff', fontWeight: 'bold' },
                                today_label: { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: 'bold' },
                                button_prev: { 
                                    backgroundColor: isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.1)',
                                    borderRadius: 10,
                                    padding: 4,
                                },
                                button_next: { 
                                    backgroundColor: isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.1)',
                                    borderRadius: 10,
                                    padding: 4,
                                },
                            }}
                        />
                    </View>
                </View>
            </Modal>

            {/* Time Pickers */}
            <GlassTimePicker
                visible={showStartTimePicker}
                onClose={() => setShowStartTimePicker(false)}
                onChange={(time) => {
                    setStartTime(time);
                    // Default end time to 1 hour after start time
                    setEndTime(time.add(1, 'hour'));
                    // Sequential flow: auto-open end time picker
                    setShowStartTimePicker(false);
                    setTimeout(() => setShowEndTimePicker(true), 300);
                }}
                value={startTime || (date ? date.hour(9).minute(0) : dayjs().hour(9).minute(0))}
                title="Start Time"
            />

            <GlassTimePicker
                visible={showEndTimePicker}
                onClose={() => setShowEndTimePicker(false)}
                onChange={(time) => {
                    setEndTime(time);
                }}
                value={endTime || dayjs()}
                title="End Time"
            />
        </MeshBackground>
    );
}
