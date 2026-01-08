import mongoose from 'mongoose';

const verifyConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    channelId: {
        type: String,
        default: null
    },
    roleId: {
        type: String,
        default: null
    },
    messageId: {
        type: String,
        default: null
    },
    enabled: {
        type: Boolean,
        default: false
    },
    embedConfig: {
        title: {
            type: String,
            default: '🔒 Verificación del Servidor'
        },
        description: {
            type: String,
            default: 'Haz clic en el botón de abajo para verificar tu cuenta y obtener acceso al servidor.'
        },
        color: {
            type: Number,
            default: 0x5865F2
        },
        imageUrl: {
            type: String,
            default: ''
        }
    }
}, {
    timestamps: true,
    versionKey: '__v'
});

export default mongoose.model('VerifyConfig', verifyConfigSchema);