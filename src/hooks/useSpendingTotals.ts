import { useMemo } from 'react';
import { Activity } from '../types/models';

function sumActivities(activities: Activity[]): number {
    return activities.reduce(
        (s, a) => s + (a.expenses || []).reduce((es, e) => es + (e.convertedAmountHome || 0), 0),
        0
    );
}

export interface SpendingTotals {
    overall: number;
    planned: number;
    spontaneous: number;
}

export function useSpendingTotals(activities: Activity[]): SpendingTotals {
    return useMemo(() => {
        const planned = activities.filter(a => !a.isSpontaneous);
        const spontaneous = activities.filter(a => !!a.isSpontaneous);
        return {
            overall: sumActivities(activities),
            planned: sumActivities(planned),
            spontaneous: sumActivities(spontaneous),
        };
    }, [activities]);
}
