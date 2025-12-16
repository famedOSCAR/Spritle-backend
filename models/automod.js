const mongoose = require('mongoose');

const autoModSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    enlaces: { type: Boolean, default: false },
    enlacesChannels: { type: [String], default: [] },
    spam: { type: Boolean, default: false },
    spamChannels: { type: [String], default: [] },
    menciones: { type: Boolean, default: false },
    mencionesChannels: { type: [String], default: [] },
    mayusculas: { type: Boolean, default: false },
    mayusculasChannels: { type: [String], default: [] },
    invitaciones: { type: Boolean, default: false },
    invitacionesChannels: { type: [String], default: [] },
});

export default mongoose.model('AutoMod', autoModSchema);