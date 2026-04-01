import { AnimatedModal } from './AnimatedModal';
import { GlassView } from './GlassView';
import { usePermissions } from '@/src/hooks/usePermissions';
import { useAuth } from '@/src/hooks/useAuth';
import { useStore } from '@/src/store/useStore';
import { refreshTripCloudState } from '@/src/store/cloudSyncHelpers';
import { getDisplayTripMembers } from '@/src/utils/memberAttribution';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import { ManageMembersInviteSection, MembersListSection, RemoveMemberPrompt } from '@/src/features/trip/components/member/ManageMembersSections';
import { buildTripShareCode, buildTripShareQrPayload } from '@/src/features/trip/components/member/memberSharePayload';

interface ManageMembersModalProps {
    tripId: string;
    visible: boolean;
    onClose: () => void;
}

/** @deprecated Use ManageMembersModal */
export const ManageBuddiesModal = ManageMembersModal;

export function ManageMembersModal({ tripId, visible, onClose }: ManageMembersModalProps) {
    const { theme, trips, removeMember, updateMemberRole, activities, sendEmailInvite } = useStore();
    const { userId, email: userEmail, displayName, isAuthenticated } = useAuth();
    const isDark = theme === 'dark';
    const trip = trips.find(item => item.id === tripId);
    const members = getDisplayTripMembers(trip).filter(member => !(member as any).removed);
    const { canManageMembers } = usePermissions(tripId);

    const [isAdding, setIsAdding] = useState<false | 'qr' | 'code' | 'google'>(false);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
    const [isSending, setIsSending] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);
    const [inviteError, setInviteError] = useState('');

    useEffect(() => {
        if (!visible) return;
        setIsAdding(false);
        setInviteEmail('');
        setInviteRole('editor');
        setIsSending(false);
        setInviteSent(false);
        setInviteError('');
        setRemovingId(null);
        setIsSyncing(true);
        refreshTripCloudState(tripId).finally(() => setIsSyncing(false));
    }, [tripId, visible]);

    const handleShareCode = async () => {
        try {
            const encodedData = buildTripShareCode(trip, activities);
            const message = `Hey! Join my trip "${trip?.title}" on Aliqual.\n\nCopy this code and select the "+" icon:\n\n${encodedData}`;
            await Share.share({ message, title: `Join ${trip?.title}` });
        } catch {
            // no-op
        }
    };

    const handleRemove = () => {
        if (!removingId) return;
        removeMember(tripId, removingId);
        setRemovingId(null);
    };

    const handleEmailInvite = async () => {
        const trimmed = inviteEmail.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@')) {
            setInviteError('Enter a valid email address.');
            return;
        }

        setIsSending(true);
        setInviteError('');
        try {
            await sendEmailInvite({
                tripId,
                tripTitle: trip?.title || '',
                toEmail: trimmed,
                fromUserId: userId || '',
                fromDisplayName: displayName || null,
                fromEmail: userEmail || null,
                role: inviteRole,
            });
            setInviteSent(true);
            setInviteEmail('');
        } catch (error: any) {
            setInviteError(error?.message || 'Failed to send invite. Try again.');
        } finally {
            setIsSending(false);
        }
    };

    const handleClose = () => {
        setIsAdding(false);
        setRemovingId(null);
        setInviteEmail('');
        setInviteError('');
        setInviteSent(false);
        setInviteRole('editor');
        onClose();
    };

    const handleBackFromAdding = () => {
        setIsAdding(false);
        setInviteEmail('');
        setInviteError('');
        setInviteSent(false);
        setInviteRole('editor');
    };

    const removingMember = members.find(member => member.id === removingId);

    return (
        <AnimatedModal visible={visible} onClose={handleClose}>
            <GlassView
                intensity={isDark ? 30 : 90}
                borderRadius={32}
                backgroundColor={isDark ? 'rgba(40, 44, 38, 0.97)' : 'rgba(255, 255, 255, 0.97)'}
                style={{ width: 320, padding: 28, alignSelf: 'center' }}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 1 }}>
                            MEMBERS
                        </Text>
                        {isSyncing && <Feather name="refresh-cw" size={12} color={isDark ? '#9EB294' : '#6B7280'} />}
                    </View>
                    <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                        <Feather name="x" size={20} color={isDark ? '#9EB294' : '#6B7280'} />
                    </TouchableOpacity>
                </View>

                {removingId ? (
                    <RemoveMemberPrompt
                        isDark={isDark}
                        memberName={removingMember?.name}
                        onCancel={() => setRemovingId(null)}
                        onConfirm={handleRemove}
                    />
                ) : (
                    <>
                        <MembersListSection
                            canManageMembers={canManageMembers}
                            isDark={isDark}
                            members={members}
                            onRemove={setRemovingId}
                            onToggleRole={(memberId, role) => canManageMembers && updateMemberRole(tripId, memberId, role)}
                        />

                        <ManageMembersInviteSection
                            inviteEmail={inviteEmail}
                            inviteError={inviteError}
                            inviteRole={inviteRole}
                            inviteSent={inviteSent}
                            isAdding={isAdding}
                            isAuthenticated={isAuthenticated}
                            isDark={isDark}
                            isSending={isSending}
                            qrPayload={buildTripShareQrPayload(trip)}
                            onBack={handleBackFromAdding}
                            onChangeEmail={value => { setInviteEmail(value); setInviteError(''); }}
                            onInviteAnother={() => { setInviteSent(false); setInviteEmail(''); }}
                            onSelectMode={setIsAdding}
                            onSelectRole={setInviteRole}
                            onSendInvite={handleEmailInvite}
                            onShareCode={handleShareCode}
                        />
                    </>
                )}
            </GlassView>
        </AnimatedModal>
    );
}
