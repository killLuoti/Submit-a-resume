// src/ws.js
// WebSocket 实时推送模块 —— 当投递记录或配置发生变更时，广播事件给所有连接的客户端。
// 使用原生 ws 库，无需 socket.io 等重依赖。

const { WebSocketServer } = require('ws');
const url = require('url');

let wss = null;
const clients = new Set();

function init(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        console.log(`🔌 WebSocket 客户端已连接: ${ip} (当前 ${clients.size + 1} 个)`);

        clients.add(ws);

        // 发送欢迎消息，包含当前连接数和服务器时间
        ws.send(JSON.stringify({
            type: 'connected',
            data: { clients: clients.size, time: new Date().toISOString() },
        }));

        ws.on('close', () => {
            clients.delete(ws);
            console.log(`🔌 WebSocket 客户端已断开: ${ip} (剩余 ${clients.size} 个)`);
        });

        ws.on('error', (err) => {
            console.warn(`⚠ WebSocket 客户端错误: ${err.message}`);
            clients.delete(ws);
        });

        // 客户端心跳 ping/pong
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
    });

    // 心跳检测：每 30 秒检查一次，清除已断开的客户端
    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) { clients.delete(ws); return ws.terminate(); }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    console.log(`✅ WebSocket 服务已就绪 (等待客户端连接)`);
}

// 广播事件给所有已连接的客户端
function broadcast(type, data) {
    if (!clients.size) return;
    const msg = JSON.stringify({ type, data, time: new Date().toISOString() });
    let sent = 0;
    clients.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
            try { ws.send(msg); sent++; } catch (e) { /* 忽略发送失败 */ }
        }
    });
    if (sent > 0) console.log(`📡 广播 ${type} → ${sent} 个客户端`);
}

function getClientCount() {
    return clients.size;
}

module.exports = { init, broadcast, getClientCount };
