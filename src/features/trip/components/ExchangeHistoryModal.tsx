import { AnimatedModal } from '@/components/AnimatedModal';
import { GlassView } from '@/components/GlassView';
import { useStore } from '@/src/store/useStore';
import { ExchangeEvent } from '@/src/types/models';
import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AddExchangeModal } from './AddExchangeModal';
import {
    BUDGET_MODAL_HEIGHT,
    BUDGET_MODAL_MAX_WIDTH,
    BUDGET_MODAL_PADDING,
    BUDGET_MODAL_RADIUS,
} from './budgetModalLayout';
import { ExchangeFundsSummaryCard } from './exchange-history/ExchangeFundsSummaryCard';
import { ExchangeMovementsTimeline } from './exchange-history/ExchangeMovementsTimeline';
import { ExchangeSpendingTimeline } from './exchange-history/ExchangeSpendingTimeline';
import { useExchangeHistoryData } from './exchange-history/useExchangeHistoryData';

interface ExchangeHistoryModalProps {
    tripId: string;
    visible: boolean;
    onClose: () => void;
}

export const ExchangeHistoryModal = ({ tripId, visible, onClose }: ExchangeHistoryModalProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [editingEvent, setEditingEvent] = useState<ExchangeEvent | null>(null);
    const [activeTab, setActiveTab] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [fundsCurrencyIdx, setFundsCurrencyIdx] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    const { homeCurrency, activeFundsAmount, activeFundsCurrency, movementsTimeline, spendingTimeline, walletCurrencies } =
        useExchangeHistoryData(tripId, fundsCurrencyIdx);

    const accentColor = isDark ? '#B2C4AA' : '#5D6D54';
    const defaultBg = isDark ? 'rgba(178, 196, 170, 0.14)' : 'rgba(93, 109, 84, 0.09)';
    const spendingAccent = isDark ? '#C4826B' : '#8B4A3C';

    return (
        <>
            <AnimatedModal visible={visible} onClose={onClose}>
                <View style={styles.container}>
                    <GlassView
                        intensity={isDark ? 80 : 100}
                        borderRadius={BUDGET_MODAL_RADIUS}
                        style={styles.modalContent}
                        backgroundColor={isDark ? 'rgba(30, 34, 28, 0.95)' : 'rgba(255, 255, 255, 0.98)'}
                        borderColor={isDark ? 'rgba(158, 178, 148, 0.2)' : 'rgba(93, 109, 84, 0.15)'}
                    >
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

                        <View style={styles.tabBar}>
                            <TouchableOpacity
                                onPress={() => {
                                    setActiveTab(0);
                                    scrollRef.current?.scrollTo({ x: 0, animated: true });
                                }}
                                style={[styles.tabButton, activeTab === 0 && { borderBottomColor: '#5D6D54', borderBottomWidth: 2 }]}
                            >
                                <Text style={[styles.tabText, activeTab === 0 ? { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: '900' } : { color: accentColor }]}>
                                    Movements
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setActiveTab(1);
                                    scrollRef.current?.scrollTo({ x: containerWidth, animated: true });
                                }}
                                style={[styles.tabButton, activeTab === 1 && { borderBottomColor: spendingAccent, borderBottomWidth: 2 }]}
                            >
                                <Text style={[styles.tabText, activeTab === 1 ? { color: spendingAccent, fontWeight: '900' } : { color: accentColor }]}>
                                    Spending
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <ExchangeFundsSummaryCard
                            accentColor={accentColor}
                            activeFundsAmount={activeFundsAmount}
                            activeFundsCurrency={activeFundsCurrency}
                            isDark={isDark}
                            walletCurrencyCount={walletCurrencies.length}
                            onPress={() => setFundsCurrencyIdx(index => (index + 1) % walletCurrencies.length)}
                        />

                        <ScrollView
                            ref={scrollRef}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
                            onMomentumScrollEnd={event => {
                                if (containerWidth <= 0) return;
                                setActiveTab(Math.round(event.nativeEvent.contentOffset.x / containerWidth));
                            }}
                            style={{ flex: 1 }}
                        >
                            <View style={{ width: containerWidth }}>
                                <ExchangeMovementsTimeline
                                    accentColor={accentColor}
                                    defaultBg={defaultBg}
                                    groupedTimeline={movementsTimeline}
                                    homeCurrency={homeCurrency}
                                    isDark={isDark}
                                />
                            </View>

                            <View style={{ width: containerWidth }}>
                                <ExchangeSpendingTimeline
                                    accentColor={accentColor}
                                    groupedTimeline={spendingTimeline}
                                    homeCurrency={homeCurrency}
                                    isDark={isDark}
                                />
                            </View>
                        </ScrollView>
                    </GlassView>
                </View>
            </AnimatedModal>

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
    container: {
        width: '100%',
        maxWidth: BUDGET_MODAL_MAX_WIDTH,
        height: BUDGET_MODAL_HEIGHT,
        alignSelf: 'center',
    },
    modalContent: {
        flex: 1,
        padding: BUDGET_MODAL_PADDING,
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
});
