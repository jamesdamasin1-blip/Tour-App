import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TripPlan } from '@/src/types/models';
import { useStore } from '@/src/store/useStore';
import { GlassView } from './GlassView';
import { AnimatedModal, StepTransition } from './AnimatedModal';
import { PressableScale } from './PressableScale';
import { RippleButton } from './RippleButton';

interface TripShareModalProps {
    isVisible: boolean;
    trip: TripPlan | null;
    onClose: () => void;
}

export const TripShareModal = ({ isVisible, trip, onClose }: TripShareModalProps) => {
    const { theme, toggleTripCompletion } = useStore();
    const isDark = theme === 'dark';
    const accentColor = isDark ? '#B2C4AA' : '#5D6D54';
    const accentBg = isDark ? 'rgba(178, 196, 170, 0.12)' : 'rgba(93, 109, 84, 0.08)';
    const [confirming, setConfirming] = React.useState(false);

    if (!trip) return null;

    const handleToggleComplete = () => {
        if (trip.isCompleted) {
            // Reopening — no confirmation needed
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toggleTripCompletion(trip.id);
            onClose();
        } else {
            setConfirming(true);
        }
    };

    const handleConfirmComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toggleTripCompletion(trip.id);
        setConfirming(false);
        onClose();
    };

    const handleClose = () => {
        setConfirming(false);
        onClose();
    };

    return (
        <AnimatedModal visible={isVisible} onClose={handleClose}>
                    <GlassView
                        intensity={isDark ? 80 : 70}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(30,34,28,0.95)" : "rgba(255,255,255,0.9)"}
                    >
                        <View style={styles.content}>
                            <View style={styles.header}>
                                <Text style={[styles.title, isDark && { color: '#F2F0E8' }]}>{trip.title}</Text>
                            </View>

                            <StepTransition stepKey={confirming ? 'confirm' : 'main'} direction={confirming ? 'forward' : 'backward'}>
                            {!confirming ? (
                                <PressableScale
                                    style={[styles.optionButton, isDark ? styles.optionDark : styles.optionLight]}
                                    onPress={handleToggleComplete}
                                >
                                    <View style={[styles.optionIcon, { backgroundColor: accentBg }]}>
                                        <Feather
                                            name={trip.isCompleted ? "rotate-ccw" : "check-circle"}
                                            size={26}
                                            color={accentColor}
                                        />
                                    </View>
                                    <View style={styles.optionTextContainer}>
                                        <Text style={[styles.optionTitle, isDark && { color: '#F2F0E8' }]}>
                                            {trip.isCompleted ? 'Reopen Trip' : 'Mark as Completed'}
                                        </Text>
                                        <Text style={styles.optionDesc}>
                                            {trip.isCompleted ? 'Allow editing again for all members' : 'Tap to finalize this trip'}
                                        </Text>
                                    </View>
                                    <Feather name="chevron-right" size={20} color={isDark ? "rgba(158,178,148,0.4)" : "#CBD5E1"} />
                                </PressableScale>
                            ) : (
                                <View style={{ width: '100%', alignItems: 'center' }}>
                                    <Text style={[styles.confirmTitle, isDark && { color: '#F2F0E8' }]}>
                                        Complete this trip?
                                    </Text>
                                    <Text style={styles.confirmDesc}>
                                        This will lock the trip from further edits for you and all members. You can always reopen it later.
                                    </Text>
                                    <View style={styles.confirmActions}>
                                        <TouchableOpacity
                                            style={[styles.confirmBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }]}
                                            onPress={() => setConfirming(false)}
                                        >
                                            <Text style={[styles.confirmBtnText, { color: isDark ? '#9EB294' : '#64748b' }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <RippleButton
                                            style={[styles.confirmBtn, { backgroundColor: '#5D6D54' }]}
                                            onPress={handleConfirmComplete}
                                            glowColor="rgba(93, 109, 84, 0.4)"
                                        >
                                            <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Complete</Text>
                                        </RippleButton>
                                    </View>
                                </View>
                            )}
                            </StepTransition>
                        </View>
                    </GlassView>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 16,
        width: '100%',
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: '#111827',
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 24,
        width: '100%',
    },
    optionLight: {
        backgroundColor: '#f8fafc',
    },
    optionDark: {
        backgroundColor: 'rgba(158, 178, 148, 0.08)',
    },
    optionIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1e293b',
        marginBottom: 3,
    },
    optionDesc: {
        fontSize: 12,
        color: '#64748b',
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 8,
        textAlign: 'center',
    },
    confirmDesc: {
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    confirmActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    confirmBtnText: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
