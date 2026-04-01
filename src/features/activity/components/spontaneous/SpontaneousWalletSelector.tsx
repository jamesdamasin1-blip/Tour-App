import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';

type WalletSummary = {
    walletId: string;
    country: string;
    currency: string;
};

type SpontaneousWalletSelectorProps = {
    isDark: boolean;
    activeWallet?: WalletSummary;
    onPress: () => void;
};

export const SpontaneousWalletSelector = ({
    isDark,
    activeWallet,
    onPress,
}: SpontaneousWalletSelectorProps) => (
    <View style={{ marginBottom: 24 }}>
        <Text
            style={{
                fontSize: 10,
                fontWeight: '900',
                color: isDark ? '#B2C4AA' : '#9ca3af',
                opacity: isDark ? 0.6 : 1,
                marginBottom: 12,
                letterSpacing: 1,
            }}
        >
            SELECT COUNTRY WALLET
        </Text>
        <TouchableOpacity
            style={[
                {
                    height: 56,
                    borderRadius: 16,
                    paddingHorizontal: 20,
                    borderWidth: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(93, 109, 84, 0.05)',
                    borderColor: 'rgba(0,0,0,0.05)',
                },
                isDark && {
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    borderColor: 'rgba(158,178,148,0.3)',
                },
            ]}
            onPress={onPress}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                    style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: isDark ? '#F2F0E8' : '#111827',
                    }}
                >
                    {activeWallet?.country}
                </Text>
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: isDark ? '#9EB294' : '#64748b',
                        marginLeft: 8,
                    }}
                >
                    ({activeWallet?.currency})
                </Text>
            </View>
            <Feather name="chevron-down" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
        </TouchableOpacity>
    </View>
);
