import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import mongoose from "mongoose";
import cron from "node-cron";
import GuildGrowth from "./models/GuildGrowth.js";
import AutoMod from "./models/automod.js";
import Report from "./models/Report.js";
import ReportConfig from "./models/ReportsConfig.js";
import configRoutes from './routes/configRoutes.js';
import verifyRoutes from './routes/verifyRoutes.js';

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error conectando MongoDB:", err));

const DISCORD_API = "https://discord.com/api";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) throw new Error("No BOT_TOKEN in environment variables!");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "https://spritleweb.netlify.app",
            "http://localhost:5173",
            "https://spritle-backend-iqn3.onrender.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: [
        "https://spritleweb.netlify.app",
        "http://localhost:5173",
        "https://spritle-backend-iqn3.onrender.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));

app.use(express.json());

/* =======================================================
================   BOT STATS (SOCKET.IO)   ==============
======================================================= */

let botStats = { ping: 0, guilds: 0, members: 0, uptime: 0 };

app.get("/api/stats", (req, res) => {
    res.json(botStats);
});

app.post("/update-stats", (req, res) => {
    botStats = req.body;
    
    const botStatus = {
        online: req.body.online || false,
        lastUpdate: new Date(),
        readySince: botStats.readySince || new Date()
    };
    
    io.emit("bot-stats", botStats);
    io.emit("bot-status", botStatus);
    
    res.sendStatus(200);
});

io.on("connection", (socket) => {
    socket.emit("bot-stats", botStats);
});

/* =======================================================
================   DISCORD BOT CLIENT   =================
======================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});
global.client = client;
/* =======================================================
================   MIDDLEWARE JWT   =====================
======================================================= */

function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token provided" });

    const token = header.split(" ")[1];

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        console.error("JWT error:", err);
        res.status(403).json({ error: "Invalid token" });
    }
}

app.use('/api/verify', verifyRoutes);
app.use('/api', verifyToken, (req, res, next) => {
    req.discordClient = client;
    next();
}, configRoutes);




client.on("ready", () => {
    console.log(`Bot listo: ${client.user.tag}`);

    cron.schedule("0 0 * * *", async () => {
        const today = new Date().toISOString().split("T")[0];

        await Promise.allSettled(client.guilds.cache.map(async guild => {
            const exists = await GuildGrowth.findOne({ guildId: guild.id, date: today });
            if (!exists) {
                await GuildGrowth.create({ guildId: guild.id, date: today, memberCount: guild.memberCount });
            }
        }));

        console.log("Datos de crecimiento guardados");
    });
});

client.on("guildMemberAdd", async (member) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const guildId = member.guild.id;
        const memberCount = member.guild.memberCount;

        const exists = await GuildGrowth.findOne({ guildId, date: today });
        if (exists) {
            exists.memberCount = memberCount;
            await exists.save();
        } else {
            await GuildGrowth.create({ guildId, date: today, memberCount });
        }

        console.log(`✅ Miembro añadido a ${member.guild.name}, total: ${memberCount}`);
    } catch (err) {
        console.error("❌ Error en guildMemberAdd:", err);
    }
});

client.login(BOT_TOKEN);

function updateBotStats() {
    if (!client.isReady()) {
        console.log("⏳ Bot aún no está listo...");
        return;
    }

    const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    
    const newStats = {
        ping: client.ws.ping || 0,
        guilds: client.guilds.cache.size,
        members: totalMembers,
        uptime: Math.floor(client.uptime / 1000)
    };

    botStats = newStats;
    io.emit("bot-stats", newStats);
    
    console.log(`Stats actualizadas: ${newStats.guilds} servidores, ${newStats.members} usuarios, ${newStats.ping}ms`);
}

setInterval(updateBotStats, 20000);

client.once("ready", () => {
    setTimeout(updateBotStats, 5000);
});

/* =======================================================
================   DISCORD LOGIN   ======================
======================================================= */

app.get("/auth/discord", (req, res) => {
    const redirect = encodeURIComponent(process.env.REDIRECT_URI);
    res.redirect(
        `https://discord.com/api/oauth2/authorize?` +
        `client_id=${process.env.CLIENT_ID}` +
        `&redirect_uri=${redirect}` +
        `&response_type=code` +
        `&scope=identify%20guilds`
    );
});

/* =======================================================
================   CALLBACK DISCORD   ===================
======================================================= */

app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    try {
        const data = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.REDIRECT_URI
        });

        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            data,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const user = userRes.data;

        const jwtToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                discordAccessToken: access_token
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.redirect(`https://spritleweb.netlify.app/auth/callback?token=${jwtToken}`);
    } catch (err) {
        console.error("OAuth error:", err?.response?.data || err);
        res.status(500).send("Error en OAuth");
    }
});

