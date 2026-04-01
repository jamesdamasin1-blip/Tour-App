import { useMemo } from 'react';
import { useStore } from '@/src/store/useStore';
import { ExchangeEvent } from '@/src/types/models';

export const useExchangeEvents = (tripId: string) => {
    const allExchangeEvents = useStore(state => state.exchangeEvents);
    const addExchangeEventAction = useStore(state => state.addExchangeEvent);
    const updateExchangeEventAction = useStore(state => state.updateExchangeEvent);
    const deleteExchangeEventAction = useStore(state => state.deleteExchangeEvent);

    const exchangeEvents = useMemo(() => 
        allExchangeEvents.filter(e => e.tripId === tripId), 
    [allExchangeEvents, tripId]);

    const addExchangeEvent = async (data: Omit<ExchangeEvent, 'id' | 'tripId'>) => {
        await addExchangeEventAction({ ...data, tripId });
    };

    const updateExchangeEvent = async (id: string, data: Partial<Omit<ExchangeEvent, 'id' | 'tripId'>>) => {
        await updateExchangeEventAction(id, data);
    };

    const deleteExchangeEvent = async (id: string) => {
        await deleteExchangeEventAction(id);
    };

    return {
        exchangeEvents,
        addExchangeEvent,
        updateExchangeEvent,
        deleteExchangeEvent
    };
};
