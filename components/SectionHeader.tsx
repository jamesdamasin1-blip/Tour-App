import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../src/store/useStore';

interface SectionHeaderProps {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const SectionHeader = React.memo(({ title, actionLabel, onAction }: SectionHeaderProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    return (
        <View className="flex-row items-center justify-between mb-4 mt-6">
            <Text className={`text-xl font-extrabold ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>{title}</Text>
            {actionLabel && (
                <TouchableOpacity onPress={onAction}>
                    <Text className={`text-base font-semibold ${isDark ? 'text-[#B2C4AA]' : 'text-blue-500'}`}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
});

SectionHeader.displayName = 'SectionHeader';
