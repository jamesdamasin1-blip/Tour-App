import { useEffect, useRef } from 'react';
import { useStore } from '@/src/store/useStore';
import { supabase } from '@/src/utils/supabase';
import { TripPlan } from '@/src/types/models';

export const useRealtimeSync = () => {
    const trips = useStore(state => state.trips);
    const activities = useStore(state => state.activities);
    const importTrip = useStore(state => state.importTrip);
    
    // Track channels globally to prevent duplicate subscriptions
    const channels = useRef<{ [key: string]: any }>({});

    useEffect(() => {
        // Subscribe to each trip's channel
        trips.forEach(trip => {
            if (channels.current[trip.id]) return;

            const channel = supabase.channel(`trip-${trip.id}`, {
                config: {
                    broadcast: { self: false },
                },
            });

            channel
                .on('broadcast', { event: 'trip-update' }, ({ payload }) => {
                    console.log(`Received update for trip ${trip.id}`);
                    importTrip(payload);
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`Subscribed to trip-${trip.id}`);
                    }
                });

            channels.current[trip.id] = channel;
        });

        // Cleanup stale channels (trips that were deleted)
        Object.keys(channels.current).forEach(id => {
            if (!trips.find(t => t.id === id)) {
                supabase.removeChannel(channels.current[id]);
                delete channels.current[id];
            }
        });
    }, [trips, importTrip]);

    // Broadcast logic
    const lastBroadcasted = useRef<{ [key: string]: number }>({});

    useEffect(() => {
        trips.forEach(trip => {
            const tripActivities = activities.filter(a => a.tripId === trip.id);
            const payload = { ...trip, activities: tripActivities };
            
            // Only broadcast if the local state is newer than what we last broadcasted
            if (!lastBroadcasted.current[trip.id] || trip.lastModified > lastBroadcasted.current[trip.id]) {
                const channel = channels.current[trip.id];
                if (channel) {
                    channel.send({
                        type: 'broadcast',
                        event: 'trip-update',
                        payload: payload,
                    });
                    lastBroadcasted.current[trip.id] = trip.lastModified;
                    console.log(`Broadcasted update for trip ${trip.id}`);
                }
            }
        });
    }, [trips, activities]);
};
