import { Feather } from '@expo/vector-icons';
import React from 'react';
import { useStore } from '../src/store/useStore';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { getFlagUrl } from '../src/data/countryMapping';
import { GlassView } from './GlassView';

interface TripSelectionItemProps {
    title: string;
    startDate: number;
    endDate: number;
    countries: string[];
    onSelect: () => void;
    intensity?: number;
    backgroundColor?: string;
}

export const TripSelectionItem = ({ title, startDate, endDate, countries, onSelect, intensity = 60, backgroundColor = "rgba(255, 255, 255, 0.5)" }: TripSelectionItemProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateRange = `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return (
        <TouchableOpacity
            onPress={onSelect}
            activeOpacity={0.8}
            className="mb-4"
        >
            <GlassView
                intensity={isDark ? 50 : intensity}
                borderRadius={24}
                borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                backgroundColor={isDark ? "rgba(60, 68, 56, 0.8)" : backgroundColor}
                hasShadow={true}
                shadowOpacity={isDark ? 0.2 : 0.08}
                shadowRadius={12}
                elevation={5}
            >
                {/* Subtle Flag Background */}
                <View className="absolute inset-0 flex-row" style={{ opacity: 0.05 }}>
                    {countries.map((country, index) => {
                        const flagUrl = getFlagUrl(country);
                        if (!flagUrl) return null;
                        return (
                            <Image
                                key={`${country}-${index}`}
                                source={{ uri: flagUrl }}
                                className="h-full flex-1"
                                style={{ resizeMode: 'cover' }}
                            />
                        );
                    })}
                </View>

                <View className="px-5 py-5 flex-row items-center justify-between">
                    <View className="flex-1 mr-4">
                        <Text className={`text-xl font-black uppercase leading-tight mb-1 ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>
                            {title}
                        </Text>
                        <View className="flex-row items-center">
                            <Feather name="calendar" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} style={{ marginRight: 4 }} />
                            <Text className={`text-sm font-bold uppercase tracking-tighter ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>
                                {dateRange}
                            </Text>
                        </View>
                    </View>

                    <Feather name="chevron-right" size={28} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                </View>
            </GlassView>
        </TouchableOpacity>
    );
};
