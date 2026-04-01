import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type AddBuddyMethodStepProps = {
    isDark: boolean;
    onOpenCode: () => void;
    onOpenEmail: () => void;
    onOpenQr: () => void;
};

export function AddBuddyMethodStep({
    isDark,
    onOpenCode,
    onOpenEmail,
    onOpenQr,
}: AddBuddyMethodStepProps) {
    return (
        <View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', marginBottom: 16 }}>
                They must have the app installed. Choose how to invite them:
            </Text>

            <TouchableOpacity onPress={onOpenQr} style={methodButtonStyle(isDark)}>
                <View style={methodIconStyle}>
                    <Feather name="maximize" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Show QR Code</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>They scan to join instantly</Text>
                </View>
                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onOpenCode} style={methodButtonStyle(isDark)}>
                <View style={methodIconStyle}>
                    <Feather name="hash" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Share Invite Code</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>Send via message or any app</Text>
                </View>
                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onOpenEmail} style={methodButtonStyle(isDark)}>
                <View style={methodIconStyle}>
                    <Feather name="mail" size={20} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827' }}>Invite by Email</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#9EB294' : '#6B7280', marginTop: 1 }}>Send invite to their email</Text>
                </View>
                <Feather name="chevron-right" size={16} color={isDark ? 'rgba(158,178,148,0.4)' : '#CBD5E1'} />
            </TouchableOpacity>
        </View>
    );
}

const methodButtonStyle = (isDark: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(93, 109, 84, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)',
});

const methodIconStyle = {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(93, 109, 84, 0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
};
