import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Header } from '@/components/Header';
import { TripCard } from '@/components/TripCard';
import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, View, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeshBackground } from '@/components/MeshBackground';
import { useNavigationGuard } from '@/src/hooks/useNavigationGuard';
import { useStore } from '@/src/store/useStore';
import { TripShareModal } from '@/components/TripShareModal';
import { TripPlan } from '@/src/types/models';
import { Alert } from 'react-native';
import { QRScannerModal } from '@/components/QRScannerModal';
import { JoinTripModal } from '@/components/JoinTripModal';
import { AddBuddyModal } from '@/components/AddBuddyModal';
import { GlassView } from '@/components/GlassView';
import { PendingInviteBanner } from '@/components/PendingInviteBanner';
import { useAuth } from '@/src/hooks/useAuth';
import { base64Decode } from '@/src/utils/base64';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TripsListScreen() {
    const trips = useStore(state => state.trips);
    const expenses = useStore(state => state.expenses);
    const deleteTrip = useStore(state => state.deleteTrip);
    const router = useRouter();
    const { logout, userId, displayName, email: userEmail } = useAuth();

    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
    const [sharingTrip, setSharingTrip] = useState<TripPlan | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
    const [isAddBuddyVisible, setIsAddBuddyVisible] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);
    const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const { safeNavigate } = useNavigationGuard();
    const { theme, importTrip, addMember } = useStore();
    const isDark = theme === 'dark';

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

                // Register the joining user as a member via server RPC
                // so they're in the DB members array (needed for RLS + realtime)
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

                        if (rpcError) {
                            console.warn('[JoinTrip] RPC failed, falling back to local:', rpcError.message);
                        }

                        // Update local members from server response or fallback to local
                        if (rpcResult?.members) {
                            useStore.setState(s => ({
                                trips: s.trips.map(t => t.id === tripData.id
                                    ? { ...t, members: rpcResult.members, lastModified: Date.now() }
                                    : t
                                ),
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
            } else {
                throw new Error('Invalid data');
            }
        } catch (e) {
            Alert.alert("Error", "Invalid trip code or QR data.");
        }
    };

    const handleLogout = useCallback(async () => {
        setIsLogoutConfirmVisible(false);
        try {
            await logout(false);
            router.replace('/(auth)/entry' as any);
        } catch (e) {
            Alert.alert("Error", "Failed to sign out. Please try again.");
        }
    }, [logout, router]);

    const menuItems = [
        { icon: 'plus' as const, label: 'CREATE TRIP', onPress: () => { setIsMenuOpen(false); router.push('/create-plan' as any); } },
        { icon: 'log-in' as const, label: 'JOIN TRIP', onPress: () => { setIsMenuOpen(false); setIsJoinModalVisible(true); } },
        { icon: 'user-plus' as const, label: 'ADD MEMBER', onPress: () => { setIsMenuOpen(false); setIsAddBuddyVisible(true); } },
        { icon: 'log-out' as const, label: 'LOGOUT', onPress: () => { setIsMenuOpen(false); setIsLogoutConfirmVisible(true); }, color: '#ef4444' },
    ];

    const renderEmptyComponent = useCallback(() => (
        <View className="flex-1 items-center justify-center px-10">
            <View className="p-8 rounded-full mb-8" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)' }}>
                <Feather name="map" size={56} color={isDark ? "#B2C4AA" : "#9EB294"} />
            </View>
            <Text testID="empty-state-text" className={`text-3xl font-black mb-4 text-center lowercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>ready for your next trip?</Text>
            <Text className={`text-center mb-0 text-base font-medium leading-6 ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>Create your first trip plan to start tracking your activities and budget!</Text>
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

        const balanceFormatted = Calculations.formatCurrency(totalBalanceHome, item.homeCurrency || 'PHP');

        let balanceDetail = '';
        if (tripWallets.length > 1) {
            balanceDetail = `${tripWallets.length} WALLETS ACTIVE`;
        } else if (tripWallets.length === 1 && tripWallets[0].currency !== item.homeCurrency) {
            balanceDetail = `In ${tripWallets[0].currency}`;
        }

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

    return (
        <MeshBackground>
            <Header
                title="MY TRIPS"
                subtitle="ALL YOUR ADVENTURES"
                showBack={false}
                leftElement={
                    <TouchableOpacity onPress={() => setIsMenuOpen(true)} className="p-2">
                        <Feather name="chevron-down" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                    </TouchableOpacity>
                }
            />

            <FlatList
                data={trips}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                ListHeaderComponent={<><View className="h-4" /><PendingInviteBanner /></>}
                ListEmptyComponent={renderEmptyComponent}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 200 }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                showsVerticalScrollIndicator={false}
                className="flex-1"
            />

            {/* Dynamic Bottom Fade Overlay */}
            {showBottomFade && (trips.length > 0) && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 120 + insets.bottom,
                        zIndex: 5,
                    }}
                >
                <LinearGradient
                        colors={[
                            isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                            isDark ? 'rgba(26, 28, 24, 0.9)' : 'rgba(242, 240, 232, 0.9)',
                            isDark ? 'rgba(26, 28, 24, 1)' : 'rgba(242, 240, 232, 1)'
                        ]}
                        style={{ flex: 1 }}
                    />
                </View>
            )}

            {/* Dropdown Menu */}
            <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
                    activeOpacity={1}
                    onPress={() => setIsMenuOpen(false)}
                >
                    <View style={{ paddingTop: insets.top + 52, paddingLeft: 16 }}>
                        <GlassView
                            intensity={isDark ? 40 : 90}
                            borderRadius={20}
                            backgroundColor={isDark ? "rgba(40, 44, 38, 0.97)" : "rgba(255, 255, 255, 0.97)"}
                            style={{ width: 200, overflow: 'hidden' }}
                        >
                            {menuItems.map((item, i) => (
                                <TouchableOpacity
                                    key={item.label}
                                    onPress={item.onPress}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center',
                                        paddingVertical: 14, paddingHorizontal: 18,
                                        borderBottomWidth: i < menuItems.length - 1 ? 1 : 0,
                                        borderBottomColor: isDark ? 'rgba(158,178,148,0.08)' : 'rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <Feather name={item.icon} size={16} color={item.color || (isDark ? '#B2C4AA' : '#5D6D54')} style={{ marginRight: 12 }} />
                                    <Text style={{
                                        fontSize: 11, fontWeight: '800', letterSpacing: 1,
                                        color: item.color || (isDark ? '#F2F0E8' : '#111827'),
                                    }}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </GlassView>
                    </View>
                </TouchableOpacity>
            </Modal>

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

            {/* Logout Confirmation */}
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
                    handleJoinTrip(data);
                }}
            />

            <JoinTripModal
                visible={isJoinModalVisible}
                onClose={() => setIsJoinModalVisible(false)}
                onScanQR={() => setIsScannerVisible(true)}
                onJoinWithCode={handleJoinTrip}
            />

            <AddBuddyModal
                visible={isAddBuddyVisible}
                onClose={() => setIsAddBuddyVisible(false)}
            />
        </MeshBackground>
    );
}
