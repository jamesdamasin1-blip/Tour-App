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

    const [activeTab, setActiveTab] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const scrollRef = React.useRef<ScrollView>(null);

    // Trip Funds currency cycling
    const walletCurrencies = useMemo(() => {
        const wallets = trip?.wallets || [];
        const unique = [homeCurrency, ...wallets.map((w: any) => w.currency).filter((c: string) => c !== homeCurrency)];
        return unique;
    }, [trip, homeCurrency]);
    const [fundsCurrencyIdx, setFundsCurrencyIdx] = useState(0);
    const activeFundsCurrency = walletCurrencies[fundsCurrencyIdx] ?? homeCurrency;
    const activeFundsAmount = useMemo(() => {
        if (fundsCurrencyIdx === 0) return trip?.totalBudgetHomeCached || 0;
        const wallet = (trip?.wallets || []).find((w: any) => w.currency === activeFundsCurrency);
        return wallet ? wallet.totalBudget : 0;
    }, [fundsCurrencyIdx, activeFundsCurrency, trip]);

    // Flat ledger accumulator node layout triggers Node triggers
    const fullTimeline = useMemo(() => {
        const timeline: any[] = [];
        if (!trip) return timeline;

        // 1. Add ALL lots
        (trip.wallets || []).forEach(w => {
            const lots = (w as any).lots || [];
            lots.forEach((lot: any, idx: number) => {
                const matchedEvent = exchangeEvents.find((e: any) => e.walletId === w.id && e.date === lot.createdAt);
                timeline.push({ 
                    type: 'deposit', 
                    lot, 
                    matchedEvent, 
                    idx, 
                    walletCurrency: w.currency,
                    homeAmount: Number(lot.sourceAmount || 0),
                    timestamp: lot.createdAt
                });
            });
        });

        // 2. Add ALL expenses Node triggers
        tripExpenses.forEach(expense => {
            const activity = tripActivities.find(a => a.id === expense.activityId);
            const wallet = (trip.wallets || []).find((w: any) => w.id === expense.walletId);
            timeline.push({
                type: 'expense',
                expense,
                activity,
                walletCurrency: wallet?.currency || expense.currency,
                walletExchangeRate: wallet?.baselineExchangeRate || 0,
                homeAmount: -(expense.convertedAmountHome || 0),
                timestamp: expense.time
            });
        });

        // 3. Sort chronologically Node triggers Node triggers!
        timeline.sort((a, b) => a.timestamp - b.timestamp);

        // 4. Compute Running balances triggers thresholds Layout triggers!
        let runningBalanceHome = 0;
        return timeline.map(entry => {
            runningBalanceHome += entry.homeAmount;
            return {
                ...entry,
                balanceAfterHome: runningBalanceHome
            };
        });
    }, [trip, exchangeEvents, tripExpenses, tripActivities]);

    function groupByDate(logs: any[]) {
        return logs.reduce((acc: any, log: any) => {
            const date = dayjs(log.timestamp).isSame(dayjs(), 'day') 
                ? 'Today' 
                : dayjs(log.timestamp).isSame(dayjs().subtract(1, 'day'), 'day') 
                    ? 'Yesterday' 
                    : dayjs(log.timestamp).format('MMM D');
            if (!acc[date]) acc[date] = [];
            acc[date].push(log);
            return acc;
        }, {});
    }

    const movementsTimeline = useMemo(() => {
        const filtered = fullTimeline.filter(e => e.type === 'deposit');
        return groupByDate(filtered);
    }, [fullTimeline]);

    const spendingTimeline = useMemo(() => {
        const filtered = fullTimeline.filter(e => e.type === 'expense');
        return groupByDate(filtered);
    }, [fullTimeline]);

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
                            {/* Header Node triggers */}
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

                            {/* Tab Bar Indicator Node triggers */}
                            <View style={styles.tabBar}>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setActiveTab(0);
                                        scrollRef.current?.scrollTo({ x: 0, animated: true });
                                    }}
                                    style={[styles.tabButton, activeTab === 0 && { borderBottomColor: '#5D6D54', borderBottomWidth: 2 }]}
                                >
                                    <Text style={[styles.tabText, activeTab === 0 ? { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: '900' } : { color: accentColor }]}>Movements</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setActiveTab(1);
                                        scrollRef.current?.scrollTo({ x: containerWidth, animated: true });
                                    }}
                                    style={[styles.tabButton, activeTab === 1 && { borderBottomColor: isDark ? '#C4826B' : '#8B4A3C', borderBottomWidth: 2 }]}
                                >
                                    <Text style={[styles.tabText, activeTab === 1 ? { color: isDark ? '#C4826B' : '#8B4A3C', fontWeight: '900' } : { color: accentColor }]}>Spending</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Sticky Summary Node triggers */}
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => setFundsCurrencyIdx(i => (i + 1) % walletCurrencies.length)}
                                style={[styles.summaryHeader, {
                                    backgroundColor: isDark ? 'rgba(178, 196, 170, 0.18)' : 'rgba(93, 109, 84, 0.13)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(178, 196, 170, 0.25)' : 'rgba(93, 109, 84, 0.2)',
                                    overflow: 'hidden',
                                }]}
                            >
                                {/* Watermark wallet icon */}
                                <Feather
                                    name="credit-card"
                                    size={72}
                                    color={isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.08)'}
                                    style={{ position: 'absolute', right: -8, bottom: -12 }}
                                />
                                {/* Subtle chevron hint for tappable cycling */}
                                {walletCurrencies.length > 1 && (
                                    <Feather name="chevron-right" size={18} color={accentColor} style={{ position: 'absolute', right: 14, top: '50%', opacity: 0.3 }} />
                                )}
                                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 2, color: accentColor, opacity: 0.7, textTransform: 'uppercase' }}>Trip Funds</Text>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#fff' : '#2D342B', marginTop: 2 }}>
                                    {MathUtils.formatCurrency(activeFundsAmount, activeFundsCurrency)}
                                </Text>
                                <Text style={{ fontSize: 10, color: accentColor, opacity: 0.6, marginTop: 4, fontWeight: '600' }}>
                                    All the money you brought into this trip
                                </Text>
                            </TouchableOpacity>

                            <ScrollView 
                                ref={scrollRef}
                                horizontal 
                                pagingEnabled 
                                showsHorizontalScrollIndicator={false}
                                onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
                                onMomentumScrollEnd={(e) => {
                                    if (containerWidth <= 0) return;
                                    const tab = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
                                    setActiveTab(tab);
                                }}
                                style={{ flex: 1 }}
                            >
                                {/* Page 1: Movements Node triggers */}
                                <ScrollView style={{ width: containerWidth }} showsVerticalScrollIndicator={false}>
                                    {Object.keys(movementsTimeline).map(date => (
                                        <View key={date} className="px-1 mb-4">
                                            <Text className="text-[10px] font-black uppercase opacity-60 mb-2 mt-1" style={{ color: accentColor }}>{date}</Text>
                                            {movementsTimeline[date].map((entry: any) => {
                                                const { lot, idx, balanceAfterHome, walletCurrency, homeAmount } = entry;
                                                const originalAmount = lot.originalConvertedAmount ?? lot.convertedAmount ?? 0;
                                                const isDefault = !!lot.isDefault;
                                                const label = idx === 0 ? 'Initial Deposit' : `Deposit #${idx + 1}`;
                                                const showOriginal = walletCurrency && walletCurrency !== homeCurrency && originalAmount > 0;

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
                                                                <Feather name="arrow-up" size={12} color={accentColor} />
                                                                <Text className={`text-[8px] font-black uppercase tracking-widest opacity-60`} style={{ color: accentColor }}>
                                                                    {dayjs(lot.createdAt).format('HH:mm')}
                                                                </Text>
                                                            </View>
                                                            <Text className={`text-[9px] font-black uppercase opacity-50`} style={{ color: accentColor }}>
                                                                {label}
                                                            </Text>
                                                        </View>
                                                        <View className="flex-row justify-between items-center">
                                                            <View>
                                                                <Text className={`text-sm font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                                                    +{MathUtils.formatCurrency(homeAmount, homeCurrency)}
                                                                </Text>
                                                                {showOriginal && (
                                                                    <Text style={{ fontSize: 10, fontWeight: '600', color: accentColor, opacity: 0.6, marginTop: 1 }}>
                                                                        {MathUtils.formatCurrency(originalAmount, walletCurrency)}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor, opacity: 0.6 }}>
                                                                Bal: {MathUtils.formatCurrency(balanceAfterHome, homeCurrency)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </ScrollView>

                                {/* Page 2: Spending Node triggers */}
                                <ScrollView style={{ width: containerWidth }} showsVerticalScrollIndicator={false}>
                                    {Object.keys(spendingTimeline).map(date => (
                                        <View key={date} className="px-1 mb-4">
                                            <Text className="text-[10px] font-black uppercase opacity-60 mb-2 mt-1" style={{ color: accentColor }}>{date}</Text>
                                            {spendingTimeline[date].map((entry: any) => {
                                                const { expense, activity, balanceAfterHome, walletCurrency, walletExchangeRate } = entry;
                                                const isSpontaneous = activity?.isSpontaneous;
                                                const expenseLabel = isSpontaneous ? 'Spontaneous Activity' : (activity?.title || 'Expense');
                                                const homeAmount = expense.convertedAmountHome || expense.amount || 0;
                                                const showOriginal = expense.currency && expense.currency !== homeCurrency;
                                                const balanceInWallet = showOriginal && walletExchangeRate > 0
                                                    ? balanceAfterHome / walletExchangeRate
                                                    : null;

                                                return (
                                                    <View
                                                        key={`exp-${expense.id}`}
                                                        style={{
                                                            borderRadius: 20,
                                                            marginBottom: 10,
                                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)',
                                                            borderWidth: 1,
                                                            borderColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {/* Top row: icon + name/category + cost */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
                                                            {/* Icon */}
                                                            <View style={{
                                                                width: 36, height: 36, borderRadius: 18, marginRight: 12,
                                                                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                            }}>
                                                                <Feather
                                                                    name={isSpontaneous ? 'zap' : 'shopping-bag'}
                                                                    size={16}
                                                                    color={isDark ? '#f87171' : '#dc2626'}
                                                                />
                                                            </View>

                                                            {/* Left: name + type·category */}
                                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                                <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F2F0E8' : '#1f2937' }} numberOfLines={1}>
                                                                    {expense.name}
                                                                </Text>
                                                                <Text style={{ fontSize: 10, fontWeight: '600', color: accentColor, opacity: 0.7, marginTop: 2 }} numberOfLines={1}>
                                                                    {expenseLabel} · {expense.category}
                                                                </Text>
                                                            </View>

                                                            {/* Right: cost + original currency */}
                                                            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                                                <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#f87171' : '#dc2626' }}>
                                                                    −{MathUtils.formatCurrency(homeAmount, homeCurrency)}
                                                                </Text>
                                                                {showOriginal && (
                                                                    <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#f87171' : '#dc2626', opacity: 0.5, marginTop: 1 }}>
                                                                        {expense.amount} {expense.currency}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </View>

                                                        {/* Bottom: centered balance row */}
                                                        <View style={{
                                                            borderTopWidth: 1,
                                                            borderTopColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)',
                                                            paddingVertical: 7,
                                                            flexDirection: 'row',
                                                            justifyContent: 'center',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                        }}>
                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#aaa' : '#888' }}>
                                                                Bal: {MathUtils.formatCurrency(balanceAfterHome, homeCurrency)}
                                                            </Text>
                                                            {balanceInWallet !== null && (
                                                                <>
                                                                    <Text style={{ fontSize: 10, color: isDark ? '#555' : '#ccc' }}>·</Text>
                                                                    <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#888' : '#aaa' }}>
                                                                        ~{MathUtils.formatCurrency(balanceInWallet, walletCurrency)}
                                                                    </Text>
                                                                </>
                                                            )}
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </ScrollView>
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
    tabBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    tabButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    tabText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    summaryHeader: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 20,
        marginBottom: 16,
        alignItems: 'center',
    },
});
