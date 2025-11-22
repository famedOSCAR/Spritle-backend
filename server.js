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

/* =======================================================
   ===============   BOT STATS (SOCKET.IO)   ==============
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
   ===============   MIDDLEWARE JWT   =====================
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
   ===============   DISCORD LOGIN   ======================
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
   ===============   CALLBACK DISCORD   ===================
   ======================================================= */

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

        // Obtener usuario
        const userRes = await axios.get("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        const user = userRes.data;

        // 👉 Guardamos el access_token dentro del JWT
        const jwtToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                access_token: access_token
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.redirect(`https://spritlebot.netlify.app/login?token=${jwtToken}`);

    } catch (err) {
        console.error("OAuth error:", err?.response?.data);
        res.status(500).send("Error en OAuth");
    }
});

/* =======================================================
   ===============   API USUARIO + SERVERS   ==============
   ======================================================= */

app.get("/api/user", verifyToken, async (req, res) => {
    try {
        const { access_token } = req.user;

        const user = await axios.get(
            "https://discord.com/api/users/@me",
            { headers: { Authorization: `Bearer ${access_token}` } }
        ).then(r => r.data);

        const servers = await axios.get(
            "https://discord.com/api/users/@me/guilds",
            { headers: { Authorization: `Bearer ${access_token}` } }
        ).then(r => r.data);

        res.json({ user, servers });

    } catch (err) {
        console.error("❌ Error en /api/user:", err?.response?.data);
        res.status(500).json({ error: "Error al obtener usuario" });
    }
});

/* =======================================================
   ===============   CONFIGURACIONES   ====================
   ======================================================= */

app.post("/api/:guildId/welcome", verifyToken, (req, res) => {
    io.emit("update-welcome", {
        guildId: req.params.guildId,
        config: req.body
    });

    res.json({ success: true });
});

app.post("/api/:guildId/moderation", verifyToken, (req, res) => {
    io.emit("update-moderation", {
        guildId: req.params.guildId,
        config: req.body
    });

    res.json({ success: true });
});

/* =======================================================
   ===============   START SERVER   =======================
   ======================================================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
    console.log(`🚀 Backend listo en puerto ${PORT}`)
);
