import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { AuthLoadingOverlay } from '@/components/AuthLoadingOverlay';
import { useTheme } from '@/src/hooks/useTheme';
import { signInWithGoogle, onAuthStateChange } from '@/src/auth/googleAuth';
import { bootstrapAuthState } from '@/src/auth/authRuntime';
import { setSyncMeta } from '@/src/storage/localDB';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AuthEntryScreen() {
    const { isDark, toggleTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState<'google' | 'email' | null>(null);
    const [transitioning, setTransitioning] = useState(false);
    const [error, setError] = useState('');
    const googlePendingRef = useRef(false);

    // Listen for auth state changes — handles Android deep-link case where
    // openAuthSessionAsync returns 'dismiss' but auth/callback.tsx exchanges the code
    useEffect(() => {
        const unsubscribe = onAuthStateChange((state) => {
            if (!googlePendingRef.current) return;
            if (state.isAuthenticated && state.userId) {
                googlePendingRef.current = false;
                bootstrapAuthState(state, { triggerSync: true });
                setLoading(null);
                setTransitioning(true);
                setTimeout(() => {
                    if (!state.displayName) {
                        router.replace('/(auth)/complete-profile');
                    } else {
                        router.replace('/(tabs)');
                    }
                }, 1200);
            }
        });
        return unsubscribe;
    }, []);

    const colors = {
        text: isDark ? '#F2F0E8' : '#1A1C18',
        subtext: isDark ? 'rgba(242,240,232,0.6)' : 'rgba(26,28,24,0.6)',
        accent: isDark ? '#B2C4AA' : '#5D6D54',
        inputBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        inputBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
        error: '#E57373',
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading('google');
        googlePendingRef.current = true;
        try {
            const authState = await signInWithGoogle();
            // Fast path: openAuthSessionAsync captured the redirect directly
            if (authState.isAuthenticated && authState.userId) {
                googlePendingRef.current = false;
                bootstrapAuthState(authState, { triggerSync: true });
                setLoading(null);
                setTransitioning(true);
                setTimeout(() => {
                    if (!authState.displayName) {
                        router.replace('/(auth)/complete-profile');
                    } else {
                        router.replace('/(tabs)');
                    }
                }, 1200);
                return;
            }
            // Slow path (Android): deep link fires separately — onAuthStateChange handles navigation
            // Keep loading visible briefly — auth callback may still be in flight
            setTimeout(() => {
                if (googlePendingRef.current) {
                    // Timed out waiting for auth callback
                    googlePendingRef.current = false;
                    setError('Sign-in is taking longer than expected. Please try again.');
                    setLoading(null);
                }
            }, 15_000);
            return;
        } catch (err: any) {
            googlePendingRef.current = false;
            setError(err.message || 'Google sign-in failed');
            setLoading(null);
        }
    };

    const handleEmailContinue = () => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
            setError('Enter a valid email address');
            return;
        }
        setError('');
        // Navigate to unified password screen — no email enumeration check.
        // The password screen handles both login and "no account" cases.
        router.push({ pathname: '/(auth)/password', params: { email: trimmed } });
    };

    const handleOffline = () => {
        setSyncMeta('skippedAuth', 'true');
        setTransitioning(true);
        setTimeout(() => router.replace('/(tabs)'), 1200);
    };

    if (transitioning) {
        return <AuthLoadingOverlay message="Preparing your trips..." />;
    }

    return (
        <MeshBackground>
            {/* Dark mode toggle — top right */}
            <View style={[styles.themeToggleContainer, { top: insets.top + 12 }]}>
                <TouchableOpacity
                    onPress={toggleTheme}
                    activeOpacity={0.7}
                    style={[
                        styles.themeToggle,
                        { backgroundColor: isDark ? '#3A3F37' : '#F2F0E8' }
                    ]}
                >
                    <Feather
                        name={isDark ? 'sun' : 'moon'}
                        size={18}
                        color={isDark ? '#E9E4BF' : '#5D6D54'}
                    />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.content}>
                    {/* Logo / Brand */}
                    <View style={styles.brandSection}>
                        <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
                            <Ionicons name="wallet-outline" size={36} color="#fff" />
                        </View>
                        <Text style={[styles.appName, { color: colors.text }]}>
                            Aliqual
                        </Text>
                        <Text style={[styles.tagline, { color: colors.subtext }]}>
                            Every Expense, Every Intent
                        </Text>
                    </View>

                    {/* Auth Card */}
                    <GlassView
                        style={styles.card}
                        hasShadow
                        borderRadius={24}
                    >
                        {/* Google Sign-In — Primary */}
                        <TouchableOpacity
                            style={[styles.googleButton, { backgroundColor: colors.accent }]}
                            onPress={handleGoogleSignIn}
                            disabled={loading !== null}
                            activeOpacity={0.8}
                        >
                            {loading === 'google' ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="logo-google" size={20} color="#fff" />
                                    <Text style={styles.googleText}>Continue with Google</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.dividerRow}>
                            <View style={[styles.dividerLine, { backgroundColor: colors.inputBorder }]} />
                            <Text style={[styles.dividerText, { color: colors.subtext }]}>or</Text>
                            <View style={[styles.dividerLine, { backgroundColor: colors.inputBorder }]} />
                        </View>

                        {/* Email Input */}
                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <Ionicons name="mail-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Email address"
                                placeholderTextColor={colors.subtext}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={loading === null}
                                returnKeyType="go"
                                onSubmitEditing={handleEmailContinue}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.emailButton, { borderColor: colors.accent }]}
                            onPress={handleEmailContinue}
                            disabled={loading !== null}
                            activeOpacity={0.8}
                        >
                            {loading === 'email' ? (
                                <ActivityIndicator color={colors.accent} size="small" />
                            ) : (
                                <Text style={[styles.emailButtonText, { color: colors.accent }]}>
                                    Continue with Email
                                </Text>
                            )}
                        </TouchableOpacity>

                        {error ? (
                            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                        ) : null}
                    </GlassView>

                    {/* Offline */}
                    <TouchableOpacity
                        style={styles.offlineButton}
                        onPress={handleOffline}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="cloud-offline-outline" size={16} color={colors.subtext} />
                        <Text style={[styles.offlineText, { color: colors.subtext }]}>
                            Continue Offline
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    brandSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    appName: {
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 15,
        marginTop: 6,
    },
    card: {
        padding: 24,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
        borderRadius: 14,
        gap: 10,
    },
    googleText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        marginHorizontal: 14,
        fontSize: 13,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    input: {
        flex: 1,
        fontSize: 15,
    },
    emailButton: {
        height: 50,
        borderRadius: 14,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
    },
    offlineButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        gap: 6,
    },
    offlineText: {
        fontSize: 14,
    },
    themeToggleContainer: {
        position: 'absolute',
        right: 20,
        zIndex: 20,
    },
    themeToggle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(158, 178, 148, 0.12)',
    },
});
