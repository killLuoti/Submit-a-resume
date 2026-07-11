// src/db.js
// 轻量级 JSON 文件存储 —— 不依赖任何数据库，个人单机使用足够，部署零门槛。
// 所有写操作串行化（简单队列），避免并发写文件导致数据损坏。

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 20; // 最多保留最近20份自动备份，防止 backups/ 目录无限增长

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

// config 各字段的类型约束——PUT /config 时用来过滤/校验请求体，
// 防止脚本或其它调用方传入错误类型的字段把 config.json 写坏（例如把数组字段传成字符串）。
const CONFIG_SCHEMA = {
    city: 'string',
    jobKeywords: 'string[]',
    blacklistKeywords: 'string[]',
    blacklistCompanies: 'string[]',
    negativeSignals: 'string[]',
    expectedSalary: 'number[2]',
    myYearsExperience: 'number',
    maxExperienceGap: 'number',
    dailyLimit: 'number',
};

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
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

// 覆盖投递记录文件前先备份一份带时间戳的快照，防止某次写入逻辑出错把180+条历史投递记录写坏/写丢。
// 只保留最近 MAX_BACKUPS 份，超出的自动清理最旧的。
function backupBeforeWrite(file, label) {
    try {
        if (!fs.existsSync(file)) return;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `${label}_${ts}.json`);
        fs.copyFileSync(file, backupPath);

        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith(`${label}_`))
            .sort(); // 时间戳文件名天然按时间排序
        while (backups.length > MAX_BACKUPS) {
            fs.unlinkSync(path.join(BACKUP_DIR, backups.shift()));
        }
    } catch (e) {
        // 备份失败不应阻塞主流程，仅记录日志
        console.warn('⚠ 数据备份失败（不影响本次写入）:', e.message);
    }
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
        backupBeforeWrite(APPLICATIONS_FILE, 'applications');
        writeJsonSync(APPLICATIONS_FILE, list);
        return { created: true, record: newRecord };
    });
}

function updateApplication(id, patch) {
    return serialize(() => {
        const list = readApplications();
        const idx = list.findIndex(x => x.id === id);
        if (idx === -1) return null;

        // 只允许更新这几个字段，防止调用方顺手改掉 id/time 等不该动的字段
        const allowed = ['name', 'company', 'score', 'matched', 'platform', 'salary', 'city'];
        const updated = { ...list[idx] };
        for (const key of allowed) {
            if (patch[key] === undefined) continue;
            if (key === 'score' && typeof patch.score !== 'number') continue;
            if (key === 'matched' && !Array.isArray(patch.matched)) continue;
            updated[key] = patch[key];
        }
        list[idx] = updated;
        backupBeforeWrite(APPLICATIONS_FILE, 'applications');
        writeJsonSync(APPLICATIONS_FILE, list);
        return updated;
    });
}

function deleteApplication(id) {
    return serialize(() => {
        const list = readApplications();
        const idx = list.findIndex(x => x.id === id);
        if (idx === -1) return false;
        list.splice(idx, 1);
        backupBeforeWrite(APPLICATIONS_FILE, 'applications');
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
    const off = Math.max(0, Number(offset) || 0);
    // 上限 5000，避免调用方误传超大 limit 导致一次性序列化过大响应
    const lim = Math.min(5000, Math.max(1, Number(limit) || 100));
    return { total, items: list.slice(off, off + lim) };
}

// ============================================================
// 配置（黑名单/关键词/薪资等，供后台管理，可选被脚本拉取同步）
// ============================================================
function readConfig() {
    return readJson(CONFIG_FILE, DEFAULT_CONFIG);
}

// 按 CONFIG_SCHEMA 过滤请求体：类型不对的字段直接丢弃（不写入），
// 防止脚本或手工调用 API 时传错类型（比如把数组传成字符串）把 config.json 写坏，
// 导致下次 writeConfig 的 readConfig() + Object.assign 基于一个已损坏的值继续叠加错误。
function validateConfigPatch(input) {
    const clean = {};
    const rejected = [];
    for (const [key, type] of Object.entries(CONFIG_SCHEMA)) {
        if (!(key in input)) continue;
        const val = input[key];
        if (type === 'string' && typeof val === 'string') {
            clean[key] = val;
        } else if (type === 'string[]' && Array.isArray(val) && val.every(v => typeof v === 'string')) {
            clean[key] = val;
        } else if (type === 'number' && typeof val === 'number' && Number.isFinite(val)) {
            clean[key] = val;
        } else if (type === 'number[2]' && Array.isArray(val) && val.length === 2 && val.every(v => typeof v === 'number' && Number.isFinite(v))) {
            clean[key] = val;
        } else {
            rejected.push(key);
        }
    }
    return { clean, rejected };
}

function writeConfig(cfg) {
    const { clean, rejected } = validateConfigPatch(cfg || {});
    const merged = serialize(() => {
        const result = Object.assign({}, readConfig(), clean);
        backupBeforeWrite(CONFIG_FILE, 'config');
        writeJsonSync(CONFIG_FILE, result);
        return result;
    });
    return Promise.resolve(merged).then(result => ({ config: result, rejected }));
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

function toCsv(list) {
    const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const header = '岗位名称,公司,平台,匹配度,匹配技能,城市,投递时间\n';
    const rows = list.map(x =>
        `${esc(x.name)},${esc(x.company)},${esc(x.platform)},${x.score || 0}%,${esc((x.matched || []).join('/'))},${esc(x.city)},${esc(x.time)}`
    ).join('\n');
    return '\uFEFF' + header + rows; // \uFEFF: 让 Excel 正确识别 UTF-8 编码，避免中文乱码
}

module.exports = {
    readApplications,
    addApplication,
    updateApplication,
    deleteApplication,
    queryApplications,
    readConfig,
    writeConfig,
    getOverviewStats,
    getDailyTrend,
    getSkillFrequency,
    toCsv,
};
