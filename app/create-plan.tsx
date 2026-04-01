import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { BottomFade } from '@/components/BottomFade';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { useCreatePlan } from '@/src/features/trip/hooks/useCreatePlan';
import { TripFormDetails } from '@/src/features/trip/components/TripFormDetails';
import { TripFormBudget } from '@/src/features/trip/components/TripFormBudget';
import { CountryPickerModal } from '@/src/features/trip/components/CountryPickerModal';
import { DurationPickerModal } from '@/src/features/trip/components/DurationPickerModal';
import { ValidationModal } from '@/src/features/trip/components/ValidationModal';
import {
    PRIMARY_ACTION_HEIGHT,
    PRIMARY_ACTION_RADIUS,
    PRIMARY_ACTION_TEXT_SIZE,
} from '@/src/styles/primaryAction';

export default function CreatePlanScreen() {
    const { state, actions } = useCreatePlan();
    const [modals, setModals] = useState({ country: false, duration: false, homeCountry: false });
    const [showBottomFade, setShowBottomFade] = useState(false);

    const toggleModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: !prev[modal] }));
    const handleScroll = useCallback((event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                className="flex-1"
            >
                <Header title={state.isEditing ? 'EDIT TRIP PLAN' : 'CREATE NEW PLAN'} showBack />
                <ScrollView
                    className="flex-1 px-6 py-6"
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                >
                    <View style={styles.cardContainer}>
                        <GlassView intensity={state.isDark ? 50 : 80} borderRadius={32} style={{ padding: 20 }}>
                            <Text className={`text-sm font-black mb-6 uppercase tracking-[0.2em] text-center w-full ${state.isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Plan Your Trip</Text>
                            
                            <TripFormDetails
                                {...state}
                                onHomeCountryPress={() => toggleModal('homeCountry')}
                                onCountryPress={() => toggleModal('country')}
                                onDurationPress={() => toggleModal('duration')}
                                removeCountry={c => actions.setCountries(state.countries.filter(item => item !== c))}
                                setTitle={actions.setTitle}
                            />

                            <TripFormBudget
                                {...state}
                                disabled={state.countries.length === 0}
                                onBudgetChange={actions.setWalletBudgets}
                                onHomeBudgetChange={actions.setWalletHomeBudgets}
                            />
                        </GlassView>
                    </View>

                    <TouchableOpacity
                        onPress={actions.handleStart}
                        disabled={state.isSaving}
                        className="w-full mt-6 bg-[#5D6D54] shadow-lg"
                        style={{
                            opacity: state.isSaving ? 0.7 : 1,
                            height: PRIMARY_ACTION_HEIGHT,
                            borderRadius: PRIMARY_ACTION_RADIUS,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {state.isSaving ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center', fontSize: PRIMARY_ACTION_TEXT_SIZE, textTransform: 'uppercase', letterSpacing: 2 }}>
                                {state.isEditing ? 'UPDATE PLAN' : 'COMPLETE'}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <View className="h-40" />
                </ScrollView>
            </KeyboardAvoidingView>

            <BottomFade visible={showBottomFade} height={180} />

            {/* Home Country Picker (Step 1) */}
            <CountryPickerModal 
                visible={modals.homeCountry} 
                onClose={() => toggleModal('homeCountry')} 
                selectedCountries={[state.homeCountry]} 
                onToggleCountry={c => {
                    actions.setHomeCountry(c);
                    toggleModal('homeCountry');
                }} 
                isDark={state.isDark} 
            />

            {/* Trip Countries Picker (Step 2) */}
            <CountryPickerModal 
                visible={modals.country} 
                onClose={() => toggleModal('country')} 
                selectedCountries={state.countries} 
                disabledCountries={state.homeCountry ? [state.homeCountry] : []}
                onToggleCountry={c => {
                    actions.setCountries(state.countries.includes(c) ? state.countries.filter(i => i !== c) : [...state.countries, c]);
                    actions.setValidationMessage(null);
                }} 
                isDark={state.isDark} 
            />

            <DurationPickerModal 
                visible={modals.duration} 
                onClose={() => toggleModal('duration')} 
                startDate={state.startDate} 
                endDate={state.endDate} 
                onDatesChange={params => {
                    if (params.startDate) actions.setStartDate(params.startDate);
                    if (params.endDate) actions.setEndDate(params.endDate);
                }} 
                isDark={state.isDark} 
            />

            <ValidationModal 
                visible={!!state.validationMessage} 
                message={state.validationMessage} 
                onClose={() => actions.setValidationMessage(null)} 
                isDark={state.isDark} 
            />
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    cardContainer: { shadowColor: '#5D6D54', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.15, shadowRadius: 30, elevation: 8 }
});
