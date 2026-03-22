import React from 'react';
import { View, Text } from 'react-native';
import { CurrencyInput } from '@/components/CurrencyInput';
import { COUNTRY_CURRENCY_MAPPING } from '@/src/data/currencyMapping';
import { Calculations as MathUtils } from '@/src/utils/mathUtils';

interface TripFormBudgetProps {
    isDark: boolean;
    homeCurrency: string;
    countries: string[];
    walletBudgets: { [countryCode: string]: string };
    walletHomeBudgets: { [countryCode: string]: string };
    onBudgetChange: (country: string, text: string) => void;
    onHomeBudgetChange: (country: string, text: string) => void;
    budgetErrors: string[];
    disabled: boolean;
}

export const TripFormBudget = ({
    isDark, homeCurrency, countries, walletBudgets, walletHomeBudgets, onBudgetChange, onHomeBudgetChange, budgetErrors, disabled
}: TripFormBudgetProps) => {
    if (countries.length === 0) return null;

    return (
        <View style={{ opacity: disabled ? 0.3 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
            <Text className={`text-[10px] font-black mb-4 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>3. SET BUDGETS & RATES</Text>
            
            {countries.map((country) => {
                const currency = COUNTRY_CURRENCY_MAPPING[country] || 'PHP';
                const hasError = budgetErrors.includes(country);
                
                const budgetVal = MathUtils.parseCurrencyInput(walletBudgets[country] || '');
                const homeVal = MathUtils.parseCurrencyInput(walletHomeBudgets[country] || '');
                const rate = budgetVal > 0 && homeVal > 0 ? (budgetVal / homeVal).toFixed(2) : '1.00';

                return (
                    <View key={country} className="mb-8">
                        
                        <CurrencyInput
                            label={`${country} Budget (${currency})`}
                            amount={walletBudgets[country] || ''}
                            onAmountChange={(val: string) => onBudgetChange(country, val)}
                            currency={currency}
                            onCurrencyChange={() => {}} 
                            placeholder="0.00"
                            hasError={hasError}
                        />

                        <CurrencyInput
                            label={`${homeCurrency} Equivalent (Your Baseline)`}
                            amount={walletHomeBudgets[country] || ''}
                            onAmountChange={(val: string) => onHomeBudgetChange(country, val)}
                            currency={homeCurrency}
                            onCurrencyChange={() => {}} 
                            placeholder="0.00"
                            hasError={hasError}
                            helperText={budgetVal > 0 && homeVal > 0 ? `Calculated Rate: 1 ${homeCurrency} = ${rate} ${currency}` : "Enter your local conversion for this budget."}
                        />
                        
                        {hasError && <Text className="text-[#FF3B30] text-xs font-bold -mt-2 mb-2 ml-1">FILL BOTH CURRENCIES FOR {country.toUpperCase()}</Text>}
                    </View>
                );
            })}
        </View>
    );
};
