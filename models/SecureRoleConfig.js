import mongoose from 'mongoose';

const secureRoleConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Auto-asignación para TODOS los nuevos
    autoNew: {
        type: Boolean,
        default: false
    },
    autoNewRole: {
        type: String,
        default: null
    },
    
    // Auto-asignación para cuentas NUEVAS
    autoNewAccounts: {
        type: Boolean,
        default: false
    },
    autoNewAccountsRole: {
        type: String,
        default: null
    },
    autoNewAccountsDays: {
        type: Number,
        default: 7,
        min: 1,
        max: 365
    },
    
    createdSecureRoles: [{
        roleId: String,
        roleName: String,
        createdAt: Date,
        createdBy: String,
        isActive: { type: Boolean, default: true }
    }],
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    configuredBy: {
        type: String,
        default: null
    }
});

secureRoleConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

secureRoleConfigSchema.statics.getOrCreate = async function(guildId) {
    let config = await this.findOne({ guildId });
    
    if (!config) {
        config = await this.create({
            guildId,
            autoNew: false,
            autoNewRole: null,
            autoNewAccounts: false,
            autoNewAccountsRole: null,
            autoNewAccountsDays: 7,
            createdSecureRoles: []
        });
    }
    
    return config;
};

secureRoleConfigSchema.methods.addCreatedRole = async function(roleId, roleName, createdBy) {
    this.createdSecureRoles.push({
        roleId,
        roleName,
        createdAt: new Date(),
        createdBy,
        isActive: true
    });
    await this.save();
    return this;
};

secureRoleConfigSchema.methods.markRoleAsDeleted = async function(roleId) {
    const role = this.createdSecureRoles.find(r => r.roleId === roleId);
    if (role) {
        role.isActive = false;
    }
    await this.save();
    return this;
};

secureRoleConfigSchema.methods.getActiveRoles = function() {
    return this.createdSecureRoles.filter(r => r.isActive);
};

secureRoleConfigSchema.methods.hasActiveRole = function(roleId) {
    return this.createdSecureRoles.some(r => r.roleId === roleId && r.isActive);
};

export default mongoose.model('SecureRoleConfig', secureRoleConfigSchema);