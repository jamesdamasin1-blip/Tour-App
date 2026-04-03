import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Header } from '@/components/Header';
import { MeshBackground } from '@/components/MeshBackground';
import { TripCard } from '@/components/TripCard';
import { TripShareModal } from '@/components/TripShareModal';
import { getFundingTotalGlobalHome } from '@/src/finance/wallet/walletEngine';
import { buildInboxItems } from '@/src/features/inbox/inboxItems';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigationGuard } from '@/src/hooks/useNavigationGuard';
import { TripsEmptyState } from '@/src/features/trips/components/TripsEmptyState';
import { TripsSidebar } from '@/src/features/trips/components/TripsSidebar';
import { TAB_BAR_HEIGHT } from '@/src/features/trips/constants';
import { sendDeleteRequestCancelledBroadcast } from '@/src/hooks/useRealtimeSync';
import { useStore } from '@/src/store/useStore';
import { syncTrace } from '@/src/sync/debug';
import type { TripInvite, TripPlan } from '@/src/types/models';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    const deleteActivity = useStore(state => state.deleteActivity);
    const theme = useStore(state => state.theme);
    const toggleTheme = useStore(state => state.toggleTheme);
    const setTripsSidebarOpen = useStore(state => state.setTripsSidebarOpen);
    const isTripsSidebarRequestedOpen = useStore(state => state.isTripsSidebarOpen);
    const acceptInvite = useStore(state => state.acceptInvite);
    const declineInvite = useStore(state => state.declineInvite);
    const invites = useStore(state => state.invites);
    const deletionRequests = useStore(state => state.deletionRequests);
    const removeDeletionRequest = useStore(state => state.removeDeletionRequest);
    const router = useRouter();
    const { logout, displayName, email: userEmail } = useAuth();
    const { safeNavigate } = useNavigationGuard();
    const insets = useSafeAreaInsets();
    const isDark = theme === 'dark';

    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
    const [sharingTrip, setSharingTrip] = useState<TripPlan | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
    const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
    const [processingDeleteRequestId, setProcessingDeleteRequestId] = useState<string | null>(null);

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

    const pendingInvites = useMemo(
        () => invites.filter(invite => invite.status === 'pending'),
        [invites]
    );
    const inboxItems = useMemo(
        () => buildInboxItems(pendingInvites, deletionRequests),
        [deletionRequests, pendingInvites]
    );
    const headerInboxCount = deletionRequests.length > 0 ? deletionRequests.length : inboxItems.length;

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

    useEffect(() => {
        if (isTripsSidebarRequestedOpen && !isSidebarOpen) {
            openSidebar();
            return;
        }
        if (!isTripsSidebarRequestedOpen && isSidebarOpen) {
            closeSidebar();
        }
    }, [closeSidebar, isSidebarOpen, isTripsSidebarRequestedOpen, openSidebar]);

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

    const handleLogout = useCallback(async () => {
        setIsLogoutConfirmVisible(false);
        closeSidebar();
        try {
            await logout(true);
            router.replace('/(auth)/entry' as any);
        } catch {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
        }
    }, [closeSidebar, logout, router]);

    const handleAcceptInvite = useCallback(async (invite: TripInvite) => {
        setProcessingInviteId(invite.id);
        try {
            const tripId = await acceptInvite(invite.id);
            closeSidebar();
            if (tripId) {
                router.push(`/trip/${tripId}` as any);
            }
        } catch (error: any) {
            Alert.alert('Failed to join', error?.message || 'Something went wrong. Please try again.');
        } finally {
            setProcessingInviteId(null);
        }
    }, [acceptInvite, closeSidebar, router]);

    const handleDeclineInvite = useCallback(async (invite: TripInvite) => {
        setProcessingInviteId(invite.id);
        try {
            await declineInvite(invite.id);
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Failed to decline invite.');
        } finally {
            setProcessingInviteId(null);
        }
    }, [declineInvite]);

    const handleApproveDeleteRequest = useCallback(async (request: typeof deletionRequests[number]) => {
        setProcessingDeleteRequestId(request.id);
        try {
            deleteActivity(request.activityId);
            removeDeletionRequest(request.id);
            sendDeleteRequestCancelledBroadcast(request.tripId, request.id);
        } finally {
            setProcessingDeleteRequestId(null);
        }
    }, [deleteActivity, removeDeletionRequest]);

    const handleRejectDeleteRequest = useCallback(async (request: typeof deletionRequests[number]) => {
        setProcessingDeleteRequestId(request.id);
        try {
            removeDeletionRequest(request.id);
            sendDeleteRequestCancelledBroadcast(request.tripId, request.id);
        } finally {
            setProcessingDeleteRequestId(null);
        }
    }, [removeDeletionRequest]);

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
                startDateKey={item.startDateKey}
                endDateKey={item.endDateKey}
                homeCountry={item.homeCountry}
                budget={budgetDisplay}
                spent={spentDisplay}
                homeBudget={budgetHome}
                homeSpent={spentHome}
                homeCurrency={homeCurrency}
                tripCurrency={canToggleDisplayCurrency ? baselineCurrency : homeCurrency}
                isCompleted={item.isCompleted}
                onPress={() => safeNavigate(() => {
                    syncTrace('TripsList', 'open_trip_press', {
                        tripId: item.id,
                        title: item.title,
                        walletCount: item.wallets?.length || 0,
                    });
                    router.push(`/trip/${item.id}` as any);
                })}
                onLongPress={() => setSharingTrip(item)}
                onDelete={setDeletingTripId}
                onEdit={(id) => router.push(`/create-plan?editId=${id}` as any)}
            />
        );
    }, [expenseTotalsByTrip, router, safeNavigate]);

    const listHeader = useMemo(() => <View style={{ height: 16 }} />, []);

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
                pendingInvites={pendingInvites}
                deletionRequests={deletionRequests}
                processingInviteId={processingInviteId}
                processingDeleteRequestId={processingDeleteRequestId}
                sidebarPanHandlers={sidebarPanResponder.panHandlers}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                onApproveDeleteRequest={handleApproveDeleteRequest}
                onRejectDeleteRequest={handleRejectDeleteRequest}
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
                        rightElement={headerInboxCount > 0 ? (
                            <TouchableOpacity
                                onPress={openSidebar}
                                activeOpacity={0.85}
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 14,
                                    backgroundColor: isDark ? 'rgba(178,196,170,0.12)' : 'rgba(93,109,84,0.08)',
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(178,196,170,0.18)' : 'rgba(93,109,84,0.14)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Feather
                                    name="message-circle"
                                    size={18}
                                    color={isDark ? '#B2C4AA' : '#5D6D54'}
                                />
                                <View style={{
                                    position: 'absolute',
                                    top: -3,
                                    right: -3,
                                    minWidth: 18,
                                    height: 18,
                                    borderRadius: 9,
                                    backgroundColor: '#ef4444',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingHorizontal: 4,
                                }}>
                                    <Animated.Text style={{
                                        color: '#fff',
                                        fontSize: 9,
                                        fontWeight: '900',
                                    }}>
                                        {headerInboxCount}
                                    </Animated.Text>
                                </View>
                            </TouchableOpacity>
                        ) : undefined}
                    />

                    <FlatList
                        data={trips}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListHeaderComponent={listHeader}
                        ListEmptyComponent={renderEmptyComponent}
                        initialNumToRender={6}
                        maxToRenderPerBatch={6}
                        windowSize={5}
                        removeClippedSubviews
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
                description="This signs you out and clears locally cached trip data from this device."
                type="delete"
                confirmLabel="SIGN OUT"
            />
        </View>
    );
}
