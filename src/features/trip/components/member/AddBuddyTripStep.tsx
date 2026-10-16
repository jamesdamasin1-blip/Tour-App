import { getFlagUrl } from '@/src/data/countryMapping';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Image, Text, TouchableOpacity, View } from 'react-native';

type AddBuddyTripStepProps = {
    activeTrips: any[];
    isDark: boolean;
    onSelectTrip: (tripId: string) => void;
};

export function AddBuddyTripStep({ activeTrips, isDark, onSelectTrip }: AddBuddyTripStepProps) {
    if (activeTrips.length === 0) {
        return (
            <View
                style={{
                    minHeight: 140,
                    borderRadius: 24,
                    paddingHorizontal: 18,
                    paddingVertical: 22,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: isDark ? 'rgba(93, 109, 84, 0.14)' : 'rgba(255, 255, 255, 0.78)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(178,196,170,0.16)' : 'rgba(93,109,84,0.12)',
                }}
            >
                <View
                    style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 12,
                        backgroundColor: isDark ? 'rgba(178,196,170,0.1)' : 'rgba(93,109,84,0.08)',
                    }}
                >
                    <Feather name="briefcase" size={18} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <Text
                    style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: isDark ? '#F2F0E8' : '#111827',
                        textAlign: 'center',
                    }}
                >
                    No active trips
                </Text>
                <Text
                    style={{
                        fontSize: 12,
                        lineHeight: 18,
                        color: isDark ? '#9EB294' : '#6B7280',
                        textAlign: 'center',
                        marginTop: 6,
                    }}
                >
                    Create your first trip before inviting members.
                </Text>
            </View>
        );
    }

    return (
        <FlatList
            data={activeTrips}
            keyExtractor={item => item.id}
            style={{ maxHeight: 340 }}
            scrollEnabled={activeTrips.length > 3}
            renderItem={({ item }) => {
                const flagUrl = item.countries?.[0] ? getFlagUrl(item.countries[0]) : null;
                return (
                    <TouchableOpacity
                        onPress={() => onSelectTrip(item.id)}
                        style={{
                            paddingVertical: 18,
                            paddingHorizontal: 18,
                            borderRadius: 20,
                            marginBottom: 10,
                            backgroundColor: isDark ? 'rgba(93, 109, 84, 0.18)' : 'rgba(93, 109, 84, 0.07)',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(178,196,170,0.2)' : 'rgba(93,109,84,0.18)',
                            flexDirection: 'row',
                            alignItems: 'center',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.06,
                            shadowRadius: 6,
                            elevation: 0,
                        }}
                        activeOpacity={0.8}
                    >
                        {flagUrl && (
                            <View style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', marginRight: 14, flexShrink: 0 }}>
                                <Image source={{ uri: flagUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            </View>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {item.title}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#9EB294' : '#6B7280', marginTop: 3 }}>
                                {item.countries?.join(', ')}{item.members?.length ? ` - ${item.members.length} member${item.members.length !== 1 ? 's' : ''}` : ''}
                            </Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={isDark ? 'rgba(178,196,170,0.4)' : 'rgba(93,109,84,0.3)'} />
                    </TouchableOpacity>
                );
            }}
        />
    );
}
