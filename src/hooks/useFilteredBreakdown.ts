import { useMemo } from 'react';
import { Activity } from '../types/models';
import { Calculations } from '../utils/mathUtils';

export type BreakdownMode = 'all' | 'planned' | 'spontaneous';

export function useFilteredBreakdown(
    activities: Activity[],
    mode: BreakdownMode,
    walletRateMap: Record<string, number>,
    homeCurrency: string
) {
    const filtered = useMemo(() => {
        const safe = activities || [];
        if (mode === 'all') return safe;
        if (mode === 'planned') return safe.filter(a => !a.isSpontaneous);
        return safe.filter(a => !!a.isSpontaneous);
    }, [activities, mode]);

    const dailyData = useMemo(
        () => Calculations.getDailySpending(filtered, walletRateMap, homeCurrency),
        [filtered, walletRateMap, homeCurrency]
    );

    return { filtered, dailyData };
}
