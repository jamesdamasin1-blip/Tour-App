import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { GlassView } from '@/components/GlassView';
import { Feather } from '@expo/vector-icons';
import { useExchangeEvents } from '../hooks/useExchangeEvents';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { useStore } from '@/src/store/useStore';
import { ExchangeEvent } from '@/src/types/models';
import { getDefaultLot } from '../../../finance/wallet/walletEngine';
import dayjs from 'dayjs';

interface ExchangeEventListProps {
    tripId: string;
    onEdit: (event: ExchangeEvent) => void;
}

export const ExchangeEventList = ({ tripId, onEdit }: ExchangeEventListProps) => {
    const { exchangeEvents } = useExchangeEvents(tripId);
    const trip = useStore(state => state.trips.find(t => t.id === tripId));
    const { theme } = useStore();
    const isDark = theme === 'dark';

    const renderEvent = (event: ExchangeEvent) => {
        const wallet = trip?.wallets.find(w => w.id === event.walletId);
        const tripCurrency = wallet?.currency || 'USD';
        const homeCurrency = trip?.homeCurrency || 'USD';
        const defaultLot = wallet ? getDefaultLot(wallet as any) : undefined;
        // Match rate with default lot locked rate lookup
        const isDefault = defaultLot && Math.abs(defaultLot.lockedRate - event.rate) < 0.001;

        return (
            <View key={event.id} className="mb-3">
                <GlassView
                    intensity={isDark ? 30 : 60}
                    borderRadius={24}
                    borderColor={isDefault
                        ? (isDark ? 'rgba(178, 196, 170, 0.35)' : 'rgba(93, 109, 84, 0.35)')
                        : (isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(0, 0, 0, 0.05)')}
                    backgroundColor={isDefault
                        ? (isDark ? 'rgba(93, 109, 84, 0.2)' : 'rgba(93, 109, 84, 0.08)')
                        : (isDark ? 'rgba(40, 44, 38, 0.5)' : 'rgba(255, 255, 255, 0.4)')}
                    style={styles.item}
                >
                    <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1 mr-2">
                            <Text className={`text-[9px] font-black uppercase opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                                {dayjs(event.date).format('MMM D, YYYY · HH:mm')}
                            </Text>
                            <Text className={`font-bold text-base ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                +{MathUtils.formatCurrency(event.tripAmount, tripCurrency)}
                                <Text className="text-[10px] ml-1 opacity-60 font-medium"> TRIP wallet</Text>
                            </Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                            {isDefault && (
                                <View className="px-2 py-1 rounded-lg" style={{ backgroundColor: isDark ? 'rgba(178, 196, 170, 0.2)' : 'rgba(93, 109, 84, 0.12)' }}>
                                    <Text className={`text-[8px] font-black uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>✔ DEFAULT</Text>
                                </View>
                            )}
                            <TouchableOpacity onPress={() => onEdit(event)} style={{ padding: 4 }}>
                                <Feather name="edit-2" size={14} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="flex-row justify-between items-end border-t pt-2 mt-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                        <View>
                            <Text className={`text-[8px] font-black uppercase opacity-40 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Source Amount</Text>
                            <Text className={`text-[11px] font-semibold ${isDark ? 'text-white' : 'text-gray-600'}`}>
                                {MathUtils.formatCurrency(event.homeAmount, homeCurrency)} HOME
                            </Text>
                        </View>
                        <View className="items-end">
                            <Text className={`text-[8px] font-black uppercase opacity-40 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Rate</Text>
                            <Text className={`text-[11px] font-semibold ${isDark ? 'text-white' : 'text-gray-600'}`}>
                                1 {tripCurrency} = {event.rate.toFixed(4)} {homeCurrency}
                            </Text>
                        </View>
                    </View>

                    {event.notes ? (
                        <View className="mt-2 pt-2 border-t" style={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                            <Text className={`text-[9px] italic ${isDark ? 'text-[#B2C4AA]' : 'text-gray-500'}`}>
                                "{event.notes}"
                            </Text>
                        </View>
                    ) : null}
                </GlassView>
            </View>
        );
    };

    return (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {exchangeEvents.length === 0 ? (
                <View className="items-center justify-center py-12 px-6">
                    <View className="mb-4 opacity-20">
                        <Feather name="refresh-ccw" size={48} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                    </View>
                    <Text className={`text-center font-bold ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'} opacity-40`}>
                        No budget events recorded yet.
                    </Text>
                </View>
            ) : (
                exchangeEvents.sort((a, b) => b.date - a.date).map(renderEvent)
            )}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    item: {
        padding: 12,
    }
});