/* =======================================================
================   API USUARIO + SERVERS   ==============
======================================================= */

app.get("/api/user", verifyToken, async (req, res) => {
    const discordToken = req.user.discordAccessToken;
    if (!discordToken) return res.status(403).json({ error: "No Discord token" });

    try {
        const user = await axios.get(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${discordToken}` }
        }).then(r => r.data);

        const userGuilds = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${discordToken}` }
        }).then(r => r.data);

        const adminPermission = 0x20;

        const mutualGuilds = userGuilds.filter(guild => {
            const botInGuild = client.guilds.cache.has(guild.id);
            const userHasAdmin = (BigInt(guild.permissions) & BigInt(adminPermission)) === BigInt(adminPermission);
            return botInGuild && userHasAdmin;
        });

        const enrichedGuilds = mutualGuilds.map(guild => {
            const botGuild = client.guilds.cache.get(guild.id);
            return {
                ...guild,
                // Añadir memberCount desde el bot
                approximate_member_count: botGuild ? botGuild.memberCount : guild.approximate_member_count,
                memberCount: botGuild ? botGuild.memberCount : null
            };
        });

        const enrichedUser = {
            ...user,
            discriminator: user.discriminator || '0'
        };

        res.json({ user, servers: mutualGuilds });
    } catch (err) {
        console.error("Error al obtener datos de Discord:", err.response?.data || err);
        res.status(500).json({ error: "Error al obtener datos de Discord" });
    }
});

app.get("/api/user-servers", verifyToken, async (req, res) => {
    const discordToken = req.user.discordAccessToken;
    if (!discordToken) return res.status(403).json({ error: "No Discord token" });

    try {
        const userGuilds = await axios.get(`${DISCORD_API}/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${discordToken}` }
        }).then(r => r.data);

        const adminPermission = 0x20;

        const mutualGuilds = userGuilds.filter(guild => {
            const userHasAdmin = (BigInt(guild.permissions) & BigInt(adminPermission)) === BigInt(adminPermission);
            return userHasAdmin;
        });

        res.json({ servers: mutualGuilds });
    } catch (err) {
        console.error("Error obteniendo servidores:", err.response?.data || err);
        res.status(500).json({ error: "Error al obtener servidores" });
    }
});

app.get("/api/:guildId/stats", verifyToken, async (req, res) => {
    const { guildId } = req.params;

    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: "Servidor no encontrado" });

        const guildInfo = {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            ownerId: guild.ownerId.toString(),
            memberCount: guild.memberCount,
            verificationLevel: guild.verificationLevel,
            afkTimeout: guild.afkTimeout,
            banner: guild.banner,
            features: guild.features
        };

        const channelsFetched = await guild.channels.fetch();
        const channels = channelsFetched
            .filter(ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
            .map(ch => ({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                parentId: ch.parentId,
                topic: ch.topic,
                nsfw: ch.nsfw,
                position: ch.position
            }));

        const roles = guild.roles.cache.map(role => ({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions.bitfield.toString(),
            hoist: role.hoist,
            managed: role.managed,
            mentionable: role.mentionable
        }));

        const members = guild.members.cache.map(member => ({
            id: member.id,
            bot: member.user.bot
        }));

        res.json({
            guild: guildInfo,
            channels,
            roles,
            members,
        });
    } catch (err) {
        console.error("Error obteniendo stats del servidor:", err);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});

app.get("/api/:guildId/growth", verifyToken, async (req, res) => {
    try {
        const data = await GuildGrowth.find({ guildId: req.params.guildId }).sort({ date: 1 });
        res.json(data);
    } catch (err) {
        console.error("Error obteniendo growthData:", err);
        res.status(500).json({ error: "Error al obtener datos de crecimiento" });
    }
});

/* =======================================================
================   MODERATION   =========================
======================================================= */

app.get("/api/:guildId/moderation", verifyToken, async (req, res) => {
    try {
        const config = await AutoMod.findOne({ guildId: req.params.guildId });
        
        const dashboardFormat = config ? {
            antiLinks: config.enlaces || false,
            enlacesChannels: config.enlacesChannels || [],
            enlacesTimeout: config.enlacesTimeout || 0,
            
            antiSpam: config.spam || false,
            spamChannels: config.spamChannels || [],
            spamTimeout: config.spamTimeout || 0,
            
            antiInvites: config.invitaciones || false,
            invitacionesChannels: config.invitacionesChannels || [],
            invitacionesTimeout: config.invitacionesTimeout || 0,
            
            antiMentions: config.menciones || false,
            mencionesChannels: config.mencionesChannels || [],
            mencionesTimeout: config.mencionesTimeout || 0,
            
            mayusculas: config.mayusculas || false,
            mayusculasChannels: config.mayusculasChannels || [],
            mayusculasTimeout: config.mayusculasTimeout || 0
        } : {};
        
        res.json(dashboardFormat);
    } catch (err) {
        console.error("❌ Error obteniendo moderación:", err);
        res.status(500).json({ error: "Error obteniendo configuración" });
    }
});

