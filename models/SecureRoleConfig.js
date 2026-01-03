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
    
    // 🆕 TRACKING DE ROLES CREADOS
    createdSecureRoles: [{
        roleId: String,
        roleName: String,
        createdAt: Date,
        createdBy: String,
        isActive: { type: Boolean, default: true }
    }],
    
    // Metadata
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

// Actualizar updatedAt automáticamente
secureRoleConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Método estático para obtener o crear configuración
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

// 🆕 Método para agregar rol creado
secureRoleConfigSchema.methods.addCreatedRole = function(roleId, roleName, createdBy) {
    this.createdSecureRoles.push({
        roleId,
        roleName,
        createdAt: new Date(),
        createdBy,
        isActive: true
    });
    return this.save();
};

// 🆕 Método para marcar rol como eliminado
secureRoleConfigSchema.methods.markRoleAsDeleted = function(roleId) {
    const role = this.createdSecureRoles.find(r => r.roleId === roleId);
    if (role) {
        role.isActive = false;
    }
    return this.save();
};

// 🆕 Método para obtener roles activos
secureRoleConfigSchema.methods.getActiveRoles = function() {
    return this.createdSecureRoles.filter(r => r.isActive);
};

// 🆕 Método para verificar si un rol existe y está activo
secureRoleConfigSchema.methods.hasActiveRole = function(roleId) {
    return this.createdSecureRoles.some(r => r.roleId === roleId && r.isActive);
};

export default mongoose.model('SecureRoleConfig', secureRoleConfigSchema);