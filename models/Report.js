// models/Report.js (BACKEND)
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    reportId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['spam', 'harassment', 'nsfw', 'scam', 'hate_speech', 'threats', 'rule_violation', 'other']
    },
    reportedBy: {
        type: String,
        required: true,
        index: true
    },
    targetUser: {
        type: String,
        required: true,
        index: true
    },
    targetMessage: {
        type: String,
        default: null
    },
    channelId: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        default: 'No se proporcionó razón específica'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'reviewing', 'resolved', 'dismissed', 'false'],
        default: 'pending',
        index: true
    },
    context: {
        type: Array,
        default: []
    },
    similarReports: {
        type: Number,
        default: 0
    },
    reviewedBy: {
        type: String,
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    resolution: {
        type: String,
        default: null
    },
    actionTaken: {
        type: String,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    collection: 'reports' // ⭐ ASEGÚRATE DE QUE DIGA ESTO
});

reportSchema.index({ guildId: 1, status: 1, timestamp: -1 });
reportSchema.index({ reportedBy: 1, timestamp: -1 });
reportSchema.index({ targetUser: 1, timestamp: -1 });

export default mongoose.model('Report', reportSchema);