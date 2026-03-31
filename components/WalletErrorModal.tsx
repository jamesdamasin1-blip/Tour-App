import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassView } from './GlassView';
import { useStore } from '@/src/store/useStore';
import { AnimatedModal } from './AnimatedModal';
import { PressableScale } from './PressableScale';

export const WalletErrorModal = () => {
    const { theme, walletError, clearWalletError } = useStore();
    const isDark = theme === 'dark';

    if (!walletError) return null;

    return (
        <AnimatedModal visible={!!walletError} onClose={clearWalletError}>
                <GlassView
                    intensity={isDark ? 80 : 95}
                    borderRadius={28}
                    backgroundColor={isDark ? 'rgba(30,34,28,0.97)' : 'rgba(255,255,255,0.97)'}
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

                    <PressableScale
                        style={[styles.btn, { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }]}
                        onPress={clearWalletError}
                    >
                        <Text style={[styles.btnText, { color: isDark ? '#1A1C18' : '#fff' }]}>GOT IT</Text>
                    </PressableScale>
                </GlassView>
        </AnimatedModal>
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
