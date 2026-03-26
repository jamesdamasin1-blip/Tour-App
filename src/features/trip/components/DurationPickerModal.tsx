import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView } from '@/components/GlassView';
import { useStore } from '@/src/store/useStore';
import DateTimePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';

interface DurationPickerModalProps {
    visible: boolean;
    onClose: () => void;
    startDate: dayjs.Dayjs | null;
    endDate: dayjs.Dayjs | null;
    onDatesChange: (params: { startDate: dayjs.Dayjs | null; endDate: dayjs.Dayjs | null }) => void;
    isDark?: boolean; // Optional: component reads theme from store, but caller may pass it
}

export const DurationPickerModal = ({ visible, onClose, startDate, endDate, onDatesChange }: DurationPickerModalProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center px-6">
                <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                <GlassView
                    intensity={isDark ? 80 : 100}
                    borderRadius={32}
                    backgroundColor={isDark ? 'rgba(30, 34, 28, 0.97)' : 'rgba(255, 255, 255, 0.98)'}
                    borderColor={isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)'}
                    style={{ width: '100%', padding: 24, minHeight: 450 }}
                >
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-[#1a1a1a]'}`}>Select Trip Dates</Text>
                        <TouchableOpacity onPress={onClose} className="p-2">
                            <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                        </TouchableOpacity>
                    </View>

                    <DateTimePicker
                        mode="range"
                        startDate={startDate || undefined}
                        endDate={endDate || undefined}
                        onChange={(params: any) => {
                            onDatesChange(params);
                            if (params.endDate) onClose();
                        }}
                        components={{
                            IconPrev: <Feather name="chevron-left" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />,
                            IconNext: <Feather name="chevron-right" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />,
                        }}
                        styles={{
                            header: { paddingVertical: 10 },
                            month_selector_label: { color: isDark ? '#F2F0E8' : '#1a1a1a', fontWeight: 'bold' },
                            year_selector_label: { color: isDark ? '#F2F0E8' : '#1a1a1a', fontWeight: 'bold' },
                            weekday_label: { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: '900' },
                            day_label: { color: isDark ? '#F2F0E8' : '#1a1a1a' },
                            selected: { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', borderRadius: 12 },
                            selected_label: { color: isDark ? '#1a1a1a' : '#fff', fontWeight: 'bold' },
                            range_fill: { backgroundColor: isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.1)' },
                            range_start: { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', borderRadius: 12 },
                            range_end: { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', borderRadius: 12 },
                            today: { borderColor: isDark ? '#B2C4AA' : '#5D6D54', borderWidth: 1, borderRadius: 12 },
                            today_label: { color: isDark ? '#B2C4AA' : '#5D6D54', fontWeight: 'bold' },
                            button_prev: { 
                                backgroundColor: isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.1)',
                                borderRadius: 10,
                                padding: 4,
                            },
                            button_next: { 
                                backgroundColor: isDark ? 'rgba(178, 196, 170, 0.1)' : 'rgba(93, 109, 84, 0.1)',
                                borderRadius: 10,
                                padding: 4,
                            },
                        }}
                    />
                    
                    {!endDate && (
                        <TouchableOpacity onPress={onClose} className="mt-6 py-4 bg-[#5D6D54] rounded-2xl items-center shadow-sm">
                            <Text className="text-white font-bold uppercase tracking-wider">Confirm</Text>
                        </TouchableOpacity>
                    )}
                </GlassView>
            </View>
        </Modal>
    );
};
