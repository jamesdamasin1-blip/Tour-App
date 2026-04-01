import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type TripDateNavigatorProps = {
    currentDate?: number | null;
    dateCount: number;
    isDark: boolean;
    selectedIndex: number;
    onNext: () => void;
    onPrevious: () => void;
};

export function TripDateNavigator({
    currentDate,
    dateCount,
    isDark,
    selectedIndex,
    onNext,
    onPrevious,
}: TripDateNavigatorProps) {
    if (dateCount <= 1) {
        return null;
    }

    return (
        <View className="mt-6 mb-0">
            <View className="flex-row items-center justify-between mb-4 px-4">
                <TouchableOpacity
                    onPress={onPrevious}
                    disabled={selectedIndex === 0}
                    style={{ opacity: selectedIndex === 0 ? 0.3 : 1 }}
                    className={`w-10 h-10 rounded-full items-center justify-center ${isDark ? 'bg-[#3A3F37]' : 'bg-[#F2F0E8]'}`}
                >
                    <Feather name="chevron-left" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </TouchableOpacity>

                <View className="items-center">
                    <Text className={`text-[10px] font-black tracking-[2px] ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                        DAY {selectedIndex + 1} OF {dateCount}
                    </Text>
                    <Text className={`text-[14px] font-black ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>
                        {new Date(currentDate || 0).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={onNext}
                    disabled={selectedIndex === dateCount - 1}
                    style={{ opacity: selectedIndex === dateCount - 1 ? 0.3 : 1 }}
                    className={`w-10 h-10 rounded-full items-center justify-center ${isDark ? 'bg-[#3A3F37]' : 'bg-[#F2F0E8]'}`}
                >
                    <Feather name="chevron-right" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
