import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';

interface ActivityFormScheduleProps {
    date: dayjs.Dayjs | null;
    setShowDatePicker: (show: boolean) => void;
    startTime: dayjs.Dayjs | null;
    setShowStartTimePicker: (show: boolean) => void;
    endTime: dayjs.Dayjs | null;
    setShowEndTimePicker: (show: boolean) => void;
    isDark: boolean;
    errors: Record<string, string>;
}

export const ActivityFormSchedule: React.FC<ActivityFormScheduleProps> = ({
    date, setShowDatePicker,
    startTime, setShowStartTimePicker,
    endTime, setShowEndTimePicker,
    isDark,
    errors
}) => {
    return (
        <View className="px-4 pb-2">
             <Text className={`text-xs font-bold mb-3 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Schedule</Text>
            
            <View className="flex-row gap-4 mb-2">
                <View className="flex-1">
                    <Text className={`text-[10px] font-black mb-1 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>DATE</Text>
                    <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        className="flex-row items-center border rounded-2xl px-4 py-3.5"
                        style={{ 
                            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', 
                            borderColor: errors.date ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)'),
                        }}
                    >
                        <Feather name="calendar" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                        <Text className={`flex-1 text-base ml-3 font-semibold ${date ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>
                            {date ? dayjs(date).format('MMM DD, YYYY') : 'Select Date'}
                        </Text>
                    </TouchableOpacity>
                    {errors.date && <Text className="text-red-500 text-[10px] font-bold mt-2 ml-4 uppercase">{errors.date}</Text>}
                </View>
            </View>

            <View className="mb-4">
                <Text className={`text-[10px] font-black mb-1 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>SCHEDULE TIME</Text>
                <TouchableOpacity
                    onPress={() => setShowStartTimePicker(true)}
                    className="flex-row items-center border rounded-2xl px-4 py-3.5"
                    style={{ 
                        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', 
                        borderColor: (errors.startTime || errors.endTime) ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)'),
                    }}
                >
                    <Feather name="clock" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                    <View className="flex-1 flex-row items-center ml-3">
                        <Text className={`text-base font-semibold ${startTime ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>
                            {startTime ? dayjs(startTime).format('HH:mm') : 'Start'}
                        </Text>
                        <Text className={`mx-3 opacity-40 ${isDark ? 'text-white' : 'text-gray-900'}`}>—</Text>
                        <Text className={`text-base font-semibold ${endTime ? (isDark ? 'text-white' : 'text-gray-900') : (isDark ? 'text-[#F2F0E8]/50' : 'text-gray-400')}`}>
                            {endTime ? dayjs(endTime).format('HH:mm') : 'End'}
                        </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={isDark ? "rgba(178, 196, 170, 0.4)" : "rgba(93, 109, 84, 0.4)"} />
                </TouchableOpacity>
                {(errors.startTime || errors.endTime) && (
                    <Text className="text-red-500 text-[10px] font-bold mt-1 ml-4 uppercase">
                        {errors.startTime || errors.endTime}
                    </Text>
                )}
            </View>
        </View>
    );
};
