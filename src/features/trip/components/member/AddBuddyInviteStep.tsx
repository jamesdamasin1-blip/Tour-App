import { RippleButton } from '@/components/RippleButton';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Step = 'qr' | 'code' | 'email';

type AddBuddyInviteStepProps = {
    email: string;
    error: string;
    inviteRole: 'editor' | 'viewer';
    inviteSent: boolean;
    isAuthenticated: boolean;
    isDark: boolean;
    isSendingInvite: boolean;
    qrPayload: string;
    step: Step;
    onChangeEmail: (value: string) => void;
    onInviteAnother: () => void;
    onSelectRole: (role: 'editor' | 'viewer') => void;
    onSendInvite: () => void;
    onShareCode: () => void;
};

export function AddBuddyInviteStep({
    email,
    error,
    inviteRole,
    inviteSent,
    isAuthenticated,
    isDark,
    isSendingInvite,
    qrPayload,
    step,
    onChangeEmail,
    onInviteAnother,
    onSelectRole,
    onSendInvite,
    onShareCode,
}: AddBuddyInviteStepProps) {
    if (step === 'qr') {
        return (
            <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                    {'Ask them to open the app and scan this QR from the "+" menu on their My Trips screen'}
                </Text>
                <View style={{ padding: 16, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 }}>
                    <QRCode value={qrPayload || 'empty'} size={180} color="#111827" backgroundColor="transparent" />
                </View>
                <TouchableOpacity onPress={onShareCode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, marginTop: 16, backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }}>
                    <Feather name="share" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '900', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 0.5 }}>
                        ALSO SHARE AS TEXT
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (step === 'code') {
        return (
            <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                    {'Share this invite code with them. They can paste it via the "+" menu on their My Trips screen.'}
                </Text>
                <TouchableOpacity onPress={onShareCode} style={{ paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, alignItems: 'center', backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', width: '100%' }}>
                    <Feather name="share" size={16} color={isDark ? '#1A1C18' : '#fff'} />
                    <Text style={{ fontSize: 13, fontWeight: '900', letterSpacing: 1.5, color: isDark ? '#1A1C18' : '#fff', marginTop: 6 }}>
                        SHARE INVITE CODE
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!isAuthenticated) {
        return (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Feather name="lock" size={28} color={isDark ? '#9EB294' : '#6B7280'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F2F0E8' : '#111827', marginTop: 12, textAlign: 'center' }}>
                    Sign in required
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                    You need to be signed in to send email invites. Use QR or invite code instead.
                </Text>
            </View>
        );
    }

    if (inviteSent) {
        return (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={24} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', marginTop: 12 }}>
                    Invite sent!
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                    {"They'll see it when they open the app. You can also share a code as backup."}
                </Text>
                <TouchableOpacity onPress={onInviteAnother} style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 16, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#B2C4AA' : '#5D6D54', letterSpacing: 0.5 }}>
                        INVITE ANOTHER
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 12 }}>
                {"Enter their email. They'll see the invite when they open the app."}
            </Text>
            <TextInput
                value={email}
                onChangeText={onChangeEmail}
                placeholder="email@example.com"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                autoFocus
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isSendingInvite}
                style={{ fontSize: 16, fontWeight: '700', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, marginBottom: 4, color: isDark ? '#F2F0E8' : '#111827', backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)', borderWidth: 1, borderColor: error ? '#ef4444' : (isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)'), opacity: isSendingInvite ? 0.5 : 1 }}
            />
            {error ? <Text style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{error}</Text> : <View style={{ height: 8 }} />}
            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5, marginBottom: 6 }}>
                PERMISSION
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <RoleCard active={inviteRole === 'editor'} icon="edit-3" isDark={isDark} label="EDITOR" onPress={() => onSelectRole('editor')} />
                <RoleCard active={inviteRole === 'viewer'} icon="eye" isDark={isDark} label="VIEW ONLY" onPress={() => onSelectRole('viewer')} viewer />
            </View>
            <RippleButton onPress={onSendInvite} disabled={isSendingInvite} glowColor={isDark ? 'rgba(178, 196, 170, 0.5)' : 'rgba(93, 109, 84, 0.4)'} style={{ flexDirection: 'row', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', opacity: isSendingInvite ? 0.7 : 1 }}>
                {isSendingInvite ? <ActivityIndicator size="small" color={isDark ? '#1A1C18' : '#fff'} /> : <Text style={{ fontSize: 13, fontWeight: '900', letterSpacing: 1.5, color: isDark ? '#1A1C18' : '#fff' }}>SEND INVITE</Text>}
            </RippleButton>
        </View>
    );
}

function RoleCard({
    active,
    icon,
    isDark,
    label,
    onPress,
    viewer = false,
}: {
    active: boolean;
    icon: 'edit-3' | 'eye';
    isDark: boolean;
    label: string;
    onPress: () => void;
    viewer?: boolean;
}) {
    const activeBg = viewer ? (isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)') : (isDark ? '#B2C4AA' : '#5D6D54');
    const activeBorder = viewer ? (isDark ? 'rgba(178,196,170,0.3)' : 'rgba(93,109,84,0.25)') : 'transparent';
    const activeText = viewer ? (isDark ? '#B2C4AA' : '#5D6D54') : (isDark ? '#1A1C18' : '#fff');

    return (
        <TouchableOpacity
            onPress={onPress}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? activeBg : (isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)'), borderWidth: 1, borderColor: active ? activeBorder : (isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.1)') }}
        >
            <Feather name={icon} size={14} color={active ? activeText : (isDark ? '#9EB294' : '#6B7280')} style={{ marginBottom: 2 }} />
            <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: active ? activeText : (isDark ? '#9EB294' : '#6B7280') }}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}
