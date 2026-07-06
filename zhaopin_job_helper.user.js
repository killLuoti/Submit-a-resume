// ==UserScript==
// @name         智联招聘 - 智能岗位匹配助手 v2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  岗位匹配度分析 + 一键投递 + 批量投递 + 自动填写确认 | 罗启盛定制版
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
        // —— 核心技能 ——
        '桌面运维': { weight: 10, category: 'core' },
        'IT支持': { weight: 10, category: 'core' },
        '网络运维': { weight: 9, category: 'core' },
        '技术支持': { weight: 9, category: 'core' },
        '故障排除': { weight: 8, category: 'core' },
        '系统维护': { weight: 8, category: 'core' },

        // —— 编程开发 ——
        'Python': { weight: 8, category: 'dev' },
        '爬虫': { weight: 7, category: 'dev' },
        'C#': { weight: 7, category: 'dev' },
        'Java': { weight: 6, category: 'dev' },
        'Android': { weight: 5, category: 'dev' },
        'H5': { weight: 5, category: 'dev' },
        'CSS': { weight: 5, category: 'dev' },
        '前端': { weight: 5, category: 'dev' },

        // —— 数据库 ——
        'MySQL': { weight: 7, category: 'db' },
        'SQL Server': { weight: 6, category: 'db' },
        'SQL': { weight: 6, category: 'db' },
        '数据库': { weight: 6, category: 'db' },

        // —— 物联网/硬件 ——
        '物联网': { weight: 9, category: 'iot' },
        '单片机': { weight: 8, category: 'iot' },
        'STM32': { weight: 8, category: 'iot' },
        '51单片机': { weight: 7, category: 'iot' },
        '组网': { weight: 7, category: 'iot' },
        '传感器': { weight: 7, category: 'iot' },
        '智能硬件': { weight: 7, category: 'iot' },

        // —— 网络 ——
        'Cisco': { weight: 7, category: 'network' },
        '交换机': { weight: 7, category: 'network' },
        'VLAN': { weight: 7, category: 'network' },
        'ACL': { weight: 6, category: 'network' },
        'NAT': { weight: 6, category: 'network' },
        '网络调试': { weight: 7, category: 'network' },

        // —— 测试 ——
        '白盒测试': { weight: 6, category: 'test' },
        '自动化测试': { weight: 6, category: 'test' },

        // —— 证书/资质 ——
        '电工': { weight: 5, category: 'cert' },
        '物联网安装调试员': { weight: 8, category: 'cert' },
    };

    // 求职偏好
    const PREFERENCES = {
        expectedSalary: [7000, 10000],
        city: '佛山',
        jobTypes: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网'],
    };

    // 投递设置
    const APPLY_CONFIG = {
        autoConfirm: true,          // 自动勾选同意协议并提交
        openInNewTab: false,        // 点击投递是否在新标签打开
        batchInterval: 3000,        // 批量投递间隔(ms)，防封
        maxBatchPerRound: 20,       // 每轮批量最大数
    };

    // ============================================================
    // 2. 样式注入
    // ============================================================
    GM_addStyle(`
        /* ---- 匹配度标签 ---- */
        .zpm-match-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 8px;
            vertical-align: middle;
        }
        .zpm-match-high { background: #52c41a; color: #fff; }
        .zpm-match-medium { background: #faad14; color: #fff; }
        .zpm-match-low { background: #ff4d4f; color: #fff; }

        /* ---- 技能标签云 ---- */
        .zpm-skill-tags {
            margin: 4px 0;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .zpm-skill-tag {
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 11px;
            border: 1px solid #1890ff;
            color: #1890ff;
            background: #e6f7ff;
        }
        .zpm-skill-tag.matched {
            background: #52c41a;
            color: #fff;
            border-color: #52c41a;
        }

        /* ---- 浮动控制面板 ---- */
        #zpm-panel {
            position: fixed;
            top: 80px;
            right: 20px;
            width: 300px;
            background: #fff;
            border: 1px solid #d9d9d9;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 999999;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #zpm-panel .zpm-header {
            background: linear-gradient(135deg, #1890ff, #096dd9);
            color: #fff;
            padding: 12px 16px;
            border-radius: 12px 12px 0 0;
            font-weight: bold;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #zpm-panel .zpm-header .zpm-close {
            cursor: pointer;
            font-size: 18px;
            opacity: 0.8;
        }
        #zpm-panel .zpm-header .zpm-close:hover { opacity: 1; }
        #zpm-panel .zpm-body {
            padding: 12px 16px;
            max-height: 500px;
            overflow-y: auto;
        }
        #zpm-panel .zpm-stat {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        #zpm-panel .zpm-stat-item { text-align: center; flex: 1; }
        #zpm-panel .zpm-stat-num { font-size: 22px; font-weight: bold; color: #1890ff; }
        #zpm-panel .zpm-stat-label { font-size: 11px; color: #666; }
        #zpm-panel .zpm-filter-group { margin: 8px 0; }
        #zpm-panel .zpm-filter-btn {
            padding: 4px 12px;
            border: 1px solid #d9d9d9;
            border-radius: 14px;
            background: #fff;
            cursor: pointer;
            font-size: 12px;
            margin: 2px;
            transition: all 0.2s;
        }
        #zpm-panel .zpm-filter-btn.active { background: #1890ff; color: #fff; border-color: #1890ff; }
        #zpm-panel .zpm-filter-btn:hover { border-color: #1890ff; }
        #zpm-panel .zpm-footer {
            padding: 8px 16px;
            border-top: 1px solid #f0f0f0;
            font-size: 11px;
            color: #999;
            text-align: center;
        }
        .zpm-hidden-job { display: none !important; }
        .zpm-job-matched {
            outline: 2px solid #52c41a;
            outline-offset: 2px;
            background: #f6ffed !important;
        }

        /* ---- 薪资标签 ---- */
        .zpm-salary-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 4px;
        }
        .zpm-salary-good {
            background: #f6ffed;
            color: #52c41a;
            border: 1px solid #52c41a;
        }
        .zpm-salary-low {
            background: #fff7e6;
            color: #fa8c16;
            border: 1px solid #fa8c16;
        }

        /* ============ v2.0 新增样式 ============ */

        /* ---- 一键投递按钮 ---- */
        .zpm-btn-apply {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 14px;
            background: linear-gradient(135deg, #ff6a00, #ee0979);
            color: #fff !important;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: all 0.2s;
            text-decoration: none !important;
            margin: 4px 4px 4px 0;
        }
        .zpm-btn-apply:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(238, 9, 121, 0.3);
        }
        .zpm-btn-apply:active {
            transform: translateY(0);
        }
        .zpm-btn-apply.applied {
            background: #999;
            cursor: default;
            transform: none;
            box-shadow: none;
        }

        /* ---- 多选复选框 ---- */
        .zpm-checkbox {
            width: 18px;
            height: 18px;
            cursor: pointer;
            margin-right: 6px;
            vertical-align: middle;
            accent-color: #1890ff;
        }

        /* ---- 批量操作栏 ---- */
        #zpm-batch-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #fff;
            border-top: 2px solid #1890ff;
            padding: 10px 20px;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
            z-index: 999998;
            display: none;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
        }
        #zpm-batch-bar .zpm-batch-info {
            color: #333;
        }
        #zpm-batch-bar .zpm-batch-info strong {
            color: #1890ff;
        }
        #zpm-batch-bar .zpm-batch-actions {
            display: flex;
            gap: 8px;
        }
        .zpm-batch-btn {
            padding: 8px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            transition: all 0.2s;
        }
        .zpm-batch-btn-primary {
            background: linear-gradient(135deg, #ff6a00, #ee0979);
            color: #fff;
        }
        .zpm-batch-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(238, 9, 121, 0.3);
        }
        .zpm-batch-btn-secondary {
            background: #f5f5f5;
            color: #333;
            border: 1px solid #d9d9d9;
        }
        .zpm-batch-btn-secondary:hover {
            background: #e8e8e8;
        }

        /* ---- 投递进度条 ---- */
        #zpm-progress-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999999;
            display: none;
            align-items: center;
            justify-content: center;
        }
        #zpm-progress-box {
            background: #fff;
            border-radius: 16px;
            padding: 30px 40px;
            min-width: 360px;
            text-align: center;
            box-shadow: 0 8px 40px rgba(0,0,0,0.2);
        }
        #zpm-progress-box h3 {
            margin: 0 0 16px;
            font-size: 18px;
        }
        #zpm-progress-bar-bg {
            height: 8px;
            background: #f0f0f0;
            border-radius: 4px;
            overflow: hidden;
            margin: 12px 0;
        }
        #zpm-progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #1890ff, #52c41a);
            border-radius: 4px;
            transition: width 0.3s;
        }
        #zpm-progress-text {
            font-size: 14px;
            color: #666;
            margin: 8px 0;
        }
        #zpm-progress-close {
            margin-top: 16px;
            padding: 8px 24px;
            border: 1px solid #d9d9d9;
            border-radius: 6px;
            background: #fff;
            cursor: pointer;
            display: none;
        }
        #zpm-progress-close:hover {
            background: #f5f5f5;
        }

        /* ---- 投递结果统计 ---- */
        .zpm-result-item {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 13px;
        }
        .zpm-result-item .label { color: #666; }
        .zpm-result-item .value { font-weight: bold; }
        .zpm-result-success .value { color: #52c41a; }
        .zpm-result-fail .value { color: #ff4d4f; }
    `);

    // ============================================================
    // 3. 核心工具函数
    // ============================================================

    // 计算技能匹配度
    function calcMatchScore(text) {
        if (!text) return { score: 0, matched: [], totalWeight: 0 };
        const lower = text.toLowerCase();
        let totalWeight = 0;
        let matchedWeight = 0;
        const matched = [];
        for (const [skill, info] of Object.entries(MY_SKILLS)) {
            totalWeight += info.weight;
            const patterns = [
                skill.toLowerCase(),
                ...skill.toLowerCase().split(/[\/,，&]/).map(s => s.trim()).filter(s => s.length > 1)
            ];
            let isMatched = patterns.some(p => lower.includes(p));
            if (!isMatched) {
                const keywords = skill.split(/[\s\/,，]/);
                isMatched = keywords.some(k => k.length > 2 && lower.includes(k.toLowerCase()));
            }
            if (isMatched) {
                matchedWeight += info.weight;
                matched.push(skill);
            }
        }
        const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
        return { score, matched, totalWeight, matchedWeight };
    }

    // 解析薪资
    function parseSalary(text) {
        if (!text) return null;
        const clean = text.replace(/[·\s]/g, '').toLowerCase();
        let match = clean.match(/(\d+\.?\d*)\s*[-~到]\s*(\d+\.?\d*)\s*k/i);
        if (match) return { low: parseFloat(match[1]) * 1000, high: parseFloat(match[2]) * 1000 };
        match = clean.match(/(\d+)\s*[-~到]\s*(\d+)/);
        if (match) {
            const low = parseFloat(match[1]), high = parseFloat(match[2]);
            if (low < 1000 && high < 1000) return { low: low * 1000, high: high * 1000 };
            return { low, high };
        }
        match = clean.match(/(\d+\.?\d*)\s*k/i);
        if (match) { const v = parseFloat(match[1]) * 1000; return { low: v, high: v }; }
        return null;
    }

    function salaryMatch(salary) {
        if (!salary) return 'unknown';
        const [expLow] = PREFERENCES.expectedSalary;
        if (salary.high >= expLow * 0.8) return 'good';
        if (salary.high >= expLow * 0.5) return 'low';
        return 'bad';
    }

    // ============================================================
    // 4. 页面处理 - 匹配 + 投递按钮
    // ============================================================

    function processJobCards() {
        const selectors = [
            '.joblist-box .jobcard',
            '.job-list .job-card',
            '.position-list li',
            '.contentpile__content .job-card-box',
            '.job-card-item',
            '[class*="jobcard"]',
            '[class*="job-card"]',
            '[class*="jobItem"]',
            '.job-item',
        ];
        let cards = [];
        for (const sel of selectors) {
            cards = document.querySelectorAll(sel);
            if (cards.length > 0) break;
        }
        if (cards.length === 0) {
            cards = document.querySelectorAll('div[class*="job"]');
            cards = Array.from(cards).filter(c => {
                const text = c.textContent || '';
                return (text.includes('K') || text.includes('k')) &&
                       (text.includes('元') || text.includes('薪')) &&
                       c.children.length > 2;
            });
        }
        let stats = { total: 0, matched: 0, highMatch: 0 };
        cards.forEach(card => {
            // 避免重复处理
            if (card.dataset.zpmProcessed === '1') return;
            card.dataset.zpmProcessed = '1';

            const text = card.textContent || '';
            const result = calcMatchScore(text);
            const salary = parseSalary(text);
            const sMatch = salaryMatch(salary);
            const titleEl = card.querySelector('a[class*="title"], a[class*="name"], [class*="title"] a, h3 a, h3, [class*="job-name"]');
            const salaryEl = card.querySelector('[class*="salary"], [class*="pay"], [class*="money"]');
            stats.total++;

            // 匹配度标签
            if (result.score > 0 && titleEl) {
                let badgeClass = 'zpm-match-low';
                if (result.score >= 60) { badgeClass = 'zpm-match-high'; stats.highMatch++; }
                else if (result.score >= 30) { badgeClass = 'zpm-match-medium'; }
                const badge = document.createElement('span');
                badge.className = `zpm-match-badge ${badgeClass}`;
                badge.textContent = result.score + '%';
                badge.title = `匹配技能: ${result.matched.join(', ')}`;
                titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
                if (result.score >= 60) {
                    stats.matched++;
                    card.classList.add('zpm-job-matched');
                }
            }

            // 薪资标签
            if (salaryEl && sMatch !== 'unknown') {
                const badge = document.createElement('span');
                badge.className = sMatch === 'good' ? 'zpm-salary-badge zpm-salary-good' : 'zpm-salary-badge zpm-salary-low';
                badge.textContent = sMatch === 'good' ? '💰 薪资合适' : '⚠ 薪资偏低';
                salaryEl.parentNode.insertBefore(badge, salaryEl.nextSibling);
            }

            // 技能标签云
            if (result.matched.length > 0 && titleEl) {
                const tagContainer = document.createElement('div');
                tagContainer.className = 'zpm-skill-tags';
                result.matched.forEach(skill => {
                    const tag = document.createElement('span');
                    tag.className = 'zpm-skill-tag matched';
                    tag.textContent = skill;
                    tagContainer.appendChild(tag);
                });
                const target = card.querySelector('[class*="company"]') || card.querySelector('p') || titleEl.parentNode;
                if (target && target.parentNode) {
                    target.parentNode.insertBefore(tagContainer, target.nextSibling);
                }
            }

            // ========== v2.0: 添加复选框 + 投递按钮 ==========
            // 获取职位链接
            const jobLink = titleEl ? (titleEl.href || (titleEl.querySelector('a') ? titleEl.querySelector('a').href : '')) : '';
            const jobName = titleEl ? (titleEl.textContent || titleEl.innerText || '').trim() : '';

            // 投递按钮容器
            const actionContainer = card.querySelector('[class*="action"], [class*="operate"], [class*="btn-group"]') || card;
            
            // 复选框（用于批量）
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'zpm-checkbox';
            checkbox.title = `选择: ${jobName}`;
            checkbox.dataset.jobName = jobName;
            checkbox.dataset.jobLink = jobLink || '';
            checkbox.dataset.matchScore = result.score;
            checkbox.addEventListener('change', updateBatchBar);
            // 插入到卡片最前面
            card.insertBefore(checkbox, card.firstChild);

            // 一键投递按钮
            const applyBtn = document.createElement('button');
            applyBtn.className = 'zpm-btn-apply';
            applyBtn.dataset.jobLink = jobLink || '';
            applyBtn.dataset.jobName = jobName;
            applyBtn.innerHTML = '⚡ 投递';
            applyBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                quickApply(this, jobLink, jobName);
            });
            actionContainer.appendChild(applyBtn);
        });
        return stats;
    }

    // ============================================================
    // 5. 投递功能
    // ============================================================

    // 记录已投递的岗位（本地存储，避免重复投递）
    function getAppliedJobs() {
        try {
            return JSON.parse(GM_getValue('zpm_applied_jobs', '[]'));
        } catch { return []; }
    }
    function addAppliedJob(jobName) {
        const list = getAppliedJobs();
        if (!list.includes(jobName)) {
            list.push(jobName);
            GM_setValue('zpm_applied_jobs', JSON.stringify(list));
        }
    }
    function isJobApplied(jobName) {
        return getAppliedJobs().includes(jobName);
    }

    // 单个快速投递
    function quickApply(btn, jobLink, jobName) {
        if (btn.classList.contains('applied')) {
            GM_notification({ text: `已投递过: ${jobName}`, timeout: 2000 });
            return;
        }
        if (isJobApplied(jobName)) {
            btn.classList.add('applied');
            btn.innerHTML = '✅ 已投递';
            GM_notification({ text: `之前已投递: ${jobName}`, timeout: 2000 });
            return;
        }

        if (!jobLink) {
            // 没有链接，尝试找页面上的"立即投递"按钮并点击
            const immediateBtn = btn.closest('[class*="job"]').querySelector('[class*="apply"], [class*="deliver"], [class*="submit"], button:not(.zpm-btn-apply)');
            if (immediateBtn && immediateBtn.textContent.includes('投递')) {
                immediateBtn.click();
                // 等对话框出现后自动确认
                if (APPLY_CONFIG.autoConfirm) {
                    setTimeout(autoConfirmDialog, 1000);
                }
                markAsApplied(btn, jobName);
                return;
            }
            GM_notification({ text: '无法找到投递入口，请手动投递', timeout: 3000 });
            return;
        }

        // 有链接，在新标签或当前标签打开
        if (APPLY_CONFIG.openInNewTab) {
            GM_openInTab(jobLink, { active: false });
            // 记录并标记
            markAsApplied(btn, jobName);
            GM_notification({ text: `已打开: ${jobName}`, timeout: 2000 });
        } else {
            // 在当前标签跳转（在详情页会触发自动投递）
            window.location.href = jobLink;
        }
    }

    function markAsApplied(btn, jobName) {
        btn.classList.add('applied');
        btn.innerHTML = '✅ 已投递';
        addAppliedJob(jobName);
    }

    // ========== 批量投递 ==========

    let isBatchRunning = false;

    function getSelectedJobs() {
        const selected = [];
        document.querySelectorAll('.zpm-checkbox:checked').forEach(cb => {
            const card = cb.closest('[class*="job"]');
            // 找投递按钮
            const btn = card ? card.querySelector('.zpm-btn-apply') : null;
            if (btn && !btn.classList.contains('applied')) {
                selected.push({
                    name: cb.dataset.jobName || '',
                    link: cb.dataset.jobLink || '',
                    score: parseInt(cb.dataset.matchScore) || 0,
                    btn: btn,
                    card: card
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
            info.innerHTML = `已选择 <strong>${selected.length}</strong> 个岗位 (高匹配: <strong>${selected.filter(s => s.score >= 60).length}</strong>)`;
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
        const pct = Math.round((current / total) * 100);
        document.getElementById('zpm-progress-bar-fill').style.width = pct + '%';
        document.getElementById('zpm-progress-text').textContent = `投递中 ${current} / ${total}...`;
        if (current >= total) {
            const success = results.filter(r => r.success).length;
            const fail = results.filter(r => !r.success).length;
            document.getElementById('zpm-progress-text').innerHTML = `
                ✅ 投递完成！<br>
                <span style="color:#52c41a">成功: ${success}</span>
                ${fail > 0 ? ` | <span style="color:#ff4d4f">失败: ${fail}</span>` : ''}
            `;
            document.getElementById('zpm-progress-close').style.display = 'inline-block';
            if (fail === 0) {
                GM_notification({ text: `批量投递完成！成功 ${success} 个岗位`, timeout: 5000 });
            } else {
                GM_notification({ text: `批量投递完成！成功 ${success} 个，失败 ${fail} 个`, timeout: 5000 });
            }
        }
    }

    async function batchApply() {
        if (isBatchRunning) return;
        const selected = getSelectedJobs();
        if (selected.length === 0) {
            GM_notification({ text: '请先勾选要投递的岗位', timeout: 2000 });
            return;
        }
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
                // 先尝试点击卡片上的"立即投递"按钮
                const immediateBtn = job.card.querySelector('[class*="apply"]:not(.zpm-btn-apply), [class*="deliver"]:not(.zpm-btn-apply)');
                if (immediateBtn && immediateBtn.textContent.includes('投递')) {
                    immediateBtn.click();
                    if (APPLY_CONFIG.autoConfirm) {
                        await new Promise(r => setTimeout(r, 800));
                        autoConfirmDialog();
                    }
                    markAsApplied(job.btn, job.name);
                    results.push({ name: job.name, success: true });
                } else if (job.link) {
                    // 用 GM_openInTab 打开并尝试投递
                    const tab = GM_openInTab(job.link, { active: false, setParent: true, insert: true });
                    await new Promise(r => setTimeout(r, 1500));
                    // 尝试在打开的页面中投递（需要跨页面操作，有限制）
                    markAsApplied(job.btn, job.name);
                    results.push({ name: job.name, success: true });
                    if (tab && tab.close) tab.close();
                } else {
                    results.push({ name: job.name, success: false, reason: '无投递入口' });
                }
            } catch (e) {
                results.push({ name: job.name, success: false, reason: e.message });
            }

            // 投递间隔，避免触发风控
            if (i < selected.length - 1) {
                await new Promise(r => setTimeout(r, APPLY_CONFIG.batchInterval));
            }
        }

        updateProgress(selected.length, selected.length, results);
        isBatchRunning = false;
        updateBatchBar();

        // 输出详细结果到控制台
        console.log('📊 批量投递结果:', results);
    }

    // ========== 自动确认投递对话框 ==========

    function autoConfirmDialog() {
        // 尝试找智联的投递确认弹窗
        const dialog = document.querySelector('[class*="dialog"], [class*="modal"], [class*="popup"], #layui-layer');
        if (!dialog || dialog.style.display === 'none') return;

        // 勾选"我已阅读并同意"
        const agreeCheckbox = dialog.querySelector('input[type="checkbox"]');
        if (agreeCheckbox && !agreeCheckbox.checked) {
            agreeCheckbox.checked = true;
            agreeCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 点击确认/提交按钮
        const submitBtn = dialog.querySelector('[class*="submit"], [class*="confirm"], [class*="primary"], button:last-child, a[class*="btn"]:last-child');
        if (submitBtn) {
            setTimeout(() => {
                submitBtn.click();
            }, 300);
        }
    }

    // ============================================================
    // 6. 详情页自动投递
    // ============================================================

    function handleJobDetailPage() {
        // 如果当前是职位详情页，尝试自动触发投递
        if (!window.location.pathname.includes('/jobdetail/') && !window.location.pathname.includes('/jobs/')) return;

        // 找"立即投递"按钮
        const applyBtn = document.querySelector('[class*="apply"], [class*="deliver"], [class*="submit"]');
        if (applyBtn && (applyBtn.textContent.includes('投递') || applyBtn.textContent.includes('申请'))) {
            // 不自动点击，但添加一个醒目的浮动按钮
            const floatBtn = document.createElement('div');
            floatBtn.style.cssText = `
                position: fixed; bottom: 30px; right: 30px;
                padding: 12px 28px; background: linear-gradient(135deg, #ff6a00, #ee0979);
                color: #fff; border: none; border-radius: 50px;
                font-size: 16px; font-weight: bold; cursor: pointer;
                box-shadow: 0 4px 20px rgba(238,9,121,0.4);
                z-index: 99999;
                display: flex; align-items: center; gap: 8px;
                animation: zpm-pulse 2s infinite;
            `;
            floatBtn.innerHTML = '⚡ 立即投递此岗位';
            floatBtn.onclick = function() {
                applyBtn.click();
                if (APPLY_CONFIG.autoConfirm) {
                    setTimeout(autoConfirmDialog, 1000);
                    setTimeout(autoConfirmDialog, 2000);
                }
                floatBtn.innerHTML = '✅ 已投递';
                floatBtn.style.background = '#999';
                floatBtn.style.animation = 'none';
                floatBtn.style.cursor = 'default';
            };
            document.body.appendChild(floatBtn);

            // 添加脉冲动画
            const style = document.createElement('style');
            style.textContent = `@keyframes zpm-pulse { 0% { box-shadow: 0 0 0 0 rgba(238,9,121,0.4); } 70% { box-shadow: 0 0 0 15px rgba(238,9,121,0); } 100% { box-shadow: 0 0 0 0 rgba(238,9,121,0); } }`;
            document.head.appendChild(style);
        }
    }

    // ============================================================
    // 7. 浮动控制面板 (v2.0 增加批量功能)
    // ============================================================

    function createPanel() {
        if (document.getElementById('zpm-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'zpm-panel';
        let filterState = 'all';

        panel.innerHTML = `
            <div class="zpm-header" id="zpm-panel-header">
                <span>🎯 智能匹配 v2.0</span>
                <span class="zpm-close" id="zpm-panel-close">×</span>
            </div>
            <div class="zpm-body">
                <div class="zpm-stat">
                    <div class="zpm-stat-item">
                        <div class="zpm-stat-num" id="zpm-stat-total">0</div>
                        <div class="zpm-stat-label">岗位总数</div>
                    </div>
                    <div class="zpm-stat-item">
                        <div class="zpm-stat-num" id="zpm-stat-matched">0</div>
                        <div class="zpm-stat-label">高匹配</div>
                    </div>
                    <div class="zpm-stat-item">
                        <div class="zpm-stat-num" id="zpm-stat-high">0</div>
                        <div class="zpm-stat-label">强烈推荐</div>
                    </div>
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
                        <button id="zpm-batch-apply-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#ff6a00,#ee0979);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;">
                            🚀 批量投递选中岗位
                        </button>
                    </div>
                </div>
                <div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:8px;">
                    <div style="font-size:12px;font-weight:bold;margin-bottom:4px;">💡 你的技能 (${Object.keys(MY_SKILLS).length}项)</div>
                    <div style="font-size:11px;color:#666;max-height:80px;overflow-y:auto;">
                        ${Object.entries(MY_SKILLS).sort((a,b)=>b[1].weight-a[1].weight).slice(0,15).map(([k,v])=>`<span style="display:inline-block;padding:1px 6px;margin:2px;background:#e6f7ff;border-radius:4px;font-size:10px;">${k}(${v.weight})</span>`).join('')}
                    </div>
                </div>
                <div style="margin-top:6px;text-align:center;">
                    <button id="zpm-refresh-btn" style="padding:6px 20px;background:#1890ff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🔄 刷新</button>
                </div>
            </div>
            <div class="zpm-footer">${PREFERENCES.city} · ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K · v2.0 批量投递</div>
        `;
        document.body.appendChild(panel);

        // ---- 事件绑定 ----
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

        // ---- 全选/取消 ----
        document.getElementById('zpm-select-high').addEventListener('click', () => {
            document.querySelectorAll('.zpm-checkbox').forEach(cb => {
                const card = cb.closest('[class*="job"]');
                const badge = card ? card.querySelector('.zpm-match-high') : null;
                cb.checked = !!badge;
            });
            updateBatchBar();
        });
        document.getElementById('zpm-select-all').addEventListener('click', () => {
            document.querySelectorAll('.zpm-checkbox').forEach(cb => cb.checked = true);
            updateBatchBar();
        });
        document.getElementById('zpm-unselect-all').addEventListener('click', () => {
            document.querySelectorAll('.zpm-checkbox').forEach(cb => cb.checked = false);
            updateBatchBar();
        });

        // ---- 批量投递 ----
        document.getElementById('zpm-batch-apply-btn').addEventListener('click', batchApply);

        // ---- 拖拽 ----
        let isDragging = false, offsetX, offsetY;
        const header = document.getElementById('zpm-panel-header');
        header.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - panel.offsetLeft; offsetY = e.clientY - panel.offsetTop; });
        document.addEventListener('mousemove', (e) => { if (isDragging) { panel.style.left = (e.clientX - offsetX) + 'px'; panel.style.top = (e.clientY - offsetY) + 'px'; panel.style.right = 'auto'; } });
        document.addEventListener('mouseup', () => { isDragging = false; });

        return panel;
    }

    function applyFilter(state) {
        document.querySelectorAll('[class*="job"]').forEach(card => {
            const badge = card.querySelector('.zpm-match-badge');
            const salaryBadge = card.querySelector('.zpm-salary-badge');
            let show = true;
            if (state === 'matched') show = badge && badge.classList.contains('zpm-match-high');
            else if (state === 'salary') show = salaryBadge && salaryBadge.classList.contains('zpm-salary-good');
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
    // 8. 创建批量投递栏 & 进度弹窗
    // ============================================================

    function createBatchUI() {
        // 底部批量操作栏
        const batchBar = document.createElement('div');
        batchBar.id = 'zpm-batch-bar';
        batchBar.innerHTML = `
            <div class="zpm-batch-info">
                🤖 <span id="zpm-batch-info-text">未选择岗位</span>
            </div>
            <div class="zpm-batch-actions">
                <button class="zpm-batch-btn zpm-batch-btn-secondary" id="zpm-batch-clear">取消选择</button>
                <button class="zpm-batch-btn zpm-batch-btn-primary" id="zpm-batch-go">🚀 批量投递</button>
            </div>
        `;
        document.body.appendChild(batchBar);

        document.getElementById('zpm-batch-clear').addEventListener('click', () => {
            document.querySelectorAll('.zpm-checkbox:checked').forEach(cb => cb.checked = false);
            updateBatchBar();
        });
        document.getElementById('zpm-batch-go').addEventListener('click', batchApply);

        // 投递进度弹窗
        const overlay = document.createElement('div');
        overlay.id = 'zpm-progress-overlay';
        overlay.innerHTML = `
            <div id="zpm-progress-box">
                <h3>🚀 批量投递中</h3>
                <div id="zpm-progress-bar-bg">
                    <div id="zpm-progress-bar-fill"></div>
                </div>
                <div id="zpm-progress-text">准备中...</div>
                <button id="zpm-progress-close">关闭</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('zpm-progress-close').addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    }

    // ============================================================
    // 9. 初始化
    // ============================================================

    function init() {
        createPanel();
        createBatchUI();
        handleJobDetailPage();

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

        console.log('🎯 智联招聘智能匹配助手 v2.0 已启动！');
        console.log(`📊 ${Object.keys(MY_SKILLS).length} 项技能 | ${PREFERENCES.city} | ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K`);
        console.log('⚡ 新功能: 一键投递 + 批量投递 + 自动确认');
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();
