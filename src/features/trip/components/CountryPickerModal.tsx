import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassView } from '@/components/GlassView';
import { COUNTRIES } from '@/src/data/countries';
import { AnimatedModal } from '@/components/AnimatedModal';
import { PressableScale } from '@/components/PressableScale';

interface CountryPickerModalProps {
    visible: boolean;
    onClose: () => void;
    selectedCountries: string[];
    onToggleCountry: (country: string) => void;
    isDark: boolean;
    disabledCountries?: string[];
}

export const CountryPickerModal = ({ visible, onClose, selectedCountries, onToggleCountry, isDark, disabledCountries = [] }: CountryPickerModalProps) => {
    const [search, setSearch] = useState('');

    const filteredCountries = COUNTRIES.filter((c: string) => 
        c.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AnimatedModal visible={visible} onClose={onClose} origin="bottom">
            <View className="flex-1 justify-end">
                <GlassView
                    intensity={isDark ? 80 : 95}
                    borderRadius={32}
                    borderWidth={1}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(242, 240, 228, 0.95)"}
                    style={{ height: '80%', padding: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                >
                    <View className="flex-row items-center justify-between mb-6">
                        <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-[#1a1a1a]'}`}>Select Country</Text>
                        <TouchableOpacity onPress={onClose} className="p-2">
                            <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                        </TouchableOpacity>
                    </View>

                    <View 
                        className={`flex-row items-center border rounded-2xl px-4 py-3 mb-6 ${isDark ? 'border-[#9EB294]/20' : 'bg-white/60 border-white/50'}`}
                        style={isDark ? { backgroundColor: 'rgba(58, 63, 55, 0.8)' } : {}}
                    >
                        <Feather name="search" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                        <TextInput
                            placeholder="Search countries..."
                            placeholderTextColor={isDark ? "rgba(178,196,170,0.4)" : "#9ca3af"}
                            value={search}
                            onChangeText={setSearch}
                            className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                            autoFocus
                        />
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                        <View className="pb-10">
                                {filteredCountries.map((c: string) => {
                                    const isDisabled = disabledCountries.includes(c);
                                    const isSelected = selectedCountries.includes(c);
                                    
                                    return (
                                        <TouchableOpacity
                                            key={c}
                                            onPress={() => !isDisabled && onToggleCountry(c)}
                                            disabled={isDisabled}
                                            className={`py-4 border-b flex-row items-center justify-between ${isDark ? 'border-white/05' : 'border-white/30'} ${isDisabled ? 'opacity-30' : ''}`}
                                        >
                                            <View className="flex-row items-center flex-1">
                                                <Text className={`text-lg font-semibold ${isSelected ? (isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]') : (isDark ? 'text-[#B2C4AA]' : 'text-gray-700')}`}>
                                                    {c}
                                                </Text>
                                                {isDisabled && (
                                                    <Text className="ml-2 text-[8px] font-black uppercase tracking-widest text-[#ef4444] bg-[#ef4444]/10 px-1.5 py-0.5 rounded">Home Base</Text>
                                                )}
                                            </View>
                                            {isSelected && (
                                                <Feather name="check" size={20} color={isDark ? "#F2F0E8" : "#5D6D54"} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                        </View>
                    </ScrollView>

                    <PressableScale onPress={onClose} className="mt-4 py-4 bg-[#5D6D54] rounded-2xl items-center shadow-sm">
                        <Text className="text-white font-black uppercase tracking-widest text-[14px]">Done</Text>
                    </PressableScale>
                </GlassView>
            </View>
        </AnimatedModal>
    );
};
