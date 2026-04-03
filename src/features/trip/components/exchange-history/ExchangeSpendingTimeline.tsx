import { AnimatedValueText } from '@/components/AnimatedValueText';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ExchangeSpendingTimelineProps = {
    accentColor: string;
    groupedTimeline: Record<string, any[]>;
    isDark: boolean;
};

export function ExchangeSpendingTimeline({
    accentColor,
    groupedTimeline,
    isDark,
}: ExchangeSpendingTimelineProps) {
    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {Object.keys(groupedTimeline).map(date => (
                <View key={date} className="px-1 mb-4">
                    <Text className="text-[10px] font-black uppercase opacity-60 mb-2 mt-1" style={{ color: accentColor }}>
                        {date}
                    </Text>
                    {groupedTimeline[date].map((entry: any) => {
                        const {
                            expense,
                            activity,
                            displayAmount,
                            displayBalanceAfter,
                            displayCurrency,
                            equivalentAmount,
                            equivalentCurrency,
                        } = entry;
                        const isSpontaneous = activity?.isSpontaneous;
                        const expenseLabel = isSpontaneous ? 'Spontaneous Activity' : (activity?.title || 'Expense');
                        const showEquivalent = equivalentCurrency && equivalentAmount > 0;
                        const equivalentText = showEquivalent
                            ? MathUtils.formatCurrency(equivalentAmount, equivalentCurrency)
                            : null;
                        const balanceText = displayBalanceAfter == null
                            ? null
                            : MathUtils.formatCurrency(displayBalanceAfter, displayCurrency);

                        return (
                            <View
                                key={`exp-${expense.id}`}
                                style={{
                                    borderRadius: 20,
                                    marginBottom: 10,
                                    minHeight: 94,
                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                    overflow: 'hidden',
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
                                    <View
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 18,
                                            marginRight: 12,
                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Feather name={isSpontaneous ? 'zap' : 'shopping-bag'} size={16} color={isDark ? '#f87171' : '#dc2626'} />
                                    </View>

                                    <View style={{ flex: 1, marginRight: 10 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F2F0E8' : '#1f2937' }} numberOfLines={1}>
                                            {expense.name}
                                        </Text>
                                        <Text style={{ fontSize: 10, fontWeight: '600', color: accentColor, opacity: 0.7, marginTop: 2 }} numberOfLines={1}>
                                            {expenseLabel} · {expense.category}
                                        </Text>
                                    </View>

                                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                        <AnimatedValueText
                                            text={`-${MathUtils.formatCurrency(displayAmount, displayCurrency)}`}
                                            style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#f87171' : '#dc2626' }}
                                        />
                                        {showEquivalent && equivalentText && (
                                            <AnimatedValueText
                                                text={equivalentText}
                                                style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#f87171' : '#dc2626', opacity: 0.5, marginTop: 1 }}
                                            />
                                        )}
                                    </View>
                                </View>

                                <View
                                    style={{
                                        borderTopWidth: 1,
                                        borderTopColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)',
                                        paddingVertical: 7,
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    {balanceText && (
                                        <AnimatedValueText
                                            text={balanceText}
                                            style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#aaa' : '#888' }}
                                        />
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}
        </ScrollView>
    );
}
