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

// Endpoint para obtener estadísticas del bot
app.get("/api/stats", (req, res) => {
    res.json(botStats);
});

// Endpoint para actualizar estadísticas del bot
app.post("/update-stats", (req, res) => {
    botStats = req.body;
    io.emit("bot-stats", botStats);
    res.sendStatus(200);
});

// Websocket
io.on("connection", (socket) => {
    console.log("Usuario conectado a websockets");
    socket.emit("bot-stats", botStats);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Backend escuchando en puerto ${PORT}`));