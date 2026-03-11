import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useStore } from '@/src/store/useStore';

export interface CurrencyInputProps {
    label: string;
    amount: string;
    onAmountChange: (text: string) => void;
    currency: string;
    onCurrencyChange: (currency: string) => void;
    onCurrencyPress?: () => void;
    manualRate: string;
    onManualRateChange: (text: string) => void;
    placeholder?: string;
    hasError?: boolean;
}

export const CurrencyInput = ({
    label,
    amount,
    onAmountChange,
    currency,
    onCurrencyChange,
    onCurrencyPress,
    manualRate,
    onManualRateChange,
    placeholder = "0.00",
    hasError
}: CurrencyInputProps) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';

    return (
        <View style={styles.container}>
            <Text style={[styles.label, isDark && { color: '#9EB294', opacity: 0.6 }]}>{label.toUpperCase()}</Text>
            <View style={[
                styles.inputGroup, 
                isDark && { backgroundColor: 'rgba(158, 178, 148, 0.08)', borderColor: 'rgba(158, 178, 148, 0.25)' },
                hasError && styles.errorBorder
            ]}>
                <TouchableOpacity 
                    style={[styles.currencyToggle, isDark && { borderRightColor: 'rgba(158, 178, 148, 0.2)' }]}
                    onPress={onCurrencyPress}
                    disabled={!onCurrencyPress}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.currencyText, isDark && { color: '#9EB294' }]}>{currency || 'PHP'}</Text>
                        <Feather name="chevron-down" size={12} color={isDark ? "#9EB294" : "#5D6D54"} style={{ marginLeft: 4 }} />
                    </View>
                </TouchableOpacity>
                <TextInput
                    style={[styles.input, isDark && { color: '#F2F0E8' }]}
                    value={amount}
                    onChangeText={onAmountChange}
                    placeholder={placeholder}
                    placeholderTextColor={isDark ? "rgba(158, 178, 148, 0.4)" : "#9ca3af"}
                    keyboardType="decimal-pad"
                />
            </View>
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
        paddingHorizontal: 16,
        height: 56,
    },
    errorBorder: {
        borderColor: '#ef4444',
    },
    currencyToggle: {
        paddingRight: 12,
        borderRightWidth: 1,
        borderRightColor: 'rgba(93, 109, 84, 0.15)',
        marginRight: 12,
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
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
});
