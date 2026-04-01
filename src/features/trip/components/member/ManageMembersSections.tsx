import { RippleButton } from '@/components/RippleButton';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import React from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';

export function RemoveMemberPrompt({
    isDark,
    memberName,
    onCancel,
    onConfirm,
}: {
    isDark: boolean;
    memberName?: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', marginBottom: 12 }}>
                <Feather name="user-minus" size={24} color="#ef4444" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', marginBottom: 4 }}>
                Remove {memberName}?
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                Their activity attributions will remain.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity onPress={onCancel} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 0.5 }}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onConfirm} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#ef4444' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>REMOVE</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export function MembersListSection({
    canManageMembers,
    isDark,
    members,
    onRemove,
    onToggleRole,
}: {
    canManageMembers: boolean;
    isDark: boolean;
    members: any[];
    onRemove: (memberId: string) => void;
    onToggleRole: (memberId: string, nextRole: 'editor' | 'viewer') => void;
}) {
    if (members.length === 0) {
        return (
            <Text style={{ fontSize: 13, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', paddingVertical: 16 }}>
                No members yet
            </Text>
        );
    }

    return (
        <FlatList
            data={members}
            keyExtractor={item => item.id}
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, marginBottom: 6, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.06)' : 'rgba(93, 109, 84, 0.04)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>{item.name}</Text>
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
                                onPress={() => onToggleRole(item.id, item.role === 'viewer' ? 'editor' : 'viewer')}
                                activeOpacity={canManageMembers ? 0.7 : 1}
                                style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, backgroundColor: item.role === 'viewer' ? 'rgba(239, 68, 68, 0.12)' : (isDark ? 'rgba(178, 196, 170, 0.15)' : 'rgba(93, 109, 84, 0.12)') }}
                            >
                                <Text style={{ fontSize: 8, fontWeight: '900', letterSpacing: 0.5, color: item.role === 'viewer' ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54') }}>
                                    {item.role === 'viewer' ? 'VIEW ONLY' : 'EDITOR'}
                                </Text>
                            </TouchableOpacity>
                            {canManageMembers && (
                                <TouchableOpacity onPress={() => onRemove(item.id)} style={{ padding: 6 }}>
                                    <Feather name="user-minus" size={14} color="#ef4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            )}
        />
    );
}

export function ManageMembersInviteSection({
    inviteEmail,
    inviteError,
    inviteRole,
    inviteSent,
    isAdding,
    isAuthenticated,
    isDark,
    isSending,
    qrPayload,
    onBack,
    onChangeEmail,
    onInviteAnother,
    onSelectMode,
    onSelectRole,
    onSendInvite,
    onShareCode,
}: {
    inviteEmail: string;
    inviteError: string;
    inviteRole: 'editor' | 'viewer';
    inviteSent: boolean;
    isAdding: false | 'qr' | 'code' | 'google';
    isAuthenticated: boolean;
    isDark: boolean;
    isSending: boolean;
    qrPayload: string;
    onBack: () => void;
    onChangeEmail: (value: string) => void;
    onInviteAnother: () => void;
    onSelectMode: (mode: 'qr' | 'code' | 'google') => void;
    onSelectRole: (role: 'editor' | 'viewer') => void;
    onSendInvite: () => void;
    onShareCode: () => void;
}) {
    if (isAdding === 'qr') {
        return (
            <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 12 }}>
                    {'Ask them to scan this QR from the "+" menu'}
                </Text>
                <View style={{ padding: 12, backgroundColor: '#FFF', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                    <QRCode value={qrPayload || 'empty'} size={140} color="#111827" backgroundColor="transparent" />
                </View>
                <TouchableOpacity onPress={onBack} style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>DONE</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (isAdding === 'code') {
        return (
            <View style={{ alignItems: 'center', marginTop: 8 }}>
                <TouchableOpacity onPress={onShareCode} style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="share" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 0.5 }}>SHARE INVITE CODE</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onBack} style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(0,0,0,0.1)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>BACK</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (isAdding === 'google') {
        return (
            <View style={{ marginTop: 8 }}>
                {!isAuthenticated ? (
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                        <Feather name="lock" size={28} color={isDark ? '#9EB294' : '#6B7280'} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F2F0E8' : '#111827', marginTop: 10, textAlign: 'center' }}>Sign in required</Text>
                        <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                            Sign in to send email invites. Use QR or invite code instead.
                        </Text>
                    </View>
                ) : inviteSent ? (
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <Feather name="check" size={22} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Invite sent!</Text>
                        <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                            {"They'll see it when they open the app."}
                        </Text>
                        <TouchableOpacity onPress={onInviteAnother} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)' }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#B2C4AA' : '#5D6D54', letterSpacing: 0.5 }}>INVITE ANOTHER</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginBottom: 8 }}>Enter their Google account email.</Text>
                        <TextInput
                            value={inviteEmail}
                            onChangeText={onChangeEmail}
                            placeholder="email@gmail.com"
                            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            autoFocus
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isSending}
                            style={{ fontSize: 14, fontWeight: '700', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, marginBottom: 4, color: isDark ? '#F2F0E8' : '#111827', backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)', borderWidth: 1, borderColor: inviteError ? '#ef4444' : (isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)'), opacity: isSending ? 0.5 : 1 }}
                        />
                        {inviteError ? <Text style={{ fontSize: 10, color: '#ef4444', marginBottom: 8 }}>{inviteError}</Text> : <View style={{ height: 8 }} />}
                        <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5, marginBottom: 6 }}>PERMISSION</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                            {(['editor', 'viewer'] as const).map(role => (
                                <TouchableOpacity key={role} onPress={() => onSelectRole(role)} disabled={isSending} style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: inviteRole === role ? (isDark ? '#B2C4AA' : '#5D6D54') : (isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)'), borderWidth: 1, borderColor: inviteRole === role ? 'transparent' : (isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.1)') }}>
                                    <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.5, color: inviteRole === role ? (isDark ? '#1A1C18' : '#fff') : (isDark ? '#9EB294' : '#6B7280') }}>
                                        {role === 'editor' ? 'EDITOR' : 'VIEW ONLY'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <RippleButton onPress={onSendInvite} disabled={isSending} glowColor={isDark ? 'rgba(178, 196, 170, 0.5)' : 'rgba(93, 109, 84, 0.4)'} style={{ flexDirection: 'row', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', opacity: isSending ? 0.7 : 1, marginBottom: 8 }}>
                            {isSending ? <ActivityIndicator size="small" color={isDark ? '#1A1C18' : '#fff'} /> : <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1, color: isDark ? '#1A1C18' : '#fff' }}>SEND INVITE</Text>}
                        </RippleButton>
                    </>
                )}
                <TouchableOpacity onPress={onBack} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5 }}>BACK</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={{ marginTop: 8, gap: 6 }}>
            <TouchableOpacity onPress={() => onSelectMode('qr')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }}>
                <Feather name="maximize" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 1 }}>INVITE VIA QR</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSelectMode('code')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: isDark ? 'rgba(158,178,148,0.25)' : 'rgba(93,109,84,0.2)' }}>
                <Feather name="hash" size={14} color={isDark ? '#9EB294' : '#5D6D54'} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#5D6D54', letterSpacing: 1 }}>SHARE INVITE CODE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSelectMode('google')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)', backgroundColor: isDark ? 'rgba(158,178,148,0.05)' : 'rgba(93,109,84,0.04)' }}>
                <Feather name="mail" size={14} color={isDark ? '#9EB294' : '#5D6D54'} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#9EB294' : '#5D6D54', letterSpacing: 1 }}>ADD VIA GOOGLE</Text>
            </TouchableOpacity>
        </View>
    );
}
