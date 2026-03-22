import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStore } from '@/src/store/useStore';

/** Format a numeric string with thousands separators for display only */
const formatDisplay = (raw: string): string => {
    if (!raw) return '';
    // Strip everything except digits and decimal
    const clean = raw.replace(/[^0-9.]/g, '');
    if (!clean) return '';
    const parts = clean.split('.');
    // Add commas to integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
};

/** Strip formatting to get raw numeric string */
const stripFormatting = (formatted: string): string => {
    return formatted.replace(/,/g, '');
};

export interface CurrencyInputProps {
    label: string;
    amount: string;
    onAmountChange: (text: string) => void;
    currency: string;
    onCurrencyChange: (currency: string) => void;
    manualRate?: string;
    onManualRateChange?: (text: string) => void;
    placeholder?: string;
    hasError?: boolean;
    testID?: string;
    editable?: boolean;
    error?: string;
    helperText?: string;
    options?: string[];
    onCurrencyPress?: () => void;
}

export const CurrencyInput = ({
    label,
    amount,
    onAmountChange,
    currency,
    onCurrencyChange,
    placeholder = "0.00",
    hasError,
    testID,
    editable = true,
    error,
    helperText,
    options,
    onCurrencyPress
}: CurrencyInputProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [toggleLayout, setToggleLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const inputGroupRef = useRef<View>(null);

    const hasOptions = options && options.length > 1;

    const handlePress = () => {
        if (onCurrencyPress) {
            onCurrencyPress();
        } else if (hasOptions) {
            // Measure the full input group so dropdown appears below it, not overlapping
            inputGroupRef.current?.measureInWindow((x, y, width, height) => {
                setToggleLayout({ x, y, width, height });
                setIsMenuVisible(true);
            });
        }
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.label, isDark && { color: '#B2C4AA', opacity: 0.8 }]}>{label.toUpperCase()}</Text>

            <View
                ref={inputGroupRef}
                collapsable={false}
                style={[
                    styles.inputGroup,
                    isDark && { backgroundColor: 'rgba(158, 178, 148, 0.08)', borderColor: 'rgba(158, 178, 148, 0.25)' },
                    hasError && styles.errorBorder
                ]}
            >
                <View>
                    <TouchableOpacity
                        style={[styles.currencyToggle, isDark && { borderRightColor: 'rgba(158, 178, 148, 0.2)' }]}
                        onPress={handlePress}
                        disabled={!hasOptions && !onCurrencyPress}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={[styles.currencyText, isDark && { color: '#F2F0E8' }]}>{currency || 'PHP'}</Text>
                            {hasOptions && (
                                <Feather
                                    name={isMenuVisible ? "chevron-up" : "chevron-down"}
                                    size={12}
                                    color={isDark ? "#F2F0E8" : "#5D6D54"}
                                    style={{ marginLeft: 4 }}
                                />
                            )}
                        </View>
                    </TouchableOpacity>
                </View>

                <TextInput
                    testID={testID}
                    style={[styles.input, isDark && { color: '#F2F0E8' }, !editable && { opacity: 0.7 }]}
                    value={formatDisplay(amount)}
                    onChangeText={(text) => {
                        // Strip commas (from paste/autocomplete), keep only digits and decimal
                        const raw = stripFormatting(text);
                        // Allow only valid numeric input (digits, single decimal, max 2 decimal places)
                        let clean = raw.replace(/[^0-9.]/g, '');
                        const parts = clean.split('.');
                        if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
                        if (parts.length === 2 && parts[1].length > 2) clean = parts[0] + '.' + parts[1].substring(0, 2);
                        onAmountChange(clean);
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.4)" : "#9ca3af"}
                    keyboardType="decimal-pad"
                    editable={editable}
                />
            </View>

            {(error || hasError) && <Text style={styles.errorText}>{error || 'Invalid Input'}</Text>}
            {helperText && !error && !hasError && <Text style={[styles.helperText, isDark && { color: '#B2C4AA' }]}>{helperText}</Text>}

            {/* Currency dropdown rendered as Modal to escape overflow:hidden parents */}
            <Modal visible={isMenuVisible} transparent animationType="fade" onRequestClose={() => setIsMenuVisible(false)}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={() => setIsMenuVisible(false)}
                >
                    <View style={[
                        styles.dropdown,
                        {
                            top: toggleLayout.y + toggleLayout.height + 4,
                            left: toggleLayout.x,
                        },
                        isDark
                            ? { backgroundColor: '#282C26', borderColor: 'rgba(158, 178, 148, 0.3)' }
                            : { backgroundColor: '#F2F0E4', borderColor: 'rgba(93, 109, 84, 0.3)' }
                    ]}>
                        {(options || []).map((opt) => (
                            <TouchableOpacity
                                key={opt}
                                onPress={() => {
                                    onCurrencyChange(opt);
                                    setIsMenuVisible(false);
                                }}
                                style={[
                                    styles.dropdownItem,
                                    currency === opt && {
                                        backgroundColor: isDark ? 'rgba(178, 196, 170, 0.15)' : 'rgba(93, 109, 84, 0.1)'
                                    }
                                ]}
                            >
                                <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F2F0E8' : '#5D6D54' }}>
                                    {opt}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    label: {
        fontSize: 10,
        fontWeight: '900',
        color: '#9ca3af',
        marginBottom: 8,
        letterSpacing: 1,
    },
    inputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(93, 109, 84, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(93, 109, 84, 0.15)',
        borderRadius: 16,
        paddingHorizontal: 0,
        height: 56,
    },
    errorBorder: {
        borderColor: '#ef4444',
    },
    currencyToggle: {
        paddingLeft: 16,
        paddingRight: 12,
        borderRightWidth: 1,
        borderRightColor: 'rgba(93, 109, 84, 0.15)',
        marginRight: 0,
        height: '100%',
        justifyContent: 'center',
    },
    currencyText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#5D6D54',
        minWidth: 40,
        textAlign: 'center',
    },
    input: {
        flex: 1,
        paddingLeft: 12,
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    dropdown: {
        position: 'absolute',
        minWidth: 90,
        borderRadius: 14,
        borderWidth: 1,
        padding: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 10,
    },
    dropdownItem: {
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 10,
        fontWeight: '900',
        marginTop: 4,
        textTransform: 'uppercase',
    },
    helperText: {
        color: '#5D6D54',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 4,
        opacity: 0.6,
    },
});
