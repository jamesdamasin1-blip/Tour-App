import { CompactWallet } from '../wallet/walletTypes';
import { LotDeduction } from './expenseTypes';
import { assertExpenseInvariant, assertFifoIntegrity, validateWallet } from '../wallet/walletGuard';

export const applyExpenseFIFO = (
    wallet: CompactWallet,
    expenseAmount: number // in walletCurrency
): { updatedWallet: CompactWallet; breakdown: LotDeduction[] } => {
    
    // Guard: Prevent expenses exceeding available lot sums
    assertExpenseInvariant(wallet, expenseAmount);

    let remainingToDeduct = expenseAmount;
    const breakdown: LotDeduction[] = [];
    
    const sortedLots = [...(wallet.lots || [])].sort((a, b) => a.createdAt - b.createdAt);
    
    const updatedLots = sortedLots.map(lot => {
        if (remainingToDeduct <= 0 || lot.remainingAmount <= 0) {
            return { ...lot };
        }

        const deductFromThisLot = Math.min(lot.remainingAmount, remainingToDeduct);
        remainingToDeduct -= deductFromThisLot;

        breakdown.push({
            lotId: lot.id,
            amount: deductFromThisLot
        });

        return {
            ...lot,
            remainingAmount: Number((lot.remainingAmount - deductFromThisLot).toFixed(4)) // prevent float drift
        };
    });

    if (remainingToDeduct > 0.01) { // Unified float tolerance
        throw new Error(`Insufficient wallet funds. Missing: ${remainingToDeduct.toFixed(2)} ${wallet.currency}`);
    }

    // Guard: Deductions sum must match expense amount exactly
    assertFifoIntegrity(expenseAmount, breakdown);

    const updatedWallet = {
        ...wallet,
        lots: updatedLots
    };

    // Guard: Lot quantities consistency
    validateWallet(updatedWallet);

    return {
        updatedWallet,
        breakdown
    };
};
