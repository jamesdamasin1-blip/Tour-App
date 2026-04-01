import { AnimatedModal, StepTransition } from './AnimatedModal';
import { GlassView } from './GlassView';
import { useAuth } from '@/src/hooks/useAuth';
import { useStore } from '@/src/store/useStore';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Share, Text, TouchableOpacity, View } from 'react-native';
import { AddBuddyInviteStep } from '@/src/features/trip/components/member/AddBuddyInviteStep';
import { AddBuddyMethodStep } from '@/src/features/trip/components/member/AddBuddyMethodStep';
import { AddBuddyTripStep } from '@/src/features/trip/components/member/AddBuddyTripStep';
import { buildTripShareCode, buildTripShareQrPayload } from '@/src/features/trip/components/member/memberSharePayload';

interface AddBuddyModalProps {
    visible: boolean;
    onClose: () => void;
    onScanQR?: () => void;
    initialTripId?: string;
    initialStep?: Step;
    hideBackButton?: boolean;
}

type Step = 'trip' | 'method' | 'qr' | 'code' | 'email';

export const AddBuddyModal = ({ visible, onClose, initialTripId, initialStep, hideBackButton }: AddBuddyModalProps) => {
    const { theme, trips, activities, sendEmailInvite } = useStore();
    const { userId, email: userEmail, displayName, isAuthenticated } = useAuth();
    const isDark = theme === 'dark';

    const [step, setStep] = useState<Step>(initialStep || 'trip');
    const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId || null);
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);
    const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');

    const prevStep = useRef(step);
    const stepDirection = (() => {
        const order: Step[] = ['trip', 'method', 'qr', 'code', 'email'];
        return order.indexOf(step) >= order.indexOf(prevStep.current) ? 'forward' : 'backward';
    })() as 'forward' | 'backward';
    if (prevStep.current !== step) {
        prevStep.current = step;
    }

    useEffect(() => {
        if (visible) {
            setStep(initialStep || 'trip');
            setSelectedTripId(initialTripId || null);
            setInviteSent(false);
            setError('');
        }
    }, [initialStep, initialTripId, visible]);

    const selectedTrip = trips.find(trip => trip.id === selectedTripId);
    const activeTrips = trips.filter(trip => !trip.isCompleted);

    const resetInviteState = () => {
        setEmail('');
        setError('');
        setInviteSent(false);
        setInviteRole('editor');
    };

    const handleClose = () => {
        setStep(initialStep || 'trip');
        setSelectedTripId(initialTripId || null);
        resetInviteState();
        onClose();
    };

    const handleSelectTrip = (tripId: string) => {
        setSelectedTripId(tripId);
        setStep('method');
    };

    const handleShareCode = async () => {
        try {
            const encodedData = buildTripShareCode(selectedTrip, activities);
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

    const goBack = () => {
        if (step === 'qr' || step === 'code' || step === 'email') {
            setStep('method');
            return;
        }
        if (step === 'method') {
            if (initialTripId) {
                handleClose();
            } else {
                setStep('trip');
            }
            return;
        }
        handleClose();
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
        <AnimatedModal visible={visible} onClose={handleClose}>
            <GlassView
                intensity={isDark ? 80 : 90}
                borderRadius={36}
                backgroundColor={isDark ? 'rgba(30, 34, 28, 0.88)' : 'rgba(255, 255, 255, 0.88)'}
                style={{ width: '100%', padding: 24 }}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {step !== 'trip' && !hideBackButton && (
                            <TouchableOpacity onPress={goBack} style={{ marginRight: 10 }}>
                                <Feather name="arrow-left" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                            </TouchableOpacity>
                        )}
                        <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                            {getTitle()}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                        <Feather name="x" size={20} color={isDark ? '#9EB294' : '#6B7280'} />
                    </TouchableOpacity>
                </View>

                <StepTransition stepKey={step} direction={stepDirection}>
                    {step === 'trip' && (
                        <AddBuddyTripStep activeTrips={activeTrips} isDark={isDark} onSelectTrip={handleSelectTrip} />
                    )}

                    {step === 'method' && (
                        <AddBuddyMethodStep
                            isDark={isDark}
                            onOpenCode={() => setStep('code')}
                            onOpenEmail={() => setStep('email')}
                            onOpenQr={() => setStep('qr')}
                        />
                    )}

                    {(step === 'qr' || step === 'code' || step === 'email') && (
                        <AddBuddyInviteStep
                            email={email}
                            error={error}
                            inviteRole={inviteRole}
                            inviteSent={inviteSent}
                            isAuthenticated={isAuthenticated}
                            isDark={isDark}
                            isSendingInvite={isSendingInvite}
                            qrPayload={buildTripShareQrPayload(selectedTrip)}
                            step={step}
                            onChangeEmail={value => { setEmail(value); setError(''); }}
                            onInviteAnother={() => setInviteSent(false)}
                            onSelectRole={setInviteRole}
                            onSendInvite={handleEmailInvite}
                            onShareCode={handleShareCode}
                        />
                    )}
                </StepTransition>
            </GlassView>
        </AnimatedModal>
    );
};
