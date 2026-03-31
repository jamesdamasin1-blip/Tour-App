import 'react-native-url-polyfill/auto';
import { TabBg } from '@/components/TabBg';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/src/store/useStore';
import { useRealtimeSync } from '@/src/hooks/useRealtimeSync';
import { AddBuddyModal } from '@/components/AddBuddyModal';
import { GlassView } from '@/components/GlassView';
import { AnimatedModal } from '@/components/AnimatedModal';
import { PressableScale } from '@/components/PressableScale';

function CustomTabBarButton({ onPress }: { onPress: () => void }) {
    const pathname = usePathname();
    if (pathname === '/analysis') return null;
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible', zIndex: 1000, elevation: 1000 }}>
            <PressableScale
                testID="fab-add-trip"
                style={{ alignItems: 'center', justifyContent: 'center', top: -44 }}
                onPress={onPress}
                activeScale={0.88}
            >
                <View style={styles.fab}>
                    <Feather name="plus" size={36} color="#fff" />
                </View>
            </PressableScale>
        </View>
    );
}

export default function TabLayout() {
    const insets = useSafeAreaInsets();
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const router = useRouter();

    const [isFabModalOpen, setIsFabModalOpen] = useState(false);
    const [isAddBuddyOpen, setIsAddBuddyOpen] = useState(false);

    useRealtimeSync();

    const fabActions = [
        {
            icon: 'plus' as const,
            label: 'CREATE TRIP',
            sub: 'Start planning a new adventure',
            onPress: () => { setIsFabModalOpen(false); router.push('/create-plan' as any); },
        },
        {
            icon: 'users' as const,
            label: 'MANAGE MEMBERS',
            sub: 'Invite someone to one of your trips',
            onPress: () => { setIsFabModalOpen(false); setIsAddBuddyOpen(true); },
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#1A1C18' : '#F2F0E8' }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: isDark ? '#F2F0E8' : '#9EB294',
                    tabBarInactiveTintColor: isDark ? '#9EB294/40' : '#9ca3af',
                    tabBarShowLabel: false,
                    tabBarBackground: () => (
                        <View style={{ flex: 1 }}>
                            <View pointerEvents="none" style={{ position: 'absolute', top: -50, left: 0, right: 0, height: 50, zIndex: 1 }}>
                                <LinearGradient
                                    colors={[
                                        isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                                        isDark ? 'rgba(26, 28, 24, 0.95)' : 'rgba(242, 240, 232, 0.95)',
                                    ]}
                                    style={{ flex: 1 }}
                                />
                            </View>
                            <TabBg />
                        </View>
                    ),
                    tabBarStyle: {
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 64 + insets.bottom,
                        backgroundColor: 'transparent',
                        borderTopWidth: 0,
                        elevation: 0,
                        paddingBottom: insets.bottom,
                        paddingTop: 0,
                        overflow: 'visible',
                    },
                    tabBarIconStyle: { marginTop: 18 },
                }}>
                <Tabs.Screen
                    name="index"
                    options={{
                        tabBarIcon: ({ color }) => <Feather name="home" size={26} color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="add"
                    options={{
                        tabBarButton: () => <CustomTabBarButton onPress={() => setIsFabModalOpen(true)} />,
                    }}
                />
                <Tabs.Screen
                    name="analysis"
                    options={{
                        tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={26} color={color} />,
                    }}
                />
            </Tabs>

            {/* FAB choice modal */}
            <AnimatedModal visible={isFabModalOpen} onClose={() => setIsFabModalOpen(false)}>
                        <GlassView
                            intensity={isDark ? 80 : 100}
                            borderRadius={32}
                            backgroundColor={isDark ? 'rgba(30, 34, 28, 0.97)' : 'rgba(255, 255, 255, 0.98)'}
                            style={{ width: '100%', padding: 24 }}
                        >
                            {fabActions.map((item, i) => (
                                <PressableScale
                                    key={item.label}
                                    onPress={item.onPress}
                                    style={[
                                        styles.fabItem,
                                        i < fabActions.length - 1 && {
                                            borderBottomWidth: 1,
                                            borderBottomColor: isDark ? 'rgba(158,178,148,0.1)' : 'rgba(0,0,0,0.06)',
                                            marginBottom: 4,
                                            paddingBottom: 20,
                                        },
                                    ]}
                                >
                                    <View style={[styles.fabItemIcon, {
                                        backgroundColor: isDark ? 'rgba(178,196,170,0.12)' : 'rgba(93,109,84,0.08)',
                                    }]}>
                                        <Feather name={item.icon} size={22} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{
                                            fontSize: 18,
                                            fontWeight: '900',
                                            letterSpacing: -0.3,
                                            textTransform: 'uppercase',
                                            color: isDark ? '#F2F0E8' : '#111827',
                                            marginBottom: 3,
                                        }}>
                                            {item.label}
                                        </Text>
                                        <Text style={{
                                            fontSize: 13,
                                            fontWeight: '500',
                                            color: isDark ? '#9EB294' : 'rgba(93,109,84,0.8)',
                                            lineHeight: 18,
                                        }}>
                                            {item.sub}
                                        </Text>
                                    </View>
                                    <Feather name="chevron-right" size={20} color={isDark ? '#9EB294' : '#9CA3AF'} />
                                </PressableScale>
                            ))}
                        </GlassView>
            </AnimatedModal>

            {/* AddBuddyModal — starts at trip picker */}
            <AddBuddyModal
                visible={isAddBuddyOpen}
                onClose={() => setIsAddBuddyOpen(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    fab: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#5D6D54',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 12,
    },
    fabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        gap: 16,
    },
    fabItemIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
