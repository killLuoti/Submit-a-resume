// 针对最新4条Boss直聘记录做二次清理
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'applications.json');

function cleanDescription(text) {
    if (!text || typeof text !== 'string') return '';
    let c = text;
    c = c.replace(/\.[A-Za-z][\w-]*\s*\{[^}]*\}/g, '');
    c = c.replace(/来自BOSS直聘/g, '');
    c = c.replace(/BOSS直聘/g, '');
    c = c.replace(/(?<=[\u4e00-\u9fff\u3000-\u303F])直聘(?=[\u4e00-\u9fff\u3000-\u303F])/g, '');
    c = c.replace(/kanzhun/g, '');
    c = c.replace(/(?<=[\u4e00-\u9fff\u3000-\u303F\d])boss(?=[\u4e00-\u9fff\u3000-\u303F\d])/gi, '');
    const tails = [
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
    for (const p of tails) {
        const m = c.match(p);
        if (m && m.index !== undefined && m.index > c.length * 0.35) c = c.substring(0, m.index);
    }
    const ui = [
        /举报/g, /分享/g, /不合适/g, /收藏/g, /去聊聊/g,
        /微信扫码与我聊聊吧/g, /在线\s*\d*分钟前回复/g, /今日回复\d+次/g,
        /刚刚活跃/g, /\d+分钟前活跃/g, /\d+小时前活跃/g,
        /去APP沟通/g, /立即沟通/g, /查看详情/g,
        /微信扫码/g, /扫码投递/g, /一键投递/g, /投递/g, /前往APP查看/g,
    ];
    for (const p of ui) c = c.replace(p, '');
    c = c.replace(/[\uE000-\uF8FF]+/g, '');
    c = c.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return c;
}

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

const ids = ['mrsviehf3c6683', 'mrsvi5zs694a82', 'mrsvhvav0d1unv', 'mrsvhpa0r6nvnx'];
let changed = 0;
for (const app of data) {
    if (ids.includes(app.id) && app.description) {
        const before = app.description;
        app.description = cleanDescription(before);
        if (before !== app.description) {
            console.log(`🧹 [${app.name}] 清理前 ${before.length} → 清理后 ${app.description.length} (移除 ${before.length - app.description.length} 字符)`);
            changed++;
        } else {
            console.log(`✅ [${app.name}] 无需清理`);
        }
    }
}

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
console.log(`\n完成！清理了 ${changed} 条记录`);
