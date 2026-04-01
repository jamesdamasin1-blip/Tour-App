import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../src/store/useStore';
import { GlassView } from './GlassView';
import { AnimatedModal } from './AnimatedModal';
import { PressableScale } from './PressableScale';
import { RippleButton } from './RippleButton';


interface ConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'delete' | 'edit' | 'default';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    visible,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = 'CONFIRM',
    cancelLabel = 'CANCEL',
    type = 'default',
}) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    
    const confirmBgColor = type === 'delete' ? '#ef4444' : type === 'edit' ? '#3b82f6' : '#5D6D54';

    return (
        <AnimatedModal visible={visible} onClose={onClose}>
                <GlassView
                    intensity={isDark ? 80 : 100}
                    borderRadius={32}
                    backgroundColor={isDark ? 'rgba(30, 34, 28, 0.97)' : 'rgba(255, 255, 255, 0.98)'}
                    style={styles.modalContainer}
                >
                    <View style={styles.content}>
                        <Text style={[styles.title, isDark && { color: '#F2F0E8' }]}>{title}</Text>
                        <Text style={[styles.description, isDark && { color: '#9EB294' }]}>{description}</Text>

                        <View style={styles.buttonContainer}>
                            <PressableScale
                                onPress={onClose}
                                style={[styles.cancelButton, isDark && { backgroundColor: '#3A3F37' }]}
                            >
                                <Text style={[styles.cancelButtonText, isDark && { color: '#9EB294' }]}>{cancelLabel}</Text>
                            </PressableScale>
                            <RippleButton
                                onPress={onConfirm}
                                glowColor={confirmBgColor}
                                style={[styles.confirmButton, { backgroundColor: confirmBgColor }]}
                            >
                                <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
                            </RippleButton>
                        </View>
                    </View>
                </GlassView>
        </AnimatedModal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        width: '100%',
        padding: 24,
    },
    content: {
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '900',
        color: '#1a1a1a',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: -0.5,
    },
    description: {
        color: 'rgba(93, 109, 84, 0.8)',
        textAlign: 'center',
        marginBottom: 32,
        fontWeight: '500',
        lineHeight: 20,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: '#F5F5EC',
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#333333',
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    confirmButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    confirmButtonText: {
        color: 'white',
        fontWeight: '700',
        textTransform: 'uppercase',
    },
});
