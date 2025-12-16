import mongoose from "mongoose";

const ModerationConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    automod: { type: Boolean, default: false },
    antiSpam: { type: Boolean, default: false },
    antiLinks: { type: Boolean, default: false },
    antiInvites: { type: Boolean, default: false },
    maxMentions: { type: Number, default: 5 },
    maxMessages: { type: Number, default: 5 },
    logChannel: { type: String, default: "" },
    muteRole: { type: String, default: "" },
    warningThreshold: { type: Number, default: 3 }
}, { timestamps: true });

export default mongoose.model("ModerationConfig", ModerationConfigSchema);