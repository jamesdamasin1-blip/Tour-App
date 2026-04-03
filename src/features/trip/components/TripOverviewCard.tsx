import { AnimatedValueText } from '@/components/AnimatedValueText';
import { GlassView } from '@/components/GlassView';
import { ProgressBar } from '@/components/ProgressBar';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type TripOverviewCardProps = {
    balanceDetail?: string;
    balanceFormatted: string;
    balanceRatio: number;
    budgetDisplayHome: boolean;
    completedActivitiesCount: number;
    homeCurrency: string;
    isDark: boolean;
    isOverBudget: boolean;
    isTripFinancialSyncing: boolean;
    overallProgress: number;
    plannedActivitiesCount: number;
    totalCommittedHome: number;
    totalCommittedTrip: number;
    totalWalletBudgetHome: number;
    totalWalletBudgetTrip: number;
    tripActivitiesCount: number;
    tripCurrency: string;
    onOpenAddExchange: () => void;
    onOpenExchangeHistory: () => void;
    onToggleBalanceMode: () => void;
    onToggleBudgetCurrency: () => void;
};

export function TripOverviewCard({
    balanceDetail,
    balanceFormatted,
    balanceRatio,
    budgetDisplayHome,
    completedActivitiesCount,
    homeCurrency,
    isDark,
    isOverBudget,
    isTripFinancialSyncing,
    overallProgress,
    plannedActivitiesCount,
    totalCommittedHome,
    totalCommittedTrip,
    totalWalletBudgetHome,
    totalWalletBudgetTrip,
    tripActivitiesCount,
    tripCurrency,
    onOpenAddExchange,
    onOpenExchangeHistory,
    onToggleBalanceMode,
    onToggleBudgetCurrency,
}: TripOverviewCardProps) {
    const settledCompletedActivitiesCount = useSettledValue(completedActivitiesCount, isTripFinancialSyncing);
    const settledPlannedActivitiesCount = useSettledValue(plannedActivitiesCount, isTripFinancialSyncing);
    const settledTripActivitiesCount = useSettledValue(tripActivitiesCount, isTripFinancialSyncing);
    const settledOverallProgress = useSettledValue(overallProgress, isTripFinancialSyncing);
    const settledCommittedHome = useSettledValue(totalCommittedHome, isTripFinancialSyncing);
    const settledCommittedTrip = useSettledValue(totalCommittedTrip, isTripFinancialSyncing);
    const settledWalletBudgetHome = useSettledValue(totalWalletBudgetHome, isTripFinancialSyncing);
    const settledWalletBudgetTrip = useSettledValue(totalWalletBudgetTrip, isTripFinancialSyncing);
    const settledIsOverBudget = settledCommittedHome > settledWalletBudgetHome;
    const walletValueColor = getWalletTone(balanceRatio, isDark);
    const walletLabelColor = getWalletLabelTone(balanceRatio, isDark);

    return (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <GlassView
                intensity={isDark ? 50 : 80}
                borderRadius={24}
                borderColor={isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(255, 255, 255, 0.4)'}
                backgroundColor={isDark ? 'rgba(40, 44, 38, 0.6)' : 'rgba(255, 255, 255, 0.6)'}
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
                    <View style={{ flex: 1.1, paddingRight: 12 }}>
                        <View className="mb-2">
                            <Text className={`text-[10px] font-black uppercase tracking-[1.5px] ${isDark ? 'text-[#9EB294]' : 'text-[#6B7280]'}`}>
                                ACTIVITY PROGRESS
                            </Text>
                        </View>
                        <ProgressBar
                            progress={settledOverallProgress}
                            animated={false}
                            gradientColors={isDark ? ['#9EB294', '#5D6D54'] : ['#B5C0A2', '#5D6D54']}
                            trackColor={isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(158, 178, 148, 0.2)'}
                            height={24}
                            fontSize={10}
                            floatingLabel={`${settledCompletedActivitiesCount}/${settledPlannedActivitiesCount}`}
                            freezeWhile={isTripFinancialSyncing}
                        />
                    </View>

                    <View style={{ width: 1, height: '70%', backgroundColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(93, 109, 84, 0.12)', marginHorizontal: 8 }} />

                    <View style={{ flex: 1, paddingLeft: 12 }}>
                        <View
                            style={{
                                borderRadius: 16,
                                overflow: 'hidden',
                                backgroundColor: isDark ? 'rgba(158,178,148,0.06)' : 'rgba(93,109,84,0.05)',
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                            }}
                        >
                            <Feather
                                name="credit-card"
                                size={52}
                                color={isDark ? 'rgba(178,196,170,0.10)' : 'rgba(93,109,84,0.09)'}
                                style={{ position: 'absolute', right: -4, bottom: -6 }}
                            />
                            <GestureDetector
                                gesture={Gesture.Exclusive(
                                    Gesture.Pan()
                                        .activeOffsetX([-24, 24])
                                        .failOffsetY([-16, 16])
                                        .onEnd((event: any) => {
                                            if (Math.abs(event.translationX) > 30) {
                                                runOnJS(onToggleBalanceMode)();
                                            }
                                        }),
                                    Gesture.LongPress()
                                        .maxDistance(16)
                                        .onEnd((_event, success) => {
                                            if (success) {
                                                runOnJS(onOpenExchangeHistory)();
                                            }
                                        }),
                                    Gesture.Tap()
                                        .maxDuration(220)
                                        .maxDistance(12)
                                        .onEnd((_event, success) => {
                                            if (success) {
                                                runOnJS(onOpenAddExchange)();
                                            }
                                        })
                                )}
                            >
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center', width: '100%' }}>
                                    <View style={{ height: 14, justifyContent: 'center' }}>
                                        <Text
                                            numberOfLines={1}
                                            style={{
                                                fontSize: 10,
                                                fontWeight: '900',
                                                letterSpacing: 1.5,
                                                textTransform: 'uppercase',
                                                color: walletLabelColor,
                                            }}
                                        >
                                            WALLET
                                        </Text>
                                    </View>
                                    <View style={{ height: 30, justifyContent: 'center' }}>
                                        <AnimatedValueText
                                            text={balanceFormatted}
                                            animated={false}
                                            freezeWhile={isTripFinancialSyncing}
                                            settleMs={180}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            minimumFontScale={0.5}
                                            style={{ fontSize: 22, fontWeight: '900', color: walletValueColor }}
                                        />
                                    </View>
                                    <View style={{ height: 11, justifyContent: 'center' }}>
                                        <AnimatedValueText
                                            text={balanceDetail || ' '}
                                            animated={false}
                                            freezeWhile={isTripFinancialSyncing}
                                            settleMs={180}
                                            numberOfLines={1}
                                            style={{
                                                fontSize: 7,
                                                fontWeight: '700',
                                                color: walletLabelColor,
                                                letterSpacing: 0.5,
                                                opacity: balanceDetail ? 0.8 : 0,
                                                textTransform: 'uppercase',
                                            }}
                                        />
                                    </View>
                                </View>
                            </GestureDetector>
                        </View>
                    </View>
                </View>

                {settledTripActivitiesCount > 0 && settledWalletBudgetHome > 0 && (
                    <GestureDetector
                        gesture={Gesture.Pan()
                            .activeOffsetY([10, 50])
                            .onEnd((event: any) => {
                                if (event.translationY > 20) {
                                    runOnJS(onToggleBudgetCurrency)();
                                }
                            })}
                    >
                        <View style={{ paddingHorizontal: 20, paddingBottom: 14, paddingTop: 2 }}>
                            <View
                                style={{
                                    height: 1,
                                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(93, 109, 84, 0.08)',
                                    marginBottom: 10,
                                }}
                            />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Feather
                                        name={settledIsOverBudget ? 'alert-circle' : 'check-circle'}
                                        size={11}
                                        color={settledIsOverBudget ? '#ef4444' : isDark ? '#9EB294' : '#5D6D54'}
                                        style={{ marginRight: 4 }}
                                    />
                                    <Text
                                        style={{
                                            fontSize: 9,
                                            fontWeight: '900',
                                            letterSpacing: 1.5,
                                            textTransform: 'uppercase',
                                            color: settledIsOverBudget ? '#ef4444' : isDark ? '#9EB294' : '#6B7280',
                                        }}
                                    >
                                        {settledIsOverBudget ? 'OVER BUDGET' : 'WITHIN BUDGET'}
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 7, fontWeight: '700', color: isDark ? '#9EB294' : '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                    Allotted vs Wallet
                                </Text>
                            </View>
                            <BudgetSummaryBar
                                budgetDisplayHome={budgetDisplayHome}
                                freezeWhile={isTripFinancialSyncing}
                                homeCurrency={homeCurrency}
                                isDark={isDark}
                                isOverBudget={settledIsOverBudget}
                                totalCommittedHome={settledCommittedHome}
                                totalCommittedTrip={settledCommittedTrip}
                                totalWalletBudgetHome={settledWalletBudgetHome}
                                totalWalletBudgetTrip={settledWalletBudgetTrip}
                                tripCurrency={tripCurrency}
                            />
                        </View>
                    </GestureDetector>
                )}
            </GlassView>
        </View>
    );
}

function getWalletTone(balanceRatio: number, isDark: boolean): string {
    const safeRatio = Math.max(0, Math.min(balanceRatio, 1));
    const emptyColor = isDark ? '#F87171' : '#DC2626';
    const healthyColor = isDark ? '#B2C4AA' : '#5D6D54';
    return mixHex(emptyColor, healthyColor, safeRatio);
}

function getWalletLabelTone(balanceRatio: number, isDark: boolean): string {
    const safeRatio = Math.max(0, Math.min(balanceRatio, 1));
    const emptyColor = isDark ? '#FCA5A5' : '#EF4444';
    const healthyColor = isDark ? '#9EB294' : '#6B7280';
    return mixHex(emptyColor, healthyColor, safeRatio);
}

function mixHex(start: string, end: string, ratio: number): string {
    const safeRatio = Math.max(0, Math.min(ratio, 1));
    const startRgb = hexToRgb(start);
    const endRgb = hexToRgb(end);

    const mixed = startRgb.map((channel, index) =>
        Math.round(channel + ((endRgb[index] - channel) * safeRatio))
    );

    return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '');
    const fullHex = normalized.length === 3
        ? normalized.split('').map(part => `${part}${part}`).join('')
        : normalized;

    return [
        parseInt(fullHex.slice(0, 2), 16),
        parseInt(fullHex.slice(2, 4), 16),
        parseInt(fullHex.slice(4, 6), 16),
    ];
}

type BudgetSummaryBarProps = {
    budgetDisplayHome: boolean;
    freezeWhile: boolean;
    homeCurrency: string;
    isDark: boolean;
    isOverBudget: boolean;
    totalCommittedHome: number;
    totalCommittedTrip: number;
    totalWalletBudgetHome: number;
    totalWalletBudgetTrip: number;
    tripCurrency: string;
};

function BudgetSummaryBar({
    budgetDisplayHome,
    freezeWhile,
    homeCurrency,
    isDark,
    isOverBudget,
    totalCommittedHome,
    totalCommittedTrip,
    totalWalletBudgetHome,
    totalWalletBudgetTrip,
    tripCurrency,
}: BudgetSummaryBarProps) {
    const budgetPct = totalWalletBudgetHome > 0 ? Math.min((totalCommittedHome / totalWalletBudgetHome) * 100, 100) : 0;
    const barLabel = budgetDisplayHome
        ? `${MathUtils.formatCurrency(totalCommittedHome, homeCurrency)} / ${MathUtils.formatCurrency(totalWalletBudgetHome, homeCurrency)}`
        : `${MathUtils.formatCurrency(totalCommittedTrip, tripCurrency)} / ${MathUtils.formatCurrency(totalWalletBudgetTrip, tripCurrency)}`;
    const barColor = isOverBudget ? '#ef4444' : isDark ? '#B2C4AA' : '#5D6D54';
    const trackColor = isDark ? 'rgba(158, 178, 148, 0.08)' : 'rgba(158, 178, 148, 0.15)';

    return (
        <View>
            <AnimatedValueText
                text={barLabel}
                freezeWhile={freezeWhile}
                settleMs={180}
                numberOfLines={1}
                style={{
                    fontSize: 10,
                    fontWeight: '900',
                    color: isDark ? 'rgba(242,240,232,0.85)' : 'rgba(26,28,24,0.75)',
                    letterSpacing: 0.3,
                    textAlign: 'center',
                    marginBottom: 4,
                }}
            />
            <View style={{ height: 6, borderRadius: 3, backgroundColor: trackColor }}>
                <AnimatedBudgetFill progress={budgetPct} color={barColor} />
            </View>
        </View>
    );
}

function AnimatedBudgetFill({ progress, color }: { progress: number; color: string }) {
    const progressAnim = useRef(new Animated.Value(progress)).current;

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [progress, progressAnim]);

    return (
        <Animated.View
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                    extrapolate: 'clamp',
                }),
                backgroundColor: color,
                borderRadius: 3,
            }}
        />
    );
}

function useSettledValue<T>(value: T, freezeWhile: boolean, settleMs = 180): T {
    const [displayedValue, setDisplayedValue] = useState(value);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        if (freezeWhile || Object.is(displayedValue, value)) {
            return () => {
                if (settleTimerRef.current) {
                    clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
            };
        }

        settleTimerRef.current = setTimeout(() => {
            setDisplayedValue(value);
            settleTimerRef.current = null;
        }, settleMs);

        return () => {
            if (settleTimerRef.current) {
                clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, [displayedValue, freezeWhile, settleMs, value]);

    return displayedValue;
}
