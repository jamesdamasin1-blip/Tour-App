import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Share, Alert } from 'react-native';
import { TripPlan } from '@/src/types/models';
import { useStore } from '@/src/store/useStore';
import { GlassView } from './GlassView';
import { encode } from 'base-64';
import QRCode from 'react-native-qrcode-svg';

interface TripShareModalProps {
    isVisible: boolean;
    trip: TripPlan | null;
    onClose: () => void;
}

export const TripShareModal = ({ isVisible, trip, onClose }: TripShareModalProps) => {
    const { theme, toggleTripCompletion, activities } = useStore();
    const isDark = theme === 'dark';
    const [view, setView] = React.useState<'OPTIONS' | 'SHARE'>('OPTIONS');

    if (!trip) return null;

    const handleToggleComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toggleTripCompletion(trip.id);
        onClose();
    };

    const getEncodedData = () => {
        if (!trip) return '';
        const tripActivities = activities.filter(a => a.tripId === trip.id);
        const shareData = {
            ...trip,
            activities: tripActivities,
            sharedAt: Date.now(),
            source: 'OrbitalGalileo'
        };
        return encode(JSON.stringify(shareData));
    };

    const handleShareTrip = async () => {
        try {
            const encodedData = getEncodedData();
            const shareMessage = `Hey! Join my trip "${trip.title}" on the Tour Budget App.\n\nCopy this code and select the "+" icon in the My Trips screen:\n\n${encodedData}`;
            
            await Share.share({
                message: shareMessage,
                title: `Join ${trip.title}`,
            });
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            Alert.alert('Error', 'Failed to share trip data.');
        }
    };

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity 
                style={styles.container} 
                activeOpacity={1} 
                onPress={onClose}
            >
                <BlurView intensity={50} style={StyleSheet.absoluteFill} tint={isDark ? "dark" : "light"} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                
                <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
                    <GlassView
                        intensity={isDark ? 80 : 70}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(30,34,28,0.95)" : "rgba(255,255,255,0.9)"}
                    >
                        <View style={styles.content}>
                            <View style={styles.header}>
                                <Text style={[styles.title, isDark && { color: '#F2F0E8' }]}>{trip.title}</Text>
                                <Text style={[styles.subtitle, isDark && { color: '#9EB294' }]}>Trip Options</Text>
                            </View>

                            <View style={styles.optionsContainer}>
                                {view === 'OPTIONS' ? (
                                    <>
                                        <TouchableOpacity 
                                            style={[styles.optionButton, isDark ? styles.optionDark : styles.optionLight]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setView('SHARE');
                                            }}
                                        >
                                            <View style={styles.optionIcon}>
                                                <Feather name="users" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                            </View>
                                            <View style={styles.optionTextContainer}>
                                                <Text style={[styles.optionTitle, isDark && { color: '#F2F0E8' }]}>Add Person</Text>
                                                <Text style={styles.optionDesc}>Show QR code or share trip link</Text>
                                            </View>
                                            <Feather name="chevron-right" size={18} color={isDark ? "rgba(158,178,148,0.4)" : "#CBD5E1"} />
                                        </TouchableOpacity>

                                        <TouchableOpacity 
                                            style={[styles.optionButton, isDark ? styles.optionDark : styles.optionLight]}
                                            onPress={handleToggleComplete}
                                        >
                                            <View style={styles.optionIcon}>
                                                <Feather 
                                                    name={trip.isCompleted ? "rotate-ccw" : "check-circle"} 
                                                    size={20} 
                                                    color={trip.isCompleted ? "#6b7280" : "#10b981"} 
                                                />
                                            </View>
                                            <View style={styles.optionTextContainer}>
                                                <Text style={[styles.optionTitle, isDark && { color: '#F2F0E8' }]}>
                                                    {trip.isCompleted ? 'Reopen Trip' : 'Mark as Completed'}
                                                </Text>
                                                <Text style={styles.optionDesc}>
                                                    {trip.isCompleted ? 'Allow editing again' : 'Lock trip from further edits'}
                                                </Text>
                                            </View>
                                            <Feather name="chevron-right" size={18} color={isDark ? "rgba(158,178,148,0.4)" : "#CBD5E1"} />
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <View style={styles.qrContainer}>
                                        <Text style={[styles.qrHint, isDark && { color: '#9EB294' }]}>Ask them to scan this QR code from their "My Trips" screen</Text>
                                        <View style={styles.qrWrapper}>
                                            <QRCode
                                                value={getEncodedData()}
                                                size={180}
                                                color={isDark ? "#F2F0E8" : "#111827"}
                                                backgroundColor="transparent"
                                            />
                                        </View>
                                        
                                        <TouchableOpacity 
                                            style={[styles.optionButton, isDark ? styles.optionDark : styles.optionLight, { marginTop: 24 }]}
                                            onPress={handleShareTrip}
                                        >
                                            <View style={styles.optionIcon}>
                                                <Feather name="share" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                            </View>
                                            <View style={styles.optionTextContainer}>
                                                <Text style={[styles.optionTitle, isDark && { color: '#F2F0E8' }]}>Share Text Code</Text>
                                                <Text style={styles.optionDesc}>Send via message or other apps</Text>
                                            </View>
                                        </TouchableOpacity>

                                        <TouchableOpacity 
                                            style={styles.backButton}
                                            onPress={() => setView('OPTIONS')}
                                        >
                                            <Feather name="arrow-left" size={16} color={isDark ? "#9EB294" : "#64748b"} />
                                            <Text style={[styles.backText, isDark && { color: '#9EB294' }]}>BACK TO OPTIONS</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            <TouchableOpacity 
                                style={[styles.closeButton, isDark ? styles.closeDark : styles.closeLight]} 
                                onPress={() => {
                                    onClose();
                                    setTimeout(() => setView('OPTIONS'), 300);
                                }}
                            >
                                <Text style={[styles.closeText, isDark && { color: '#9EB294' }]}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </GlassView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
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
        marginTop: 8,
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: '#111827',
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    subtitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    optionsContainer: {
        width: '100%',
        marginBottom: 24,
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
    },
    optionLight: {
        backgroundColor: '#f8fafc',
    },
    optionDark: {
        backgroundColor: 'rgba(158, 178, 148, 0.08)',
    },
    optionIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(93, 109, 84, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1e293b',
    },
    optionDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    qrContainer: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    qrHint: {
        fontSize: 12,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 20,
        fontWeight: '600',
        paddingHorizontal: 20,
    },
    qrWrapper: {
        padding: 16,
        backgroundColor: '#FFF',
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        padding: 8,
    },
    backText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#64748b',
        marginLeft: 8,
        letterSpacing: 1,
    },
    closeButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
    },
    closeLight: {
        backgroundColor: '#e2e8f0',
        borderColor: '#cbd5e1',
    },
    closeDark: {
        backgroundColor: '#3A3F37',
        borderColor: '#4A5046',
    },
    closeText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
});
