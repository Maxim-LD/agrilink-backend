import { Schema, model, Document } from 'mongoose';

export interface IMockSMS extends Document {
  phone:     string;
  message:   string;
  direction: 'inbound' | 'outbound';
  timestamp: Date;
}

const mockSMSSchema = new Schema<IMockSMS>(
  {
    phone:     { type: String, required: true, index: true },
    message:   { type: String, required: true },
    direction: { type: String, required: true, enum: ['inbound', 'outbound'] },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export const MockSMS = model<IMockSMS>('MockSMS', mockSMSSchema);
