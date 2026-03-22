import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';

interface TripFormDetailsProps {
    isDark: boolean;
    title: string;
    setTitle: (text: string) => void;
    titleError: boolean;
    homeCountry: string;
    onHomeCountryPress: () => void;
    homeCountryError: boolean;
    startDate: dayjs.Dayjs | null;
    endDate: dayjs.Dayjs | null;
    onDurationPress: () => void;
    durationError: boolean;
    countries: string[];
    onCountryPress: () => void;
    removeCountry: (c: string) => void;
    countriesError: boolean;
    isEditing?: boolean;
}

export const TripFormDetails = ({
    isDark, title, setTitle, titleError, homeCountry, onHomeCountryPress, homeCountryError,
    startDate, endDate, onDurationPress, durationError,
    countries, onCountryPress, removeCountry, countriesError, isEditing
}: TripFormDetailsProps) => {
    return (
        <View>
            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>1. HOME COUNTRY</Text>
            <TouchableOpacity
                onPress={isEditing ? undefined : onHomeCountryPress}
                activeOpacity={isEditing ? 1 : 0.7}
                className="flex-row items-center border rounded-2xl px-4 py-4 mb-1"
                style={{ 
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)',
                    borderColor: homeCountryError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)'),
                    opacity: isEditing ? 0.6 : 1
                }}
            >
                <Feather name="home" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                <Text className={`flex-1 text-base ml-3 font-semibold ${!homeCountry ? 'text-gray-400 opacity-60' : (isDark ? 'text-[#F2F0E8]' : 'text-gray-900')}`}>
                    {homeCountry || "Select Home Country..."}
                </Text>
                {!isEditing && <Feather name="chevron-down" size={16} color={isDark ? "#B2C4AA" : "#9EB294"} />}
                {isEditing && <Feather name="lock" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />}
            </TouchableOpacity>
            <Text className={`text-[9px] mb-5 ml-1 font-bold tracking-tight ${isDark ? 'text-[#B2C4AA]/70' : 'text-gray-500'}`}>
                {isEditing ? "Home country cannot be changed after creation." : "For Baseline Currency"}
            </Text>

            <Text className={`text-[10px] font-black mb-2 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>TRIP NAME</Text>
            <View 
                className="flex-row items-center border rounded-2xl px-4 py-4 mb-1" 
                style={{ 
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)',
                    borderColor: titleError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)')
                }}
            >
                <Feather name="briefcase" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                <TextInput
                    placeholder="e.g. Boracay Summer 2024"
                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                    value={title}
                    onChangeText={setTitle}
                    className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                />
            </View>
            {titleError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD TRIP NAME</Text>}

            <Text className={`text-[10px] font-black mb-2 mt-4 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>2. TRIP COUNTRIES</Text>
            <TouchableOpacity
                onPress={homeCountry ? onCountryPress : undefined}
                disabled={!homeCountry}
                className="flex-row items-center border rounded-2xl px-4 py-4 mb-1"
                style={{ 
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)',
                    borderColor: countriesError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)'),
                    opacity: homeCountry ? 1 : 0.4
                }}
            >
                <Feather name="map-pin" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                <Text className={`flex-1 text-base ml-3 font-semibold ${isDark ? (countries.length > 0 ? 'text-[#F2F0E8]' : 'text-[#F2F0E8]/50') : (countries.length > 0 ? 'text-gray-900' : 'text-gray-400')}`}>
                    {countries.length > 0 ? "Add More Countries" : "Select Countries..."}
                </Text>
                {!homeCountry && <Feather name="lock" size={12} color={isDark ? "#B2C4AA" : "#9EB294"} style={{ opacity: 0.5 }} />}
            </TouchableOpacity>
            {countriesError && <Text className="text-[#FF3B30] text-xs font-bold mb-3 ml-1">ADD AT LEAST ONE COUNTRY</Text>}

            {countries.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-4 mt-2">
                    {countries.map((c) => (
                        <View key={c} className={`flex-row items-center px-3 py-1.5 rounded-full shadow-sm border ${isDark ? 'bg-[#3A3F37] border-[#9EB294]/30' : 'bg-[#E9E4BF] border-[#5D6D54]/20'}`}>
                            <Text className={`font-bold text-sm mr-2 ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>{c}</Text>
                            <TouchableOpacity onPress={() => removeCountry(c)}>
                                <Feather name="x-circle" size={14} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            <Text className={`text-[10px] font-black mb-2 mt-4 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>DURATION</Text>
            <TouchableOpacity
                onPress={onDurationPress}
                className="flex-row gap-4 mb-2 items-center border rounded-2xl p-4" 
                style={{ 
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)',
                    borderColor: durationError ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)')
                }}
            >
                <View className="flex-1">
                    <Text className={`text-[9px] font-black uppercase mb-1 ${isDark ? 'text-[#B2C4AA] opacity-80' : 'text-[#9EB294]'}`}>Starts</Text>
                    <View className="flex-row items-center">
                        <Feather name="calendar" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                        <Text className={`font-bold ml-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {startDate ? dayjs(startDate).format('MMM D') : '-'}
                        </Text>
                    </View>
                </View>
                <View className="flex-1">
                    <Text className={`text-[9px] font-black uppercase mb-1 ${isDark ? 'text-[#B2C4AA] opacity-80' : 'text-[#9EB294]'}`}>Ends</Text>
                    <View className="flex-row items-center">
                        <Feather name="calendar" size={14} color={isDark ? "#B2C4AA" : "#9EB294"} />
                        <Text className={`font-bold ml-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {endDate ? dayjs(endDate).format('MMM D') : '-'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
            {durationError && <Text className="text-[#FF3B30] text-xs font-bold mb-5 ml-1">ADD DURATION</Text>}
        </View>
    );
};
