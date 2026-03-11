import { ActivityListItem } from '@/components/ActivityListItem';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { GlassView } from '@/components/GlassView';
import { Header } from '@/components/Header';
import { ProgressBar } from '@/components/ProgressBar';
import { SectionHeader } from '@/components/SectionHeader';
import { MeshBackground } from '@/components/MeshBackground';
import { TabBg } from '@/components/TabBg';
import { useStore } from '@/src/store/useStore';
import { Activity } from '@/src/types/models';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const deleteActivity = useStore(state => state.deleteActivity);
    const toggleActivityCompletion = useStore(state => state.toggleActivityCompletion);
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const lastPressTime = useRef<number | null>(null);

    const trip = useMemo(() => trips.find(t => t.id === id), [trips, id]);
    const tripActivities = useMemo(() => activities.filter(a => a.tripId === id), [activities, id]);

    const totalSpent = useMemo(() => MathUtils.getTotalTripSpent(tripActivities), [tripActivities]);
    const totalBudget = useMemo(() => trip?.totalBudget || 0, [trip]);

    const completedActivitiesCount = useMemo(() => tripActivities.filter(a => a.isCompleted).length, [tripActivities]);
    const overallProgress = tripActivities.length > 0 ? (completedActivitiesCount / tripActivities.length) * 100 : 0;

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

    const renderEmptyComponent = useCallback(() => (
        <View className="flex-1 items-center justify-center px-10">
            <View className="p-6 rounded-full mb-6" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)' }}>
                <Feather name="plus" size={48} color={isDark ? "#B2C4AA" : "#9EB294"} />
            </View>
            <Text className={`text-2xl font-black mb-3 text-center tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>Add Activity</Text>
            <Text className={`text-center font-medium leading-5 ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>
                Tap the button below to add your first activity for <Text className={isDark ? "text-[#B2C4AA] font-bold" : "text-[#5D6D54] font-bold"}>{trip?.title}</Text>!
            </Text>
        </View>
    ), [trip, isDark]);

    const renderItem = useCallback(({ item }: { item: Activity }) => (
        <ActivityListItem
            activity={item}
            onPress={handlePressActivity}
            onEdit={handleEditActivity}
            onDelete={handleDeleteActivity}
            onToggleComplete={() => toggleActivityCompletion(item.id)}
        />
    ), [handlePressActivity, handleEditActivity, handleDeleteActivity]);

    const [showAllActivities, setShowAllActivities] = useState(true);
    const [showBottomFade, setShowBottomFade] = useState(false);

    const handleScroll = useCallback((event: any) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        const isScrollable = contentSize.height > layoutMeasurement.height;
        setShowBottomFade(isScrollable && !isCloseToBottom);
    }, []);

    if (!trip) {
        return (
            <MeshBackground style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Text>Trip not found</Text>
                <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-[#5D6D54] px-6 py-3 rounded-xl">
                    <Text className="text-white font-bold">Go Back</Text>
                </TouchableOpacity>
            </MeshBackground>
        );
    }

    return (
        <MeshBackground>

            <Header
                title={trip.title.toUpperCase()}
                subtitle={tripDuration}
                showBack={true}
            />

            <FlatList
                data={showAllActivities ? tripActivities : tripActivities.slice(0, 3)}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                ListHeaderComponent={tripActivities.length > 0 ? (
                    <View className="px-6 pb-2 pt-6">
                        <View className="mb-2">
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
                                <View className="px-5 py-6">
                                    <View className="mb-2">
                                        <Text className={`text-[16px] font-black uppercase tracking-widest text-center ${isDark ? 'text-[#F2F0E8]' : 'text-[#5D6D54]'}`}>
                                            ACTIVITY PROGRESS
                                        </Text>
                                    </View>
                                    <View style={{ marginTop: 12 }}>
                                        <ProgressBar
                                            progress={overallProgress}
                                            gradientColors={isDark ? ['#9EB294', '#5D6D54'] : ['#B5C0A2', '#5D6D54']}
                                            trackColor={isDark ? "rgba(158, 178, 148, 0.05)" : "rgba(158, 178, 148, 0.2)"}
                                            height={32}
                                            fontSize={14}
                                            floatingLabel={`${completedActivitiesCount} / ${tripActivities.length} ACTIVITIES`}
                                        />
                                    </View>
                                </View>
                            </GlassView>
                        </View>
                        <SectionHeader
                            title="Activity Log"
                            actionLabel={showAllActivities ? "Show less" : "See all"}
                            onAction={() => setShowAllActivities(!showAllActivities)}
                        />
                    </View>
                ) : null}
                ListEmptyComponent={renderEmptyComponent}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 150 }}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                className="flex-1"
            />

            {/* Dynamic Bottom Fade Overlay */}
            {showBottomFade && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 200 + insets.bottom,
                        zIndex: 5,
                    }}
                >
                    <LinearGradient
                        colors={[
                            isDark ? 'rgba(26, 28, 24, 0)' : 'rgba(242, 240, 232, 0)',
                            isDark ? 'rgba(26, 28, 24, 0.4)' : 'rgba(242, 240, 232, 0.4)',
                            isDark ? 'rgba(26, 28, 24, 0.8)' : 'rgba(242, 240, 232, 0.8)',
                            isDark ? 'rgba(26, 28, 24, 1)' : 'rgba(242, 240, 232, 1)'
                        ]}
                        style={{ flex: 1 }}
                    />
                </View>
            )}

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
                        <TouchableOpacity
                            style={{ alignItems: 'center', justifyContent: 'center', top: -44 }}
                            onPress={() => router.push(`/create-activity?tripId=${id}` as any)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.fab}>
                                <Feather name="plus" size={36} color="#fff" />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/analysis')}
                        className="flex-1 items-center justify-center h-full"
                    >
                        <Feather name="bar-chart-2" size={26} color="#9ca3af" />
                    </TouchableOpacity>
                </View>
            </View>


            {/* Deletion Confirmation Modal */}
            <ConfirmationModal
                visible={!!deletingActivity}
                onClose={() => setDeletingActivity(null)}
                onConfirm={confirmDeleteActivity}
                title="Delete Activity?"
                description={`This will permanently remove "${deletingActivity?.title}" and all its expenses. This action cannot be undone.`}
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
    }
});
