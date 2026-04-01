import { FundingLot, WalletEvent, CompactWallet, WalletSummary } from './walletTypes';
import { generateId } from '../../utils/mathUtils';
import { validateWallet } from './walletGuard';

export const createWallet = (currency: string): CompactWallet => ({
    id: generateId(),
    currency,
    lots: [],
    createdAt: Date.now()
});

export const addFundingLot = (
    wallet: CompactWallet,
    input: {
        sourceAmount: number;
        sourceCurrency: string;
        targetCurrency: string;  // must match wallet.currency
        rate: number;            // sourceCurrency per targetCurrency
        rateBaseCurrency?: number; // source in homeCurrency per 1 walletCurrency (for global totals)
        notes?: string;
    }
): CompactWallet => {
    const { sourceAmount, sourceCurrency, rate, rateBaseCurrency, notes } = input;

    // Formula: convertedAmount = sourceAmount / rate
    const convertedAmount = rate > 0 ? sourceAmount / rate : 0;

    const lotId = generateId();

    const newLot: FundingLot = {
        id: lotId,
        walletCurrency: wallet.currency,
        sourceCurrency,
        sourceAmount,
        originalConvertedAmount: convertedAmount,
        remainingAmount: convertedAmount,
        lockedRate: rate,
        rateBaseCurrency,
        entryKind: 'top_up',
        isDefault: true,
        createdAt: Date.now()
    };

    // Rotate previous defaults
    const updatedLots = (wallet.lots || []).map(lot => ({ ...lot, isDefault: false }));

    // Append audit event
    const newEvent: WalletEvent = {
        id: generateId(),
        type: 'FUNDING',
        lotId,
        sourceCurrency,
        sourceAmount,
        targetCurrency: wallet.currency,
        convertedAmount,
        rate,
        timestamp: Date.now(),
        notes
    };

    const updatedWallet: CompactWallet = {
        ...wallet,
        lots: [...updatedLots, newLot],
        events: [...(wallet.events || []), newEvent]
    };

    validateWallet(updatedWallet);

    return updatedWallet;
};


export const getWalletBalance = (wallet: CompactWallet): number => {
    return (wallet.lots || []).reduce((sum, lot) => sum + (lot.remainingAmount || 0), 0);
};

export const getFundingTotalGlobalHome = (wallet: CompactWallet, homeCurrency: string): number => {
    return (wallet.lots || []).reduce((sum, lot) => {
        if (lot.sourceCurrency === homeCurrency) {
            // Source IS home currency — sourceAmount is already in home
            return sum + lot.sourceAmount;
        }
        // [F7] Source is NOT home currency — convert via locked rate
        // lockedRate = sourceCurrency per walletCurrency
        // To get home value: originalConvertedAmount (in wallet currency) × rateBaseCurrency
        // rateBaseCurrency = homeCurrency per walletCurrency (if available)
        if (lot.rateBaseCurrency) {
            return sum + (lot.originalConvertedAmount * lot.rateBaseCurrency);
        }
        // Fallback: use sourceAmount directly (best-effort when no home rate stored)
        return sum + lot.sourceAmount;
    }, 0);
};

export const getWalletSummary = (
    wallet: CompactWallet,
    homeCurrency: string
): WalletSummary => {
    const balance = getWalletBalance(wallet);
    const fundingTotalBase = getFundingTotalGlobalHome(wallet, homeCurrency);

    return {
        walletCurrency: wallet.currency,
        walletBalance: balance,
        fundingTotalBase,
        fundingSources: wallet.lots || []
    };
};

export const getDefaultLot = (wallet: CompactWallet): FundingLot | undefined => {
    return (wallet.lots || []).find(lot => lot.isDefault) || wallet.lots?.[wallet.lots.length - 1]; // fallback to latest
};

export const setDefaultLot = (wallet: CompactWallet, lotId: string): CompactWallet => {
    const updatedLots = (wallet.lots || []).map(lot => ({
        ...lot,
        isDefault: lot.id === lotId
    }));

    return {
        ...wallet,
        lots: updatedLots
    };
};
