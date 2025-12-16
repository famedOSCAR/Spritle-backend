import mongoose from "mongoose";

const WelcomeConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    channel: String,
    message: String,
    textColor: String,
    bgColor: String,
    fontSize: String,
    textPos: String,
    image: String
});

export default mongoose.model("WelcomeConfig", WelcomeConfigSchema);