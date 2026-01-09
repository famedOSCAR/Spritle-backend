import mongoose from 'mongoose';

const verifySessionSchema = new mongoose.Schema({
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
    token: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'expired', 'failed'],
        default: 'pending',
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    completedAt: {
        type: Date,
        default: null
    },
    ipAddress: {
        type: String,
        default: null
    },
    attempts: {
        type: Number,
        default: 0
    },
    dmMessageId: {
        type: String,
        required: false
    },
    lastAttempt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index compuesto para búsquedas rápidas
verifySessionSchema.index({ guildId: 1, userId: 1, status: 1 });

verifySessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model('VerifySession', verifySessionSchema);