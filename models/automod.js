import mongoose from "mongoose";

const AutoModSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    
    // Enlaces
    enlaces: { type: Boolean, default: false },
    enlacesChannels: { type: [String], default: [] },
    enlacesTimeout: { type: Number, default: 0 },
    
    // Spam
    spam: { type: Boolean, default: false },
    spamChannels: { type: [String], default: [] },
    spamTimeout: { type: Number, default: 0 },
    
    // Invitaciones
    invitaciones: { type: Boolean, default: false },
    invitacionesChannels: { type: [String], default: [] },
    invitacionesTimeout: { type: Number, default: 0 }, 
    
    // Menciones
    menciones: { type: Boolean, default: false },
    mencionesChannels: { type: [String], default: [] },
    mencionesTimeout: { type: Number, default: 0 },
    
    // Mayúsculas
    mayusculas: { type: Boolean, default: false },
    mayusculasChannels: { type: [String], default: [] },
    mayusculasTimeout: { type: Number, default: 0 }
});

export default mongoose.model("AutoMod", AutoModSchema);