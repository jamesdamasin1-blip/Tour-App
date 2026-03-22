import React from 'react';
import { View, Text, TextInput } from 'react-native';

interface TripFormCurrencyProps {
    isDark: boolean;
    homeCurrency: string;
    tripCurrency: string;
    defaultRate: string;
    onRateChange: (text: string) => void;
    disabled: boolean;
}

export const TripFormCurrency = ({
    isDark, homeCurrency, tripCurrency, defaultRate, onRateChange, disabled
}: TripFormCurrencyProps) => {
    return (
        <View style={{ opacity: disabled ? 0.3 : 1 }} pointerEvents={disabled ? 'none' : 'auto'} className="mt-4">
            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>CURRENCY SETTINGS</Text>
            <View className="flex-row gap-4 mb-6">
                <View className="flex-1">
                    <Text className={`text-[9px] font-black uppercase mb-2 ${isDark ? 'text-[#B2C4AA] opacity-80' : 'text-[#9EB294] opacity-60'}`}>Home Currency</Text>
                    <View
                        className="border rounded-2xl px-4 py-3"
                        style={{ backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', borderColor: isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)' }}
                    >
                        <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{homeCurrency}</Text>
                    </View>
                </View>
                <View className="flex-1">
                    <Text className={`text-[9px] font-black uppercase mb-2 ${isDark ? 'text-[#B2C4AA] opacity-80' : 'text-[#9EB294] opacity-60'}`}>Rate (1 {homeCurrency} = ? {tripCurrency})</Text>
                    <View
                        className="border rounded-2xl px-4 py-3"
                        style={{ backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', borderColor: isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)' }}
                    >
                        <TextInput
                            keyboardType="numeric"
                            value={defaultRate}
                            onChangeText={onRateChange}
                            className={`font-bold p-0 ${isDark ? 'text-white' : 'text-gray-900'}`}
                        />
                    </View>
                </View>
            </View>
        </View>
    );
};
