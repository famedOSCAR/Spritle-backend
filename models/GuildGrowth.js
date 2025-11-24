import mongoose from "mongoose";

const GuildGrowthSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    date: { type: String, required: true },
    memberCount: { type: Number, required: true },
});

export default mongoose.model("GuildGrowth", GuildGrowthSchema);
