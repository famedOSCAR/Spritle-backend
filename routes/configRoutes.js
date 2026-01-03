import express from 'express';
import { PermissionFlagsBits } from 'discord.js';
const router = express.Router();

// Importar modelos
import AutoSanctions from '../models/AutoSanctions.js';
import SanctionHistory from '../models/SanctionHistory.js';
import LogsConfig from '../models/LogsConfig.js';
import DisabledCommands from '../models/DisabledCommands.js';
import Guild from '../models/Guild.js';
import SecureRoleConfig from '../models/SecureRoleConfig.js';

// ====================================================================
// AUTO-SANCTIONS ROUTES
// ====================================================================

router.get('/:guildId/auto-sanctions', async (req, res) => {
    try {
        const { guildId } = req.params;
        let config = await AutoSanctions.findOne({ guildId });
        if (!config) {
            config = { enabled: false, rules: [] };
        }
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo auto-sanctions:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

router.post('/:guildId/auto-sanctions', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { enabled, rules } = req.body;
        const config = await AutoSanctions.findOneAndUpdate(
            { guildId },
            { guildId, enabled, rules },
            { upsert: true, new: true }
        );
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error guardando auto-sanctions:', err);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

router.get('/:guildId/auto-sanctions/stats', async (req, res) => {
    try {
        const { guildId } = req.params;
        const total = await SanctionHistory.countDocuments({ guildId });
        const last24h = await SanctionHistory.countDocuments({
            guildId,
            executedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        const last7days = await SanctionHistory.countDocuments({
            guildId,
            executedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        res.json({ total, last24h, last7days });
    } catch (err) {
        console.error('Error obteniendo stats:', err);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

// ====================================================================
// LOGS CONFIG ROUTES
// ====================================================================

router.get('/:guildId/logs', async (req, res) => {
    try {
        const { guildId } = req.params;
        const config = await LogsConfig.findOne({ guildId });
        if (!config) {
            return res.json({ logChannelId: null, cmdDetectorEnabled: false });
        }
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo logs config:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

router.post('/:guildId/logs', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { logChannelId, cmdDetectorEnabled } = req.body;
        if (!logChannelId) {
            return res.status(400).json({ error: 'Se requiere un canal de logs' });
        }
        const config = await LogsConfig.findOneAndUpdate(
            { guildId },
            { guildId, logChannelId, cmdDetectorEnabled: cmdDetectorEnabled || false, updatedAt: Date.now(), updatedBy: req.user?.id },
            { upsert: true, new: true }
        );
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error guardando logs config:', err);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

router.delete('/:guildId/logs', async (req, res) => {
    try {
        const { guildId } = req.params;
        await LogsConfig.deleteOne({ guildId });
        res.json({ ok: true, message: 'Configuración eliminada' });
    } catch (err) {
        console.error('Error eliminando logs config:', err);
        res.status(500).json({ error: 'Error eliminando configuración' });
    }
});

// ====================================================================
// DISABLED COMMANDS ROUTES
// ====================================================================

router.get('/:guildId/disabled-commands', async (req, res) => {
    try {
        const { guildId } = req.params;
        const config = await DisabledCommands.findOne({ guildId });
        if (!config) {
            return res.json({ disabledCommands: [], disabledBy: {} });
        }
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo disabled commands:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

router.post('/:guildId/disabled-commands', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { command } = req.body;
        const protectedCommands = ['comando', 'help', 'command'];
        if (protectedCommands.includes(command)) {
            return res.status(400).json({ error: 'Este comando está protegido' });
        }
        let config = await DisabledCommands.findOne({ guildId });
        if (!config) {
            config = await DisabledCommands.create({ guildId, disabledCommands: [], disabledBy: new Map() });
        }
        if (!config.disabledCommands.includes(command)) {
            config.disabledCommands.push(command);
            config.disabledBy.set(command, {
                userId: req.user?.id,
                timestamp: new Date(),
                reason: `Desactivado desde el dashboard por ${req.user?.username}`
            });
            await config.save();
        }
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error desactivando comando:', err);
        res.status(500).json({ error: 'Error desactivando comando' });
    }
});

router.delete('/:guildId/disabled-commands/:command', async (req, res) => {
    try {
        const { guildId, command } = req.params;
        const config = await DisabledCommands.findOne({ guildId });
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        config.disabledCommands = config.disabledCommands.filter(cmd => cmd !== command);
        config.disabledBy.delete(command);
        await config.save();
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error activando comando:', err);
        res.status(500).json({ error: 'Error activando comando' });
    }
});

// ====================================================================
// LANGUAGE ROUTES
// ====================================================================

router.get('/:guildId/language', async (req, res) => {
    try {
        const { guildId } = req.params;
        let guild = await Guild.findOne({ guildId });
        if (!guild) {
            return res.json({ lang: 'es' });
        }
        res.json({ lang: guild.lang || 'es' });
    } catch (err) {
        console.error('Error obteniendo idioma:', err);
        res.status(500).json({ error: 'Error obteniendo idioma' });
    }
});

router.post('/:guildId/language', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { lang } = req.body;
        if (!['es', 'en'].includes(lang)) {
            return res.status(400).json({ error: 'Idioma no válido' });
        }
        const guild = await Guild.findOneAndUpdate(
            { guildId },
            { guildId, lang },
            { upsert: true, new: true }
        );
        res.json({ ok: true, lang: guild.lang });
    } catch (err) {
        console.error('Error cambiando idioma:', err);
        res.status(500).json({ error: 'Error cambiando idioma' });
    }
});

// ====================================================================
// SECURE ROLE ROUTES
// ====================================================================

router.get('/:guildId/secure-role', async (req, res) => {
    try {
        const { guildId } = req.params;
        let config = await SecureRoleConfig.findOne({ guildId });
        if (!config) {
            config = {
                createdSecureRoles: [],
                autoNew: false,
                autoNewRole: null,
                autoNewAccounts: false,
                autoNewAccountsRole: null,
                autoNewAccountsDays: 7
            };
        }
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo secure role config:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

router.post('/:guildId/secure-role/create', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Se requiere un nombre para el rol' });
        }

        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        let config = await SecureRoleConfig.findOne({ guildId });
        if (!config) {
            config = await SecureRoleConfig.create({
                guildId,
                createdSecureRoles: [],
                autoNew: false,
                autoNewRole: null,
                autoNewAccounts: false,
                autoNewAccountsRole: null,
                autoNewAccountsDays: 7
            });
        }

        const activeRoles = config.createdSecureRoles.filter(r => r.isActive);
        if (activeRoles.length > 0) {
            return res.status(400).json({ error: 'Ya existe un secure-role activo' });
        }

        const role = await guild.roles.create({
            name: name,
            color: 0x95a5a6,
            permissions: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.CreatePublicThreads,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.UseVAD,
                PermissionFlagsBits.Stream
            ],
            reason: `Security role created from dashboard by ${req.user.username}`
        });

        const channels = guild.channels.cache.filter(c => c.isTextBased() || c.isVoiceBased());
        for (const [channelId, channel] of channels) {
            try {
                await channel.permissionOverwrites.create(role, {
                    UseApplicationCommands: false,
                    UseExternalApps: false,
                    MentionEveryone: false,
                    AttachFiles: false,
                    EmbedLinks: false,
                    UseExternalEmojis: false,
                    UseExternalStickers: false,
                    SendVoiceMessages: false,
                    CreateInstantInvite: false,
                    ManageChannels: false,
                    ManageRoles: false,
                    ManageWebhooks: false,
                    ManageThreads: false
                });
            } catch (err) {
                console.error(`Error aplicando permisos en ${channel.name}:`, err);
            }
        }

        config.createdSecureRoles.push({
            roleId: role.id,
            roleName: name,
            createdAt: new Date(),
            createdBy: req.user?.id,
            isActive: true
        });
        
        await config.save();
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error creando secure role:', err);
        res.status(500).json({ error: 'Error creando rol' });
    }
});

router.post('/:guildId/secure-role/rename', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { roleId, newName } = req.body;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }

        await role.setName(newName, `Renamed from dashboard by ${req.user.username}`);

        const config = await SecureRoleConfig.findOne({ guildId });
        if (config) {
            const roleData = config.createdSecureRoles.find(r => r.roleId === roleId);
            if (roleData) {
                roleData.roleName = newName;
                await config.save();
            }
        }
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error renombrando rol:', err);
        res.status(500).json({ error: 'Error renombrando rol' });
    }
});

router.post('/:guildId/secure-role/assign', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { roleId, userId } = req.body;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }

        await member.roles.add(role, `Assigned from dashboard by ${req.user.username}`);
        
        res.json({ ok: true, message: 'Rol asignado correctamente' });
    } catch (err) {
        console.error('Error asignando rol:', err);
        res.status(500).json({ error: 'Error asignando rol' });
    }
});

router.post('/:guildId/secure-role/remove', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { roleId, userId } = req.body;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }

        await member.roles.remove(role, `Removed from dashboard by ${req.user.username}`);
        
        res.json({ ok: true, message: 'Rol removido correctamente' });
    } catch (err) {
        console.error('Error removiendo rol:', err);
        res.status(500).json({ error: 'Error removiendo rol' });
    }
});

router.get('/:guildId/secure-role/list', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { roleId } = req.query;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }

        const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId));
        
        const members = membersWithRole.map(member => {
            const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
            return {
                tag: member.user.tag,
                id: member.id,
                accountAge: accountAge
            };
        });
        
        res.json({ members });
    } catch (err) {
        console.error('Error listando miembros:', err);
        res.status(500).json({ error: 'Error listando miembros' });
    }
});

