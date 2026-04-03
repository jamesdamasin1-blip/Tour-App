import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TripSelectionItem } from '@/components/TripSelectionItem';
import type { TripPlan } from '@/src/types/models';
import { AnalysisEmptyState } from '@/src/features/analysis/components/AnalysisEmptyState';

type AnalysisTripSelectorProps = {
    trips: TripPlan[];
    isDark: boolean;
    onSelectTrip: (tripId: string) => void;
};

export const AnalysisTripSelector = ({
    trips,
    isDark,
    onSelectTrip,
}: AnalysisTripSelectorProps) => {
    if (trips.length === 0) {
        return <AnalysisEmptyState isDark={isDark} />;
    }

    return (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 250 }}
            bounces={false}
            overScrollMode="never"
            className="flex-1"
        >
            <View className="px-6 pt-4 mb-6">
                <Text className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">
                    SELECT TRIP TO ANALYZE
                </Text>
            </View>

            {trips.map(item => (
                <View key={item.id} className="px-6 mb-4">
                    <TripSelectionItem
                        title={item.title}
                        startDate={item.startDate}
                        endDate={item.endDate}
                        startDateKey={item.startDateKey}
                        endDateKey={item.endDateKey}
                        homeCountry={item.homeCountry}
                        countries={item.countries}
                        onSelect={() => onSelectTrip(item.id)}
                        intensity={isDark ? 50 : 90}
                        backgroundColor={isDark ? 'rgba(40, 44, 38, 0.7)' : 'rgba(255, 255, 255, 0.6)'}
                    />
                </View>
            ))}
        </ScrollView>
    );
};
