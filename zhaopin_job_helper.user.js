// ==UserScript==
// @name         智联招聘/Boss直聘 - 智能自动投递助手 v3.0
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  自动投递智联招聘+Boss直聘，技能匹配度分析，AI辅助筛选，智能过滤不适合岗位
// @author       罗启盛求职助手
// @match        https://www.zhaopin.com/*
// @match        https://sou.zhaopin.com/*
// @match        https://jobs.zhaopin.com/*
// @match        https://www.zhipin.com/*
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
    // 配置区 - 根据你的简历修改
    // ============================================================
    const CONFIG = {
        // 求职偏好
        city: '佛山',
        jobKeywords: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网', '桌面运维'],
        expectedSalary: [7000, 10000],

        // 投递设置
        deliverCount: 50,           // 本轮投递目标数
        batchInterval: 3000,        // 每次投递间隔(ms)
        autoNextPage: true,         // 投完一页自动翻页

        // 技能库（用于匹配度评分）
        skills: {
            '桌面运维': 10, 'IT支持': 10, '网络运维': 9, '技术支持': 9,
            '故障排除': 8, '系统维护': 8, 'Python': 8, '爬虫': 7,
            'C#': 7, 'Java': 6, 'MySQL': 7, 'SQL Server': 6,
            '物联网': 9, '单片机': 8, 'STM32': 8, '组网': 7,
            '传感器': 7, 'Cisco': 7, '交换机': 7, 'VLAN': 7,
            '网络调试': 7, '白盒测试': 6, '电工': 5,
            '物联网安装调试员': 8,
        },

        // 已投递记录开关
        saveApplied: true,
    };

    // ============================================================
    // 样式
    // ============================================================
    GM_addStyle(`
        #zpm-v3-panel {
            position: fixed; top: 80px; right: 20px; width: 320px;
            background: #fff; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px; overflow: hidden;
            border: 1px solid #e8e8e8;
        }
        #zpm-v3-panel .header {
            background: linear-gradient(135deg, #165DFF, #0F48D1);
            color: #fff; padding: 14px 16px; cursor: move;
            display: flex; justify-content: space-between; align-items: center;
            user-select: none;
        }
        #zpm-v3-panel .header h3 { margin: 0; font-size: 15px; display: flex; align-items: center; gap: 6px; }
        #zpm-v3-panel .header .close-btn { cursor: pointer; opacity: 0.7; font-size: 18px; }
        #zpm-v3-panel .header .close-btn:hover { opacity: 1; }
        #zpm-v3-panel .body { padding: 14px 16px; max-height: 520px; overflow-y: auto; }

        /* 状态卡片 */
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

        /* 筛选按钮 */
        .zpm-filter-group { display: flex; gap: 4px; margin: 8px 0; flex-wrap: wrap; }
        .zpm-filter-btn {
            padding: 4px 12px; border: 1px solid #d9d9d9; border-radius: 14px;
            background: #fff; cursor: pointer; font-size: 12px; transition: all 0.2s;
        }
        .zpm-filter-btn.active { background: #165DFF; color: #fff; border-color: #165DFF; }
        .zpm-filter-btn:hover { border-color: #165DFF; }

        /* 启动按钮 */
        .zpm-toggle-btn {
            width: 100%; padding: 12px; border: none; border-radius: 8px;
            font-size: 14px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; margin-top: 8px;
        }
        .zpm-toggle-btn.start { background: linear-gradient(135deg, #165DFF, #0F48D1); color: #fff; }
        .zpm-toggle-btn.start:hover { box-shadow: 0 4px 12px rgba(22,93,255,0.3); }
        .zpm-toggle-btn.stop { background: #ff4d4f; color: #fff; }
        .zpm-toggle-btn.stop:hover { box-shadow: 0 4px 12px rgba(255,77,79,0.3); }

        /* 投递日志 */
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

        /* 进度条 */
        .zpm-progress-bar {
            height: 4px; background: #f0f0f0; border-radius: 2px;
            overflow: hidden; margin: 8px 0;
        }
        .zpm-progress-fill {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #165DFF, #52c41a);
            transition: width 0.3s;
        }

        /* 匹配度标签 */
        .zpm-badge {
            display: inline-block; padding: 1px 6px; border-radius: 8px;
            font-size: 11px; font-weight: bold; margin-left: 6px;
        }
        .zpm-badge-high { background: #52c41a; color: #fff; }
        .zpm-badge-mid { background: #faad14; color: #fff; }
        .zpm-badge-low { background: #ff4d4f; color: #fff; }

        .zpm-job-highlight { outline: 2px solid #52c41a; outline-offset: 1px; background: #f6ffed !important; }
        .zpm-job-hidden { display: none !important; }
        .zpm-job-applied { opacity: 0.6; }

        .zpm-toast {
            position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
            padding: 10px 20px; border-radius: 6px; color: #fff;
            font-size: 13px; z-index: 9999999; display: none;
        }
        .zpm-toast.success { background: #52c41a; }
        .zpm-toast.error { background: #ff4d4f; }
        .zpm-toast.info { background: #165DFF; }

        .zpm-footer { text-align: center; font-size: 11px; color: #999; padding: 8px; border-top: 1px solid #f0f0f0; }
    `);

    // ============================================================
    // 工具函数
    // ============================================================
    const delay = ms => new Promise(r => setTimeout(r, ms));

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

    function getApplied() {
        try { return JSON.parse(GM_getValue('zpm_applied_set', '[]')); } catch { return []; }
    }
    function saveApplied(name) {
        if (!CONFIG.saveApplied) return;
        const list = getApplied();
        if (!list.includes(name)) {
            list.push(name);
            GM_setValue('zpm_applied_set', JSON.stringify(list));
        }
    }
    function isApplied(name) {
        return CONFIG.saveApplied && getApplied().includes(name);
    }

    function calcMatch(text) {
        if (!text) return { score: 0, matched: [] };
        const lower = text.toLowerCase();
        let total = 0, matchedW = 0, matched = [];
        const entries = Object.entries(CONFIG.skills);
        for (const [skill, weight] of entries) {
            total += weight;
            const patterns = [skill.toLowerCase(), ...skill.toLowerCase().split(/[\/,，&]/).map(s=>s.trim()).filter(s=>s.length>1)];
            if (patterns.some(p => lower.includes(p)) || skill.split(/[\s\/,，]/).some(k => k.length > 2 && lower.includes(k.toLowerCase()))) {
                matchedW += weight;
                matched.push(skill);
            }
        }
        return { score: total > 0 ? Math.round((matchedW / total) * 100) : 0, matched };
    }

    // ============================================================
    // 智联招聘投递引擎
    // ============================================================
    const ZhaopinEngine = {
        name: '智联招聘',
        running: false,
        completed: 0,
        target: 50,
        logs: [],

        // 获取岗位列表（兼容多种页面结构）
        getJobs() {
            // 参考脚本的智联选择器 + 我们的兜底
            let jobs = document.querySelectorAll('.positionlist__list .joblist-box__item');
            if (jobs.length === 0) jobs = document.querySelectorAll('.joblist-box .jobcard');
            if (jobs.length === 0) jobs = document.querySelectorAll('[class*="jobcard"]');
            if (jobs.length === 0) jobs = document.querySelectorAll('.job-item');
            return Array.from(jobs);
        },

        // 获取岗位详细信息
        getJobInfo(jobEl) {
            // 岗位名称
            const nameEl = jobEl.querySelector('.jobinfo__name') || jobEl.querySelector('[class*="job-name"]') || jobEl.querySelector('a[class*="title"]');
            const name = nameEl ? (nameEl.textContent || nameEl.innerText || '').trim() : '';

            // 城市
            const cityEl = jobEl.querySelector('.jobinfo__other-info-item span, .jobinfo__other-info-item');
            const city = cityEl ? cityEl.textContent.trim() : '';

            // 全部文本用于匹配度
            const fullText = jobEl.textContent || '';

            // 投递按钮
            const applyBtn = jobEl.querySelector('.collect-and-apply__btn') || jobEl.querySelector('[class*="apply"]') || jobEl.querySelector('[class*="deliver"]');

            return { name, city, fullText, applyBtn };
        },

        // 投递单个岗位
        async applyOne(jobEl, jobInfo) {
            // 检查是否已投递
            if (isApplied(jobInfo.name)) {
                jobEl.classList.add('zpm-job-applied');
                return { success: false, reason: '已投递过' };
            }

            // 检查城市匹配
            if (CONFIG.city && !jobInfo.city.includes(CONFIG.city)) {
                jobEl.style.opacity = '0.5';
                return { success: false, reason: `城市不匹配: ${jobInfo.city}` };
            }

            // 检查职位关键词
            const hasKeyword = CONFIG.jobKeywords.some(k => jobInfo.name.includes(k) || jobInfo.fullText.includes(k));
            if (!hasKeyword) {
                jobEl.style.opacity = '0.5';
                return { success: false, reason: '岗位不匹配' };
            }

            // 高亮匹配岗位
            jobEl.classList.add('zpm-job-highlight');

            // 点击投递按钮
            if (jobInfo.applyBtn) {
                try {
                    jobInfo.applyBtn.click();
                    await delay(1000);

                    // 检查弹窗并确认
                    this.confirmDialog();

                    saveApplied(jobInfo.name);
                    this.completed++;
                    return { success: true, reason: '已投递' };
                } catch (e) {
                    return { success: false, reason: `点击失败: ${e.message}` };
                }
            }

            return { success: false, reason: '未找到投递按钮' };
        },

        // 确认弹窗
        confirmDialog() {
            // 智联投递后可能有弹窗，尝试关闭/确认
            const dialogs = document.querySelectorAll('[class*="dialog"],[class*="modal"],[class*="popup"]');
            dialogs.forEach(dlg => {
                if (dlg.offsetParent === null) return;
                // 勾选同意
                dlg.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change',{bubbles:true})); }
                });
                // 点确认
                const confirmBtn = dlg.querySelector('[class*="submit"],[class*="confirm"],[class*="primary"],button:last-child');
                if (confirmBtn) setTimeout(() => confirmBtn.click(), 200);
                // 点关闭
                const closeBtn = dlg.querySelector('[class*="close"],[class*="cancel"]');
                if (closeBtn) setTimeout(() => closeBtn.click(), 500);
            });
        },

        // 翻到下一页
        async goNextPage() {
            const nextBtn = document.querySelector('.btn.soupager__btn:not([disabled])') ||
                           document.querySelector('[class*="next"]:not([disabled])') ||
                           document.querySelector('.pagination .next:not(.disabled)');
            if (nextBtn && nextBtn.textContent.includes('下一页')) {
                nextBtn.click();
                await delay(2000);
                return true;
            }
            return false;
        },

        // 主运行循环
        async run(targetCount) {
            this.running = true;
            this.completed = 0;
            this.target = targetCount || CONFIG.deliverCount;
            this.logs = [];

            this.addLog('🚀 智联招聘自动投递启动', 'info');

            while (this.running && this.completed < this.target) {
                const jobs = this.getJobs();
                if (jobs.length === 0) {
                    this.addLog('⚠ 未找到岗位列表', 'error');
                    break;
                }

                this.addLog(`📋 本页找到 ${jobs.length} 个岗位`, 'info');

                for (const job of jobs) {
                    if (!this.running || this.completed >= this.target) break;

                    const info = this.getJobInfo(job);
                    if (!info.name) continue;

                    const match = calcMatch(info.fullText);
                    const result = await this.applyOne(job, info);

                    if (result.success) {
                        this.addLog(`✅ [${this.completed}/${this.target}] ${info.name} (${match.score}%)`, 'success');
                    } else {
                        if (result.reason !== '已投递过') {
                            // 只记录非重复的跳过
                        }
                    }

                    // 更新UI
                    updateUI(this);
                    await delay(CONFIG.batchInterval);
                }

                // 翻页
                if (this.running && this.completed < this.target && CONFIG.autoNextPage) {
                    const hasNext = await this.goNextPage();
                    if (!hasNext) {
                        this.addLog('📭 已到最后一页', 'info');
                        break;
                    }
                    this.addLog('📄 翻到下一页', 'info');
                } else {
                    break;
                }
            }

            if (this.completed >= this.target) {
                this.addLog(`🎉 达到目标！共投递 ${this.completed} 个岗位`, 'success');
                toast(`🎉 投递完成！共 ${this.completed} 个`, 'success');
            } else {
                this.addLog(`⏸ 已暂停，已投递 ${this.completed} 个`, 'info');
            }

            this.running = false;
            updateUI(this);
        },

        stop() {
            this.running = false;
            this.addLog('⏸ 已手动暂停', 'info');
        },

        addLog(msg, type = 'info') {
            this.logs.push({ msg, type, time: new Date().toLocaleTimeString() });
            renderLogs(this);
        }
    };

    // ============================================================
    // Boss直聘引擎（简化版）
    // ============================================================
    const BossEngine = {
        name: 'Boss直聘',
        running: false,
        completed: 0,
        target: 50,
        logs: [],

        async run(targetCount) {
            this.running = true;
            this.completed = 0;
            this.target = targetCount || CONFIG.deliverCount;
            this.logs = [];

            this.addLog('🚀 Boss直聘模式启动', 'info');
            toast('Boss直聘模式: 请在岗位搜索页运行', 'info', 3000);

            if (location.pathname === '/web/geek/chat') {
                this.addLog('💬 检测到聊天页面，请切换到岗位搜索页', 'skip');
                this.running = false;
                updateUI(this);
                return;
            }

            // 检查是否在岗位列表页
            if (!location.pathname.includes('/jobs') && !location.pathname.includes('/geek/jobs')) {
                this.addLog('⚠ 请先到岗位搜索页再运行', 'error');
                this.running = false;
                updateUI(this);
                return;
            }

            let scrollTop = 0;

            while (this.running && this.completed < this.target) {
                const jobs = document.querySelectorAll('.job-list-container .job-card-box');
                if (jobs.length === 0) {
                    this.addLog('⚠ 未找到岗位卡片', 'error');
                    break;
                }

                this.addLog(`📋 本页 ${jobs.length} 个岗位`, 'info');

                for (const job of jobs) {
                    if (!this.running || this.completed >= this.target) break;

                    // 点击岗位
                    job.click();
                    await delay(1500);

                    // 获取岗位信息
                    const name = job.querySelector('.job-name')?.textContent?.trim() || '';
                    const location = job.querySelector('.company-location')?.textContent?.trim() || '';
                    const fullText = job.textContent || '';
                    const match = calcMatch(fullText);

                    // 检查城市
                    if (CONFIG.city && !location.includes(CONFIG.city)) {
                        this.addLog(`⏭ ${name} - 城市不匹配: ${location}`, 'skip');
                        scrollTop += 80;
                        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                        await delay(1000);
                        continue;
                    }

                    // 检查关键词
                    const hasKeyword = CONFIG.jobKeywords.some(k => name.includes(k) || fullText.includes(k));
                    if (!hasKeyword) {
                        this.addLog(`⏭ ${name} - 岗位不匹配 (${match.score}%)`, 'skip');
                        scrollTop += 80;
                        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                        await delay(1000);
                        continue;
                    }

                    // 点击"立即沟通"
                    const chatBtn = document.querySelector('a.op-btn.op-btn-chat');
                    if (!chatBtn || !chatBtn.textContent.includes('立即沟通')) {
                        this.addLog(`⏭ ${name} - 无立即沟通按钮`, 'skip');
                        scrollTop += 80;
                        window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                        await delay(1000);
                        continue;
                    }

                    chatBtn.click();
                    await delay(1500);

                    // 关闭弹窗（留在本页）
                    const stayBtn = document.querySelector('a.default-btn.cancel-btn');
                    if (stayBtn && stayBtn.textContent.includes('留在')) {
                        stayBtn.click();
                    }

                    this.completed++;
                    saveApplied(name);
                    this.addLog(`✅ [${this.completed}/${this.target}] ${name} (${match.score}%)`, 'success');
                    updateUI(this);

                    scrollTop += 80;
                    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                    await delay(CONFIG.batchInterval);
                }

                // Boss直聘是滚动加载，这里简单处理
                if (this.running && this.completed < this.target) {
                    scrollTop += 500;
                    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                    await delay(2000);
                }
            }

            if (this.completed >= this.target) {
                this.addLog(`🎉 达到目标！共投递 ${this.completed} 个`, 'success');
                toast(`🎉 投递完成！共 ${this.completed} 个`, 'success');
            }

            this.running = false;
            updateUI(this);
        },

        stop() {
            this.running = false;
            this.addLog('⏸ 已手动暂停', 'info');
        },

        addLog(msg, type = 'info') {
            this.logs.push({ msg, type, time: new Date().toLocaleTimeString() });
            renderLogs(this);
        }
    };

    // ============================================================
    // UI
    // ============================================================
    let currentEngine = null;

    function getEngine() {
        const host = location.host;
        if (host.includes('zhaopin')) return ZhaopinEngine;
        if (host.includes('zhipin')) return BossEngine;
        return null;
    }

    function createPanel() {
        if (document.getElementById('zpm-v3-panel')) return;

        const engine = getEngine();
        if (!engine) return;

        const panel = document.createElement('div');
        panel.id = 'zpm-v3-panel';
        panel.innerHTML = `
            <div class="header" id="zpm-v3-drag">
                <h3>🤖 ${engine.name}自动投递</h3>
                <span class="close-btn" id="zpm-v3-close">✕</span>
            </div>
            <div class="body">
                <div class="zpm-status-card">
                    <div class="zpm-status-grid">
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">状态</span>
                            <span class="zpm-status-value stopped" id="zpm-v3-status">就绪</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">匹配度</span>
                            <span class="zpm-status-value" id="zpm-v3-score">0%</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">已投递</span>
                            <span class="zpm-status-value" id="zpm-v3-count">0</span>
                        </div>
                        <div class="zpm-status-item">
                            <span class="zpm-status-label">目标</span>
                            <span class="zpm-status-value" id="zpm-v3-target">${CONFIG.deliverCount}</span>
                        </div>
                    </div>
                    <div class="zpm-progress-bar">
                        <div class="zpm-progress-fill" id="zpm-v3-progress"></div>
                    </div>
                </div>

                <div class="zpm-filter-group">
                    <button class="zpm-filter-btn active" data-filter="all">全部</button>
                    <button class="zpm-filter-btn" data-filter="gt10" style="background:#52c41a;color:#fff;border-color:#52c41a;">&gt;10%</button>
                    <button class="zpm-filter-btn" data-filter="gt30">&gt;30%</button>
                    <button class="zpm-filter-btn" data-filter="gt50">&gt;50%</button>
                    <button class="zpm-filter-btn" data-filter="gt70">&gt;70%</button>
                    <button class="zpm-filter-btn" data-filter="salary">💰 薪资合适</button>
                </div>

                <div style="font-size:12px;color:#666;margin:6px 0;">
                    🎯 ${CONFIG.city} · ${CONFIG.jobKeywords.slice(0,3).join('/')} · ${CONFIG.expectedSalary[0]/1000}-${CONFIG.expectedSalary[1]/1000}K
                </div>

                <button class="zpm-toggle-btn start" id="zpm-v3-toggle">
                    🚀 启动自动投递
                </button>

                <div class="zpm-log-area" id="zpm-v3-logs">
                    <div style="color:#999;text-align:center;padding:20px 0;">等待启动...</div>
                </div>
            </div>
            <div class="zpm-footer">v3.0 · 自动投递引擎 · ${CONFIG.saveApplied ? '💾 已去重' : ''}</div>
        `;
        document.body.appendChild(panel);

        // 关闭
        document.getElementById('zpm-v3-close').onclick = () => panel.remove();

        // 拖拽
        let isDragging = false, ox, oy;
        const hdr = document.getElementById('zpm-v3-drag');
        hdr.onmousedown = e => { isDragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop; };
        document.onmousemove = e => { if (isDragging) { panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; } };
        document.onmouseup = () => { isDragging = false; };

        // 筛选按钮
        panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(btn => {
            btn.onclick = () => {
                panel.querySelectorAll('.zpm-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFilter(btn.dataset.filter);
            };
        });

        // 启动按钮
        document.getElementById('zpm-v3-toggle').onclick = async () => {
            const engine = getEngine();
            if (!engine) return toast('不支持该网站', 'error');

            if (!engine.running) {
                // 检查设置
                if (location.host.includes('zhaopin') && !location.pathname.includes('/sou/') && !document.querySelector('.joblist-box')) {
                    toast('请先到智联招聘搜索页面', 'error', 3000);
                    return;
                }
                await engine.run(CONFIG.deliverCount);
            } else {
                engine.stop();
                document.getElementById('zpm-v3-toggle').textContent = '🚀 启动自动投递';
                document.getElementById('zpm-v3-toggle').className = 'zpm-toggle-btn start';
            }
        };

        // 先处理匹配度显示
        processJobCards();
    }

    function updateUI(engine) {
        const statusEl = document.getElementById('zpm-v3-status');
        const countEl = document.getElementById('zpm-v3-count');
        const targetEl = document.getElementById('zpm-v3-target');
        const progressEl = document.getElementById('zpm-v3-progress');
        const toggleEl = document.getElementById('zpm-v3-toggle');

        if (!statusEl) return;

        if (engine.running) {
            statusEl.textContent = '运行中';
            statusEl.className = 'zpm-status-value running';
            toggleEl.textContent = '⏹ 停止投递';
            toggleEl.className = 'zpm-toggle-btn stop';
        } else {
            statusEl.textContent = engine.completed > 0 ? '已完成' : '就绪';
            statusEl.className = 'zpm-status-value ' + (engine.completed > 0 ? 'done' : 'stopped');
            toggleEl.textContent = '🚀 启动自动投递';
            toggleEl.className = 'zpm-toggle-btn start';
        }

        countEl.textContent = engine.completed;
        targetEl.textContent = engine.target;
        const pct = Math.min(100, Math.round((engine.completed / engine.target) * 100));
        progressEl.style.width = pct + '%';
    }

    function renderLogs(engine) {
        const logArea = document.getElementById('zpm-v3-logs');
        if (!logArea) return;
        const recent = engine.logs.slice(-20);
        logArea.innerHTML = recent.map(l =>
            `<div class="zpm-log-item zpm-log-${l.type}">[${l.time}] ${l.msg}</div>`
        ).join('') || '<div style="color:#999;text-align:center;">暂无日志</div>';
        logArea.scrollTop = logArea.scrollHeight;
    }

    // ============================================================
    // 页面匹配度处理
    // ============================================================
    function processJobCards() {
        let cards = [];
        if (location.host.includes('zhaopin')) {
            cards = document.querySelectorAll('.positionlist__list .joblist-box__item, .joblist-box .jobcard, [class*="jobcard"]');
        } else if (location.host.includes('zhipin')) {
            cards = document.querySelectorAll('.job-card-box');
        }

        cards.forEach(card => {
            if (card.dataset.zpm3 === '1') return;
            card.dataset.zpm3 = '1';

            const text = card.textContent || '';
            const result = calcMatch(text);

            // 找标题元素
            const titleEl = card.querySelector('.jobinfo__name, .job-name, [class*="job-name"], a[class*="title"], h3');

            if (result.score > 0 && titleEl) {
                const badge = document.createElement('span');
                badge.className = `zpm-badge ${result.score > 10 ? 'zpm-badge-high' : result.score >= 5 ? 'zpm-badge-mid' : 'zpm-badge-low'}`;
                badge.textContent = result.score + '%';
                badge.title = `匹配: ${result.matched.join(', ')}`;
                titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);

                if (result.score > 10) {
                    card.classList.add('zpm-job-highlight');
                }
            }

            // 标记已投递
            const name = titleEl ? titleEl.textContent?.trim() : '';
            if (name && isApplied(name)) {
                card.classList.add('zpm-job-applied');
                const badge = document.createElement('span');
                badge.style.cssText = 'display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;background:#999;color:#fff;margin-left:4px;';
                badge.textContent = '✅ 已投';
                if (titleEl) titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
            }
        });
    }

    function applyFilter(state) {
        const cards = document.querySelectorAll('.positionlist__list .joblist-box__item, .joblist-box .jobcard, [class*="jobcard"], .job-card-box');
        cards.forEach(card => {
            const badge = card.querySelector('.zpm-badge');
            let show = true;

            // 从badge文本提取匹配度百分比
            let score = 0;
            if (badge) {
                const match = badge.textContent.match(/(\d+)/);
                if (match) score = parseInt(match[1]);
            }

            if (state === 'gt10') {
                show = score > 10;
            } else if (state === 'gt30') {
                show = score > 30;
            } else if (state === 'gt50') {
                show = score > 50;
            } else if (state === 'gt70') {
                show = score > 70;
            } else if (state === 'high') {
                show = badge && badge.classList.contains('zpm-badge-high');
            } else if (state === 'match') {
                show = badge && (badge.classList.contains('zpm-badge-high') || badge.classList.contains('zpm-badge-mid'));
            } else if (state === 'salary') {
                // 薪资合适 - 简单判断文本含K和数字
                const text = card.textContent || '';
                const salaryMatch = text.match(/(\d+)[-~到](\d+)K/i) || text.match(/(\d+)[-~到](\d+)k/i);
                if (salaryMatch) {
                    const low = parseInt(salaryMatch[1]) * 1000;
                    const high = parseInt(salaryMatch[2]) * 1000;
                    show = high >= CONFIG.expectedSalary[0] * 0.8;
                } else {
                    show = true; // 无法解析薪资就显示
                }
            }
            card.classList.toggle('zpm-job-hidden', !show);
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        const host = location.host;
        if (!host.includes('zhaopin') && !host.includes('zhipin')) return;

        createPanel();

        // 定时刷新匹配度
        let timer;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(processJobCards, 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(processJobCards, 1000);
        console.log('🤖 自动投递助手 v3.0 已启动');
        console.log(`📍 ${CONFIG.city} · 🎯 ${CONFIG.deliverCount} 个岗位`);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
