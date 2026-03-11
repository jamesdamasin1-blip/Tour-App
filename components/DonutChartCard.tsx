import { GlassView } from '@/components/GlassView';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import Svg, { Circle, G } from 'react-native-svg';

interface DonutChartProps {
    totalSpent: number;
    totalBudget: number;
    categoryData: { color: string; amount: number }[];
}

export const DonutChartCard = React.memo(({ totalSpent, totalBudget, categoryData }: DonutChartProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    
    const size = 200;
    const strokeWidth = 25;
    const center = size / 2;
    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;

    const percentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const clampedPct = Math.min(Math.round(percentage), 100);

    // Calculate strokeDashoffset for each segment
    const segments = useMemo(() => {
        let currentOffset = 0;
        return categoryData.map((data) => {
            const segmentPercentage = totalSpent > 0 ? (data.amount / totalSpent) : 0;
            // The length of this segment
            const strokeDasharray = `${circumference * segmentPercentage} ${circumference}`;
            // The starting point
            const strokeDashoffset = currentOffset;
            // Move offset for the next segment
            currentOffset -= (circumference * segmentPercentage);

            return {
                color: data.color,
                strokeDasharray,
                strokeDashoffset,
            };
        });
    }, [categoryData, totalSpent, circumference]);

    return (
        <GlassView
            style={styles.container}
            intensity={isDark ? 50 : 80}
            borderRadius={24}
            backgroundColor={isDark ? "rgba(40, 44, 38, 0.45)" : "rgba(255, 255, 255, 0.3)"}
            borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.2)"}
            borderWidth={1}
            hasShadow={true}
            shadowOpacity={isDark ? 0.2 : 0.1}
            shadowRadius={12}
            elevation={5}
        >
            <View className="p-6 items-center w-full">
                <Text className={`text-xs font-bold uppercase tracking-widest mb-6 ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>Total Spending</Text>

                <View className="relative items-center justify-center">
                    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <G rotation="-90" origin={`${center}, ${center}`}>
                            {/* Background Circle */}
                            <Circle
                                cx={center}
                                cy={center}
                                r={radius}
                                stroke={isDark ? "rgba(255,255,255,0.05)" : "#f3f4f6"}
                                strokeWidth={strokeWidth}
                                fill="transparent"
                            />

                            {/* Foreground Segments */}
                            {segments.map((segment, index) => {
                                // Add a tiny gap (2px) to the dash array to make rounded caps more visible and prevent overlapping
                                const gap = 3;
                                const originalArray = segment.strokeDasharray.split(' ');
                                const segmentLen = Math.max(0, parseFloat(originalArray[0]) - gap);
                                const newDasharray = `${segmentLen} ${parseFloat(originalArray[1]) + gap}`;

                                return (
                                    <Circle
                                        key={index}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        stroke={segment.color}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={newDasharray}
                                        strokeDashoffset={segment.strokeDashoffset}
                                        strokeLinecap="round"
                                    />
                                );
                            })}
                        </G>
                    </Svg>

                    <View className="absolute inset-0 items-center justify-center">
                        <Text className={`text-xl font-extrabold ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>₱{totalSpent.toLocaleString()}</Text>
                        <Text className={`text-[10px] font-semibold ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>of ₱{totalBudget.toLocaleString()}</Text>
                    </View>
                </View>

                <Text className={`text-sm italic mt-6 ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                    You&apos;ve used {clampedPct}% of your trip budget
                </Text>
            </View>
        </GlassView>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
        marginTop: 16,
        width: '100%',
    }
});
