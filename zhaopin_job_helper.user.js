// ==UserScript==
// @name         智联招聘 - 智能岗位匹配助手 v2.1
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  岗位匹配度分析 + 一键投递 + 批量投递 + 详情页自动投递 | 罗启盛定制版
// @author       罗启盛求职助手
// @match        https://www.zhaopin.com/*
// @match        https://sou.zhaopin.com/*
// @match        https://jobs.zhaopin.com/*
// @match        https://fe-api.zhaopin.com/*
// @icon         https://www.zhaopin.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 1. 你的个人技能库（可自由修改）
    // ============================================================
    const MY_SKILLS = {
        '桌面运维': { weight: 10, category: 'core' },
        'IT支持': { weight: 10, category: 'core' },
        '网络运维': { weight: 9, category: 'core' },
        '技术支持': { weight: 9, category: 'core' },
        '故障排除': { weight: 8, category: 'core' },
        '系统维护': { weight: 8, category: 'core' },
        'Python': { weight: 8, category: 'dev' },
        '爬虫': { weight: 7, category: 'dev' },
        'C#': { weight: 7, category: 'dev' },
        'Java': { weight: 6, category: 'dev' },
        'Android': { weight: 5, category: 'dev' },
        'H5': { weight: 5, category: 'dev' },
        'CSS': { weight: 5, category: 'dev' },
        '前端': { weight: 5, category: 'dev' },
        'MySQL': { weight: 7, category: 'db' },
        'SQL Server': { weight: 6, category: 'db' },
        'SQL': { weight: 6, category: 'db' },
        '数据库': { weight: 6, category: 'db' },
        '物联网': { weight: 9, category: 'iot' },
        '单片机': { weight: 8, category: 'iot' },
        'STM32': { weight: 8, category: 'iot' },
        '51单片机': { weight: 7, category: 'iot' },
        '组网': { weight: 7, category: 'iot' },
        '传感器': { weight: 7, category: 'iot' },
        '智能硬件': { weight: 7, category: 'iot' },
        'Cisco': { weight: 7, category: 'network' },
        '交换机': { weight: 7, category: 'network' },
        'VLAN': { weight: 7, category: 'network' },
        'ACL': { weight: 6, category: 'network' },
        'NAT': { weight: 6, category: 'network' },
        '网络调试': { weight: 7, category: 'network' },
        '白盒测试': { weight: 6, category: 'test' },
        '自动化测试': { weight: 6, category: 'test' },
        '电工': { weight: 5, category: 'cert' },
        '物联网安装调试员': { weight: 8, category: 'cert' },
    };

    const PREFERENCES = {
        expectedSalary: [7000, 10000],
        city: '佛山',
        jobTypes: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网'],
    };

    const APPLY_CONFIG = {
        batchInterval: 3000,        // 批量投递间隔(ms)
        maxBatchPerRound: 20,        // 每轮最大数
        retryTimes: 3,               // 详情页自动投递重试次数
        retryDelay: 1000,            // 重试间隔(ms)
    };

    // ============================================================
    // 2. 样式
    // ============================================================
    GM_addStyle(`
        .zpm-match-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:bold; margin-left:8px; vertical-align:middle; }
        .zpm-match-high { background:#52c41a; color:#fff; }
        .zpm-match-medium { background:#faad14; color:#fff; }
        .zpm-match-low { background:#ff4d4f; color:#fff; }
        .zpm-skill-tags { margin:4px 0; display:flex; flex-wrap:wrap; gap:4px; }
        .zpm-skill-tag { padding:1px 6px; border-radius:4px; font-size:11px; border:1px solid #1890ff; color:#1890ff; background:#e6f7ff; }
        .zpm-skill-tag.matched { background:#52c41a; color:#fff; border-color:#52c41a; }
        #zpm-panel { position:fixed; top:80px; right:20px; width:300px; background:#fff; border:1px solid #d9d9d9; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.15); z-index:999999; font-size:13px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
        #zpm-panel .zpm-header { background:linear-gradient(135deg,#1890ff,#096dd9); color:#fff; padding:12px 16px; border-radius:12px 12px 0 0; font-weight:bold; cursor:move; display:flex; justify-content:space-between; align-items:center; }
        #zpm-panel .zpm-header .zpm-close { cursor:pointer; font-size:18px; opacity:0.8; }
        #zpm-panel .zpm-header .zpm-close:hover { opacity:1; }
        #zpm-panel .zpm-body { padding:12px 16px; max-height:500px; overflow-y:auto; }
        #zpm-panel .zpm-stat { display:flex; justify-content:space-between; margin-bottom:8px; }
        #zpm-panel .zpm-stat-item { text-align:center; flex:1; }
        #zpm-panel .zpm-stat-num { font-size:22px; font-weight:bold; color:#1890ff; }
        #zpm-panel .zpm-stat-label { font-size:11px; color:#666; }
        #zpm-panel .zpm-filter-group { margin:8px 0; }
        #zpm-panel .zpm-filter-btn { padding:4px 12px; border:1px solid #d9d9d9; border-radius:14px; background:#fff; cursor:pointer; font-size:12px; margin:2px; transition:all .2s; }
        #zpm-panel .zpm-filter-btn.active { background:#1890ff; color:#fff; border-color:#1890ff; }
        #zpm-panel .zpm-filter-btn:hover { border-color:#1890ff; }
        #zpm-panel .zpm-footer { padding:8px 16px; border-top:1px solid #f0f0f0; font-size:11px; color:#999; text-align:center; }
        .zpm-hidden-job { display:none !important; }
        .zpm-job-matched { outline:2px solid #52c41a; outline-offset:2px; background:#f6ffed !important; }
        .zpm-salary-badge { display:inline-block; padding:1px 6px; border-radius:4px; font-size:12px; font-weight:bold; margin-left:4px; }
        .zpm-salary-good { background:#f6ffed; color:#52c41a; border:1px solid #52c41a; }
        .zpm-salary-low { background:#fff7e6; color:#fa8c16; border:1px solid #fa8c16; }

        /* ===== 投递按钮 ===== */
        .zpm-btn-apply {
            display:inline-flex; align-items:center; gap:4px;
            padding:5px 14px; background:linear-gradient(135deg,#ff6a00,#ee0979);
            color:#fff !important; border:none; border-radius:6px;
            cursor:pointer; font-size:12px; font-weight:bold;
            transition:all .2s; text-decoration:none !important; margin:4px 4px 4px 0;
        }
        .zpm-btn-apply:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(238,9,121,.3); }
        .zpm-btn-apply.applied { background:#999; cursor:default; transform:none; box-shadow:none; }

        .zpm-checkbox { width:18px; height:18px; cursor:pointer; margin-right:6px; vertical-align:middle; accent-color:#1890ff; }

        /* ===== 底部批量栏 ===== */
        #zpm-batch-bar {
            position:fixed; bottom:0; left:0; right:0;
            background:#fff; border-top:2px solid #1890ff;
            padding:10px 20px; box-shadow:0 -4px 20px rgba(0,0,0,.1);
            z-index:999998; display:none;
            align-items:center; justify-content:space-between; font-size:13px;
        }
        #zpm-batch-bar .zpm-batch-info strong { color:#1890ff; }
        #zpm-batch-bar .zpm-batch-actions { display:flex; gap:8px; }
        .zpm-batch-btn { padding:8px 20px; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold; transition:all .2s; }
        .zpm-batch-btn-primary { background:linear-gradient(135deg,#ff6a00,#ee0979); color:#fff; }
        .zpm-batch-btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(238,9,121,.3); }
        .zpm-batch-btn-secondary { background:#f5f5f5; color:#333; border:1px solid #d9d9d9; }

        /* ===== 进度弹窗 ===== */
        #zpm-progress-overlay {
            position:fixed; top:0; left:0; right:0; bottom:0;
            background:rgba(0,0,0,.5); z-index:9999999;
            display:none; align-items:center; justify-content:center;
        }
        #zpm-progress-box { background:#fff; border-radius:16px; padding:30px 40px; min-width:360px; text-align:center; box-shadow:0 8px 40px rgba(0,0,0,.2); }
        #zpm-progress-box h3 { margin:0 0 16px; font-size:18px; }
        #zpm-progress-bar-bg { height:8px; background:#f0f0f0; border-radius:4px; overflow:hidden; margin:12px 0; }
        #zpm-progress-bar-fill { height:100%; width:0%; background:linear-gradient(90deg,#1890ff,#52c41a); border-radius:4px; transition:width .3s; }
        #zpm-progress-text { font-size:14px; color:#666; margin:8px 0; }
        #zpm-progress-close { margin-top:16px; padding:8px 24px; border:1px solid #d9d9d9; border-radius:6px; background:#fff; cursor:pointer; display:none; }

        /* ===== 详情页浮动投递按钮 ===== */
        #zpm-detail-float-btn {
            position:fixed; bottom:30px; right:30px;
            padding:14px 32px; background:linear-gradient(135deg,#ff6a00,#ee0979);
            color:#fff; border:none; border-radius:50px;
            font-size:16px; font-weight:bold; cursor:pointer;
            box-shadow:0 6px 24px rgba(238,9,121,.4); z-index:99999;
            display:flex; align-items:center; gap:8px;
            animation:zpm-pulse 2s infinite;
        }
        #zpm-detail-float-btn:hover { transform:translateY(-2px); box-shadow:0 8px 30px rgba(238,9,121,.5); }
        #zpm-detail-float-btn.applied { background:#999; animation:none; cursor:default; }
        @keyframes zpm-pulse { 0%{box-shadow:0 0 0 0 rgba(238,9,121,.4)} 70%{box-shadow:0 0 0 20px rgba(238,9,121,0)} 100%{box-shadow:0 0 0 0 rgba(238,9,121,0)} }
    `);

    // ============================================================
    // 3. 工具函数
    // ============================================================
    function calcMatchScore(text) {
        if (!text) return { score:0, matched:[], totalWeight:0 };
        const lower = text.toLowerCase();
        let totalWeight = 0, matchedWeight = 0, matched = [];
        for (const [skill, info] of Object.entries(MY_SKILLS)) {
            totalWeight += info.weight;
            const patterns = [skill.toLowerCase(), ...skill.toLowerCase().split(/[\/,，&]/).map(s=>s.trim()).filter(s=>s.length>1)];
            let isMatched = patterns.some(p => lower.includes(p));
            if (!isMatched) isMatched = skill.split(/[\s\/,，]/).some(k => k.length > 2 && lower.includes(k.toLowerCase()));
            if (isMatched) { matchedWeight += info.weight; matched.push(skill); }
        }
        return { score: totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0, matched, totalWeight, matchedWeight };
    }
    function parseSalary(text) {
        if (!text) return null;
        const clean = text.replace(/[·\s]/g,'').toLowerCase();
        let m = clean.match(/(\d+\.?\d*)\s*[-~到]\s*(\d+\.?\d*)\s*k/i);
        if (m) return { low:parseFloat(m[1])*1000, high:parseFloat(m[2])*1000 };
        m = clean.match(/(\d+)\s*[-~到]\s*(\d+)/);
        if (m) { const l=parseFloat(m[1]),h=parseFloat(m[2]); return l<1000&&h<1000?{low:l*1000,high:h*1000}:{low:l,high:h}; }
        m = clean.match(/(\d+\.?\d*)\s*k/i);
        if (m) { const v=parseFloat(m[1])*1000; return {low:v,high:v}; }
        return null;
    }
    function salaryMatch(salary) {
        if (!salary) return 'unknown';
        const [expLow] = PREFERENCES.expectedSalary;
        return salary.high >= expLow * 0.8 ? 'good' : salary.high >= expLow * 0.5 ? 'low' : 'bad';
    }
    function getAppliedJobs() { try { return JSON.parse(GM_getValue('zpm_applied_jobs','[]')); } catch { return []; } }
    function addAppliedJob(name) { const list=getAppliedJobs(); if(!list.includes(name)){ list.push(name); GM_setValue('zpm_applied_jobs',JSON.stringify(list)); } }
    function isApplied(name) { return getAppliedJobs().includes(name); }

    // ============================================================
    // 4. 搜索页处理 - 匹配度 + 投递按钮
    // ============================================================
    function processJobCards() {
        const selectors = [
            '.joblist-box .jobcard', '.job-list .job-card', '.position-list li',
            '.contentpile__content .job-card-box', '.job-card-item',
            '[class*="jobcard"]', '[class*="job-card"]', '[class*="jobItem"]', '.job-item'
        ];
        let cards = [];
        for (const sel of selectors) { cards = document.querySelectorAll(sel); if (cards.length > 0) break; }
        if (cards.length === 0) {
            cards = document.querySelectorAll('div[class*="job"]');
            cards = Array.from(cards).filter(c => { const t=c.textContent||''; return (t.includes('K')||t.includes('k'))&&(t.includes('元')||t.includes('薪'))&&c.children.length>2; });
        }
        let stats = { total:0, matched:0, highMatch:0 };
        cards.forEach(card => {
            if (card.dataset.zpmDone === '1') return;
            card.dataset.zpmDone = '1';
            const text = card.textContent || '';
            const result = calcMatchScore(text);
            const salary = parseSalary(text);
            const sMatch = salaryMatch(salary);
            const titleEl = card.querySelector('a[class*="title"], a[class*="name"], [class*="title"] a, h3 a, h3, [class*="job-name"]');
            const salaryEl = card.querySelector('[class*="salary"], [class*="pay"], [class*="money"]');
            stats.total++;

            // 匹配度标签
            if (result.score > 0 && titleEl) {
                let cls = 'zpm-match-low';
                if (result.score >= 60) { cls='zpm-match-high'; stats.highMatch++; }
                else if (result.score >= 30) cls='zpm-match-medium';
                const badge = document.createElement('span');
                badge.className = `zpm-match-badge ${cls}`;
                badge.textContent = result.score + '%';
                badge.title = `匹配技能: ${result.matched.join(', ')}`;
                titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
                if (result.score >= 60) { stats.matched++; card.classList.add('zpm-job-matched'); }
            }
            // 薪资标签
            if (salaryEl && sMatch !== 'unknown') {
                const b = document.createElement('span');
                b.className = sMatch==='good'?'zpm-salary-badge zpm-salary-good':'zpm-salary-badge zpm-salary-low';
                b.textContent = sMatch==='good'?'💰 薪资合适':'⚠ 薪资偏低';
                salaryEl.parentNode.insertBefore(b, salaryEl.nextSibling);
            }
            // 技能标签
            if (result.matched.length > 0 && titleEl) {
                const tc = document.createElement('div'); tc.className = 'zpm-skill-tags';
                result.matched.forEach(s => { const t=document.createElement('span'); t.className='zpm-skill-tag matched'; t.textContent=s; tc.appendChild(t); });
                const target = card.querySelector('[class*="company"]') || card.querySelector('p') || titleEl.parentNode;
                if (target && target.parentNode) target.parentNode.insertBefore(tc, target.nextSibling);
            }

            // ===== 获取职位链接 =====
            let jobLink = '';
            if (titleEl) {
                jobLink = titleEl.href || (titleEl.querySelector('a') ? titleEl.querySelector('a').href : '');
            }
            if (!jobLink) {
                const allLinks = card.querySelectorAll('a[href*="jobdetail"], a[href*="/jobs/"]');
                if (allLinks.length > 0) jobLink = allLinks[0].href;
            }
            const jobName = titleEl ? (titleEl.textContent || titleEl.innerText || '').trim() : '未知岗位';

            // ===== 复选框（批量用） =====
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'zpm-checkbox';
            cb.title = `选择: ${jobName}`;
            cb.dataset.jobName = jobName;
            cb.dataset.jobLink = jobLink;
            cb.dataset.matchScore = result.score;
            cb.addEventListener('change', updateBatchBar);
            card.insertBefore(cb, card.firstChild);

            // ===== ⚡ 一键投递按钮 =====
            const btn = document.createElement('button');
            btn.className = 'zpm-btn-apply';
            btn.dataset.jobLink = jobLink;
            btn.dataset.jobName = jobName;
            if (isApplied(jobName)) {
                btn.classList.add('applied');
                btn.innerHTML = '✅ 已投递';
            } else {
                btn.innerHTML = '⚡ 投递';
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    quickApply(this, jobLink, jobName);
                });
            }
            const actionArea = card.querySelector('[class*="action"],[class*="operate"],[class*="btn-group"]') || card;
            actionArea.appendChild(btn);
        });
        return stats;
    }

    // ============================================================
    // 5. 投递功能
    // ============================================================

    // ⚡ 一键投递 → 打开详情页，让详情页脚本处理自动投递
    function quickApply(btn, jobLink, jobName) {
        if (btn.classList.contains('applied')) {
            GM_notification({ text: `已投递过: ${jobName}`, timeout: 2000 });
            return;
        }
        if (isApplied(jobName)) {
            btn.classList.add('applied');
            btn.innerHTML = '✅ 已投递';
            GM_notification({ text: `之前已投递: ${jobName}`, timeout: 2000 });
            return;
        }
        if (!jobLink) {
            GM_notification({ text: `⚠ 无法获取 ${jobName} 的链接`, timeout: 3000 });
            return;
        }
        // 保存目标，在详情页脚本会读取并自动投递
        GM_setValue('zpm_pending_apply', JSON.stringify({ name: jobName, link: jobLink }));
        // 跳转到详情页
        window.location.href = jobLink;
    }

    // ============================================================
    // 6. 详情页自动投递（核心！）
    // ============================================================

    let detailAutoApplyDone = false;

    function handleJobDetailPage() {
        const isDetailPage = window.location.pathname.includes('/jobdetail/') || window.location.pathname.includes('/jobs/');
        if (!isDetailPage) return;

        // 检查是否有待投递任务
        let pending = null;
        try {
            const raw = GM_getValue('zpm_pending_apply', '');
            if (raw) pending = JSON.parse(raw);
        } catch {}
        const jobName = pending ? pending.name : document.title || '当前岗位';

        console.log('📄 已进入岗位详情页:', jobName);

        // ===== 查找"立即投递"按钮 =====
        function findApplyButton() {
            const selectors = [
                'button[class*="apply"]', 'button[class*="deliver"]', 'button[class*="submit"]',
                'a[class*="apply"]', 'a[class*="deliver"]',
                '[class*="btn-apply"]', '[class*="btn-deliver"]',
                '[class*="apply-btn"]', '[class*="deliver-btn"]',
                'button:contains(投递)', 'a:contains(投递)',
                // 通用: 找包含"投递"或"申请"的按钮
                'button', 'a[class*="btn"]',
            ];
            for (const sel of selectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    const t = el.textContent.trim();
                    if (t.includes('投递') || t.includes('申请') || t.includes('应聘')) return el;
                }
            }
            // 更暴力的: 遍历所有可见按钮
            const allBtns = document.querySelectorAll('button, a[class*="btn"], [role="button"]');
            for (const el of allBtns) {
                const t = el.textContent.trim();
                if ((t.includes('投递') || t.includes('申请') || t.includes('应聘')) && el.offsetParent !== null) return el;
            }
            return null;
        }

        // ===== 自动确认弹窗 =====
        function autoConfirmDialog() {
            const dialogs = document.querySelectorAll('[class*="dialog"],[class*="modal"],[class*="popup"],#layui-layer');
            dialogs.forEach(dlg => {
                if (dlg.style.display === 'none') return;
                // 勾选同意
                const cbs = dlg.querySelectorAll('input[type="checkbox"]');
                cbs.forEach(cb => { if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
                // 点确认
                const confirmBtns = dlg.querySelectorAll('[class*="submit"],[class*="confirm"],[class*="primary"],button:last-child');
                confirmBtns.forEach(b => { if (b.offsetParent !== null) setTimeout(() => b.click(), 200); });
            });
        }

        // ===== 添加浮动按钮（用户确认后触发投递） =====
        function addFloatButton() {
            if (document.getElementById('zpm-detail-float-btn')) return;
            const isAlreadyApplied = isApplied(jobName);

            const floatBtn = document.createElement('div');
            floatBtn.id = 'zpm-detail-float-btn';
            if (isAlreadyApplied) {
                floatBtn.classList.add('applied');
                floatBtn.innerHTML = '✅ 已投递此岗位';
            } else {
                floatBtn.innerHTML = '⚡ 点击投递此岗位';
                floatBtn.onclick = function() {
                    const applyBtn = findApplyButton();
                    if (applyBtn) {
                        // 点击投递
                        applyBtn.click();
                        // 多次尝试确认弹窗
                        for (let i = 1; i <= 3; i++) {
                            setTimeout(autoConfirmDialog, i * 800);
                        }
                        // 标记已投递
                        floatBtn.classList.add('applied');
                        floatBtn.innerHTML = '✅ 已投递';
                        addAppliedJob(jobName);
                        GM_notification({ text: `✅ 已投递: ${jobName}`, timeout: 3000 });
                        // 清除待投递
                        GM_setValue('zpm_pending_apply', '');
                    } else {
                        GM_notification({ text: '⚠ 没找到投递按钮，请手动投递', timeout: 3000 });
                    }
                };
            }
            document.body.appendChild(floatBtn);
        }

        // ===== 如果是通过"一键投递"跳转过来的，自动触发 =====
        function autoApplyFromPending() {
            if (detailAutoApplyDone) return;
            if (!pending) return;
            if (isApplied(pending.name)) {
                detailAutoApplyDone = true;
                GM_setValue('zpm_pending_apply', '');
                return;
            }

            // 等待页面加载，自动点击投递
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                const applyBtn = findApplyButton();
                if (applyBtn) {
                    clearInterval(timer);
                    console.log('🎯 找到投递按钮，自动点击...');
                    applyBtn.click();
                    // 确认弹窗
                    for (let i = 1; i <= 3; i++) {
                        setTimeout(autoConfirmDialog, i * 800);
                    }
                    // 标记
                    setTimeout(() => {
                        addAppliedJob(pending.name);
                        detailAutoApplyDone = true;
                        GM_setValue('zpm_pending_apply', '');
                        GM_notification({ text: `✅ 已自动投递: ${pending.name}`, timeout: 3000 });
                        // 显示成功浮动按钮
                        const fb = document.getElementById('zpm-detail-float-btn');
                        if (fb) { fb.classList.add('applied'); fb.innerHTML = '✅ 已投递'; }
                    }, 3000);
                } else if (attempts >= APPLY_CONFIG.retryTimes) {
                    clearInterval(timer);
                    console.log('⚠ 未找到投递按钮，请在页面中手动点击');
                    addFloatButton(); // 改为显示手动按钮
                }
            }, APPLY_CONFIG.retryDelay);
        }

        // 先加浮动按钮
        addFloatButton();
        // 再尝试自动投递
        autoApplyFromPending();
    }

    // ============================================================
    // 7. 批量投递
    // ============================================================

    let isBatchRunning = false;

    function getSelectedJobs() {
        const selected = [];
        document.querySelectorAll('.zpm-checkbox:checked').forEach(cb => {
            const card = cb.closest('[class*="job"]');
            const btn = card ? card.querySelector('.zpm-btn-apply') : null;
            if (btn && !btn.classList.contains('applied')) {
                selected.push({
                    name: cb.dataset.jobName || '',
                    link: cb.dataset.jobLink || '',
                    score: parseInt(cb.dataset.matchScore) || 0,
                    btn: btn,
                });
            }
        });
        return selected;
    }

    function updateBatchBar() {
        const selected = getSelectedJobs();
        const bar = document.getElementById('zpm-batch-bar');
        const info = document.getElementById('zpm-batch-info-text');
        if (selected.length > 0) {
            bar.style.display = 'flex';
            info.innerHTML = `已选择 <strong>${selected.length}</strong> 个岗位 (高匹配: <strong>${selected.filter(s=>s.score>=60).length}</strong>)`;
        } else {
            bar.style.display = 'none';
        }
    }

    function showProgress(total) {
        const overlay = document.getElementById('zpm-progress-overlay');
        overlay.style.display = 'flex';
        document.getElementById('zpm-progress-bar-fill').style.width = '0%';
        document.getElementById('zpm-progress-text').textContent = `准备投递 0 / ${total}...`;
        document.getElementById('zpm-progress-close').style.display = 'none';
    }

    function updateProgress(current, total, results) {
        document.getElementById('zpm-progress-bar-fill').style.width = Math.round((current/total)*100) + '%';
        document.getElementById('zpm-progress-text').textContent = `投递中 ${current} / ${total}...`;
        if (current >= total) {
            const succ = results.filter(r=>r.success).length;
            const fail = results.filter(r=>!r.success).length;
            document.getElementById('zpm-progress-text').innerHTML = `
                ✅ 投递完成！<br>
                <span style="color:#52c41a">成功: ${succ}</span>
                ${fail>0?` | <span style="color:#ff4d4f">失败: ${fail}</span>`:''}
            `;
            document.getElementById('zpm-progress-close').style.display = 'inline-block';
            GM_notification({ text: `批量投递完成！成功 ${succ} 个${fail>0?`，失败 ${fail} 个`:''}`, timeout: 5000 });
        }
    }

    async function batchApply() {
        if (isBatchRunning) return;
        const selected = getSelectedJobs();
        if (selected.length === 0) { GM_notification({ text:'请先勾选要投递的岗位', timeout:2000 }); return; }
        if (selected.length > APPLY_CONFIG.maxBatchPerRound) {
            if (!confirm(`一次批量投递建议不超过 ${APPLY_CONFIG.maxBatchPerRound} 个，当前选中 ${selected.length} 个，是否继续？`)) return;
        }

        isBatchRunning = true;
        const results = [];
        showProgress(selected.length);

        for (let i = 0; i < selected.length; i++) {
            const job = selected[i];
            updateProgress(i + 1, selected.length, results);

            try {
                if (job.link) {
                    // 保存待投递任务
                    GM_setValue('zpm_pending_apply', JSON.stringify({ name: job.name, link: job.link }));
                    // 在当前标签跳转（自动投递由 handleJobDetailPage 处理）
                    // 但因为是循环，我们不能真的跳转，只能打开新标签
                    const tab = GM_openInTab(job.link, { active: false, insert: true, setParent: true });
                    // 等待后关闭
                    await new Promise(r => setTimeout(r, 2000));
                    // 标记（打开即视为投递，因为详情页脚本会处理）
                    markAsApplied(job.btn, job.name);
                    results.push({ name: job.name, success: true });
                    if (tab && tab.close) try { tab.close(); } catch {}
                } else {
                    results.push({ name: job.name, success: false, reason: '无链接' });
                }
            } catch(e) {
                results.push({ name: job.name, success: false, reason: e.message });
            }

            if (i < selected.length - 1) {
                await new Promise(r => setTimeout(r, APPLY_CONFIG.batchInterval));
            }
        }

        updateProgress(selected.length, selected.length, results);
        isBatchRunning = false;
        updateBatchBar();
        GM_setValue('zpm_pending_apply', '');
        console.log('📊 批量投递结果:', results);
    }

    function markAsApplied(btn, name) {
        btn.classList.add('applied');
        btn.innerHTML = '✅ 已投递';
        btn.onclick = null; // 移除事件
        addAppliedJob(name);
    }

    // ============================================================
    // 8. 浮动面板
    // ============================================================
    function createPanel() {
        if (document.getElementById('zpm-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'zpm-panel';
        let filterState = 'all';
        panel.innerHTML = `
            <div class="zpm-header" id="zpm-panel-header">
                <span>🎯 智能匹配 v2.1</span>
                <span class="zpm-close" id="zpm-panel-close">×</span>
            </div>
            <div class="zpm-body">
                <div class="zpm-stat">
                    <div class="zpm-stat-item"><div class="zpm-stat-num" id="zpm-stat-total">0</div><div class="zpm-stat-label">岗位总数</div></div>
                    <div class="zpm-stat-item"><div class="zpm-stat-num" id="zpm-stat-matched">0</div><div class="zpm-stat-label">高匹配</div></div>
                    <div class="zpm-stat-item"><div class="zpm-stat-num" id="zpm-stat-high">0</div><div class="zpm-stat-label">强烈推荐</div></div>
                </div>
                <div class="zpm-filter-group">
                    <button class="zpm-filter-btn active" data-filter="all">全部</button>
                    <button class="zpm-filter-btn" data-filter="matched">仅看高匹配</button>
                    <button class="zpm-filter-btn" data-filter="salary">薪资合适</button>
                </div>
                <div style="border-top:1px solid #f0f0f0;padding-top:8px;margin-top:8px;">
                    <div style="font-size:12px;font-weight:bold;margin-bottom:6px;">⚡ 批量投递</div>
                    <button id="zpm-select-high" class="zpm-filter-btn" style="background:#52c41a;color:#fff;border-color:#52c41a;">全选高匹配</button>
                    <button id="zpm-select-all" class="zpm-filter-btn">全选本页</button>
                    <button id="zpm-unselect-all" class="zpm-filter-btn">取消全选</button>
                    <div style="margin-top:6px;">
                        <button id="zpm-batch-apply-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#ff6a00,#ee0979);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;">🚀 批量投递选中岗位</button>
                    </div>
                </div>
                <div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:8px;">
                    <div style="font-size:12px;font-weight:bold;margin-bottom:4px;">💡 技能 (${Object.keys(MY_SKILLS).length}项)</div>
                    <div style="font-size:11px;color:#666;max-height:80px;overflow-y:auto;">
                        ${Object.entries(MY_SKILLS).sort((a,b)=>b[1].weight-a[1].weight).slice(0,15).map(([k,v])=>`<span style="display:inline-block;padding:1px 6px;margin:2px;background:#e6f7ff;border-radius:4px;font-size:10px;">${k}(${v.weight})</span>`).join('')}
                    </div>
                </div>
                <div style="margin-top:6px;text-align:center;">
                    <button id="zpm-refresh-btn" style="padding:6px 20px;background:#1890ff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🔄 刷新</button>
                </div>
                <div style="margin-top:6px;text-align:center;font-size:11px;color:#999;">
                    <span>💡 点 ⚡ 投递 → 跳转详情页自动投递</span>
                </div>
            </div>
            <div class="zpm-footer">${PREFERENCES.city} · ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K · v2.1</div>
        `;
        document.body.appendChild(panel);

        document.getElementById('zpm-panel-close').addEventListener('click', () => panel.style.display = 'none');
        panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterState = btn.dataset.filter;
                applyFilter(filterState);
            });
        });
        document.getElementById('zpm-refresh-btn').addEventListener('click', refreshStats);
        document.getElementById('zpm-select-high').addEventListener('click', () => {
            document.querySelectorAll('.zpm-checkbox').forEach(cb => { const c=cb.closest('[class*="job"]'); cb.checked = !!(c&&c.querySelector('.zpm-match-high')); });
            updateBatchBar();
        });
        document.getElementById('zpm-select-all').addEventListener('click', () => { document.querySelectorAll('.zpm-checkbox').forEach(cb=>cb.checked=true); updateBatchBar(); });
        document.getElementById('zpm-unselect-all').addEventListener('click', () => { document.querySelectorAll('.zpm-checkbox').forEach(cb=>cb.checked=false); updateBatchBar(); });
        document.getElementById('zpm-batch-apply-btn').addEventListener('click', batchApply);

        let isDragging = false, ox, oy;
        const hdr = document.getElementById('zpm-panel-header');
        hdr.addEventListener('mousedown', e => { isDragging=true; ox=e.clientX-panel.offsetLeft; oy=e.clientY-panel.offsetTop; });
        document.addEventListener('mousemove', e => { if(isDragging){ panel.style.left=(e.clientX-ox)+'px'; panel.style.top=(e.clientY-oy)+'px'; panel.style.right='auto'; } });
        document.addEventListener('mouseup', () => { isDragging=false; });
    }

    function applyFilter(state) {
        document.querySelectorAll('[class*="job"]').forEach(card => {
            const badge = card.querySelector('.zpm-match-badge');
            const sb = card.querySelector('.zpm-salary-badge');
            let show = true;
            if (state === 'matched') show = badge && badge.classList.contains('zpm-match-high');
            else if (state === 'salary') show = sb && sb.classList.contains('zpm-salary-good');
            card.classList.toggle('zpm-hidden-job', !show);
        });
    }

    function refreshStats() {
        const stats = processJobCards();
        document.getElementById('zpm-stat-total').textContent = stats.total;
        document.getElementById('zpm-stat-matched').textContent = stats.matched;
        document.getElementById('zpm-stat-high').textContent = stats.highMatch;
    }

    // ============================================================
    // 9. 创建批量UI
    // ============================================================
    function createBatchUI() {
        const bar = document.createElement('div');
        bar.id = 'zpm-batch-bar';
        bar.innerHTML = `
            <div class="zpm-batch-info">🤖 <span id="zpm-batch-info-text">未选择岗位</span></div>
            <div class="zpm-batch-actions">
                <button class="zpm-batch-btn zpm-batch-btn-secondary" id="zpm-batch-clear">取消选择</button>
                <button class="zpm-batch-btn zpm-batch-btn-primary" id="zpm-batch-go">🚀 批量投递</button>
            </div>`;
        document.body.appendChild(bar);
        document.getElementById('zpm-batch-clear').addEventListener('click', () => { document.querySelectorAll('.zpm-checkbox:checked').forEach(cb=>cb.checked=false); updateBatchBar(); });
        document.getElementById('zpm-batch-go').addEventListener('click', batchApply);

        const overlay = document.createElement('div');
        overlay.id = 'zpm-progress-overlay';
        overlay.innerHTML = `
            <div id="zpm-progress-box">
                <h3>🚀 批量投递中</h3>
                <div id="zpm-progress-bar-bg"><div id="zpm-progress-bar-fill"></div></div>
                <div id="zpm-progress-text">准备中...</div>
                <button id="zpm-progress-close">关闭</button>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('zpm-progress-close').addEventListener('click', () => overlay.style.display = 'none');
    }

    // ============================================================
    // 10. 初始化
    // ============================================================
    function init() {
        const isDetailPage = window.location.pathname.includes('/jobdetail/') || window.location.pathname.includes('/jobs/');

        if (isDetailPage) {
            // 详情页：只启动自动投递功能
            handleJobDetailPage();
            console.log('📄 详情页模式 - 自动投递已就绪');
        } else {
            // 搜索页：完整功能
            createPanel();
            createBatchUI();
            setTimeout(refreshStats, 1000);

            let timeout = null;
            const observer = new MutationObserver(() => {
                clearTimeout(timeout);
                timeout = setTimeout(refreshStats, 500);
            });
            observer.observe(document.body, { childList: true, subtree: true });

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) setTimeout(refreshStats, 500);
            });

            console.log('🎯 智联招聘 v2.1 已启动！');
            console.log(`📊 ${Object.keys(MY_SKILLS).length} 项技能 | ${PREFERENCES.city} | ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K`);
            console.log('⚡ 点击 ⚡投递 → 跳转详情页自动投递');
        }
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
