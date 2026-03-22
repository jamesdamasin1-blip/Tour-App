import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { useTheme } from '@/src/hooks/useTheme';
import { resendVerification, getAuthState, linkLocalDataToUser } from '@/src/auth/googleAuth';
import { supabase } from '@/src/utils/supabase';
import { startSyncLoop, runSync } from '@/src/sync/syncEngine';

export default function VerifyScreen() {
    const { isDark } = useTheme();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);
    const [error, setError] = useState('');

    const colors = {
        text: isDark ? '#F2F0E8' : '#1A1C18',
        subtext: isDark ? 'rgba(242,240,232,0.6)' : 'rgba(26,28,24,0.6)',
        accent: isDark ? '#B2C4AA' : '#5D6D54',
        error: '#E57373',
        success: '#81C784',
    };

    // Listen for auth state change (user clicks verification link, app resumes)
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_IN') {
                const authState = await getAuthState();
                if (authState.isAuthenticated && authState.userId) {
                    linkLocalDataToUser(authState.userId);
                    startSyncLoop();
                    runSync().catch(console.error);
                    router.replace('/(tabs)');
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleResend = async () => {
        setError('');
        setResending(true);
        try {
            await resendVerification(email!);
            setResent(true);
            setTimeout(() => setResent(false), 5000);
        } catch (err: any) {
            setError(err.message || 'Failed to resend');
        } finally {
            setResending(false);
        }
    };

    const handleCheckManually = async () => {
        const authState = await getAuthState();
        if (authState.isAuthenticated && authState.userId) {
            linkLocalDataToUser(authState.userId);
            startSyncLoop();
            runSync().catch(console.error);
            router.replace('/(tabs)');
        } else {
            setError('Email not yet verified. Check your inbox.');
        }
    };

    return (
        <MeshBackground>
            <View style={styles.content}>
                <GlassView style={styles.card} hasShadow borderRadius={24}>
                    <View style={styles.iconContainer}>
                        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                            <Ionicons name="mail-open-outline" size={36} color="#fff" />
                        </View>
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Check your email
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.subtext }]}>
                        We sent a verification link to
                    </Text>
                    <Text style={[styles.email, { color: colors.text }]}>
                        {email}
                    </Text>

                    <TouchableOpacity
                        style={[styles.checkButton, { backgroundColor: colors.accent }]}
                        onPress={handleCheckManually}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.checkButtonText}>I've Verified</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.resendButton}
                        onPress={handleResend}
                        disabled={resending || resent}
                        activeOpacity={0.7}
                    >
                        {resending ? (
                            <ActivityIndicator color={colors.accent} size="small" />
                        ) : resent ? (
                            <Text style={[styles.resendText, { color: colors.success }]}>
                                Email sent!
                            </Text>
                        ) : (
                            <Text style={[styles.resendText, { color: colors.accent }]}>
                                Resend verification email
                            </Text>
                        )}
                    </TouchableOpacity>

                    {error ? (
                        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                    ) : null}
                </GlassView>

                <TouchableOpacity
                    style={styles.offlineButton}
                    onPress={() => router.replace('/(tabs)')}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.offlineText, { color: colors.subtext }]}>
                        Continue Offline for Now
                    </Text>
                </TouchableOpacity>
            </View>
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        padding: 32,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: 20,
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
    },
    email: {
        fontSize: 15,
        fontWeight: '600',
        marginTop: 4,
        marginBottom: 24,
        textAlign: 'center',
    },
    checkButton: {
        width: '100%',
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    resendButton: {
        marginTop: 16,
        padding: 8,
    },
    resendText: {
        fontSize: 14,
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
    },
    offlineButton: {
        alignItems: 'center',
        marginTop: 24,
    },
    offlineText: {
        fontSize: 14,
    },
});
