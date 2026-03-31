import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Header } from '@/components/Header';
import { TripCard } from '@/components/TripCard';
import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState, useRef } from 'react';
import {
    FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, View,
    TouchableOpacity, Dimensions, Animated, StyleSheet, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeshBackground } from '@/components/MeshBackground';
import { useNavigationGuard } from '@/src/hooks/useNavigationGuard';
import { useStore } from '@/src/store/useStore';
import { TripShareModal } from '@/components/TripShareModal';
import { TripPlan } from '@/src/types/models';
import { Alert } from 'react-native';
import { QRScannerModal } from '@/components/QRScannerModal';
import { JoinTripModal } from '@/components/JoinTripModal';
import { PendingInviteBanner } from '@/components/PendingInviteBanner';
import { useAuth } from '@/src/hooks/useAuth';
import { base64Decode } from '@/src/utils/base64';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 300);
const TAB_BAR_HEIGHT = 64;

export default function TripsListScreen() {
    const trips = useStore(state => state.trips);
    const expenses = useStore(state => state.expenses);
    const deleteTrip = useStore(state => state.deleteTrip);
    const router = useRouter();
    const { logout, userId, displayName, email: userEmail } = useAuth();
    const { theme, toggleTheme, importTrip, addMember } = useStore();
    const isDark = theme === 'dark';

    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
    const [sharingTrip, setSharingTrip] = useState<TripPlan | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);
    const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);

    const insets = useSafeAreaInsets();
    const { safeNavigate } = useNavigationGuard();

    // Push animation — main content slides right
    const pushAnim = useRef(new Animated.Value(0)).current;

    const openSidebar = useCallback(() => {
        setIsSidebarOpen(true);
        Animated.spring(pushAnim, {
            toValue: SIDEBAR_WIDTH,
            useNativeDriver: true,
            damping: 24,
            stiffness: 180,
        }).start();
    }, [pushAnim]);

    const closeSidebar = useCallback(() => {
        Animated.timing(pushAnim, {
            toValue: 0,
            useNativeDriver: true,
            duration: 250,
            easing: Easing.out(Easing.quad),
        }).start(() => setIsSidebarOpen(false));
    }, [pushAnim]);

    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    const confirmDelete = () => {
        if (deletingTripId) {
            deleteTrip(deletingTripId);
            setDeletingTripId(null);
        }
    };

    const handleJoinTrip = async (code: string) => {
        try {
            const tripData = JSON.parse(base64Decode(code));
            if (tripData && tripData.id) {
                importTrip(tripData);
                if (userId) {
                    const members = tripData.members || [];
                    const isAlreadyMember = members.some((m: any) =>
                        m.userId === userId || m.email?.toLowerCase() === userEmail?.toLowerCase()
                    );
                    if (!isAlreadyMember) {
                        const { BUDDY_COLORS } = await import('@/src/types/models');
                        const { supabase } = await import('@/src/store/storeHelpers');
                        const usedColors = members.map((m: any) => m.color);
                        const memberColor = BUDDY_COLORS.find((c: string) => !usedColors.includes(c))
                            || BUDDY_COLORS[members.length % BUDDY_COLORS.length];
                        const memberName = displayName || userEmail?.split('@')[0] || 'Me';
                        const { data: rpcResult, error: rpcError } = await supabase.rpc('join_trip', {
                            p_trip_id: tripData.id,
                            p_member_name: memberName,
                            p_member_color: memberColor,
                        });
                        if (rpcError) console.warn('[JoinTrip] RPC failed:', rpcError.message);
                        if (rpcResult?.members) {
                            useStore.setState(s => ({
                                trips: s.trips.map(t => t.id === tripData.id
                                    ? { ...t, members: rpcResult.members, lastModified: Date.now() }
                                    : t),
                            }));
                        } else {
                            addMember(tripData.id, memberName, { userId, email: userEmail || undefined });
                        }
                    }
                }
                router.push(`/trip/${tripData.id}` as any);
            } else {
                throw new Error('Invalid data');
            }
        } catch {
            Alert.alert('Error', 'Invalid trip code or QR data.');
        }
    };

    const handleLogout = useCallback(async () => {
        setIsLogoutConfirmVisible(false);
        closeSidebar();
        try {
            await logout(false);
            router.replace('/(auth)/entry' as any);
        } catch {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
        }
    }, [logout, router, closeSidebar]);

    const renderEmptyComponent = useCallback(() => (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <View style={{ padding: 32, borderRadius: 999, marginBottom: 20, backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)' }}>
                <Feather name="map" size={56} color={isDark ? '#B2C4AA' : '#9EB294'} />
            </View>
            <Text testID="empty-state-text" style={{ fontSize: 28, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textAlign: 'center', marginBottom: 12 }}>
                ready for your next trip?
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', lineHeight: 20 }}>
                Create your first trip plan to start tracking your activities and budget!
            </Text>
        </View>
    ), [isDark]);

    const renderItem = useCallback(({ item }: { item: TripPlan }) => {
        const tripExpenses = expenses.filter(e => e.tripId === item.id);
        const tripWallets = item.wallets || [];
        const spentHome = Calculations.getTotalSpentHome(tripExpenses);
        const budgetHome = item.totalBudgetHomeCached || item.totalBudget;
        const totalBalanceHome = tripWallets.reduce((sum: number, w: any) => {
            const balanceTrip = w.totalBudget - (w.spentAmount || 0);
            const rate = w.baselineExchangeRate || (w.defaultRate ? (1 / w.defaultRate) : 1);
            return sum + (balanceTrip * rate);
        }, 0);

        return (
            <TripCard
                id={item.id}
                title={item.title}
                countries={item.countries}
                startDate={item.startDate}
                endDate={item.endDate}
                budget={budgetHome}
                spent={spentHome}
                tripCurrency={item.homeCurrency || 'PHP'}
                isCompleted={item.isCompleted}
                onPress={() => safeNavigate(() => router.push(`/trip/${item.id}` as any))}
                onLongPress={() => setSharingTrip(item)}
                onDelete={(id) => setDeletingTripId(id)}
                onEdit={(id) => router.push(`/create-plan?editId=${id}` as any)}
            />
        );
    }, [expenses, router, safeNavigate]);

    const userInitial = (displayName || userEmail || '?')[0].toUpperCase();
    const sidebarBg = isDark ? '#1A1C18' : '#F2F0E8';

    return (
        // Root: overflow hidden so sidebar never bleeds outside screen
        <View style={{ flex: 1, backgroundColor: sidebarBg, overflow: 'hidden' }}>

            {/* ── Sidebar (sits behind main content, revealed by push) ── */}
            <View style={[styles.sidebar, { width: SIDEBAR_WIDTH, paddingTop: insets.top, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16, backgroundColor: sidebarBg }]}>
                {/* Close */}
                <TouchableOpacity onPress={closeSidebar} style={styles.sidebarClose}>
                    <Feather name="x" size={20} color={isDark ? '#9EB294' : '#6B7280'} />
                </TouchableOpacity>

                {/* User */}
                <View style={styles.sidebarUser}>
                    <View style={[styles.sidebarAvatar, { backgroundColor: isDark ? 'rgba(178,196,170,0.15)' : 'rgba(93,109,84,0.12)' }]}>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: isDark ? '#B2C4AA' : '#5D6D54' }}>{userInitial}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#F2F0E8' : '#111827', marginTop: 10 }} numberOfLines={1}>
                        {displayName || 'Traveler'}
                    </Text>
                    {userEmail ? (
                        <Text style={{ fontSize: 11, color: isDark ? '#9EB294' : '#6B7280', marginTop: 2 }} numberOfLines={1}>
                            {userEmail}
                        </Text>
                    ) : null}
                </View>

                <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(0,0,0,0.07)' }]} />

                {/* Nav */}
                <View style={{ flex: 1, paddingHorizontal: 16 }}>
                    <TouchableOpacity onPress={closeSidebar} style={styles.navItem}>
                        <View style={[styles.navIcon, { backgroundColor: isDark ? 'rgba(178,196,170,0.1)' : 'rgba(93,109,84,0.08)' }]}>
                            <Feather name="map" size={17} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                        <Text style={[styles.navLabel, { color: isDark ? '#F2F0E8' : '#111827' }]}>MY TRIPS</Text>
                    </TouchableOpacity>
                </View>

                {/* Sign out — pinned above tab bar */}
                <View style={{ paddingHorizontal: 16 }}>
                    <TouchableOpacity onPress={toggleTheme} style={styles.navItem}>
                        <View style={[styles.navIcon, { backgroundColor: isDark ? 'rgba(178,196,170,0.1)' : 'rgba(93,109,84,0.08)' }]}>
                            <Feather name={isDark ? 'sun' : 'moon'} size={17} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                        </View>
                        <Text style={[styles.navLabel, { color: isDark ? '#F2F0E8' : '#111827' }]}>
                            {isDark ? 'LIGHT MODE' : 'DARK MODE'}
                        </Text>
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(158,178,148,0.12)' : 'rgba(0,0,0,0.07)', marginVertical: 4 }]} />

                    <TouchableOpacity
                        onPress={() => { closeSidebar(); setIsLogoutConfirmVisible(true); }}
                        style={styles.navItem}
                    >
                        <View style={[styles.navIcon, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                            <Feather name="log-out" size={17} color="#ef4444" />
                        </View>
                        <Text style={[styles.navLabel, { color: '#ef4444' }]}>SIGN OUT</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Main content — slides right on open ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pushAnim }] }]}>
                <MeshBackground style={{ flex: 1 }}>
                    <Header
                        title="MY TRIPS"
                        subtitle="ALL YOUR ADVENTURES"
                        showBack={false}
                        leftElement={
                            <TouchableOpacity onPress={openSidebar} style={{ padding: 8 }}>
                                <Feather name="menu" size={22} color={isDark ? '#B2C4AA' : '#5D6D54'} />
                            </TouchableOpacity>
                        }
                    />

                    <FlatList
                        data={trips}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListHeaderComponent={<><View style={{ height: 16 }} /><PendingInviteBanner /></>}
                        ListEmptyComponent={renderEmptyComponent}
                        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 120 }}
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                        bounces={false}
                        overScrollMode="never"
                        showsVerticalScrollIndicator={false}
                        style={{ flex: 1 }}
                    />

                    {showBottomFade && trips.length > 0 && (
                        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64 + insets.bottom + 40, zIndex: 5 }}>
                            <LinearGradient
                                colors={[
                                    'transparent',
                                    isDark ? '#1A1C18' : '#F2F0E8',
                                ]}
                                style={{ flex: 1 }}
                            />
                        </View>
                    )}
                </MeshBackground>

                {/* Tap-to-close overlay — synchronized with sidebar slide */}
                <Animated.View 
                    pointerEvents={isSidebarOpen ? 'auto' : 'none'}
                    style={[
                        StyleSheet.absoluteFill, 
                        { 
                            backgroundColor: 'rgba(0,0,0,0.4)', 
                            opacity: pushAnim.interpolate({
                                inputRange: [0, SIDEBAR_WIDTH],
                                outputRange: [0, 1],
                            }),
                            zIndex: 10 
                        }
                    ]}
                >
                    <TouchableOpacity 
                        style={{ flex: 1 }} 
                        activeOpacity={1} 
                        onPress={closeSidebar} 
                    />
                </Animated.View>
            </Animated.View>

            {/* ── Modals (outside push wrapper so they don't slide) ── */}
            <TripShareModal
                isVisible={!!sharingTrip}
                trip={sharingTrip}
                onClose={() => setSharingTrip(null)}
            />

            <ConfirmationModal
                visible={!!deletingTripId}
                onClose={() => setDeletingTripId(null)}
                onConfirm={confirmDelete}
                title="Delete Trip?"
                description="This will permanently remove the trip and all its logged activities and expenses. This action cannot be undone."
                type="delete"
                confirmLabel="DELETE"
            />

            <ConfirmationModal
                visible={isLogoutConfirmVisible}
                onClose={() => setIsLogoutConfirmVisible(false)}
                onConfirm={handleLogout}
                title="Sign Out?"
                description="Your local data will be kept on this device. You can sign back in anytime."
                type="delete"
                confirmLabel="SIGN OUT"
            />

            <QRScannerModal
                isVisible={isScannerVisible}
                onClose={() => setIsScannerVisible(false)}
                onScan={(data) => { setIsScannerVisible(false); handleJoinTrip(data); }}
            />

            <JoinTripModal
                visible={isJoinModalVisible}
                onClose={() => setIsJoinModalVisible(false)}
                onScanQR={() => setIsScannerVisible(true)}
                onJoinWithCode={handleJoinTrip}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
    },
    sidebarClose: {
        alignSelf: 'flex-end',
        padding: 16,
        paddingBottom: 8,
    },
    sidebarUser: {
        alignItems: 'center',
        paddingHorizontal: 24,
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
