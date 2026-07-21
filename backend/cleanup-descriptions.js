// cleanup-descriptions.js
// 一次性清理 applications.json 中已有的 Boss 直聘反爬干扰内容
// 运行方式: node cleanup-descriptions.js

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'applications.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');

function cleanDescription(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;

    // 1. 去除 CSS 样式代码块
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

    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
}

// ---- 主流程 ----
if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ 找不到 applications.json:', DATA_FILE);
    process.exit(1);
}

const raw = fs.readFileSync(DATA_FILE, 'utf-8');
const applications = JSON.parse(raw);

if (!Array.isArray(applications)) {
    console.error('❌ applications.json 格式错误，期望数组');
    process.exit(1);
}

// 备份
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupName = `applications_before_cleanup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(path.join(BACKUP_DIR, backupName), raw, 'utf-8');
console.log(`📦 已备份到: backups/${backupName}`);

let cleanedCount = 0;
let totalCleanedChars = 0;

for (const app of applications) {
    if (app.description && typeof app.description === 'string') {
        const original = app.description;
        const cleaned = cleanDescription(original);
        if (cleaned !== original) {
            const removedChars = original.length - cleaned.length;
            totalCleanedChars += removedChars;
            app.description = cleaned;
            cleanedCount++;
            console.log(`🧹 [${app.name}@${app.company || '?'}] 清理了 ${removedChars} 个字符`);
        }
    }
}

fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2), 'utf-8');
console.log(`\n✅ 完成！清理了 ${cleanedCount}/${applications.length} 条记录，共移除 ${totalCleanedChars} 个干扰字符`);
