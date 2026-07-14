// ==UserScript==
// @name         智联招聘/Boss直聘/前程无忧/猎聘 - 智能自动投递助手 v7.0
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  多平台自动投递，技能匹配度分析，经验/薪资/红旗关键词过滤，投递统计图表，断点续投，稳定性优化，可选同步到本地管理后台（智联/前程无忧新增详情API获取完整职位描述和薪资）
// @connect      127.0.0.1
// @connect      localhost
// @connect      fe-api.zhaopin.com
// @connect      jobs.51job.com
// @author       罗启盛求职助手
// @match        https://www.zhaopin.com/*
// @match        https://sou.zhaopin.com/*
// @match        https://jobs.zhaopin.com/*
// @match        https://www.zhipin.com/*
// @match        https://we.51job.com/*
// @match        https://search.51job.com/*
// @match        https://job.51job.com/*
// @match        https://www.liepin.com/*
// @icon         https://www.zhaopin.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 默认配置（可在 ⚙️ 设置面板里修改，无需改代码）
    // ============================================================
    const DEFAULT_CONFIG = {
        city: '佛山',
        jobKeywords: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网', '桌面运维', '系统运维', '网络管理员', '网管', 'helpdesk', 'IT专员', '信息化', '系统管理员', '机房运维', '智能硬件', 'IT工程师'],
        blacklistKeywords: ['外包', '劳务派遣', '中介', '兼职', '实习', '助理'],
        blacklistCompanies: [],
        negativeSignals: ['日结', '刷单', '押金', '培训费', '中介费', '有偿内推', '入职费'],
        expectedSalary: [3000, 12000],
        skipIfSalaryUnknown: true,

        myYearsExperience: 4,       // 你的工作年限，用于经验要求过滤
        maxExperienceGap: 1,        // 岗位要求年限超过 "我的年限+此值" 时跳过（精准模式：只投±1年）

        deliverCount: 30,
        dailyLimit: 20,
        batchInterval: 4000,
        jitterPercent: 30,           // 延时随机浮动百分比，让节奏更平稳，减少页面卡顿/误触发
        watchdogNoProgressMs: 120000, // 运行N毫秒仍0投递则自动停止（多半是选择器不匹配该页面）
        autoNextPage: true,
        retryOnFail: true,
        retryTimes: 2,
        soundEnabled: true,
        notifyOnDone: true,
        resumeBannerEnabled: true,

        // 可选：同步投递记录到本地管理后台（见 backend/ 目录），默认关闭
        syncEnabled: false,
        backendUrl: 'http://127.0.0.1:8787/api',

        greetingTemplate: '您好，我有4年IT运维与技术支持经验，熟悉桌面运维、网络管理、系统维护及物联网相关技术，看到贵司该岗位与我的经验较为匹配，希望能进一步沟通，期待您的回复！',

        skills: {
            '桌面运维':          { weight: 10, category: '运维' },
            'IT支持':            { weight: 10, category: '运维' },
            '网络运维':          { weight: 9,  category: '运维' },
            '技术支持':          { weight: 9,  category: '运维' },
            '故障排除':          { weight: 8,  category: '运维' },
            '系统维护':          { weight: 8,  category: '运维' },
            'Python':            { weight: 8,  category: '开发' },
            '爬虫':              { weight: 7,  category: '开发' },
            'C#':                { weight: 7,  category: '开发' },
            'Java':              { weight: 6,  category: '开发' },
            'MySQL':             { weight: 7,  category: '开发' },
            'SQL Server':        { weight: 6,  category: '开发' },
            '物联网':            { weight: 9,  category: '物联网' },
            '单片机':            { weight: 8,  category: '物联网' },
            'STM32':             { weight: 8,  category: '物联网' },
            '组网':              { weight: 7,  category: '网络' },
            '传感器':            { weight: 7,  category: '物联网' },
            'Cisco':             { weight: 7,  category: '网络' },
            '交换机':            { weight: 7,  category: '网络' },
            'VLAN':              { weight: 7,  category: '网络' },
            '网络调试':          { weight: 7,  category: '网络' },
            '白盒测试':          { weight: 6,  category: '测试' },
            '电工':              { weight: 5,  category: '其他' },
            '物联网安装调试员':  { weight: 8,  category: '物联网' },
        },

        saveApplied: true,
    };

    function loadConfig() {
        let saved = {};
        try { saved = JSON.parse(GM_getValue('zpm_config_v5', '{}')); } catch { saved = {}; }
        return Object.assign({}, DEFAULT_CONFIG, saved);
    }
    function saveConfig(cfg) { GM_setValue('zpm_config_v5', JSON.stringify(cfg)); }

    let CONFIG = loadConfig();

    // ============================================================
    // 样式
    // ============================================================
    GM_addStyle(`
        #zpm-v5-panel {
            position: fixed; top: 80px; right: 20px; width: 340px;
            background: #fff; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px; overflow: hidden;
            border: 1px solid #e8e8e8;
        }
        #zpm-v5-panel .header {
            background: linear-gradient(135deg, #165DFF, #0F48D1);
            color: #fff; padding: 14px 16px; cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            user-select: none;
        }
        #zpm-v5-panel .header h3 { margin: 0; font-size: 14px; display: flex; align-items: center; gap: 6px; }
        #zpm-v5-panel .header .header-actions { display: flex; align-items: center; gap: 9px; }
        #zpm-v5-panel .header .icon-btn { cursor: pointer; opacity: 0.85; font-size: 15px; }
        #zpm-v5-panel .header .icon-btn:hover { opacity: 1; }
        #zpm-v5-panel .body { padding: 14px 16px; max-height: 580px; overflow-y: auto; }

        .zpm-resume-banner {
            background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px;
            padding: 8px 10px; margin-bottom: 10px; font-size: 12px; color: #874d00;
            display: flex; justify-content: space-between; align-items: center; gap: 8px;
        }
        .zpm-resume-banner button {
            border:none; background:#fa8c16; color:#fff; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:11px;
        }

        .zpm-status-card {
            background: #f8f9ff; border-radius: 10px; padding: 14px; margin-bottom: 12px;
            border: 1px solid #e8f0ff; position: relative;
        }
        .zpm-status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .zpm-status-item { display: flex; flex-direction: column; gap: 2px; }
        .zpm-status-label { font-size: 12px; color: #666; }
        .zpm-status-value { font-size: 20px; font-weight: 700; color: #333; }
        .zpm-status-value.running { color: #165DFF; }
        .zpm-status-value.stopped { color: #999; }
        .zpm-status-value.done { color: #52c41a; }
        .zpm-status-value.limit { color: #ff4d4f; }

        .zpm-filter-group { display: flex; gap: 4px; margin: 8px 0; flex-wrap: wrap; }
        .zpm-filter-btn {
            padding: 4px 12px; border: 1px solid #d9d9d9; border-radius: 14px;
            background: #fff; cursor: pointer; font-size: 12px; transition: all 0.2s;
        }
        .zpm-filter-btn.active { background: #165DFF; color: #fff; border-color: #165DFF; }
        .zpm-filter-btn:hover { border-color: #165DFF; }

        .zpm-toggle-btn {
            width: 100%; padding: 12px; border: none; border-radius: 8px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; margin-top: 8px;
        }
        .zpm-toggle-btn.start { background: linear-gradient(135deg, #165DFF, #0F48D1); color: #fff; }
        .zpm-toggle-btn.start:hover { box-shadow: 0 4px 12px rgba(22,93,255,0.3); }
        .zpm-toggle-btn.stop { background: #ff4d4f; color: #fff; }
        .zpm-toggle-btn.stop:hover { box-shadow: 0 4px 12px rgba(255,77,79,0.3); }

        .zpm-mini-btn-row { display:flex; gap:6px; margin-top:8px; }
        .zpm-mini-btn {
            flex: 1; padding: 8px; border: 1px solid #d9d9d9; border-radius: 8px;
            background: #fff; cursor: pointer; font-size: 12px; text-align:center;
        }
        .zpm-mini-btn:hover { border-color: #165DFF; color:#165DFF; }

        .zpm-log-area {
            margin-top: 8px; max-height: 150px; overflow-y: auto;
            background: #fafafa; border-radius: 8px; padding: 8px;
            font-size: 12px; line-height: 1.6;
        }
        .zpm-log-item { padding: 2px 0; border-bottom: 1px solid #f0f0f0; }
        .zpm-log-item:last-child { border-bottom: none; }
        .zpm-log-success { color: #52c41a; }
        .zpm-log-skip { color: #faad14; }
        .zpm-log-error { color: #ff4d4f; }
        .zpm-log-info { color: #165DFF; }

        .zpm-progress-bar { height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden; margin: 8px 0; }
        .zpm-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #165DFF, #52c41a); transition: width 0.3s; }

        .zpm-cat-bars { margin-top: 8px; }
        .zpm-cat-row { display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:11px; color:#555; }
        .zpm-cat-name { width: 46px; flex-shrink:0; text-align:right; }
        .zpm-cat-track { flex:1; height:6px; background:#f0f0f0; border-radius:3px; overflow:hidden; }
        .zpm-cat-fill { height:100%; background:linear-gradient(90deg,#165DFF,#52c41a); }
        .zpm-cat-pct { width:32px; flex-shrink:0; color:#999; }

        .zpm-badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 11px; font-weight: bold; margin-left: 6px; }
        .zpm-badge-high { background: #52c41a; color: #fff; }
        .zpm-badge-mid { background: #faad14; color: #fff; }
        .zpm-badge-low { background: #ff4d4f; color: #fff; }

        .zpm-job-highlight { outline: 2px solid #52c41a; outline-offset: 1px; background: #f6ffed !important; }
        .zpm-job-hidden { display: none !important; }
        .zpm-job-applied { opacity: 0.6; }
        .zpm-job-blacklist { opacity: 0.35; filter: grayscale(60%); }

        .zpm-toast {
            position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
            padding: 10px 20px; border-radius: 6px; color: #fff;
            font-size: 13px; z-index: 9999999; display: none;
        }
        .zpm-toast.success { background: #52c41a; }
        .zpm-toast.error { background: #ff4d4f; }
        .zpm-toast.info { background: #165DFF; }

        .zpm-footer { text-align: center; font-size: 11px; color: #999; padding: 8px; border-top: 1px solid #f0f0f0; }

        #zpm-modal-mask {
            position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9999998;
            display: flex; align-items: center; justify-content: center;
        }
        #zpm-modal-box {
            width: 440px; max-height: 82vh; overflow-y: auto; background: #fff;
            border-radius: 12px; padding: 20px; font-family: -apple-system, sans-serif; font-size: 13px;
        }
        #zpm-modal-box h2 { margin: 0 0 14px; font-size: 16px; }
        .zpm-set-group { margin-bottom: 14px; }
        .zpm-set-group label { display:block; font-weight:600; margin-bottom: 4px; color:#333; }
        .zpm-set-group input[type=text], .zpm-set-group textarea, .zpm-set-group input[type=number] {
            width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d9d9d9;
            border-radius: 6px; font-size: 12px; font-family: inherit;
        }
        .zpm-set-group textarea { resize: vertical; min-height: 50px; }
        .zpm-set-row { display:flex; gap:8px; }
        .zpm-set-row > div { flex:1; }
        .zpm-set-hint { font-size: 11px; color: #999; margin-top: 2px; }
        .zpm-set-checkbox { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
        .zpm-set-actions { display:flex; gap:8px; margin-top: 16px; }
        .zpm-set-actions button { flex:1; padding: 10px; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; }
        .zpm-set-save { background:#165DFF; color:#fff; }
        .zpm-set-cancel { background:#f0f0f0; color:#333; }

        .zpm-stat-block { margin-bottom: 18px; }
        .zpm-stat-block h4 { margin: 0 0 8px; font-size: 13px; color:#333; }
        .zpm-skill-row { display:flex; align-items:center; gap:6px; margin-bottom:5px; font-size:12px; }
        .zpm-skill-name { width: 90px; flex-shrink:0; text-align:right; color:#555; }
        .zpm-skill-track { flex:1; height:8px; background:#f0f0f0; border-radius:4px; overflow:hidden; }
        .zpm-skill-fill { height:100%; background:linear-gradient(90deg,#165DFF,#52c41a); }
        .zpm-skill-count { width: 24px; color:#999; font-size:11px; }
    `);

    // ============================================================
    // 工具函数
    // ============================================================
    const delay = ms => new Promise(r => setTimeout(r, ms));

    function jitter(ms) {
        const pct = (CONFIG.jitterPercent || 0) / 100;
        const delta = ms * pct * (Math.random() * 2 - 1);
        return Math.max(200, Math.round(ms + delta));
    }

    function toast(msg, type='info', duration=2500) {
        const el = document.getElementById('zpm-toast') || (() => {
            const t = document.createElement('div');
            t.id = 'zpm-toast'; t.className = 'zpm-toast';
            document.body.appendChild(t); return t;
        })();
        el.textContent = msg;
        el.className = `zpm-toast ${type}`;
        el.style.display = 'block';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.style.display = 'none', duration);
    }

    function beep(freq = 880, ms = 120) {
        if (!CONFIG.soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = freq;
            osc.connect(gain); gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            osc.start();
            setTimeout(() => { osc.stop(); ctx.close(); }, ms);
        } catch (e) {}
    }

    function notifyDone(text) {
        if (!CONFIG.notifyOnDone) return;
        try { GM_notification({ title: '🤖 自动投递助手', text, timeout: 6000 }); } catch (e) {}
    }

    // ---- 同步投递记录到本地管理后台（可选，失败不影响主流程）----
    function formatSalary(sal) {
        if (!sal) return '';
        // 如果是字符串（如从 API 获取的 "1.5-2.5万·14薪"），直接返回
        if (typeof sal === 'string') return sal;
        if (typeof sal !== 'object') return '';
        if (sal.negotiable) return '面议';
        if (sal.low != null && sal.high != null) {
            const fmt = v => v >= 10000 ? (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万' : (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
            return fmt(sal.low) + ' - ' + fmt(sal.high);
        }
        return '';
    }

    // 将经验要求对象/字符串格式化为可读文本
    function formatExperience(exp) {
        if (!exp) return '';
        if (typeof exp === 'string') return exp;
        if (typeof exp !== 'object') return '';
        // { min: 0, max: 99 } 或 { min: 2, max: 5 }
        if (exp.min != null && exp.max != null) {
            if (exp.min === 0 && exp.max === 0) return '应届/无经验';
            if (exp.min === 0 && exp.max === 99) return '经验不限';
            if (exp.min === 0) return exp.max + '年以下';
            if (exp.max >= 99) return exp.min + '年以上';
            return exp.min + '-' + exp.max + '年';
        }
        return '';
    }

    function pushToBackend(record, platformName) {
        if (!CONFIG.syncEnabled || !CONFIG.backendUrl) return;
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.backendUrl.replace(/\/$/, '') + '/applications',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    name: record.name,
                    company: record.company,
                    score: record.score,
                    matched: record.matched,
                    platform: platformName,
                    city: record.city || '',
                    salary: formatSalary(record.salary),
                    experience: formatExperience(record.experience),
                    description: (record.description || '').slice(0, 2000),
                    time: new Date().toISOString(),
                }),
                timeout: 5000,
                onerror: () => console.warn('🤖 后台同步失败（后台可能未启动，可忽略）'),
                ontimeout: () => console.warn('🤖 后台同步超时（后台可能未启动，可忽略）'),
            });
        } catch (e) { /* 同步失败不影响主投递流程 */ }
    }

    // 通过智联招聘详情 API 获取完整职位描述、薪资等信息
    // number 格式如 CC404818830J40902424202，从岗位标题链接 href 中提取
    function fetchZhaopinDetail(number) {
        return new Promise((resolve) => {
            if (!number) return resolve(null);
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://fe-api.zhaopin.com/c/i/jobs/position-detail-new?number=${encodeURIComponent(number)}&platform=13`,
                    headers: { 'Accept': 'application/json' },
                    timeout: 6000,
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.code === 200 && json.data && json.data.detailedPosition) {
                                const dp = json.data.detailedPosition;
                                // 清理 HTML 标签，保留纯文本（去 <p><br> 等）
                                const descText = (dp.jobDesc || dp.jobDescPC || '').replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
                                resolve({
                                    description: descText,
                                    salary: dp.salary60 || '',
                                    education: dp.education || '',
                                    workingExp: dp.positionWorkingExp || dp.workingExp || '',
                                    workAddress: dp.workAddress || '',
                                    companySize: (json.data.detailedCompany || {}).companySize || '',
                                });
                            } else {
                                resolve(null);
                            }
                        } catch (e) { resolve(null); }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            } catch (e) { resolve(null); }
        });
    }

    // 从智联招聘岗位卡片中提取岗位编号（number）
    // 标题链接 href 格式：http://jobs.zhaopin.com/CC404818830J40902424202.htm
    function extractZhaopinNumber(jobEl) {
        try {
            const links = jobEl.querySelectorAll('a[href*="jobs.zhaopin.com"], a[href*="zhaopin.com"]');
            for (const a of links) {
                const href = a.getAttribute('href') || '';
                const m = href.match(/\/(CC\d+J\d+)\./);
                if (m) return m[1];
            }
            // 兜底：从任意链接 href 中匹配 CC 开头的编号
            const allLinks = jobEl.querySelectorAll('a[href]');
            for (const a of allLinks) {
                const href = a.getAttribute('href') || '';
                const m = href.match(/(CC\w+)/);
                if (m) return m[1];
            }
        } catch (e) {}
        return null;
    }

    // 从前程无忧岗位卡片中提取详情页链接
    // 标题链接 href 格式：/foshan-sdq/172361885.html 或 https://jobs.51job.com/foshan-sdq/172361885.html
    function extract51jobUrl(jobEl) {
        try {
            const links = jobEl.querySelectorAll('a[href*="51job.com"], a[href*="/"]');
            for (const a of links) {
                const href = a.getAttribute('href') || '';
                // 匹配岗位详情页链接（含数字 ID 的 .html）
                if (/\d+\.html/.test(href)) {
                    if (href.startsWith('http')) return href;
                    if (href.startsWith('//')) return 'https:' + href;
                    return 'https://jobs.51job.com' + href;
                }
            }
        } catch (e) {}
        return null;
    }

    // 通过前程无忧详情页获取完整职位描述和薪资
    // 优先从 window.__NUXT__ 提取 detailJobInfo（数据更丰富），兜底用 JSON-LD

    // 辅助函数：通过大括号配对提取对象字面量（解决嵌套对象问题）
    function extractObjectLiteralByKey(source, key) {
        const keyIndex = source.indexOf(key);
        if (keyIndex < 0) return null;

        const colonIndex = source.indexOf(':', keyIndex + key.length);
        if (colonIndex < 0) return null;

        let i = colonIndex + 1;
        while (i < source.length && /\s/.test(source[i])) i++;

        if (source[i] !== '{') return null;

        const start = i;
        let depth = 0;
        let inString = false;
        let quote = '';
        let escaped = false;

        for (; i < source.length; i++) {
            const ch = source[i];
            if (inString) {
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === quote) { inString = false; }
                continue;
            }
            if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
            if (ch === '{') { depth++; }
            else if (ch === '}') {
                depth--;
                if (depth === 0) return source.slice(start, i + 1);
            }
        }
        return null;
    }

    function safeEvalObjectLiteral(literal) {
        if (!literal) return null;
        try { return (new Function(`return (${literal});`)()); }
        catch (e) { return null; }
    }

    function tryExtract51jobDetailFromNuxt(html) {
        try {
            const nuxtIndex = html.indexOf('window.__NUXT__');
            if (nuxtIndex < 0) return null;

            const endIndex = html.indexOf('</script>', nuxtIndex);
            const nuxtSnippet = endIndex > -1 ? html.slice(nuxtIndex, endIndex + 9) : html.slice(nuxtIndex);

            const detailLiteral = extractObjectLiteralByKey(nuxtSnippet, 'detailJobInfo');
            if (!detailLiteral) return null;

            const detailObj = safeEvalObjectLiteral(detailLiteral);
            if (!detailObj || typeof detailObj !== 'object') return null;

            const desc = (detailObj.jobDescribe || '').replace(/\t\n/g, '\n').replace(/\t/g, ' ').replace(/\u002F/g, '/').trim();

            let salaryText = detailObj.provideSalaryString || '';
            if (!salaryText && detailObj.jobSalaryDown != null && detailObj.jobSalaryUp != null) {
                const fmt = n => n >= 10000 ? (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万' : (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + '千';
                salaryText = fmt(detailObj.jobSalaryDown) + '-' + fmt(detailObj.jobSalaryUp);
            }

            return { description: desc, salary: salaryText, education: detailObj.degreeString || '', workingExp: detailObj.workYearString || '' };
        } catch (e) { return null; }
    }

    function tryExtract51jobDetailFromJsonLd(html) {
        try {
            const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
            for (const match of matches) {
                try {
                    const parsed = JSON.parse(match[1]);
                    const nodes = Array.isArray(parsed) ? parsed : (parsed && parsed['@graph'] ? parsed['@graph'] : [parsed]);

                    for (const node of nodes) {
                        if (!node || typeof node !== 'object') continue;
                        const desc = (node.description || '').replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

                        let salaryText = '';
                        if (node.baseSalary && node.baseSalary.value) {
                            const v = node.baseSalary.value;
                            const unit = v.unitText || '月薪';
                            if (v.minValue != null && v.maxValue != null) {
                                const fmt = n => n >= 10000 ? (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万' : (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
                                salaryText = fmt(v.minValue) + ' - ' + fmt(v.maxValue) + '·' + unit;
                            }
                        }

                        if (desc || salaryText || node.educationRequirements || node.experienceRequirements) {
                            return { description: desc, salary: salaryText, education: node.educationRequirements || '', workingExp: node.experienceRequirements || '' };
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    function fetch51jobDetail(url) {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: { 'Accept': 'text/html' },
                    timeout: 8000,
                    onload: (res) => {
                        try {
                            const html = res.responseText || '';
                            const nuxtDetail = tryExtract51jobDetailFromNuxt(html);
                            if (nuxtDetail) return resolve(nuxtDetail);

                            const ldDetail = tryExtract51jobDetailFromJsonLd(html);
                            if (ldDetail) return resolve(ldDetail);

                            console.warn('🤖 [51job] 详情提取失败，__NUXT__ 和 JSON-LD 均未命中，URL:', url);
                            resolve(null);
                        } catch (e) { resolve(null); }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null),
                });
            } catch (e) { resolve(null); }
        });
    }

    // 通用的岗位详情获取分发器：根据平台调用对应的详情 API
    async function fetchJobDetail(platformName, jobEl, jobInfo) {
        try {
            if (platformName === '智联招聘') {
                const zpNumber = extractZhaopinNumber(jobEl);
                if (zpNumber) return await fetchZhaopinDetail(zpNumber);
            } else if (platformName === '前程无忧') {
                const url = extract51jobUrl(jobEl);
                if (url) return await fetch51jobDetail(url);
            }
        } catch (e) { /* 获取详情失败不影响主流程 */ }
        return null;
    }

    function testBackendConnection(url, cb) {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url.replace(/\/$/, '') + '/stats/overview',
                timeout: 4000,
                onload: (res) => cb(res.status >= 200 && res.status < 300, res.status),
                onerror: () => cb(false),
                ontimeout: () => cb(false),
            });
        } catch (e) { cb(false); }
    }

    // 根据文本关键词查找按钮。优先找<button>/<div>，跳过<a>链接以防止页面跳转。
    // 如果找不到非链接按钮，再用<a>兜底（但会标记为链接类型）。
    function findButtonByText(container, keywords) {
        const isVisible = el => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
        const hasKeyword = el => {
            const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
            return text && keywords.some(k => text.includes(k));
        };
        const isDisabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true' || String(el.className).includes('disabled');

        // 第一轮：只找<button>和<div/span>按钮元素，排除<a>链接
        const preferred = container.querySelectorAll('button, [role="button"], div[class*="btn"], span[class*="btn"], div[class*="apply"], span[class*="apply"], div[class*="delivery"], span[class*="delivery"]');
        for (const el of preferred) {
            if (hasKeyword(el) && isVisible(el) && !isDisabled(el)) return el;
        }
        // 第二轮：<a>标签兜底，但只在不可跳过时才使用（此处仅返回，调用方会检测）
        const anchorFallback = container.querySelectorAll('a');
        for (const el of anchorFallback) {
            if (hasKeyword(el) && isVisible(el) && !isDisabled(el)) return el;
        }
        // 第三轮：任何剩余元素
        const candidates = container.querySelectorAll('*');
        for (const el of candidates) {
            if (hasKeyword(el) && isVisible(el) && !isDisabled(el) &&
                ['button','a','div','span','input'].includes(el.tagName.toLowerCase())) return el;
        }
        return null;
    }

    function findApplyButton(container, selectors, keywords, requireKeyword = false) {
        const isVisible = el => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
        const isDisabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true' || String(el.className).includes('disabled');
        const hasKeyword = el => {
            const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
            return text && keywords.some(k => text.includes(k));
        };

        for (const sel of selectors) {
            const matches = container.querySelectorAll(sel);
            for (const el of matches) {
                if (isVisible(el) && !isDisabled(el) && (!requireKeyword || hasKeyword(el))) return el;
            }
        }
        return findButtonByText(container, keywords);
    }

    function triggerHumanClick(el) {
        if (!el) return;
        const restoreAttrs = [];
        if (el.tagName === 'A') {
            const href = el.getAttribute('href');
            const target = el.getAttribute('target');
            if (href) {
                restoreAttrs.push(() => el.setAttribute('href', href));
                el.removeAttribute('href');
            }
            if (target) {
                restoreAttrs.push(() => el.setAttribute('target', target));
                el.removeAttribute('target');
            }
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const eventView = el.ownerDocument?.defaultView || window;

        if (typeof PointerEvent !== 'undefined') {
            try {
                ['pointerover', 'pointerenter', 'pointerdown', 'pointerup'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, {
                        bubbles: true, cancelable: true, view: eventView,
                        pointerType: 'mouse', pointerId: 1, isPrimary: true,
                        clientX, clientY,
                    }));
                });
            } catch (e) {
                console.warn('🤖 PointerEvent 触发失败，已降级为 MouseEvent:', e.message);
            }
        }
        ['mouseover', 'mouseenter', 'mousedown', 'mouseup'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: eventView,
                button: 0, buttons: type === 'mousedown' ? 1 : 0,
                clientX, clientY,
            }));
        });
        if (typeof el.click === 'function') el.click();
        if (restoreAttrs.length > 0) setTimeout(() => restoreAttrs.forEach(fn => fn()), 200);
    }

    // ---- 已投递记录 ----
    // 去重键使用「岗位名+公司名」而不是仅岗位名，避免不同公司发布同名岗位时被误判为重复
    function makeJobKey(name, company) { return `${name}__${company || ''}`; }
    function getApplied() {
        try { return JSON.parse(GM_getValue('zpm_applied_set', '[]')); } catch { return []; }
    }
    function saveAppliedRecord(name, company, score, matched) {
        if (!CONFIG.saveApplied) return;
        const list = getApplied();
        const key = makeJobKey(name, company);
        if (!list.find(x => makeJobKey(x.name, x.company) === key)) {
            list.push({ name, company: company || '', score: score || 0, matched: matched || [], time: new Date().toISOString() });
            GM_setValue('zpm_applied_set', JSON.stringify(list));
        }
    }
    function isApplied(name, company) {
        if (!CONFIG.saveApplied) return false;
        const key = makeJobKey(name, company);
        return getApplied().some(x => makeJobKey(x.name, x.company) === key);
    }

    // ---- 每日限额 ----
    function todayStr() { return new Date().toISOString().slice(0, 10); }
    function getDailyStats() {
        let s;
        try { s = JSON.parse(GM_getValue('zpm_daily_stats', '{}')); } catch { s = {}; }
        if (!s.date || s.date !== todayStr()) s = { date: todayStr(), count: 0 };
        return s;
    }
    function incrementDaily() {
        const s = getDailyStats();
        s.count += 1;
        GM_setValue('zpm_daily_stats', JSON.stringify(s));
        return s.count;
    }
    function remainingToday() { return Math.max(0, CONFIG.dailyLimit - getDailyStats().count); }

    // ---- 投递历史（按天，用于统计图表）----
    function getHistory() {
        try { return JSON.parse(GM_getValue('zpm_history_v5', '{}')); } catch { return {}; }
    }
    function recordHistory(score) {
        const hist = getHistory();
        const d = todayStr();
        if (!hist[d]) hist[d] = { count: 0, totalScore: 0 };
        hist[d].count++;
        hist[d].totalScore += score;
        GM_setValue('zpm_history_v5', JSON.stringify(hist));
    }
    function getSkillFrequency() {
        const list = getApplied();
        const freq = {};
        list.forEach(x => (x.matched || []).forEach(s => { freq[s] = (freq[s] || 0) + 1; }));
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }

    // ---- 断点续投状态 ----
    function saveRunState(siteName, target, completed) {
        GM_setValue('zpm_run_state', JSON.stringify({ site: siteName, target, completed, ts: Date.now() }));
    }
    function clearRunState() { GM_setValue('zpm_run_state', '{}'); }
    function getRunState() {
        try {
            const s = JSON.parse(GM_getValue('zpm_run_state', '{}'));
            if (s.ts && Date.now() - s.ts < 60 * 60 * 1000 && s.completed < s.target) return s;
        } catch (e) {}
        return null;
    }

    // 清理职位描述文本，去除常见的UI元素和无关文字
    function cleanDescription(text) {
        if (!text) return '';
        // 去除常见UI元素
        const uiPatterns = [
            /去聊聊/g, /微信扫码与我聊聊吧/g, /投递/g, /收藏/g,
            /在线\s*\d*分钟前回复/g, /今日回复\d+次/g,
            /刚刚活跃/g, /\d+分钟前活跃/g, /\d+小时前活跃/g,
            /去APP沟通/g, /立即沟通/g, /查看详情/g,
            /微信扫码/g, /扫码投递/g, /一键投递/g,
        ];
        let cleaned = text;
        for (const pattern of uiPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }
        // 去除多余空白
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    // ---- 黑名单 / 红旗关键词 ----
    function isBlacklisted(name, company, fullText) {
        const hay = `${name} ${company} ${fullText}`;
        if (CONFIG.blacklistCompanies.some(c => c && company && company.includes(c))) return true;
        if (CONFIG.blacklistKeywords.some(k => k && hay.includes(k))) return true;
        return false;
    }
    function hasNegativeSignal(fullText) {
        return CONFIG.negativeSignals.some(k => k && fullText.includes(k));
    }

    // ---- 薪资解析 ----
    function parseSalary(text) {
        if (!text) return null;
        if (text.includes('面议')) return { negotiable: true };

        // 优先匹配 "X-Y万" 或 "X-Y千" 格式（如 "8千-1.2万", "1-1.6万", "1.5-2.5万"）
        const mWan = text.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*万/);
        if (mWan) {
            const low = parseFloat(mWan[1]);
            const high = parseFloat(mWan[2]);
            // 判断是"千"还是"万"：如果第一个数小于10且文本中有"千"，则是千
            const hasQian = text.includes('千');
            if (hasQian && low < 10) {
                return { low: Math.round(low * 1000), high: Math.round(high * 10000), negotiable: false };
            }
            return { low: Math.round(low * 10000), high: Math.round(high * 10000), negotiable: false };
        }

        // 匹配 "X-Y千" 格式
        const mQian = text.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*千/);
        if (mQian) {
            return { low: Math.round(parseFloat(mQian[1]) * 1000), high: Math.round(parseFloat(mQian[2]) * 1000), negotiable: false };
        }

        // 匹配 "X-YK" 格式（如 "8-12K", "8.5-12.5K"）
        const mK = text.match(/(\d+(?:\.\d+)?)\s*[-~到至]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
        if (mK) return { low: Math.round(parseFloat(mK[1]) * 1000), high: Math.round(parseFloat(mK[2]) * 1000), negotiable: false };

        // 匹配纯数字格式 "8000-12000"（要求是合理的薪资范围，排除公司人数等）
        const mNum = text.match(/(\d{4,6})\s*[-~到至]\s*(\d{4,6})/);
        if (mNum) {
            const low = parseInt(mNum[1]);
            const high = parseInt(mNum[2]);
            // 合理薪资范围：最低不低于2000，最高不超过100万
            if (low >= 2000 && high <= 1000000 && high > low) {
                return { low, high, negotiable: false };
            }
        }

        return null;
    }
    function salaryOk(text) {
        const sal = parseSalary(text);
        if (!sal) return !CONFIG.skipIfSalaryUnknown;
        if (sal.negotiable) return !CONFIG.skipIfSalaryUnknown;
        return sal.high >= CONFIG.expectedSalary[0] && sal.low <= CONFIG.expectedSalary[1] * 1.5;
    }

    // ---- 经验要求解析 ----
    // 优先在"经验"关键词附近截取一小段文本再解析，减少被无关数字（薪资、地址等）误命中的概率
    function parseExperienceRequirement(text) {
        if (!text) return null;
        const idx = text.indexOf('经验');
        const scope = idx >= 0 ? text.slice(Math.max(0, idx - 6), idx + 14) : text;

        if (scope.includes('经验不限') || scope.includes('不限经验')) return { min: 0, max: 99 };
        if (scope.includes('应届') || scope.includes('无经验')) return { min: 0, max: 0 };

        let m = scope.match(/(\d+)\s*[-~到至]\s*(\d+)\s*年/);
        if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
        m = scope.match(/(\d+)\s*年以上/);
        if (m) return { min: parseInt(m[1]), max: 99 };
        m = scope.match(/(\d+)\s*年以下/);
        if (m) return { min: 0, max: parseInt(m[1]) };

        // 兜底：全文匹配（应对"经验"关键词与年限描述距离较远的排版）
        if (idx < 0) {
            m = text.match(/(\d+)\s*[-~到至]\s*(\d+)\s*年经验/) || text.match(/(\d+)\s*[-~到至]\s*(\d+)\s*年/);
            if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
        }
        return null;
    }
    function experienceOk(text) {
        const req = parseExperienceRequirement(text);
        if (!req) return true; // 无法解析时不拦截，交给关键词/薪资等其它条件判断
        return req.min <= CONFIG.myYearsExperience + CONFIG.maxExperienceGap;
    }

    // ---- 技能匹配度（含分类统计）----
    function calcMatch(text) {
        if (!text) return { score: 0, matched: [], categoryScores: {} };
        const lower = text.toLowerCase();
        let total = 0, matchedW = 0, matched = [];
        const catTotal = {}, catMatched = {};

        for (const [skill, meta] of Object.entries(CONFIG.skills)) {
            const weight = typeof meta === 'number' ? meta : meta.weight;
            const category = typeof meta === 'number' ? '默认' : (meta.category || '默认');
            total += weight;
            catTotal[category] = (catTotal[category] || 0) + weight;

            const patterns = [skill.toLowerCase(), ...skill.toLowerCase().split(/[\/,，&]/).map(s => s.trim()).filter(s => s.length > 1)];
            const hit = patterns.some(p => lower.includes(p)) ||
                        skill.split(/[\s\/,，]/).some(k => k.length > 2 && lower.includes(k.toLowerCase()));
            if (hit) {
                matchedW += weight;
                matched.push(skill);
                catMatched[category] = (catMatched[category] || 0) + weight;
            }
        }

        const categoryScores = {};
        for (const cat of Object.keys(catTotal)) {
            categoryScores[cat] = Math.round(((catMatched[cat] || 0) / catTotal[cat]) * 100);
        }
        return { score: total > 0 ? Math.round((matchedW / total) * 100) : 0, matched, categoryScores };
    }

    // ---- 统一的岗位合规性判断（供所有平台引擎复用）----
    function evaluateJob(name, company, fullText, cityText) {
        if (!name) return { ok: false, reason: '解析失败' };
        if (isApplied(name, company)) return { ok: false, reason: '已投递过', skipType: 'applied' };
        if (remainingToday() <= 0) return { ok: false, reason: '今日限额已用完', hitLimit: true };
        if (isBlacklisted(name, company, fullText)) return { ok: false, reason: '命中黑名单', skipType: 'blacklist' };
        if (hasNegativeSignal(fullText)) return { ok: false, reason: '命中风险关键词', skipType: 'blacklist' };
        if (CONFIG.city && cityText && !cityText.includes(CONFIG.city)) return { ok: false, reason: `城市不匹配: ${cityText}` };
        const hasKeyword = CONFIG.jobKeywords.some(k => name.includes(k) || fullText.includes(k));
        if (!hasKeyword) return { ok: false, reason: '岗位不匹配' };
        if (!salaryOk(fullText)) return { ok: false, reason: '薪资不合适' };
        if (!experienceOk(fullText)) return { ok: false, reason: '经验要求过高' };
        return { ok: true };
    }

    // ---- CSV 导出 ----
    function exportCsv() {
        const list = getApplied();
        if (list.length === 0) { toast('暂无投递记录', 'info'); return; }
        const header = '岗位名称,公司,匹配度,匹配技能,投递时间\n';
        const rows = list.map(x =>
            `"${(x.name || '').replace(/"/g, '""')}","${(x.company || '').replace(/"/g, '""')}",${x.score || 0}%,"${(x.matched||[]).join('/')}","${x.time || ''}"`
        ).join('\n');
        const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `投递记录_${todayStr()}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast(`已导出 ${list.length} 条记录`, 'success');
    }

    // ============================================================
    // 平台配置（选择器为常见结构的最佳猜测；若某平台改版导致选择器失效，
    // 请用浏览器 F12 检查实际 class 名，替换下方数组中的对应项即可 —— 每项可写多个候选，脚本会依次尝试）
    // ============================================================
    const SITE_CONFIGS = {
        zhaopin: {
            name: '智联招聘',
            hostMatch: h => h.includes('zhaopin'),
            jobListSelectors: ['.positionlist__list .joblist-box__item', '.joblist-box .jobcard', '[class*="jobcard"]', '.job-item'],
            titleSelectors: ['.jobinfo__name', '[class*="job-name"]', 'a[class*="title"]'],
            citySelectors: ['.jobinfo__other-info-item span', '.jobinfo__other-info-item'],
            companySelectors: ['[class*="company-name"]', '[class*="companyName"]', 'a[class*="company"]'],
            // 注意：智联招聘的"立即投递"按钮在搜索结果页是<button>或<div>元素，不是<a>链接。
            // 如果选择器失效，请用 F12 检查实际 class 名。
            // 如果匹配到了<a>标签(岗位标题链接等)，点击会导致页面跳转，脚本就会中断！
            applyBtnSelectors: [
                'button.joblist-box__btn',
                '.joblist-box__btn',
                '.positionlist__item button',
                '.joblist-box__item button',
                '[class*="btn-apply"]',
                '[class*="btn-deliver"]',
                '[class*="deliver-btn"]',
                '[class*="apply"]',
                '[class*="delivery"]',
                '[class*="deliver"]',
                '.btn-primary',
                'button[class*="btn"]',         // 优先匹配<button>元素
                'div[class*="btn"]',            // 其次匹配<div>按钮
                'span[class*="btn"]',
                '.collect-and-apply__btn',      // 旧版类名保留
            ],
            // 智联招聘的投递按钮普遍使用这些关键词
            applyButtonText: ['立即投递', '投递', '申请', '立即申请'],
        },
        job51: {
            name: '前程无忧',
            hostMatch: h => h.includes('51job'),
            // 注意：51job 真实卡片容器是 .joblist-item-job-wrapper（内含标题、公司、投递按钮等全部信息）。
            // 之前用 [class*="joblist"] > div 这类宽泛选择器会匹配到卡片内部多个嵌套 div（标题行、信息行等），
            // 导致同一岗位被当成好几个不同岗位重复处理（重复徽章），且这些嵌套 div 内部找不到投递按钮。
            jobListSelectors: [
                '.joblist-item-job-wrapper',
                '.joblist-item-job',
                '.joblist .e', '.j_joblist > div', '.jobs-list-item',
            ],
            titleSelectors: ['.jname', '[class*="jname"]', 'a[title]', '[class*="job-title"]'],
            citySelectors: ['.d.at', '[class*="area"]', '[class*="job-area"]'],
            companySelectors: ['.cname', '[class*="cname"]', '[class*="company-name"]'],
            // 51job 的申请按钮是 <button class="btn apply ...">，已投递的会带 disabled 且文字变为"已申请"
            applyBtnSelectors: [
                'button.btn.apply',
                '.joblist-item-right button',
                'button[track-type="searchTrackButtonClick"]',
                '[class*="btn"][class*="apply"]',
                '[class*="apply"]', '[class*="delivery"]',
            ],
            applyButtonText: ['申请职位', '申请', '投递'],
            // 51job 翻页按钮是 Element-Plus 的 .el-pagination .btn-next，图标按钮，内部没有文字（仅 <i> 图标字体），
            // 常规的"按文字匹配下一页"逻辑永远匹配不到它，必须靠选择器直接定位。已到最后一页时按钮会带 disabled 属性。
            nextPageSelectors: [
                '.bottom-page .btn-next:not([disabled])',
                '.el-pagination .btn-next:not([disabled])',
                'button.btn-next:not([disabled])',
            ],
        },
        liepin: {
            name: '猎聘',
            hostMatch: h => h.includes('liepin'),
            jobListSelectors: ['.job-card-pc-container', '[class*="job-card"]', '.sojob-item-main'],
            titleSelectors: ['.job-title-box .job-title-text', '[class*="job-title"]', '.job-title'],
            citySelectors: ['[class*="area"]', '.condition-content'],
            companySelectors: ['[class*="company-name"]', '.company-name'],
            applyBtnSelectors: [
                'button[class*="apply"]', 'div[class*="apply"]', 'span[class*="apply"]',
                'button[class*="delivery"]', 'div[class*="delivery"]',
                '[class*="btn-apply"]', '[class*="btn-delivery"]',
                '[class*="apply"]', '[class*="delivery"]',
            ],
            // 注意：猎聘暂未拿到真实投递按钮的 HTML 样本核实，以下关键词为同类招聘平台的常见猜测，
            // 若实际测试中出现"未找到投递按钮"，请按 51job 的排查方式抓取真实卡片 HTML 后再调整。
            applyButtonText: ['投递简历', '立即沟通', '投递', '申请'],
        },
    };

    // ============================================================
    // 通用「列表投递」引擎工厂 —— 智联/前程无忧/猎聘 复用同一套逻辑
    // ============================================================
    function createListEngine(site) {
        return {
            name: site.name,
            running: false,
            completed: 0,
            target: 50,
            logs: [],
            lastScores: [],

            getJobs() {
                // 与 processJobCards()/applyFilter() 共用同一份"查找岗位卡片+过滤嵌套重复元素"逻辑，
                // 避免两处选择器/去重规则各自维护、逐渐产生差异（此前就是分别维护导致的重复计分问题的根源之一）。
                return getSiteJobCards(site);
            },

            getJobInfo(jobEl) {
                const pick = (selectors) => {
                    for (const sel of selectors) {
                        const el = jobEl.querySelector(sel);
                        if (el && el.textContent.trim()) return el;
                    }
                    return null;
                };
                const nameEl = pick(site.titleSelectors);
                const cityEl = pick(site.citySelectors);
                const companyEl = pick(site.companySelectors);
                // 优先用站点配置的关键词查找投递按钮
                const btnKeywords = site.applyButtonText || ['投递', '申请', '立即申请'];
                let applyBtn = findApplyButton(jobEl, site.applyBtnSelectors, btnKeywords, Boolean(site.applyButtonText));
                const fullText = jobEl.textContent || '';
                return {
                    name: nameEl ? nameEl.textContent.trim() : '',
                    city: cityEl ? cityEl.textContent.trim() : '',
                    company: companyEl ? companyEl.textContent.trim() : '',
                    fullText,
                    salary: parseSalary(fullText),
                    experience: parseExperienceRequirement(fullText),
                    applyBtn,
                };
            },

            // 检测元素是否为会导致页面跳转的<a>链接
            _isNavLink(el) {
                if (!el) return false;
                if (el.tagName === 'A') {
                    const text = (el.textContent || '').trim();
                    if (['投递', '申请', '沟通'].some(k => text.includes(k))) return false;
                    const href = el.getAttribute('href');
                    // 空href、#、javascript: 不会导航，其他href会跳转
                    if (href && href !== '#' && !href.startsWith('javascript:')) return true;
                }
                return false;
            },

            async applyOne(jobEl, jobInfo, match) {
                const verdict = evaluateJob(jobInfo.name, jobInfo.company, jobInfo.fullText, jobInfo.city);
                if (!verdict.ok) {
                    if (verdict.skipType === 'applied') jobEl.classList.add('zpm-job-applied');
                    else if (verdict.skipType === 'blacklist') jobEl.classList.add('zpm-job-blacklist');
                    else jobEl.style.opacity = '0.5';
                    return { success: false, reason: verdict.reason, hitLimit: verdict.hitLimit };
                }

                jobEl.classList.add('zpm-job-highlight');
                if (!jobInfo.applyBtn) {
                    // 调试辅助：找不到投递按钮时，把该岗位卡片的 HTML 片段打到控制台
                    try { console.warn(`🤖 [${site.name}] 未找到投递按钮，岗位卡片HTML片段：`, jobEl.outerHTML.slice(0, 800)); } catch (e) {}
                    return { success: false, reason: '未找到投递按钮' };
                }

                // ===== 关键修复：检测是否错误匹配到了链接元素 =====
                if (this._isNavLink(jobInfo.applyBtn)) {
                    const href = jobInfo.applyBtn.getAttribute('href');
                    console.warn(`🤖 [${site.name}] 检测到投递按钮是链接(<a href="${href}">)，点击会导致页面跳转，已跳过。`, 
                        '这通常是 applyBtnSelectors 选择器失效导致的，请用 F12 检查实际按钮类名后修改脚本。');
                    try { console.warn(`🤖 岗位卡片HTML：`, jobEl.outerHTML.slice(0, 800)); } catch (e) {}
                    return { success: false, reason: '按钮是链接,会被跳转' };
                }

                // ===== beforeunload 守护：在点击前保存状态，防止页面意外跳转 =====
                let navGuardFired = false;
                const beforeUnloadHandler = () => {
                    navGuardFired = true;
                    saveRunState(this.name, this.target, this.completed);
                };
                window.addEventListener('beforeunload', beforeUnloadHandler);

                let attempts = CONFIG.retryOnFail ? CONFIG.retryTimes : 1;
                for (let i = 0; i < attempts; i++) {
                    try {
                        // 先保存记录（防止点击后页面跳转导致来不及保存）
                        const appliedAlready = isApplied(jobInfo.name, jobInfo.company);
                        if (!appliedAlready) {
                            saveAppliedRecord(jobInfo.name, jobInfo.company, match.score, match.matched);
                        }

                        // 智联新版页面可能只响应 pointer 事件或原生 click，这里按真实鼠标点击顺序触发。
                        triggerHumanClick(jobInfo.applyBtn);
                        await delay(jitter(1200));

                        // 如果触发了页面跳转，navGuardFired 会被 beforeunload 设为 true
                        if (navGuardFired) {
                            window.removeEventListener('beforeunload', beforeUnloadHandler);
                            // 已保存状态，页面即将跳转，让 run() 循环自然结束
                            return { success: true, reason: '已投递(页面将跳转)' };
                        }

                        // 检测按钮是否变为"已投递"（智联招聘会改变按钮文字）
                        const btnTextAfter = (jobInfo.applyBtn.textContent || '').trim();
                        if (btnTextAfter.includes('已投递') || btnTextAfter.includes('已申请')) {
                            // 智联招聘已处理投递，但可能还有弹窗需要关闭
                            this.closeAllDialogs();
                        } else {
                            this.closeAllDialogs();
                            // 再等待一下，给弹窗动画一点时间
                            await delay(jitter(500));
                            this.closeAllDialogs();
                        }
                        saveAppliedRecord(jobInfo.name, jobInfo.company, match.score, match.matched);
                        recordHistory(match.score);
                        // 尝试通过平台详情 API 获取完整职位描述和薪资
                        let detailDesc = cleanDescription(jobInfo.fullText);
                        let detailSalary = jobInfo.salary;
                        let detailExperience = jobInfo.experience;
                        const detail = await fetchJobDetail(this.name, jobEl, jobInfo);
                        if (detail) {
                            if (detail.description) detailDesc = detail.description;
                            if (detail.salary) detailSalary = detail.salary;
                            if (detail.workingExp) detailExperience = detail.workingExp;
                            console.log(`🤖 [${this.name}] 详情提取成功:`, { descLen: detailDesc.length, salary: detailSalary, exp: detailExperience });
                        } else {
                            console.warn(`🤖 [${this.name}] 详情提取失败，使用卡片文本作为描述`);
                        }
                        pushToBackend({ name: jobInfo.name, company: jobInfo.company, score: match.score, matched: match.matched, city: jobInfo.city, salary: detailSalary, experience: detailExperience, description: detailDesc }, this.name);
                        this.completed++;
                        incrementDaily();
                        this.lastScores.push(match.score);
                        this.lastProgressTime = Date.now();
                        saveRunState(this.name, this.target, this.completed);
                        window.removeEventListener('beforeunload', beforeUnloadHandler);
                        return { success: true, reason: '已投递' };
                    } catch (e) {
                        if (i === attempts - 1) {
                            window.removeEventListener('beforeunload', beforeUnloadHandler);
                            return { success: false, reason: `点击失败: ${e.message}` };
                        }
                        await delay(500);
                    }
                }
            },

            async goNextPage() {
                this.closeAllDialogs();
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                await delay(jitter(800));

                // 优先使用站点专属的翻页选择器（选择器已经足够精确，不要求按钮内有文字）。
                // 这是为了兼容像 51job 这样用图标字体做"下一页"按钮、按钮内没有任何文本内容的分页组件——
                // 纯文字匹配的通用逻辑永远无法命中这类按钮。
                if (site.nextPageSelectors && site.nextPageSelectors.length > 0) {
                    for (const sel of site.nextPageSelectors) {
                        try {
                            const btn = document.querySelector(sel);
                            if (btn && btn.offsetParent !== null) {
                                btn.click();
                                this.addLog('📄 翻到下一页', 'info');
                                await delay(jitter(2500));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                await delay(500);
                                return true;
                            }
                        } catch (e) {}
                    }
                    // 如果配置了专属选择器但都没找到可点击的按钮，大概率已经是最后一页（按钮带 disabled 被 :not([disabled]) 排除），
                    // 直接返回 false，不再继续走通用文字匹配兜底逻辑，避免误触发页面上其它含有"下一页"字样但无关的元素。
                    return false;
                }

                const selectors = [
                    '.btn.soupager__btn:not([disabled])', '.soupager__btn:not([disabled])',
                    '[class*="pager"] [class*="next"]:not([disabled])', '[class*="pagination"] [class*="next"]:not(.disabled)',
                    '[class*="page"] [class*="next"]:not([disabled])', '.page-next:not(.disabled)',
                    'a.next:not(.disabled)', 'button.next:not([disabled])',
                    '[class*="nextPage"]:not([disabled])', '[class*="next-page"]:not([disabled])', '[class*="btnNext"]:not([disabled])',
                    'a:not([disabled]):not(.disabled)', 'button:not([disabled]):not(.disabled)',
                ];
                for (const sel of selectors) {
                    const btns = document.querySelectorAll(sel);
                    for (const btn of btns) {
                        const text = btn.textContent.trim();
                        if (text.includes('下一页') || text.includes('next') || text === '›' || text === '»' || text === '>') {
                            if (btn.offsetParent !== null) {
                                btn.click();
                                this.addLog(`📄 翻到下一页`, 'info');
                                await delay(jitter(2500));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                await delay(500);
                                return true;
                            }
                        }
                    }
                }
                const allElements = document.querySelectorAll('a, button, span, div');
                for (const el of allElements) {
                    const text = el.textContent.trim();
                    if ((text.includes('下一页') || text === '›' || text === '»') && el.offsetParent !== null) {
                        const clickable = el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick || el.closest('a') || el.closest('button');
                        if (clickable) {
                            el.click();
                            this.addLog('📄 翻到下一页 (兜底匹配)', 'info');
                            await delay(jitter(2500));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            await delay(500);
                            return true;
                        }
                    }
                }
                return false;
            },

            closeAllDialogs() {
                const clickVisibleButtonByText = (selectors, keywords) => {
                    for (const sel of selectors) {
                        try {
                            const buttons = document.querySelectorAll(sel);
                            for (const btn of buttons) {
                                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
                                if (btn.offsetParent !== null && keywords.some(k => text.includes(k))) {
                                    btn.click();
                                    return true;
                                }
                            }
                        } catch (e) {}
                    }
                    return false;
                };

                // 先处理智联可能出现的确认投递弹窗。
                clickVisibleButtonByText([
                    '.passport-dialog__confirm', '.dialog-confirm', '.modal-confirm',
                    '.lp-modal-confirm', '.a-dialog button', '.ivu-modal button',
                    '[class*="dialog"] button', '[class*="modal"] button', 'button.btn-primary',
                ], ['确认', '确定', '投递', '提交', '继续']);

                // 再关闭投递成功/申请成功弹窗。
                clickVisibleButtonByText([
                    '[class*="dialog"] [class*="close"]', '[class*="modal"] [class*="close"]',
                    '[class*="popup"] [class*="close"]', '.dialog-close', '.modal-close',
                    '.popup-close', '.icon-close', '.btn-close',
                    'button[aria-label="关闭"]', 'button[aria-label="close"]',
                ], ['关闭', '×', 'close', 'Close', '']);

                const closeSelectors = [
                    '[class*="dialog"] [class*="close"]', '[class*="modal"] [class*="close"]', '[class*="popup"] [class*="close"]',
                    '[class*="dialog"] [class*="cancel"]', '[class*="modal"] [class*="cancel"]',
                    '.layui-layer-close', '[class*="layer"] [class*="close"]', '[class*="closeBtn"]', '[class*="btn-close"]',
                    '[class*="mask"]', '[class*="overlay"]',
                    // 智联招聘特定弹窗选择器
                    '.a-dialog__close', '[class*="dialog__close"]', '[class*="ivu-modal-close"]',
                    '[class*="ivu-modal-wrap"] [class*="ivu-modal-close"]',
                    '.zp-alert-box__header img', '[class*="zp-alert-box__btn_cancel"]',
                    '[class*="zp-alert-box__btn"]',
                    '.p_dialog-national__close',
                    '.resume-multiple-area .mask',
                    '.job-apply-workflow-close [class*="close"]',
                    // 通用的关闭按钮
                    '[aria-label="Close"]', '[aria-label="关闭"]',
                ];
                closeSelectors.forEach(sel => {
                    try { document.querySelectorAll(sel).forEach(el => { if (el.offsetParent !== null) el.click(); }); } catch (e) {}
                });
                // 探测当前页面上"看起来像"弹窗/模态框的可见容器，后续的自动勾选、自动确认操作都限定在这些容器内部，
                // 不再对整个页面生效——避免误触发列表页上无关的筛选复选框、分类链接等。
                const dialogContainerSelectors = [
                    '[class*="dialog"]', '[class*="modal"]', '[class*="popup"]',
                    '[class*="layer"]', '[role="dialog"]', '[class*="a-dialog"]',
                    '.el-dialog', '.el-message-box', '[class*="alert-box"]',
                ];
                const dialogContainers = [];
                dialogContainerSelectors.forEach(sel => {
                    try {
                        document.querySelectorAll(sel).forEach(el => {
                            if (el.offsetParent !== null && !dialogContainers.includes(el)) dialogContainers.push(el);
                        });
                    } catch (e) {}
                });

                // 自动勾选弹窗内的确认类复选框（如"同意投递协议"），限定在弹窗容器内部，不影响列表页的筛选复选框
                dialogContainers.forEach(container => {
                    try {
                        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            if (!cb.checked && cb.offsetParent !== null) {
                                cb.checked = true;
                                cb.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        });
                    } catch (e) {}
                });

                // ===== 关键修复（原 bug）=====
                // 之前这里用 document.querySelectorAll('[class*="submit"],[class*="confirm"],[class*="primary"]')
                // 在整个页面范围内查找并点击，而不是限定在弹窗容器内部。由于很多平台的"提交/确认/主按钮"类名
                // 与页面导航锚点（<a class="xxx-primary">之类的分类/筛选链接）共用相似的 class 命名模式，
                // 导致这里误触发了并非弹窗内的<a>链接，页面被意外跳转，脚本随之中断（此问题最早在智联招聘上复现）。
                // 修复方式：只在上面探测到的弹窗容器内部查找确认类按钮，并且明确排除<a>标签
                // （无论它是否在弹窗内，都不通过这里点击，导航类操作一律不在自动确认范围内）。
                dialogContainers.forEach(container => {
                    try {
                        const candidates = container.querySelectorAll('[class*="submit"],[class*="confirm"],[class*="primary"]');
                        candidates.forEach(btn => {
                            if (btn.tagName === 'A') return; // 绝不通过这里点击<a>标签，防止页面跳转
                            if (btn.offsetParent !== null) setTimeout(() => btn.click(), 100);
                        });
                    } catch (e) {}
                });
            },

            async run(targetCount, resumeCompleted) {
                this.running = true;
                this.completed = resumeCompleted || 0;
                this.target = targetCount || CONFIG.deliverCount;
                this.logs = [];
                this.lastScores = [];
                this.lastProgressTime = Date.now();
                const runStartTime = Date.now();

                // 检测是否在岗位搜索结果页（而不是详情页）
                const jobs = this.getJobs();
                if (jobs.length === 0) {
                    this.addLog(`⚠ 未找到岗位列表 — 这可能是平台页面非搜索结果页，或者选择器不匹配`, 'error');
                    this.addLog(`💡 请确保在岗位搜索结果页面运行脚本（sou.zhaopin.com 搜索列表页）`, 'info');
                    this.running = false;
                    updateUI(this);
                    return;
                }

                this.addLog(`🚀 ${this.name} 自动投递启动`, 'info');
                this.addLog(`📅 今日剩余额度: ${remainingToday()} / ${CONFIG.dailyLimit}`, 'info');

                while (this.running && this.completed < this.target) {
                    if (remainingToday() <= 0) {
                        this.addLog('🛑 今日投递限额已用完，明天再来吧', 'error');
                        toast('今日限额已用完', 'error', 3000);
                        break;
                    }
                    // 稳定性看门狗：跑了一段时间仍然 0 投递，大概率是该页面选择器不匹配
                    if (this.completed === 0 && Date.now() - runStartTime > CONFIG.watchdogNoProgressMs) {
                        this.addLog('⏱ 长时间无成功投递，可能是页面结构与选择器不匹配，已自动停止', 'error');
                        toast('长时间无进展，已自动停止（请检查选择器）', 'error', 4000);
                        break;
                    }

                    const jobs = this.getJobs();
                    if (jobs.length === 0) { this.addLog('⚠ 未找到岗位列表', 'error'); break; }
                    this.addLog(`📋 本页找到 ${jobs.length} 个岗位，按匹配度排序后投递`, 'info');

                    // 预先计算匹配度并按分数从高到低排序，优先投递高匹配岗位
                    const infos = jobs.map(el => {
                        const info = this.getJobInfo(el);
                        return { el, info, match: calcMatch(info.fullText) };
                    }).filter(x => x.info.name);
                    infos.sort((a, b) => b.match.score - a.match.score);

                    for (const { el, info, match } of infos) {
                        if (!this.running || this.completed >= this.target || remainingToday() <= 0) break;

                        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); await delay(jitter(300)); } catch (e) {}

                        const result = await this.applyOne(el, info, match);
                        if (result.success) {
                            this.addLog(`✅ [${this.completed}/${this.target}] ${info.name} (${match.score}%)`, 'success');
                            beep(880, 100);
                        } else if (result.reason && result.reason !== '城市不匹配' && result.reason !== '岗位不匹配') {
                            this.addLog(`⏭ ${info.name} - ${result.reason}`, 'skip');
                        }

                        updateUI(this);
                        updateCategoryBars(match.categoryScores);
                        await delay(jitter(CONFIG.batchInterval));
                    }

                    this.closeAllDialogs();
                    await delay(500);

                    if (this.running && this.completed < this.target && CONFIG.autoNextPage && remainingToday() > 0) {
                        const hasNext = await this.goNextPage();
                        if (!hasNext) { this.addLog('📭 已到最后一页', 'info'); break; }
                    } else break;
                }

                if (this.completed >= this.target) {
                    this.addLog(`🎉 达到目标！共投递 ${this.completed} 个岗位`, 'success');
                    toast(`🎉 投递完成！共 ${this.completed} 个`, 'success');
                    notifyDone(`本轮共投递 ${this.completed} 个岗位，达到目标。`);
                    beep(1200, 200);
                    clearRunState();
                } else {
                    this.addLog(`⏸ 已暂停，已投递 ${this.completed} 个`, 'info');
                    notifyDone(`本轮共投递 ${this.completed} 个岗位。`);
                }

                this.running = false;
                updateUI(this);
            },

            stop() { this.running = false; this.addLog('⏸ 已手动暂停', 'info'); },
            addLog(msg, type = 'info') { this.logs.push({ msg, type, time: new Date().toLocaleTimeString() }); renderLogs(this); }
        };
    }

    const ZhaopinEngine = createListEngine(SITE_CONFIGS.zhaopin);
    const Job51Engine = createListEngine(SITE_CONFIGS.job51);
    const LiepinEngine = createListEngine(SITE_CONFIGS.liepin);

    // ============================================================
    // Boss直聘引擎（沟通流程与列表投递不同，单独实现）
    // ============================================================
    const BossEngine = {
        name: 'Boss直聘',
        running: false,
        completed: 0,
        target: 50,
        logs: [],
        lastScores: [],

        async run(targetCount, resumeCompleted) {
            this.running = true;
            this.completed = resumeCompleted || 0;
            this.target = targetCount || CONFIG.deliverCount;
            this.logs = [];
            this.lastScores = [];
            const runStartTime = Date.now();

            this.addLog('🚀 Boss直聘模式启动', 'info');
            this.addLog(`📅 今日剩余额度: ${remainingToday()} / ${CONFIG.dailyLimit}`, 'info');
            toast('Boss直聘模式: 请在岗位搜索页运行', 'info', 3000);

            if (location.pathname === '/web/geek/chat') {
                this.addLog('💬 检测到聊天页面，请切换到岗位搜索页', 'skip');
                this.running = false; updateUI(this); return;
            }
            if (!location.pathname.includes('/jobs') && !location.pathname.includes('/geek/jobs')) {
                this.addLog('⚠ 请先到岗位搜索页再运行', 'error');
                this.running = false; updateUI(this); return;
            }

            let scrollTop = 0;

            while (this.running && this.completed < this.target) {
                if (remainingToday() <= 0) {
                    this.addLog('🛑 今日投递限额已用完', 'error');
                    toast('今日限额已用完', 'error', 3000);
                    break;
                }
                if (this.completed === 0 && Date.now() - runStartTime > CONFIG.watchdogNoProgressMs) {
                    this.addLog('⏱ 长时间无成功沟通，可能是页面结构变化，已自动停止', 'error');
                    break;
                }

                const jobs = document.querySelectorAll('.job-list-container .job-card-box');
                if (jobs.length === 0) { this.addLog('⚠ 未找到岗位卡片', 'error'); break; }
                this.addLog(`📋 本页 ${jobs.length} 个岗位`, 'info');

                for (const job of jobs) {
                    if (!this.running || this.completed >= this.target || remainingToday() <= 0) break;

                    job.click();
                    await delay(jitter(1500));

                    const name = job.querySelector('.job-name')?.textContent?.trim() || '';
                    const company = job.querySelector('[class*="company-name"]')?.textContent?.trim() || '';
                    const jobLocation = job.querySelector('.company-location')?.textContent?.trim() || '';
                    const fullText = job.textContent || '';
                    const salary = parseSalary(fullText);
                    const experience = parseExperienceRequirement(fullText);
                    const match = calcMatch(fullText);

                    const advance = () => { scrollTop += 80; window.scrollTo({ top: scrollTop, behavior: 'smooth' }); return delay(jitter(1000)); };

                    const verdict = evaluateJob(name, company, fullText, jobLocation);
                    if (!verdict.ok) { this.addLog(`⏭ ${name} - ${verdict.reason}`, 'skip'); await advance(); continue; }

                    const chatBtn = document.querySelector('a.op-btn.op-btn-chat');
                    if (!chatBtn || !chatBtn.textContent.includes('立即沟通')) { this.addLog(`⏭ ${name} - 无立即沟通按钮`, 'skip'); await advance(); continue; }

                    chatBtn.click();
                    await delay(jitter(1500));

                    // 尝试填入打招呼语（不自动发送，留给你确认后手动点发送）
                    const chatInput = document.querySelector('textarea[class*="input"], .chat-input, #chat-input, [contenteditable="true"]');
                    if (chatInput && CONFIG.greetingTemplate) {
                        try {
                            if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
                                chatInput.value = CONFIG.greetingTemplate;
                                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                            } else {
                                chatInput.textContent = CONFIG.greetingTemplate;
                            }
                            this.addLog('✉️ 已填入打招呼语，请确认后手动发送', 'info');
                        } catch (e) {}
                    }

                    const stayBtn = document.querySelector('a.default-btn.cancel-btn');
                    if (stayBtn && stayBtn.textContent.includes('留在')) stayBtn.click();

                    this.completed++;
                    incrementDaily();
                    this.lastScores.push(match.score);
                    saveAppliedRecord(name, company, match.score, match.matched);
                    recordHistory(match.score);
                    pushToBackend({ name, company, score: match.score, matched: match.matched, city: jobLocation, salary, experience, description: cleanDescription(fullText) }, this.name);
                    saveRunState(this.name, this.target, this.completed);
                    this.addLog(`✅ [${this.completed}/${this.target}] ${name} (${match.score}%)`, 'success');
                    beep(880, 100);
                    updateUI(this);
                    updateCategoryBars(match.categoryScores);

                    await advance();
                    await delay(jitter(CONFIG.batchInterval));
                }

                if (this.running && this.completed < this.target) {
                    scrollTop += 500;
                    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                    await delay(jitter(2000));
                }
            }

            if (this.completed >= this.target) {
                this.addLog(`🎉 达到目标！共投递 ${this.completed} 个`, 'success');
                toast(`🎉 投递完成！共 ${this.completed} 个`, 'success');
                notifyDone(`本轮共投递 ${this.completed} 个岗位，达到目标。`);
                beep(1200, 200);
                clearRunState();
            } else {
                notifyDone(`本轮共投递 ${this.completed} 个岗位。`);
            }

            this.running = false;
            updateUI(this);
        },

        stop() { this.running = false; this.addLog('⏸ 已手动暂停', 'info'); },
        addLog(msg, type = 'info') { this.logs.push({ msg, type, time: new Date().toLocaleTimeString() }); renderLogs(this); }
    };

    // ============================================================
    // UI
    // ============================================================
    function getEngine() {
        const host = location.host;
        if (SITE_CONFIGS.zhaopin.hostMatch(host)) return ZhaopinEngine;
        if (host.includes('zhipin')) return BossEngine;
        if (SITE_CONFIGS.job51.hostMatch(host)) return Job51Engine;
        if (SITE_CONFIGS.liepin.hostMatch(host)) return LiepinEngine;
        return null;
    }

    function createPanel() {
        if (document.getElementById('zpm-v5-panel')) return;
        const engine = getEngine();
        if (!engine) return;

        const daily = getDailyStats();
        const resumeState = CONFIG.resumeBannerEnabled ? getRunState() : null;
        const showResume = resumeState && resumeState.site === engine.name;

        const panel = document.createElement('div');
        panel.id = 'zpm-v5-panel';
        panel.innerHTML = `
            <div class="header" id="zpm-v5-drag">
                <h3>🤖 ${engine.name}自动投递</h3>
                <div class="header-actions">
                    <span class="icon-btn" id="zpm-v5-dashboard" title="打开管理后台">🌐</span>
                    <span class="icon-btn" id="zpm-v5-stats" title="统计图表">📊</span>
                    <span class="icon-btn" id="zpm-v5-settings" title="设置">⚙️</span>
                    <span class="icon-btn" id="zpm-v5-export" title="导出投递记录 CSV">📥</span>
                    <span class="icon-btn" id="zpm-v5-close" title="关闭">✕</span>
                </div>
            </div>
            <div class="body">
                ${showResume ? `
                <div class="zpm-resume-banner">
                    <span>检测到上次未完成投递：已投 ${resumeState.completed}/${resumeState.target}</span>
                    <button id="zpm-v5-resume-btn">继续</button>
                </div>` : ''}

                <div class="zpm-status-card">
                    <div class="zpm-status-grid">
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">状态</span>
                            <span class="zpm-status-value stopped" id="zpm-v5-status">就绪</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">今日已投</span>
                            <span class="zpm-status-value" id="zpm-v5-daily">${daily.count}/${CONFIG.dailyLimit}</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">本轮已投</span>
                            <span class="zpm-status-value" id="zpm-v5-count">0</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">本轮目标</span>
                            <span class="zpm-status-value" id="zpm-v5-target">${CONFIG.deliverCount}</span>
                        </div>
                    </div>
                    <div class="zpm-progress-bar"><div class="zpm-progress-fill" id="zpm-v5-progress"></div></div>
                    <div class="zpm-cat-bars" id="zpm-v5-catbars"></div>
                </div>

                <div class="zpm-filter-group">
                    <button class="zpm-filter-btn active" data-filter="all">全部</button>
                    <button class="zpm-filter-btn" data-filter="gt10" style="background:#52c41a;color:#fff;border-color:#52c41a;">&gt;10%</button>
                    <button class="zpm-filter-btn" data-filter="gt30">&gt;30%</button>
                    <button class="zpm-filter-btn" data-filter="gt50">&gt;50%</button>
                    <button class="zpm-filter-btn" data-filter="gt70">&gt;70%</button>
                    <button class="zpm-filter-btn" data-filter="salary">💰 薪资合适</button>
                </div>

                <div style="font-size:12px;color:#666;margin:6px 0;" id="zpm-v5-summary">
                    🎯 ${CONFIG.city} · ${CONFIG.jobKeywords.slice(0,3).join('/')} · ${CONFIG.expectedSalary[0]/1000}-${CONFIG.expectedSalary[1]/1000}K
                </div>

                <button class="zpm-toggle-btn start" id="zpm-v5-toggle">🚀 启动自动投递</button>
                <div class="zpm-mini-btn-row">
                    <div class="zpm-mini-btn" id="zpm-v5-refresh-cards">🔄 重新计算匹配度</div>
                </div>

                <div class="zpm-log-area" id="zpm-v5-logs">
                    <div style="color:#999;text-align:center;padding:20px 0;">等待启动...</div>
                </div>
            </div>
            <div class="zpm-footer">v7.0 · 经验/红旗关键词过滤 · 断点续投 · 可选同步后台 · 快捷键 Alt+S</div>
        `;
        document.body.appendChild(panel);

        document.getElementById('zpm-v5-close').onclick = () => panel.remove();
        document.getElementById('zpm-v5-dashboard').onclick = () => {
            const base = (CONFIG.backendUrl || '').replace(/\/api\/?$/, '');
            if (!base) { toast('请先在设置里填写后台地址', 'error'); return; }
            window.open(base, '_blank');
        };
        document.getElementById('zpm-v5-export').onclick = exportCsv;
        document.getElementById('zpm-v5-settings').onclick = openSettingsModal;
        document.getElementById('zpm-v5-stats').onclick = openStatsModal;
        document.getElementById('zpm-v5-refresh-cards').onclick = () => { processJobCards(true); toast('已重新计算匹配度', 'info'); };

        if (showResume) {
            // 续投按钮：手动点击继续
            let resumeBtn = document.getElementById('zpm-v5-resume-btn');
            resumeBtn.onclick = async () => {
                panel.querySelector('.zpm-resume-banner')?.remove();
                await engine.run(resumeState.target, resumeState.completed);
            };
            // 自动续投：2秒后自动开始（防止页面刚加载时DOM未稳定）
            setTimeout(() => {
                if (document.getElementById('zpm-v5-resume-btn')) {
                    document.getElementById('zpm-v5-resume-btn').click();
                }
            }, 2000);
        }

        let isDragging = false, ox, oy;
        const hdr = document.getElementById('zpm-v5-drag');
        hdr.onmousedown = e => { isDragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; };
        document.onmousemove = e => { if (isDragging) { panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; } };
        document.onmouseup = () => { isDragging = false; };

        panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(btn => {
            btn.onclick = () => {
                panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFilter(btn.dataset.filter);
            };
        });

        document.getElementById('zpm-v5-toggle').onclick = async () => {
            const eng = getEngine();
            if (!eng) return toast('不支持该网站', 'error');
            if (!eng.running) {
                if (remainingToday() <= 0) { toast('今日投递限额已用完', 'error', 3000); return; }
                await eng.run(CONFIG.deliverCount);
            } else {
                eng.stop();
                const t = document.getElementById('zpm-v5-toggle');
                t.textContent = '🚀 启动自动投递';
                t.className = 'zpm-toggle-btn start';
            }
        };

        document.addEventListener('keydown', zpmKeyHandler);
        processJobCards();
    }

    function zpmKeyHandler(e) {
        if (e.altKey && e.key.toLowerCase() === 's') {
            const btn = document.getElementById('zpm-v5-toggle');
            if (btn) btn.click();
        }
    }

    function updateUI(engine) {
        const statusEl = document.getElementById('zpm-v5-status');
        const countEl = document.getElementById('zpm-v5-count');
        const targetEl = document.getElementById('zpm-v5-target');
        const progressEl = document.getElementById('zpm-v5-progress');
        const toggleEl = document.getElementById('zpm-v5-toggle');
        const dailyEl = document.getElementById('zpm-v5-daily');
        if (!statusEl) return;

        if (engine.running) {
            statusEl.textContent = '运行中'; statusEl.className = 'zpm-status-value running';
            toggleEl.textContent = '⏹ 停止投递'; toggleEl.className = 'zpm-toggle-btn stop';
        } else {
            const limitHit = remainingToday() <= 0;
            statusEl.textContent = limitHit ? '限额已满' : (engine.completed > 0 ? '已完成' : '就绪');
            statusEl.className = 'zpm-status-value ' + (limitHit ? 'limit' : (engine.completed > 0 ? 'done' : 'stopped'));
            toggleEl.textContent = '🚀 启动自动投递'; toggleEl.className = 'zpm-toggle-btn start';
        }
        countEl.textContent = engine.completed;
        targetEl.textContent = engine.target;
        const pct = Math.min(100, Math.round((engine.completed / engine.target) * 100));
        progressEl.style.width = pct + '%';
        if (dailyEl) dailyEl.textContent = `${getDailyStats().count}/${CONFIG.dailyLimit}`;
    }

    function updateCategoryBars(categoryScores) {
        const box = document.getElementById('zpm-v5-catbars');
        if (!box || !categoryScores) return;
        const entries = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]).slice(0, 4);
        box.innerHTML = entries.map(([cat, pct]) => `
            <div class="zpm-cat-row">
                <span class="zpm-cat-name">${cat}</span>
                <span class="zpm-cat-track"><span class="zpm-cat-fill" style="width:${pct}%"></span></span>
                <span class="zpm-cat-pct">${pct}%</span>
            </div>
        `).join('');
    }

    function renderLogs(engine) {
        const logArea = document.getElementById('zpm-v5-logs');
        if (!logArea) return;
        const recent = engine.logs.slice(-20);
        logArea.innerHTML = recent.map(l =>
            `<div class="zpm-log-item zpm-log-${l.type}">[${l.time}] ${l.msg}</div>`
        ).join('') || '<div style="color:#999;text-align:center;">暂无日志</div>';
        logArea.scrollTop = logArea.scrollHeight;
    }

    // ---- 统计图表面板 ----
    function drawBarChart(canvas, labels, values, colorTop = '#165DFF', colorBottom = '#52c41a') {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const max = Math.max(1, ...values);
        const barW = w / labels.length;
        values.forEach((v, i) => {
            const barH = (v / max) * (h - 20);
            const grad = ctx.createLinearGradient(0, h - barH, 0, h);
            grad.addColorStop(0, colorTop); grad.addColorStop(1, colorBottom);
            ctx.fillStyle = grad;
            ctx.fillRect(i * barW + 2, h - barH - 14, barW - 4, barH);
            ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(v, i * barW + barW / 2, h - barH - 18 < 8 ? 10 : h - barH - 18);
            ctx.fillStyle = '#999';
            ctx.fillText(labels[i], i * barW + barW / 2, h - 2);
        });
    }

    function openStatsModal() {
        if (document.getElementById('zpm-modal-mask')) return;
        const hist = getHistory();
        const days = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push({ label: key.slice(5), count: (hist[key] && hist[key].count) || 0 });
        }
        const skillFreq = getSkillFrequency();
        const maxSkillCount = Math.max(1, ...skillFreq.map(x => x[1]));
        const totalApplied = getApplied().length;
        const avgScore = totalApplied > 0 ? Math.round(getApplied().reduce((s, x) => s + (x.score || 0), 0) / totalApplied) : 0;

        const mask = document.createElement('div');
        mask.id = 'zpm-modal-mask';
        mask.innerHTML = `
            <div id="zpm-modal-box">
                <h2>📊 投递统计</h2>
                <div class="zpm-stat-block">
                    <h4>累计投递 ${totalApplied} 个 · 平均匹配度 ${avgScore}%</h4>
                </div>
                <div class="zpm-stat-block">
                    <h4>近 14 天投递趋势</h4>
                    <canvas id="zpm-hist-canvas" width="400" height="140" style="width:100%;"></canvas>
                </div>
                <div class="zpm-stat-block">
                    <h4>高频匹配技能 Top 10</h4>
                    <div id="zpm-skill-list">
                        ${skillFreq.length === 0 ? '<div style="color:#999;">暂无数据</div>' : skillFreq.map(([s, c]) => `
                            <div class="zpm-skill-row">
                                <span class="zpm-skill-name">${s}</span>
                                <span class="zpm-skill-track"><span class="zpm-skill-fill" style="width:${(c/maxSkillCount)*100}%"></span></span>
                                <span class="zpm-skill-count">${c}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="zpm-set-actions">
                    <button class="zpm-set-cancel" id="zpm-stats-close-btn">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);
        mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
        document.getElementById('zpm-stats-close-btn').onclick = () => mask.remove();

        const canvas = document.getElementById('zpm-hist-canvas');
        drawBarChart(canvas, days.map(d => d.label), days.map(d => d.count));
    }

    // ---- 设置面板 ----
    function openSettingsModal() {
        if (document.getElementById('zpm-modal-mask')) return;
        const mask = document.createElement('div');
        mask.id = 'zpm-modal-mask';
        mask.innerHTML = `
            <div id="zpm-modal-box">
                <h2>⚙️ 投递设置</h2>

                <div class="zpm-set-group">
                    <label>目标城市</label>
                    <input type="text" id="zpm-set-city" value="${CONFIG.city}">
                </div>

                <div class="zpm-set-group">
                    <label>岗位关键词（逗号分隔）</label>
                    <textarea id="zpm-set-keywords">${CONFIG.jobKeywords.join(', ')}</textarea>
                </div>

                <div class="zpm-set-group">
                    <label>黑名单关键词（命中即跳过，逗号分隔）</label>
                    <textarea id="zpm-set-black-kw">${CONFIG.blacklistKeywords.join(', ')}</textarea>
                </div>

                <div class="zpm-set-group">
                    <label>黑名单公司（逗号分隔）</label>
                    <textarea id="zpm-set-black-co">${CONFIG.blacklistCompanies.join(', ')}</textarea>
                </div>

                <div class="zpm-set-group">
                    <label>风险/红旗关键词（逗号分隔，命中即跳过）</label>
                    <textarea id="zpm-set-neg">${CONFIG.negativeSignals.join(', ')}</textarea>
                    <div class="zpm-set-hint">例如"日结""押金""培训费"等常见风险岗位描述</div>
                </div>

                <div class="zpm-set-group">
                    <label>经验要求过滤</label>
                    <div class="zpm-set-row">
                        <div><input type="number" id="zpm-set-my-years" value="${CONFIG.myYearsExperience}"><div class="zpm-set-hint">我的工作年限</div></div>
                        <div><input type="number" id="zpm-set-gap" value="${CONFIG.maxExperienceGap}"><div class="zpm-set-hint">可接受超出年限</div></div>
                    </div>
                </div>

                <div class="zpm-set-group">
                    <label>期望薪资范围（元）</label>
                    <div class="zpm-set-row">
                        <div><input type="number" id="zpm-set-sal-low" value="${CONFIG.expectedSalary[0]}"></div>
                        <div><input type="number" id="zpm-set-sal-high" value="${CONFIG.expectedSalary[1]}"></div>
                    </div>
                    <div class="zpm-set-checkbox">
                        <input type="checkbox" id="zpm-set-skip-unknown" ${CONFIG.skipIfSalaryUnknown ? 'checked' : ''}>
                        <label style="margin:0;font-weight:400;">薪资"面议"或无法识别时跳过</label>
                    </div>
                </div>

                <div class="zpm-set-group">
                    <label>投递数量与节奏</label>
                    <div class="zpm-set-row">
                        <div><input type="number" id="zpm-set-target" value="${CONFIG.deliverCount}"><div class="zpm-set-hint">单轮目标</div></div>
                        <div><input type="number" id="zpm-set-daily" value="${CONFIG.dailyLimit}"><div class="zpm-set-hint">每日上限</div></div>
                        <div><input type="number" id="zpm-set-interval" value="${CONFIG.batchInterval}"><div class="zpm-set-hint">间隔(ms)</div></div>
                    </div>
                </div>

                <div class="zpm-set-group">
                    <label>Boss直聘打招呼语</label>
                    <textarea id="zpm-set-greeting">${CONFIG.greetingTemplate}</textarea>
                    <div class="zpm-set-hint">仅自动填入聊天框，不会自动发送，发送前你可以先检查修改</div>
                </div>

                <div class="zpm-set-group">
                    <div class="zpm-set-checkbox"><input type="checkbox" id="zpm-set-autopage" ${CONFIG.autoNextPage ? 'checked' : ''}><label style="margin:0;font-weight:400;">投完自动翻页</label></div>
                    <div class="zpm-set-checkbox"><input type="checkbox" id="zpm-set-retry" ${CONFIG.retryOnFail ? 'checked' : ''}><label style="margin:0;font-weight:400;">投递失败自动重试</label></div>
                    <div class="zpm-set-checkbox"><input type="checkbox" id="zpm-set-sound" ${CONFIG.soundEnabled ? 'checked' : ''}><label style="margin:0;font-weight:400;">投递成功提示音</label></div>
                    <div class="zpm-set-checkbox"><input type="checkbox" id="zpm-set-notify" ${CONFIG.notifyOnDone ? 'checked' : ''}><label style="margin:0;font-weight:400;">完成后桌面通知</label></div>
                    <div class="zpm-set-checkbox"><input type="checkbox" id="zpm-set-resume" ${CONFIG.resumeBannerEnabled ? 'checked' : ''}><label style="margin:0;font-weight:400;">支持断点续投提示</label></div>
                </div>

                <div class="zpm-set-group">
                    <label>管理后台同步（可选）</label>
                    <div class="zpm-set-checkbox">
                        <input type="checkbox" id="zpm-set-sync" ${CONFIG.syncEnabled ? 'checked' : ''}>
                        <label style="margin:0;font-weight:400;">投递成功后同步记录到本地管理后台</label>
                    </div>
                    <div class="zpm-set-row">
                        <div style="flex:2;"><input type="text" id="zpm-set-backend-url" value="${CONFIG.backendUrl}"></div>
                        <div><button type="button" class="zpm-mini-btn" id="zpm-set-test-conn" style="margin-top:0;">测试连接</button></div>
                    </div>
                    <div class="zpm-set-hint">需要先按 backend/README.md 启动本地后台服务（node server.js）</div>
                </div>

                <div class="zpm-set-group">
                    <label>技能库（JSON，weight 权重 1-10，category 分类）</label>
                    <textarea id="zpm-set-skills" style="min-height:120px;">${JSON.stringify(CONFIG.skills, null, 2)}</textarea>
                    <div class="zpm-set-hint">格式: {"Python": {"weight": 8, "category": "开发"}}</div>
                </div>

                <div class="zpm-set-actions">
                    <button class="zpm-set-cancel" id="zpm-set-cancel-btn">取消</button>
                    <button class="zpm-set-save" id="zpm-set-save-btn">保存并生效</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);
        mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
        document.getElementById('zpm-set-cancel-btn').onclick = () => mask.remove();

        document.getElementById('zpm-set-test-conn').onclick = () => {
            const url = document.getElementById('zpm-set-backend-url').value.trim();
            if (!url) { toast('请先填写后台地址', 'error'); return; }
            toast('正在连接...', 'info', 1500);
            testBackendConnection(url, (ok) => {
                toast(ok ? '✅ 连接成功' : '❌ 连接失败，请确认后台已启动', ok ? 'success' : 'error', 3000);
            });
        };

        document.getElementById('zpm-set-save-btn').onclick = () => {
            try {
                const skillsJson = JSON.parse(document.getElementById('zpm-set-skills').value);
                CONFIG.city = document.getElementById('zpm-set-city').value.trim();
                CONFIG.jobKeywords = document.getElementById('zpm-set-keywords').value.split(',').map(s => s.trim()).filter(Boolean);
                CONFIG.blacklistKeywords = document.getElementById('zpm-set-black-kw').value.split(',').map(s => s.trim()).filter(Boolean);
                CONFIG.blacklistCompanies = document.getElementById('zpm-set-black-co').value.split(',').map(s => s.trim()).filter(Boolean);
                CONFIG.negativeSignals = document.getElementById('zpm-set-neg').value.split(',').map(s => s.trim()).filter(Boolean);
                CONFIG.myYearsExperience = parseInt(document.getElementById('zpm-set-my-years').value) || 0;
                CONFIG.maxExperienceGap = parseInt(document.getElementById('zpm-set-gap').value) || 0;
                CONFIG.expectedSalary = [
                    parseInt(document.getElementById('zpm-set-sal-low').value) || 0,
                    parseInt(document.getElementById('zpm-set-sal-high').value) || 999999,
                ];
                CONFIG.skipIfSalaryUnknown = document.getElementById('zpm-set-skip-unknown').checked;
                CONFIG.deliverCount = parseInt(document.getElementById('zpm-set-target').value) || 50;
                CONFIG.dailyLimit = parseInt(document.getElementById('zpm-set-daily').value) || 30;
                CONFIG.batchInterval = parseInt(document.getElementById('zpm-set-interval').value) || 3000;
                CONFIG.greetingTemplate = document.getElementById('zpm-set-greeting').value;
                CONFIG.autoNextPage = document.getElementById('zpm-set-autopage').checked;
                CONFIG.retryOnFail = document.getElementById('zpm-set-retry').checked;
                CONFIG.soundEnabled = document.getElementById('zpm-set-sound').checked;
                CONFIG.notifyOnDone = document.getElementById('zpm-set-notify').checked;
                CONFIG.resumeBannerEnabled = document.getElementById('zpm-set-resume').checked;
                CONFIG.syncEnabled = document.getElementById('zpm-set-sync').checked;
                CONFIG.backendUrl = document.getElementById('zpm-set-backend-url').value.trim();
                CONFIG.skills = skillsJson;

                saveConfig(CONFIG);
                mask.remove();
                toast('设置已保存', 'success');

                const summary = document.getElementById('zpm-v5-summary');
                if (summary) summary.textContent = `🎯 ${CONFIG.city} · ${CONFIG.jobKeywords.slice(0,3).join('/')} · ${CONFIG.expectedSalary[0]/1000}-${CONFIG.expectedSalary[1]/1000}K`;
                const targetEl = document.getElementById('zpm-v5-target');
                if (targetEl) targetEl.textContent = CONFIG.deliverCount;
                processJobCards(true);
            } catch (e) {
                toast('技能库 JSON 格式错误: ' + e.message, 'error', 4000);
            }
        };
    }

    // ============================================================
    // 页面匹配度处理
    // ============================================================
    function getCurrentSite() {
        const host = location.host;
        if (SITE_CONFIGS.zhaopin.hostMatch(host)) return SITE_CONFIGS.zhaopin;
        if (SITE_CONFIGS.job51.hostMatch(host)) return SITE_CONFIGS.job51;
        if (SITE_CONFIGS.liepin.hostMatch(host)) return SITE_CONFIGS.liepin;
        return null;
    }

    // 根据站点选择器找到岗位卡片，并过滤掉被其他匹配元素包含的嵌套元素，
    // 只保留最外层卡片（否则同一岗位可能因选择器命中卡片内部多层 div 而被重复统计）
    function getSiteJobCards(site) {
        for (const sel of site.jobListSelectors) {
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length > 0) {
                return els.filter(el => !els.some(other => other !== el && other.contains(el)));
            }
        }
        return [];
    }

    function processJobCards(force = false) {
        let cards = [];
        if (location.host.includes('zhipin')) {
            cards = document.querySelectorAll('.job-card-box');
        } else {
            const site = getCurrentSite();
            if (site) cards = getSiteJobCards(site);
        }

        cards.forEach(card => {
            if (card.dataset.zpm5 === '1' && !force) return;
            card.dataset.zpm5 = '1';
            if (force) card.querySelectorAll('.zpm-badge, [data-zpm-applied-badge]').forEach(b => b.remove());

            const text = card.textContent || '';
            const result = calcMatch(text);
            const titleEl = card.querySelector('.jobinfo__name, .job-name, [class*="job-name"], [class*="jname"], [class*="job-title"], a[class*="title"], h3');
            const companyEl = card.querySelector('[class*="company-name"], [class*="companyName"], [class*="cname"], a[class*="company"]');
            const company = companyEl ? companyEl.textContent.trim() : '';

            if (result.score > 0 && titleEl) {
                const badge = document.createElement('span');
                badge.className = `zpm-badge ${result.score > 10 ? 'zpm-badge-high' : result.score >= 5 ? 'zpm-badge-mid' : 'zpm-badge-low'}`;
                badge.textContent = result.score + '%';
                badge.title = `匹配: ${result.matched.join(', ')}`;
                titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
                if (result.score > 10) card.classList.add('zpm-job-highlight');
            }

            const name = titleEl ? titleEl.textContent?.trim() : '';
            if (isBlacklisted(name, company, text) || hasNegativeSignal(text)) {
                card.classList.add('zpm-job-blacklist');
            }
            if (name && isApplied(name, company)) {
                card.classList.add('zpm-job-applied');
                const badge = document.createElement('span');
                badge.dataset.zpmAppliedBadge = '1';
                badge.style.cssText = 'display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;background:#999;color:#fff;margin-left:4px;';
                badge.textContent = '✅ 已投';
                if (titleEl) titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
            }
        });
    }

    function applyFilter(state) {
        let cards = [];
        if (location.host.includes('zhipin')) {
            cards = document.querySelectorAll('.job-card-box');
        } else {
            const site = getCurrentSite();
            if (site) cards = getSiteJobCards(site);
        }
        cards.forEach(card => {
            const badge = card.querySelector('.zpm-badge');
            let show = true;
            let score = 0;
            if (badge) { const m = badge.textContent.match(/(\d+)/); if (m) score = parseInt(m[1]); }
            if (state === 'gt10') show = score > 10;
            else if (state === 'gt30') show = score > 30;
            else if (state === 'gt50') show = score > 50;
            else if (state === 'gt70') show = score > 70;
            else if (state === 'salary') show = salaryOk(card.textContent || '');
            card.classList.toggle('zpm-job-hidden', !show);
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        const host = location.host;
        if (!getEngine()) return;

        createPanel();

        let timer;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => processJobCards(false), 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => processJobCards(false), 1000);
        console.log('🤖 自动投递助手 v7.1 已启动');
        console.log(`📍 ${CONFIG.city} · 🎯 每日上限 ${CONFIG.dailyLimit} · 今日已投 ${getDailyStats().count}`);
        console.log('快捷键: Alt+S 启动/停止 · 面板 📊 查看统计 · ⚙️ 修改设置');
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
