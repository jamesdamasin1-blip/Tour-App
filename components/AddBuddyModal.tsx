import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, FlatList, Share, Alert, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useStore } from '@/src/store/useStore';
import { useAuth } from '@/src/hooks/useAuth';
import { GlassView } from './GlassView';
import QRCode from 'react-native-qrcode-svg';
import { base64Encode } from '@/src/utils/base64';
import { getFlagUrl } from '@/src/data/countryMapping';

interface AddBuddyModalProps {
    visible: boolean;
    onClose: () => void;
    onScanQR?: () => void;
}

type Step = 'trip' | 'method' | 'qr' | 'code' | 'email';

export const AddBuddyModal = ({ visible, onClose, onScanQR }: AddBuddyModalProps) => {
    const { theme, trips, activities, sendEmailInvite } = useStore();
    const { userId, email: userEmail, displayName, isAuthenticated } = useAuth();
    const isDark = theme === 'dark';

    const [step, setStep] = useState<Step>('trip');
    const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);
    const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');

    const handleClose = () => {
        setStep('trip');
        setSelectedTripId(null);
        setCode('');
        setEmail('');
        setError('');
        setInviteSent(false);
        setInviteRole('editor');
        onClose();
    };

    const selectedTrip = trips.find(t => t.id === selectedTripId);

    const handleSelectTrip = (tripId: string) => {
        setSelectedTripId(tripId);
        setStep('method');
    };

    const getEncodedData = () => {
        if (!selectedTrip) return '';
        const tripActivities = activities.filter(a => a.tripId === selectedTrip.id);
        const shareData = {
            ...selectedTrip,
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
        if (!selectedTrip) return '';
        const slimWallets = (selectedTrip.wallets || []).map((w: any) => ({
            id: w.id, tripId: w.tripId, currency: w.currency,
            totalBudget: w.totalBudget, spentAmount: w.spentAmount || 0,
            defaultRate: w.defaultRate, baselineExchangeRate: w.baselineExchangeRate,
            createdAt: w.createdAt, version: w.version || 1,
        }));
        const slim = {
            id: selectedTrip.id, title: selectedTrip.title, homeCurrency: selectedTrip.homeCurrency,
            countries: selectedTrip.countries, startDate: selectedTrip.startDate, endDate: selectedTrip.endDate,
            totalBudget: selectedTrip.totalBudget, totalBudgetHomeCached: selectedTrip.totalBudgetHomeCached,
            lastModified: selectedTrip.lastModified || Date.now(),
            members: (selectedTrip.members || []).map((m: any) => ({
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
            const shareMessage = `Hey! Join my trip "${selectedTrip?.title}" on Aliqual.\n\nCopy this code and select the "+" icon in the My Trips screen:\n\n${encodedData}`;
            await Share.share({ message: shareMessage, title: `Join ${selectedTrip?.title}` });
        } catch {
            Alert.alert('Error', 'Failed to share invite code.');
        }
    };

    const handleEmailInvite = async () => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
            setError('Enter a valid email address');
            return;
        }
        if (trimmed === userEmail?.toLowerCase()) {
            setError("You can't invite yourself");
            return;
        }
        if (!isAuthenticated || !userId) {
            setError('Sign in to send email invites');
            return;
        }
        if (!selectedTrip) return;

        setIsSendingInvite(true);
        setError('');
        try {
            await sendEmailInvite({
                tripId: selectedTrip.id,
                tripTitle: selectedTrip.title,
                toEmail: trimmed,
                fromUserId: userId,
                fromDisplayName: displayName,
                fromEmail: userEmail,
                role: inviteRole,
            });
            setInviteSent(true);
            setEmail('');
        } catch (err: any) {
            setError(err.message || 'Failed to send invite');
        } finally {
            setIsSendingInvite(false);
        }
    };

    const activeTrips = trips.filter(t => !t.isCompleted);

    const goBack = () => {
        if (step === 'qr' || step === 'code' || step === 'email') setStep('method');
        else if (step === 'method') setStep('trip');
        else handleClose();
    };

    const getTitle = () => {
        switch (step) {
            case 'trip': return 'SELECT TRIP';
            case 'method': return 'ADD MEMBER';
            case 'qr': return 'SHOW QR CODE';
            case 'code': return 'SHARE CODE';
            case 'email': return 'INVITE BY EMAIL';
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <View style={{ flex: 1 }}>
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                <TouchableOpacity style={[StyleSheet.absoluteFill]} activeOpacity={1} onPress={handleClose} />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }} pointerEvents="box-none">
                <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 380 }}>
                    <GlassView
                        intensity={isDark ? 80 : 90}
                        borderRadius={36}
                        backgroundColor={isDark ? "rgba(30, 34, 28, 0.88)" : "rgba(255, 255, 255, 0.88)"}
                        borderColor={isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)'}
                        style={{ width: '100%', padding: 24 }}
                    >
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {step !== 'trip' && (
                                    <TouchableOpacity onPress={goBack} style={{ marginRight: 10 }}>
                                        <Feather name="arrow-left" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                    </TouchableOpacity>
                                )}
                                <Text style={{ fontSize: step === 'trip' ? 13 : 16, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                                    {getTitle()}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                                <Feather name="x" size={20} color={isDark ? '#9EB294' : '#6B7280'} />
                            </TouchableOpacity>
                        </View>

                        {step === 'trip' && (
                            <View>
                                {activeTrips.length === 0 ? (
                                    <Text style={{ fontSize: 13, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', paddingVertical: 20 }}>
                                        No active trips
                                    </Text>
                                ) : (
                                    <FlatList
                                        data={activeTrips}
                                        keyExtractor={item => item.id}
                                        style={{ maxHeight: 340 }}
                                        scrollEnabled={activeTrips.length > 3}
                                        renderItem={({ item }) => {
                                            const flagUrl = item.countries?.[0] ? getFlagUrl(item.countries[0]) : null;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => handleSelectTrip(item.id)}
                                                    style={{
                                                        paddingVertical: 18, paddingHorizontal: 18,
                                                        borderRadius: 20, marginBottom: 10,
                                                        backgroundColor: isDark ? 'rgba(93, 109, 84, 0.18)' : 'rgba(93, 109, 84, 0.07)',
                                                        borderWidth: 1,
                                                        borderColor: isDark ? 'rgba(178,196,170,0.2)' : 'rgba(93,109,84,0.18)',
                                                        flexDirection: 'row', alignItems: 'center',
                                                        shadowColor: '#000',
                                                        shadowOffset: { width: 0, height: 2 },
                                                        shadowOpacity: 0.06,
                                                        shadowRadius: 6,
                                                        elevation: 0,
                                                    }}
                                                    activeOpacity={0.8}
                                                >
                                                    {flagUrl && (
                                                        <View style={{
                                                            width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
                                                            marginRight: 14, flexShrink: 0,
                                                        }}>
                                                            <Image source={{ uri: flagUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                            {item.title}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#9EB294' : '#6B7280', marginTop: 3 }}>
                                                            {item.countries?.join(', ')}{item.members?.length ? ` · ${item.members.length} member${item.members.length !== 1 ? 's' : ''}` : ''}
                                                        </Text>
                                                    </View>
                                                    <Feather name="chevron-right" size={16} color={isDark ? 'rgba(178,196,170,0.4)' : 'rgba(93,109,84,0.3)'} />
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                )}
                            </View>
                        )}

                            {step === 'method' && (
                                <View>
                                    <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                                        They must have the app installed. Choose how to invite them:
                                    </Text>

                                            {/* QR Code */}
                                            <TouchableOpacity
                                                onPress={() => setStep('qr')}
                                                style={methodBtnStyle(isDark)}
                                            >
                                                <View style={methodIconStyle}>
                                                    <Feather name="maximize" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Show QR Code</Text>
                                                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>They scan to join instantly</Text>
                                                </View>
                                                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
                                            </TouchableOpacity>

                                            {/* Invite Code */}
                                            <TouchableOpacity
                                                onPress={() => setStep('code')}
                                                style={methodBtnStyle(isDark)}
                                            >
                                                <View style={methodIconStyle}>
                                                    <Feather name="hash" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Share Invite Code</Text>
                                                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>Send via message or any app</Text>
                                                </View>
                                                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
                                            </TouchableOpacity>

                                            {/* Email */}
                                            <TouchableOpacity
                                                onPress={() => setStep('email')}
                                                style={methodBtnStyle(isDark)}
                                            >
                                                <View style={methodIconStyle}>
                                                    <Feather name="mail" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Invite by Email</Text>
                                                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>Send invite to their email</Text>
                                                </View>
                                                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
                                            </TouchableOpacity>
                                </View>
                            )}

                            {step === 'qr' && (
                                <View style={{ alignItems: 'center' }}>
                                    <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                                        Ask them to open the app and scan this QR from the "+" menu on their My Trips screen
                                    </Text>
                                    <View style={{
                                        padding: 16, backgroundColor: '#FFF', borderRadius: 24,
                                        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                                        shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
                                    }}>
                                        <QRCode
                                            value={getQRPayload() || 'empty'}
                                            size={180}
                                            color={isDark ? '#111827' : '#111827'}
                                            backgroundColor="transparent"
                                        />
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleShareCode}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                            paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, marginTop: 16,
                                            backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                                        }}
                                    >
                                        <Feather name="share" size={14} color={isDark ? '#1A1C18' : '#fff'} style={{ marginRight: 6 }} />
                                        <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#1A1C18' : '#fff', letterSpacing: 0.5 }}>
                                            ALSO SHARE AS TEXT
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {step === 'code' && (
                                <View style={{ alignItems: 'center' }}>
                                    <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                                        Share this invite code with them. They can paste it via the "+" menu on their My Trips screen.
                                    </Text>
                                    <TouchableOpacity
                                        onPress={handleShareCode}
                                        style={{
                                            paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, alignItems: 'center',
                                            backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', width: '100%',
                                        }}
                                    >
                                        <Feather name="share" size={16} color={isDark ? '#1A1C18' : '#fff'} />
                                        <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 1.5, color: isDark ? '#1A1C18' : '#fff', marginTop: 6 }}>
                                            SHARE INVITE CODE
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {step === 'email' && (
                                <View>
                                    {!isAuthenticated ? (
                                        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                                            <Feather name="lock" size={28} color={isDark ? '#9EB294' : '#6B7280'} />
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F2F0E8' : '#111827', marginTop: 12, textAlign: 'center' }}>
                                                Sign in required
                                            </Text>
                                            <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                                                You need to be signed in to send email invites. Use QR or invite code instead.
                                            </Text>
                                        </View>
                                    ) : inviteSent ? (
                                        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                                            <View style={{
                                                width: 48, height: 48, borderRadius: 24,
                                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.1)',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Feather name="check" size={24} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                            </View>
                                            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', marginTop: 12 }}>
                                                Invite sent!
                                            </Text>
                                            <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginTop: 4 }}>
                                                They'll see it when they open the app. You can also share a code as backup.
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => { setInviteSent(false); }}
                                                style={{
                                                    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 16,
                                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)',
                                                }}
                                            >
                                                <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#B2C4AA' : '#5D6D54', letterSpacing: 0.5 }}>
                                                    INVITE ANOTHER
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <>
                                            <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 12 }}>
                                                Enter their email. They'll see the invite when they open the app.
                                            </Text>
                                            <TextInput
                                                value={email}
                                                onChangeText={(t) => { setEmail(t); setError(''); }}
                                                placeholder="email@example.com"
                                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                                autoFocus
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                editable={!isSendingInvite}
                                                style={{
                                                    fontSize: 16, fontWeight: '700', paddingVertical: 14, paddingHorizontal: 16,
                                                    borderRadius: 16, marginBottom: 4,
                                                    color: isDark ? '#F2F0E8' : '#111827',
                                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)',
                                                    borderWidth: 1,
                                                    borderColor: error ? '#ef4444' : (isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)'),
                                                    opacity: isSendingInvite ? 0.5 : 1,
                                                }}
                                            />
                                            {error ? (
                                                <Text style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{error}</Text>
                                            ) : <View style={{ height: 8 }} />}

                                            {/* Role selector */}
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 0.5, marginBottom: 6 }}>
                                                PERMISSION
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                                <TouchableOpacity
                                                    onPress={() => setInviteRole('editor')}
                                                    disabled={isSendingInvite}
                                                    style={{
                                                        flex: 1, paddingVertical: 10, borderRadius: 12,
                                                        alignItems: 'center', justifyContent: 'center',
                                                        backgroundColor: inviteRole === 'editor'
                                                            ? (isDark ? '#B2C4AA' : '#5D6D54')
                                                            : (isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)'),
                                                        borderWidth: 1,
                                                        borderColor: inviteRole === 'editor'
                                                            ? 'transparent'
                                                            : (isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.1)'),
                                                    }}
                                                >
                                                    <Feather
                                                        name="edit-3"
                                                        size={14}
                                                        color={inviteRole === 'editor'
                                                            ? (isDark ? '#1A1C18' : '#fff')
                                                            : (isDark ? '#9EB294' : '#6B7280')}
                                                        style={{ marginBottom: 2 }}
                                                    />
                                                    <Text style={{
                                                        fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
                                                        color: inviteRole === 'editor'
                                                            ? (isDark ? '#1A1C18' : '#fff')
                                                            : (isDark ? '#9EB294' : '#6B7280'),
                                                    }}>
                                                        EDITOR
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => setInviteRole('viewer')}
                                                    disabled={isSendingInvite}
                                                    style={{
                                                        flex: 1, paddingVertical: 10, borderRadius: 12,
                                                        alignItems: 'center', justifyContent: 'center',
                                                        backgroundColor: inviteRole === 'viewer'
                                                            ? (isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)')
                                                            : (isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.06)'),
                                                        borderWidth: 1,
                                                        borderColor: inviteRole === 'viewer'
                                                            ? (isDark ? 'rgba(178,196,170,0.3)' : 'rgba(93,109,84,0.25)')
                                                            : (isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.1)'),
                                                    }}
                                                >
                                                    <Feather
                                                        name="eye"
                                                        size={14}
                                                        color={inviteRole === 'viewer' ? (isDark ? '#B2C4AA' : '#5D6D54') : (isDark ? '#9EB294' : '#6B7280')}
                                                        style={{ marginBottom: 2 }}
                                                    />
                                                    <Text style={{
                                                        fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
                                                        color: inviteRole === 'viewer' ? (isDark ? '#B2C4AA' : '#5D6D54') : (isDark ? '#9EB294' : '#6B7280'),
                                                    }}>
                                                        VIEW ONLY
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            <TouchableOpacity
                                                onPress={handleEmailInvite}
                                                disabled={isSendingInvite}
                                                style={{
                                                    flexDirection: 'row',
                                                    paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: isDark ? '#B2C4AA' : '#5D6D54',
                                                    opacity: isSendingInvite ? 0.7 : 1,
                                                }}
                                            >
                                                {isSendingInvite ? (
                                                    <ActivityIndicator size="small" color={isDark ? '#1A1C18' : '#fff'} />
                                                ) : (
                                                    <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 1.5, color: isDark ? '#1A1C18' : '#fff' }}>
                                                        SEND INVITE
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            )}

                    </GlassView>
                </TouchableOpacity>
            </View>
            </View>
        </Modal>
    );
};

const methodBtnStyle = (isDark: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)',
});

const methodIconStyle = {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(93, 109, 84, 0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
};
