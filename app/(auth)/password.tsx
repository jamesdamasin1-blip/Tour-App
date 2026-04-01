import React, { useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { AuthLoadingOverlay } from '@/components/AuthLoadingOverlay';
import { useTheme } from '@/src/hooks/useTheme';
import { signInWithEmail } from '@/src/auth/googleAuth';
import { bootstrapAuthState } from '@/src/auth/authRuntime';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PasswordScreen() {
    const { isDark, toggleTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const [error, setError] = useState('');

    const colors = {
        text: isDark ? '#F2F0E8' : '#1A1C18',
        subtext: isDark ? 'rgba(242,240,232,0.6)' : 'rgba(26,28,24,0.6)',
        accent: isDark ? '#B2C4AA' : '#5D6D54',
        inputBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        inputBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
        error: '#E57373',
    };

    const handleSignIn = async () => {
        if (!password) {
            setError('Enter your password');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const authState = await signInWithEmail(email!, password);
            if (authState.isAuthenticated && authState.userId) {
                bootstrapAuthState(authState, { triggerSync: true });
                setLoading(false);
                setTransitioning(true);
                setTimeout(() => router.replace('/(tabs)'), 1200);
                return;
            }
        } catch (err: any) {
            if (err.message.includes('Invalid login credentials')) {
                setError('Invalid email or password. Need an account? Tap below to register.');
            } else if (err.message.includes('Email not confirmed')) {
                router.replace({ pathname: '/(auth)/verify', params: { email: email! } });
                return;
            } else {
                setError('Sign-in failed. Please try again.');
            }
        } finally {
            if (!transitioning) setLoading(false);
        }
    };

    if (transitioning) {
        return <AuthLoadingOverlay message="Welcome back!" />;
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
                    {/* Back Button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
                    <Text style={[styles.subtitle, { color: colors.subtext }]}>{email}</Text>

                    <GlassView style={styles.card} hasShadow borderRadius={24}>
                        {/* Password Input */}
                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <Ionicons name="lock-closed-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Password"
                                placeholderTextColor={colors.subtext}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoFocus
                                editable={!loading}
                                returnKeyType="go"
                                onSubmitEditing={handleSignIn}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={colors.subtext}
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.signInButton, { backgroundColor: colors.accent }]}
                            onPress={handleSignIn}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.signInText}>Sign In</Text>
                            )}
                        </TouchableOpacity>

                        {error ? (
                            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                        ) : null}

                        <TouchableOpacity
                            style={styles.registerLink}
                            onPress={() => router.push({ pathname: '/(auth)/register', params: { email: email! } })}
                        >
                            <Text style={[styles.registerLinkText, { color: colors.subtext }]}>
                                {"Don't have an account? "}<Text style={{ color: colors.accent, fontWeight: '600' }}>Register</Text>
                            </Text>
                        </TouchableOpacity>
                    </GlassView>
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
    backButton: {
        position: 'absolute',
        top: 60,
        left: 24,
        zIndex: 10,
        padding: 4,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
        marginBottom: 24,
    },
    card: {
        padding: 24,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    input: {
        flex: 1,
        fontSize: 15,
    },
    signInButton: {
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
    },
    registerLink: {
        marginTop: 16,
        alignItems: 'center' as const,
    },
    registerLinkText: {
        fontSize: 13,
        textAlign: 'center' as const,
    },
    themeToggleContainer: {
        position: 'absolute' as const,
        right: 20,
        zIndex: 20,
    },
    themeToggle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        borderWidth: 1,
        borderColor: 'rgba(158, 178, 148, 0.12)',
    },
});