app.post("/api/:guildId/moderation", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        const data = req.body;
        
        const automodData = {
            guildId,
            enlaces: data.antiLinks || false,
            enlacesChannels: data.enlacesChannels || [],
            enlacesTimeout: data.enlacesTimeout || 0,
            
            spam: data.antiSpam || false,
            spamChannels: data.spamChannels || [],
            spamTimeout: data.spamTimeout || 0,
            
            invitaciones: data.antiInvites || false,
            invitacionesChannels: data.invitacionesChannels || [],
            invitacionesTimeout: data.invitacionesTimeout || 0,
            
            menciones: data.antiMentions || false,
            mencionesChannels: data.mencionesChannels || [],
            mencionesTimeout: data.mencionesTimeout || 0,
            
            mayusculas: data.mayusculas || false,
            mayusculasChannels: data.mayusculasChannels || [],
            mayusculasTimeout: data.mayusculasTimeout || 0
        };
        
        const config = await AutoMod.findOneAndUpdate(
            { guildId },
            automodData,
            { new: true, upsert: true }
        );
        
        console.log(`✅ Configuración de moderación guardada para ${guildId}`);
        
        const guild = client.guilds.cache.get(guildId);
        if (guild && data.logChannel) {
            const logChannel = guild.channels.cache.get(data.logChannel);
            if (logChannel) {
                await logChannel.send({
                    embeds: [{
                        color: 0x00ff00,
                        title: "⚙️ AutoMod Actualizado desde el Dashboard",
                        fields: [
                            { 
                                name: "🔗 Anti-Links", 
                                value: `${config.enlaces ? "✅ ON" : "❌ OFF"}${config.enlacesTimeout > 0 ? ` (Timeout: ${config.enlacesTimeout/60000}min)` : ''}`, 
                                inline: true 
                            },
                            { 
                                name: "📨 Anti-Spam", 
                                value: `${config.spam ? "✅ ON" : "❌ OFF"}${config.spamTimeout > 0 ? ` (Timeout: ${config.spamTimeout/60000}min)` : ''}`, 
                                inline: true 
                            },
                            { 
                                name: "📢 Anti-Invites", 
                                value: `${config.invitaciones ? "✅ ON" : "❌ OFF"}${config.invitacionesTimeout > 0 ? ` (Timeout: ${config.invitacionesTimeout/60000}min)` : ''}`, 
                                inline: true 
                            },
                            { 
                                name: "🔠 Mayúsculas", 
                                value: `${config.mayusculas ? "✅ ON" : "❌ OFF"}${config.mayusculasTimeout > 0 ? ` (Timeout: ${config.mayusculasTimeout/60000}min)` : ''}`, 
                                inline: true 
                            },
                        ],
                        timestamp: new Date()
                    }]
                });
            }
        }
        
        io.emit("update-moderation", { guildId, config });
        
        res.json({ ok: true, saved: config });
    } catch (err) {
        console.error("❌ Error guardando moderación:", err);
        res.status(500).json({ error: "Error guardando configuración" });
    }
});

/* =======================================================
================   REPORTS CONFIG   =====================
======================================================= */

app.get("/api/:guildId/reports", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        const config = await ReportConfig.findOne({ guildId });
        
        if (!config) {
            return res.json({
                channelId: "",
                cooldown: 5,
                dailyLimit: 10,
                enabled: false
            });
        }

        const response = {
            channelId: config.channelId || config.reportChannelId || "",
            cooldown: config.cooldown || 5,
            dailyLimit: config.dailyLimit || 10,
            enabled: config.enabled !== undefined ? config.enabled : true
        };
        
        res.json(response);
    } catch (err) {
        console.error("❌ Error obteniendo reports config:", err);
        res.status(500).json({ error: "Error obteniendo configuración" });
    }
});

