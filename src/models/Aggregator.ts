import { Schema, model, Document, Types } from 'mongoose';

export interface IAggregator extends Document {
  userId:                 Types.ObjectId;
  zone:                   string;
  governmentIdType:       string;
  governmentIdNumber:     string;
  governmentIdPhotoUrl:   string;
  guarantorPhone:         string;
  disputesCount:          number;
  createdAt:              Date;
  updatedAt:              Date;
}

const aggregatorSchema = new Schema<IAggregator>(
  {
    userId:               { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    zone:                 { type: String, required: true, trim: true },
    governmentIdType:     { type: String, required: true, enum: ['nin', 'drivers_licence', 'intl_passport'] },
    governmentIdNumber:   { type: String, required: true },
    governmentIdPhotoUrl: { type: String, required: true },
    guarantorPhone:       { type: String, required: true },
    // Replaces full performance scoring system for hackathon
    disputesCount:        { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Aggregator = model<IAggregator>('Aggregator', aggregatorSchema);
