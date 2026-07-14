// app.js — 投递管理后台前端逻辑（原生 JS，无构建步骤）
const API = '/api';

// ---- Tab 切换 ----
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ['overview', 'records', 'config'].forEach(t => {
            document.getElementById(`tab-${t}`).style.display = (t === btn.dataset.tab) ? '' : 'none';
        });
        if (btn.dataset.tab === 'records') loadRecords();
        if (btn.dataset.tab === 'config') loadConfig();
        syncFiltersToURL();
    });
});

async function api(path, opts) {
    try {
        const res = await fetch(API + path, opts);
        const data = await res.json();
        if (!res.ok) {
            const err = new Error(data.error || `请求失败: ${res.status}`);
            err.code = data.code;
            err.status = res.status;
            throw err;
        }
        return data;
    } catch (err) {
        if (err.name === 'SyntaxError') {
            throw new Error('服务器返回了无效的响应格式');
        }
        throw err;
    }
}

// ============================================================
// WebSocket 实时推送客户端
// ============================================================
let ws = null;
let wsReconnectTimer = null;
let wsReconnectDelay = 1000; // 初始重连间隔 1s，指数退避最大 30s

function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('🔌 WebSocket 已连接');
        wsReconnectDelay = 1000; // 重置退避
        updateWsStatus('connected');
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWsMessage(msg);
        } catch (e) { /* 忽略解析失败 */ }
    };

    ws.onclose = () => {
        console.log('🔌 WebSocket 已断开，准备重连...');
        updateWsStatus('disconnected');
        scheduleReconnect();
    };

    ws.onerror = () => {
        updateWsStatus('disconnected');
    };
}

function scheduleReconnect() {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    updateWsStatus('reconnecting');
    wsReconnectTimer = setTimeout(() => {
        console.log(`🔌 尝试重连 (延迟 ${wsReconnectDelay}ms)`);
        connectWebSocket();
    }, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 30000); // 指数退避，最大 30s
}

function updateWsStatus(state) {
    const dot = document.getElementById('ws-dot');
    const status = document.getElementById('ws-status');
    if (!dot || !status) return;
    dot.className = 'dot' + (state === 'connected' ? '' : ` ${state}`);
    status.className = 'ws-status' + (state === 'connected' ? '' : ` ${state}`);
    if (state === 'connected') status.textContent = '⚡ 实时';
    else if (state === 'reconnecting') status.textContent = '🔄 重连中...';
    else status.textContent = '❌ 已断开';
}

function handleWsMessage(msg) {
    const { type, data } = msg;
    // 数据变更事件：刷新当前页面的数据
    const dataEvents = ['data:create', 'data:update', 'data:delete', 'data:batch-delete',
        'data:batch-status', 'data:import', 'data:restore'];
    if (dataEvents.includes(type)) {
        console.log(`📡 收到实时更新: ${type}`, data);
        // 刷新当前活跃 Tab 的数据
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            if (activeTab.dataset.tab === 'overview') loadOverview();
            if (activeTab.dataset.tab === 'records') loadRecords();
            if (activeTab.dataset.tab === 'config') loadConfig();
        }
        // 显示 Toast 通知
        if (type === 'data:create' && data.record) {
            showToast(`新增投递: ${data.record.name} (${data.record.company})`, 'info');
        } else if (type === 'data:delete') {
            showToast('有记录被删除', 'info');
        } else if (type === 'data:import') {
            showToast(`导入完成: 新增 ${data.created} 条`, 'info');
        } else if (type === 'data:restore') {
            showToast(`数据已恢复: ${data.restored}`, 'info');
        } else if (type === 'config:update') {
            showToast('配置已更新', 'info');
        }
    } else if (type === 'config:update') {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'config') loadConfig();
        showToast('配置已被修改', 'info');
    }
}

// 启动 WebSocket 连接
connectWebSocket();

// ---- 投递状态元信息（v1.2.0）----
// 合法状态取值由后端 db.js 的 ALL_STATUSES 决定，这里启动时拉一次并缓存，
// 前端不再硬编码一份状态列表，以后加新状态只需要改后端。
let STATUS_META = { stages: ['已投递', '已回复', '面试中', 'offer'], rejected: '已拒绝', all: ['已投递', '已回复', '面试中', 'offer', '已拒绝'] };
async function loadStatusMeta() {
    try {
        STATUS_META = await api('/meta/statuses');
    } catch (e) {
        console.warn('获取状态元信息失败，使用前端内置的默认值:', e.message);
    }
    const sel = document.getElementById('filter-status');
    if (sel) sel.innerHTML = '<option value="">全部状态</option>' + STATUS_META.all.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}
const STATUS_CSS_CLASS = { '已投递': 'st-applied', '已回复': 'st-replied', '面试中': 'st-interview', 'offer': 'st-offer', '已拒绝': 'st-rejected' };
function statusClass(status) { return STATUS_CSS_CLASS[status] || 'st-applied'; }

function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// 总览
// ============================================================
let dailyChart, platformChart, funnelChart;

