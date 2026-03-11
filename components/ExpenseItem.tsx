import { Expense } from '@/src/types/models';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface ExpenseItemProps {
    expense: Expense;
    onPress?: (expense: Expense) => void;
}

const getCategoryIcon = (category: string) => {
    switch (category) {
        case 'Food': return 'coffee';
        case 'Transport': return 'truck';
        case 'Accommodation': return 'home';
        case 'Sightseeing': return 'camera';
        default: return 'credit-card';
    }
};

const getCategoryColor = (category: string) => {
    switch (category) {
        case 'Food': return { bg: '#fff7ed', text: '#ea580c' }; // Orange
        case 'Transport': return { bg: '#eff6ff', text: '#3b82f6' }; // Blue
        case 'Accommodation': return { bg: '#f5f3ff', text: '#8b5cf6' }; // Purple
        case 'Sightseeing': return { bg: '#f0fdf4', text: '#22c55e' }; // Green
        default: return { bg: '#f3f4f6', text: '#6b7280' }; // Gray
    }
};

export const ExpenseItem = React.memo(({ expense, onPress }: ExpenseItemProps) => {
    const timeString = new Date(expense.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const colors = getCategoryColor(expense.category);

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onPress?.(expense)}
            className="flex-row items-center justify-between p-4 bg-white rounded-2xl mb-3 shadow-sm border border-gray-50"
        >
            <View className="flex-row items-center flex-1">
                <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: colors.bg }}
                >
                    <Feather name={getCategoryIcon(expense.category) as any} size={20} color={colors.text} />
                </View>
                <View className="flex-1">
                    <Text className="text-base font-bold text-gray-900 mb-1" numberOfLines={1}>{expense.name}</Text>
                    <Text className="text-xs text-gray-500">
                        {expense.category} • {timeString}
                    </Text>
                </View>
            </View>

            <Text className="text-base font-bold text-gray-900 ml-4">
                -${expense.amount.toLocaleString()}
            </Text>
        </TouchableOpacity>
    );
});
