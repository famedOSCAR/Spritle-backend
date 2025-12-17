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
import multer from "multer";
import path from "path";
import WelcomeConfig from "./models/WelcomeConfig.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import twemoji from "twemoji";
import AutoMod from "./models/automod.js";
import Report from "./models/Report.js";
import ReportConfig from "./models/ReportsConfig.js";


mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error conectando MongoDB:", err));

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${file.fieldname}${ext}`);
    }
});

const upload = multer({ storage });

const DISCORD_API = "https://discord.com/api";
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) throw new Error("No BOT_TOKEN in environment variables!");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "https://spritlebot.netlify.app",
            "http://localhost:5173",
            "https://spritle-backend-iqn3.onrender.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: [
        "https://spritlebot.netlify.app",
        "http://localhost:5173",
        "https://spritle-backend-iqn3.onrender.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));

app.use(express.json());
app.use("/uploads", express.static("uploads"));
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
//welcomes generador
function isColor(str) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(str) ||
        /^rgb/i.test(str) ||
        /^[a-zA-Z]+$/.test(str);
}
// ======================
// PARSE VARIABLES
// ======================
function parsePlaceholders(str, user, guild) {
    return str
        .replace(/{user}/g, user.globalName || user.username) // nombre correcto
        .replace(/{server}/g, guild.name)
        .replace(/{member}/g, "@" + (user.globalName || user.username))// tag recreado
        .replace(/{mention}/g, `<@${user.id}>`);
}

// Convierte emojis a imágenes usando Twemoji
async function drawTextWithEmojis(ctx, text, x, y, fontSize) {
    const parsed = twemoji.parse(text, {
        folder: "72x72",
        ext: ".png"
    });

    const parts = parsed.split(/(<img[^>]+>)/g);
    let offsetX = 0;

    for (const p of parts) {
        if (p.startsWith("<img")) {
            const src = p.match(/src="([^"]+)"/)[1];
            const emoji = await loadImage(src);
            const size = fontSize * 1.15;
            ctx.drawImage(emoji, x + offsetX, y - size * 0.75, size, size);
            offsetX += size * 0.9;
        } else {
            ctx.fillText(p, x + offsetX, y);
            offsetX += ctx.measureText(p).width;
        }
    }
}

// ======================
// MULTILÍNEA / AUTO AJUSTE
// ======================
function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    let lines = [];
    let line = "";

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const width = ctx.measureText(testLine).width;

        if (width > maxWidth) {
            lines.push(line.trim());
            line = words[i] + " ";
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    return lines;
}

async function generateWelcomeImage({ bgColor, image, textColor, fontSize, message }) {
    const width = 1000;
    const height = 700;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Fondo sólido
    if (bgColor && isColor(bgColor)) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    // Imagen de fondo
    if (image) {
        try {
            const img = await loadImage("." + image);
            ctx.drawImage(img, 0, 0, width, height);
        } catch (err) {
            console.error("Error cargando imagen:", err);
        }
    }

    // TEXTO
    let realFontSize = Number(fontSize);
    if (isNaN(realFontSize) || realFontSize < 70) realFontSize = 70;

    ctx.fillStyle = textColor || "#ffffff";
    ctx.font = `${realFontSize}px Sans`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = wrapText(ctx, message, width - 200);

    const lineHeight = realFontSize + 10;
    const top = height / 2 - (lines.length * lineHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
        await drawTextWithEmojis(
            ctx,
            lines[i],
            width / 2,
            top + i * lineHeight,
            realFontSize
        );
    }

    const finalName = `/uploads/welcome_${Date.now()}.png`;
    fs.writeFileSync("." + finalName, canvas.toBuffer("image/png"));
    return finalName;
}

app.post("/api/:guildId/welcome", verifyToken, upload.single("image"), async (req, res) => {
    try {
        const { guildId } = req.params;

        const {
            enabled,
            channel,
            message,
            textColor,
            bgColor,
            fontSize,
            textPos
        } = req.body;

        const image = req.file ? `/uploads/${req.file.filename}` : null;

        const update = {
            enabled: enabled === 'true' || enabled === true,
            channel,
            message,
            textColor,
            bgColor,
            fontSize,
            textPos
        };

        if (image) update.image = image;

        const config = await WelcomeConfig.findOneAndUpdate(
            { guildId },
            update,
            { new: true, upsert: true }
        );

        res.json({ ok: true, saved: config });

    } catch (err) {
        console.error("❌ Error guardando welcome config:", err);
        res.status(500).json({ error: "Error guardando configuración" });
    }
});


/* =======================================================
================   BOT STATS (SOCKET.IO)   ==============
======================================================= */

let botStats = { ping: 0, guilds: 0, members: 0, uptime: 0 };

app.get("/api/stats", (req, res) => {
    res.json(botStats);
});

app.post("/update-stats", (req, res) => {
    botStats = req.body;
    io.emit("bot-stats", botStats);
    res.sendStatus(200);
});

io.on("connection", (socket) => {
    console.log("🟢 WebSocket conectado");
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
let botGuildsCache = [];

client.on("ready", () => {
    console.log(`Bot listo: ${client.user.tag}`);

    // Cron diario dentro de ready
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

        // Guardar crecimiento...
        const exists = await GuildGrowth.findOne({ guildId, date: today });
        if (exists) {
            exists.memberCount = memberCount;
            await exists.save();
        } else {
            await GuildGrowth.create({ guildId, date: today, memberCount });
        }

        console.log(`Miembro añadido a ${member.guild.name}, total: ${memberCount}`);

        // BIENVENIDA PERSONALIZADA
        const config = await WelcomeConfig.findOne({ guildId });
        
        // ⭐ AGREGAR ESTA VERIFICACIÓN:
        if (!config || !config.enabled) {
            console.log("Bienvenidas desactivadas o no configuradas");
            return;
        }

        const channel = member.guild.channels.cache.get(config.channel);
        if (!channel) return console.log("❌ Canal no encontrado para bienvenida");

        const finalMessage = parsePlaceholders(config.message, member.user, member.guild);

        const finalImage = await generateWelcomeImage({
            bgColor: config.bgColor,
            image: config.image,
            textColor: config.textColor,
            fontSize: config.fontSize,
            textPos: config.textPos,
            message: finalMessage
        });

        await channel.send({
            files: ["." + finalImage]
        });

        console.log(`🎉 Bienvenida enviada a ${member.user.username}`);

    } catch (err) {
        console.error("❌ Error en guildMemberAdd:", err);
    }
});

client.login(BOT_TOKEN);


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

        res.redirect(`http://spritlebot.netlify.app/login?token=${jwtToken}`); //CAMBIARHOST
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

        const adminPermission = 0x20; // MANAGE_GUILD

        const mutualGuilds = userGuilds.filter(guild => {
            const botInGuild = client.guilds.cache.has(guild.id);
            const userHasAdmin = (BigInt(guild.permissions) & BigInt(adminPermission)) === BigInt(adminPermission);
            return botInGuild && userHasAdmin;
        });
        console.log("Bot ready:", client.isReady());
        console.log("Guilds en cache:", client.guilds.cache.size);

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

        const adminPermission = 0x20; // MANAGE_GUILD

        const mutualGuilds = userGuilds.filter(guild => {
            const userHasAdmin = (BigInt(guild.permissions) & BigInt(adminPermission)) === BigInt(adminPermission);
            return userHasAdmin;
        });
        console.log("Bot ready:", client.isReady());
        console.log("Bot guilds cache:", client.guilds.cache.map(g => g.id));
        console.log("User guilds:", userGuilds.map(g => g.id));

        res.json({ servers: mutualGuilds });
    } catch (err) {
        console.error("Error obteniendo servidores:", err.response?.data || err);
        res.status(500).json({ error: "Error al obtener servidores" });
    }
});
// Obtener estadísticas completas de un servidor
app.get("/api/:guildId/stats", verifyToken, async (req, res) => {
    const { guildId } = req.params;

    try {
        // Verificar que el bot esté en ese servidor
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: "Servidor no encontrado" });

        // Información básica del servidor
        const guildInfo = {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            ownerId: guild.ownerId.toString(), // <-- convertir a string
            memberCount: guild.memberCount,
            verificationLevel: guild.verificationLevel,
            afkTimeout: guild.afkTimeout,
            banner: guild.banner,
            features: guild.features
        };

        // Canales
        // Traer todos los canales del servidor directamente desde Discord
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


        // Roles
        const roles = guild.roles.cache.map(role => ({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions.bitfield.toString(), // <-- convertir a string
            hoist: role.hoist,
            managed: role.managed,
            mentionable: role.mentionable
        }));
        // Miembros (solo info básica, para no saturar)
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
================   GET WELCOME CONFIG   =================
======================================================= */
app.get("/api/:guildId/welcome", verifyToken, async (req, res) => {
    try {
        const config = await WelcomeConfig.findOne({ guildId: req.params.guildId });
        res.json(config || {});
    } catch (err) {
        console.error("Error obteniendo config:", err);
        res.status(500).json({ error: "Error obteniendo configuración" });
    }
});

/* =======================================================
================   MODERATION CONFIG   ==================
======================================================= */

// Obtener configuración de moderación
app.get("/api/:guildId/moderation", verifyToken, async (req, res) => {
    try {
        const config = await AutoMod.findOne({ guildId: req.params.guildId });
        
        // Convertir de tu estructura a la del dashboard
        const dashboardFormat = config ? {
            antiLinks: config.enlaces || false,
            enlacesChannels: config.enlacesChannels || [],
            antiSpam: config.spam || false,
            spamChannels: config.spamChannels || [],
            antiInvites: config.invitaciones || false,
            invitacionesChannels: config.invitacionesChannels || [],
            maxMentions: 3,
            mencionesChannels: config.mencionesChannels || [],
            mayusculas: config.mayusculas || false,
            mayusculasChannels: config.mayusculasChannels || [],
            logChannel: ""
        } : {};
        
        res.json(dashboardFormat);
    } catch (err) {
        console.error("❌ Error obteniendo moderación:", err);
        res.status(500).json({ error: "Error obteniendo configuración" });
    }
});

// Guardar configuración de moderación
app.post("/api/:guildId/moderation", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        const data = req.body;
        
        // Convertir del dashboard a tu estructura
        const automodData = {
            guildId,
            enlaces: data.antiLinks || false,
            enlacesChannels: data.enlacesChannels || [],
            spam: data.antiSpam || false,
            spamChannels: data.spamChannels || [],
            invitaciones: data.antiInvites || false,
            invitacionesChannels: data.invitacionesChannels || [],
            menciones: data.maxMentions > 0 || false,
            mencionesChannels: data.mencionesChannels || [],
            mayusculas: data.mayusculas || false,
            mayusculasChannels: data.mayusculasChannels || []
        };
        
        const config = await AutoMod.findOneAndUpdate(
            { guildId },
            automodData,
            { new: true, upsert: true }
        );
        
        console.log(`✅ Configuración de moderación guardada para ${guildId}`);
        
        // Notificar en Discord (opcional)
        const guild = client.guilds.cache.get(guildId);
        if (guild && data.logChannel) {
            const logChannel = guild.channels.cache.get(data.logChannel);
            if (logChannel) {
                await logChannel.send({
                    embeds: [{
                        color: 0x00ff00,
                        title: "⚙️ AutoMod Actualizado desde el Dashboard",
                        fields: [
                            { name: "🔗 Anti-Links", value: config.enlaces ? "✅ ON" : "❌ OFF", inline: true },
                            { name: "📨 Anti-Spam", value: config.spam ? "✅ ON" : "❌ OFF", inline: true },
                            { name: "📢 Anti-Invites", value: config.invitaciones ? "✅ ON" : "❌ OFF", inline: true },
                            { name: "🔠 Mayúsculas", value: config.mayusculas ? "✅ ON" : "❌ OFF", inline: true },
                        ],
                        timestamp: new Date()
                    }]
                });
            }
        }
        
        // Emitir por socket
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

// Obtener configuración de reports
app.get("/api/:guildId/reports", verifyToken, async (req, res) => {
    try {
        const config = await ReportConfig.findOne({ guildId: req.params.guildId });
        res.json(config || {});
    } catch (err) {
        console.error("❌ Error obteniendo reports config:", err);
        res.status(500).json({ error: "Error obteniendo configuración" });
    }
});

// Guardar configuración de reports
// Guardar configuración de reports
app.post("/api/:guildId/reports", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        const config = await ReportConfig.findOneAndUpdate(
            { guildId },
            { ...req.body, guildId },
            { new: true, upsert: true }
        );
        
        console.log(`✅ Configuración de reports guardada para ${guildId}`);
        
        // Notificar en Discord
        const guild = client.guilds.cache.get(guildId);
        if (guild && config.channelId) {
            const channel = guild.channels.cache.get(config.channelId);
            if (channel) {
                await channel.send({
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
                                value: `${config.cooldown || 5} minutos`, 
                                inline: true 
                            },
                            { 
                                name: 'Límite Diario', 
                                value: `${config.dailyLimit || 10} reportes`, 
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
                }).catch(err => console.error("❌ Error enviando embed:", err));
            }
        }
        
        res.json({ ok: true, saved: config });
    } catch (err) {
        console.error("❌ Error guardando reports config:", err);
        res.status(500).json({ error: "Error guardando configuración", details: err.message });
    }
});

