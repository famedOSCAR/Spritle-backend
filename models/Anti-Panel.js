import mongoose from 'mongoose';

const antiRaidSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    everyoneMention: {
        type: Boolean,
        default: false,
        description: 'Eliminar mensajes con @everyone/@here sin permisos'
    },

    spoilerAbuse: {
        type: Boolean,
        default: false,
        description: 'Eliminar mensajes con abuso de spoilers (5+ spoilers)'
    },

    zeroWidth: {
        type: Boolean,
        default: false,
        description: 'Eliminar mensajes con caracteres invisibles (zero-width)'
    },

    fastMessages: {
        type: Boolean,
        default: false,
        description: 'Eliminar mensajes de usuarios escribiendo muy rápido'
    },

    fastMessageThreshold: {
        type: Number,
        default: 5,
        min: 3,
        max: 10,
        description: 'Cantidad de mensajes en 3 segundos para considerar spam'
    },

    spoilerThreshold: {
        type: Number,
        default: 5,
        min: 3,
        max: 20,
        description: 'Cantidad de spoilers para considerar abuso'
    },

    excludedChannels: {
        type: [String],
        default: [],
        description: 'IDs de canales donde los filtros están desactivados'
    },

    excludedRoles: {
        type: [String],
        default: [],
        description: 'IDs de roles inmunes a los filtros'
    },

    logsChannel: {
        type: String,
        default: null,
        description: 'Canal donde enviar logs de acciones del anti-raid'
    },

    stats: {
        totalBlocked: {
            type: Number,
            default: 0,
            description: 'Total de mensajes bloqueados'
        },
        everyoneMentionBlocked: {
            type: Number,
            default: 0
        },
        spoilerAbuseBlocked: {
            type: Number,
            default: 0
        },
        zeroWidthBlocked: {
            type: Number,
            default: 0
        },
        fastMessagesBlocked: {
            type: Number,
            default: 0
        },
        lastReset: {
            type: Date,
            default: Date.now
        }
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    },

    lastConfiguredBy: {
        userId: String,
        username: String,
        timestamp: Date
    }
});

antiRaidSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

antiRaidSchema.methods.incrementStat = async function (filterType) {
    this.stats.totalBlocked++;

    const statMap = {
        'everyoneMention': 'everyoneMentionBlocked',
        'spoilerAbuse': 'spoilerAbuseBlocked',
        'zeroWidth': 'zeroWidthBlocked',
        'fastMessages': 'fastMessagesBlocked'
    };

    if (statMap[filterType]) {
        this.stats[statMap[filterType]]++;
    }

    await this.save();
};

antiRaidSchema.methods.resetStats = async function () {
    this.stats = {
        totalBlocked: 0,
        everyoneMentionBlocked: 0,
        spoilerAbuseBlocked: 0,
        zeroWidthBlocked: 0,
        fastMessagesBlocked: 0,
        lastReset: Date.now()
    };

    await this.save();
};

antiRaidSchema.statics.getOrCreate = async function (guildId) {
    let config = await this.findOne({ guildId });

    if (!config) {
        config = await this.create({ guildId });
    }

    return config;
};
antiRaidSchema.methods.isChannelExcluded = function (channelId) {
    return this.excludedChannels.includes(channelId);
};

antiRaidSchema.methods.hasExcludedRole = function (member) {
    if (!member || !member.roles) return false;

    return member.roles.cache.some(role =>
        this.excludedRoles.includes(role.id)
    );
};

antiRaidSchema.index({ guildId: 1 });
antiRaidSchema.index({ 'stats.totalBlocked': -1 });

const AntiRaid = mongoose.model('AntiRaid', antiRaidSchema);

export default AntiRaid;