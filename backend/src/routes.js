// src/routes.js
const express = require('express');
const db = require('./db');

const router = express.Router();

// 获取 WebSocket 广播函数（由 server.js 挂载到 app 上）
function getBroadcast(req) {
    return req.app.get('wsBroadcast') || (() => {});
}

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

// Boss 直聘等平台会在职位描述中插入反爬干扰内容（CSS 代码块、隐藏文字标记等），
// 此处复刻脚本端的清理逻辑作为服务端安全网，避免脏数据入库。
function cleanDescription(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;

    // 1. 去除 CSS 样式代码块: .{className}{...}
    cleaned = cleaned.replace(/\.[A-Za-z][\w-]*\s*\{[^}]*\}/g, '');

    // 2. 去除反爬隐藏文字标记（注意顺序：先复合短语再单词，避免残留碎片）
    // 2a. "来自BOSS直聘" 整体去除
    cleaned = cleaned.replace(/来自BOSS直聘/g, '');
    // 2b. "BOSS直聘" 整体去除
    cleaned = cleaned.replace(/BOSS直聘/g, '');
    // 2c. 残留的独立 "直聘"（夹在中文字符/中文标点间的反爬标记）
    cleaned = cleaned.replace(/(?<=[\u4e00-\u9fff\u3000-\u303F])直聘(?=[\u4e00-\u9fff\u3000-\u303F])/g, '');
    // 2d. "kanzhun" 反爬标记
    cleaned = cleaned.replace(/kanzhun/g, '');
    // 2e. "boss" 小写反爬标记（扩展边界到中文标点）
    cleaned = cleaned.replace(/(?<=[\u4e00-\u9fff\u3000-\u303F\d])boss(?=[\u4e00-\u9fff\u3000-\u303F\d])/gi, '');

    // 3. 去除详情页底部无关 UI 文本块（.{0,10} 容错 BOSS 已被清除的情况）
    const bossTailPatterns = [
        /去App与.{0,10}随时沟通[\s\S]*$/,
        /前往App与.{0,10}随时沟通[\s\S]*$/,
        /工作地址[\s\S]*$/,
        /点击查看地图[\s\S]*$/,
        /查看更多信息[\s\S]*$/,
        /求职工具[\s\S]*$/,
        /热门职位[\s\S]*$/,
        /热门城市[\s\S]*$/,
        /附近城市[\s\S]*$/,
        /升级VIP[\s\S]*$/,
        /去升级[\s\S]*$/,
    ];
    for (const pattern of bossTailPatterns) {
        const match = cleaned.match(pattern);
        if (match && match.index !== undefined && match.index > cleaned.length * 0.35) {
            cleaned = cleaned.substring(0, match.index);
        }
    }

    // 4. 去除常见 UI 元素
    const uiPatterns = [
        /举报/g, /分享/g, /不合适/g, /收藏/g,
        /去聊聊/g, /微信扫码与我聊聊吧/g,
        /在线\s*\d*分钟前回复/g, /今日回复\d+次/g,
        /刚刚活跃/g, /\d+分钟前活跃/g, /\d+小时前活跃/g,
        /去APP沟通/g, /立即沟通/g, /查看详情/g,
        /微信扫码/g, /扫码投递/g, /一键投递/g,
        /投递/g, /前往APP查看/g,
    ];
    for (const pattern of uiPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // 5. 去除加密薪资私有区 Unicode 字符
    cleaned = cleaned.replace(/[\uE000-\uF8FF]+/g, '');

    // 合并空白
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
}

// ---- 投递记录 ----
router.get('/applications', asyncHandler(async (req, res) => {
    const { platform, minScore, q, status, city, salaryMin, salaryMax, limit, offset, sortBy, sortOrder } = req.query;
    const result = db.queryApplications({ platform, minScore, q, status, city, salaryMin, salaryMax, limit, offset, sortBy, sortOrder });
    res.json(result);
}));

