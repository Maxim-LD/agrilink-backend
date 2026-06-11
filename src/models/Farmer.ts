import { Schema, model, Document, Types } from 'mongoose';
import { EmbeddedTransaction } from '../types';

export interface IFarmer extends Document {
  userId:              Types.ObjectId;
  zone:                string;
  agriWalletBalance:   number; // store as kobo in production
  cashWalletBalance:   number; // store as kobo in production
  transactions:        EmbeddedTransaction[];
  createdAt:           Date;
  updatedAt:           Date;
}

const embeddedTxnSchema = new Schema<EmbeddedTransaction>(
  {
    type:        { type: String, required: true },
    wallet:      { type: String, required: true },
    direction:   { type: String, enum: ['credit', 'debit'], required: true },
    amountNaira: { type: Number, required: true }, // kobo in production
    matchId:     { type: String },
    reference:   { type: String, required: true },
    createdAt:   { type: Date, default: Date.now },
  },
  { _id: false },
);

const farmerSchema = new Schema<IFarmer>(
  {
    userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    zone:              { type: String, required: true, trim: true },
    agriWalletBalance: { type: Number, default: 0 }, // kobo in production
    cashWalletBalance: { type: Number, default: 0 }, // kobo in production
    transactions:      { type: [embeddedTxnSchema], default: [] },
  },
  { timestamps: true },
);

export const Farmer = model<IFarmer>('Farmer', farmerSchema);
