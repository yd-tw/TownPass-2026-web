const http = require("node:http");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3001;
// 逗號分隔的允許來源，例如 "https://example.com,http://localhost:3000"；未設定則允許全部
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : "*";

const httpServer = http.createServer((req, res) => {
  // 健康檢查（Dokploy / Docker healthcheck 用）
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", connections: io.engine.clientsCount }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("join", (room) => {
    socket.join(room);
    socket.to(room).emit("user-joined", { id: socket.id, room });
  });

  socket.on("leave", (room) => {
    socket.leave(room);
    socket.to(room).emit("user-left", { id: socket.id, room });
  });

  // 廣播訊息：帶 room 則只送到該房間，否則送給其他所有人
  socket.on("message", (payload) => {
    const msg = { id: socket.id, ...payload, at: Date.now() };
    if (payload && payload.room) {
      socket.to(payload.room).emit("message", msg);
    } else {
      socket.broadcast.emit("message", msg);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket.IO server listening on :${PORT}`);
});

function shutdown() {
  console.log("Shutting down...");
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