app.post("/api/:guildId/reports", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { channelId, cooldown, dailyLimit, minRoleToReport, autoDeleteReport, enabled } = req.body;

        if (!channelId) {
            return res.status(400).json({ 
                error: "Debes seleccionar un canal",
                details: "channelId es requerido"
            });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ 
                error: "Servidor no encontrado",
                details: "El bot no está en este servidor o no está listo"
            });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            return res.status(400).json({ 
                error: "El canal seleccionado no existe",
                details: `Canal ${channelId} no encontrado`
            });
        }

        const updateData = {
            guildId,
            channelId,
            reportChannelId: channelId,
            cooldown: Math.min(20, Math.max(1, cooldown || 5)),
            dailyLimit: Math.min(20, Math.max(1, dailyLimit || 10)),
            minRoleToReport: minRoleToReport || "",
            autoDeleteReport: autoDeleteReport !== undefined ? autoDeleteReport : true,
            enabled: enabled !== undefined ? enabled : true
        };

        const config = await ReportConfig.findOneAndUpdate(
            { guildId },
            updateData,
            { new: true, upsert: true }
        );

        if (guild && config.channelId) {
            const notifyChannel = guild.channels.cache.get(config.channelId);
            if (notifyChannel) {
                try {
                    await notifyChannel.send({
                        embeds: [{
                            color: 0x43b581,
                            title: '⚙️ Sistema de Reportes Configurado',
                            description: 'El sistema de reportes ha sido configurado desde el dashboard.\n\n**Los reportes se enviarán automáticamente a este canal.**',
                            fields: [
                                { 
                                    name: 'Configurado por', 
                                    value: `<@${req.user.id}>`, 
                                    inline: true 
                                },
                                { 
                                    name: 'Canal', 
                                    value: `<#${config.channelId}>`, 
                                    inline: true 
                                },
                                { 
                                    name: 'Cooldown', 
                                    value: `${config.cooldown} minutos`, 
                                    inline: true 
                                },
                                { 
                                    name: 'Límite Diario', 
                                    value: `${config.dailyLimit} reportes`, 
                                    inline: true 
                                },
                                { 
                                    name: 'Auto-eliminar', 
                                    value: config.autoDeleteReport ? '✅ Sí' : '❌ No', 
                                    inline: true 
                                }
                            ],
                            footer: { text: 'Sistema configurado correctamente' },
                            timestamp: new Date()
                        }]
                    });
                } catch (err) {
                    console.error("❌ Error enviando embed:", err.message);
                }
            }
        }
        
        const response = {
            channelId: config.channelId,
            cooldown: config.cooldown,
            dailyLimit: config.dailyLimit,
            minRoleToReport: config.minRoleToReport,
            autoDeleteReport: config.autoDeleteReport,
            enabled: config.enabled
        };
        
        res.json({ 
            ok: true, 
            saved: response
        });
    } catch (err) {
        console.error("❌ Error guardando reports config:", err);
        res.status(500).json({ 
            error: "Error guardando configuración", 
            details: err.message
        });
    }
});

/* =======================================================
================   REPORTS DATA   =======================
======================================================= */

app.get("/api/:guildId/reports/stats", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        const [total, pending, resolved, dismissed] = await Promise.all([
            Report.countDocuments({ guildId }),
            Report.countDocuments({ guildId, status: 'pending' }),
            Report.countDocuments({ guildId, status: 'resolved' }),
            Report.countDocuments({ guildId, status: 'dismissed' })
        ]);
        
        res.json({ total, pending, resolved, dismissed });
    } catch (err) {
        console.error("❌ Error obteniendo stats:", err);
        res.status(500).json({ error: "Error obteniendo estadísticas" });
    }
});

app.get("/api/:guildId/reports/list", verifyToken, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        const { guildId } = req.params;
        
        const query = { guildId };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const reports = await Report.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));
        
        const mappedReports = reports.map(report => ({
            reportId: report.reportId,
            guildId: report.guildId,
            type: report.type,
            reporter: report.reportedBy,
            targetUser: report.targetUser,
            reason: report.reason,
            status: report.status,
            resolution: report.resolution,
            reviewedBy: report.reviewedBy,
            reviewedAt: report.reviewedAt,
            createdAt: report.timestamp
        }));
        
        res.json(mappedReports);
    } catch (err) {
        console.error("❌ Error obteniendo reportes:", err);
        res.status(500).json({ error: "Error obteniendo reportes" });
    }
});

