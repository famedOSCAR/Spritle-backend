import mongoose from 'mongoose'

const autoSanctionsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    enabled: {
        type: Boolean,
        default: false
    },
    rules: [{
        warnCount: {
            type: Number,
            required: true
        },
        sanctionType: {
            type: String,
            required: true,
            enum: ['timeout', 'kick', 'tempban', 'ban']
        },
        duration: {
            type: Number,
            default: null
        },
        priority: {
            type: Number,
            default: 1  // Cambiado: Ya no es required, solo tiene default
        }
    }]
}, {
    timestamps: true
});

export default mongoose.model('AutoSanctions', autoSanctionsSchema);