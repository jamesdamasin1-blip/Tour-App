import { AnimatedValueText } from '@/components/AnimatedValueText';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

type ExchangeFundsSummaryCardProps = {
    accentColor: string;
    activeFundsAmount: number;
    activeFundsCurrency: string;
    isDark: boolean;
    walletCurrencyCount: number;
    onPress: () => void;
};

export function ExchangeFundsSummaryCard({
    accentColor,
    activeFundsAmount,
    activeFundsCurrency,
    isDark,
    walletCurrencyCount,
    onPress,
}: ExchangeFundsSummaryCardProps) {
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 20,
                marginBottom: 16,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 116,
                backgroundColor: isDark ? 'rgba(178, 196, 170, 0.18)' : 'rgba(93, 109, 84, 0.13)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(178, 196, 170, 0.25)' : 'rgba(93, 109, 84, 0.2)',
                overflow: 'hidden',
            }}
        >
            <Feather
                name="credit-card"
                size={72}
                color={isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.08)'}
                style={{ position: 'absolute', right: -8, bottom: -12 }}
            />
            {walletCurrencyCount > 1 && (
                <Feather name="chevron-right" size={18} color={accentColor} style={{ position: 'absolute', right: 14, top: '50%', opacity: 0.3 }} />
            )}
            <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 2, color: accentColor, opacity: 0.7, textTransform: 'uppercase' }}>
                Trip Funds
            </Text>
            <AnimatedValueText
                text={MathUtils.formatCurrency(activeFundsAmount, activeFundsCurrency)}
                style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#fff' : '#2D342B', marginTop: 2 }}
            />
            <Text style={{ fontSize: 10, color: accentColor, opacity: 0.6, marginTop: 4, fontWeight: '600' }}>
                All the money you brought into this trip
            </Text>
            {walletCurrencyCount > 1 ? (
                <Text
                    style={{
                        fontSize: 10,
                        color: accentColor,
                        opacity: 0.55,
                        marginTop: 2,
                        fontWeight: '600',
                    }}
                >
                    Tap to cycle currencies
                </Text>
            ) : null}
        </TouchableOpacity>
    );
}