async function loadOverview() {
    const [overview, daily, skills, recent, funnel, salaryStats, platformFunnel] = await Promise.all([
        api('/stats/overview'),
        api('/stats/daily?days=14'),
        api('/stats/skills?top=10'),
        api('/applications?limit=12'),
        api('/stats/funnel'),
        api('/stats/salary'),
        api('/stats/platform-funnel'),
    ]);

    document.getElementById('stat-total').textContent = overview.total;
    document.getElementById('stat-today').textContent = overview.todayCount;
    document.getElementById('stat-avg').textContent = overview.avgScore + '%';
    document.getElementById('stat-platforms').textContent = Object.keys(overview.byPlatform).length;

    // ===== 修复说明 =====
    // 之前这里两个图表的渲染代码没有任何 try/catch，且没有检测 Chart.js 是否真的加载成功。
    // 一旦 CDN（cdnjs.cloudflare.com）因为网络问题/广告拦截插件/防火墙而没加载成功，
    // `new Chart(...)` 会抛出 "Chart is not defined"，由于没有捕获，会导致 loadOverview() 
    // 后面所有代码（活动日志、技能列表、平台筛选下拉框）全部执行不到，且看起来毫无提示地"什么都不显示"。
    // 另外，平台分布图在无数据时会用 outerHTML 直接把 <canvas> 整个替换成提示文字 div，
    // 这个 canvas 元素之后就永久消失了——如果 loadOverview() 之后又被调用一次（比如刷新逻辑），
    // 再去 getContext('2d') 会因为元素不存在而报错。这里也一并修复，改成显示/隐藏而不是删除元素。
    document.getElementById('funnel-rejected-badge').textContent = `已拒绝 ${funnel.rejected}`;

    if (typeof Chart === 'undefined') {
        const msg = '⚠ 图表库(Chart.js)加载失败，通常是网络问题或被浏览器插件拦截。请检查网络后刷新页面（F12 控制台/网络面板可看到具体报错）。';
        console.error(msg);
        ['chart-daily', 'chart-platform', 'chart-funnel'].forEach(id => {
            const el = document.getElementById(id);
            const alreadyWarned = el && el.nextElementSibling && el.nextElementSibling.hasAttribute('data-chartjs-warning');
            if (el && !alreadyWarned) el.insertAdjacentHTML('afterend', `<div class="empty-state" data-chartjs-warning>${msg}</div>`);
        });
    } else {
        // 转化漏斗（用横向柱状图模拟漏斗效果：阶段越靠后，柱子通常越短，直观体现转化率）
        try {
            const ctxFunnel = document.getElementById('chart-funnel').getContext('2d');
            const stageLabels = funnel.stages.map(s => s.stage);
            const stageCounts = funnel.stages.map(s => s.count);
            if (funnelChart) { funnelChart.destroy(); funnelChart = null; }
            funnelChart = new Chart(ctxFunnel, {
                type: 'bar',
                data: {
                    labels: stageLabels,
                    datasets: [{
                        data: stageCounts,
                        backgroundColor: ['#165dff', '#3d7dff', '#7ea3ff', '#52c41a'],
                        borderRadius: 4,
                    }],
                },
                options: {
                    indexAxis: 'y', // 横向柱状图
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#7c8aa3', stepSize: 1 }, grid: { color: '#232d3d' } },
                        y: { ticks: { color: '#e7ebf3', font: { size: 12 } }, grid: { display: false } },
                    },
                },
            });
        } catch (e) {
            console.error('转化漏斗图渲染失败:', e);
        }

        // 趋势图
        try {
            const ctx1 = document.getElementById('chart-daily').getContext('2d');
            const labels = daily.map(d => d.date.slice(5));
            const values = daily.map(d => d.count);
            if (dailyChart) dailyChart.destroy();
            dailyChart = new Chart(ctx1, {
                type: 'bar',
                data: { labels, datasets: [{ data: values, backgroundColor: '#165dff', borderRadius: 4 }] },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#7c8aa3', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#7c8aa3', stepSize: 1 }, grid: { color: '#232d3d' } },
                    },
                },
            });
        } catch (e) {
            console.error('趋势图渲染失败:', e);
        }

        // 平台分布
        try {
            const platformCanvas = document.getElementById('chart-platform');
            const emptyState = document.getElementById('chart-platform-empty');
            const platforms = Object.keys(overview.byPlatform);
            const counts = Object.values(overview.byPlatform);
            if (platformChart) { platformChart.destroy(); platformChart = null; }
            if (platforms.length === 0) {
                if (platformCanvas) platformCanvas.style.display = 'none';
                if (emptyState) emptyState.style.display = '';
                else if (platformCanvas) platformCanvas.insertAdjacentHTML('afterend', '<div class="empty-state" id="chart-platform-empty">暂无数据</div>');
            } else {
                if (emptyState) emptyState.style.display = 'none';
                if (platformCanvas) {
                    platformCanvas.style.display = '';
                    const ctx2 = platformCanvas.getContext('2d');
                    platformChart = new Chart(ctx2, {
                        type: 'doughnut',
                        data: {
                            labels: platforms,
                            datasets: [{ data: counts, backgroundColor: ['#165dff', '#52c41a', '#faad14', '#ff4d4f', '#8891a7'] }],
                        },
                        options: { plugins: { legend: { position: 'bottom', labels: { color: '#e7ebf3', font: { size: 11 } } } } },
                    });
                }
            }
        } catch (e) {
            console.error('平台分布图渲染失败:', e);
        }
    }

    // 活动日志
    const logBox = document.getElementById('activity-log');
    if (recent.items.length === 0) {
        logBox.innerHTML = '<div class="empty-state">暂无投递记录</div>';
    } else {
        logBox.innerHTML = recent.items.map(x => `
            <div class="row">
                <span class="t">${fmtTime(x.time)}</span>
                <span class="score">${x.score}%</span>
                <span class="name">${escapeHtml(x.name)}</span>
                <span class="salary-tag">${x.salary ? escapeHtml(x.salary) : ''}</span>
                <span class="company">${escapeHtml(x.company)}</span>
            </div>
        `).join('');
    }

    // 技能频率
    const skillBox = document.getElementById('skill-list');
    if (skills.length === 0) {
        skillBox.innerHTML = '<div class="empty-state">暂无数据</div>';
    } else {
        const max = Math.max(...skills.map(s => s.count));
        skillBox.innerHTML = skills.map(s => `
            <div class="skill-row">
                <span class="skill-name">${escapeHtml(s.skill)}</span>
                <span class="skill-track"><span class="skill-fill" style="width:${(s.count/max)*100}%"></span></span>
                <span class="skill-count">${s.count}</span>
            </div>
        `).join('');
    }

    // 平台筛选下拉框同步
    const sel = document.getElementById('filter-platform');
    const currentVal = sel.value;
    const platformNames = Object.keys(overview.byPlatform);
    sel.innerHTML = '<option value="">全部平台</option>' + platformNames.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    sel.value = currentVal;

    // ===== 薪资分布图 =====
    if (typeof Chart !== 'undefined') {
        try {
            const salaryCanvas = document.getElementById('chart-salary');
            if (salaryStats.count > 0) {
                document.getElementById('salary-avg').textContent = `平均 ${Math.round(salaryStats.avgLow / 1000)}K-${Math.round(salaryStats.avgHigh / 1000)}K (${salaryStats.count}条)`;
                const ctxSalary = salaryCanvas.getContext('2d');
                if (window._salaryChart) window._salaryChart.destroy();
                window._salaryChart = new Chart(ctxSalary, {
                    type: 'bar',
                    data: {
                        labels: salaryStats.distribution.map(d => d.label),
                        datasets: [{
                            data: salaryStats.distribution.map(d => d.count),
                            backgroundColor: ['#7ea3ff', '#3d7dff', '#165dff', '#0e42b8', '#0a3080', '#071f50'],
                            borderRadius: 4,
                        }],
                    },
                    options: {
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { color: '#7c8aa3', font: { size: 10 } }, grid: { display: false } },
                            y: { ticks: { color: '#7c8aa3', stepSize: 1 }, grid: { color: '#232d3d' }, beginAtZero: true },
                        },
                    },
                });
            } else {
                if (window._salaryChart) { window._salaryChart.destroy(); window._salaryChart = null; }
                document.getElementById('salary-avg').textContent = '暂无数据';
                salaryCanvas.style.display = 'none';
                if (!salaryCanvas.nextElementSibling?.hasAttribute('data-chartjs-warning')) {
                    salaryCanvas.insertAdjacentHTML('afterend', '<div class="empty-state" data-chartjs-warning>暂无可解析的薪资数据</div>');
                }
            }
        } catch (e) { console.error('薪资分布图渲染失败:', e); }
    }

    // ===== 平台转化率对比 =====
    const pfBox = document.getElementById('platform-funnel-list');
    if (platformFunnel.length === 0) {
        pfBox.innerHTML = '<div class="empty-state">暂无数据</div>';
    } else {
        const stageColors = { '已投递': 'st-applied', '已回复': 'st-replied', '面试中': 'st-interview', 'offer': 'st-offer' };
        pfBox.innerHTML = platformFunnel.map(pf => {
            const total = pf.total;
            const segments = pf.stages.map(s => {
                const pct = total > 0 ? (s.count / total * 100) : 0;
                return `<div class="pf-bar-seg ${stageColors[s.stage] || ''}" style="width:${pct}%" title="${s.stage}: ${s.count}"></div>`;
            }).join('');
            return `
                <div class="pf-row">
                    <div class="pf-header">
                        <span class="pf-name">${escapeHtml(pf.platform)}</span>
                        <span class="pf-total">${total}条${pf.rejected > 0 ? ` · 已拒绝${pf.rejected}` : ''}</span>
                    </div>
                    <div class="pf-bar-track">${segments}</div>
                </div>
            `;
        }).join('') + `
            <div class="pf-legend">
                <span class="leg-applied">已投递</span>
                <span class="leg-replied">已回复</span>
                <span class="leg-interview">面试中</span>
                <span class="leg-offer">offer</span>
                <span class="leg-rejected">已拒绝</span>
            </div>
        `;
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// 投递记录表
// ============================================================
async function loadRecords() {
    const q = document.getElementById('filter-q').value.trim();
    const platform = document.getElementById('filter-platform').value;
    const minScore = document.getElementById('filter-score').value;
    const status = document.getElementById('filter-status').value;
    const sortVal = document.getElementById('filter-sort').value;
    const params = new URLSearchParams({ limit: 300 });
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (minScore && minScore !== '0') params.set('minScore', minScore);
    if (status) params.set('status', status);

    const data = await api('/applications?' + params.toString());
    const box = document.getElementById('records-table');
    if (data.items.length === 0) {
        box.innerHTML = '<div class="empty-state">没有符合条件的记录</div>';
        return;
    }

    // 客户端排序
    const [sortKey, sortDir] = sortVal.split('-');
    data.items.sort((a, b) => {
        let va, vb;
        if (sortKey === 'score') {
            va = a.score || 0; vb = b.score || 0;
        } else {
            va = new Date(a.time || 0).getTime(); vb = new Date(b.time || 0).getTime();
        }
        return sortDir === 'asc' ? va - vb : vb - va;
    });

    const statusOptions = STATUS_META.all.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    box.innerHTML = data.items.map(x => {
        const st = x.status || STATUS_META.stages[0];
        return `
        <div class="row" data-id="${x.id}">
            <input type="checkbox" class="row-cb" data-id="${x.id}">
            <span class="t">${fmtTime(x.time)}</span>
            <span class="score">${x.score}%</span>
            <span class="name">${escapeHtml(x.name)}</span>
            <span class="company">${escapeHtml(x.company)} · ${escapeHtml(x.platform)}</span>
            <span class="salary-tag">${x.salary ? escapeHtml(x.salary) : ''}</span>
            <select class="status-select ${statusClass(st)}" title="更新投递状态">${statusOptions}</select>
            <span class="edit" title="编辑公司名">✎</span>
            <span class="del" title="删除">✕</span>
        </div>
    `;
    }).join('');
    // 渲染完之后再统一设置每个 select 的当前值——放在拼接的 HTML 字符串里用变量插值容易因为
    // HTML 转义/属性写法出错，用 DOM API 设置 .value 更稳妥。
    box.querySelectorAll('.row').forEach(row => {
        const id = row.dataset.id;
        const item = data.items.find(x => x.id === id);
        const sel = row.querySelector('.status-select');
        sel.value = item.status || STATUS_META.stages[0];
        sel.addEventListener('change', async () => {
            const newStatus = sel.value;
            const prevClass = sel.className;
            try {
                const res = await fetch(`${API}/applications/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                if (!res.ok) throw new Error('保存失败: ' + res.status);
                sel.className = `status-select ${statusClass(newStatus)}`;
                showToast(`状态已更新为: ${newStatus}`, 'success');
            } catch (err) {
                showToast('更新状态失败: ' + err.message, 'error');
                sel.className = prevClass;
                sel.value = item.status || STATUS_META.stages[0]; // 恢复原值
            }
        });
    });
    box.querySelectorAll('.edit').forEach(el => {
        el.addEventListener('click', async (e) => {
            const row = e.target.closest('.row');
            const id = row.dataset.id;
            const companyEl = row.querySelector('.company');
            const currentCompany = companyEl.textContent.split(' · ')[0];
            const next = prompt('修改公司名：', currentCompany);
            if (next === null || next.trim() === '' || next === currentCompany) return;
            try {
                await fetch(`${API}/applications/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company: next.trim() }),
                });
                showToast('公司名已更新', 'success');
                loadRecords();
            } catch (err) {
                showToast('修改失败: ' + err.message, 'error');
            }
        });
    });
    box.querySelectorAll('.del').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const row = e.target.closest('.row');
            const id = row.dataset.id;
            if (!confirm('确认删除这条投递记录？')) return;
            const res = await fetch(`${API}/applications/${id}`, { method: 'DELETE' });
            if (!res.ok) { showToast('删除失败，该记录可能已不存在', 'error'); return; }
            row.remove();
            showToast('已删除', 'success');
        });
    });
    // 行点击打开详情（排除 checkbox/select/编辑/删除按钮的点击）
    box.querySelectorAll('.row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('input[type="checkbox"]') || e.target.closest('select') ||
                e.target.closest('.edit') || e.target.closest('.del')) return;
            showRecordDetail(row.dataset.id);
        });
    });
}

