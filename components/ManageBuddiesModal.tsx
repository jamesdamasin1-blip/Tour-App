import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, FlatList, Share, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useStore } from '@/src/store/useStore';
import { GlassView } from './GlassView';
import { TripMember } from '@/src/types/models';
import { usePermissions } from '@/src/hooks/usePermissions';
import QRCode from 'react-native-qrcode-svg';
import { base64Encode } from '@/src/utils/base64';
import { runSync } from '@/src/sync/syncEngine';

interface ManageMembersModalProps {
    tripId: string;
    visible: boolean;
    onClose: () => void;
}

/** @deprecated Use ManageMembersModal */
export const ManageBuddiesModal = ManageMembersModal;

export function ManageMembersModal({ tripId, visible, onClose }: ManageMembersModalProps) {
    const { theme, trips, removeMember, updateMemberRole, activities, expenses } = useStore();
    const isDark = theme === 'dark';
    const trip = trips.find(t => t.id === tripId);
    const members = (trip?.members || []).filter(m => !(m as any).removed);
    const { canManageMembers } = usePermissions(tripId);

    const [isAdding, setIsAdding] = useState<false | 'qr' | 'code'>(false);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Pull latest members from server whenever modal opens
    useEffect(() => {
        if (visible) {
            setIsSyncing(true);
            runSync().finally(() => setIsSyncing(false));
        }
    }, [visible]);

    const getEncodedData = () => {
        if (!trip) return '';
        const tripActivities = activities.filter(a => a.tripId === trip.id);
        const shareData = {
            ...trip,
            role: 'admin',
            activities: tripActivities,
            sharedAt: Date.now(),
            source: 'OrbitalGalileo',
            isCloudSynced: true,
        };
        return base64Encode(JSON.stringify(shareData));
    };

    // Slim payload for QR — strips lots and activities to avoid QR size limit
    const getQRPayload = () => {
        if (!trip) return '';
        const slimWallets = (trip.wallets || []).map((w: any) => ({
            id: w.id, tripId: w.tripId, currency: w.currency,
            totalBudget: w.totalBudget, spentAmount: w.spentAmount || 0,
            defaultRate: w.defaultRate, baselineExchangeRate: w.baselineExchangeRate,
            createdAt: w.createdAt, version: w.version || 1,
        }));
        const slim = {
            id: trip.id, title: trip.title, homeCurrency: trip.homeCurrency,
            countries: trip.countries, startDate: trip.startDate, endDate: trip.endDate,
            totalBudget: trip.totalBudget, totalBudgetHomeCached: trip.totalBudgetHomeCached,
            lastModified: trip.lastModified || Date.now(),
            members: (trip.members || []).map((m: any) => ({
                id: m.id, name: m.name, color: m.color, isCreator: m.isCreator, role: m.role, userId: m.userId,
            })),
            wallets: slimWallets,
            role: 'admin', source: 'OrbitalGalileo', isCloudSynced: true, sharedAt: Date.now(),
        };
        return base64Encode(JSON.stringify(slim));
    };

    const handleShareCode = async () => {
        try {
            const encodedData = getEncodedData();
            const msg = `Hey! Join my trip "${trip?.title}" on Aliqual.\n\nCopy this code and select the "+" icon:\n\n${encodedData}`;
            await Share.share({ message: msg, title: `Join ${trip?.title}` });
        } catch { }
    };

    const handleRemove = () => {
        if (removingId) {
            removeMember(tripId, removingId);
            setRemovingId(null);
        }
    };

    const handleClose = () => {
        setIsAdding(false);
        setRemovingId(null);
        onClose();
    };

    const removingMember = members.find(m => m.id === removingId);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
            <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }} activeOpacity={1} onPress={handleClose}>
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                        <GlassView
                            intensity={isDark ? 30 : 90}
                            borderRadius={32}
                            backgroundColor={isDark ? "rgba(40, 44, 38, 0.97)" : "rgba(255, 255, 255, 0.97)"}
                            style={{ width: 320, padding: 28 }}
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 1 }}>
                                        MEMBERS
                                    </Text>
                                    {isSyncing && (
                                        <Feather name="refresh-cw" size={12} color={isDark ? '#9EB294' : '#6B7280'} />
                                    )}
                                </View>
                                <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                                    <Feather name="x" size={20} color={isDark ? '#9EB294' : '#6B7280'} />
                                </TouchableOpacity>
                            </View>

                            {removingId ? (
                                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                    <View style={{
                                        width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)', marginBottom: 12,
                                    }}>
                                        <Feather name="user-minus" size={24} color="#ef4444" />
                                    </View>
                                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', marginBottom: 4 }}>
                                        Remove {removingMember?.name}?
                                    </Text>
                                    <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                                        Their activity attributions will remain.
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                        <TouchableOpacity
                                            onPress={() => setRemovingId(null)}
                                            style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 0.5 }}>CANCEL</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleRemove}
                                            style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#ef4444' }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>REMOVE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <>
                                    {members.length === 0 ? (
                                        <Text style={{ fontSize: 13, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', paddingVertical: 16 }}>
                                            No members yet
                                        </Text>
                                    ) : (
                                        <FlatList
                                            data={members}
                                            keyExtractor={item => item.id}
                                            style={{ maxHeight: 250 }}
                                            renderItem={({ item }) => (
                                                <View style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                                    paddingVertical: 10, paddingHorizontal: 12,
                                                    borderRadius: 14, marginBottom: 6,
                                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.06)' : 'rgba(93, 109, 84, 0.04)',
                                                }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 10 }} />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>
                                                                {item.name}
                                                            </Text>
                                                            {item.isCreator && (
                                                                <Text style={{ fontSize: 8, fontWeight: '700', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5, marginTop: 1 }}>
                                                                    OWNER
                                                                </Text>
                                                            )}
                                                        </View>
                                                    </View>
                                                    {!item.isCreator && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <TouchableOpacity
                                                                onPress={() => canManageMembers && updateMemberRole(tripId, item.id, item.role === 'viewer' ? 'editor' : 'viewer')}
                                                                activeOpacity={canManageMembers ? 0.7 : 1}
                                                                style={{
                                                                    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8,
                                                                    backgroundColor: item.role === 'viewer'
                                                                        ? 'rgba(239, 68, 68, 0.12)'
                                                                        : (isDark ? 'rgba(178, 196, 170, 0.15)' : 'rgba(93, 109, 84, 0.12)'),
                                                                }}
                                                            >
                                                                <Text style={{
                                                                    fontSize: 8, fontWeight: '900', letterSpacing: 0.5,
                                                                    color: item.role === 'viewer' ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54'),
                                                                }}>
                                                                    {item.role === 'viewer' ? 'VIEW ONLY' : 'EDITOR'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                            {canManageMembers && (
                                                                <TouchableOpacity onPress={() => setRemovingId(item.id)} style={{ padding: 6 }}>
                                                                    <Feather name="user-minus" size={14} color="#ef4444" />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        />
                                    )}

                                    {/* Invite member */}
                                    {isAdding === 'qr' ? (
                                        <View style={{ alignItems: 'center', marginTop: 8 }}>
                                            <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 12 }}>
                                                Ask them to scan this QR from the "+" menu
                                            </Text>
                                            <View style={{ padding: 12, backgroundColor: '#FFF', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                                                <QRCode value={getQRPayload() || 'empty'} size={140} color="#111827" backgroundColor="transparent" />
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setIsAdding(false)}
                                                style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}
                                            >
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>DONE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : isAdding === 'code' ? (
                                        <View style={{ alignItems: 'center', marginTop: 8 }}>
                                            <TouchableOpacity
                                                onPress={handleShareCode}
                                                style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', flexDirection: 'row', alignItems: 'center' }}
                                            >
                                                <Feather name="share" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                                                <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 0.5 }}>SHARE INVITE CODE</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => setIsAdding(false)}
                                                style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}
                                            >
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>BACK</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View style={{ marginTop: 8, gap: 6 }}>
                                            <TouchableOpacity
                                                onPress={() => setIsAdding('qr')}
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                                    paddingVertical: 12, borderRadius: 14,
                                                    backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                                                }}
                                            >
                                                <Feather name="maximize" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 1 }}>INVITE VIA QR</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => setIsAdding('code')}
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                                    paddingVertical: 12, borderRadius: 14,
                                                    borderWidth: 1, borderStyle: 'dashed',
                                                    borderColor: isDark ? 'rgba(158,178,148,0.25)' : 'rgba(93,109,84,0.2)',
                                                }}
                                            >
                                                <Feather name="hash" size={14} color={isDark ? '#9EB294' : '#5D6D54'} style={{ marginRight: 6 }} />
                                                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#5D6D54', letterSpacing: 1 }}>SHARE INVITE CODE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </>
                            )}
                    </GlassView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}
