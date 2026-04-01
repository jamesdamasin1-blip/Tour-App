import { FooterTopFade } from '@/components/FooterTopFade';
import { TabBg } from '@/components/TabBg';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type TripDetailFooterProps = {
    bottomInset: number;
    isAdmin: boolean;
    isDark: boolean;
    onOpenAnalysis: () => void;
    onOpenChoiceModal: () => void;
    onOpenHome: () => void;
};

export function TripDetailFooter({
    bottomInset,
    isAdmin,
    isDark,
    onOpenAnalysis,
    onOpenChoiceModal,
    onOpenHome,
}: TripDetailFooterProps) {
    return (
        <View style={[styles.footerContainer, { height: 64 + bottomInset, paddingBottom: bottomInset, zIndex: 10 }]}>
            <View style={{ flex: 1, overflow: 'visible' }}>
                <TabBg overlapTop={34} />
                <FooterTopFade isDark={isDark} />
            </View>
            <View style={styles.footerIcons}>
                <TouchableOpacity onPress={onOpenHome} className="flex-1 items-center justify-center h-full">
                    <Feather name="home" size={26} color="#9EB294" />
                </TouchableOpacity>

                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    {isAdmin && (
                        <TouchableOpacity
                            testID="btn-add-activity"
                            style={{ alignItems: 'center', justifyContent: 'center', top: -44 }}
                            onPress={onOpenChoiceModal}
                            activeOpacity={0.8}
                        >
                            <View style={styles.fab}>
                                <Feather name="plus" size={36} color="#fff" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity onPress={onOpenAnalysis} className="flex-1 items-center justify-center h-full">
                    <Feather name="bar-chart-2" size={26} color="#9ca3af" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fab: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#5D6D54',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#5D6D54',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 12,
    },
    footerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
    },
    footerIcons: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
    },
});