// ============================================================
// 记录详情模态框
// ============================================================
const detailOverlay = document.getElementById('detail-modal-overlay');
document.getElementById('detail-modal-close').addEventListener('click', () => detailOverlay.style.display = 'none');
document.getElementById('detail-modal-close-btn').addEventListener('click', () => detailOverlay.style.display = 'none');
detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) detailOverlay.style.display = 'none'; });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailOverlay.style.display !== 'none') detailOverlay.style.display = 'none';
});

async function showRecordDetail(id) {
    try {
        const record = await api(`/applications/${id}`);
        const grid = document.getElementById('detail-grid');
        const st = record.status || STATUS_META.stages[0];
        const matchedTags = (record.matched || []).map(s => `<span class="detail-tag">${escapeHtml(s)}</span>`).join('');
        grid.innerHTML = `
            <div class="detail-item full"><div class="detail-label">岗位名称</div><div class="detail-value">${escapeHtml(record.name)}</div></div>
            <div class="detail-item"><div class="detail-label">公司</div><div class="detail-value">${escapeHtml(record.company)}</div></div>
            <div class="detail-item"><div class="detail-label">平台</div><div class="detail-value">${escapeHtml(record.platform)}</div></div>
            <div class="detail-item"><div class="detail-label">薪资</div><div class="detail-value mono">${escapeHtml(record.salary || '–')}</div></div>
            <div class="detail-item"><div class="detail-label">匹配度</div><div class="detail-value mono">${record.score}%</div></div>
            <div class="detail-item"><div class="detail-label">状态</div><div class="detail-value"><span class="status-select ${statusClass(st)}" style="border:none;padding:0;">${escapeHtml(st)}</span></div></div>
            <div class="detail-item"><div class="detail-label">城市</div><div class="detail-value">${escapeHtml(record.city || '–')}</div></div>
            <div class="detail-item"><div class="detail-label">经验要求</div><div class="detail-value mono">${escapeHtml(record.experience || '–')}</div></div>
            <div class="detail-item"><div class="detail-label">投递时间</div><div class="detail-value mono">${fmtTime(record.time)}</div></div>
            <div class="detail-item"><div class="detail-label">曾达最远阶段</div><div class="detail-value">${escapeHtml(record.stageReached || st)}</div></div>
            <div class="detail-item full"><div class="detail-label">匹配技能</div><div class="detail-value">${matchedTags || '<span style="color:var(--text-dim)">–</span>'}</div></div>
            ${record.description ? `<div class="detail-item full"><div class="detail-label">职位描述</div><div class="detail-value detail-desc">${escapeHtml(record.description)}</div></div>` : ''}
            <div class="detail-item full"><div class="detail-label">记录 ID</div><div class="detail-value mono" style="font-size:11px;color:var(--text-dim);">${escapeHtml(record.id)}</div></div>
        `;
        detailOverlay.style.display = '';
    } catch (err) {
        showToast('加载记录详情失败: ' + err.message, 'error');
    }
}

