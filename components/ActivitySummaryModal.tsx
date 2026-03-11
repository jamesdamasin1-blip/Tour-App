import { GlassView } from '@/components/GlassView';
import { BlurView } from 'expo-blur';
import { Activity } from '@/src/types/models';
import { useStore } from '../src/store/useStore';
import { Calculations } from '@/src/utils/mathUtils';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Animated, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ActivitySummaryModalProps {
    isVisible: boolean;
    activity: Activity;
    onClose: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onToggleComplete: () => void;
}

export function ActivitySummaryModal({
    isVisible,
    activity,
    onClose,
    onDelete,
    onEdit,
    onToggleComplete
}: ActivitySummaryModalProps) {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const slideAnim = React.useRef(new Animated.Value(0)).current;
    const [page, setPage] = React.useState(0);
    const pageWidth = Math.min(Dimensions.get('window').width - 32, 440);

    const changePage = (toPage: number) => {
        setPage(toPage);
        Animated.spring(slideAnim, {
            toValue: -toPage * pageWidth,
            useNativeDriver: true,
            tension: 50,
            friction: 9
        }).start();
    };

    const totalSpent = Calculations.calculateTotalExpenses(activity.expenses);
    const isOverBudget = totalSpent > activity.allocatedBudget;
    const variance = Math.abs(activity.allocatedBudget - totalSpent);
    const hasExpenses = activity.expenses && activity.expenses.length > 0;

    return (
        <Modal transparent visible={isVisible} animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity 
                style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                activeOpacity={1} 
                onPress={onClose}
            >
                <BlurView intensity={30} style={StyleSheet.absoluteFill} tint={isDark ? "dark" : "light"} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                
                <View style={{ width: '100%', maxWidth: 440, paddingHorizontal: 16 }}>
                    <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                    <View
                        style={{ 
                            width: '100%', 
                            overflow: 'hidden',
                            backgroundColor: isDark ? '#282C26' : '#F2F0E4',
                            borderRadius: 40,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        }}
                    >
                        <Animated.View style={{ width: pageWidth * 2, flexDirection: 'row', transform: [{ translateX: slideAnim }] }}>
                            {/* PAGE 1 */}
                            <View style={{ width: pageWidth, padding: 24 }}>
                                <View className="mb-4 w-full">
                                    <Text className={`text-[20px] font-black uppercase text-center mb-6 ${isDark ? 'text-[#F2F0E8]' : 'text-gray-900'}`}>{activity.title}</Text>
                                    <View className="space-y-3">
                                        <Text className={`text-[13px] font-black uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-[#9ca3af]'}`}>
                                            CATEGORY: <Text style={{ color: isDark ? '#F2F0E8' : '#374151' }}>{activity.category}</Text>
                                        </Text>
                                        <Text className={`text-[13px] font-black uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-[#9ca3af]'}`}>
                                            DATE AND TIME: <Text style={{ color: isDark ? '#F2F0E8' : '#374151' }}>{new Date(activity.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(activity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </Text>
                                    </View>
                                </View>
                                <View className="mt-2 space-y-4">
                                    <View className="py-2">
                                        <Text 
                                            className="text-[14px] font-black uppercase tracking-widest"
                                            style={{ color: isOverBudget ? '#FF3B30' : (isDark ? '#F2F0E8' : '#5D6D54') }}
                                        >
                                            {isOverBudget ? `YOU EXCEEDED BY ₱${variance.toLocaleString()} FOR THIS TRIP.` : `YOU'VE SAVED ₱${variance.toLocaleString()} FOR THIS TRIP.`}
                                        </Text>
                                    </View>

                                    <View className="flex-row gap-3 pt-2">
                                        <TouchableOpacity
                                            onPress={() => {
                                                onToggleComplete();
                                                onClose();
                                            }}
                                            disabled={!hasExpenses}
                                            className="flex-1 py-4 rounded-xl items-center"
                                            style={[
                                                { backgroundColor: '#5D6D54' },
                                                !hasExpenses && { opacity: 0.5 }
                                            ]}
                                        >
                                            <Text className="text-[13px] font-black text-white tracking-widest uppercase">
                                                {activity.isCompleted ? 'REOPEN' : 'COMPLETE'}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity 
                                            onPress={onClose} 
                                            className={`flex-1 py-4 rounded-xl items-center border ${isDark ? 'bg-[#3A3F37] border-[#4A5046]' : 'bg-gray-200 border-gray-300'}`}
                                        >
                                            <Text className={`text-[13px] font-black tracking-widest uppercase ${isDark ? 'text-[#B2C4AA]' : 'text-gray-500'}`}>CLOSE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>

                            {/* PAGE 2: NOTES */}
                            <View style={{ width: pageWidth, padding: 24 }}>
                                <Text className={`text-[14px] font-black uppercase tracking-widest mb-4 text-center ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>NOTES:</Text>
                                <ScrollView style={{ maxHeight: 450 }} showsVerticalScrollIndicator={false}>
                                    <View style={{ 
                                        backgroundColor: isDark ? 'rgba(158, 178, 148, 0.05)' : 'rgba(158, 178, 148, 0.1)', 
                                        padding: 16, 
                                        borderRadius: 16, 
                                        borderWidth: 1, 
                                        borderColor: isDark ? 'rgba(158, 178, 148, 0.15)' : 'rgba(158, 178, 148, 0.2)' 
                                    }}>
                                        <Text style={{ color: isDark ? '#F2F0E8' : '#374151', fontSize: 14, fontWeight: '500', lineHeight: 22 }}>
                                            {activity.description || 'No notes added for this activity.'}
                                        </Text>
                                    </View>
                                </ScrollView>
                            </View>
                        </Animated.View>

                        {/* Discrete Navigation Arrows/Taps */}
                        {page === 0 && (
                            <TouchableOpacity
                                className="absolute right-0 top-1/2 -translate-y-12 w-12 h-24 items-center justify-center bg-black/5 rounded-l-2xl"
                                onPress={() => changePage(1)}
                            >
                                <Feather name="chevron-right" size={20} color="#5D6D54" />
                            </TouchableOpacity>
                        )}
                        {page === 1 && (
                            <TouchableOpacity
                                className="absolute left-0 top-1/2 -translate-y-12 w-12 h-24 items-center justify-center bg-black/5 rounded-r-2xl"
                                onPress={() => changePage(0)}
                            >
                                <Feather name="chevron-left" size={20} color="#5D6D54" />
                            </TouchableOpacity>
                        )}
                    </View>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const modalStyles = {
    label: { fontSize: 9, fontWeight: '900' as const, color: '#9ca3af', marginBottom: 8, letterSpacing: 0.5 },
    divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.4)', marginVertical: 16 }
};
