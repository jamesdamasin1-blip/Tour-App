import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassView } from '@/components/GlassView';
import { useStore } from '@/src/store/useStore';
import { AnimatedModal } from '@/components/AnimatedModal';

interface CurrencyPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (currency: string) => void;
    selectedCurrency: string;
    availableCurrencies: string[];
}

export const CurrencyPickerModal = ({ visible, onClose, onSelect, selectedCurrency, availableCurrencies }: CurrencyPickerModalProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    return (
        <AnimatedModal visible={visible} onClose={onClose} origin="bottom">
            <View className="flex-1 justify-end">
                <GlassView
                    intensity={isDark ? 80 : 95}
                    borderRadius={32}
                    borderWidth={1}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                    style={{ height: '60%', padding: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                >
                    <View className="flex-row items-center justify-between mb-6">
                        <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-[#1a1a1a]'}`}>Select Currency</Text>
                        <TouchableOpacity onPress={onClose} className="p-2">
                            <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                        <View className="flex-row flex-wrap gap-2">
                            {availableCurrencies.map((code: string) => (
                                <TouchableOpacity
                                    key={code}
                                    onPress={() => {
                                        onSelect(code);
                                        onClose();
                                    }}
                                    className={`flex-row items-center px-4 py-3 rounded-2xl border ${selectedCurrency === code ? (isDark ? 'bg-[#5D6D54] border-[#9EB294]' : 'bg-[#5D6D54] border-[#5D6D54]') : (isDark ? 'bg-[#3A3F37] border-[#9EB294]/20' : 'bg-white border-gray-200')}`}
                                >
                                    <Text className={`font-bold ${selectedCurrency === code ? 'text-white' : (isDark ? 'text-[#F2F0E8]' : 'text-gray-900')}`}>{code}</Text>
                                </TouchableOpacity>
                            ))}
                            {availableCurrencies.length === 0 && (
                                <View className="flex-1 items-center justify-center py-10">
                                    <Text className={`font-medium text-center ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                                        Select a country first to see available currencies.
                                    </Text>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </GlassView>
            </View>
        </AnimatedModal>
    );
};
