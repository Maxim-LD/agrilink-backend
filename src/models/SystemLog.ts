import { Schema, model, Document } from 'mongoose';

export interface ISystemLog extends Document {
  level:     'info' | 'warn' | 'error';
  message:   string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const systemLogSchema = new Schema<ISystemLog>(
  {
    level:     { type: String, required: true, enum: ['info', 'warn', 'error'] },
    message:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata:  { type: Schema.Types.Mixed },
  },
  { timestamps: false },
);

// Auto-delete logs after 7 days (604,800 seconds)
systemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });
// Index fields for fast admin search/paging
systemLogSchema.index({ level: 1, timestamp: -1 });

export const SystemLog = model<ISystemLog>('SystemLog', systemLogSchema);
