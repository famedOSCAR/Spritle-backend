// models/ReportsConfig.js (BACKEND) - ⭐ MIDDLEWARE CORREGIDO
import mongoose from "mongoose";

const ReportsConfigSchema = new mongoose.Schema({
    guildId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    channelId: { 
        type: String, 
        required: true,
        default: "" 
    },
    // ⭐ Mantener reportChannelId solo para compatibilidad con bot antiguo
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

// ⭐ Middleware para mantener sincronizados channelId y reportChannelId
ReportsConfigSchema.pre('save', function(next) {
    // Si se actualiza channelId, actualizar reportChannelId
    if (this.isModified('channelId') && this.channelId) {
        this.reportChannelId = this.channelId;
    }
    // Si se actualiza reportChannelId, actualizar channelId
    else if (this.isModified('reportChannelId') && this.reportChannelId) {
        this.channelId = this.reportChannelId;
    }
    // Si solo uno tiene valor, sincronizar
    else if (this.channelId && !this.reportChannelId) {
        this.reportChannelId = this.channelId;
    } else if (this.reportChannelId && !this.channelId) {
        this.channelId = this.reportChannelId;
    }
    next();
});

// ⭐ CORREGIDO: Middleware para findOneAndUpdate SIN async
ReportsConfigSchema.pre('findOneAndUpdate', function(next) {
    const update = this.getUpdate();
    
    // Manejar tanto $set como updates directos
    if (update.$set) {
        // Si se actualiza channelId
        if (update.$set.channelId) {
            update.$set.reportChannelId = update.$set.channelId;
        }
        // Si se actualiza reportChannelId
        if (update.$set.reportChannelId) {
            update.$set.channelId = update.$set.reportChannelId;
        }
    } else {
        // Updates directos sin $set
        if (update.channelId) {
            update.reportChannelId = update.channelId;
        }
        if (update.reportChannelId) {
            update.channelId = update.reportChannelId;
        }
    }
    
    next();
});

export default mongoose.model("ReportConfig", ReportsConfigSchema);