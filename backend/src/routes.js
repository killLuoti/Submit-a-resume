// src/routes.js
const express = require('express');
const db = require('./db');

const router = express.Router();

// 统一的 async 路由包装：捕获 db 层（写队列返回的是 Promise）的异常或拒绝，
// 避免未处理的 Promise 拒绝导致进程崩溃或请求悬挂，同时给出统一的 JSON 错误格式。
// ===== 修复说明 =====
// 之前这里的写操作路由（POST /applications、DELETE /applications/:id、PUT /config）
// 直接同步解构/使用 db.addApplication()/db.deleteApplication()/db.writeConfig() 的返回值，
// 但这几个函数内部都通过 serialize() 走的是串行写队列，实际返回的是 Promise 而不是结果本身。
// 例如 `const ok = db.deleteApplication(id); if (!ok) ...` 里 ok 永远是一个 truthy 的 Promise 对象，
// 404 分支永远不会触发；PUT /config 用 res.json(Promise对象) 序列化出来恒为 {}。
// 写入磁盘的操作本身没问题（这就是这个问题一直没被发现的原因），但接口返回值一直是错的。
// 这里统一改成 async/await 正确处理。
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ---- 投递记录 ----
router.get('/applications', asyncHandler(async (req, res) => {
    const { platform, minScore, q, limit, offset } = req.query;
    const result = db.queryApplications({ platform, minScore, q, limit, offset });
    res.json(result);
}));

// 服务端直出 CSV，方便命令行 curl 下载，或不想跑前端 JS 时也能拿到导出文件。
// 注意：路由要放在 '/applications/:id' 之前，否则 'export.csv' 会被误当成 :id 参数匹配掉。
router.get('/applications/export.csv', asyncHandler(async (req, res) => {
    const { platform, minScore, q } = req.query;
    const { items } = db.queryApplications({ platform, minScore, q, limit: 100000, offset: 0 });
    const csv = db.toCsv(items);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="投递记录_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
}));

router.post('/applications', asyncHandler(async (req, res) => {
    const { name, company, score, matched, platform, salary, city, time } = req.body || {};
    if (!name) return res.status(400).json({ error: '缺少岗位名称 name' });
    const { created, record } = await db.addApplication({ name, company, score, matched, platform, salary, city, time });
    res.status(created ? 201 : 200).json({ created, record });
}));

router.patch('/applications/:id', asyncHandler(async (req, res) => {
    const updated = await db.updateApplication(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: '未找到该记录' });
    res.json({ updated: true, record: updated });
}));

router.delete('/applications/:id', asyncHandler(async (req, res) => {
    const ok = await db.deleteApplication(req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到该记录' });
    res.json({ deleted: true });
}));

// ---- 统计 ----
router.get('/stats/overview', asyncHandler(async (req, res) => {
    res.json(db.getOverviewStats());
}));

router.get('/stats/daily', asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 14;
    res.json(db.getDailyTrend(days));
}));

router.get('/stats/skills', asyncHandler(async (req, res) => {
    const topN = Number(req.query.top) || 10;
    res.json(db.getSkillFrequency(topN));
}));

// ---- 配置（黑名单/关键词/薪资等，可与脚本设置面板双向同步）----
router.get('/config', asyncHandler(async (req, res) => {
    res.json(db.readConfig());
}));

router.put('/config', asyncHandler(async (req, res) => {
    const { config, rejected } = await db.writeConfig(req.body || {});
    // rejected 列出了因类型不对被丢弃、未生效的字段，方便调用方（脚本/前端）发现自己传错了参数
    res.json({ config, rejected });
}));

// ---- /api 下未匹配到的路径，返回统一 JSON 404 而不是 Express 默认的 HTML 页面 ----
router.use((req, res) => {
    res.status(404).json({ error: `未知的接口: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
