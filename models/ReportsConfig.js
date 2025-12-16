import mongoose from "mongoose";

const ReportsConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, default: "" }, // SIN enabled
    requireReason: { type: Boolean, default: true },
    anonymousReports: { type: Boolean, default: false },
    minRoleToReport: { type: String, default: "" },
    autoDeleteReport: { type: Boolean, default: true }
});

export default mongoose.model("ReportsConfig", ReportsConfigSchema);