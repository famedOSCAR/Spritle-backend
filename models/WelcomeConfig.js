import mongoose from "mongoose";

const WelcomeConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channel: String,
    message: String,
    textColor: String,
    bgColor: String,
    fontSize: Number,
    textPos: String,
    image: String 
}, { timestamps: true });

export default mongoose.model("WelcomeConfig", WelcomeConfigSchema);