// 服务端直出 CSV，方便命令行 curl 下载，或不想跑前端 JS 时也能拿到导出文件。
// 注意：路由要放在 '/applications/:id' 之前，否则 'export.csv' 会被误当成 :id 参数匹配掉。
// filename 需要 RFC 5987 编码，否则中文字符会导致 ERR_INVALID_CHAR。
router.get('/applications/export.csv', asyncHandler(async (req, res) => {
    const { platform, minScore, q, status } = req.query;
    const { items } = db.queryApplications({ platform, minScore, q, status, limit: 100000, offset: 0 });
    const csv = db.toCsv(items);
    const date = new Date().toISOString().slice(0, 10);
    const encoded = encodeURIComponent(`投递记录_${date}.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.send(csv);
}));

// JSON 导出
router.get('/applications/export.json', asyncHandler(async (req, res) => {
    const { platform, minScore, q, status } = req.query;
    const { items } = db.queryApplications({ platform, minScore, q, status, limit: 100000, offset: 0 });
    const json = db.toJson(items);
    const date = new Date().toISOString().slice(0, 10);
    const encoded = encodeURIComponent(`投递记录_${date}.json`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.send(json);
}));

// CSV 导入（multipart/form-data 或 raw body）
router.post('/applications/import', asyncHandler(async (req, res) => {
    let csvText = '';
    // 支持 JSON body 传 { csv: "..." } 或者 raw text body
    if (req.body && typeof req.body.csv === 'string') {
        csvText = req.body.csv;
    } else if (typeof req.body === 'string') {
        csvText = req.body;
    } else {
        return res.status(400).json({ error: '请提供 CSV 数据（JSON body 中的 csv 字段，或 raw text body）' });
    }
    if (!csvText.trim()) return res.status(400).json({ error: 'CSV 数据为空' });

    const records = db.parseCsv(csvText);
    if (records.length === 0) return res.status(400).json({ error: '未能解析出任何有效记录，请检查 CSV 格式' });

    const result = await db.importApplications(records);
    if (result.created > 0) getBroadcast(req)('data:import', { created: result.created, skipped: result.skipped });
    res.json({ message: `导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条重复`, ...result });
}));

router.post('/applications', asyncHandler(async (req, res) => {
    const { name, company, score, matched, platform, salary, experience, city, time, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '缺少岗位名称 name', code: 'MISSING_NAME' });
    }
    // 验证匹配度范围
    const validatedScore = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
    // 验证 matched 必须是字符串数组
    const validatedMatched = Array.isArray(matched) ? matched.filter(m => typeof m === 'string') : [];
    // 验证时间格式
    const validatedTime = time && !isNaN(new Date(time).getTime()) ? time : new Date().toISOString();

    const { created, record } = await db.addApplication({
        name: name.trim(),
        company: (company || '').trim(),
        score: validatedScore,
        matched: validatedMatched,
        platform: (platform || '手动录入').trim(),
        salary: String(salary || '').trim(),
        experience: String(experience || '').trim(),
        city: String(city || '').trim(),
        description: cleanDescription(String(description || '')).slice(0, 2000),
        time: validatedTime,
    });
    if (created) getBroadcast(req)('data:create', { record });
    res.status(created ? 201 : 200).json({ created, record });
}));

// ---- 批量操作 ----
router.post('/applications/batch/delete', asyncHandler(async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供 ids 数组' });
    let deleted = 0;
    for (const id of ids) {
        const ok = await db.deleteApplication(id);
        if (ok) deleted++;
    }
    if (deleted > 0) getBroadcast(req)('data:batch-delete', { deleted, ids });
    res.json({ deleted, total: ids.length });
}));

router.patch('/applications/batch/status', asyncHandler(async (req, res) => {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供 ids 数组' });
    if (!status) return res.status(400).json({ error: '请提供 status' });
    let updated = 0;
    for (const id of ids) {
        const record = await db.updateApplication(id, { status });
        if (record) updated++;
    }
    if (updated > 0) getBroadcast(req)('data:batch-status', { updated, status, ids });
    res.json({ updated, total: ids.length });
}));

// 获取单条投递记录详情（放在 /:id 通用匹配之前，避免被 batch 路径误匹配）
router.get('/applications/:id', asyncHandler(async (req, res) => {
    const record = db.getApplicationById(req.params.id);
    if (!record) return res.status(404).json({ error: '未找到该记录' });
    res.json(record);
}));

router.patch('/applications/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: '无效的记录 ID', code: 'INVALID_ID' });
    }
    const patch = req.body || {};
    // 验证 score 范围
    if (patch.score !== undefined && typeof patch.score === 'number') {
        patch.score = Math.max(0, Math.min(100, patch.score));
    }
    const updated = await db.updateApplication(id, patch);
    if (!updated) return res.status(404).json({ error: '未找到该记录', code: 'NOT_FOUND' });
    getBroadcast(req)('data:update', { record: updated });
    res.json({ updated: true, record: updated });
}));

router.delete('/applications/:id', asyncHandler(async (req, res) => {
    const ok = await db.deleteApplication(req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到该记录' });
    getBroadcast(req)('data:delete', { id: req.params.id });
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

router.get('/stats/funnel', asyncHandler(async (req, res) => {
    res.json(db.getFunnelStats());
}));

router.get('/stats/salary', asyncHandler(async (req, res) => {
    res.json(db.getSalaryStats());
}));

router.get('/stats/platform-funnel', asyncHandler(async (req, res) => {
    res.json(db.getPlatformFunnelStats());
}));

// 暴露合法的状态取值列表，前端下拉框/状态选择器直接用这个渲染，不用在前端硬编码一份，
// 以后要加新状态（比如"已婉拒"）只需要改 db.js 里的 ALL_STATUSES，前端自动跟着变。
router.get('/meta/statuses', asyncHandler(async (req, res) => {
    res.json({ stages: db.STAGE_ORDER, rejected: db.REJECTED_STATUS, all: db.ALL_STATUSES });
}));

// ---- 配置（黑名单/关键词/薪资等，可与脚本设置面板双向同步）----
router.get('/config', asyncHandler(async (req, res) => {
    res.json(db.readConfig());
}));

router.put('/config', asyncHandler(async (req, res) => {
    const { config, rejected } = await db.writeConfig(req.body || {});
    // rejected 列出了因类型不对被丢弃、未生效的字段，方便调用方（脚本/前端）发现自己传错了参数
    getBroadcast(req)('config:update', { config });
    res.json({ config, rejected });
}));

// ---- 备份管理 ----
router.get('/backups', asyncHandler(async (req, res) => {
    res.json(db.listBackups());
}));

router.post('/backups/restore', asyncHandler(async (req, res) => {
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: '请提供备份文件名 filename' });
    const result = db.restoreBackup(filename);
    if (!result.success) return res.status(400).json(result);
    getBroadcast(req)('data:restore', { restored: result.restored, count: result.count });
    res.json(result);
}));

router.post('/backups/create', asyncHandler(async (req, res) => {
    const { label } = req.body || {};
    const result = db.createBackup(label || 'applications');
    if (!result.success) return res.status(500).json(result);
    res.json(result);
}));

// ---- /api 下未匹配到的路径，返回统一 JSON 404 而不是 Express 默认的 HTML 页面 ----
router.use((req, res) => {
    res.status(404).json({ error: `未知的接口: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
