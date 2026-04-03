import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '@/src/store/useStore';
import { BreakdownMode } from '@/src/hooks/useFilteredBreakdown';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';

interface Props {
    mode: BreakdownMode;
    onChange: (mode: BreakdownMode) => void;
    totals: { overall: number; planned: number; spontaneous: number };
    currency: string;
}

const MODES: { key: BreakdownMode; label: string }[] = [
    { key: 'all',         label: 'ALL' },
    { key: 'planned',     label: 'PLANNED' },
    { key: 'spontaneous', label: 'SPONTANEOUS' },
];

export const BreakdownToggle = React.memo(({ mode, onChange, totals, currency }: Props) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    const activeAmount =
        mode === 'all'         ? totals.overall :
        mode === 'planned'     ? totals.planned :
        totals.spontaneous;

    return (
        <View style={{ marginBottom: 4 }}>
            <View style={{
                flexDirection: 'row',
                padding: 4,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(40, 44, 38, 0.8)' : 'rgba(93, 109, 84, 0.1)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.15)',
                marginBottom: 8,
            }}>
                {MODES.map(({ key, label }) => (
                    <TouchableOpacity
                        key={key}
                        onPress={() => onChange(key)}
                        style={{
                            flex: 1,
                            backgroundColor: mode === key
                                ? (isDark ? '#B2C4AA' : '#5D6D54')
                                : 'transparent',
                            paddingVertical: 10,
                            borderRadius: 12,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{
                            fontSize: 9,
                            fontWeight: '900',
                            color: mode === key
                                ? (isDark ? '#1A1C18' : 'white')
                                : (isDark ? '#9EB294' : '#5D6D54'),
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                        }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: isDark ? '#9EB294' : '#5D6D54',
                textAlign: 'center',
                letterSpacing: 0.5,
                marginBottom: 4,
            }}>
                {MathUtils.formatCurrency(activeAmount, currency)} shown
            </Text>
        </View>
    );
});

BreakdownToggle.displayName = 'BreakdownToggle';
