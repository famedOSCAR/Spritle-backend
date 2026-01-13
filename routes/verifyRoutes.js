// routes/verifyRoutes.js
import express from 'express';
import axios from 'axios';
import VerifySession from '../models/VerifySession.js';
import VerifyConfig from '../models/VerifyConfig.js';

const router = express.Router();

const DISCORD_API = "https://discord.com/api/v10";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = `${process.env.FRONTEND_URL}/verify/callback`;

// ✅ ENDPOINT 1: Validar URL Slug
router.post('/validate-slug', async (req, res) => {
    try {
        const { urlSlug } = req.body;

        if (!urlSlug || !urlSlug.includes('-')) {
            return res.json({ 
                valid: false, 
                message: 'Enlace de verificación inválido' 
            });
        }

        // Buscar sesión por slug
        const session = await VerifySession.findOne({
            urlSlug: urlSlug,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            return res.json({ 
                valid: false, 
                message: 'Enlace expirado o ya utilizado' 
            });
        }

        // Obtener información del servidor y usuario desde Discord
        let guildName = 'Servidor de Discord';
        let userAvatar = null;

        try {
            const client = global.client;
            if (client) {
                const guild = client.guilds.cache.get(session.guildId);
                if (guild) {
                    guildName = guild.name;
                    
                    // Obtener el miembro para tener su avatar
                    const member = await guild.members.fetch(session.userId).catch(() => null);
                    if (member && member.user.avatar) {
                        userAvatar = member.user.avatar;
                    }
                }
            }
        } catch (error) {
            console.error('Error obteniendo info del guild:', error);
        }

        // Obtener configuración del servidor (por si acaso tiene más info)
        const config = await VerifyConfig.findOne({ guildId: session.guildId });
        
        res.json({
            valid: true,
            session: {
                guildId: session.guildId,
                guildName: guildName,
                userId: session.userId,
                avatar: userAvatar
            }
        });
    } catch (error) {
        console.error('❌ Error validando slug:', error);
        res.status(500).json({ 
            valid: false, 
            message: 'Error del servidor' 
        });
    }
});

// ✅ ENDPOINT 2: Callback de Discord OAuth
router.post('/discord-callback', async (req, res) => {
    try {
        const { code, urlSlug } = req.body;

        if (!code || !urlSlug) {
            return res.status(400).json({
                success: false,
                message: 'Código o slug faltante'
            });
        }

        // Intercambiar código por access token
        const tokenResponse = await axios.post(
            `${DISCORD_API}/oauth2/token`,
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const { access_token } = tokenResponse.data;

        // Obtener info del usuario de Discord
        const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const discordUser = userResponse.data;

        // ✅ VALIDACIÓN CRÍTICA: Verificar que el User ID coincida
        const session = await VerifySession.findOne({
            urlSlug: urlSlug,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            return res.status(400).json({
                success: false,
                message: 'Sesión inválida o expirada'
            });
        }

        if (discordUser.id !== session.userId) {
            console.log(`❌ User ID no coincide: OAuth=${discordUser.id} vs Session=${session.userId}`);
            return res.status(403).json({
                success: false,
                message: 'Este enlace no es para tu cuenta de Discord'
            });
        }

        console.log(`✅ User ID verificado: ${discordUser.username} (${discordUser.id})`);

        // Verificar que el usuario siga en el servidor
        try {
            const client = global.client;
            if (client) {
                const guild = client.guilds.cache.get(session.guildId);
                if (guild) {
                    const member = await guild.members.fetch(session.userId).catch(() => null);
                    if (!member) {
                        return res.status(403).json({
                            success: false,
                            message: 'Ya no eres miembro de este servidor'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error verificando membresía:', error);
        }

        res.json({
            success: true,
            discordToken: access_token,
            verified: true
        });

    } catch (error) {
        console.error('❌ Error en callback de Discord:', error.response?.data || error);
        res.status(500).json({
            success: false,
            message: 'Error al autenticar con Discord'
        });
    }
});

// ✅ ENDPOINT 3: Completar Verificación
router.post('/complete', async (req, res) => {
    try {
        const { urlSlug, captchaToken, discordToken } = req.body;

        if (!urlSlug || !captchaToken || !discordToken) {
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos'
            });
        }

        console.log('🔍 Verificando reCAPTCHA...');

        // 1. Verificar reCAPTCHA v3
        const captchaResponse = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            new URLSearchParams({
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: captchaToken
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('✅ Respuesta de Google:', captchaResponse.data);

        if (!captchaResponse.data.success) {
            console.log('❌ reCAPTCHA falló:', captchaResponse.data);
            return res.status(400).json({
                success: false,
                message: 'Verificación de reCAPTCHA fallida',
                details: captchaResponse.data['error-codes']
            });
        }

        if (captchaResponse.data.score < 0.5) {
            console.log(`⚠️ reCAPTCHA score bajo: ${captchaResponse.data.score}`);
            return res.status(400).json({
                success: false,
                message: 'Sospecha de actividad automatizada'
            });
        }

        console.log(`✅ reCAPTCHA aprobado - Score: ${captchaResponse.data.score}`);

        // 2. Buscar sesión activa
        const session = await VerifySession.findOne({
            urlSlug: urlSlug,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });

        if (!session) {
            return res.status(400).json({
                success: false,
                message: 'Enlace expirado o ya utilizado'
            });
        }

        // 3. Obtener configuración del servidor
        const config = await VerifyConfig.findOne({
            guildId: session.guildId,
            enabled: true
        });

        if (!config || !config.roleId) {
            return res.status(400).json({
                success: false,
                message: 'Sistema de verificación no configurado'
            });
        }

        // 4. Asignar rol usando el bot
        try {
            const client = global.client;

            if (!client) {
                console.error('❌ Cliente de Discord no disponible');
                return res.status(500).json({
                    success: false,
                    message: 'Bot no disponible temporalmente'
                });
            }

            const guild = client.guilds.cache.get(session.guildId);

            if (!guild) {
                return res.status(404).json({
                    success: false,
                    message: 'Servidor no encontrado'
                });
            }

            const member = await guild.members.fetch(session.userId).catch(() => null);

            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado en el servidor'
                });
            }

            // Verificar si ya tiene el rol
            if (member.roles.cache.has(config.roleId)) {
                session.status = 'completed';
                session.completedAt = new Date();
                session.ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
                await session.save();

                return res.json({
                    success: true,
                    message: 'Ya estabas verificado'
                });
            }

            // Asignar rol
            await member.roles.add(config.roleId);

            // Marcar sesión como completada
            session.status = 'completed';
            session.completedAt = new Date();
            session.ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
            session.attempts += 1;
            await session.save();

            console.log(`✅ Usuario verificado: ${member.user.tag} (${member.id}) en ${guild.name}`);

            res.json({
                success: true,
                message: 'Verificación completada exitosamente'
            });

        } catch (error) {
            console.error('❌ Error asignando rol:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al asignar el rol',
                details: error.message
            });
        }

    } catch (error) {
        console.error('❌ Error completando verificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error del servidor'
        });
    }
});

export default router;