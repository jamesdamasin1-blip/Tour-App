import React from 'react';
import { Feather } from '@expo/vector-icons';
import {
    GestureResponderHandlers,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type TripsSidebarProps = {
    isDark: boolean;
    sidebarBg: string;
    sidebarWidth: number;
    topInset: number;
    bottomInset: number;
    tabBarHeight: number;
    userInitial: string;
    displayName?: string | null;
    userEmail?: string | null;
    sidebarPanHandlers?: GestureResponderHandlers;
    onToggleTheme: () => void;
    onSignOut: () => void;
};

export const TripsSidebar = ({
    isDark,
    sidebarBg,
    sidebarWidth,
    topInset,
    bottomInset,
    tabBarHeight,
    userInitial,
    displayName,
    userEmail,
    sidebarPanHandlers,
    onToggleTheme,
    onSignOut,
}: TripsSidebarProps) => (
    <View
        {...sidebarPanHandlers}
        style={[
            styles.sidebar,
            {
                width: sidebarWidth,
                paddingTop: topInset,
                paddingBottom: bottomInset + tabBarHeight + 16,
                backgroundColor: sidebarBg,
            },
        ]}
    >
        <View style={styles.sidebarUser}>
            <View
                style={[
                    styles.sidebarAvatar,
                    {
                        backgroundColor: isDark
                            ? 'rgba(178,196,170,0.15)'
                            : 'rgba(93,109,84,0.12)',
                    },
                ]}
            >
                <Text
                    style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: isDark ? '#B2C4AA' : '#5D6D54',
                    }}
                >
                    {userInitial}
                </Text>
            </View>
            <Text
                style={{
                    fontSize: 15,
                    fontWeight: '800',
                    color: isDark ? '#F2F0E8' : '#111827',
                    marginTop: 10,
                }}
                numberOfLines={1}
            >
                {displayName || 'Traveler'}
            </Text>
            {userEmail ? (
                <Text
                    style={{
                        fontSize: 11,
                        color: isDark ? '#9EB294' : '#6B7280',
                        marginTop: 2,
                    }}
                    numberOfLines={1}
                >
                    {userEmail}
                </Text>
            ) : null}
        </View>

        <View
            style={[
                styles.divider,
                {
                    backgroundColor: isDark
                        ? 'rgba(158,178,148,0.12)'
                        : 'rgba(0,0,0,0.07)',
                },
            ]}
        />

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <View style={styles.navItem}>
                <View
                    style={[
                        styles.navIcon,
                        {
                            backgroundColor: isDark
                                ? 'rgba(178,196,170,0.1)'
                                : 'rgba(93,109,84,0.08)',
                        },
                    ]}
                >
                    <Feather name="map" size={17} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                </View>
                <Text style={[styles.navLabel, { color: isDark ? '#F2F0E8' : '#111827' }]}>
                    MY TRIPS
                </Text>
            </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={onToggleTheme} style={styles.navItem}>
                <View
                    style={[
                        styles.navIcon,
                        {
                            backgroundColor: isDark
                                ? 'rgba(178,196,170,0.1)'
                                : 'rgba(93,109,84,0.08)',
                        },
                    ]}
                >
                    <Feather
                        name={isDark ? 'sun' : 'moon'}
                        size={17}
                        color={isDark ? '#B2C4AA' : '#5D6D54'}
                    />
                </View>
                <Text style={[styles.navLabel, { color: isDark ? '#F2F0E8' : '#111827' }]}>
                    {isDark ? 'LIGHT MODE' : 'DARK MODE'}
                </Text>
            </TouchableOpacity>

            <View
                style={[
                    styles.divider,
                    {
                        backgroundColor: isDark
                            ? 'rgba(158,178,148,0.12)'
                            : 'rgba(0,0,0,0.07)',
                        marginVertical: 4,
                    },
                ]}
            />

            <TouchableOpacity onPress={onSignOut} style={styles.navItem}>
                <View style={[styles.navIcon, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                    <Feather name="log-out" size={17} color="#ef4444" />
                </View>
                <Text style={[styles.navLabel, { color: '#ef4444' }]}>SIGN OUT</Text>
            </TouchableOpacity>
        </View>
    </View>
);

const styles = StyleSheet.create({
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
    },
    sidebarUser: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 20,
    },
    sidebarAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        marginHorizontal: 0,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
    },
    navIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navLabel: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.8,
        flex: 1,
    },
});
