import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import VerifySession from '../models/VerifySession.js';
import VerifyConfig from '../models/VerifyConfig.js';

const router = express.Router();

const DISCORD_API = "https://discord.com/api/v10";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = `${process.env.FRONTEND_URL}/verify/callback`;

// ========== ENDPOINT 1: Validar token JWT ==========
router.post('/validate-token', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                valid: false,
                message: 'Token no proporcionado'
            });
        }

        // Verificar JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({
                valid: false,
                message: 'Token inválido o expirado'
            });
        }

        // Buscar sesión en la base de datos
        const session = await VerifySession.findById(decoded.sessionId);

        if (!session) {
            return res.status(404).json({
                valid: false,
                message: 'Sesión no encontrada'
            });
        }

        // Verificar si la sesión expiró
        if (session.expiresAt < new Date()) {
            session.status = 'expired';
            await session.save();
            return res.status(400).json({
                valid: false,
                message: 'Sesión expirada. Solicita un nuevo enlace de verificación.'
            });
        }

        // Verificar si ya fue completada
        if (session.status === 'completed') {
            return res.status(400).json({
                valid: false,
                message: 'Esta sesión ya fue completada'
            });
        }

        // Todo OK, devolver info de la sesión
        res.json({
            valid: true,
            session: {
                userId: session.userId,
                guildId: session.guildId,
                guildName: decoded.guildName || 'Servidor Discord'
            }
        });

    } catch (error) {
        console.error('Error validando token:', error);
        res.status(500).json({
            valid: false,
            message: 'Error del servidor al validar token'
        });
    }
});

// ========== ENDPOINT 2: Callback de Discord OAuth ==========
router.post('/discord-callback', async (req, res) => {
    try {
        const { code, verifyToken } = req.body;

        if (!code || !verifyToken) {
            return res.status(400).json({
                success: false,
                message: 'Código o token faltante'
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

        // Obtener info del usuario
        const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const discordUser = userResponse.data;

        // Verificar que el usuario coincida con la sesión
        let decoded;
        try {
            decoded = jwt.verify(verifyToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Token de verificación inválido'
            });
        }

        if (discordUser.id !== decoded.userId) {
            return res.status(403).json({
                success: false,
                message: 'El usuario de Discord no coincide con la sesión de verificación'
            });
        }

        // Verificar que el usuario siga en el servidor
        try {
            const memberResponse = await axios.get(
                `${DISCORD_API}/users/@me/guilds/${decoded.guildId}/member`,
                {
                    headers: { Authorization: `Bearer ${access_token}` }
                }
            );

            if (!memberResponse.data) {
                return res.status(403).json({
                    success: false,
                    message: 'Ya no eres miembro de este servidor'
                });
            }
        } catch (error) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a este servidor'
            });
        }

        res.json({
            success: true,
            discordToken: access_token
        });

    } catch (error) {
        console.error('Error en callback de Discord:', error.response?.data || error);
        res.status(500).json({
            success: false,
            message: 'Error al autenticar con Discord'
        });
    }
});

// ========== ENDPOINT 3: Completar verificación ==========
router.post('/complete', async (req, res) => {
    try {
        const { token, captchaToken, discordToken } = req.body;

        if (!token || !captchaToken || !discordToken) {
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos'
            });
        }

        console.log('🔍 Verificando reCAPTCHA...'); // ← AGREGAR
        console.log('🔍 Token recibido:', captchaToken?.substring(0, 50) + '...');
        // 1. Verificar reCAPTCHA
        const captchaResponse = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            new URLSearchParams({
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: captchaToken
            })
        );

        console.log('✅ Respuesta de Google:', captchaResponse.data); // ← AGREGAR

        if (!captchaResponse.data.success) {
            console.log('❌ reCAPTCHA falló:', captchaResponse.data); // ← AGREGAR
            return res.status(400).json({
                success: false,
                message: 'Verificación de reCAPTCHA fallida',
                details: captchaResponse.data['error-codes'] // ← AGREGAR esto también
            });
        }

        console.log('✅ reCAPTCHA verificado correctamente'); // ← AGREGAR

        // 2. Decodificar token JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Token inválido'
            });
        }

        // 3. Obtener sesión
        const session = await VerifySession.findById(decoded.sessionId);

        if (!session || session.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Sesión inválida o ya completada'
            });
        }

        // 4. Verificar que no haya expirado
        if (session.expiresAt < new Date()) {
            session.status = 'expired';
            await session.save();
            return res.status(400).json({
                success: false,
                message: 'Sesión expirada'
            });
        }

        // 5. Obtener configuración de verificación del servidor
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

        // 6. Asignar rol usando el bot
        try {
            const guild = global.client.guilds.cache.get(session.guildId);

            if (!guild) {
                return res.status(404).json({
                    success: false,
                    message: 'Servidor no encontrado'
                });
            }

            const member = await guild.members.fetch(session.userId);

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
            await session.save();

            // Log en el servidor
            console.log(`✅ Usuario verificado: ${member.user.tag} (${member.id}) en ${guild.name}`);

            res.json({
                success: true,
                message: 'Verificación completada exitosamente'
            });

        } catch (error) {
            console.error('Error asignando rol:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al asignar el rol de verificación',
                details: error.message
            });
        }

    } catch (error) {
        console.error('Error completando verificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error del servidor al completar verificación'
        });
    }
});

export default router;