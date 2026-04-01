import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useStore } from '../src/store/useStore';

interface GlassTimePickerProps {
    visible: boolean;
    onClose: () => void;
    value: dayjs.Dayjs;
    onChange: (date: dayjs.Dayjs) => void;
    title?: string;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PERIODS = ['AM', 'PM'];

export const GlassTimePicker: React.FC<GlassTimePickerProps> = ({
    visible,
    onClose,
    value,
    onChange,
    title = 'SELECT TIME',
}) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [tempHour, setTempHour] = useState(value.hour() % 12 || 12);
    const [tempMinute, setTempMinute] = useState(value.minute());
    const [tempPeriod, setTempPeriod] = useState(value.hour() >= 12 ? 'PM' : 'AM');

    const hourRef = useRef<ScrollView>(null);
    const minuteRef = useRef<ScrollView>(null);
    const periodRef = useRef<ScrollView>(null);

    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    useEffect(() => {
        if (!visible) return;

        setTempHour(value.hour() % 12 || 12);
        setTempMinute(value.minute());
        setTempPeriod(value.hour() >= 12 ? 'PM' : 'AM');

        // Ensure scroll position is initialized
        const timer = setTimeout(() => {
            const hour = value.hour() % 12 || 12;
            const minute = value.minute();
            const period = value.hour() >= 12 ? 'PM' : 'AM';

            hourRef.current?.scrollTo({ x: 0, y: (hour - 1) * ITEM_HEIGHT, animated: false });
            minuteRef.current?.scrollTo({ x: 0, y: minute * ITEM_HEIGHT, animated: false });
            periodRef.current?.scrollTo({ x: 0, y: PERIODS.indexOf(period) * ITEM_HEIGHT, animated: false });
        }, 100);

        return () => clearTimeout(timer);
    }, [visible, value]);

    const handleConfirm = () => {
        let hour = tempHour;
        if (tempPeriod === 'PM' && hour !== 12) hour += 12;
        if (tempPeriod === 'AM' && hour === 12) hour = 0;

        onChange(value.hour(hour).minute(tempMinute));
        onClose();
    };

    const renderScrollItems = (items: (number | string)[], selectedValue: number | string) => {
        // Pad items for centering
        const paddedItems = ['', ...items, ''];
        return paddedItems.map((item, index) => (
            <View key={index} style={styles.itemContainer}>
                <Text
                    style={[
                        styles.itemText,
                        { color: isDark ? 'rgba(242, 240, 232, 0.4)' : '#9ca3af' },
                        item === selectedValue && [styles.selectedItemText, { color: isDark ? '#B2C4AA' : '#5D6D54' }],
                    ]}
                >
                    {typeof item === 'number' ? item.toString().padStart(2, '0') : item}
                </Text>
            </View>
        ));
    };

    const onScroll = (
        event: NativeSyntheticEvent<NativeScrollEvent>,
        setter: (val: any) => void,
        items: any[]
    ) => {
        const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
        if (index >= 0 && index < items.length) {
            setter(items[index]);
        }
    };

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[
                    styles.modalContent,
                    {
                        backgroundColor: isDark ? '#282C26' : 'rgba(242, 240, 228, 0.95)',
                        borderColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(255, 255, 255, 0.4)',
                    }
                ]}>
                    {Platform.OS === 'ios' && <BlurView intensity={isDark ? 50 : 95} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
                    <View style={styles.header}>
                        <Text style={[styles.headerTitle, { color: isDark ? '#F2F0E8' : '#1a1a1a' }]}>{title}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Feather name="x" size={24} color={isDark ? "#B2C4AA" : "#5D6D54"} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.pickerContainer}>
                        {/* Hour column */}
                        <View style={styles.column}>
                            <Text style={styles.columnLabel}>HOUR</Text>
                            <View style={styles.scrollWrapper}>
                                <ScrollView
                                    ref={hourRef}
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    onMomentumScrollEnd={(e) => onScroll(e, setTempHour, hours)}
                                    contentOffset={{ x: 0, y: (tempHour - 1) * ITEM_HEIGHT }}
                                >
                                    {renderScrollItems(hours, tempHour)}
                                </ScrollView>
                            </View>
                        </View>

                        <Text style={styles.separator}>:</Text>

                        {/* Minute column */}
                        <View style={styles.column}>
                            <Text style={styles.columnLabel}>MIN</Text>
                            <View style={styles.scrollWrapper}>
                                <ScrollView
                                    ref={minuteRef}
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    onMomentumScrollEnd={(e) => onScroll(e, setTempMinute, minutes)}
                                    contentOffset={{ x: 0, y: tempMinute * ITEM_HEIGHT }}
                                >
                                    {renderScrollItems(minutes, tempMinute)}
                                </ScrollView>
                            </View>
                        </View>

                        {/* Period column */}
                        <View style={styles.column}>
                            <Text style={styles.columnLabel}>AM/PM</Text>
                            <View style={styles.scrollWrapper}>
                                <ScrollView
                                    ref={periodRef}
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    onMomentumScrollEnd={(e) => onScroll(e, setTempPeriod, PERIODS)}
                                    contentOffset={{ x: 0, y: PERIODS.indexOf(tempPeriod) * ITEM_HEIGHT }}
                                >
                                    {renderScrollItems(PERIODS, tempPeriod)}
                                </ScrollView>
                            </View>
                        </View>

                        {/* Highlight Bar focus */}
                        <View style={[
                            styles.highlightBar,
                            {
                                backgroundColor: isDark ? 'rgba(158, 178, 148, 0.12)' : 'rgba(93, 109, 84, 0.08)',
                                borderColor: isDark ? 'rgba(158, 178, 148, 0.25)' : 'rgba(93, 109, 84, 0.15)',
                            }
                        ]} pointerEvents="none" />
                    </View>

                    <TouchableOpacity 
                        onPress={handleConfirm} 
                        style={[
                            styles.confirmButton,
                            { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54' }
                        ]}
                    >
                        <Text style={[styles.confirmButtonText, { color: isDark ? '#1a1a1a' : 'white' }]}>CONFIRM TIME</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 340,
        padding: 24,
        alignItems: 'center',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        backgroundColor: 'rgba(242, 240, 228, 0.95)',
        overflow: 'visible',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1a1a1a',
        letterSpacing: -0.5,
        flex: 1,
    },
    closeButton: {
        padding: 4,
    },
    pickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: PICKER_HEIGHT,
        width: '100%',
        position: 'relative',
        marginBottom: 32,
    },
    column: {
        flex: 1,
        alignItems: 'center',
    },
    columnLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: '#9EB294',
        marginBottom: 8,
        letterSpacing: 1,
    },
    scrollWrapper: {
        height: PICKER_HEIGHT,
        width: '100%',
    },
    itemContainer: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#9ca3af',
    },
    selectedItemText: {
        fontSize: 24,
        fontWeight: '900',
    },
    separator: {
        fontSize: 24,
        fontWeight: '900',
        marginTop: 18,
        marginHorizontal: 4,
    },
    highlightBar: {
        position: 'absolute',
        top: ITEM_HEIGHT + 18, // Account for labels
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        backgroundColor: 'rgba(93, 109, 84, 0.08)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(93, 109, 84, 0.15)',
    },
    confirmButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 20,
        shadowColor: '#1a1a1a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmButtonText: {
        color: 'white',
        fontWeight: '900',
        textAlign: 'center',
        fontSize: 16,
        letterSpacing: 1,
    },
});
