// models/ReportsConfig.js (BACKEND)
import mongoose from "mongoose";

const ReportsConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: "" },
    reportChannelId: { type: String, default: "" },
    cooldown: { type: Number, default: 5, min: 1, max: 20 },
    dailyLimit: { type: Number, default: 10, min: 1, max: 20 },
    minRoleToReport: { type: String, default: "" },
    autoDeleteReport: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true }
}, {
    collection: 'reportconfigs', // ⭐ FORZAR A USAR LA MISMA COLECCIÓN QUE EL BOT
    timestamps: true
});

ReportsConfigSchema.pre('save', function(next) {
    if (this.channelId && !this.reportChannelId) {
        this.reportChannelId = this.channelId;
    } else if (this.reportChannelId && !this.channelId) {
        this.channelId = this.reportChannelId;
    }
    next();
});

export default mongoose.model("ReportConfig", ReportsConfigSchema); // ⭐ CAMBIAR NOMBRE TAMBIÉN