router.post('/:guildId/secure-role/apply-restrictions', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { roleId } = req.body;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            return res.status(404).json({ error: 'Rol no encontrado' });
        }

        const channels = guild.channels.cache.filter(c => c.isTextBased() || c.isVoiceBased());
        let success = 0;
        let failed = 0;

        for (const [channelId, channel] of channels) {
            try {
                await channel.permissionOverwrites.create(role, {
                    UseApplicationCommands: false,
                    UseExternalApps: false,
                    MentionEveryone: false,
                    AttachFiles: false,
                    EmbedLinks: false,
                    UseExternalEmojis: false,
                    UseExternalStickers: false,
                    SendVoiceMessages: false,
                    CreateInstantInvite: false,
                    ManageChannels: false,
                    ManageRoles: false,
                    ManageWebhooks: false,
                    ManageThreads: false
                });
                success++;
            } catch (err) {
                failed++;
            }
        }
        
        res.json({ ok: true, success, failed, total: channels.size });
    } catch (err) {
        console.error('Error aplicando restricciones:', err);
        res.status(500).json({ error: 'Error aplicando restricciones' });
    }
});

router.post('/:guildId/secure-role/verify', async (req, res) => {
    try {
        const { guildId } = req.params;
        
        const client = req.discordClient;
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const config = await SecureRoleConfig.findOne({ guildId });
        if (!config) {
            return res.json({ ok: true, cleaned: 0 });
        }

        let cleaned = 0;
        for (const roleData of config.createdSecureRoles) {
            if (!roleData.isActive) continue;
            const role = guild.roles.cache.get(roleData.roleId);
            if (!role) {
                roleData.isActive = false;
                cleaned++;
            }
        }

        if (cleaned > 0) {
            await config.save();
        }
        
        res.json({ ok: true, cleaned, config });
    } catch (err) {
        console.error('Error verificando roles:', err);
        res.status(500).json({ error: 'Error verificando roles' });
    }
});

