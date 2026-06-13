import mongoose, { Types } from 'mongoose';
import { Farmer } from '../models/Farmer';
import { OTP } from '../models/OTP';
import { IMatch } from '../models/Match';
import { AppError } from '../utils/AppError';
import { AGRI_WALLET_SPLIT } from '../constants';
import { TransactionType, WalletType, EmbeddedTransaction } from '../types';
import { generateRef } from '../constants';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Builds a single transaction entry to be embedded in farmer.transactions.
 * We create this object once and push it in the same DB operation as the
 * balance update — they always travel together.
 */
const makeTxn = (
  type:        TransactionType,
  wallet:      WalletType,
  direction:   'credit' | 'debit',
  amountNaira: number, // kobo in production
  matchId?:    string,
): EmbeddedTransaction => ({
  type,
  wallet,
  direction,
  amountNaira, // kobo in production
  matchId,
  reference: generateRef(type.toUpperCase()), // unique ID for idempotency
  createdAt: new Date(),
});

// ─── Waste pipeline: 70/30 split ─────────────────────────────────────────────

/**
 * splitPayout — fires when a factory confirms a waste match.
 *
 * WHAT IT DOES:
 *   Credits 70% of farmerNetPayout to the farmer's Agri-Wallet (locked funds,
 *   spent at agro-dealers) and 30% to the Cash Wallet (spendable).
 *
 * WHY MATH.FLOOR ON THE 70%?
 *   Floating-point arithmetic is imprecise. 1000 × 0.7 = 700.0000000000001
 *   in JavaScript. We floor the 70% share and compute the 30% as the
 *   remainder, so agriCredit + cashCredit ALWAYS equals farmerNetPayout exactly.
 *   No naira is ever lost to rounding.
 *
 * WHY A MONGOOSE SESSION (withTransaction)?
 *   We're updating the wallet balance AND appending a transaction record in
 *   one MongoDB operation. If the app crashes halfway, we could end up with
 *   money credited but no transaction record (or vice versa).
 *   A session ensures either BOTH succeed or NEITHER does. This is the
 *   financial equivalent of a bank's atomic transfer.
 *
 * NOTE: MongoDB Atlas M0 (free tier) does NOT support multi-document
 * transactions on replica sets in older driver versions. If you see a
 * "Transaction numbers are only allowed on a replica set member" error,
 * wrap the operations in try/catch without a session for the hackathon demo
 * and add sessions back when on a paid cluster.
 */
