import { AnimatedValueText } from '@/components/AnimatedValueText';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import dayjs from 'dayjs';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ExchangeMovementsTimelineProps = {
    accentColor: string;
    defaultBg: string;
    groupedTimeline: Record<string, any[]>;
    homeCurrency: string;
    isDark: boolean;
};

export function ExchangeMovementsTimeline({
    accentColor,
    defaultBg,
    groupedTimeline,
    homeCurrency,
    isDark,
}: ExchangeMovementsTimelineProps) {
    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {Object.keys(groupedTimeline).map(date => (
                <View key={date} className="px-1 mb-4">
                    <Text className="text-[10px] font-black uppercase opacity-60 mb-2 mt-1" style={{ color: accentColor }}>
                        {date}
                    </Text>
                    {groupedTimeline[date].map((entry: any) => {
                        const { lot, idx, balanceAfterHome, walletCurrency, homeAmount, entryKind, topUpIndex } = entry;
                        const originalAmount = lot.originalConvertedAmount ?? lot.convertedAmount ?? 0;
                        const isDefault = !!lot.isDefault;
                        const isInitial = entryKind === 'initial' || (idx === 0 && !entryKind);
                        const label = isInitial
                            ? 'Initial Deposit'
                            : (topUpIndex > 0 ? `Added Balance #${topUpIndex}` : 'Added Balance');
                        const showOriginal = walletCurrency && walletCurrency !== homeCurrency && originalAmount > 0;

                        return (
                            <View
                                key={`lot-${lot.id}`}
                                className="px-3 py-3 rounded-2xl mb-2"
                                style={{
                                    backgroundColor: isDefault ? defaultBg : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                    borderWidth: isDefault ? 1 : 0,
                                    borderColor: isDark ? 'rgba(178, 196, 170, 0.25)' : 'rgba(93, 109, 84, 0.2)',
                                }}
                            >
                                <View className="flex-row justify-between items-center mb-1">
                                    <View className="flex-row items-center gap-2">
                                        <Feather name="arrow-up" size={12} color={accentColor} />
                                        <Text className="text-[8px] font-black uppercase tracking-widest opacity-60" style={{ color: accentColor }}>
                                            {dayjs(lot.createdAt).format('HH:mm')}
                                        </Text>
                                    </View>
                                    <Text className="text-[9px] font-black uppercase opacity-50" style={{ color: accentColor }}>
                                        {label}
                                    </Text>
                                </View>
                                <View className="flex-row justify-between items-center">
                                    <View>
                                        <AnimatedValueText
                                            text={`+${MathUtils.formatCurrency(homeAmount, homeCurrency)}`}
                                            style={{ fontSize: 14, fontWeight: '900', color: isDark ? '#fff' : '#2D342B' }}
                                        />
                                        {showOriginal && (
                                            <AnimatedValueText
                                                text={MathUtils.formatCurrency(originalAmount, walletCurrency)}
                                                style={{ fontSize: 10, fontWeight: '600', color: accentColor, opacity: 0.6, marginTop: 1 }}
                                            />
                                        )}
                                    </View>
                                    <AnimatedValueText
                                        text={`Bal: ${MathUtils.formatCurrency(balanceAfterHome, homeCurrency)}`}
                                        style={{ fontSize: 12, fontWeight: '700', color: accentColor, opacity: 0.6 }}
                                    />
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}
        </ScrollView>
    );
}
