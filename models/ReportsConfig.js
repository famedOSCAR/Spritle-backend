// models/ReportsConfig.js (BACKEND)
import mongoose from "mongoose";

// Eliminar modelo si existe (evita cache)
if (mongoose.models.ReportConfig) {
    delete mongoose.models.ReportConfig;
}

const ReportsConfigSchema = new mongoose.Schema({
    guildId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    channelId: { 
        type: String, 
        default: "" 
    },
    reportChannelId: { 
        type: String, 
        default: "" 
    },
    cooldown: { 
        type: Number, 
        default: 5, 
        min: 1, 
        max: 20 
    },
    dailyLimit: { 
        type: Number, 
        default: 10, 
        min: 1, 
        max: 20 
    },
    minRoleToReport: { 
        type: String, 
        default: "" 
    },
    autoDeleteReport: { 
        type: Boolean, 
        default: true 
    },
    enabled: { 
        type: Boolean, 
        default: true 
    }
}, {
    collection: 'reportconfigs',
    timestamps: true
});

export default mongoose.model("ReportConfig", ReportsConfigSchema);