document.getElementById('filter-refresh').addEventListener('click', () => { syncFiltersToURL(); loadRecords(); });
document.getElementById('filter-q').addEventListener('keydown', e => { if (e.key === 'Enter') { syncFiltersToURL(); loadRecords(); } });
document.getElementById('filter-platform').addEventListener('change', () => { syncFiltersToURL(); loadRecords(); });
document.getElementById('filter-score').addEventListener('change', () => { syncFiltersToURL(); loadRecords(); });
document.getElementById('filter-status').addEventListener('change', () => { syncFiltersToURL(); loadRecords(); });
document.getElementById('filter-sort').addEventListener('change', () => { syncFiltersToURL(); loadRecords(); });

// ---- 批量操作 ----
function getRecordsBox() { return document.getElementById('records-table'); }

function getSelectedIds() {
    return Array.from(getRecordsBox().querySelectorAll('.row-cb:checked')).map(cb => cb.dataset.id);
}

getRecordsBox().addEventListener('change', () => {
    const selected = getSelectedIds();
    const batchBar = document.getElementById('batch-bar');
    const batchCount = document.getElementById('batch-count');
    if (selected.length > 0) {
        batchBar.style.display = '';
        batchCount.textContent = `已选 ${selected.length} 条`;
    } else {
        batchBar.style.display = 'none';
    }
    // 同步全选复选框状态
    const allCbs = getRecordsBox().querySelectorAll('.row-cb');
    const checkedCbs = getRecordsBox().querySelectorAll('.row-cb:checked');
    document.getElementById('select-all-cb').checked = allCbs.length > 0 && allCbs.length === checkedCbs.length;
});

