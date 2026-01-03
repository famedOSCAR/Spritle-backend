import express from 'express';
const router = express.Router();

// Importar modelos (ajusta las rutas según tu estructura)
import AutoSanctions from '../models/AutoSanctions.js';
import SanctionHistory from '../models/SanctionHistory.js';
import LogsConfig from '../models/LogsConfig.js';
import DisabledCommands from '../models/DisabledCommands.js';
import Guild from '../models/Guild.js';
import SecureRoleConfig from '../models/SecureRoleConfig.js';

// ====================================================================
// AUTO-SANCTIONS ROUTES
// ====================================================================

// GET - Obtener configuración de auto-sanciones
router.get('/:guildId/auto-sanctions', async (req, res) => {
    try {
        const { guildId } = req.params;
        
        let config = await AutoSanctions.findOne({ guildId });
        
        if (!config) {
            config = {
                enabled: false,
                rules: []
            };
        }
        
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo auto-sanctions:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

// POST - Guardar configuración de auto-sanciones
router.post('/:guildId/auto-sanctions', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { enabled, rules } = req.body;
        
        const config = await AutoSanctions.findOneAndUpdate(
            { guildId },
            { 
                guildId,
                enabled,
                rules
            },
            { upsert: true, new: true }
        );
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error guardando auto-sanctions:', err);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

// GET - Obtener estadísticas de auto-sanciones
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

// GET - Obtener configuración de logs
router.get('/:guildId/logs', async (req, res) => {
    try {
        const { guildId } = req.params;
        
        const config = await LogsConfig.findOne({ guildId });
        
        if (!config) {
            return res.json({
                logChannelId: null,
                cmdDetectorEnabled: false
            });
        }
        
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo logs config:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

// POST - Guardar configuración de logs
router.post('/:guildId/logs', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { logChannelId, cmdDetectorEnabled } = req.body;
        
        if (!logChannelId) {
            return res.status(400).json({ error: 'Se requiere un canal de logs' });
        }
        
        const config = await LogsConfig.findOneAndUpdate(
            { guildId },
            {
                guildId,
                logChannelId,
                cmdDetectorEnabled: cmdDetectorEnabled || false,
                updatedAt: Date.now(),
                updatedBy: req.user?.id
            },
            { upsert: true, new: true }
        );
        
        res.json({ ok: true, config });
    } catch (err) {
        console.error('Error guardando logs config:', err);
        res.status(500).json({ error: 'Error guardando configuración' });
    }
});

// DELETE - Eliminar configuración de logs
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

// GET - Obtener comandos desactivados
router.get('/:guildId/disabled-commands', async (req, res) => {
    try {
        const { guildId } = req.params;
        
        const config = await DisabledCommands.findOne({ guildId });
        
        if (!config) {
            return res.json({
                disabledCommands: [],
                disabledBy: {}
            });
        }
        
        res.json(config);
    } catch (err) {
        console.error('Error obteniendo disabled commands:', err);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
});

// POST - Desactivar un comando
router.post('/:guildId/disabled-commands', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { command } = req.body;
        
        // Comandos protegidos
        const protectedCommands = ['comando', 'help', 'command'];
        if (protectedCommands.includes(command)) {
            return res.status(400).json({ error: 'Este comando está protegido' });
        }
        
        let config = await DisabledCommands.findOne({ guildId });
        
        if (!config) {
            config = await DisabledCommands.create({
                guildId,
                disabledCommands: [],
                disabledBy: new Map()
            });
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

// DELETE - Activar un comando
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

// GET - Obtener idioma del servidor
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

// POST - Cambiar idioma del servidor
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

// GET - Obtener configuración de secure roles
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

// POST - Crear rol de seguridad
router.post('/:guildId/secure-role/create', async (req, res) => {
    try {
        const { guildId } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Se requiere un nombre para el rol' });
        }
        
        // Aquí deberías usar tu cliente de Discord para crear el rol
        // Este es un ejemplo de cómo sería:
        /*
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }
        
        const role = await guild.roles.create({
            name: name,
            color: 0x95a5a6,
            permissions: [
                // Permisos mínimos
            ],
            reason: `Security role created from dashboard by ${req.user.username}`
        });
        */
        
        // Por ahora, simulamos la creación
        const roleId = 'SIMULATED_ROLE_ID_' + Date.now();
        
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
        
        config.createdSecureRoles.push({
            roleId: roleId,
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

// POST - Toggle auto-new
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

// POST - Toggle auto-new-accounts
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

// ====================================================================
// LISTA DE COMANDOS (para el selector)
// ====================================================================

// GET - Obtener lista de comandos disponibles
router.get('/commands', async (req, res) => {
    try {
        // Aquí deberías retornar la lista de comandos de tu bot
        // Este es un ejemplo estático
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