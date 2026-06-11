import { Schema, model, Document, Types } from 'mongoose';
import { Pipeline } from '../types';

export interface IStandingOrder extends Document {
  buyerId:        Types.ObjectId;
  pipeline:       Pipeline;
  category:       string;
  minQuantityKg:  number;
  maxQuantityKg?: number;
  pricePerKg:     number; // Naira — kobo in production
  isActive:       boolean;
  isAnchor:       boolean; // true = matched first during cold start, bypasses scoring
  createdAt:      Date;
  updatedAt:      Date;
}

const standingOrderSchema = new Schema<IStandingOrder>(
  {
    buyerId:       { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
    pipeline:      { type: String, enum: Object.values(Pipeline), required: true },
    category:      { type: String, required: true, trim: true, lowercase: true },
    minQuantityKg: { type: Number, required: true, min: 0.1 },
    maxQuantityKg: { type: Number },
    pricePerKg:    { type: Number, required: true, min: 1 }, // Naira, kobo in production
    isActive:      { type: Boolean, default: true },
    isAnchor:      { type: Boolean, default: false },
  },
  { timestamps: true },
);

standingOrderSchema.index({ pipeline: 1, category: 1, isActive: 1, isAnchor: -1 });

export const StandingOrder = model<IStandingOrder>('StandingOrder', standingOrderSchema);
