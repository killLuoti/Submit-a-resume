// ==UserScript==
// @name         智联招聘 - 智能岗位匹配助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动高亮匹配技能岗位，计算匹配度，快速筛选，一键定位适合你的工作
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
        expectedSalary: [7000, 10000],  // 期望薪资范围
        city: '佛山',
        jobTypes: ['IT技术支持', '运维工程师', '技术支持', '网络运维', '物联网'],
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
        .zpm-match-high {
            background: #52c41a;
            color: #fff;
        }
        .zpm-match-medium {
            background: #faad14;
            color: #fff;
        }
        .zpm-match-low {
            background: #ff4d4f;
            color: #fff;
        }

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
            width: 280px;
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
        #zpm-panel .zpm-header .zpm-close:hover {
            opacity: 1;
        }
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
        #zpm-panel .zpm-stat-item {
            text-align: center;
            flex: 1;
        }
        #zpm-panel .zpm-stat-num {
            font-size: 22px;
            font-weight: bold;
            color: #1890ff;
        }
        #zpm-panel .zpm-stat-label {
            font-size: 11px;
            color: #666;
        }
        #zpm-panel .zpm-filter-group {
            margin: 8px 0;
        }
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
        #zpm-panel .zpm-filter-btn.active {
            background: #1890ff;
            color: #fff;
            border-color: #1890ff;
        }
        #zpm-panel .zpm-filter-btn:hover {
            border-color: #1890ff;
        }
        #zpm-panel .zpm-footer {
            padding: 8px 16px;
            border-top: 1px solid #f0f0f0;
            font-size: 11px;
            color: #999;
            text-align: center;
        }
        .zpm-hidden-job {
            display: none !important;
        }
        .zpm-job-matched {
            outline: 2px solid #52c41a;
            outline-offset: 2px;
            background: #f6ffed !important;
        }

        /* ---- 岗位卡片上的薪资标签 ---- */
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

        /* ---- 一键投递按钮 ---- */
        .zpm-quick-apply {
            padding: 4px 12px;
            background: #ff6a00;
            color: #fff !important;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            margin-left: 8px;
        }
        .zpm-quick-apply:hover {
            background: #e65c00;
        }
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
            // 创建多种匹配模式
            const patterns = [
                skill.toLowerCase(),
                ...skill.toLowerCase().split(/[\/,，&]/).map(s => s.trim()).filter(s => s.length > 1)
            ];
            let isMatched = patterns.some(p => lower.includes(p));
            // 针对缩写和全称额外匹配
            if (!isMatched) {
                // 额外模糊匹配
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

    // 解析薪资文本为数字（元/月）
    function parseSalary(text) {
        if (!text) return null;
        // 匹配如 "7-10K" "7000-10000" "8-12k·13薪" "9-12K"
        const clean = text.replace(/[·\s]/g, '').toLowerCase();
        let match = clean.match(/(\d+\.?\d*)\s*[-~到]\s*(\d+\.?\d*)\s*k/i);
        if (match) {
            const low = parseFloat(match[1]) * 1000;
            const high = parseFloat(match[2]) * 1000;
            return { low, high };
        }
        match = clean.match(/(\d+)\s*[-~到]\s*(\d+)/);
        if (match) {
            const low = parseFloat(match[1]);
            const high = parseFloat(match[2]);
            // 判断是千还是元
            if (low < 1000 && high < 1000) {
                return { low: low * 1000, high: high * 1000 };
            }
            return { low, high };
        }
        // 单个数字带k
        match = clean.match(/(\d+\.?\d*)\s*k/i);
        if (match) {
            const val = parseFloat(match[1]) * 1000;
            return { low: val, high: val };
        }
        // 面议
        if (clean.includes('面议')) return null;
        return null;
    }

    // 薪资匹配度
    function salaryMatch(salary) {
        if (!salary) return 'unknown';
        const [expLow, expHigh] = PREFERENCES.expectedSalary;
        // 如果岗位薪资上限 >= 期望下限 * 0.8
        if (salary.high >= expLow * 0.8) return 'good';
        if (salary.high >= expLow * 0.5) return 'low';
        return 'bad';
    }

    // 高亮文本中的技能关键词
    function highlightSkills(text) {
        if (!text) return text;
        let result = text;
        const sorted = Object.keys(MY_SKILLS).sort((a, b) => b.length - a.length);
        for (const skill of sorted) {
            const regex = new RegExp(`(${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            result = result.replace(regex, '<span style="color:#1890ff;font-weight:bold;background:#e6f7ff;padding:0 2px;border-radius:2px;">$1</span>');
        }
        return result;
    }

    // ============================================================
    // 4. 页面处理
    // ============================================================

    function processJobCards() {
        // 智联招聘的职位卡片选择器（兼容多页面结构）
        const selectors = [
            '.joblist-box .jobcard',           // 新版列表
            '.job-list .job-card',             // 可能的结构
            '.position-list li',               // 旧版
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
            // 尝试通用方法：找包含薪资和职位名称的卡片
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
            const text = card.textContent || '';
            const html = card.innerHTML || '';

            // 计算匹配度
            const result = calcMatchScore(text);
            const salary = parseSalary(text);
            const sMatch = salaryMatch(salary);

            // 获取职位标题元素
            const titleEl = card.querySelector('a[class*="title"], a[class*="name"], [class*="title"] a, h3 a, h3, [class*="job-name"]');
            const titleText = titleEl ? titleEl.textContent || '' : '';
            const salaryEl = card.querySelector('[class*="salary"], [class*="pay"], [class*="money"]');

            stats.total++;

            // ---- 添加匹配度标签 ----
            if (result.score > 0 && titleEl) {
                let badgeClass = 'zpm-match-low';
                let badgeText = result.score + '%';
                if (result.score >= 60) {
                    badgeClass = 'zpm-match-high';
                    stats.highMatch++;
                } else if (result.score >= 30) {
                    badgeClass = 'zpm-match-medium';
                }

                const badge = document.createElement('span');
                badge.className = `zpm-match-badge ${badgeClass}`;
                badge.textContent = badgeText;
                badge.title = `匹配技能: ${result.matched.join(', ')}`;
                titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);

                if (result.score >= 60) {
                    stats.matched++;
                    card.classList.add('zpm-job-matched');
                }
            }

            // ---- 薪资标签 ----
            if (salaryEl && sMatch !== 'unknown') {
                const badge = document.createElement('span');
                if (sMatch === 'good') {
                    badge.className = 'zpm-salary-badge zpm-salary-good';
                    badge.textContent = '💰 薪资合适';
                } else {
                    badge.className = 'zpm-salary-badge zpm-salary-low';
                    badge.textContent = '⚠ 薪资偏低';
                }
                salaryEl.parentNode.insertBefore(badge, salaryEl.nextSibling);
            }

            // ---- 技能标签云 ----
            if (result.matched.length > 0 && titleEl) {
                const tagContainer = document.createElement('div');
                tagContainer.className = 'zpm-skill-tags';
                result.matched.forEach(skill => {
                    const tag = document.createElement('span');
                    tag.className = 'zpm-skill-tag matched';
                    tag.textContent = skill;
                    tagContainer.appendChild(tag);
                });
                // 插入到卡片末尾或标题下方
                const target = card.querySelector('[class*="company"]') || card.querySelector('p') || titleEl.parentNode;
                if (target && target.parentNode) {
                    target.parentNode.insertBefore(tagContainer, target.nextSibling);
                }
            }
        });

        return stats;
    }

    // ============================================================
    // 5. 浮动控制面板
    // ============================================================

    function createPanel() {
        // 如果已存在则不重复创建
        if (document.getElementById('zpm-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'zpm-panel';

        // 面板可见性状态
        let filterState = 'all'; // 'all' | 'matched' | 'high'

        panel.innerHTML = `
            <div class="zpm-header" id="zpm-panel-header">
                <span>🎯 智能岗位匹配</span>
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
                        <div class="zpm-stat-label">高匹配 (≥60%)</div>
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
                <div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:8px;">
                    <div style="font-size:12px;font-weight:bold;margin-bottom:4px;">💡 你匹配的技能</div>
                    <div style="font-size:11px;color:#666;max-height:120px;overflow-y:auto;">
                        ${Object.entries(MY_SKILLS)
                            .sort((a, b) => b[1].weight - a[1].weight)
                            .slice(0, 20)
                            .map(([k, v]) => `<span style="display:inline-block;padding:1px 6px;margin:2px;background:#e6f7ff;border-radius:4px;font-size:10px;">${k}(${v.weight})</span>`)
                            .join('')}
                    </div>
                </div>
                <div style="margin-top:6px;text-align:center;">
                    <button id="zpm-refresh-btn" style="padding:6px 20px;background:#1890ff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                        🔄 刷新匹配
                    </button>
                </div>
            </div>
            <div class="zpm-footer">
                ${PREFERENCES.city} · ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K · 为你定制
            </div>
        `;

        document.body.appendChild(panel);

        // ---- 关闭按钮 ----
        document.getElementById('zpm-panel-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // ---- 筛选按钮 ----
        panel.querySelectorAll('.zpm-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.zpm-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterState = btn.dataset.filter;
                applyFilter(filterState);
            });
        });

        // ---- 刷新按钮 ----
        document.getElementById('zpm-refresh-btn').addEventListener('click', () => {
            refreshStats();
        });

        // ---- 拖拽 ----
        let isDragging = false, offsetX, offsetY;
        const header = document.getElementById('zpm-panel-header');
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                panel.style.left = (e.clientX - offsetX) + 'px';
                panel.style.top = (e.clientY - offsetY) + 'px';
                panel.style.right = 'auto';
            }
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        return panel;
    }

    // 应用筛选
    function applyFilter(state) {
        const cards = document.querySelectorAll('.zpm-job-matched, .jobcard, [class*="jobcard"], [class*="job-card"], [class*="job-item"]');
        // 优先找带匹配标签的
        const jobElements = document.querySelectorAll('[class*="job"]');
        cards.forEach(card => {
            const badge = card.querySelector('.zpm-match-badge');
            const salaryBadge = card.querySelector('.zpm-salary-badge');
            let shouldShow = true;

            if (state === 'matched') {
                const hasHighMatch = badge && badge.classList.contains('zpm-match-high');
                shouldShow = hasHighMatch;
            } else if (state === 'salary') {
                shouldShow = salaryBadge && salaryBadge.classList.contains('zpm-salary-good');
            }

            card.classList.toggle('zpm-hidden-job', !shouldShow);
        });
    }

    // 刷新统计
    function refreshStats() {
        const stats = processJobCards();
        document.getElementById('zpm-stat-total').textContent = stats.total;
        document.getElementById('zpm-stat-matched').textContent = stats.matched;
        document.getElementById('zpm-stat-high').textContent = stats.highMatch;
    }

    // ============================================================
    // 6. 初始化
    // ============================================================

    function init() {
        // 创建面板
        createPanel();

        // 延迟执行以确保页面加载完成
        setTimeout(() => {
            refreshStats();
        }, 1000);

        // 监听页面变化（智联是SPA，需要监听DOM变化）
        let timeout = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                refreshStats();
            }, 500);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // 页面可见性变化时刷新
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(refreshStats, 500);
            }
        });

        console.log('🎯 智联招聘智能匹配助手已启动！');
        console.log(`📊 已加载 ${Object.keys(MY_SKILLS).length} 项技能`);
        console.log(`📍 目标城市: ${PREFERENCES.city}`);
        console.log(`💰 期望薪资: ${PREFERENCES.expectedSalary[0]/1000}-${PREFERENCES.expectedSalary[1]/1000}K`);
    }

    // 等待页面加载完成后启动
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
