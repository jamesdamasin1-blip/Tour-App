import React from 'react';
import { Feather } from '@expo/vector-icons';
import {
    GestureResponderHandlers,
    StyleSheet,
    Text,
    ActivityIndicator,
    TouchableOpacity,
    View,
} from 'react-native';
import type { TripInvite } from '@/src/types/models';
import type { DeletionRequest } from '@/src/store/slices/settingsSlice';

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
    pendingInvites: TripInvite[];
    deletionRequests: DeletionRequest[];
    processingInviteId?: string | null;
    processingDeleteRequestId?: string | null;
    sidebarPanHandlers?: GestureResponderHandlers;
    onAcceptInvite: (invite: TripInvite) => void;
    onDeclineInvite: (invite: TripInvite) => void;
    onApproveDeleteRequest: (request: DeletionRequest) => void;
    onRejectDeleteRequest: (request: DeletionRequest) => void;
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
    pendingInvites,
    deletionRequests,
    processingInviteId,
    processingDeleteRequestId,
    sidebarPanHandlers,
    onAcceptInvite,
    onDeclineInvite,
    onApproveDeleteRequest,
    onRejectDeleteRequest,
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

            <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[styles.sectionTitle, { color: isDark ? '#9EB294' : '#6B7280' }]}>
                        INBOX
                    </Text>
                    {(pendingInvites.length + deletionRequests.length) > 0 ? (
                        <View style={[styles.badge, { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }]}>
                            <Text style={{ color: isDark ? '#1A1C18' : '#fff', fontSize: 9, fontWeight: '900' }}>
                                {pendingInvites.length + deletionRequests.length}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {pendingInvites.length === 0 && deletionRequests.length === 0 ? (
                    <View style={[styles.emptyInbox, {
                        backgroundColor: isDark ? 'rgba(158,178,148,0.06)' : 'rgba(93,109,84,0.05)',
                        borderColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)',
                    }]}>
                        <Text style={{ color: isDark ? '#9EB294' : '#6B7280', fontSize: 11, fontWeight: '700' }}>
                            No new messages right now.
                        </Text>
                    </View>
                ) : null}

                {pendingInvites.map(invite => (
                    <View key={invite.id} style={[styles.inboxCard, {
                        backgroundColor: isDark ? 'rgba(158,178,148,0.08)' : 'rgba(93,109,84,0.06)',
                        borderColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.1)',
                    }]}>
                        <View style={styles.inboxHeader}>
                            <View style={[styles.inboxIcon, {
                                backgroundColor: isDark ? 'rgba(178,196,170,0.12)' : 'rgba(93,109,84,0.08)',
                            }]}>
                                <Feather name="mail" size={15} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inboxTitle, { color: isDark ? '#F2F0E8' : '#111827' }]} numberOfLines={1}>
                                    {invite.tripTitle}
                                </Text>
                                <Text style={{ color: isDark ? '#9EB294' : '#6B7280', fontSize: 10, fontWeight: '700' }} numberOfLines={2}>
                                    from {invite.fromDisplayName || invite.fromEmail || 'a friend'}
                                </Text>
                            </View>
                        </View>

                        {processingInviteId === invite.id ? (
                            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={isDark ? '#B2C4AA' : '#5D6D54'} />
                            </View>
                        ) : (
                            <View style={styles.inboxActions}>
                                <TouchableOpacity
                                    onPress={() => onAcceptInvite(invite)}
                                    style={[styles.primaryAction, { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }]}
                                >
                                    <Text style={{ color: isDark ? '#1A1C18' : '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                                        JOIN
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => onDeclineInvite(invite)}
                                    style={[styles.secondaryAction, {
                                        backgroundColor: isDark ? 'rgba(158,178,148,0.08)' : 'rgba(93,109,84,0.04)',
                                        borderColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(93,109,84,0.12)',
                                    }]}
                                >
                                    <Text style={{ color: isDark ? '#9EB294' : '#6B7280', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                                        LATER
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ))}

                {deletionRequests.map(request => (
                    <View key={request.id} style={[styles.inboxCard, {
                        backgroundColor: isDark ? 'rgba(239,68,68,0.09)' : 'rgba(239,68,68,0.05)',
                        borderColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
                    }]}>
                        <View style={styles.inboxHeader}>
                            <View style={[styles.inboxIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                                <Feather name="alert-circle" size={15} color="#ef4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inboxTitle, { color: isDark ? '#F2F0E8' : '#111827' }]} numberOfLines={1}>
                                    {request.activityTitle}
                                </Text>
                                <Text style={{ color: isDark ? '#F0B3B3' : '#B91C1C', fontSize: 10, fontWeight: '700' }} numberOfLines={2}>
                                    {request.requestedByName} asked to delete this activity
                                </Text>
                            </View>
                        </View>

                        {processingDeleteRequestId === request.id ? (
                            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#ef4444" />
                            </View>
                        ) : (
                            <View style={styles.inboxActions}>
                                <TouchableOpacity
                                    onPress={() => onRejectDeleteRequest(request)}
                                    style={[styles.secondaryAction, {
                                        backgroundColor: isDark ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.35)',
                                        borderColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.16)',
                                    }]}
                                >
                                    <Text style={{ color: isDark ? '#F0B3B3' : '#B91C1C', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                                        DENY
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => onApproveDeleteRequest(request)}
                                    style={[styles.primaryAction, { backgroundColor: '#ef4444' }]}
                                >
                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                                        APPROVE
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ))}
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
    sectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    emptyInbox: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
    },
    inboxCard: {
        borderWidth: 1,
        borderRadius: 18,
        padding: 12,
        marginBottom: 10,
    },
    inboxHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inboxIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inboxTitle: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    inboxActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    primaryAction: {
        flex: 1,
        minHeight: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryAction: {
        flex: 1,
        minHeight: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
});
