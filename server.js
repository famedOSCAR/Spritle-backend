import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "https://spritlebot.netlify.app",
            "http://localhost:5173"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors());
app.use(express.json());

// ============================================
// =============== BOT STATS ==================
// ============================================

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
    console.log("🟢 Usuario conectado al WebSocket");
    socket.emit("bot-stats", botStats);
});

// ============================================
// =========== MIDDLEWARE TOKEN ===============
// ============================================

function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token provided" });

    const token = header.split(" ")[1];

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(403).json({ error: "Invalid token" });
    }
}

// ============================================
// ============ DISCORD AUTH ==================
// ============================================

// LOGIN
app.get("/auth/discord", (req, res) => {
    const redirect = encodeURIComponent(process.env.REDIRECT_URI);

    res.redirect(
        `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${redirect}&response_type=code&scope=identify%20guilds`
    );
});

// CALLBACK
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;

    try {
        const data = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.REDIRECT_URI,
        });

        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            data,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        const user = userRes.data;

        const jwtToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.redirect(`https://spritlebot.netlify.app/login?token=${jwtToken}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error en OAuth");
    }
});

// ============================================
// ============ DASHBOARD API =================
// ============================================

// Lista los servidores donde está el bot
app.get("/api/guilds", verifyToken, async (req, res) => {
    // 🔥 Luego aquí conectas tu bot real
    res.json([
        { id: "123", name: "Servidor de Prueba", icon: null },
        { id: "456", name: "Otro servidor", icon: null }
    ]);
});

// Configuración de bienvenida
app.post("/api/:guildId/welcome", verifyToken, (req, res) => {
    const guildId = req.params.guildId;
    const config = req.body;

    io.emit("update-welcome", { guildId, config });

    res.json({ success: true });
});

// Otros módulos...
app.post("/api/:guildId/moderation", verifyToken, (req, res) => {
    io.emit("update-moderation", {
        guildId: req.params.guildId,
        config: req.body
    });

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
    console.log(`🚀 Backend escuchando en puerto ${PORT}`)
);
