import React, { useState, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    ScrollView
} from 'react-native';
import { GlassView } from '@/components/GlassView';
import { Feather } from '@expo/vector-icons';
import { useStore } from '@/src/store/useStore';
import { AddExchangeModal } from './AddExchangeModal';
import { BlurView } from 'expo-blur';
import { ExchangeEvent, Expense, Activity } from '@/src/types/models';
import { useTripWallet } from '../hooks/useTripWallet';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import dayjs from 'dayjs';

type TimelineEntry =
    | { type: 'deposit'; lot: any; matchedEvent?: ExchangeEvent; idx: number }
    | { type: 'expense'; expense: Expense; activity?: Activity };

interface ExchangeHistoryModalProps {
    tripId: string;
    visible: boolean;
    onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ExchangeHistoryModal = ({ tripId, visible, onClose }: ExchangeHistoryModalProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [editingEvent, setEditingEvent] = useState<ExchangeEvent | null>(null);

    const trip = useStore(state => state.trips.find(t => t.id === tripId));
    const allExchangeEvents = useStore(state => state.exchangeEvents);
    const allExpenses = useStore(state => state.expenses);
    const allActivities = useStore(state => state.activities);
    const { walletsStats, homeCurrency } = useTripWallet(tripId);

    const exchangeEvents = useMemo(
        () => (allExchangeEvents as ExchangeEvent[]).filter(e => (e as any).tripId === tripId),
        [allExchangeEvents, tripId]
    );

    const tripExpenses = useMemo(
        () => allExpenses.filter(e => e.tripId === tripId),
        [allExpenses, tripId]
    );

    const tripActivities = useMemo(
        () => allActivities.filter(a => a.tripId === tripId),
        [allActivities, tripId]
    );

    const accentColor = isDark ? '#B2C4AA' : '#5D6D54';
    const accentBg = isDark ? 'rgba(178, 196, 170, 0.12)' : 'rgba(93, 109, 84, 0.08)';
    const defaultBg = isDark ? 'rgba(178, 196, 170, 0.14)' : 'rgba(93, 109, 84, 0.09)';
    const cardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';

    return (
        <>
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
                <View style={styles.overlay}>
                    <BlurView
                        intensity={isDark ? 30 : 20}
                        style={StyleSheet.absoluteFill}
                        tint={isDark ? 'dark' : 'light'}
                    />
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

                    <View style={styles.container}>
                        <GlassView
                            intensity={isDark ? 80 : 100}
                            borderRadius={40}
                            style={styles.modalContent}
                            backgroundColor={isDark ? 'rgba(30, 34, 28, 0.95)' : 'rgba(255, 255, 255, 0.98)'}
                            borderColor={isDark ? 'rgba(158, 178, 148, 0.2)' : 'rgba(93, 109, 84, 0.15)'}
                        >
                            {/* Header */}
                            <View style={styles.header}>
                                <Text className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                    BUDGET LOGS
                                </Text>
                                <TouchableOpacity
                                    onPress={onClose}
                                    style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(0,0,0,0.05)' }]}
                                >
                                    <Feather name="x" size={20} color={accentColor} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                {walletsStats.map(w => {
                                    const wallet = trip?.wallets.find(wl => wl.id === w.walletId);
                                    const lots = [...((wallet as any)?.lots || [])].sort((a: any, b: any) => a.createdAt - b.createdAt);
                                    const walletEvents = exchangeEvents
                                        .filter((e: any) => e.walletId === w.walletId)
                                        .sort((a: any, b: any) => a.date - b.date);
                                    const walletExpenses = tripExpenses
                                        .filter(e => e.walletId === w.walletId);

                                    // Build unified timeline
                                    const timeline: TimelineEntry[] = [];
                                    lots.forEach((lot: any, idx: number) => {
                                        const matchedEvent: ExchangeEvent | undefined = idx > 0 ? walletEvents[idx - 1] : undefined;
                                        timeline.push({ type: 'deposit', lot, matchedEvent, idx });
                                    });
                                    walletExpenses.forEach(expense => {
                                        const activity = tripActivities.find(a => a.id === expense.activityId);
                                        timeline.push({ type: 'expense', expense, activity });
                                    });
                                    // Sort chronologically
                                    timeline.sort((a, b) => {
                                        const tA = a.type === 'deposit' ? a.lot.createdAt : a.expense.time;
                                        const tB = b.type === 'deposit' ? b.lot.createdAt : b.expense.time;
                                        return tA - tB;
                                    });

                                    const totalSpent = walletExpenses.reduce((sum, e) => sum + (e.convertedAmountTrip || 0), 0);

                                    return (
                                        <View key={w.walletId} className="mb-5">
                                            {/* Wallet Header */}
                                            <View
                                                className="flex-row justify-between items-center px-3 py-2 rounded-2xl mb-2"
                                                style={{ backgroundColor: accentBg }}
                                            >
                                                <Text className={`text-[9px] font-black uppercase tracking-widest`} style={{ color: accentColor }}>
                                                    {w.country} WALLET
                                                </Text>
                                                <Text className={`text-sm font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                                    {MathUtils.formatCurrency(w.balance, w.currency)}
                                                </Text>
                                            </View>

                                            {/* Unified timeline: deposits + expenses */}
                                            {timeline.map((entry) => {
                                                if (entry.type === 'deposit') {
                                                    const { lot, matchedEvent, idx } = entry;
                                                    const originalAmount = lot.originalConvertedAmount ?? lot.convertedAmount ?? 0;
                                                    const isDefault = !!lot.isDefault;
                                                    const timestamp = lot.createdAt;
                                                    const label = idx === 0 ? 'Initial Deposit' : `Deposit #${idx + 1}`;

                                                    return (
                                                        <View
                                                            key={`lot-${lot.id}`}
                                                            className="px-3 py-3 rounded-2xl mb-2"
                                                            style={{
                                                                backgroundColor: isDefault ? defaultBg : cardBg,
                                                                borderWidth: isDefault ? 1 : 0,
                                                                borderColor: isDark ? 'rgba(178, 196, 170, 0.25)' : 'rgba(93, 109, 84, 0.2)'
                                                            }}
                                                        >
                                                            <View className="flex-row justify-between items-center mb-1">
                                                                <View className="flex-row items-center gap-2">
                                                                    <Text className={`text-[8px] font-black uppercase tracking-widest opacity-60`} style={{ color: accentColor }}>
                                                                        {dayjs(timestamp).format('MMM D · HH:mm')}
                                                                    </Text>
                                                                    {isDefault && (
                                                                        <View className="px-1.5 py-0.5 rounded-md" style={{ backgroundColor: isDark ? 'rgba(178, 196, 170, 0.2)' : 'rgba(93, 109, 84, 0.15)' }}>
                                                                            <Text className={`text-[7px] font-black uppercase tracking-widest`} style={{ color: accentColor }}>✔ DEFAULT</Text>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                <View className="flex-row items-center gap-2">
                                                                    <Text className={`text-[9px] font-black uppercase opacity-50`} style={{ color: accentColor }}>
                                                                        {label}
                                                                    </Text>
                                                                    {matchedEvent && (
                                                                        <TouchableOpacity onPress={() => setEditingEvent(matchedEvent)} style={{ padding: 4 }}>
                                                                            <Feather name="edit-2" size={13} color={accentColor} />
                                                                        </TouchableOpacity>
                                                                    )}
                                                                </View>
                                                            </View>
                                                            <Text className={`text-sm font-black mb-1 ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                                                {MathUtils.formatCurrency(lot.sourceAmount, lot.sourceCurrency)}
                                                                <Text className={`text-xs font-medium opacity-50`} style={{ color: accentColor }}> → </Text>
                                                                +{MathUtils.formatCurrency(originalAmount, w.currency)}
                                                            </Text>
                                                            <View className="flex-row justify-between items-center pt-1.5 mt-1" style={{ borderTopWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
                                                                <Text className="opacity-50 text-[9px]" style={{ color: accentColor }}>
                                                                    1 {w.currency} = {lot.lockedRate?.toFixed(4)} {lot.sourceCurrency}
                                                                </Text>
                                                                <Text className={`text-[10px] font-bold ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                                                    {MathUtils.formatCurrency(lot.remainingAmount, w.currency)} left
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    );
                                                }

                                                // Expense entry
                                                const { expense, activity } = entry;
                                                const isSpontaneous = activity?.isSpontaneous;
                                                const expenseLabel = activity
                                                    ? (isSpontaneous ? 'Spontaneous' : activity.title)
                                                    : 'Expense';

                                                return (
                                                    <View
                                                        key={`exp-${expense.id}`}
                                                        className="px-3 py-2.5 rounded-2xl mb-2 flex-row items-center"
                                                        style={{
                                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)',
                                                            borderWidth: 1,
                                                            borderColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                                                        }}
                                                    >
                                                        <View style={{
                                                            width: 28, height: 28, borderRadius: 14, marginRight: 10,
                                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                                                            alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <Feather
                                                                name={isSpontaneous ? 'zap' : 'shopping-bag'}
                                                                size={12}
                                                                color={isDark ? '#f87171' : '#dc2626'}
                                                            />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <View className="flex-row justify-between items-center">
                                                                <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#f87171' : '#dc2626' }}>
                                                                    −{MathUtils.formatCurrency(expense.convertedAmountTrip || expense.amount, w.currency)}
                                                                </Text>
                                                                <Text className="text-[8px] font-black uppercase tracking-widest opacity-50" style={{ color: accentColor }}>
                                                                    {dayjs(expense.time).format('MMM D · HH:mm')}
                                                                </Text>
                                                            </View>
                                                            <View className="flex-row items-center mt-0.5">
                                                                <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#F2F0E8' : '#374151' }} numberOfLines={1}>
                                                                    {expense.name}
                                                                </Text>
                                                                <Text style={{ fontSize: 8, fontWeight: '600', color: accentColor, opacity: 0.6, marginLeft: 6 }}>
                                                                    {expenseLabel} · {expense.category}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            })}

                                            {/* Wallet footer */}
                                            <View className="flex-row justify-between px-1 mt-1">
                                                <Text className="text-[7px] font-medium opacity-40" style={{ color: accentColor }}>
                                                    Total Deposited: {MathUtils.formatCurrency(w.totalExchangedHome, homeCurrency)}
                                                </Text>
                                                {totalSpent > 0 && (
                                                    <Text className="text-[7px] font-medium opacity-40" style={{ color: isDark ? '#f87171' : '#dc2626' }}>
                                                        Total Spent: {MathUtils.formatCurrency(totalSpent, w.currency)}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        </GlassView>
                    </View>
                </View>
            </Modal>

            <AddExchangeModal
                tripId={tripId}
                visible={!!editingEvent}
                editingEvent={editingEvent}
                onClose={() => setEditingEvent(null)}
            />
        </>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    container: {
        width: '100%',
        maxWidth: 500,
        height: SCREEN_HEIGHT * 0.72,
    },
    modalContent: {
        flex: 1,
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
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
});
