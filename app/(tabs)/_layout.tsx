import 'react-native-url-polyfill/auto';
import { TabBg } from '@/components/TabBg';
import { Feather } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/src/store/useStore';
import { useRealtimeSync } from '@/src/hooks/useRealtimeSync';

function CustomTabBarButton() {
    const router = useRouter();
    const target = '/create-plan';

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
                style={{ alignItems: 'center', justifyContent: 'center', top: -44 }}
                onPress={() => router.push(target as any)}
                activeOpacity={0.8}
            >
                <View style={styles.fab}>
                    <Feather name="plus" size={36} color="#fff" />
                </View>
            </TouchableOpacity>
        </View>
    );
}

export default function TabLayout() {
    useRealtimeSync(); // Initialize sync
    const insets = useSafeAreaInsets();
    const { theme } = useStore();
    const isDark = theme === 'dark';

    return (
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: isDark ? '#F2F0E8' : '#9EB294',
                    tabBarInactiveTintColor: isDark ? '#9EB294/40' : '#9ca3af',
                    tabBarShowLabel: false,
                    tabBarBackground: () => <TabBg />,
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
                    },
                    tabBarIconStyle: {
                        marginTop: 18, // Centering icons in 64px bar
                    }
                }}>
                <Tabs.Screen
                    name="index"
                    options={{
                        tabBarIcon: ({ color }) => <Feather name="home" size={26} color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="modal"
                    options={{
                        tabBarButton: () => {
                            const pathname = usePathname();
                            if (pathname === '/analysis') return null;
                            return <CustomTabBarButton />;
                        },
                    }}
                />
                <Tabs.Screen
                    name="analysis"
                    options={{
                        tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={26} color={color} />,
                    }}
                />
            </Tabs>
        </View>
    );
}

const styles = StyleSheet.create({

    fab: {
        width: 64, // w-16
        height: 64, // h-16
        borderRadius: 32,
        backgroundColor: '#5D6D54', // Darker Cambridge Blue (Solid)
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 12,
    }
});
