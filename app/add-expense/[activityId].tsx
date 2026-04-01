import React, { useCallback, useState } from 'react';
import { 
    ActivityIndicator,
    KeyboardAvoidingView, 
    Platform, 
    ScrollView, 
    StyleSheet, 
    Text, 
    TouchableOpacity, 
    View, 
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomFade } from '@/components/BottomFade';
import { CurrencyInput } from '@/components/CurrencyInput';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';

import { useAddExpense } from '@/src/features/activity/hooks/useAddExpense';
import {
    PRIMARY_ACTION_HEIGHT,
    PRIMARY_ACTION_RADIUS,
    PRIMARY_ACTION_TEXT_SIZE,
} from '@/src/styles/primaryAction';

export default function AddExpenseScreen() {
    const activityId = useLocalSearchParams<{ activityId: string }>().activityId;
    const insets = useSafeAreaInsets();
    const [showBottomFade, setShowBottomFade] = useState(false);
    
    const {
        // State
        amount, setAmount,
        currency, setCurrency,
        isSaving,
        
        // Data
        isDark, isAdmin,
        activity,
        availableCurrencies,
        amountValidationError,
        amountHelperText,
        
        // Actions
        handleSave
    } = useAddExpense(activityId);

    const handleScroll = useCallback((event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    if (!activity) {
        return (
            <MeshBackground style={{ justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#B2C4AA' : '#5D6D54' }}>Activity not found</Text>
            </MeshBackground>
        );
    }

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <Header title="ADD AN EXPENSE" showBack={true} showThemeToggle={false} />

                <ScrollView 
                    contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24, paddingBottom: insets.bottom + 40 }} 
                    showsVerticalScrollIndicator={false}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                >
                    <GlassView
                        style={[styles.cardContainer, isDark && { shadowColor: '#000' }]}
                        intensity={isDark ? 40 : 60}
                        borderRadius={32}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(93, 109, 84, 0.15)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.8)" : "rgba(255, 255, 255, 0.75)"}
                    >
                        <View style={{ padding: 24 }}>
                            <Text style={[styles.sectionLabel, isDark && { color: '#B2C4AA', opacity: 0.6 }]}>Linking To</Text>
                            <View style={[styles.linkInfo, { backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)', borderColor: isDark ? 'rgba(158, 178, 148, 0.2)' : 'rgba(93, 109, 84, 0.15)' }]}>
                                <Feather name="link-2" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                                <Text style={[styles.linkText, isDark && { color: '#F2F0E8' }]}>{activity.title}</Text>
                            </View>

                            <CurrencyInput
                                label="Actual Cost"
                                amount={amount}
                                onAmountChange={setAmount}
                                currency={currency}
                                onCurrencyChange={setCurrency}
                                options={availableCurrencies}
                                editable={isAdmin}
                                placeholder="0.00"
                                error={amountValidationError}
                                helperText={amountHelperText}
                            />



                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={isSaving || !isAdmin || amount === '' || !!amountValidationError}
                                style={[
                                    styles.saveButton,
                                    { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' },
                                (isSaving || !isAdmin || amount === '' || !!amountValidationError) && { opacity: 0.5 }
                            ]}
                        >
                                {isSaving ? (
                                    <ActivityIndicator color={isDark ? '#1a1a1a' : '#FFFFFF'} size="small" />
                                ) : (
                                    <Text style={[styles.saveButtonText, { color: isDark ? '#1a1a1a' : 'white' }]}>
                                        {isAdmin ? 'SAVE EXPENSE' : 'VIEW ONLY'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </GlassView>
                </ScrollView>


            </KeyboardAvoidingView>

            <BottomFade visible={showBottomFade} height={170} />
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    cardContainer: { borderRadius: 32, elevation: 4 },
    sectionLabel: { fontSize: 10, fontWeight: '900', color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    linkInfo: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24 },
    linkText: { flex: 1, fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
    modeToggle: { flexDirection: 'row', borderRadius: 16, padding: 4, borderWidth: 1, marginBottom: 16 },
    modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
    modeButtonText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    rateInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, height: 56, marginBottom: 12 },
    manualTextInput: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 12 },
    previewContainer: { padding: 16, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed' },
    previewLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
    saveButton: { height: PRIMARY_ACTION_HEIGHT, borderRadius: PRIMARY_ACTION_RADIUS, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
    saveButtonText: { fontWeight: '900', fontSize: PRIMARY_ACTION_TEXT_SIZE, letterSpacing: 2, textTransform: 'uppercase' },
    currencyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
    currencyItemText: { fontSize: 18, fontWeight: '900' }
});
