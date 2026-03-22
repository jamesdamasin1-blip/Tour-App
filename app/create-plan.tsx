import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { useCreatePlan } from '@/src/features/trip/hooks/useCreatePlan';
import { TripFormDetails } from '@/src/features/trip/components/TripFormDetails';
import { TripFormBudget } from '@/src/features/trip/components/TripFormBudget';
import { TripFormCurrency } from '@/src/features/trip/components/TripFormCurrency';
import { CountryPickerModal } from '@/src/features/trip/components/CountryPickerModal';
import { DurationPickerModal } from '@/src/features/trip/components/DurationPickerModal';
import { CurrencyPickerModal } from '@/src/features/trip/components/CurrencyPickerModal';
import { ValidationModal } from '@/src/features/trip/components/ValidationModal';

export default function CreatePlanScreen() {
    const { state, actions } = useCreatePlan();
    const [modals, setModals] = useState({ country: false, duration: false, homeCountry: false });

    const toggleModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: !prev[modal] }));

    return (
        <MeshBackground>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
                <Header title={state.isEditing ? 'EDIT TRIP PLAN' : 'CREATE NEW PLAN'} showBack />
                <ScrollView className="flex-1 px-6 py-6" showsVerticalScrollIndicator={false}>
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

                    <TouchableOpacity onPress={actions.handleStart} className="w-full mt-6 py-4 rounded-2xl bg-[#5D6D54] shadow-lg">
                        <Text className="text-white font-black text-center text-lg uppercase tracking-wider">
                            {state.isEditing ? 'UPDATE PLAN' : 'COMPLETE'}
                        </Text>
                    </TouchableOpacity>
                    <View className="h-40" />
                </ScrollView>
            </KeyboardAvoidingView>

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
