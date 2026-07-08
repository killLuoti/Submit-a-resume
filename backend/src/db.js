// src/db.js
// 轻量级 JSON 文件存储 —— 不依赖任何数据库，个人单机使用足够，部署零门槛。
// 所有写操作串行化（简单队列），避免并发写文件导致数据损坏。

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
    city: '佛山',
    jobKeywords: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网', '桌面运维'],
    blacklistKeywords: ['外包', '劳务派遣', '中介', '兼职'],
    blacklistCompanies: [],
    negativeSignals: ['日结', '刷单', '押金', '培训费', '中介费', '有偿内推', '入职费'],
    expectedSalary: [7000, 10000],
    myYearsExperience: 4,
    maxExperienceGap: 2,
    dailyLimit: 30,
};

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(APPLICATIONS_FILE)) fs.writeFileSync(APPLICATIONS_FILE, '[]', 'utf-8');
    if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
}
ensureDataFiles();

// ---- 简单串行写队列，避免并发写入互相覆盖 ----
let writeQueue = Promise.resolve();
function serialize(fn) {
    writeQueue = writeQueue.then(fn, fn);
    return writeQueue;
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return fallback;
    }
}
function writeJsonSync(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file); // 原子替换，降低写入过程中崩溃导致文件损坏的概率
}

// ============================================================
// 投递记录
// ============================================================
function readApplications() {
    return readJson(APPLICATIONS_FILE, []);
}

function makeKey(name, company) {
    return `${name || ''}__${company || ''}`;
}

function addApplication(record) {
    return serialize(() => {
        const list = readApplications();
        const key = makeKey(record.name, record.company);
        const existing = list.find(x => makeKey(x.name, x.company) === key);
        if (existing) return { created: false, record: existing };

        const newRecord = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            name: record.name || '',
            company: record.company || '',
            score: typeof record.score === 'number' ? record.score : 0,
            matched: Array.isArray(record.matched) ? record.matched : [],
            platform: record.platform || '未知平台',
            salary: record.salary || '',
            city: record.city || '',
            time: record.time || new Date().toISOString(),
        };
        list.push(newRecord);
        writeJsonSync(APPLICATIONS_FILE, list);
        return { created: true, record: newRecord };
    });
}

function deleteApplication(id) {
    return serialize(() => {
        const list = readApplications();
        const idx = list.findIndex(x => x.id === id);
        if (idx === -1) return false;
        list.splice(idx, 1);
        writeJsonSync(APPLICATIONS_FILE, list);
        return true;
    });
}

function queryApplications({ platform, minScore, q, limit, offset } = {}) {
    let list = readApplications();
    if (platform) list = list.filter(x => x.platform === platform);
    if (minScore) list = list.filter(x => x.score >= Number(minScore));
    if (q) {
        const kw = q.toLowerCase();
        list = list.filter(x => (x.name || '').toLowerCase().includes(kw) || (x.company || '').toLowerCase().includes(kw));
    }
    list = list.sort((a, b) => new Date(b.time) - new Date(a.time));
    const total = list.length;
    const off = Number(offset) || 0;
    const lim = Number(limit) || 100;
    return { total, items: list.slice(off, off + lim) };
}

// ============================================================
// 配置（黑名单/关键词/薪资等，供后台管理，可选被脚本拉取同步）
// ============================================================
function readConfig() {
    return readJson(CONFIG_FILE, DEFAULT_CONFIG);
}
function writeConfig(cfg) {
    return serialize(() => {
        const merged = Object.assign({}, readConfig(), cfg);
        writeJsonSync(CONFIG_FILE, merged);
        return merged;
    });
}

// ============================================================
// 统计
// ============================================================
function getOverviewStats() {
    const list = readApplications();
    const total = list.length;
    const avgScore = total > 0 ? Math.round(list.reduce((s, x) => s + (x.score || 0), 0) / total) : 0;

    const byPlatform = {};
    list.forEach(x => { byPlatform[x.platform] = (byPlatform[x.platform] || 0) + 1; });

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayCount = list.filter(x => (x.time || '').slice(0, 10) === todayKey).length;

    return { total, avgScore, todayCount, byPlatform };
}

function getDailyTrend(days = 14) {
    const list = readApplications();
    const counts = {};
    list.forEach(x => {
        const d = (x.time || '').slice(0, 10);
        if (!d) return;
        counts[d] = (counts[d] || 0) + 1;
    });
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        result.push({ date: key, count: counts[key] || 0 });
    }
    return result;
}

function getSkillFrequency(topN = 10) {
    const list = readApplications();
    const freq = {};
    list.forEach(x => (x.matched || []).forEach(s => { freq[s] = (freq[s] || 0) + 1; }));
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([skill, count]) => ({ skill, count }));
}

module.exports = {
    readApplications,
    addApplication,
    deleteApplication,
    queryApplications,
    readConfig,
    writeConfig,
    getOverviewStats,
    getDailyTrend,
    getSkillFrequency,
};
