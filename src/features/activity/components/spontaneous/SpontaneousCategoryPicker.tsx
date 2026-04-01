import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import { CATEGORY_THEME } from '@/src/constants/categories';
import type { ExpenseCategory } from '@/src/types/models';

type SpontaneousCategoryPickerProps = {
    isDark: boolean;
    category: ExpenseCategory;
    categories: ExpenseCategory[];
    onSelect: (category: ExpenseCategory) => void;
};

export const SpontaneousCategoryPicker = ({
    isDark,
    category,
    categories,
    onSelect,
}: SpontaneousCategoryPickerProps) => (
    <View style={{ marginBottom: 24 }}>
        <Text
            style={{
                fontSize: 10,
                fontWeight: '900',
                color: isDark ? '#B2C4AA' : '#9ca3af',
                opacity: isDark ? 0.6 : 1,
                marginBottom: 12,
                letterSpacing: 1,
            }}
        >
            CATEGORY
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map(cat => (
                <TouchableOpacity
                    key={cat}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        backgroundColor: category === cat
                            ? CATEGORY_THEME[cat].color
                            : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                        borderColor: category === cat
                            ? CATEGORY_THEME[cat].color
                            : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                    }}
                    onPress={() => onSelect(cat)}
                >
                    <Feather
                        name={CATEGORY_THEME[cat].icon as any}
                        size={16}
                        color={category === cat ? '#fff' : (isDark ? '#B2C4AA' : CATEGORY_THEME[cat].color)}
                    />
                    <Text
                        style={{
                            fontSize: 11,
                            fontWeight: '800',
                            marginLeft: 8,
                            letterSpacing: 0.5,
                            color: category === cat ? '#fff' : (isDark ? '#F2F0E8' : '#1a1a1a'),
                        }}
                    >
                        {cat.toUpperCase()}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    </View>
);
