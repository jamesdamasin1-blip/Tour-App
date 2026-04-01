import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type TripsEmptyStateProps = {
    isDark: boolean;
};

export const TripsEmptyState = ({ isDark }: TripsEmptyStateProps) => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <View
            style={{
                padding: 32,
                borderRadius: 999,
                marginBottom: 20,
                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)',
            }}
        >
            <Feather name="map" size={56} color={isDark ? '#B2C4AA' : '#9EB294'} />
        </View>
        <Text
            testID="empty-state-text"
            style={{
                fontSize: 28,
                fontWeight: '900',
                color: isDark ? '#F2F0E8' : '#111827',
                textAlign: 'center',
                marginBottom: 12,
            }}
        >
            ready for your next trip?
        </Text>
        <Text
            style={{
                fontSize: 14,
                fontWeight: '500',
                color: isDark ? '#9EB294' : '#6B7280',
                textAlign: 'center',
                lineHeight: 20,
            }}
        >
            Create your first trip plan to start tracking your activities and budget!
        </Text>
    </View>
);
