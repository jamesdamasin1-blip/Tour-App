import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GlassView } from '@/components/GlassView';
import { Feather } from '@expo/vector-icons';
import { useTripWallet } from '../hooks/useTripWallet';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { useStore } from '@/src/store/useStore';

interface TripWalletCardProps {
    tripId: string;
    onLongPress?: () => void;
}

export const TripWalletCard = ({ tripId, onLongPress }: TripWalletCardProps) => {
    const { 
        walletsStats,
        totalWalletBalanceHome,
        homeCurrency 
    } = useTripWallet(tripId);
    
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    return (
        <View style={styles.container}>
            <TouchableOpacity 
                activeOpacity={0.9} 
                onLongPress={onLongPress}
                delayLongPress={500}
            >
                <GlassView
                    intensity={isDark ? 40 : 80}
                    borderRadius={32}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.2)" : "rgba(255, 255, 255, 0.4)"}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.9)" : "rgba(255, 255, 255, 0.7)"}
                    style={styles.card}
                >
                    <View className="flex-row justify-between items-start mb-4">
                        <View>
                            <Text className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'} opacity-60 mb-1`}>
                                TOTAL WALLET BALANCE
                            </Text>
                            <View className="flex-row items-baseline">
                                <Text className={`text-3xl font-black ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                    {MathUtils.formatCurrency(totalWalletBalanceHome, homeCurrency)}
                                </Text>
                            </View>
                            <Text className={`text-[9px] font-bold ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'} opacity-80 mt-1`}>
                                Aggregated from {walletsStats.length} wallets
                            </Text>
                        </View>
                        {onLongPress && (
                            <View className="opacity-20">
                                <Feather name="plus-circle" size={16} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </View>
                        )}
                    </View>

                    {/* Wallets List */}
                    <View className="space-y-4">
                        {walletsStats.map((wallet) => (
                            <View key={wallet.walletId} className="border-t pt-4" style={{ borderColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(0,0,0,0.05)' }}>
                                <View className="flex-row justify-between items-center mb-1">
                                    <Text className={`text-[10px] font-black uppercase ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                                        {wallet.country} WALLET
                                    </Text>
                                    <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#2D342B]'}`}>
                                        {MathUtils.formatCurrency(wallet.balance, wallet.currency)}
                                    </Text>
                                </View>
                                <View className="flex-row justify-between items-center">
                                    <Text className={`text-[9px] font-semibold ${isDark ? 'text-[#B2C4AA]/60' : 'text-[#5D6D54]/60'}`}>
                                        1 {wallet.currency} = {wallet.effectiveRate.toFixed(4)} {homeCurrency}
                                    </Text>
                                    <Text className={`text-[9px] font-semibold ${isDark ? 'text-[#B2C4AA]/60' : 'text-[#5D6D54]/60'}`}>
                                        ≈ {MathUtils.formatCurrency(wallet.homeEquivalent, homeCurrency)}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </GlassView>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
        paddingHorizontal: 16,
    },
    card: {
        padding: 24,
    }
});
