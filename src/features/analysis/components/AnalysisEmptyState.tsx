import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type AnalysisEmptyStateProps = {
    isDark: boolean;
};

export const AnalysisEmptyState = ({ isDark }: AnalysisEmptyStateProps) => (
    <View className="flex-1 items-center justify-center px-10 py-20">
        <View
            className="p-8 rounded-3xl mb-8 shadow-xl"
            style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.2)' }}
        >
            <Feather name="bar-chart-2" size={56} color={isDark ? '#B2C4AA' : '#5D6D54'} />
        </View>
        <Text className={`text-3xl font-black mb-4 text-center uppercase tracking-tighter ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>
            no data to analyze yet
        </Text>
        <Text className={`text-center font-medium text-base ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>
            Create a trip and log some expenses to see your budget breakdown!
        </Text>
    </View>
);