document.getElementById('select-all-cb').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const recordsBox = getRecordsBox();
    recordsBox.querySelectorAll('.row-cb').forEach(cb => cb.checked = checked);
    recordsBox.dispatchEvent(new Event('change'));
});

// 批量状态修改
document.getElementById('batch-status-select').addEventListener('change', (e) => {
    document.getElementById('batch-status-btn').style.display = e.target.value ? '' : 'none';
});

document.getElementById('batch-status-btn').addEventListener('click', async () => {
    const ids = getSelectedIds();
    const status = document.getElementById('batch-status-select').value;
    if (ids.length === 0 || !status) return;
    try {
        const res = await fetch(`${API}/applications/batch/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失败');
        showToast(`已更新 ${data.updated} 条记录状态为: ${status}`, 'success');
        document.getElementById('batch-status-select').value = '';
        document.getElementById('batch-status-btn').style.display = 'none';
        document.getElementById('select-all-cb').checked = false;
        loadRecords();
    } catch (err) {
        showToast('批量修改失败: ' + err.message, 'error');
    }
});

// 批量删除
document.getElementById('batch-delete-btn').addEventListener('click', async () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    if (!confirm(`确认删除选中的 ${ids.length} 条记录？此操作不可撤销。`)) return;
    try {
        const res = await fetch(`${API}/applications/batch/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '删除失败');
        showToast(`已删除 ${data.deleted} 条记录`, 'success');
        document.getElementById('select-all-cb').checked = false;
        loadRecords();
    } catch (err) {
        showToast('批量删除失败: ' + err.message, 'error');
    }
});

