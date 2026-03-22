import { ConfirmationModal } from '@/components/ConfirmationModal';
import { SpontaneousExpenseModal } from '@/components/SpontaneousExpenseModal';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { ProgressBar } from '@/components/ProgressBar';
import { MeshBackground } from '@/components/MeshBackground';
import { TabBg } from '@/components/TabBg';
import { ActivitiesSection } from '@/components/Activities/ActivitiesSection';
import { useStore } from '@/src/store/useStore';
import { Activity } from '@/src/types/models';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import { TripWalletCard } from '@/src/features/trip/components/TripWalletCard'; // Keep for now in case of issues
import { AddExchangeModal } from '@/src/features/trip/components/AddExchangeModal';
import { ExchangeHistoryModal } from '@/src/features/trip/components/ExchangeHistoryModal';
import { useTripWallet } from '@/src/features/trip/hooks/useTripWallet';
import { StatusBar } from 'expo-status-bar';
import { BottomFade } from '@/components/BottomFade';
import { ManageMembersModal } from '@/components/ManageBuddiesModal';
import { usePermissions } from '@/src/hooks/usePermissions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TripDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const deleteActivity = useStore(state => state.deleteActivity);
    const toggleActivityCompletion = useStore(state => state.toggleActivityCompletion);
    const subscribeToTrip = useStore(state => state.subscribeToTrip);
    const { theme, toggleTheme } = useStore();
    const isDark = theme === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [isSpontaneousModalVisible, setIsSpontaneousModalVisible] = useState(false);
    const [isChoiceModalVisible, setIsChoiceModalVisible] = useState(false);
    const [isAddExchangeVisible, setIsAddExchangeVisible] = useState(false);
    const [isExchangeHistoryVisible, setIsExchangeHistoryVisible] = useState(false);
    const [isBuddiesVisible, setIsBuddiesVisible] = useState(false);
    const [selectedDateIndex, setSelectedDateIndex] = useState(0);
    const lastPressTime = useRef<number | null>(null);
    const listRef = useRef<ScrollView>(null);

    const { 
        trip, 
        walletsStats, 
        totalWalletBalanceHome, 
        totalWalletBalanceTrip,
        homeCurrency 
    } = useTripWallet(id as string);
    
    const [selectedBalanceIndex, setSelectedBalanceIndex] = useState(0); // 0: Total Home, 1+: Specific Wallet Trip
    const toggleBalanceMode = useCallback(() => {
        const statsCount = walletsStats?.length || 0;
        setSelectedBalanceIndex(prev => (prev + 1) % (statsCount + 1));
    }, [walletsStats?.length]);

    const balanceFormatted = useMemo(() => {
        if (!trip) return '...';
        
        try {
            if (selectedBalanceIndex === 0 || !walletsStats || walletsStats.length === 0) {
                return MathUtils.formatCurrency(totalWalletBalanceHome || 0, homeCurrency);
            } else {
                const wallet = walletsStats[selectedBalanceIndex - 1];
                if (!wallet) return MathUtils.formatCurrency(totalWalletBalanceHome || 0, homeCurrency);
                return MathUtils.formatCurrency(wallet.balance, wallet.currency);
            }
        } catch (e) {
            console.error('Error formatting balance:', e);
            return 'Balance Error';
        }
    }, [totalWalletBalanceHome, homeCurrency, trip, selectedBalanceIndex, walletsStats]);

    const balanceDetail = useMemo(() => {
        if (!trip || !walletsStats || walletsStats.length === 0) return undefined;
        
        try {
            if (selectedBalanceIndex === 0) {
                // Global View: Show context about count
                return walletsStats.length > 1 
                    ? `${walletsStats.length} MULTI-CURRENCY WALLETS` 
                    : `COMBINED TOTAL IN ${homeCurrency}`;
            } else {
                // Wallet View: Show Equivalent in Home Currency to prevent currency shock
                const wallet = walletsStats[selectedBalanceIndex - 1];
                if (!wallet) return undefined;
                return `EQUIVALENT TO ${MathUtils.formatCurrency(wallet.homeEquivalent, homeCurrency)}`;
            }
        } catch (e) {
            return undefined;
        }
    }, [trip, walletsStats, homeCurrency, selectedBalanceIndex]);

    const tripActivities = useMemo(() => activities.filter(a => a.tripId === id), [activities, id]);

    const totalSpent = useMemo(() => MathUtils.getTotalTripSpent(tripActivities), [tripActivities]);
    const totalBudget = useMemo(() => trip?.totalBudget || 0, [trip]);

    const plannedActivities = useMemo(() => tripActivities.filter(a => !a.isSpontaneous), [tripActivities]);
    const completedActivitiesCount = useMemo(() => plannedActivities.filter(a => a.isCompleted).length, [plannedActivities]);
    const overallProgress = plannedActivities.length > 0 ? (completedActivitiesCount / plannedActivities.length) * 100 : 0;

    // Primary trip currency (first wallet's currency)
    const tripCurrency = useMemo(() => walletsStats[0]?.currency || '', [walletsStats]);
    const primaryRate = useMemo(() => walletsStats[0]?.effectiveRate || 1, [walletsStats]);

    const [budgetDisplayHome, setBudgetDisplayHome] = useState(true);
    const toggleBudgetCurrency = useCallback(() => setBudgetDisplayHome(prev => !prev), []);

    // Planned: sum of allotted budgets in home currency
    const plannedAllottedHome = useMemo(() => {
        return tripActivities
            .filter(a => !a.isSpontaneous)
            .reduce((sum, activity) => {
                const budget = activity.allocatedBudget || 0;
                const budgetCurrency = activity.budgetCurrency || '';
                if (budgetCurrency === homeCurrency) return sum + budget;
                const wallet = trip?.wallets?.find(w => w.id === activity.walletId);
                const rate = wallet?.baselineExchangeRate || wallet?.defaultRate || 1;
                return sum + (budget * rate);
            }, 0);
    }, [tripActivities, homeCurrency, trip]);

    // Spontaneous: actual spent in home currency
    const spontaneousSpentHome = useMemo(() => {
        return tripActivities
            .filter(a => !!a.isSpontaneous)
            .reduce((sum, a) => sum + (a.expenses || []).reduce((s, e) => s + (e.convertedAmountHome || 0), 0), 0);
    }, [tripActivities]);

    // Total committed = planned budgets + spontaneous actual spending
    const totalCommittedHome = plannedAllottedHome + spontaneousSpentHome;

    // Initial wallet budget only (lot 0 / default lot) in home currency — excludes added funds
    const totalWalletBudgetHome = useMemo(() => {
        if (!trip?.wallets) return 0;
        return trip.wallets.reduce((sum, wallet) => {
            const lots = (wallet as any).lots || [];
            const initialLot = lots.find((l: any) => l.isDefault) || lots[0];
            if (!initialLot) return sum;
            if (initialLot.sourceCurrency === homeCurrency) {
                return sum + initialLot.sourceAmount;
            }
            const rate = wallet.baselineExchangeRate || wallet.defaultRate || 1;
            return sum + (initialLot.originalConvertedAmount * rate);
        }, 0);
    }, [trip, homeCurrency]);

    // Trip currency equivalents (divide home by primary rate)
    const totalCommittedTrip = primaryRate > 0 ? totalCommittedHome / primaryRate : 0;
    const totalWalletBudgetTrip = primaryRate > 0 ? totalWalletBudgetHome / primaryRate : 0;

    const isOverBudget = totalCommittedHome > totalWalletBudgetHome;

    const { canEdit: isAdmin } = usePermissions(trip?.id || '');

    // Pagination Logic: Group by date
    const activitiesByDate = useMemo(() => {
        const groups: { date: number; activities: Activity[] }[] = [];
        const sorted = [...tripActivities].sort((a, b) => a.date - b.date || a.time - b.time);
        
        sorted.forEach(activity => {
            const dateStr = new Date(activity.date).toDateString();
            const group = groups.find(g => new Date(g.date).toDateString() === dateStr);
            if (group) {
                group.activities.push(activity);
            } else {
                groups.push({ date: activity.date, activities: [activity] });
            }
        });
        
        return groups.sort((a, b) => a.date - b.date);
    }, [tripActivities]);

    const currentGroup = activitiesByDate[selectedDateIndex] || null;

    // Subscribe to realtime updates — harmless if trip isn't in Supabase yet
    React.useEffect(() => {
        const unsubscribe = subscribeToTrip(id);
        return () => unsubscribe();
    }, [id]);

    const tripDuration = useMemo(() => {
        if (!trip) return '';
        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        const startStr = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const endStr = end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startStr} - ${endStr}`;
    }, [trip]);

    const handlePressActivity = useCallback((activity: Activity) => {
        const now = Date.now();
        if (lastPressTime.current && (now - lastPressTime.current < 800)) {
            return;
        }
        lastPressTime.current = now;

        if (activity.isCompleted) return;

        if (activity.expenses.length > 0) {
            router.push(`/create-activity?tripId=${id}&activityId=${activity.id}` as any);
        } else {
            router.push(`/add-expense/${activity.id}` as any);
        }
    }, [router, id]);

    const handleEditActivity = useCallback((activity: Activity) => {
        setEditingActivity(activity);
    }, []);

    const confirmEditActivity = useCallback(() => {
        if (editingActivity) {
            const activityId = editingActivity.id;
            setEditingActivity(null);
            router.push(`/create-activity?tripId=${id}&activityId=${activityId}` as any);
        }
    }, [editingActivity, router, id]);

    const handleDeleteActivity = useCallback((activity: Activity) => {
        setDeletingActivity(activity);
    }, []);

    const confirmDeleteActivity = useCallback(() => {
        if (deletingActivity) {
            deleteActivity(deletingActivity.id);
            setDeletingActivity(null);
        }
    }, [deletingActivity, deleteActivity]);

    const logSpontaneousExpense = useStore(state => state.logSpontaneousExpense);

    const handleLogSpontaneous = useCallback((data: any) => {
        // Extract walletId from data and pass it as the second argument
        const { walletId, ...expenseData } = data;
        logSpontaneousExpense(id, walletId, expenseData);
    }, [id, logSpontaneousExpense]);


    const [showBottomFade, setShowBottomFade] = useState(false);

    const handleScroll = useCallback((event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    const renderHeader = useCallback(() => (
            <Header 
                title={trip?.title?.toUpperCase() || ''} 
                showBack={true}
                onBack={() => router.replace('/')}
                showThemeToggle={false}
            />
        ), [trip, router]);

    if (!trip) {
        return (
            <MeshBackground>
                <View className="flex-1 items-center justify-center p-6">
                    <Feather name="alert-triangle" size={48} color="#ef4444" />
                    <Text className="text-white text-xl font-bold mt-4">Trip not found</Text>
                </View>
            </MeshBackground>
        );
    }

    return (
        <MeshBackground style={{ flex: 1 }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            
            {renderHeader()}

            <ScrollView
                ref={listRef as any}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 150 }}
                className="flex-1"
            >
                {/* Stats card */}
                <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                    <GlassView
                        intensity={isDark ? 50 : 80}
                        borderRadius={24}
                        borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.6)" : "rgba(255, 255, 255, 0.6)"}
                        style={{
                            overflow: 'hidden',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: isDark ? 0.08 : 0.04,
                            shadowRadius: 10,
                            elevation: 4,
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 }}>
                            {/* Activity Progress */}
                            <View style={{ flex: 1.1, paddingRight: 12 }}>
                                <View className="mb-2">
                                    <Text className={`text-[10px] font-black uppercase tracking-[1.5px] ${isDark ? 'text-[#9EB294]' : 'text-[#6B7280]'}`}>
                                        ACTIVITY PROGRESS
                                    </Text>
                                </View>
                                <ProgressBar
                                    progress={overallProgress}
                                    gradientColors={isDark ? ['#9EB294', '#5D6D54'] : ['#B5C0A2', '#5D6D54']}
                                    trackColor={isDark ? "rgba(158, 178, 148, 0.05)" : "rgba(158, 178, 148, 0.2)"}
                                    height={24}
                                    fontSize={10}
                                    floatingLabel={`${completedActivitiesCount}/${plannedActivities.length}`}
                                />
                            </View>

                            <View style={{ width: 1, height: '70%', backgroundColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.12)', marginHorizontal: 8 }} />

                            {/* Wallet Balance */}
                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                <GestureDetector
                                    gesture={Gesture.Exclusive(
                                        Gesture.Pan()
                                            .activeOffsetX([-10, 10])
                                            .onEnd((event: any) => {
                                                if (Math.abs(event.translationX) > 30) runOnJS(toggleBalanceMode)();
                                            }),
                                        Gesture.LongPress()
                                            .onEnd(() => { runOnJS(setIsExchangeHistoryVisible)(true); }),
                                        Gesture.Tap()
                                            .onEnd(() => { runOnJS(setIsAddExchangeVisible)(true); })
                                    )}
                                >
                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <Text className={`text-[10px] font-black uppercase tracking-[1.5px] mb-1 ${isDark ? 'text-[#9EB294]' : 'text-[#6B7280]'}`} numberOfLines={1}>
                                            WALLET
                                        </Text>
                                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                                            style={{ fontSize: 17, fontWeight: '900', color: isDark ? '#B2C4AA' : '#5D6D54' }}>
                                            {balanceFormatted}
                                        </Text>
                                        {balanceDetail && (
                                            <Text numberOfLines={1}
                                                style={{ fontSize: 7, fontWeight: '700', color: isDark ? '#9EB294' : '#9ca3af', marginTop: 1, letterSpacing: 0.5, opacity: 0.8, textTransform: 'uppercase' }}>
                                                {balanceDetail}
                                            </Text>
                                        )}
                                    </View>
                                </GestureDetector>
                            </View>
                        </View>

                        {/* Budget Allocation Indicator — inside stats card, spanning full width */}
                        {tripActivities.length > 0 && totalWalletBudgetHome > 0 && (
                            <GestureDetector
                                gesture={Gesture.Pan()
                                    .activeOffsetY([10, 50])
                                    .onEnd((event: any) => {
                                        if (event.translationY > 20) runOnJS(toggleBudgetCurrency)();
                                    })
                                }
                            >
                                <View style={{
                                    paddingHorizontal: 20,
                                    paddingBottom: 14,
                                    paddingTop: 2,
                                }}>
                                    <View style={{
                                        height: 1,
                                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(93, 109, 84, 0.08)',
                                        marginBottom: 10,
                                    }} />
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Feather
                                                name={isOverBudget ? 'alert-circle' : 'check-circle'}
                                                size={11}
                                                color={isOverBudget ? '#ef4444' : (isDark ? '#9EB294' : '#5D6D54')}
                                                style={{ marginRight: 4 }}
                                            />
                                            <Text style={{
                                                fontSize: 9, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase',
                                                color: isOverBudget ? '#ef4444' : (isDark ? '#9EB294' : '#6B7280'),
                                            }}>
                                                {isOverBudget ? 'OVER BUDGET' : 'WITHIN BUDGET'}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 7, fontWeight: '700', color: isDark ? '#9EB294' : '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                            Allotted vs Wallet
                                        </Text>
                                    </View>
                                    {/* Budget bar with amount inside */}
                                    <View style={{
                                        height: 20, borderRadius: 10, overflow: 'hidden',
                                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(158, 178, 148, 0.15)',
                                    }}>
                                        <View style={{
                                            height: '100%', borderRadius: 10,
                                            width: `${Math.min((totalCommittedHome / totalWalletBudgetHome) * 100, 100)}%`,
                                            backgroundColor: isOverBudget ? '#ef4444' : (isDark ? '#B2C4AA' : '#5D6D54'),
                                            justifyContent: 'center',
                                        }}>
                                            <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff', paddingHorizontal: 8 }} numberOfLines={1}>
                                                {budgetDisplayHome
                                                    ? `${MathUtils.formatCurrency(totalCommittedHome, homeCurrency)} / ${MathUtils.formatCurrency(totalWalletBudgetHome, homeCurrency)}`
                                                    : `${MathUtils.formatCurrency(totalCommittedTrip, tripCurrency)} / ${MathUtils.formatCurrency(totalWalletBudgetTrip, tripCurrency)}`
                                                }
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </GestureDetector>
                        )}
                    </GlassView>
                </View>

                {/* Date navigator */}
                {activitiesByDate.length > 1 && (
                    <View className="mt-6 mb-2">
                        <View className="flex-row items-center justify-between mb-4 px-4">
                            <TouchableOpacity
                                onPress={() => setSelectedDateIndex(prev => Math.max(0, prev - 1))}
                                disabled={selectedDateIndex === 0}
                                style={{ opacity: selectedDateIndex === 0 ? 0.3 : 1 }}
                                className={`w-10 h-10 rounded-full items-center justify-center ${isDark ? 'bg-[#3A3F37]' : 'bg-[#F2F0E8]'}`}
                            >
                                <Feather name="chevron-left" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>

                            <View className="items-center">
                                <Text className={`text-[10px] font-black tracking-[2px] ${isDark ? 'text-[#9EB294]' : 'text-gray-400'}`}>
                                    DAY {selectedDateIndex + 1} OF {activitiesByDate.length}
                                </Text>
                                <Text className={`text-[14px] font-black ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>
                                    {new Date(currentGroup?.date || 0).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                                </Text>
                            </View>

                            <TouchableOpacity
                                onPress={() => setSelectedDateIndex(prev => Math.min(activitiesByDate.length - 1, prev + 1))}
                                disabled={selectedDateIndex === activitiesByDate.length - 1}
                                style={{ opacity: selectedDateIndex === activitiesByDate.length - 1 ? 0.3 : 1 }}
                                className={`w-10 h-10 rounded-full items-center justify-center ${isDark ? 'bg-[#3A3F37]' : 'bg-[#F2F0E8]'}`}
                            >
                                <Feather name="chevron-right" size={20} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Continuous activities section — planned then spontaneous */}
                <ActivitiesSection
                    activities={currentGroup?.activities || []}
                    tripTitle={trip?.title}
                    onPress={handlePressActivity}
                    onEdit={isAdmin ? handleEditActivity : undefined}
                    onDelete={isAdmin ? handleDeleteActivity : undefined}
                    onToggleComplete={isAdmin ? toggleActivityCompletion : undefined}
                />
            </ScrollView>

            <BottomFade visible={showBottomFade} />

            {/* Permanent gradient fade above footer so cards don't overlap */}
            <View pointerEvents="none" style={{
                position: 'absolute', bottom: 64 + insets.bottom, left: 0, right: 0, height: 60, zIndex: 9,
            }}>
                <LinearGradient
                    colors={[
                        isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                        isDark ? 'rgba(26, 28, 24, 0.95)' : 'rgba(242, 240, 232, 0.95)',
                    ]}
                    style={{ flex: 1 }}
                />
            </View>

            <View style={[styles.footerContainer, { height: 64 + insets.bottom, paddingBottom: insets.bottom, zIndex: 10 }]}>
                <TabBg />
                <View style={styles.footerIcons}>
                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)')}
                        className="flex-1 items-center justify-center h-full"
                    >
                        <Feather name="home" size={26} color="#9EB294" />
                    </TouchableOpacity>

                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        {isAdmin && (
                            <TouchableOpacity
                                testID="btn-add-activity"
                                style={{ alignItems: 'center', justifyContent: 'center', top: -44 }}
                                onPress={() => setIsChoiceModalVisible(true)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.fab}>
                                    <Feather name="plus" size={36} color="#fff" />
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/analysis')}
                        className="flex-1 items-center justify-center h-full"
                    >
                        <Feather name="bar-chart-2" size={26} color="#9ca3af" />
                    </TouchableOpacity>
                </View>
            </View>


            {/* Choice Modal */}
            <Modal
                visible={isChoiceModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsChoiceModalVisible(false)}
            >
                <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={1}
                    onPress={() => setIsChoiceModalVisible(false)}
                >
                    <GlassView
                        intensity={isDark ? 30 : 90}
                        borderRadius={32}
                        backgroundColor={isDark ? "rgba(40, 44, 38, 0.95)" : "rgba(255, 255, 255, 0.95)"}
                        style={{ width: SCREEN_WIDTH - 64, padding: 32 }}
                    >
                        <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textAlign: 'center', marginBottom: 24, letterSpacing: 1 }}>WHAT'S THE PLAN?</Text>
                        
                        <TouchableOpacity 
                            onPress={() => {
                                setIsChoiceModalVisible(false);
                                router.push(`/create-activity?tripId=${id}` as any);
                            }}
                            className="bg-[#5D6D54] py-4 rounded-2xl flex-row items-center justify-center mb-4"
                        >
                            <Feather name="calendar" size={20} color="#fff" style={{ marginRight: 10 }} />
                            <Text className="text-white font-black uppercase tracking-widest text-[12px]">Plan Activity</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                setIsChoiceModalVisible(false);
                                setIsSpontaneousModalVisible(true);
                            }}
                            style={{ borderColor: '#5D6D54', borderWidth: 2 }}
                            className="py-4 rounded-2xl flex-row items-center justify-center mb-4"
                        >
                            <Feather name="zap" size={20} color="#5D6D54" style={{ marginRight: 10 }} />
                            <Text className="text-[#5D6D54] font-black uppercase tracking-widest text-[12px]">Spontaneous Log</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                setIsChoiceModalVisible(false);
                                setIsBuddiesVisible(true);
                            }}
                            style={{ borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)', borderWidth: 1 }}
                            className="py-4 rounded-2xl flex-row items-center justify-center"
                        >
                            <Feather name="users" size={18} color={isDark ? '#9EB294' : '#6B7280'} style={{ marginRight: 10 }} />
                            <Text style={{ color: isDark ? '#9EB294' : '#6B7280' }} className="font-black uppercase tracking-widest text-[12px]">Manage Members</Text>
                        </TouchableOpacity>
                    </GlassView>
                </TouchableOpacity>
            </Modal>

            <SpontaneousExpenseModal
                visible={isSpontaneousModalVisible}
                onClose={() => setIsSpontaneousModalVisible(false)}
                onLog={handleLogSpontaneous}
                tripId={id as string}
                date={currentGroup?.date || new Date().setHours(0,0,0,0)}
            />

            {/* Deletion Confirmation Modal */}
            <ConfirmationModal
                visible={!!deletingActivity}
                onClose={() => setDeletingActivity(null)}
                onConfirm={confirmDeleteActivity}
                title="Delete Activity?"
                description={`This will permanently remove "${deletingActivity?.title}" and all its expenses.`}
                type="delete"
                confirmLabel="DELETE"
            />

            {/* Edit Confirmation Modal */}
            <ConfirmationModal
                visible={!!editingActivity}
                onClose={() => setEditingActivity(null)}
                onConfirm={confirmEditActivity}
                title="Edit Activity?"
                description={`Do you want to edit the details for "${editingActivity?.title}"?`}
                type="edit"
                confirmLabel="EDIT"
            />

            <AddExchangeModal
                tripId={id as string}
                visible={isAddExchangeVisible}
                onClose={() => setIsAddExchangeVisible(false)}
            />

            <ExchangeHistoryModal
                tripId={id as string}
                visible={isExchangeHistoryVisible}
                onClose={() => setIsExchangeHistoryVisible(false)}
            />

            <ManageMembersModal
                tripId={id as string}
                visible={isBuddiesVisible}
                onClose={() => setIsBuddiesVisible(false)}
            />
        </MeshBackground>
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
    footerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
    },
    footerIcons: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
    },
});
