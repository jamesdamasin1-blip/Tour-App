import { GlassView } from '@/components/GlassView';
import { ProgressBar } from '@/components/ProgressBar';
import { Feather } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { getCategoryTheme } from '../src/constants/categories';

interface CategoryCardProps {
    title: string;
    spent: number;
    percentage: number; // 0 to 100
    iconType?: string;
}

export const CategoryCard = React.memo(({ title, spent, percentage, iconType }: CategoryCardProps) => {
    const { theme: appTheme } = useStore();
    const isDark = appTheme === 'dark';
    
    const theme = getCategoryTheme(iconType || title);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const animateScale = (toValue: number) => {
        Animated.spring(scaleAnim, {
            toValue,
            useNativeDriver: true,
            friction: 8,
            tension: 40
        }).start();
    };

    return (
        <Animated.View
            style={{ transform: [{ scale: scaleAnim }] }}
        >
            <TouchableOpacity
                activeOpacity={0.9}
                onPressIn={() => animateScale(1.02)}
                onPressOut={() => animateScale(1)}
            >
                <GlassView
                    style={styles.container}
                    intensity={isDark ? 50 : 80}
                    borderRadius={16}
                    backgroundColor={isDark ? "rgba(40, 44, 38, 0.6)" : "rgba(255, 255, 255, 0.4)"}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.15)" : "rgba(255, 255, 255, 0.2)"}
                    borderWidth={1}
                    hasShadow={true}
                    shadowOpacity={0.08}
                    shadowRadius={8}
                    elevation={3}
                >
            <View className="p-4 flex-row items-center w-full">
                <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: theme.bg, opacity: isDark ? 0.9 : 1 }}
                >
                    <Feather name={theme.icon as any} size={20} color={theme.color} />
                </View>

                <View className="flex-1">
                    <View className="flex-row justify-between items-end mb-2">
                        <Text className={`text-base font-bold ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>{title}</Text>
                    </View>

                    <ProgressBar
                        progress={percentage}
                        color={theme.color}
                        trackColor={isDark ? "rgba(158, 178, 148, 0.05)" : "rgba(158, 178, 148, 0.1)"}
                        height={18}
                        floatingLabel={`₱${spent.toLocaleString()} (${percentage}%)`}
                        fontSize={10}
                    />
                </View>
            </View>
                </GlassView>
            </TouchableOpacity>
        </Animated.View>
    );
});

CategoryCard.displayName = 'CategoryCard';

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
    }
});
