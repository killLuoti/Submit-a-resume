// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 8787;

// 允许来自任意来源的请求 —— 因为调用方是 Tampermonkey 脚本(GM_xmlhttpRequest)，
// 而不是普通网页 fetch，浏览器 CORS 限制对 GM_xmlhttpRequest 本身不生效，
// 这里放开主要是方便你也能用普通网页/工具直接调试接口。
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
    console.log(`✅ 岗位投递管理后台已启动: http://localhost:${PORT}`);
    console.log(`📊 打开浏览器访问上面的地址查看统计面板`);
});
