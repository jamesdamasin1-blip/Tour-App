import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { GlassView } from './GlassView';
import { useStore } from '@/src/store/useStore';

export const WalletErrorModal = () => {
    const { theme, walletError, clearWalletError } = useStore();
    const isDark = theme === 'dark';

    if (!walletError) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={clearWalletError}>
            <View style={styles.backdrop}>
                <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                <GlassView
                    intensity={isDark ? 80 : 95}
                    borderRadius={28}
                    backgroundColor={isDark ? 'rgba(30,34,28,0.97)' : 'rgba(255,255,255,0.97)'}
                    borderColor={isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)'}
                    style={styles.card}
                >
                    <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(196,130,107,0.15)' : 'rgba(196,130,107,0.1)' }]}>
                        <Feather name="alert-circle" size={28} color={isDark ? '#C4826B' : '#8B4A3C'} />
                    </View>

                    <Text style={[styles.title, { color: isDark ? '#F2F0E8' : '#111827' }]}>
                        Insufficient Balance
                    </Text>
                    <Text style={[styles.message, { color: isDark ? '#9EB294' : '#6B7280' }]}>
                        The expense amount exceeds your wallet balance. Add funds to your wallet or reduce the amount.
                    </Text>

                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }]}
                        onPress={clearWalletError}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.btnText, { color: isDark ? '#1A1C18' : '#fff' }]}>GOT IT</Text>
                    </TouchableOpacity>
                </GlassView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        padding: 28,
        alignItems: 'center',
    },
    iconWrap: {
        width: 60,
        height: 60,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '900',
        textAlign: 'center',
        marginBottom: 10,
        letterSpacing: 0.3,
    },
    message: {
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    btn: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 18,
        alignItems: 'center',
    },
    btnText: {
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
});