router.post('/:guildId/secure-role/auto-new', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { enabled, roleId } = req.body;
        
        const config = await SecureRoleConfig.findOne({ guildId });
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        
        config.autoNew = enabled;
        config.autoNewRole = enabled ? roleId : null;
        await config.save();
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error toggling auto-new:', err);
        res.status(500).json({ error: 'Error actualizando configuración' });
    }
});

router.post('/:guildId/secure-role/auto-new-accounts', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { enabled, roleId, days } = req.body;
        
        const config = await SecureRoleConfig.findOne({ guildId });
        if (!config) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        
        config.autoNewAccounts = enabled;
        config.autoNewAccountsRole = enabled ? roleId : null;
        config.autoNewAccountsDays = days || 7;
        await config.save();
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error toggling auto-new-accounts:', err);
        res.status(500).json({ error: 'Error actualizando configuración' });
    }
});

router.get('/commands', async (req, res) => {
    try {
        const commands = [
            { name: 'warn', description: 'Advertir a un usuario', category: 'Moderación' },
            { name: 'ban', description: 'Banear a un usuario', category: 'Moderación' },
            { name: 'kick', description: 'Expulsar a un usuario', category: 'Moderación' },
            { name: 'mute', description: 'Silenciar a un usuario', category: 'Moderación' },
            { name: 'clear', description: 'Limpiar mensajes', category: 'Moderación' },
            { name: 'avatar', description: 'Ver avatar de usuario', category: 'Utilidad' },
            { name: 'userinfo', description: 'Info de usuario', category: 'Utilidad' },
            { name: 'serverinfo', description: 'Info del servidor', category: 'Utilidad' },
            { name: 'ping', description: 'Ver latencia del bot', category: 'Utilidad' }
        ];
        res.json(commands);
    } catch (err) {
        console.error('Error obteniendo comandos:', err);
        res.status(500).json({ error: 'Error obteniendo comandos' });
    }
});

export default router;