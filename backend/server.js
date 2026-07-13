// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const apiRoutes = require('./src/routes');
const ws = require('./src/ws');

const app = express();
const PORT = process.env.PORT || 8787;

// 允许来自任意来源的请求 —— 因为调用方是 Tampermonkey 脚本(GM_xmlhttpRequest)，
// 而不是普通网页 fetch，浏览器 CORS 限制对 GM_xmlhttpRequest 本身不生效，
// 这里放开主要是方便你也能用普通网页/工具直接调试接口。
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 将 WebSocket broadcast 函数挂载到 app 上，供路由使用
app.set('wsBroadcast', ws.broadcast);

app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({
    ok: true,
    time: new Date().toISOString(),
    wsClients: ws.getClientCount(),
}));

// ---- 统一错误处理 ----
// 之前没有这一层：路由里任何同步抛出的异常或 asyncHandler 捕获到的 Promise 拒绝，
// 都会导致 Express 返回默认的 HTML 错误页面（而不是 JSON），前端 fetch().json() 解析会直接报错，
// 且看不出具体是哪里出的问题。现在统一转成结构化 JSON，并在终端打印详细堆栈方便排查。
// 注意：express.json() 请求体解析失败（比如脚本传了格式错误的 JSON）抛出的 SyntaxError 也会走到这里。
app.use((err, req, res, next) => {
    console.error(`❌ [${req.method} ${req.originalUrl}] 请求处理出错:`, err);
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: '请求体不是合法的 JSON' });
    }
    res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

// 创建 HTTP 服务器并挂载 WebSocket
const server = http.createServer(app);
ws.init(server);

server.listen(PORT, () => {
    console.log(`✅ 岗位投递管理后台已启动: http://localhost:${PORT}`);
    console.log(`📊 打开浏览器访问上面的地址查看统计面板`);
    console.log(`🔌 WebSocket 实时推送已启用: ws://localhost:${PORT}`);
});
