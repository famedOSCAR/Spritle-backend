import { Schema, model } from 'mongoose';

const sanctionHistorySchema = new Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },

    userId: {
        type: String,
        required: true,
        index: true
    },

    warnCount: {
        type: Number,
        required: true
    },

    sanctionType: {
        type: String,
        enum: ['timeout', 'kick', 'tempban', 'ban'],
        required: true
    },

    duration: {
        type: Number,
        default: null
    },

    executedAt: {
        type: Date,
        default: Date.now,
        index: true
    }

}, {
    timestamps: true
});

sanctionHistorySchema.index({ guildId: 1, userId: 1, executedAt: -1 });

export default model('SanctionHistory', sanctionHistorySchema);