app.patch("/api/:guildId/reports/:reportId", verifyToken, async (req, res) => {
    try {
        const { reportId, guildId } = req.params;
        const { status, resolution } = req.body;
        
        const report = await Report.findOneAndUpdate(
            { reportId },
            {
                status,
                resolution,
                reviewedBy: req.user.id,
                reviewedAt: new Date()
            },
            { new: true }
        );
        
        if (!report) {
            return res.status(404).json({ error: "Reporte no encontrado" });
        }

        const guild = client.guilds.cache.get(guildId);
        
        if (guild) {
            const reportConfig = await ReportConfig.findOne({ guildId });
            
            if (reportConfig && reportConfig.channelId) {
                const channel = guild.channels.cache.get(reportConfig.channelId);
                
                if (channel) {
                    const reporter = await guild.members.fetch(report.reportedBy).catch(() => null);
                    const target = await guild.members.fetch(report.targetUser).catch(() => null);

                    const targetHistory = await Report.countDocuments({
                        guildId,
                        targetUser: report.targetUser,
                        status: { $in: ['resolved', 'reviewing'] }
                    });

                    const priorityColors = {
                        low: 0x95a5a6,
                        medium: 0xf39c12,
                        high: 0xe74c3c,
                        critical: 0x992d22
                    };

                    const statusEmojis = {
                        pending: '🟡',
                        reviewing: '🔵',
                        resolved: '✅',
                        dismissed: '❌'
                    };

                    const typeDisplays = {
                        spam: 'Spam',
                        harassment: 'Acoso',
                        nsfw: 'Contenido NSFW',
                        scam: 'Estafa/Phishing',
                        hate_speech: 'Discurso de Odio',
                        threats: 'Amenazas',
                        rule_violation: 'Violación de Reglas',
                        other: 'Otro'
                    };

                    const priorityEmojis = {
                        low: '🟢',
                        medium: '🟡',
                        high: '🔴',
                        critical: '🚨'
                    };

                    const embed = {
                        color: priorityColors[report.priority] || 0xf39c12,
                        title: `${statusEmojis[status]} Reporte Actualizado`,
                        description: `**ID:** \`${reportId}\`\n**Tipo:** ${typeDisplays[report.type] || 'Otro'}`,
                        fields: [
                            {
                                name: 'Reportado Por',
                                value: reporter 
                                    ? `${reporter.user.tag}\n\`${reporter.id}\`\n✓ Verificado` 
                                    : 'Usuario Desconocido',
                                inline: true
                            },
                            {
                                name: 'Usuario Reportado',
                                value: target 
                                    ? `${target.user.tag}\n\`${target.id}\`\n${targetHistory > 0 ? `⚠️ ${targetHistory} reporte(s) previo(s)` : 'Sin historial'}` 
                                    : 'Usuario Desconocido',
                                inline: true
                            },
                            {
                                name: 'Canal',
                                value: `<#${report.channelId}>`,
                                inline: true
                            },
                            {
                                name: 'Nuevo Estado',
                                value: status.charAt(0).toUpperCase() + status.slice(1),
                                inline: true
                            },
                            {
                                name: 'Revisado Por',
                                value: `<@${req.user.id}>`,
                                inline: true
                            },
                            {
                                name: 'Prioridad',
                                value: `${priorityEmojis[report.priority]} ${report.priority.charAt(0).toUpperCase() + report.priority.slice(1)}`,
                                inline: true
                            }
                        ],
                        timestamp: new Date()
                    };

                    if (report.reason) {
                        embed.fields.push({
                            name: 'Razón del Reporte',
                            value: report.reason.substring(0, 1024),
                            inline: false
                        });
                    }

                    if (resolution) {
                        embed.fields.push({
                            name: 'Resolución',
                            value: resolution,
                            inline: false
                        });
                    }

                    if (report.similarReports > 0) {
                        embed.fields.push({
                            name: 'Alertas',
                            value: `⚠️ **${report.similarReports}** reportes similares`,
                            inline: false
                        });
                    }

                    await channel.send({ embeds: [embed] })
                        .catch(err => console.error("❌ Error enviando embed:", err));
                }
            }
        }
        
        res.json({ ok: true, report });
    } catch (err) {
        console.error("❌ Error actualizando reporte:", err);
        res.status(500).json({ error: "Error actualizando reporte", details: err.message });
    }
});

app.delete("/api/:guildId/reports/:reportId", verifyToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        
        const report = await Report.findOneAndDelete({ reportId });
        
        if (!report) {
            return res.status(404).json({ error: "Reporte no encontrado" });
        }
        
        console.log(`🗑️ Reporte ${reportId} eliminado`);
        res.json({ ok: true, message: "Reporte eliminado" });
    } catch (err) {
        console.error("❌ Error eliminando reporte:", err);
        res.status(500).json({ error: "Error eliminando reporte" });
    }
});

/* =======================================================
================   START SERVER   ======================
======================================================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Backend listo en puerto ${PORT}`));