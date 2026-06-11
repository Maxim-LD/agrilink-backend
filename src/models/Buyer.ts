import { Schema, model, Document, Types } from 'mongoose';
import { BuyerType, UserStatus } from '../types';

export interface IBuyer extends Document {
  userId:        Types.ObjectId;
  buyerType:     BuyerType;
  companyName:   string;
  address:       string;
  location: {
    type:        'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  logisticsMode?: 'mode_a' | 'mode_b'; // restaurant only — display only, no routing logic
  contactName:   string;
  contactPhone:  string;
  status:        UserStatus;
  createdAt:     Date;
  updatedAt:     Date;
}

const buyerSchema = new Schema<IBuyer>(
  {
    userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    buyerType:   { type: String, enum: Object.values(BuyerType), required: true },
    companyName: { type: String, required: true, trim: true },
    address:     { type: String, required: true },
    location: {
      type:        { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    logisticsMode: { type: String, enum: ['mode_a', 'mode_b'] },
    contactName:   { type: String, required: true, trim: true },
    contactPhone:  { type: String, required: true },
    status:        { type: String, enum: Object.values(UserStatus), default: UserStatus.PENDING },
  },
  { timestamps: true },
);

// 2dsphere index — required for MongoDB $near geospatial queries in matching engine
buyerSchema.index({ location: '2dsphere' });

export const Buyer = model<IBuyer>('Buyer', buyerSchema);
