const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    lang: {
        type: String,
        default: 'es',
        enum: ['es', 'en']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Guild', guildSchema);