/* =======================================================
================   REPORTS DATA   =======================
======================================================= */

// Obtener estadísticas
app.get("/api/:guildId/reports/stats", verifyToken, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        console.log(`📊 Obteniendo stats para guild: ${guildId}`);
        
        const [total, pending, resolved, dismissed] = await Promise.all([
            Report.countDocuments({ guildId }),
            Report.countDocuments({ guildId, status: 'pending' }),
            Report.countDocuments({ guildId, status: 'resolved' }),
            Report.countDocuments({ guildId, status: 'dismissed' })
        ]);
        
        console.log(`Stats: total=${total}, pending=${pending}, resolved=${resolved}, dismissed=${dismissed}`);
        
        res.json({ total, pending, resolved, dismissed });
    } catch (err) {
        console.error("❌ Error obteniendo stats:", err);
        res.status(500).json({ error: "Error obteniendo estadísticas" });
    }
});

// Obtener lista de reportes
app.get("/api/:guildId/reports/list", verifyToken, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        const { guildId } = req.params;
        
        console.log(`📋 Buscando reportes para guild: ${guildId}, status: ${status}`);
        
        const query = { guildId };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const reports = await Report.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));
        
        console.log(`📊 Reportes encontrados: ${reports.length}`);
        
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

// Actualizar estado de reporte
app.patch("/api/:guildId/reports/:reportId", verifyToken, async (req, res) => {
    try {
        const { reportId, guildId } = req.params;
        const { status, resolution } = req.body;
        
        console.log(`📝 Actualizando reporte ${reportId} a estado: ${status}`);
        
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
            console.error(`❌ Reporte ${reportId} no encontrado`);
            return res.status(404).json({ error: "Reporte no encontrado" });
        }

        console.log(`✅ Reporte actualizado: ${reportId}`);

        // Enviar notificación a Discord
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
                        .then(() => console.log(`✅ Embed enviado al canal ${reportConfig.channelId}`))
                        .catch(err => console.error("❌ Error enviando embed:", err));
                } else {
                    console.warn(`⚠️ Canal ${reportConfig.channelId} no encontrado`);
                }
            } else {
                console.warn(`⚠️ No hay configuración de reportes para ${guildId}`);
            }
        }
        
        res.json({ ok: true, report });
    } catch (err) {
        console.error("❌ Error actualizando reporte:", err);
        res.status(500).json({ error: "Error actualizando reporte", details: err.message });
    }
});

// Eliminar reporte
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