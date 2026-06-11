import { Schema, model, Document, Types } from 'mongoose';
import { UserStatus } from '../types';

export interface IDealer extends Document {
  userId:     Types.ObjectId;
  shopName:   string;
  dealerCode: string; // unique short code — farmer uses in SMS e.g. DEALER007
  zone:       string;
  status:     UserStatus;
  createdAt:  Date;
  updatedAt:  Date;
}

const dealerSchema = new Schema<IDealer>(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    shopName:   { type: String, required: true, trim: true },
    dealerCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    zone:       { type: String, required: true, trim: true },
    status:     { type: String, enum: Object.values(UserStatus), default: UserStatus.PENDING },
  },
  { timestamps: true },
);

export const Dealer = model<IDealer>('Dealer', dealerSchema);