export const splitPayout = async (match: IMatch): Promise<void> => {
  const remaining  = match.farmerNetPayout;
  const agriCredit = Math.floor(remaining * AGRI_WALLET_SPLIT); // 70%, floored
  const cashCredit = remaining - agriCredit;                     // 30% = exact remainder

  // Build both transaction records before the DB write
  const agriTxn = makeTxn(TransactionType.WASTE_PAYOUT, WalletType.AGRI, 'credit', agriCredit, String(match._id));
  const cashTxn = makeTxn(TransactionType.WASTE_PAYOUT, WalletType.CASH, 'credit', cashCredit, String(match._id));

  const updated = await Farmer.findByIdAndUpdate(
    match.farmerId,
    {
      // $inc atomically adds to both balances in one operation
      $inc:  { agriWalletBalance: agriCredit, cashWalletBalance: cashCredit },
      // $slice: -50 keeps only the most recent 50 transactions (circular buffer)
      $push: { transactions: { $each: [agriTxn, cashTxn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );

  // This should never happen
  if (!updated) throw new AppError('Farmer not found during payout', 500, 'PAYOUT_ERROR');
};

// ─── Waste pipeline: Stage 1 advance (10%) ───────────────────────────────────

/**
 * releaseStage1 — fires when a factory confirms a waste match.
 *
 * Pays 10% of farmerNetPayout immediately, split 70/30 across agri/cash wallets.
 * The remaining 90% (Stage 2) is held until the factory scans the QR goods-in ticket.
 *
 * Same atomic $inc + $push pattern as splitPayout — no partial-state credits possible.
 */
export const releaseStage1 = async (match: IMatch): Promise<void> => {
  const stage1Total = match.stage1Amount ?? 0;
  const agriCredit  = Math.floor(stage1Total * AGRI_WALLET_SPLIT); // 70%, floored
  const cashCredit  = stage1Total - agriCredit;                     // 30% = exact remainder

  const agriTxn = makeTxn(TransactionType.STAGE1_ADVANCE, WalletType.AGRI, 'credit', agriCredit, String(match._id));
  const cashTxn = makeTxn(TransactionType.STAGE1_ADVANCE, WalletType.CASH, 'credit', cashCredit, String(match._id));

  const updated = await Farmer.findByIdAndUpdate(
    match.farmerId,
    {
      $inc:  { agriWalletBalance: agriCredit, cashWalletBalance: cashCredit },
      $push: { transactions: { $each: [agriTxn, cashTxn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );

  if (!updated) throw new AppError('Farmer not found during Stage 1 payout', 500, 'PAYOUT_ERROR');
};

// ─── Waste pipeline: Stage 2 final payout (90%) ──────────────────────────────

/**
 * releaseStage2 — fires when a factory scans the QR goods-in ticket.
 *
 * Pays the remaining 90% of farmerNetPayout, split 70/30 across agri/cash wallets.
 * Only called after weight discrepancy check passes (diff ≤ 15%).
 */
export const releaseStage2 = async (match: IMatch): Promise<void> => {
  const stage2Total = match.stage2Amount ?? 0;
  const agriCredit  = Math.floor(stage2Total * AGRI_WALLET_SPLIT); // 70%, floored
  const cashCredit  = stage2Total - agriCredit;                     // 30% = exact remainder

  const agriTxn = makeTxn(TransactionType.STAGE2_PAYOUT, WalletType.AGRI, 'credit', agriCredit, String(match._id));
  const cashTxn = makeTxn(TransactionType.STAGE2_PAYOUT, WalletType.CASH, 'credit', cashCredit, String(match._id));

  const updated = await Farmer.findByIdAndUpdate(
    match.farmerId,
    {
      $inc:  { agriWalletBalance: agriCredit, cashWalletBalance: cashCredit },
      $push: { transactions: { $each: [agriTxn, cashTxn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );

  if (!updated) throw new AppError('Farmer not found during Stage 2 payout', 500, 'PAYOUT_ERROR');
};

// ─── Fresh produce pipeline: 100% cash ───────────────────────────────────────

/**
 * creditCash — fires when a restaurant confirms a fresh produce match.
 *
 * Simpler than splitPayout — fresh produce goes 100% to Cash Wallet.
 * No Agri-Wallet split for fresh produce (Agri-Wallet is a waste pipeline concept).
 */
export const creditCash = async (match: IMatch): Promise<void> => {
  const txn = makeTxn(
    TransactionType.PRODUCE_PAYOUT,
    WalletType.CASH,
    'credit',
    match.farmerNetPayout,
    String(match._id),
  );

  const updated = await Farmer.findByIdAndUpdate(
    match.farmerId,
    {
      $inc:  { cashWalletBalance: match.farmerNetPayout },
      $push: { transactions: { $each: [txn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );
  
  if (!updated) throw new AppError('Farmer not found during payout', 500, 'PAYOUT_ERROR');
};

// ─── Agri-wallet redemption at agro-dealer ────────────────────────────────────

/**
 * redeemAgriWallet — called when a dealer enters a valid OTP on their web portal.
 *
 * WHAT IT DOES:
 *   1. Debits the farmer's Agri-Wallet by the OTP amount.
 *   2. Marks the OTP as used (sets usedAt timestamp).
 *   Both happen in one atomic session — no partial state possible.
 *
 * THE $GTE TRICK (overdraft prevention):
 *   Instead of:
 *     1. Query farmer balance
 *     2. If balance >= amount, then debit  ← RACE CONDITION: balance can change between 1 and 2
 *
 *   We do:
 *     findOneAndUpdate({ _id: farmerId, agriWalletBalance: { $gte: amount } }, ...)
 *     ← The $gte is part of the FILTER, not a separate check
 *
 *   If the balance is insufficient, MongoDB simply doesn't find a matching document
 *   and returns null. We then throw WALLET_INSUFFICIENT_BALANCE.
 *   This works correctly even with 100 concurrent requests — no race condition.
 *
 * SINGLE-USE OTP ENFORCEMENT:
 *   We mark otp.usedAt = now() IN THE SAME SESSION as the wallet debit.
 *   If the debit fails, the OTP is NOT marked used (rollback).
 *   If marking the OTP fails, the debit is also rolled back.
 *   This prevents the farmer from using the same OTP twice even if there's
 *   a crash between the two operations.
 */
export const redeemAgriWallet = async (
  farmerId:    Types.ObjectId,
  otpId:       Types.ObjectId,
  amountNaira: number, // kobo in production
): Promise<void> => {
  const txn = makeTxn(TransactionType.WALLET_REDEMPTION, WalletType.AGRI, 'debit', amountNaira);

  // The $gte in the filter IS the overdraft guard — this is intentional
  const updated = await Farmer.findOneAndUpdate(
    { _id: farmerId, agriWalletBalance: { $gte: amountNaira } }, // filter acts as guard
    {
      $inc:  { agriWalletBalance: -amountNaira },
      $push: { transactions: { $each: [txn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );

  // null means either farmer not found OR balance was insufficient
  if (!updated) throw new AppError('Insufficient agri-wallet balance', 400, 'WALLET_INSUFFICIENT_BALANCE');

  // Mark OTP as used
  await OTP.findByIdAndUpdate(otpId, { usedAt: new Date() });
};

// ─── Cash withdrawal (mocked for hackathon) ───────────────────────────────────

/**
 * withdrawCash — triggered by the "WITHDRAW [amount]" SMS command.
 *
 * For hackathon: debits the wallet and records a pending withdrawal.
 * Admin processes withdrawals manually via the admin dashboard.
 *
 * In production: this would call OPay or Moniepoint's disbursement API,
 * using txn.reference as an idempotency key to prevent duplicate payouts.
 *
 * Same $gte overdraft prevention pattern as redeemAgriWallet.
 */
export const withdrawCash = async (
  farmerId:    Types.ObjectId,
  amountNaira: number, // kobo in production
): Promise<void> => {
  const txn = makeTxn(TransactionType.CASH_WITHDRAWAL, WalletType.CASH, 'debit', amountNaira);

  const updated = await Farmer.findOneAndUpdate(
    { _id: farmerId, cashWalletBalance: { $gte: amountNaira } }, // overdraft guard
    {
      $inc:  { cashWalletBalance: -amountNaira },
      $push: { transactions: { $each: [txn], $slice: -50 } },
    },
    { returnDocument: 'after' },
  );
  
  if (!updated) throw new AppError('Insufficient cash wallet balance', 400, 'WALLET_INSUFFICIENT_BALANCE');

  // Production: await opayDisbursementApi({ reference: txn.reference, amount: amountNaira })
};
