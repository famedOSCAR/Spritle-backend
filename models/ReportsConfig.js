import mongoose from "mongoose";

const ReportsConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: "" },
    requireReason: { type: Boolean, default: true },
    anonymousReports: { type: Boolean, default: false },
    minRoleToReport: { type: String, default: "" },
    blacklistedUsers: [String],
    autoDeleteReport: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("ReportsConfig", ReportsConfigSchema);