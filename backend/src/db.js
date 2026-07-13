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

// ============================================================
// 投递状态流转（v1.2.0 新增）
// ============================================================
// STAGE_ORDER 是"正向推进"的阶段，有先后顺序，用于画转化漏斗。
// '已拒绝' 是一个独立的终止态，不算在漏斗阶段里——因为在任何阶段都可能被拒，
// 用一个单独的 stageReached 字段记录"曾经到达过的最远阶段"，被拒不会抹掉之前的进度，
// 这样漏斗图才能正确反映"到面试的有多少个，即使后来被拒了"。
const STAGE_ORDER = ['已投递', '已回复', '面试中', 'offer'];
const REJECTED_STATUS = '已拒绝';
const ALL_STATUSES = [...STAGE_ORDER, REJECTED_STATUS];

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
            experience: record.experience || '',
            city: record.city || '',
            time: record.time || new Date().toISOString(),
            status: STAGE_ORDER[0],       // 默认"已投递"
            stageReached: STAGE_ORDER[0], // 曾到达过的最远阶段，初始与 status 一致
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
        const allowed = ['name', 'company', 'score', 'matched', 'platform', 'salary', 'experience', 'city', 'status'];
        const updated = { ...list[idx] };
        for (const key of allowed) {
            if (patch[key] === undefined) continue;
            if (key === 'score' && typeof patch.score !== 'number') continue;
            if (key === 'matched' && !Array.isArray(patch.matched)) continue;
            if (key === 'status') {
                if (typeof patch.status !== 'string' || !ALL_STATUSES.includes(patch.status)) continue; // 非法状态值直接忽略
                updated.status = patch.status;
                // 正向阶段：推进 stageReached（取较大值，防止误操作把进度往回拖）；
                // 标记"已拒绝"时不动 stageReached，保留"曾经到达过面试"这类历史进度，漏斗图才准确。
                const stageIdx = STAGE_ORDER.indexOf(patch.status);
                if (stageIdx !== -1) {
                    const curIdx = STAGE_ORDER.indexOf(updated.stageReached || STAGE_ORDER[0]);
                    if (stageIdx > curIdx) updated.stageReached = patch.status;
                }
                continue; // status 已单独处理，不走下面的通用赋值
            }
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

function queryApplications({ platform, minScore, q, status, city, salaryMin, salaryMax, limit, offset, sortBy, sortOrder } = {}) {
    let list = readApplications();
    if (platform) list = list.filter(x => x.platform === platform);
    if (minScore) list = list.filter(x => x.score >= Number(minScore));
    if (status) list = list.filter(x => (x.status || STAGE_ORDER[0]) === status);
    if (city) {
        const ck = city.toLowerCase();
        list = list.filter(x => (x.city || '').toLowerCase().includes(ck));
    }
    if (q) {
        const kw = q.toLowerCase();
        list = list.filter(x =>
            (x.name || '').toLowerCase().includes(kw) ||
            (x.company || '').toLowerCase().includes(kw) ||
            (x.city || '').toLowerCase().includes(kw) ||
            (x.platform || '').toLowerCase().includes(kw) ||
            (x.salary || '').toLowerCase().includes(kw) ||
            (Array.isArray(x.matched) ? x.matched.join(' ').toLowerCase().includes(kw) : false)
        );
    }
    // 薪资范围筛选
    if (salaryMin || salaryMax) {
        list = list.filter(x => {
            const range = parseSalaryRange(x.salary);
            if (!range) return false;
            if (salaryMin && range.high < Number(salaryMin)) return false;
            if (salaryMax && range.low > Number(salaryMax)) return false;
            return true;
        });
    }
    // 排序
    const sKey = sortBy || 'time';
    const sDir = sortOrder === 'asc' ? 1 : -1;
    list = list.sort((a, b) => {
        if (sKey === 'score') return ((a.score || 0) - (b.score || 0)) * sDir;
        if (sKey === 'name') return (a.name || '').localeCompare(b.name || '') * sDir;
        if (sKey === 'company') return (a.company || '').localeCompare(b.company || '') * sDir;
        return (new Date(a.time || 0) - new Date(b.time || 0)) * sDir;
    });

    const total = list.length;
    const off = Math.max(0, Number(offset) || 0);
    const lim = Math.min(5000, Math.max(1, Number(limit) || 100));
    return { total, items: list.slice(off, off + lim) };
}

// 按 ID 获取单条记录
function getApplicationById(id) {
    const list = readApplications();
    return list.find(x => x.id === id) || null;
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

// 转化漏斗：统计"到达过"每个阶段的记录数（累计口径——到了面试中的，也会计入"已投递"和"已回复"的计数）。
// 兼容 v1.2.0 之前创建、没有 stageReached 字段的旧记录：统一按"已投递"处理（毕竟历史记录本来就只有这一个状态）。
function getFunnelStats() {
    const list = readApplications();
    const stageCounts = {};
    STAGE_ORDER.forEach(s => stageCounts[s] = 0);
    let rejectedCount = 0;

    list.forEach(x => {
        const reached = x.stageReached || STAGE_ORDER[0];
        const idx = STAGE_ORDER.indexOf(reached);
        if (idx === -1) return; // 数据异常（不认识的阶段名）直接跳过，不计入漏斗
        for (let i = 0; i <= idx; i++) stageCounts[STAGE_ORDER[i]]++;
        if (x.status === REJECTED_STATUS) rejectedCount++;
    });

    return {
        stages: STAGE_ORDER.map(s => ({ stage: s, count: stageCounts[s] })),
        rejected: rejectedCount,
    };
}

function toCsv(list) {
    const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const header = '岗位名称,公司,平台,匹配度,匹配技能,城市,投递时间,状态\n';
    const rows = list.map(x =>
        `${esc(x.name)},${esc(x.company)},${esc(x.platform)},${x.score || 0}%,${esc((x.matched || []).join('/'))},${esc(x.city)},${esc(x.time)},${esc(x.status || STAGE_ORDER[0])}`
    ).join('\n');
    return '\uFEFF' + header + rows; // \uFEFF: 让 Excel 正确识别 UTF-8 编码，避免中文乱码
}

// ============================================================
// 高级统计：薪资分布 & 平台转化率
// ============================================================

// 薪资分布统计：从记录的 salary 字段中解析数字范围，按区间统计数量
// salary 字段格式多样："8000-12000"、"8K-12K"、"8千-1.2万"、"面议" 等
function parseSalaryRange(salaryStr) {
    if (!salaryStr || salaryStr === '面议') return null;
    const s = String(salaryStr);
    // 尝试匹配 "8000-12000" 或 "8K-12K" 或 "8k-12k"
    let m = s.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
    if (m) return { low: parseFloat(m[1]) * 1000, high: parseFloat(m[2]) * 1000 };
    // 尝试匹配纯数字 "8000-12000"
    m = s.match(/(\d{4,6})\s*[-~到至]\s*(\d{4,6})/);
    if (m) return { low: parseInt(m[1]), high: parseInt(m[2]) };
    // 尝试匹配 "8千-1.2万"
    m = s.match(/(\d+(?:\.\d+)?)\s*千\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*万/);
    if (m) return { low: parseFloat(m[1]) * 1000, high: parseFloat(m[2]) * 10000 };
    return null;
}

function getSalaryStats() {
    const list = readApplications();
    const parsed = list.map(x => parseSalaryRange(x.salary)).filter(Boolean);
    const count = parsed.length;
    if (count === 0) return { count: 0, avgLow: 0, avgHigh: 0, distribution: [] };

    const avgLow = Math.round(parsed.reduce((s, r) => s + r.low, 0) / count);
    const avgHigh = Math.round(parsed.reduce((s, r) => s + r.high, 0) / count);

    // 薪资区间分布
    const ranges = [
        { label: '<5K', min: 0, max: 5000 },
        { label: '5K-8K', min: 5000, max: 8000 },
        { label: '8K-12K', min: 8000, max: 12000 },
        { label: '12K-18K', min: 12000, max: 18000 },
        { label: '18K-25K', min: 18000, max: 25000 },
        { label: '>25K', min: 25000, max: Infinity },
    ];
    const distribution = ranges.map(r => ({
        label: r.label,
        count: parsed.filter(p => p.low >= r.min && p.low < r.max).length,
    }));

    return { count, avgLow, avgHigh, distribution };
}

// 按平台统计漏斗转化率
function getPlatformFunnelStats() {
    const list = readApplications();
    const platforms = {};

    list.forEach(x => {
        const p = x.platform || '未知平台';
        if (!platforms[p]) platforms[p] = { stages: {}, rejected: 0, total: 0 };
        platforms[p].total++;

        const reached = x.stageReached || STAGE_ORDER[0];
        const idx = STAGE_ORDER.indexOf(reached);
        if (idx !== -1) {
            for (let i = 0; i <= idx; i++) {
                platforms[p].stages[STAGE_ORDER[i]] = (platforms[p].stages[STAGE_ORDER[i]] || 0) + 1;
            }
        }
        if (x.status === REJECTED_STATUS) platforms[p].rejected++;
    });

    const result = Object.entries(platforms).map(([platform, data]) => ({
        platform,
        total: data.total,
        stages: STAGE_ORDER.map(s => ({ stage: s, count: data.stages[s] || 0 })),
        rejected: data.rejected,
    }));

    return result.sort((a, b) => b.total - a.total);
}

// ============================================================
// 数据导入
// ============================================================

// 解析 CSV 文本为记录数组（支持带 BOM 头的 UTF-8 CSV）
function parseCsv(csvText) {
    // 去掉 BOM 头
    const text = csvText.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return []; // 至少要有表头 + 1 行数据

    // 解析表头，建立列名到索引的映射
    const header = parseCsvLine(lines[0]);
    const colMap = {};
    const fieldMap = { '岗位名称': 'name', '公司': 'company', '平台': 'platform', '匹配度': 'score', '匹配技能': 'matched', '城市': 'city', '薪资': 'salary', '投递时间': 'time', '状态': 'status' };
    header.forEach((col, i) => {
        const trimmed = col.trim().replace(/"/g, '');
        if (fieldMap[trimmed]) colMap[fieldMap[trimmed]] = i;
    });

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 2) continue;

        const get = (field) => {
            const idx = colMap[field];
            if (idx === undefined || idx >= cols.length) return '';
            return cols[idx].trim().replace(/^"|"$/g, '').trim();
        };

        const name = get('name');
        const company = get('company');
        if (!name) continue; // 至少需要岗位名称

        // 解析匹配度：去掉 % 号
        let score = parseInt(get('score').replace(/%/g, '')) || 0;
        if (score > 100) score = 100;
        if (score < 0) score = 0;

        // 解析匹配技能：用 / 或 , 分隔
        const matchedStr = get('matched');
        const matched = matchedStr ? matchedStr.split(/[/,，]/).map(s => s.trim()).filter(Boolean) : [];

        // 解析时间
        let time = get('time');
        if (time && !time.includes('T')) time = new Date(time).toISOString();
        if (!time) time = new Date().toISOString();

        // 解析状态
        let status = get('status');
        if (!ALL_STATUSES.includes(status)) status = STAGE_ORDER[0];

        records.push({
            name,
            company,
            score,
            matched,
            platform: get('platform') || '手动录入',
            salary: get('salary'),
            city: get('city'),
            time,
            status,
        });
    }
    return records;
}

// 简单的 CSV 行解析（支持双引号包裹的字段，内含逗号/换行）
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // 跳过转义的双引号
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

// 批量导入记录：逐条去重后写入
function importApplications(records) {
    return serialize(() => {
        const list = readApplications();
        let created = 0, skipped = 0;
        for (const record of records) {
            const key = makeKey(record.name, record.company);
            const existing = list.find(x => makeKey(x.name, x.company) === key);
            if (existing) { skipped++; continue; }

            const newRecord = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                name: record.name || '',
                company: record.company || '',
                score: typeof record.score === 'number' ? record.score : 0,
                matched: Array.isArray(record.matched) ? record.matched : [],
                platform: record.platform || '手动录入',
                salary: record.salary || '',
                experience: record.experience || '',
                city: record.city || '',
                time: record.time || new Date().toISOString(),
                status: record.status || STAGE_ORDER[0],
                stageReached: record.status || STAGE_ORDER[0],
            };
            list.push(newRecord);
            created++;
        }
        if (created > 0) {
            backupBeforeWrite(APPLICATIONS_FILE, 'applications');
            writeJsonSync(APPLICATIONS_FILE, list);
        }
        return { created, skipped, total: records.length };
    });
}

