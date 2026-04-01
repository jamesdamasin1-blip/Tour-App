import { Header } from '@/components/Header';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type TripDetailHeaderProps = {
    isCreator: boolean;
    isDark: boolean;
    requestCount: number;
    showDeletePanel: boolean;
    title: string;
    onBack: () => void;
    onToggleDeletePanel: () => void;
};

export function TripDetailHeader({
    isCreator,
    isDark,
    requestCount,
    showDeletePanel,
    title,
    onBack,
    onToggleDeletePanel,
}: TripDetailHeaderProps) {
    return (
        <Header
            title={title}
            showBack
            onBack={onBack}
            showThemeToggle={false}
            rightElement={
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {isCreator && requestCount > 0 && (
                        <TouchableOpacity
                            onPress={onToggleDeletePanel}
                            activeOpacity={0.75}
                            style={{ position: 'relative' }}
                        >
                            <View
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 12,
                                    backgroundColor: showDeletePanel
                                        ? (isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.25)')
                                        : (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.12)'),
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.4)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Feather name="alert-triangle" size={18} color="#F5A623" />
                            </View>
                            <View
                                style={{
                                    position: 'absolute',
                                    top: -4,
                                    right: -4,
                                    minWidth: 16,
                                    height: 16,
                                    borderRadius: 8,
                                    backgroundColor: '#ef4444',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingHorizontal: 3,
                                }}
                            >
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>
                                    {requestCount}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            }
        />
    );
}
