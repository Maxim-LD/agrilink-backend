import { Schema, model, Document } from 'mongoose';
import { UserRole, UserStatus, BuyerType } from '../types';

export interface IUser extends Document {
  phone:        string;
  role:         UserRole;
  buyerType?:   BuyerType;
  fullName:     string;
  status:       UserStatus;
  passwordHash?: string; // null for farmers — SMS-only
  createdAt:    Date;
  updatedAt:    Date;
}

const userSchema = new Schema<IUser>(
  {
    phone:        { type: String, required: true, unique: true, trim: true },
    role:         { type: String, enum: Object.values(UserRole), required: true },
    buyerType:    { type: String, enum: Object.values(BuyerType) },
    fullName:     { type: String, required: true, trim: true },
    status:       { type: String, enum: Object.values(UserStatus), default: UserStatus.PENDING },
    passwordHash: { type: String }, // not required — farmers have none
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);
