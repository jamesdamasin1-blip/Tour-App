import type { DeletionRequest } from '@/src/store/slices/settingsSlice';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type TripDeleteRequestsPanelProps = {
    insetsTop: number;
    isCreator: boolean;
    isDark: boolean;
    requests: DeletionRequest[];
    visible: boolean;
    onApprove: (request: DeletionRequest) => void;
    onDismiss: () => void;
    onReject: (request: DeletionRequest) => void;
};

export function TripDeleteRequestsPanel({
    insetsTop,
    isCreator,
    isDark,
    requests,
    visible,
    onApprove,
    onDismiss,
    onReject,
}: TripDeleteRequestsPanelProps) {
    if (!isCreator || !visible || requests.length === 0) {
        return null;
    }

    return (
        <>
            <TouchableOpacity
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                activeOpacity={1}
                onPress={onDismiss}
            />
            <View
                style={{
                    position: 'absolute',
                    top: insetsTop + 60,
                    right: 16,
                    zIndex: 100,
                    width: 280,
                    backgroundColor: isDark ? '#1A2019' : '#FFFFFF',
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.35)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.18,
                    shadowRadius: 16,
                    elevation: 12,
                    overflow: 'hidden',
                }}
            >
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.2)',
                    }}
                >
                    <Feather name="alert-triangle" size={12} color="#F5A623" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#F5A623', textTransform: 'uppercase' }}>
                        DELETION REQUESTS
                    </Text>
                </View>
                {requests.map((request, index) => (
                    <View
                        key={request.id}
                        style={{
                            padding: 14,
                            borderBottomWidth: index < requests.length - 1 ? 1 : 0,
                            borderBottomColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(0,0,0,0.06)',
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: request.requestedByColor, marginRight: 7 }} />
                            <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.5, color: isDark ? '#F5A623' : '#B45309', flex: 1 }}>
                                {request.requestedByName.toUpperCase()}
                            </Text>
                        </View>
                        <Text
                            style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F2F0E8' : '#111827', marginBottom: 10 }}
                            numberOfLines={1}
                        >
                            {`"${request.activityTitle}"`}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => onReject(request)}
                                style={{
                                    flex: 1,
                                    paddingVertical: 8,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)',
                                }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: isDark ? '#9EB294' : '#6B7280' }}>DENY</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => onApprove(request)}
                                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: '#ef4444' }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: '#fff' }}>APPROVE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </View>
        </>
    );
}