// 填充批量状态修改下拉框
function loadBatchStatusOptions() {
    const sel = document.getElementById('batch-status-select');
    sel.innerHTML = '<option value="">批量修改状态...</option>' +
        STATUS_META.all.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

// ---- 导出下拉菜单 ----
const exportBtn = document.getElementById('export-btn');
const exportMenu = document.getElementById('export-menu');
exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.style.display = exportMenu.style.display === 'none' ? '' : 'none';
});
document.addEventListener('click', () => { exportMenu.style.display = 'none'; });

function getExportParams() {
    const q = document.getElementById('filter-q').value.trim();
    const platform = document.getElementById('filter-platform').value;
    const minScore = document.getElementById('filter-score').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (minScore && minScore !== '0') params.set('minScore', minScore);
    if (status) params.set('status', status);
    return params.toString();
}

document.getElementById('export-csv-btn').addEventListener('click', () => {
    window.open(`${API}/applications/export.csv?${getExportParams()}`, '_blank');
    exportMenu.style.display = 'none';
});

document.getElementById('export-json-btn').addEventListener('click', () => {
    window.open(`${API}/applications/export.json?${getExportParams()}`, '_blank');
    exportMenu.style.display = 'none';
});

// ---- CSV 导入 ----
const importOverlay = document.getElementById('import-modal-overlay');
const importFileInput = document.getElementById('import-file-input');
const importPasteInput = document.getElementById('import-paste-input');
let importCsvText = '';

function closeImportModal() {
    importOverlay.style.display = 'none';
    importFileInput.value = '';
    importPasteInput.value = '';
    importCsvText = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-submit-btn').disabled = true;
}

document.getElementById('import-btn').addEventListener('click', () => { importOverlay.style.display = ''; });
document.getElementById('import-modal-close').addEventListener('click', closeImportModal);
document.getElementById('import-modal-cancel').addEventListener('click', closeImportModal);
importOverlay.addEventListener('click', (e) => { if (e.target === importOverlay) closeImportModal(); });

// 导入 Tab 切换
document.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('import-file-panel').style.display = tab.dataset.tab === 'file' ? '' : 'none';
        document.getElementById('import-paste-panel').style.display = tab.dataset.tab === 'paste' ? '' : 'none';
    });
});

// 文件选择
document.getElementById('import-file-btn').addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        importCsvText = ev.target.result;
        previewImport(importCsvText);
    };
    reader.readAsText(file);
});

// 拖拽上传
const dropzone = document.getElementById('import-dropzone');
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        importCsvText = ev.target.result;
        previewImport(importCsvText);
    };
    reader.readAsText(file);
});

// 粘贴文本
importPasteInput.addEventListener('input', () => {
    importCsvText = importPasteInput.value;
    if (importCsvText.trim()) previewImport(importCsvText);
    else document.getElementById('import-preview').style.display = 'none';
});

