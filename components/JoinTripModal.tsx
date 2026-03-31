import { Feather } from '@expo/vector-icons';
import React, { useState, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useStore } from '../src/store/useStore';
import { GlassView } from './GlassView';
import { AnimatedModal, StepTransition } from './AnimatedModal';
import { PressableScale } from './PressableScale';

interface JoinTripModalProps {
    visible: boolean;
    onClose: () => void;
    onScanQR: () => void;
    onJoinWithCode: (code: string) => void;
}

export const JoinTripModal: React.FC<JoinTripModalProps> = ({
    visible,
    onClose,
    onScanQR,
    onJoinWithCode,
}) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [mode, setMode] = useState<'CHOICE' | 'INPUT'>('CHOICE');
    const [code, setCode] = useState('');
    const prevMode = useRef(mode);
    const stepDirection = mode === 'INPUT' ? 'forward' : 'backward' as const;
    if (prevMode.current !== mode) prevMode.current = mode;

    const handleClose = () => {
        setMode('CHOICE');
        setCode('');
        onClose();
    };

    const handleJoin = () => {
        if (code.trim()) {
            onJoinWithCode(code.trim());
            handleClose();
        }
    };

    return (
        <AnimatedModal visible={visible} onClose={handleClose}>
                    <GlassView
                        intensity={isDark ? 50 : 80}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(255, 255, 255, 0.9)"}
                        style={styles.glass}
                    >
                        <View style={styles.header}>
                            <Text style={[styles.title, isDark && { color: '#F2F0E8' }]}>JOIN TRIP</Text>
                            <Text style={[styles.subtitle, isDark && { color: '#9EB294' }]}>
                                {mode === 'CHOICE' ? 'How would you like to join?' : 'Enter the shared trip code'}
                            </Text>
                        </View>

                        <StepTransition stepKey={mode} direction={stepDirection}>
                        {mode === 'CHOICE' ? (
                            <View style={styles.optionsContainer}>
                                <TouchableOpacity 
                                    style={[styles.choiceBtn, isDark ? styles.choiceBtnDark : styles.choiceBtnLight]}
                                    onPress={() => {
                                        onScanQR();
                                        handleClose();
                                    }}
                                >
                                    <View style={styles.choiceIcon}>
                                        <Feather name="maximize" size={22} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                    </View>
                                    <View style={styles.choiceTextContainer}>
                                        <Text style={[styles.choiceTitle, isDark && { color: '#F2F0E8' }]}>Scan QR Code</Text>
                                        <Text style={styles.choiceDesc}>Instant join via camera</Text>
                                    </View>
                                    <Feather name="chevron-right" size={18} color={isDark ? "rgba(158,178,148,0.4)" : "#CBD5E1"} />
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.choiceBtn, isDark ? styles.choiceBtnDark : styles.choiceBtnLight]}
                                    onPress={() => setMode('INPUT')}
                                >
                                    <View style={styles.choiceIcon}>
                                        <Feather name="hash" size={22} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                                    </View>
                                    <View style={styles.choiceTextContainer}>
                                        <Text style={[styles.choiceTitle, isDark && { color: '#F2F0E8' }]}>Enter Code</Text>
                                        <Text style={styles.choiceDesc}>Paste a shared text code</Text>
                                    </View>
                                    <Feather name="chevron-right" size={18} color={isDark ? "rgba(158,178,148,0.4)" : "#CBD5E1"} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.inputContainer}>
                                <View style={[styles.inputWrapper, isDark ? styles.inputWrapperDark : styles.inputWrapperLight]}>
                                    <Feather name="link" size={18} color={isDark ? "#9EB294" : "#64748b"} />
                                    <TextInput
                                        style={[styles.input, isDark && { color: '#F2F0E8' }]}
                                        placeholder="Paste code here..."
                                        placeholderTextColor={isDark ? "rgba(158,178,148,0.4)" : "#94a3b8"}
                                        value={code}
                                        onChangeText={setCode}
                                        autoFocus
                                        selectionColor="#5D6D54"
                                    />
                                </View>

                                <View style={styles.actionRow}>
                                    <PressableScale
                                        style={[styles.secondaryBtn, isDark && { backgroundColor: '#3A3F37' }]}
                                        onPress={() => setMode('CHOICE')}
                                    >
                                        <Text style={[styles.secondaryBtnText, isDark && { color: '#9EB294' }]}>BACK</Text>
                                    </PressableScale>
                                    <PressableScale
                                        style={[styles.primaryBtn, { opacity: code.trim() ? 1 : 0.5 }]}
                                        onPress={handleJoin}
                                        disabled={!code.trim()}
                                    >
                                        <Text style={styles.primaryBtnText}>JOIN NOW</Text>
                                    </PressableScale>
                                </View>
                            </View>
                        )}
                        </StepTransition>

                        <PressableScale 
                            style={[styles.closeFullBtn, isDark ? styles.closeDark : styles.closeLight]} 
                            onPress={handleClose}
                        >
                            <Text style={[styles.closeFullText, isDark && { color: '#9EB294' }]}>CLOSE</Text>
                        </PressableScale>
                    </GlassView>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
    },
    glass: {
        padding: 24,
        overflow: 'hidden',
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
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
        marginTop: 4,
        textAlign: 'center',
    },
    optionsContainer: {
        width: '100%',
    },
    choiceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
    },
    choiceBtnLight: {
        backgroundColor: '#f8fafc',
    },
    choiceBtnDark: {
        backgroundColor: 'rgba(158, 178, 148, 0.08)',
    },
    choiceIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(93, 109, 84, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    choiceTextContainer: {
        flex: 1,
    },
    choiceTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1e293b',
    },
    choiceDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    inputContainer: {
        width: '100%',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 56,
        borderRadius: 16,
        borderWidth: 1.5,
        marginBottom: 20,
    },
    inputWrapperLight: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
    },
    inputWrapperDark: {
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderColor: 'rgba(158, 178, 148, 0.2)',
    },
    input: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#1e293b',
        marginLeft: 12,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    primaryBtn: {
        flex: 2,
        height: 56,
        backgroundColor: '#5D6D54',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryBtnText: {
        color: '#FFF',
        fontWeight: '900',
        letterSpacing: 1,
    },
    secondaryBtn: {
        flex: 1,
        height: 56,
        backgroundColor: '#F5F5EC',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryBtnText: {
        color: '#475569',
        fontWeight: '800',
        fontSize: 12,
    },
    closeFullBtn: {
        marginTop: 24,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        width: '100%',
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
    closeFullText: {
        fontSize: 13,
        fontWeight: '900',
        color: '#64748b',
        letterSpacing: 2,
    }
});
