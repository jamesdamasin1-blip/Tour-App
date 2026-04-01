import { GlassView } from '@/components/GlassView';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Modal, Text, TouchableOpacity } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TripChoiceModalProps = {
    isDark: boolean;
    visible: boolean;
    onClose: () => void;
    onManageMembers: () => void;
    onPlanActivity: () => void;
    onSpontaneousLog: () => void;
};

export function TripChoiceModal({
    isDark,
    visible,
    onClose,
    onManageMembers,
    onPlanActivity,
    onSpontaneousLog,
}: TripChoiceModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                activeOpacity={1}
                onPress={onClose}
            >
                <GlassView
                    intensity={isDark ? 30 : 90}
                    borderRadius={32}
                    backgroundColor={isDark ? 'rgba(40, 44, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)'}
                    style={{ width: SCREEN_WIDTH - 64, padding: 32 }}
                >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textAlign: 'center', marginBottom: 24, letterSpacing: 1 }}>
                        {"WHAT'S THE PLAN?"}
                    </Text>

                    <TouchableOpacity onPress={onPlanActivity} className="bg-[#5D6D54] py-4 rounded-2xl flex-row items-center justify-center mb-4">
                        <Feather name="calendar" size={20} color="#fff" style={{ marginRight: 10 }} />
                        <Text className="text-white font-black uppercase tracking-widest text-[12px]">Plan Activity</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onSpontaneousLog}
                        style={{ borderColor: '#5D6D54', borderWidth: 2 }}
                        className="py-4 rounded-2xl flex-row items-center justify-center mb-4"
                    >
                        <Feather name="zap" size={20} color="#5D6D54" style={{ marginRight: 10 }} />
                        <Text className="text-[#5D6D54] font-black uppercase tracking-widest text-[12px]">Spontaneous Log</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onManageMembers}
                        style={{ borderColor: isDark ? 'rgba(158,178,148,0.2)' : 'rgba(93,109,84,0.15)', borderWidth: 1 }}
                        className="py-4 rounded-2xl flex-row items-center justify-center"
                    >
                        <Feather name="users" size={18} color={isDark ? '#9EB294' : '#6B7280'} style={{ marginRight: 10 }} />
                        <Text style={{ color: isDark ? '#9EB294' : '#6B7280' }} className="font-black uppercase tracking-widest text-[12px]">
                            Manage Members
                        </Text>
                    </TouchableOpacity>
                </GlassView>
            </TouchableOpacity>
        </Modal>
    );
}