// 预览导入数据（简单前端解析）
function previewImport(csvText) {
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-submit-btn').disabled = true;
        return;
    }
    const count = lines.length - 1;
    document.getElementById('import-count').textContent = count;
    // 显示前5行预览
    const previewLines = lines.slice(1, 6);
    document.getElementById('import-preview-list').innerHTML = previewLines.map(l => {
        const cols = l.split(',').map(c => c.trim().replace(/"/g, ''));
        return `<div class="import-preview-item">${escapeHtml(cols[0] || '')} - ${escapeHtml(cols[1] || '')}</div>`;
    }).join('') + (count > 5 ? `<div class="import-preview-item" style="color:var(--text-dim);">...还有 ${count - 5} 条</div>` : '');
    document.getElementById('import-preview').style.display = '';
    document.getElementById('import-submit-btn').disabled = false;
}

// 提交导入
document.getElementById('import-submit-btn').addEventListener('click', async () => {
    if (!importCsvText.trim()) return;
    const btn = document.getElementById('import-submit-btn');
    btn.disabled = true;
    btn.textContent = '导入中...';
    try {
        const res = await fetch(`${API}/applications/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv: importCsvText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '导入失败');
        showToast(data.message, 'success');
        closeImportModal();
        loadRecords();
        loadOverview();
    } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '确认导入';
    }
});

// ============================================================
// 投递策略配置
// ============================================================
async function loadConfig() {
    const cfg = await api('/config');
    document.getElementById('cfg-city').value = cfg.city || '';
    document.getElementById('cfg-daily-limit').value = cfg.dailyLimit || 30;
    document.getElementById('cfg-keywords').value = (cfg.jobKeywords || []).join(', ');
    document.getElementById('cfg-black-kw').value = (cfg.blacklistKeywords || []).join(', ');
    document.getElementById('cfg-black-co').value = (cfg.blacklistCompanies || []).join(', ');
    document.getElementById('cfg-negative').value = (cfg.negativeSignals || []).join(', ');
    document.getElementById('cfg-sal-low').value = (cfg.expectedSalary || [0,0])[0];
    document.getElementById('cfg-sal-high').value = (cfg.expectedSalary || [0,0])[1];
    document.getElementById('cfg-my-years').value = cfg.myYearsExperience || 0;
    document.getElementById('cfg-exp-gap').value = cfg.maxExperienceGap || 0;
}

document.getElementById('cfg-save-btn').addEventListener('click', async () => {
    const body = {
        city: document.getElementById('cfg-city').value.trim(),
        dailyLimit: parseInt(document.getElementById('cfg-daily-limit').value) || 30,
        jobKeywords: document.getElementById('cfg-keywords').value.split(',').map(s => s.trim()).filter(Boolean),
        blacklistKeywords: document.getElementById('cfg-black-kw').value.split(',').map(s => s.trim()).filter(Boolean),
        blacklistCompanies: document.getElementById('cfg-black-co').value.split(',').map(s => s.trim()).filter(Boolean),
        negativeSignals: document.getElementById('cfg-negative').value.split(',').map(s => s.trim()).filter(Boolean),
        expectedSalary: [parseInt(document.getElementById('cfg-sal-low').value) || 0, parseInt(document.getElementById('cfg-sal-high').value) || 999999],
        myYearsExperience: parseInt(document.getElementById('cfg-my-years').value) || 0,
        maxExperienceGap: parseInt(document.getElementById('cfg-exp-gap').value) || 0,
    };
    const res = await fetch(API + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    const btn = document.getElementById('cfg-save-btn');
    const old = btn.textContent;
    if (data.rejected && data.rejected.length > 0) {
        // 后端按字段类型校验后丢弃的字段列表——正常情况下不会出现，出现了说明前端拼的数据类型有问题，需要排查
        showToast(`部分字段未生效: ${data.rejected.join(', ')}`, 'warning');
    } else {
        btn.textContent = '已保存 ✓';
        showToast('策略已保存', 'success');
        setTimeout(() => btn.textContent = old, 1500);
    }
});

// ---- 备份管理 ----
async function loadBackups() {
    try {
        const backups = await api('/backups');
        const box = document.getElementById('backup-list');
        if (backups.length === 0) {
            box.innerHTML = '<div class="empty-state">暂无备份</div>';
            return;
        }
        const fmtSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };
        const fmtTime = (iso) => {
            const d = new Date(iso);
            return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        box.innerHTML = backups.map(b => `
            <div class="backup-row">
                <span class="backup-label ${b.label}">${b.label}</span>
                <span class="backup-name" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>
                <span class="backup-meta">${fmtSize(b.size)} · ${fmtTime(b.time)}</span>
                <button class="backup-restore-btn" data-filename="${escapeHtml(b.name)}" data-label="${escapeHtml(b.label)}">恢复</button>
            </div>
        `).join('');
        box.querySelectorAll('.backup-restore-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const filename = btn.dataset.filename;
                const label = btn.dataset.label;
                if (!confirm(`确认从备份恢复 ${label} 数据？\n当前数据会被自动备份后再覆盖。`)) return;
                try {
                    const res = await fetch(`${API}/backups/restore`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || '恢复失败');
                    showToast(`已恢复 ${data.restored} 数据${data.count !== undefined ? ` (${data.count}条)` : ''}`, 'success');
                    if (data.restored === 'applications') loadRecords();
                    if (data.restored === 'config') loadConfig();
                    loadOverview();
                } catch (err) {
                    showToast('恢复失败: ' + err.message, 'error');
                }
            });
        });
    } catch (err) {
        document.getElementById('backup-list').innerHTML = '<div class="empty-state">加载失败</div>';
    }
}

document.getElementById('backup-create-btn').addEventListener('click', async () => {
    try {
        const res = await fetch(`${API}/backups/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'applications' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '创建失败');
        showToast('备份已创建', 'success');
        loadBackups();
    } catch (err) {
        showToast('创建备份失败: ' + err.message, 'error');
    }
});

document.getElementById('backup-refresh-btn').addEventListener('click', loadBackups);

// 配置页 Tab 切换时加载备份列表
const origConfigLoad = loadConfig;
loadConfig = async function() {
    await origConfigLoad();
    loadBackups();
};

// ---- 初始加载 ----
// 从 URL 恢复筛选状态
(function restoreFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('q')) document.getElementById('filter-q').value = params.get('q');
    if (params.has('platform')) document.getElementById('filter-platform').value = params.get('platform');
    if (params.has('minScore')) document.getElementById('filter-score').value = params.get('minScore');
    if (params.has('status')) document.getElementById('filter-status').value = params.get('status');
    if (params.has('sort')) document.getElementById('filter-sort').value = params.get('sort');
    if (params.has('tab')) {
        const tab = params.get('tab');
        const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (btn) btn.click();
    }
})();