// ============================================================
// JSON 导出
// ============================================================
function toJson(list) {
    return JSON.stringify(list, null, 2);
}

// ============================================================
// 备份管理
// ============================================================

// 列出所有备份文件（按时间倒序）
function listBackups() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return [];
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();
        return files.map(f => {
            const stat = fs.statSync(path.join(BACKUP_DIR, f));
            const label = f.split('_')[0]; // "applications" 或 "config"
            return {
                name: f,
                label,
                size: stat.size,
                time: stat.mtime.toISOString(),
            };
        });
    } catch (e) {
        return [];
    }
}

// 从备份恢复数据
function restoreBackup(filename) {
    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) return { success: false, error: '备份文件不存在' };

    try {
        const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        const label = filename.split('_')[0];

        if (label === 'applications') {
            if (!Array.isArray(data)) return { success: false, error: '备份数据格式错误：期望数组' };
            backupBeforeWrite(APPLICATIONS_FILE, 'applications');
            writeJsonSync(APPLICATIONS_FILE, data);
            return { success: true, restored: 'applications', count: data.length };
        } else if (label === 'config') {
            if (typeof data !== 'object' || Array.isArray(data)) return { success: false, error: '备份数据格式错误：期望对象' };
            backupBeforeWrite(CONFIG_FILE, 'config');
            writeJsonSync(CONFIG_FILE, data);
            return { success: true, restored: 'config' };
        } else {
            return { success: false, error: `未知的备份类型: ${label}` };
        }
    } catch (e) {
        return { success: false, error: `备份文件读取失败: ${e.message}` };
    }
}

// 手动创建备份
function createBackup(label) {
    const srcFile = label === 'config' ? CONFIG_FILE : APPLICATIONS_FILE;
    if (!fs.existsSync(srcFile)) return { success: false, error: '数据文件不存在' };
    try {
        backupBeforeWrite(srcFile, label);
        return { success: true, message: `已创建 ${label} 备份` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    readApplications,
    addApplication,
    updateApplication,
    deleteApplication,
    queryApplications,
    getApplicationById,
    readConfig,
    writeConfig,
    getOverviewStats,
    getDailyTrend,
    getSkillFrequency,
    getFunnelStats,
    getSalaryStats,
    getPlatformFunnelStats,
    toCsv,
    toJson,
    parseCsv,
    importApplications,
    listBackups,
    restoreBackup,
    createBackup,
    STAGE_ORDER,
    ALL_STATUSES,
    REJECTED_STATUS,
};
