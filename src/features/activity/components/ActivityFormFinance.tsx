import React from 'react';
import { View, Text } from 'react-native';
import { CurrencyInput } from '../../../../components/CurrencyInput';

interface ActivityFormFinanceProps {
    allocatedBudget: string;
    setAllocatedBudget: (text: string) => void;
    budgetCurrency: string;
    setBudgetCurrency: (curr: string) => void;
    actualCost: string;
    setActualCost: (text: string) => void;
    actualCurrency: string;
    setActualCurrency: (curr: string) => void;
    availableCurrencies: string[];
    isDark: boolean;
    isAdmin: boolean;
    activityId?: string;
    hasExpenses?: boolean;
    errors: Record<string, string>;
}

export const ActivityFormFinance: React.FC<ActivityFormFinanceProps> = ({
    allocatedBudget, setAllocatedBudget,
    budgetCurrency, setBudgetCurrency,
    actualCost, setActualCost,
    actualCurrency, setActualCurrency,
    availableCurrencies,
    isDark, isAdmin,
    activityId,
    hasExpenses = false,
    errors
}) => {
    return (
        <View className="px-4 pb-4 mt-2">
            <Text className={`text-xs font-bold mb-3 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Finance</Text>

            <CurrencyInput
                label="Allocated Budget"
                amount={allocatedBudget}
                onAmountChange={setAllocatedBudget}
                currency={budgetCurrency}
                onCurrencyChange={setBudgetCurrency}
                options={availableCurrencies}
                editable={isAdmin}
                error={errors.budget || errors.allocatedBudget}
            />

            {activityId && (
                <View className="mt-4">
                    <CurrencyInput
                        label="Actual Cost (Total Spent)"
                        amount={actualCost}
                        onAmountChange={setActualCost}
                        currency={actualCurrency}
                        onCurrencyChange={setActualCurrency}
                        options={availableCurrencies}
                        editable={isAdmin && hasExpenses}
                        helperText={
                            hasExpenses
                                ? "Editing this will create a manual adjustment expense to match the total."
                                : "Add an expense first to enable editing the actual cost."
                        }
                    />
                </View>
            )}
        </View>
    );
};
