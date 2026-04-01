import { ActivitiesSection } from '@/components/Activities/ActivitiesSection';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ManageMembersModal } from '@/components/ManageBuddiesModal';
import { MeshBackground } from '@/components/MeshBackground';
import { SpontaneousExpenseFormData, SpontaneousExpenseModal } from '@/components/SpontaneousExpenseModal';
import { usePermissions } from '@/src/hooks/usePermissions';
import { useRealtimeSync } from '@/src/hooks/useRealtimeSync';
import { syncTrace } from '@/src/sync/debug';
import { AddExchangeModal } from '@/src/features/trip/components/AddExchangeModal';
import { ExchangeHistoryModal } from '@/src/features/trip/components/ExchangeHistoryModal';
import { TripChoiceModal } from '@/src/features/trip/components/TripChoiceModal';
import { TripDateNavigator } from '@/src/features/trip/components/TripDateNavigator';
import { TripDeleteRequestsPanel } from '@/src/features/trip/components/TripDeleteRequestsPanel';
import { TripDetailFooter } from '@/src/features/trip/components/TripDetailFooter';
import { TripDetailHeader } from '@/src/features/trip/components/TripDetailHeader';
import { TripOverviewCard } from '@/src/features/trip/components/TripOverviewCard';
import { useTripWallet } from '@/src/features/trip/hooks/useTripWallet';
import { useStore } from '@/src/store/useStore';
import { Activity } from '@/src/types/models';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const activities = useStore(state => state.activities);
    const deleteActivity = useStore(state => state.deleteActivity);
    const toggleActivityCompletion = useStore(state => state.toggleActivityCompletion);
    const updateActivity = useStore(state => state.updateActivity);
    const { sendDeleteRequest, sendDeleteRequestCancelled } = useRealtimeSync();
    const { theme } = useStore();
    const tripMutationCounts = useStore(state => state.tripMutationCounts);
    const deletionRequests = useStore(state => state.deletionRequests);
    const removeDeletionRequest = useStore(state => state.removeDeletionRequest);
    const isDark = theme === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [editingSpontaneousActivity, setEditingSpontaneousActivity] = useState<Activity | null>(null);
    const [isSpontaneousModalVisible, setIsSpontaneousModalVisible] = useState(false);
    const [isChoiceModalVisible, setIsChoiceModalVisible] = useState(false);
    const [isAddExchangeVisible, setIsAddExchangeVisible] = useState(false);
    const [isExchangeHistoryVisible, setIsExchangeHistoryVisible] = useState(false);
    const [isBuddiesVisible, setIsBuddiesVisible] = useState(false);
    const [selectedDateIndex, setSelectedDateIndex] = useState(0);
    const [showDeletePanel, setShowDeletePanel] = useState(false);
    const [budgetDisplayHome, setBudgetDisplayHome] = useState(true);
    const [selectedBalanceIndex, setSelectedBalanceIndex] = useState(0);

    const lastPressTime = useRef<number | null>(null);
    const listRef = useRef<ScrollView>(null);

    const {
        trip,
        walletsStats,
        totalWalletBalanceHome,
        homeCurrency,
    } = useTripWallet(id as string);

    const isTripFinancialSyncing = !!tripMutationCounts[id as string];
    const toggleBalanceMode = useCallback(() => {
        if (isTripFinancialSyncing) return;
        const statsCount = walletsStats?.length || 0;
        setSelectedBalanceIndex(prev => (prev + 1) % (statsCount + 1));
    }, [isTripFinancialSyncing, walletsStats?.length]);

    const balanceFormatted = useMemo(() => {
        if (!trip) return '...';

        try {
            if (selectedBalanceIndex === 0 || !walletsStats || walletsStats.length === 0) {
                return MathUtils.formatCurrency(totalWalletBalanceHome || 0, homeCurrency);
            }

            const wallet = walletsStats[selectedBalanceIndex - 1];
            if (!wallet) {
                return MathUtils.formatCurrency(totalWalletBalanceHome || 0, homeCurrency);
            }

            return MathUtils.formatCurrency(wallet.balance, wallet.currency);
        } catch (error) {
            console.error('Error formatting balance:', error);
            return 'Balance Error';
        }
    }, [homeCurrency, selectedBalanceIndex, totalWalletBalanceHome, trip, walletsStats]);

    const balanceDetail = useMemo(() => {
        if (!trip || !walletsStats || walletsStats.length === 0) return undefined;

        try {
            if (selectedBalanceIndex === 0) {
                return walletsStats.length > 1
                    ? `${walletsStats.length} MULTI-CURRENCY WALLETS`
                    : `COMBINED TOTAL IN ${homeCurrency}`;
            }

            const wallet = walletsStats[selectedBalanceIndex - 1];
            if (!wallet) return undefined;

            return `EQUIVALENT TO ${MathUtils.formatCurrency(wallet.homeEquivalent, homeCurrency)}`;
        } catch {
            return undefined;
        }
    }, [homeCurrency, selectedBalanceIndex, trip, walletsStats]);

    const tripActivities = useMemo(() => activities.filter(activity => activity.tripId === id), [activities, id]);
    const plannedActivities = useMemo(() => tripActivities.filter(activity => !activity.isSpontaneous), [tripActivities]);
    const completedActivitiesCount = useMemo(() => plannedActivities.filter(activity => activity.isCompleted).length, [plannedActivities]);
    const overallProgress = plannedActivities.length > 0 ? (completedActivitiesCount / plannedActivities.length) * 100 : 0;

    const tripCurrency = useMemo(() => walletsStats[0]?.currency || '', [walletsStats]);
    const primaryRate = useMemo(() => walletsStats[0]?.effectiveRate || 1, [walletsStats]);
    const toggleBudgetCurrency = useCallback(() => setBudgetDisplayHome(prev => !prev), []);

    const plannedAllottedHome = useMemo(() => {
        return tripActivities
            .filter(activity => !activity.isSpontaneous)
            .reduce((sum, activity) => {
                const budget = activity.allocatedBudget || 0;
                const budgetCurrency = activity.budgetCurrency || '';
                if (budgetCurrency === homeCurrency) return sum + budget;

                const wallet = trip?.wallets?.find(item => item.id === activity.walletId);
                const rate = wallet?.baselineExchangeRate || wallet?.defaultRate || 1;
                return sum + (budget * rate);
            }, 0);
    }, [homeCurrency, trip, tripActivities]);

    const totalCommittedHome = plannedAllottedHome;

    const totalWalletBudgetHome = useMemo(() => {
        if (!trip?.wallets) return 0;

        return trip.wallets.reduce((sum, wallet) => {
            const lots = (wallet as any).lots || [];
            return sum + lots.reduce((lotSum: number, lot: any) => {
                const amount = Number(lot.sourceAmount || 0);
                if (lot.sourceCurrency === homeCurrency) {
                    return lotSum + amount;
                }

                const rate = wallet.baselineExchangeRate || wallet.defaultRate || 1;
                const converted = Number(lot.originalConvertedAmount || 0);
                return lotSum + (converted * rate);
            }, 0);
        }, 0);
    }, [homeCurrency, trip]);

    const totalCommittedTrip = primaryRate > 0 ? totalCommittedHome / primaryRate : 0;
    const totalWalletBudgetTrip = primaryRate > 0 ? totalWalletBudgetHome / primaryRate : 0;
    const isOverBudget = totalCommittedHome > totalWalletBudgetHome;

    const { canEdit: isAdmin, isCreator, currentMember } = usePermissions(trip?.id || '');

    const activitiesByDate = useMemo(() => {
        const groups: { date: number; activities: Activity[] }[] = [];
        const sorted = [...tripActivities].sort((a, b) => a.date - b.date || a.time - b.time);

        sorted.forEach(activity => {
            const dateStr = new Date(activity.date).toDateString();
            const group = groups.find(item => new Date(item.date).toDateString() === dateStr);
            if (group) {
                group.activities.push(activity);
            } else {
                groups.push({ date: activity.date, activities: [activity] });
            }
        });

        return groups.sort((a, b) => a.date - b.date);
    }, [tripActivities]);

    const safeDateIndex = Math.min(selectedDateIndex, Math.max(0, activitiesByDate.length - 1));
    const currentGroup = activitiesByDate[safeDateIndex] || null;

    const handlePressActivity = useCallback((activity: Activity) => {
        const now = Date.now();
        if (lastPressTime.current && now - lastPressTime.current < 800) {
            return;
        }
        lastPressTime.current = now;

        if (activity.isCompleted) return;

        if (activity.expenses.length > 0) {
            router.push(`/create-activity?tripId=${id}&activityId=${activity.id}` as any);
        } else {
            router.push(`/add-expense/${activity.id}` as any);
        }
    }, [id, router]);

    const handleEditActivity = useCallback((activity: Activity) => {
        if (activity.isSpontaneous) {
            setEditingSpontaneousActivity(activity);
            setIsSpontaneousModalVisible(true);
            return;
        }

        setEditingActivity(activity);
    }, []);

    const confirmEditActivity = useCallback(() => {
        if (!editingActivity) return;

        const activityId = editingActivity.id;
        setEditingActivity(null);
        router.push(`/create-activity?tripId=${id}&activityId=${activityId}` as any);
    }, [editingActivity, id, router]);

    const handleDeleteActivity = useCallback((activity: Activity) => {
        setDeletingActivity(activity);
    }, []);

    const confirmDeleteActivity = useCallback(() => {
        if (!deletingActivity) return;
        deleteActivity(deletingActivity.id);
        setDeletingActivity(null);
    }, [deleteActivity, deletingActivity]);

    const tripDeletionRequests = deletionRequests.filter(request => request.tripId === id);

    const handleRequestDelete = useCallback((activity: Activity) => {
        if (!currentMember) return;

        sendDeleteRequest({
            id: `${Date.now()}-${activity.id}`,
            tripId: id as string,
            activityId: activity.id,
            activityTitle: activity.title,
            requestedByMemberId: currentMember.id,
            requestedByName: currentMember.name,
            requestedByColor: currentMember.color,
            requestedAt: Date.now(),
        });
    }, [currentMember, id, sendDeleteRequest]);

    const handleApproveDelete = useCallback((request: typeof tripDeletionRequests[0]) => {
        deleteActivity(request.activityId);
        removeDeletionRequest(request.id);
        sendDeleteRequestCancelled(request.tripId, request.id);
        if (tripDeletionRequests.length <= 1) {
            setShowDeletePanel(false);
        }
    }, [deleteActivity, removeDeletionRequest, sendDeleteRequestCancelled, tripDeletionRequests.length]);

    const handleRejectDelete = useCallback((request: typeof tripDeletionRequests[0]) => {
        removeDeletionRequest(request.id);
        sendDeleteRequestCancelled(request.tripId, request.id);
        if (tripDeletionRequests.length <= 1) {
            setShowDeletePanel(false);
        }
    }, [removeDeletionRequest, sendDeleteRequestCancelled, tripDeletionRequests.length]);

    const logSpontaneousExpense = useStore(state => state.logSpontaneousExpense);

    const handleCloseSpontaneousModal = useCallback(() => {
        setIsSpontaneousModalVisible(false);
        setEditingSpontaneousActivity(null);
    }, []);

    const handleLogSpontaneous = useCallback(async (data: SpontaneousExpenseFormData) => {
        syncTrace('TripScreen', 'handle_log_spontaneous', {
            tripId: id,
            editingActivityId: editingSpontaneousActivity?.id ?? null,
            data,
        });
        if (!editingSpontaneousActivity) {
            const { walletId, ...expenseData } = data;
            await logSpontaneousExpense(id, walletId, expenseData);
            return;
        }

        const existingExpense = editingSpontaneousActivity.expenses?.[0];
        const wallet = trip?.wallets?.find(item => item.id === data.walletId);
        const walletCurrency = wallet?.currency || existingExpense?.currency || editingSpontaneousActivity.budgetCurrency;

        await updateActivity(editingSpontaneousActivity.id, {
            walletId: data.walletId,
            title: data.title,
            category: data.category,
            date: data.date,
            allocatedBudget: data.amount,
            budgetCurrency: walletCurrency,
            isCompleted: true,
            isSpontaneous: true,
            countries: editingSpontaneousActivity.countries || [],
            lastModifiedBy: currentMember?.id || editingSpontaneousActivity.lastModifiedBy,
            expenses: existingExpense ? [{
                ...existingExpense,
                walletId: data.walletId,
                name: data.title,
                amount: data.amount,
                currency: walletCurrency,
                convertedAmountHome: data.convertedAmountHome ?? existingExpense.convertedAmountHome,
                convertedAmountTrip: data.convertedAmountTrip ?? existingExpense.convertedAmountTrip,
                category: data.category,
                date: data.date,
                originalAmount: data.originalAmount,
                originalCurrency: data.originalCurrency,
                lastModifiedBy: currentMember?.id || existingExpense.lastModifiedBy,
            }] : [],
        });
    }, [currentMember?.id, editingSpontaneousActivity, id, logSpontaneousExpense, trip?.wallets, updateActivity]);

    const handleReturnHome = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/(tabs)' as any);
    }, [router]);

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

            <TripDetailHeader
                title={trip.title?.toUpperCase() || ''}
                isCreator={isCreator}
                isDark={isDark}
                requestCount={tripDeletionRequests.length}
                showDeletePanel={showDeletePanel}
                onBack={handleReturnHome}
                onToggleDeletePanel={() => setShowDeletePanel(prev => !prev)}
            />

            <TripDeleteRequestsPanel
                insetsTop={insets.top}
                isCreator={isCreator}
                isDark={isDark}
                requests={tripDeletionRequests}
                visible={showDeletePanel}
                onApprove={handleApproveDelete}
                onDismiss={() => setShowDeletePanel(false)}
                onReject={handleRejectDelete}
            />

            <ScrollView
                ref={listRef as any}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                className="flex-1"
            >
                <TripOverviewCard
                    balanceDetail={balanceDetail}
                    balanceFormatted={balanceFormatted}
                    budgetDisplayHome={budgetDisplayHome}
                    completedActivitiesCount={completedActivitiesCount}
                    homeCurrency={homeCurrency}
                    isDark={isDark}
                    isOverBudget={isOverBudget}
                    isTripFinancialSyncing={isTripFinancialSyncing}
                    overallProgress={overallProgress}
                    plannedActivitiesCount={plannedActivities.length}
                    totalCommittedHome={totalCommittedHome}
                    totalCommittedTrip={totalCommittedTrip}
                    totalWalletBudgetHome={totalWalletBudgetHome}
                    totalWalletBudgetTrip={totalWalletBudgetTrip}
                    tripActivitiesCount={tripActivities.length}
                    tripCurrency={tripCurrency}
                    onOpenAddExchange={() => setIsAddExchangeVisible(true)}
                    onOpenExchangeHistory={() => setIsExchangeHistoryVisible(true)}
                    onToggleBalanceMode={toggleBalanceMode}
                    onToggleBudgetCurrency={toggleBudgetCurrency}
                />

                <TripDateNavigator
                    currentDate={currentGroup?.date}
                    dateCount={activitiesByDate.length}
                    isDark={isDark}
                    selectedIndex={safeDateIndex}
                    onNext={() => setSelectedDateIndex(prev => Math.min(activitiesByDate.length - 1, prev + 1))}
                    onPrevious={() => setSelectedDateIndex(prev => Math.max(0, prev - 1))}
                />

                <ActivitiesSection
                    activities={currentGroup?.activities || []}
                    tripTitle={trip.title}
                    onPress={handlePressActivity}
                    onEdit={isAdmin ? handleEditActivity : undefined}
                    onDelete={isCreator ? handleDeleteActivity : undefined}
                    onRequestDelete={!isCreator && isAdmin ? handleRequestDelete : undefined}
                    onToggleComplete={isAdmin ? toggleActivityCompletion : undefined}
                />
            </ScrollView>

            <TripDetailFooter
                bottomInset={insets.bottom}
                isAdmin={isAdmin}
                isDark={isDark}
                onOpenAnalysis={() => router.push('/(tabs)/analysis')}
                onOpenChoiceModal={() => setIsChoiceModalVisible(true)}
                onOpenHome={handleReturnHome}
            />

            <TripChoiceModal
                visible={isChoiceModalVisible}
                isDark={isDark}
                onClose={() => setIsChoiceModalVisible(false)}
                onManageMembers={() => {
                    setIsChoiceModalVisible(false);
                    setIsBuddiesVisible(true);
                }}
                onPlanActivity={() => {
                    setIsChoiceModalVisible(false);
                    router.push(`/create-activity?tripId=${id}` as any);
                }}
                onSpontaneousLog={() => {
                    setIsChoiceModalVisible(false);
                    setEditingSpontaneousActivity(null);
                    setIsSpontaneousModalVisible(true);
                }}
            />

            <SpontaneousExpenseModal
                visible={isSpontaneousModalVisible}
                onClose={handleCloseSpontaneousModal}
                onLog={handleLogSpontaneous}
                tripId={id as string}
                date={editingSpontaneousActivity?.date || currentGroup?.date || new Date().setHours(0, 0, 0, 0)}
                initialActivity={editingSpontaneousActivity}
            />

            <ConfirmationModal
                visible={!!deletingActivity}
                onClose={() => setDeletingActivity(null)}
                onConfirm={confirmDeleteActivity}
                title="Delete Activity?"
                description={`This will permanently remove "${deletingActivity?.title}" and all its expenses.`}
                type="delete"
                confirmLabel="DELETE"
            />

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
