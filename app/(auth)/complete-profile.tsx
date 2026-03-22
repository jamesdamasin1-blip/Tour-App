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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MeshBackground } from '@/components/MeshBackground';
import { GlassView } from '@/components/GlassView';
import { useTheme } from '@/src/hooks/useTheme';
import { updateUserProfile } from '@/src/auth/googleAuth';

export default function CompleteProfileScreen() {
    const { isDark } = useTheme();
    const [displayName, setDisplayName] = useState('');
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

    const handleComplete = async () => {
        if (!displayName.trim()) {
            setError('Enter a display name');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await updateUserProfile(displayName.trim());
            router.replace('/(tabs)');
        } catch (err: any) {
            setError(err.message || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        router.replace('/(tabs)');
    };

    return (
        <MeshBackground>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.content}>
                    <View style={styles.iconContainer}>
                        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                            <Ionicons name="checkmark-circle-outline" size={36} color="#fff" />
                        </View>
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Almost there!
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.subtext }]}>
                        What should we call you?
                    </Text>

                    <GlassView style={styles.card} hasShadow borderRadius={24}>
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
                                returnKeyType="done"
                                onSubmitEditing={handleComplete}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.completeButton, { backgroundColor: colors.accent }]}
                            onPress={handleComplete}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.completeText}>Get Started</Text>
                            )}
                        </TouchableOpacity>

                        {error ? (
                            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                        ) : null}
                    </GlassView>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={handleSkip}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.skipText, { color: colors.subtext }]}>
                            Skip for now
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
        fontSize: 26,
        fontWeight: '700',
        marginBottom: 6,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        marginBottom: 24,
        textAlign: 'center',
    },
    card: {
        padding: 24,
        width: '100%',
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
    completeButton: {
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    completeText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
    },
    skipButton: {
        marginTop: 24,
    },
    skipText: {
        fontSize: 14,
    },
});
