export interface FundingLot {
    id: string;
    walletCurrency: string;
    sourceCurrency: string;
    sourceAmount: number;
    originalConvertedAmount: number;
    remainingAmount: number;
    lockedRate: number;       // sourceCurrency per walletCurrency (e.g. 15.13 PHP per MYR)
    rateBaseCurrency?: number; // sourceAmount in homeCurrency per 1 walletCurrency (for global totals)
    createdAt: number;
    entryKind?: 'initial' | 'top_up';
    isDefault?: boolean;
}

export interface WalletEvent {
    id: string;
    type: 'FUNDING';
    lotId: string;
    sourceCurrency: string;
    sourceAmount: number;
    targetCurrency: string;
    convertedAmount: number;
    rate: number;
    timestamp: number;
    notes?: string;
}

export interface CompactWallet {
    id: string;
    currency: string;
    lots: FundingLot[];
    events?: WalletEvent[];
    createdAt: number;
}

export interface WalletSummary {
    walletCurrency: string;
    walletBalance: number;
    fundingTotalBase: number;
    fundingSources: FundingLot[];
}
