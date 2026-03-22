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
    ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { useTheme } from '@/src/hooks/useTheme';
import { signUpWithEmail } from '@/src/auth/googleAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RegisterScreen() {
    const { isDark, toggleTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const colors = {
        text: isDark ? '#F2F0E8' : '#1A1C18',
        subtext: isDark ? 'rgba(242,240,232,0.6)' : 'rgba(26,28,24,0.6)',
        accent: isDark ? '#B2C4AA' : '#5D6D54',
        inputBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        inputBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
        error: '#E57373',
    };

    const validatePassword = (pw: string): string | null => {
        if (pw.length < 8) return 'Password must be at least 8 characters';
        if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
        if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter';
        if (!/[0-9]/.test(pw)) return 'Password must include a number';
        return null;
    };

    const handleRegister = async () => {
        if (!displayName.trim() || displayName.trim().length < 2) {
            setError('Enter a display name (at least 2 characters)');
            return;
        }
        const pwError = validatePassword(password);
        if (pwError) {
            setError(pwError);
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setError('');
        setLoading(true);
        try {
            const { needsVerification } = await signUpWithEmail(
                email!,
                password,
                displayName.trim()
            );
            if (needsVerification) {
                router.replace({ pathname: '/(auth)/verify', params: { email: email! } });
            } else {
                // Auto-confirmed (e.g., development mode)
                router.replace('/(tabs)');
            }
        } catch (err: any) {
            // Don't expose raw Supabase errors to users
            if (err.message?.includes('already registered')) {
                setError('An account with this email already exists. Try signing in instead.');
            } else {
                setError('Registration failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

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
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Back Button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
                        <Text style={[styles.subtitle, { color: colors.subtext }]}>{email}</Text>
                    </View>

                    <GlassView style={styles.card} hasShadow borderRadius={24}>
                        {/* Display Name */}
                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <Ionicons name="person-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Display name"
                                placeholderTextColor={colors.subtext}
                                value={displayName}
                                onChangeText={setDisplayName}
                                autoFocus
                                editable={!loading}
                            />
                        </View>

                        {/* Password */}
                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <Ionicons name="lock-closed-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Password (min 8 chars, upper + lower + number)"
                                placeholderTextColor={colors.subtext}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={colors.subtext}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Confirm Password */}
                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                            <TextInput
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Confirm password"
                                placeholderTextColor={colors.subtext}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPassword}
                                editable={!loading}
                                returnKeyType="go"
                                onSubmitEditing={handleRegister}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.registerButton, { backgroundColor: colors.accent }]}
                            onPress={handleRegister}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.registerText}>Create Account</Text>
                            )}
                        </TouchableOpacity>

                        {error ? (
                            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                        ) : null}
                    </GlassView>
                </ScrollView>
            </KeyboardAvoidingView>
        </MeshBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 80,
    },
    backButton: {
        position: 'absolute',
        top: -20,
        left: 0,
        zIndex: 10,
        padding: 4,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
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
        marginBottom: 12,
    },
    input: {
        flex: 1,
        fontSize: 15,
    },
    registerButton: {
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    registerText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
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
