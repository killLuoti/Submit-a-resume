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
    });
});

async function api(path, opts) {
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(`API ${path} 请求失败: ${res.status}`);
    return res.json();
}

function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// 总览
// ============================================================
let dailyChart, platformChart;

async function loadOverview() {
    const [overview, daily, skills, recent] = await Promise.all([
        api('/stats/overview'),
        api('/stats/daily?days=14'),
        api('/stats/skills?top=10'),
        api('/applications?limit=12'),
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
    if (typeof Chart === 'undefined') {
        const msg = '⚠ 图表库(Chart.js)加载失败，通常是网络问题或被浏览器插件拦截。请检查网络后刷新页面（F12 控制台/网络面板可看到具体报错）。';
        console.error(msg);
        ['chart-daily', 'chart-platform'].forEach(id => {
            const el = document.getElementById(id);
            const alreadyWarned = el && el.nextElementSibling && el.nextElementSibling.hasAttribute('data-chartjs-warning');
            if (el && !alreadyWarned) el.insertAdjacentHTML('afterend', `<div class="empty-state" data-chartjs-warning>${msg}</div>`);
        });
    } else {
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
    const params = new URLSearchParams({ limit: 300 });
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (minScore && minScore !== '0') params.set('minScore', minScore);

    const data = await api('/applications?' + params.toString());
    const box = document.getElementById('records-table');
    if (data.items.length === 0) {
        box.innerHTML = '<div class="empty-state">没有符合条件的记录</div>';
        return;
    }
    box.innerHTML = data.items.map(x => `
        <div class="row" data-id="${x.id}">
            <span class="t">${fmtTime(x.time)}</span>
            <span class="score">${x.score}%</span>
            <span class="name">${escapeHtml(x.name)}</span>
            <span class="company">${escapeHtml(x.company)} · ${escapeHtml(x.platform)}</span>
            <span class="edit" title="编辑公司名">✎</span>
            <span class="del" title="删除">✕</span>
        </div>
    `).join('');
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
                loadRecords();
            } catch (err) {
                alert('修改失败: ' + err.message);
            }
        });
    });
    box.querySelectorAll('.del').forEach(el => {
        el.addEventListener('click', async (e) => {
            const row = e.target.closest('.row');
            const id = row.dataset.id;
            if (!confirm('确认删除这条投递记录？')) return;
            const res = await fetch(`${API}/applications/${id}`, { method: 'DELETE' });
            if (!res.ok) { alert('删除失败，该记录可能已不存在'); return; }
            row.remove();
        });
    });
}

document.getElementById('filter-refresh').addEventListener('click', loadRecords);
document.getElementById('filter-q').addEventListener('keydown', e => { if (e.key === 'Enter') loadRecords(); });
document.getElementById('filter-platform').addEventListener('change', loadRecords);
document.getElementById('filter-score').addEventListener('change', loadRecords);

document.getElementById('export-csv-btn').addEventListener('click', () => {
    // 改用后端直出的 CSV 接口，而不是前端自己拼 CSV 字符串——
    // 这样命令行 curl 或直接在浏览器地址栏打开这个链接也能拿到同样格式的导出文件，
    // 不用担心前端这份拼接逻辑和后端 db.toCsv() 逐渐产生格式差异。
    const q = document.getElementById('filter-q').value.trim();
    const platform = document.getElementById('filter-platform').value;
    const minScore = document.getElementById('filter-score').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (platform) params.set('platform', platform);
    if (minScore && minScore !== '0') params.set('minScore', minScore);
    window.open(`${API}/applications/export.csv?${params.toString()}`, '_blank');
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
        btn.textContent = `⚠ 部分字段未生效: ${data.rejected.join(', ')}`;
        setTimeout(() => btn.textContent = old, 3000);
    } else {
        btn.textContent = '已保存 ✓';
        setTimeout(() => btn.textContent = old, 1500);
    }
});

// ---- 初始加载 ----
loadOverview().catch(err => console.error(err));

// 如果首次加载时 cdnjs 的 Chart.js 失败、触发了 jsdelivr 备用CDN（见 index.html），
// 备用脚本是异步插入的，加载完成时机可能晚于这里的首次 loadOverview() 调用，
// 所以监听一下"备用CDN加载完成"事件，成功后再重新渲染一次图表。
window.addEventListener('chartjs-ready', () => {
    console.log('✅ 备用CDN的 Chart.js 加载完成，重新渲染图表');
    loadOverview().catch(err => console.error(err));
});
