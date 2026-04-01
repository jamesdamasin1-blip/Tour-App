import type { TripPlan, Wallet } from '../types/models';

const toHomeBudget = (
    wallet: Pick<Wallet, 'totalBudget' | 'baselineExchangeRate' | 'defaultRate' | 'lots'>,
    homeCurrency: string
) => {
    if (Array.isArray(wallet.lots) && wallet.lots.length > 0) {
        return wallet.lots.reduce((sum, lot) => {
            const originalConvertedAmount = Number(lot.originalConvertedAmount || 0);
            const sourceAmount = Number(lot.sourceAmount || 0);
            const rateToHome = Number(lot.rateBaseCurrency || lot.lockedRate || 0);

            if (lot.sourceCurrency === homeCurrency) {
                return sum + sourceAmount;
            }

            return sum + (originalConvertedAmount * rateToHome);
        }, 0);
    }

    const rateToHome = wallet.baselineExchangeRate || (1 / (wallet.defaultRate || 1));
    return (wallet.totalBudget || 0) * rateToHome;
};

const getWalletTripBudget = (
    wallet: Pick<Wallet, 'totalBudget' | 'lots'>
) => {
    if (Array.isArray(wallet.lots) && wallet.lots.length > 0) {
        return wallet.lots.reduce((sum, lot) => sum + Number(lot.originalConvertedAmount || 0), 0);
    }

    return wallet.totalBudget || 0;
};

export const getPrimaryWalletCurrency = (
    wallets: Pick<Wallet, 'currency'>[] = [],
    homeCurrency = 'PHP'
) => wallets[0]?.currency || homeCurrency;

export const getPrimaryWalletBudget = (
    wallets: Pick<Wallet, 'totalBudget' | 'lots'>[] = []
) => wallets[0] ? getWalletTripBudget(wallets[0]) : 0;

export const getTotalBudgetHomeCached = (
    wallets: Pick<Wallet, 'totalBudget' | 'baselineExchangeRate' | 'defaultRate' | 'lots'>[] = [],
    homeCurrency = 'PHP'
) => wallets.reduce((acc, wallet) => acc + toHomeBudget(wallet, homeCurrency), 0);

export const buildTripDisplayFields = (
    wallets: Wallet[] = [],
    homeCurrency = 'PHP'
): Pick<TripPlan, 'tripCurrency' | 'currency' | 'totalBudgetTrip' | 'totalBudget' | 'totalBudgetHomeCached'> => {
    const tripCurrency = getPrimaryWalletCurrency(wallets, homeCurrency);
    const totalBudgetHomeCached = getTotalBudgetHomeCached(wallets, homeCurrency);

    return {
        tripCurrency,
        currency: tripCurrency,
        // Display-only amount for the primary wallet/trip currency.
        totalBudgetTrip: getPrimaryWalletBudget(wallets),
        // Financial source of truth remains the home-currency aggregate.
        totalBudget: totalBudgetHomeCached,
        totalBudgetHomeCached,
    };
};
