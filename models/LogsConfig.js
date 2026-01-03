import mongoose from 'mongoose';

const logsConfigSchema = new mongoose.Schema({
    guildId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    logChannelId: { 
        type: String, 
        required: true 
    },
    cmdDetectorEnabled: {
        type: Boolean,
        default: false
    },
    updatedAt: { 
        type: Number, 
        default: Date.now 
    },
    updatedBy: { 
        type: String 
    }
});

export default mongoose.model('LogsConfig', logsConfigSchema);