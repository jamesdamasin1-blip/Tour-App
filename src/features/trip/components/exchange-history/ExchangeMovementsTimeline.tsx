import { AnimatedValueText } from '@/components/AnimatedValueText';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import dayjs from 'dayjs';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ExchangeMovementsTimelineProps = {
    activeFundsCurrency: string;
    activeFundsRateToHome: number;
    accentColor: string;
    defaultBg: string;
    groupedTimeline: Record<string, any[]>;
    homeCurrency: string;
    isDark: boolean;
};

export function ExchangeMovementsTimeline({
    activeFundsCurrency,
    activeFundsRateToHome,
    accentColor,
    defaultBg,
    groupedTimeline,
    homeCurrency,
    isDark,
}: ExchangeMovementsTimelineProps) {
    const isHomeView = activeFundsCurrency === homeCurrency;
    const amountColor = isDark ? '#C9DDBD' : '#78906D';
    const formatRateText = (rate: number | null | undefined, quoteCurrency: string | null | undefined) => {
        if (!rate || rate <= 0 || !quoteCurrency || quoteCurrency === homeCurrency) return null;
        return `${rate.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${homeCurrency} = 1 ${quoteCurrency}`;
    };

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {Object.keys(groupedTimeline).map(date => (
                <View key={date} className="px-1 mb-4">
                    <Text className="text-[10px] font-black uppercase opacity-60 mb-2 mt-1" style={{ color: accentColor }}>
                        {date}
                    </Text>
                    {groupedTimeline[date].map((entry: any) => {
                        const {
                            lot,
                            idx,
                            displayAmount,
                            displayBalanceAfter,
                            displayBalanceBefore,
                            displayCurrency,
                            displayRate,
                            displayRateQuoteCurrency,
                            equivalentAmount,
                            equivalentCurrency,
                            entryKind,
                            topUpIndex,
                        } = entry;
                        const isDefault = !!lot.isDefault;
                        const isInitial = entryKind === 'initial' || (idx === 0 && !entryKind);
                        const isTopUp = !isInitial;
                        const label = isInitial
                            ? 'Initial Deposit'
                            : (topUpIndex > 0 ? `Added Balance #${topUpIndex}` : 'Added Balance');
                        const showEquivalent = equivalentCurrency && equivalentAmount > 0;
                        const equivalentLabel = showEquivalent
                            ? MathUtils.formatCurrency(equivalentAmount, equivalentCurrency)
                            : null;
                        const rateLabel = isHomeView
                            ? formatRateText(displayRate, displayRateQuoteCurrency)
                            : formatRateText(activeFundsRateToHome, activeFundsCurrency);
                        const previousBalanceLabel = isTopUp
                            ? MathUtils.formatCurrency(displayBalanceBefore || 0, displayCurrency)
                            : null;
                        const currentBalanceLabel = isTopUp
                            ? MathUtils.formatCurrency(displayBalanceAfter || 0, displayCurrency)
                            : null;

                        return (
                            <View
                                key={`lot-${lot.id}`}
                                className="px-3 py-3 rounded-2xl mb-2"
                                style={{
                                    backgroundColor: isDefault ? defaultBg : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                    borderWidth: isDefault ? 1 : 0,
                                    borderColor: isDark ? 'rgba(178, 196, 170, 0.25)' : 'rgba(93, 109, 84, 0.2)',
                                    minHeight: 92,
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <View style={{ minWidth: 110, maxWidth: 136, paddingRight: 10 }}>
                                        <AnimatedValueText
                                            text={`+${MathUtils.formatCurrency(displayAmount, displayCurrency)}`}
                                            style={{ fontSize: 14, lineHeight: 18, fontWeight: '900', color: amountColor }}
                                        />
                                    </View>
                                    <View
                                        style={{
                                            width: 1,
                                            alignSelf: 'stretch',
                                            marginRight: 10,
                                            backgroundColor: isDark ? 'rgba(178, 196, 170, 0.16)' : 'rgba(93, 109, 84, 0.18)',
                                        }}
                                    />
                                    <View style={{ flex: 1, minHeight: 42, justifyContent: 'center', paddingRight: 8 }}>
                                        <AnimatedValueText
                                            text={equivalentLabel || ' '}
                                            style={{ fontSize: 12, fontWeight: '800', color: accentColor, opacity: showEquivalent ? 0.78 : 0 }}
                                        />
                                        <Text
                                            style={{
                                                fontSize: 10,
                                                fontWeight: '700',
                                                color: accentColor,
                                                opacity: rateLabel ? 0.55 : 0,
                                                marginTop: 2,
                                                minHeight: 14,
                                            }}
                                        >
                                            {rateLabel || ' '}
                                        </Text>
                                    </View>
                                    <View style={{ width: 92, alignItems: 'flex-end', justifyContent: 'center', minHeight: 42 }}>
                                        {previousBalanceLabel ? (
                                            <AnimatedValueText
                                                text={previousBalanceLabel}
                                                style={{ fontSize: 10, fontWeight: '700', color: accentColor, opacity: 0.52 }}
                                            />
                                        ) : <Text style={{ minHeight: 12, opacity: 0 }}> </Text>}
                                        {currentBalanceLabel ? (
                                            <AnimatedValueText
                                                text={currentBalanceLabel}
                                                style={{ fontSize: 12, fontWeight: '800', color: accentColor, opacity: 0.72, marginTop: 2 }}
                                            />
                                        ) : <Text style={{ minHeight: 16, opacity: 0 }}> </Text>}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}
        </ScrollView>
    );
}
