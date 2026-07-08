// src/routes.js
const express = require('express');
const db = require('./db');

const router = express.Router();

// ---- 投递记录 ----
router.get('/applications', (req, res) => {
    const { platform, minScore, q, limit, offset } = req.query;
    const result = db.queryApplications({ platform, minScore, q, limit, offset });
    res.json(result);
});

router.post('/applications', (req, res) => {
    const { name, company, score, matched, platform, salary, city, time } = req.body || {};
    if (!name) return res.status(400).json({ error: '缺少岗位名称 name' });
    const { created, record } = db.addApplication({ name, company, score, matched, platform, salary, city, time });
    res.status(created ? 201 : 200).json({ created, record });
});

router.delete('/applications/:id', (req, res) => {
    const ok = db.deleteApplication(req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到该记录' });
    res.json({ deleted: true });
});

// ---- 统计 ----
router.get('/stats/overview', (req, res) => {
    res.json(db.getOverviewStats());
});

router.get('/stats/daily', (req, res) => {
    const days = Number(req.query.days) || 14;
    res.json(db.getDailyTrend(days));
});

router.get('/stats/skills', (req, res) => {
    const topN = Number(req.query.top) || 10;
    res.json(db.getSkillFrequency(topN));
});

// ---- 配置（黑名单/关键词/薪资等，可与脚本设置面板双向同步）----
router.get('/config', (req, res) => {
    res.json(db.readConfig());
});

router.put('/config', (req, res) => {
    const updated = db.writeConfig(req.body || {});
    res.json(updated);
});

module.exports = router;
