import { Schema, model, Document, Types } from 'mongoose';

export interface IOTP extends Document {
  farmerId:    Types.ObjectId;
  dealerId:    Types.ObjectId;
  amountNaira: number; // kobo in production — locked at generation time
  codeHash:    string; // bcrypt hash — plaintext NEVER stored
  attemptCount: number;
  expiresAt:   Date;
  usedAt?:     Date; // set on confirmed redemption — single-use lock
  createdAt:   Date;
}

const otpSchema = new Schema<IOTP>(
  {
    farmerId:     { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },
    dealerId:     { type: Schema.Types.ObjectId, ref: 'Dealer', required: true },
    amountNaira:  { type: Number, required: true }, // kobo in production
    codeHash:     { type: String, required: true },
    attemptCount: { type: Number, default: 0, max: 3 },
    expiresAt:    { type: Date, required: true },
    usedAt:       { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB TTL index — auto-deletes expired OTPs with no extra cron needed
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ farmerId: 1, dealerId: 1, usedAt: 1, expiresAt: 1 });

export const OTP = model<IOTP>('OTP', otpSchema);