// 筛选条件变化时同步到 URL
function syncFiltersToURL() {
    const params = new URLSearchParams();
    const q = document.getElementById('filter-q').value.trim();
    const platform = document.getElementById('filter-platform').value;
    const minScore = document.getElementById('filter-score').value;
    const status = document.getElementById('filter-status').value;
    const sort = document.getElementById('filter-sort').value;
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (minScore && minScore !== '0') params.set('minScore', minScore);
    if (status) params.set('status', status);
    if (sort && sort !== 'time-desc') params.set('sort', sort);
    // 当前活跃 Tab
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab !== 'overview') params.set('tab', activeTab.dataset.tab);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    history.replaceState(null, '', newUrl);
}

loadStatusMeta().then(() => {
    loadBatchStatusOptions();
    loadOverview();
}).catch(err => console.error(err));

// 如果首次加载时 cdnjs 的 Chart.js 失败、触发了 jsdelivr 备用CDN（见 index.html），
// 备用脚本是异步插入的，加载完成时机可能晚于这里的首次 loadOverview() 调用，
// 所以监听一下"备用CDN加载完成"事件，成功后再重新渲染一次图表。
window.addEventListener('chartjs-ready', () => {
    console.log('✅ 备用CDN的 Chart.js 加载完成，重新渲染图表');
    loadOverview().catch(err => console.error(err));
});

// ============================================================
// Toast 通知系统
// ============================================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
}

// ============================================================
// 手动添加投递记录
// ============================================================
const addModalOverlay = document.getElementById('add-modal-overlay');

document.getElementById('add-record-btn').addEventListener('click', () => {
    addModalOverlay.style.display = '';
    document.getElementById('add-name').focus();
});

function closeAddModal() {
    addModalOverlay.style.display = 'none';
    // 清空表单
    ['add-name', 'add-company', 'add-score', 'add-platform', 'add-city', 'add-salary', 'add-matched', 'add-note'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
document.getElementById('add-modal-cancel').addEventListener('click', closeAddModal);
addModalOverlay.addEventListener('click', (e) => {
    if (e.target === addModalOverlay) closeAddModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addModalOverlay.style.display !== 'none') closeAddModal();
});

document.getElementById('add-modal-submit').addEventListener('click', async () => {
    const nameEl = document.getElementById('add-name');
    const companyEl = document.getElementById('add-company');
    const scoreEl = document.getElementById('add-score');
    const name = nameEl.value.trim();
    const company = companyEl.value.trim();

    // 清除之前的错误状态
    [nameEl, companyEl, scoreEl].forEach(el => el.style.borderColor = '');

    if (!name) { nameEl.style.borderColor = 'var(--bad)'; showToast('请输入岗位名称', 'warning'); nameEl.focus(); return; }
    if (!company) { companyEl.style.borderColor = 'var(--bad)'; showToast('请输入公司名称', 'warning'); companyEl.focus(); return; }

    let score = parseInt(scoreEl.value);
    if (isNaN(score)) score = 0;
    if (score < 0 || score > 100) { scoreEl.style.borderColor = 'var(--bad)'; showToast('匹配度需在 0-100 之间', 'warning'); scoreEl.focus(); return; }

    const platform = document.getElementById('add-platform').value.trim() || '手动录入';
    const city = document.getElementById('add-city').value.trim();
    const salary = document.getElementById('add-salary').value.trim();
    const matchedStr = document.getElementById('add-matched').value.trim();
    const matched = matchedStr ? matchedStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];

    try {
        const res = await fetch(`${API}/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, company, score, matched, platform, city, salary,
                time: new Date().toISOString(),
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '添加失败');
        if (data.created) {
            showToast(`已添加: ${name} (${company})`, 'success');
        } else {
            showToast(`记录已存在: ${name} (${company})`, 'warning');
        }
        closeAddModal();
        loadRecords();
        loadOverview();
    } catch (err) {
        showToast('添加失败: ' + err.message, 'error');
    }
});

// ============================================================
// 全局错误处理
// ============================================================

// 捕获未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的 Promise 错误:', event.reason);
    // 避免重复显示 Toast（如果已经在某个 catch 中显示过）
    if (event.reason && event.reason.message && !event.reason._toastShown) {
        showToast('操作失败: ' + event.reason.message, 'error');
        event.reason._toastShown = true;
    }
    event.preventDefault(); // 阻止默认的控制台错误输出
});

// 捕获全局 JS 错误
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
});

// 页面加载完成后的初始化日志
console.log('🚀 求职助手管理后台已加载');
