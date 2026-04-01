import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Header } from '@/components/Header';
import { JoinTripModal } from '@/components/JoinTripModal';
import { MeshBackground } from '@/components/MeshBackground';
import { PendingInviteBanner } from '@/components/PendingInviteBanner';
import { QRScannerModal } from '@/components/QRScannerModal';
import { TripCard } from '@/components/TripCard';
import { TripShareModal } from '@/components/TripShareModal';
import { getFundingTotalGlobalHome } from '@/src/finance/wallet/walletEngine';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigationGuard } from '@/src/hooks/useNavigationGuard';
import { TripsEmptyState } from '@/src/features/trips/components/TripsEmptyState';
import { TripsSidebar } from '@/src/features/trips/components/TripsSidebar';
import { TAB_BAR_HEIGHT } from '@/src/features/trips/constants';
import { useOneTimeTestTripCleanup } from '@/src/features/trips/hooks/useOneTimeTestTripCleanup';
import { useStore } from '@/src/store/useStore';
import type { TripPlan } from '@/src/types/models';
import { base64Decode } from '@/src/utils/base64';
import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    PanResponder,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 300);

export default function TripsListScreen() {
    const trips = useStore(state => state.trips);
    const expenses = useStore(state => state.expenses);
    const deleteTrip = useStore(state => state.deleteTrip);
    const theme = useStore(state => state.theme);
    const toggleTheme = useStore(state => state.toggleTheme);
    const importTrip = useStore(state => state.importTrip);
    const addMember = useStore(state => state.addMember);
    const setTripsSidebarOpen = useStore(state => state.setTripsSidebarOpen);
    const router = useRouter();
    const { logout, userId, displayName, email: userEmail } = useAuth();
    const { safeNavigate } = useNavigationGuard();
    const insets = useSafeAreaInsets();
    const isDark = theme === 'dark';

    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
    const [sharingTrip, setSharingTrip] = useState<TripPlan | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);

    const pushAnim = useRef(new Animated.Value(0)).current;
    const userInitial = (displayName || userEmail || '?')[0].toUpperCase();
    const sidebarBg = isDark ? '#1A1C18' : '#F2F0E8';

    const expenseTotalsByTrip = useMemo(() => {
        const totals = new Map<string, number>();
        expenses.forEach(expense => {
            const current = totals.get(expense.tripId) || 0;
            totals.set(expense.tripId, current + (expense.convertedAmountHome || 0));
        });
        return totals;
    }, [expenses]);

    useOneTimeTestTripCleanup({ trips, deleteTrip, setTripsSidebarOpen });

    const openSidebar = useCallback(() => {
        setTripsSidebarOpen(true);
        setIsSidebarOpen(true);
        Animated.spring(pushAnim, {
            toValue: SIDEBAR_WIDTH,
            useNativeDriver: true,
            damping: 24,
            stiffness: 180,
        }).start();
    }, [pushAnim, setTripsSidebarOpen]);

    const closeSidebar = useCallback(() => {
        setTripsSidebarOpen(false);
        Animated.timing(pushAnim, {
            toValue: 0,
            useNativeDriver: true,
            duration: 250,
            easing: Easing.out(Easing.quad),
        }).start(() => setIsSidebarOpen(false));
    }, [pushAnim, setTripsSidebarOpen]);

    const sidebarPanResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            isSidebarOpen &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
            gestureState.dx < -8
        ),
        onPanResponderMove: (_event, gestureState) => {
            const nextValue = Math.max(0, Math.min(SIDEBAR_WIDTH, SIDEBAR_WIDTH + gestureState.dx));
            pushAnim.setValue(nextValue);
        },
        onPanResponderRelease: (_event, gestureState) => {
            if (gestureState.dx < -SIDEBAR_WIDTH * 0.22 || gestureState.vx < -0.45) {
                closeSidebar();
                return;
            }

            Animated.spring(pushAnim, {
                toValue: SIDEBAR_WIDTH,
                useNativeDriver: true,
                damping: 24,
                stiffness: 180,
            }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(pushAnim, {
                toValue: SIDEBAR_WIDTH,
                useNativeDriver: true,
                damping: 24,
                stiffness: 180,
            }).start();
        },
    }), [closeSidebar, isSidebarOpen, pushAnim]);

    const confirmDelete = useCallback(() => {
        if (!deletingTripId) return;
        deleteTrip(deletingTripId);
        setDeletingTripId(null);
    }, [deleteTrip, deletingTripId]);

    const handleJoinTrip = useCallback(async (code: string) => {
        try {
            const tripData = JSON.parse(base64Decode(code));
            if (!tripData?.id) throw new Error('Invalid data');

            importTrip(tripData);

            if (userId) {
                const members = tripData.members || [];
                const isAlreadyMember = members.some((member: any) =>
                    member.userId === userId ||
                    member.email?.toLowerCase() === userEmail?.toLowerCase()
                );

                if (!isAlreadyMember) {
                    const { BUDDY_COLORS } = await import('@/src/types/models');
                    const { supabase } = await import('@/src/store/storeHelpers');
                    const usedColors = members.map((member: any) => member.color);
                    const memberColor = BUDDY_COLORS.find(
                        (color: string) => !usedColors.includes(color)
                    ) || BUDDY_COLORS[members.length % BUDDY_COLORS.length];
                    const memberName = displayName || userEmail?.split('@')[0] || 'Me';
                    const { data: rpcResult, error: rpcError } = await supabase.rpc('join_trip', {
                        p_trip_id: tripData.id,
                        p_member_name: memberName,
                        p_member_color: memberColor,
                    });

                    if (rpcError) console.warn('[JoinTrip] RPC failed:', rpcError.message);
                    if (rpcResult?.members) {
                        useStore.setState(state => ({
                            trips: state.trips.map(trip => (
                                trip.id === tripData.id
                                    ? { ...trip, members: rpcResult.members, lastModified: Date.now() }
                                    : trip
                            )),
                        }));
                    } else {
                        addMember(tripData.id, memberName, {
                            userId,
                            email: userEmail || undefined,
                        });
                    }
                }
            }

            router.push(`/trip/${tripData.id}` as any);
        } catch {
            Alert.alert('Error', 'Invalid trip code or QR data.');
        }
    }, [addMember, displayName, importTrip, router, userEmail, userId]);

    const handleLogout = useCallback(async () => {
        setIsLogoutConfirmVisible(false);
        closeSidebar();
        try {
            await logout(false);
            router.replace('/(auth)/entry' as any);
        } catch {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
        }
    }, [closeSidebar, logout, router]);

    const renderEmptyComponent = useCallback(
        () => <TripsEmptyState isDark={isDark} />,
        [isDark]
    );

    const renderItem = useCallback(({ item }: { item: TripPlan }) => {
        const tripWallets = item.wallets || [];
        const spentHome = expenseTotalsByTrip.get(item.id) || 0;
        const homeCurrency = item.homeCurrency || 'PHP';
        const baselineCurrency = item.tripCurrency || tripWallets[0]?.currency || homeCurrency;
        const primaryRate = tripWallets[0]?.baselineExchangeRate || tripWallets[0]?.defaultRate || 1;
        const budgetHome = tripWallets.length > 0
            ? tripWallets.reduce(
                (sum: number, wallet: any) => sum + getFundingTotalGlobalHome(wallet, homeCurrency),
                0
            )
            : (item.totalBudgetHomeCached || item.totalBudget);
        const canToggleDisplayCurrency = baselineCurrency !== homeCurrency && primaryRate > 0;
        const budgetDisplay = canToggleDisplayCurrency ? budgetHome / primaryRate : budgetHome;
        const spentDisplay = canToggleDisplayCurrency ? spentHome / primaryRate : spentHome;

        return (
            <TripCard
                id={item.id}
                title={item.title}
                countries={item.countries}
                startDate={item.startDate}
                endDate={item.endDate}
                budget={budgetDisplay}
                spent={spentDisplay}
                homeBudget={budgetHome}
                homeSpent={spentHome}
                homeCurrency={homeCurrency}
                tripCurrency={canToggleDisplayCurrency ? baselineCurrency : homeCurrency}
                isCompleted={item.isCompleted}
                onPress={() => safeNavigate(() => router.push(`/trip/${item.id}` as any))}
                onLongPress={() => setSharingTrip(item)}
                onDelete={setDeletingTripId}
                onEdit={(id) => router.push(`/create-plan?editId=${id}` as any)}
            />
        );
    }, [expenseTotalsByTrip, router, safeNavigate]);

    const listHeader = useMemo(
        () => (
            <>
                <View style={{ height: 16 }} />
                <PendingInviteBanner />
            </>
        ),
        []
    );

    return (
        <View style={{ flex: 1, backgroundColor: sidebarBg, overflow: 'hidden' }}>
            <TripsSidebar
                isDark={isDark}
                sidebarBg={sidebarBg}
                sidebarWidth={SIDEBAR_WIDTH}
                topInset={insets.top}
                bottomInset={insets.bottom}
                tabBarHeight={TAB_BAR_HEIGHT}
                userInitial={userInitial}
                displayName={displayName}
                userEmail={userEmail}
                sidebarPanHandlers={sidebarPanResponder.panHandlers}
                onToggleTheme={toggleTheme}
                onSignOut={() => {
                    closeSidebar();
                    setIsLogoutConfirmVisible(true);
                }}
            />

            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pushAnim }] }]}>
                <MeshBackground style={{ flex: 1 }}>
                    <Header
                        title="MY TRIPS"
                        subtitle="ALL YOUR ADVENTURES"
                        showBack={false}
                        leftElement={(
                            <TouchableOpacity onPress={openSidebar} style={{ padding: 8 }}>
                                <Feather
                                    name="menu"
                                    size={22}
                                    color={isDark ? '#B2C4AA' : '#5D6D54'}
                                />
                            </TouchableOpacity>
                        )}
                    />

                    <FlatList
                        data={trips}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListHeaderComponent={listHeader}
                        ListEmptyComponent={renderEmptyComponent}
                        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 120 }}
                        bounces={false}
                        overScrollMode="never"
                        showsVerticalScrollIndicator={false}
                        style={{ flex: 1 }}
                    />
                </MeshBackground>

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
                            zIndex: 10,
                        },
                    ]}
                >
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={closeSidebar}
                    />
                </Animated.View>
            </Animated.View>

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
                onScan={(data) => {
                    setIsScannerVisible(false);
                    void handleJoinTrip(data);
                }}
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
