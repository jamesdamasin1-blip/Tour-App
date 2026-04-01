import React from 'react';
import { Text, View } from 'react-native';

type SpontaneousTripEquivalentProps = {
    isDark: boolean;
    tripCurrency: string;
    tripAmount: number;
};

export const SpontaneousTripEquivalent = ({
    isDark,
    tripCurrency,
    tripAmount,
}: SpontaneousTripEquivalentProps) => (
    <View style={{ marginBottom: 24 }}>
        <View
            style={{
                padding: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderStyle: 'dashed',
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(93, 109, 84, 0.05)',
                borderColor: isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)',
            }}
        >
            <Text
                style={{
                    fontSize: 9,
                    fontWeight: '900',
                    letterSpacing: 1,
                    marginBottom: 4,
                    color: isDark ? '#B2C4AA' : '#5D6D54',
                }}
            >
                TRIP CURRENCY EQUIVALENT
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                    style={{
                        fontSize: 16,
                        fontWeight: '900',
                        color: isDark ? '#B2C4AA' : '#5D6D54',
                    }}
                >
                    {tripCurrency}
                </Text>
                <Text
                    style={{
                        fontSize: 24,
                        fontWeight: '900',
                        color: isDark ? '#F2F0E8' : '#1a1a1a',
                        marginLeft: 8,
                    }}
                >
                    {tripAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </Text>
            </View>
        </View>
    </View>
);
