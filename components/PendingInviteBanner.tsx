import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, AppState } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStore } from '@/src/store/useStore';
import { useAuth } from '@/src/hooks/useAuth';
import { inviteService } from '@/src/services/inviteService';
import { TripInvite } from '@/src/types/models';

export const PendingInviteBanner = () => {
    const { email, isAuthenticated } = useAuth();
    const { theme, invites, loadReceivedInvites, acceptInvite, declineInvite, addRealtimeInvite } = useStore();
    const isDark = theme === 'dark';
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !email) return;
        loadReceivedInvites(email);

        const unsubscribe = inviteService.subscribeToInvites(email, (invite) => {
            addRealtimeInvite(invite);
        });

        // Re-fetch when app comes back to the foreground
        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') loadReceivedInvites(email);
        });

        return () => {
            unsubscribe();
            appStateSub.remove();
        };
    }, [isAuthenticated, email]);

    const pendingInvites = invites.filter(i => i.status === 'pending');

    if (!isAuthenticated || pendingInvites.length === 0) return null;

    const handleAccept = async (invite: TripInvite) => {
        setProcessingId(invite.id);
        try {
            await acceptInvite(invite.id);
        } catch (err: any) {
            Alert.alert('Failed to join', err?.message || 'Something went wrong. Please try again.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDecline = async (invite: TripInvite) => {
        setProcessingId(invite.id);
        try {
            await declineInvite(invite.id);
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to decline invite.');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <View style={{ marginBottom: 8 }}>
            {pendingInvites.map(invite => (
                <View
                    key={invite.id}
                    style={{
                        borderRadius: 20,
                        padding: 16,
                        marginBottom: 8,
                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(93, 109, 84, 0.07)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(178, 196, 170, 0.2)' : 'rgba(93, 109, 84, 0.12)',
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <View style={{
                            width: 32, height: 32, borderRadius: 16,
                            backgroundColor: isDark ? 'rgba(178, 196, 170, 0.15)' : 'rgba(93, 109, 84, 0.1)',
                            alignItems: 'center', justifyContent: 'center', marginRight: 10,
                        }}>
                            <Feather name="mail" size={14} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{
                                fontSize: 13, fontWeight: '800',
                                color: isDark ? '#F2F0E8' : '#111827',
                                textTransform: 'uppercase',
                            }}>
                                {invite.tripTitle}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 6 }}>
                                <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280' }}>
                                    from {invite.fromDisplayName || invite.fromEmail || 'a friend'}
                                </Text>
                                <View style={{
                                    paddingVertical: 1, paddingHorizontal: 6, borderRadius: 6,
                                    backgroundColor: invite.role === 'viewer'
                                        ? 'rgba(239, 68, 68, 0.12)'
                                        : 'rgba(34, 197, 94, 0.12)',
                                }}>
                                    <Text style={{
                                        fontSize: 7, fontWeight: '900', letterSpacing: 0.5,
                                        color: invite.role === 'viewer' ? '#ef4444' : '#22c55e',
                                    }}>
                                        {invite.role === 'viewer' ? 'VIEW ONLY' : 'EDITOR'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {processingId === invite.id ? (
                        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                            <ActivityIndicator size="small" color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                    ) : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => handleAccept(invite)}
                                style={{
                                    flex: 1, paddingVertical: 10, borderRadius: 12,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                                }}
                            >
                                <Text style={{
                                    fontSize: 11, fontWeight: '900', letterSpacing: 1,
                                    color: isDark ? '#1A1C18' : '#fff',
                                }}>
                                    JOIN
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleDecline(invite)}
                                style={{
                                    flex: 1, paddingVertical: 10, borderRadius: 12,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.1)',
                                }}
                            >
                                <Text style={{
                                    fontSize: 11, fontWeight: '900', letterSpacing: 1,
                                    color: isDark ? '#9EB294' : '#6B7280',
                                }}>
                                    DECLINE
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            ))}
        </View>
    );
};
