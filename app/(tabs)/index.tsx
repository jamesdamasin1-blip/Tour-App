import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Header } from '@/components/Header';
import { TripCard } from '@/components/TripCard';
import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeshBackground } from '@/components/MeshBackground';
import { useNavigationGuard } from '@/src/hooks/useNavigationGuard';
import { useStore } from '@/src/store/useStore';
import { TripShareModal } from '@/components/TripShareModal';
import { TripPlan } from '@/src/types/models';
import { Alert } from 'react-native';
import { QRScannerModal } from '@/components/QRScannerModal';
import { JoinTripModal } from '@/components/JoinTripModal';
import { decode } from 'base-64';

export default function TripsListScreen() {
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const deleteTrip = useStore(state => state.deleteTrip);
    const router = useRouter();

    const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
    const [sharingTrip, setSharingTrip] = useState<TripPlan | null>(null);
    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [isJoinModalVisible, setIsJoinModalVisible] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);
    const insets = useSafeAreaInsets();
    const { safeNavigate } = useNavigationGuard();
    const { theme, importTrip } = useStore();
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

    const handleJoinTrip = (code: string) => {
        try {
            const tripData = JSON.parse(decode(code));
            if (tripData && tripData.id) {
                importTrip(tripData);
                router.push(`/trip/${tripData.id}` as any);
            } else {
                throw new Error('Invalid data');
            }
        } catch (e) {
            Alert.alert("Error", "Invalid trip code or QR data.");
        }
    };

    const showJoinOptions = () => {
        setIsJoinModalVisible(true);
    };

    const renderEmptyComponent = useCallback(() => (
        <View className="flex-1 items-center justify-center px-10">
            <View className="p-6 rounded-full mb-6" style={{ backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)' }}>
                <Feather name="map" size={48} color={isDark ? "#B2C4AA" : "#9EB294"} />
            </View>
            <Text className={`text-2xl font-black mb-2 text-center lowercase ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>ready for your next trip?</Text>
            <Text className={`text-center mb-0 ${isDark ? 'text-[#9EB294]' : 'text-gray-500'}`}>Create your first trip plan to start tracking your activities and budget!</Text>
        </View>
    ), [isDark]);

    const renderItem = useCallback(({ item }: { item: TripPlan }) => {
        const tripActivities = activities.filter(a => a.tripId === item.id);
        const totalSpent = Calculations.getTotalTripSpent(tripActivities);

        return (
            <TripCard
                id={item.id}
                title={item.title}
                countries={item.countries}
                startDate={item.startDate}
                endDate={item.endDate}
                budget={item.totalBudget}
                spent={totalSpent}
                isCompleted={item.isCompleted}
                onPress={() => safeNavigate(() => router.push(`/trip/${item.id}` as any))}
                onLongPress={() => setSharingTrip(item)}
                onDelete={(id) => setDeletingTripId(id)}
                onEdit={(id) => router.push(`/create-plan?editId=${id}` as any)}
            />
    );
    }, [activities, router, safeNavigate]);

    return (
        <MeshBackground>
            <Header
                title="MY TRIPS"
                subtitle="ALL YOUR ADVENTURES"
                showBack={false}
                leftElement={
                    <TouchableOpacity onPress={showJoinOptions} className="p-2">
                        <Feather name="plus-circle" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                    </TouchableOpacity>
                }
            />

            <FlatList
                data={trips}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                ListHeaderComponent={trips.length > 0 ? <View className="h-4" /> : null}
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

            <TripShareModal
                isVisible={!!sharingTrip}
                trip={sharingTrip}
                onClose={() => setSharingTrip(null)}
            />

            {/* Deletion Confirmation Modal */}
            <ConfirmationModal
                visible={!!deletingTripId}
                onClose={() => setDeletingTripId(null)}
                onConfirm={confirmDelete}
                title="Delete Trip?"
                description="This will permanently remove the trip and all its logged activities and expenses. This action cannot be undone."
                type="delete"
                confirmLabel="DELETE"
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
        </MeshBackground>
    );
}
