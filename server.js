import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "spritlebot.netlify.app",
    }
});

app.use(cors());
app.use(express.json());

let botStats = { ping: 0, guilds: 0, members: 0, uptime: 0 };

// Guardar top comandos en tiempo real
let commandUsage = {}; // { "/rank": 5, "/ban": 2, ... }

app.get("/api/stats", (req, res) => {
    res.json(botStats);
});

// Endpoint para recibir datos del bot
app.post("/update-stats", (req, res) => {
    botStats = req.body;
    io.emit("bot-stats", botStats);
    res.sendStatus(200);
});

// **Nuevo endpoint para incrementar comandos**
app.post("/increment-command", (req, res) => {
    const { command } = req.body;
    if (!command) return res.sendStatus(400);

    // Sumar uno al comando
    commandUsage[command] = (commandUsage[command] || 0) + 1;

    // 🔹 Log para verificar que llega al backend
    console.log("Top comandos actualizados:", commandUsage);

    // Emitir a todos los clientes conectados vía WebSocket
    io.emit("top-commands", commandUsage);

    res.sendStatus(200);
});

// Endpoint para obtener top comandos
app.get("/top-commands", (req, res) => {
    res.json(commandUsage);
});

// Websocket
io.on("connection", (socket) => {
    console.log("Usuario conectado a websockets");
    socket.emit("bot-stats", botStats);
    socket.emit("top-commands", commandUsage); // enviar top comandos al conectar
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Backend escuchando en puerto ${PORT}`));
