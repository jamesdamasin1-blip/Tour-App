import React, { useState, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator
} from 'react-native';
import { GlassView } from '@/components/GlassView';
import { Feather } from '@expo/vector-icons';
import { useExchangeEvents } from '../hooks/useExchangeEvents';
import { useTripWallet } from '../hooks/useTripWallet';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { useStore } from '@/src/store/useStore';
import { AnimatedModal } from '@/components/AnimatedModal';
import { RippleButton } from '@/components/RippleButton';
import { CurrencyConversionService } from '@/src/services/currencyConversion';
import { syncTrace } from '@/src/sync/debug';
import { ExchangeEvent } from '@/src/types/models';
import {
    PRIMARY_ACTION_HEIGHT,
    PRIMARY_ACTION_RADIUS,
    PRIMARY_ACTION_TEXT_SIZE,
} from '@/src/styles/primaryAction';
import {
    BUDGET_MODAL_HEIGHT,
    BUDGET_MODAL_MAX_WIDTH,
    BUDGET_MODAL_PADDING,
    BUDGET_MODAL_RADIUS,
} from './budgetModalLayout';

interface AddExchangeModalProps {
    tripId: string;
    visible: boolean;
    onClose: () => void;
    editingEvent?: ExchangeEvent | null;
}

export const AddExchangeModal = ({ tripId, visible, onClose, editingEvent }: AddExchangeModalProps) => {
    const { addExchangeEvent, updateExchangeEvent } = useExchangeEvents(tripId);
    const { homeCurrency, walletsStats } = useTripWallet(tripId);
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const isEditing = !!editingEvent;

    const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
    const [homeAmount, setHomeAmount] = useState('');
    const [tripAmount, setTripAmount] = useState('');
    const [rate, setRate] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Initialize form from editing event or default wallet — ref guard
    // prevents re-initializing when external state changes during editing.
    const editInitRef = useRef<string | null>(null);
    const editKey = editingEvent?.id ?? 'new';
    if (visible && editInitRef.current !== editKey) {
        editInitRef.current = editKey;
        if (editingEvent) {
            setSelectedWalletId(editingEvent.walletId);
            setHomeAmount(MathUtils.formatCurrencyInput(editingEvent.homeAmount.toString()));
            setTripAmount(MathUtils.formatCurrencyInput(editingEvent.tripAmount.toString()));
            setRate(editingEvent.rate.toFixed(4));
            setNotes(editingEvent.notes || '');
        } else if (walletsStats.length > 0 && !selectedWalletId) {
            setSelectedWalletId(walletsStats[0].walletId);
        }
    }
    // Reset ref when modal closes so it re-initializes on next open
    if (!visible && editInitRef.current !== null) {
        editInitRef.current = null;
    }

    const activeWallet = useMemo(() => 
        walletsStats.find(w => w.walletId === selectedWalletId) || walletsStats[0],
    [walletsStats, selectedWalletId]);


    const tripCurrency = activeWallet?.currency || '';


    const parsedHome = parseFloat(homeAmount.replace(/,/g, '')) || 0;
    const parsedTrip = parseFloat(tripAmount.replace(/,/g, '')) || 0;
    const hasValidAmounts = parsedHome > 0 && parsedTrip > 0;

    // Derive rate from amounts — pure computation, no effect needed.
    // Falls back to manually-set rate when amounts aren't both valid.
    const displayRate = useMemo(() => {
        if (parsedHome > 0 && parsedTrip > 0) {
            return (parsedHome / parsedTrip).toFixed(4);
        }
        return rate;
    }, [parsedHome, parsedTrip, rate]);

    const parsedRate = parseFloat(displayRate) || 0;

    const handleSave = async () => {
        if (isSaving) return;
        const h = parsedHome;
        const t = parsedTrip;
        const r = parsedRate > 0 ? parsedRate : CurrencyConversionService.calculateRate(h, t);

        syncTrace('BudgetModal', 'submit_pressed', {
            tripId,
            editingEventId: editingEvent?.id ?? null,
            selectedWalletId,
            parsedHome: h,
            parsedTrip: t,
            parsedRate: r,
            notes,
        });

        if (!selectedWalletId) { alert('Please select a wallet'); return; }
        if (h <= 0 || t <= 0) { alert('Please enter valid amounts'); return; }

        try {
            setIsSaving(true);
            if (isEditing && editingEvent) {
                await updateExchangeEvent(editingEvent.id, {
                    walletId: selectedWalletId,
                    homeAmount: h,
                    tripAmount: t,
                    rate: r,
                    notes: notes.trim()
                });
            } else {
                await addExchangeEvent({
                    walletId: selectedWalletId,
                    homeAmount: h,
                    tripAmount: t,
                    rate: r,
                    date: Date.now(),
                    sourceCurrency: homeCurrency,
                    targetCurrency: tripCurrency,
                    entryKind: 'top_up',
                    notes: notes.trim(),
                    version: 1,
                });
            }

            syncTrace('BudgetModal', 'submit_completed', {
                tripId,
                editingEventId: editingEvent?.id ?? null,
                selectedWalletId,
                parsedHome: h,
                parsedTrip: t,
            });
            setHomeAmount('');
            setTripAmount('');
            setNotes('');
            onClose();
        } catch (error: any) {
            syncTrace('BudgetModal', 'submit_failed', {
                tripId,
                editingEventId: editingEvent?.id ?? null,
                message: error?.message,
            });
            alert(error?.message || 'Unable to save budget update.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        setHomeAmount('');
        setTripAmount('');
        setNotes('');
        onClose();
    };

    return (
        <AnimatedModal visible={visible} onClose={handleClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 18}
            >
                <GlassView
                    intensity={isDark ? 80 : 100}
                    borderRadius={BUDGET_MODAL_RADIUS}
                    style={styles.modalContent}
                    backgroundColor={isDark ? 'rgba(30, 34, 28, 0.95)' : 'rgba(255, 255, 255, 0.98)'}
                    borderColor={isDark ? 'rgba(158, 178, 148, 0.2)' : 'rgba(93, 109, 84, 0.15)'}
                >
                    <View style={styles.header}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#fff' : '#2D342B' }}>
                            {isEditing ? 'EDIT BUDGET' : 'ADD BUDGET'}
                        </Text>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(0,0,0,0.05)' }]}
                        >
                            <Feather name="x" size={18} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    >
                        {walletsStats.length > 1 && (
                            <View className="mb-4">
                                <Text className={`text-[9px] font-black uppercase tracking-[1.5px] mb-2 ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]'} opacity-60`}>
                                    Select Destination Wallet
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                                    {walletsStats.map(w => (
                                        <TouchableOpacity
                                            key={w.walletId}
                                            onPress={() => setSelectedWalletId(w.walletId)}
                                            className={`mr-2 px-4 py-2 rounded-xl border ${selectedWalletId === w.walletId
                                                ? 'bg-[#5D6D54] border-[#5D6D54]'
                                                : (isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50')}`}
                                        >
                                            <Text className={`font-black text-[10px] uppercase tracking-[0.5px] ${selectedWalletId === w.walletId ? 'text-white' : (isDark ? 'text-[#B2C4AA]' : 'text-gray-500')}`}>
                                                {w.country} ({w.currency})
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <View className="mb-4">
                            <Text className={`text-[9px] font-black uppercase tracking-[1.5px] mb-2 ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]'} opacity-60`}>
                                Budget from Home Wallet ({homeCurrency})
                            </Text>
                            <View className="flex-row items-center border rounded-xl px-4 py-2" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(0,0,0,0.08)' }}>
                                <TextInput
                                    keyboardType="numeric"
                                    placeholder="0.00"
                                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.2)" : "#9ca3af"}
                                    value={homeAmount}
                                    onChangeText={(v) => setHomeAmount(MathUtils.formatCurrencyInput(v))}
                                    className={`flex-1 text-lg font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}
                                />
                                <Text className={`font-black text-base ml-3 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>{homeCurrency}</Text>
                            </View>
                        </View>

                        <View className="flex-row justify-center items-center my-1 opacity-30">
                            <View style={{ flex: 1, height: 1, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }} />
                            <Feather name="refresh-cw" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} style={{ marginHorizontal: 12 }} />
                            <View style={{ flex: 1, height: 1, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }} />
                        </View>

                        <View className="mb-4 mt-1">
                            <Text className={`text-[9px] font-black uppercase tracking-[1.5px] mb-2 ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]'} opacity-60`}>
                                Added Trip Budget ({tripCurrency})
                            </Text>
                            <View className="flex-row items-center border rounded-xl px-4 py-2" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(0,0,0,0.08)' }}>
                                <TextInput
                                    keyboardType="numeric"
                                    placeholder="0.00"
                                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.2)" : "#9ca3af"}
                                    value={tripAmount}
                                    onChangeText={(v) => setTripAmount(MathUtils.formatCurrencyInput(v))}
                                    className={`flex-1 text-lg font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}
                                />
                                <Text className={`font-black text-base ml-3 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>{tripCurrency}</Text>
                            </View>
                        </View>

                        {hasValidAmounts && (
                            <View className="mb-4">
                                <View
                                    className="mb-2 p-3 rounded-2xl border flex-row items-center"
                                    style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(93, 109, 84, 0.05)', borderColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.15)', borderStyle: 'dashed' }}
                                >
                                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(93, 109, 84, 0.1)' }}>
                                        <Feather name="trending-up" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className={`text-[8px] font-black uppercase opacity-60 tracking-[1px] ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Calculated Conversion Rate</Text>
                                        <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>1 {tripCurrency} = {displayRate} {homeCurrency}</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        <View className="mb-4">
                            <Text className={`text-[9px] font-black uppercase tracking-[1.5px] mb-2 ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]'} opacity-60`}>
                                Notes (Optional)
                            </Text>
                            <TextInput
                                placeholder="e.g. Airport Exchange"
                                placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.2)" : "#9ca3af"}
                                value={notes}
                                onChangeText={setNotes}
                                className={`border rounded-xl px-4 py-3 font-bold text-sm ${isDark ? 'text-white border-white/10 bg-white/5' : 'text-[#2D342B] border-gray-200 bg-gray-50'}`}
                            />
                        </View>

                        <RippleButton
                            onPress={handleSave}
                            disabled={isSaving}
                            glowColor="rgba(93, 109, 84, 0.4)"
                            style={{
                                backgroundColor: '#5D6D54',
                                height: PRIMARY_ACTION_HEIGHT,
                                borderRadius: PRIMARY_ACTION_RADIUS,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 16,
                                opacity: isSaving ? 0.7 : 1,
                            }}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: PRIMARY_ACTION_TEXT_SIZE, letterSpacing: 2, textTransform: 'uppercase' }}>
                                    {isEditing ? 'SAVE CHANGES' : 'ADD BUDGET'}
                                </Text>
                            )}
                        </RippleButton>
                    </ScrollView>
                </GlassView>
            </KeyboardAvoidingView>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        maxWidth: BUDGET_MODAL_MAX_WIDTH,
        alignSelf: 'center',
    },
    modalContent: {
        width: '100%',
        maxHeight: BUDGET_MODAL_HEIGHT,
        padding: BUDGET_MODAL_PADDING,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        position: 'relative',
        width: '100%',
    },
    closeButton: {
        position: 'absolute',
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        paddingBottom: 0,
    }
});
