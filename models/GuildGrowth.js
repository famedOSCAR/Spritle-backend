import mongoose from "mongoose";

const SnapshotSchema = new mongoose.Schema({
    time: { type: Date, required: true },
    memberCount: { type: Number, required: true }
}, { _id: false });

const GuildGrowthSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD (día agrupador)
    snapshots: { type: [SnapshotSchema], default: [] }
}, { timestamps: true });

// unique por guildId + date para upserts sencillos
GuildGrowthSchema.index({ guildId: 1, date: 1 }, { unique: true });

export default mongoose.model("GuildGrowth", GuildGrowthSchema);
