import mongoose from "mongoose";

const AutoModSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enlaces: { type: Boolean, default: false },
    enlacesChannels: { type: [String], default: [] },
    spam: { type: Boolean, default: false },
    spamChannels: { type: [String], default: [] },
    invitaciones: { type: Boolean, default: false },
    invitacionesChannels: { type: [String], default: [] },
    menciones: { type: Boolean, default: false },
    mencionesChannels: { type: [String], default: [] },
    mayusculas: { type: Boolean, default: false },
    mayusculasChannels: { type: [String], default: [] }
});

export default mongoose.model("AutoMod", AutoModSchema);