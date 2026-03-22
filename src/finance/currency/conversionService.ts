export const ConversionService = {
    /** 
     * Converts sourceAmount into walletCurrency using lockedRate.
     * Formula specifies: convertedAmount = sourceAmount / lockedRate
     * rate is stored as sourceCurrency per walletCurrency (e.g. PHP per MYR)
     */
    toWalletAmount: (sourceAmount: number, lockedRate: number): number => {
        if (lockedRate <= 0) return 0;
        return sourceAmount / lockedRate;
    },

    /** 
     * Inverse conversion back to sourceCurrency if needed for logging summaries.
     */
    toSourceAmount: (walletAmount: number, lockedRate: number): number => {
        return walletAmount * lockedRate;
    }
};
