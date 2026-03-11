import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useStore } from '../src/store/useStore';


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
    
    const isDelete = type === 'delete';
    const isEdit = type === 'edit';

    const iconName = isDelete ? 'trash-2' : isEdit ? 'edit-2' : 'alert-circle';
    const iconColor = isDelete ? '#FF3B30' : isEdit ? '#3b82f6' : '#5D6D54';
    const iconBgColor = isDelete ? '#FFE5E5' : isEdit ? '#E5F1FF' : 'rgba(158, 178, 148, 0.15)';
    const confirmBgColor = isDelete ? '#ef4444' : isEdit ? '#3b82f6' : '#5D6D54';

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={30} style={StyleSheet.absoluteFill} tint={isDark ? "dark" : "light"} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                <View
                    style={[
                        styles.modalContainer,
                        {
                            backgroundColor: isDark ? '#282C26' : '#F2F0E4',
                            borderRadius: 32,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(255, 255, 255, 0.4)',
                        }
                    ]}
                >
                    <View style={styles.content}>
                        <Text style={[styles.title, isDark && { color: '#F2F0E8' }]}>{title}</Text>
                        <Text style={[styles.description, isDark && { color: '#9EB294' }]}>{description}</Text>

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                onPress={onClose}
                                style={[styles.cancelButton, isDark && { backgroundColor: '#3A3F37' }]}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.cancelButtonText, isDark && { color: '#9EB294' }]}>{cancelLabel}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={onConfirm}
                                style={[styles.confirmButton, { backgroundColor: confirmBgColor }]}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        paddingHorizontal: 24,
    },
    modalContainer: {
        width: '100%',
        padding: 24,
    },
    content: {
        alignItems: 'center',
    },
    iconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
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
