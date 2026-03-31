import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassView } from '@/components/GlassView';
import { AnimatedModal } from '@/components/AnimatedModal';
import { PressableScale } from '@/components/PressableScale';

interface ValidationModalProps {
    visible: boolean;
    message: string | null;
    onClose: () => void;
    isDark: boolean;
}

export const ValidationModal = ({ visible, message, onClose, isDark }: ValidationModalProps) => {
    return (
        <AnimatedModal visible={visible} onClose={onClose}>
            <View className="flex-1 justify-center items-center px-6">
                <GlassView
                    intensity={isDark ? 80 : 85}
                    borderRadius={32}
                    borderWidth={1}
                    borderColor={isDark ? "rgba(158, 178, 148, 0.1)" : "rgba(255, 255, 255, 0.4)"}
                    backgroundColor={isDark ? "#282C26" : "rgba(242, 240, 228, 0.85)"}
                    style={{ width: '100%', padding: 24 }}
                >
                    <View className="items-center">
                        <View className="w-16 h-16 bg-[#FFE5E5] rounded-full items-center justify-center mb-4">
                            <Feather name="alert-circle" size={32} color="#FF3B30" />
                        </View>
                        <Text className={`text-xl font-black mb-2 uppercase tracking-tight ${isDark ? 'text-[#F2F0E8]' : 'text-[#1a1a1a]'}`}>Missing Details</Text>
                        <Text className={`text-center mb-8 font-medium ${isDark ? 'text-[#9EB294]' : 'text-[#5D6D54]/80'}`}>
                            {message}
                        </Text>
                        <View className="flex-row gap-3 w-full">
                            <PressableScale onPress={onClose} className="flex-1 py-4 rounded-2xl bg-[#5D6D54]">
                                <Text className="text-white font-bold text-center">GOT IT</Text>
                            </PressableScale>
                        </View>
                    </View>
                </GlassView>
            </View>
        </AnimatedModal>
    );
};
