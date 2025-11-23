import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
import { Client, GatewayIntentBits } from "discord.js";

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
            "https://spritle-backend-1-z6rk.onrender.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: [
        "https://spritlebot.netlify.app",
        "http://localhost:5173",
        "https://spritle-backend-1-z6rk.onrender.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
app.options(cors());
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let botGuildsCache = [];

client.on("ready", () => {
    console.log(`🤖 Bot listo como ${client.user.tag}`);
    botGuildsCache = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
    }));
});

client.login(BOT_TOKEN);

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

        res.redirect(`https://spritlebot.netlify.app/login?token=${jwtToken}`);
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
            const userHasAdmin =(BigInt(guild.permissions) & BigInt(adminPermission)) === BigInt(adminPermission);
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

/* =======================================================
================   CONFIGURACIONES   ===================
======================================================= */

app.post("/api/:guildId/welcome", verifyToken, (req, res) => {
    io.emit("update-welcome", { guildId: req.params.guildId, config: req.body });
    res.json({ success: true });
});

app.post("/api/:guildId/moderation", verifyToken, (req, res) => {
    io.emit("update-moderation", { guildId: req.params.guildId, config: req.body });
    res.json({ success: true });
});

/* =======================================================
================   START SERVER   ======================
======================================================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Backend listo en puerto ${PORT}`));
