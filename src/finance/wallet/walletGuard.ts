import { FundingLot, CompactWallet } from './walletTypes';

/** Unified floating-point tolerance for all financial guards */
const FLOAT_EPSILON = 0.01;

/**
 * lot.remainingAmount must be positive and not exceed lot.convertedAmount lot total.
 * lot.remainingAmount >= 0
 * lot.remainingAmount <= convertedAmount
 */
export function assertLotInvariant(lot: FundingLot) {
    if (lot.remainingAmount < 0) {
        throw new Error(`Lot Invariant Violated: Lot ${lot.id} has negative balance (${lot.remainingAmount})`);
    }

    // Backwards compatibility with older lots using convertedAmount
    const originalConvertedAmount = lot.originalConvertedAmount !== undefined
        ? lot.originalConvertedAmount
        : (lot as any).convertedAmount;

    if (lot.remainingAmount > (originalConvertedAmount || 0) + FLOAT_EPSILON) {
        throw new Error(`Lot Invariant Violated: Lot ${lot.id} exceeds original converted amount (${lot.remainingAmount} > ${originalConvertedAmount})`);
    }
}

/**
 * Expenses must not exceed available wallet lot totals.
 */
export function assertExpenseInvariant(wallet: CompactWallet, expenseAmount: number) {
    const balance = (wallet.lots || []).reduce((sum, lot) => sum + (lot.remainingAmount || 0), 0);

    if (expenseAmount > balance + FLOAT_EPSILON) {
        throw new Error(`Expense Invariant Violated: Expense amount (${expenseAmount}) exceeds wallet aggregate balance (${balance})`);
    }
}

/**
 * Deductions total sum must match the targeted expense amount exactly.
 */
export function assertFifoIntegrity(expenseAmount: number, deductions: { amount: number }[]) {
    const totalDeducted = deductions.reduce((sum, d) => sum + d.amount, 0);

    if (Math.abs(totalDeducted - expenseAmount) > FLOAT_EPSILON) {
        throw new Error(`FIFO Integrity Violated: Deduction match mismatch (Expense: ${expenseAmount}, Deducted Total: ${totalDeducted})`);
    }
}

/**
 * Runs guards across all lots inside a wallet.
 */
export function validateWallet(wallet: CompactWallet) {
    if (wallet.lots) {
        wallet.lots.forEach(assertLotInvariant);
    }
}
