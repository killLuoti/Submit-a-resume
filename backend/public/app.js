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

    // 趋势图
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

    // 平台分布
    const ctx2 = document.getElementById('chart-platform').getContext('2d');
    const platforms = Object.keys(overview.byPlatform);
    const counts = Object.values(overview.byPlatform);
    if (platformChart) platformChart.destroy();
    if (platforms.length === 0) {
        document.getElementById('chart-platform').parentElement.querySelector('h2').nextElementSibling.outerHTML = '<div class="empty-state">暂无数据</div>';
    } else {
        platformChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: platforms,
                datasets: [{ data: counts, backgroundColor: ['#165dff', '#52c41a', '#faad14', '#ff4d4f', '#8891a7'] }],
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: '#e7ebf3', font: { size: 11 } } } } },
        });
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
    sel.innerHTML = '<option value="">全部平台</option>' + platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
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
            <span class="del" title="删除">✕</span>
        </div>
    `).join('');
    box.querySelectorAll('.del').forEach(el => {
        el.addEventListener('click', async (e) => {
            const row = e.target.closest('.row');
            const id = row.dataset.id;
            if (!confirm('确认删除这条投递记录？')) return;
            await fetch(`${API}/applications/${id}`, { method: 'DELETE' });
            row.remove();
        });
    });
}

document.getElementById('filter-refresh').addEventListener('click', loadRecords);
document.getElementById('filter-q').addEventListener('keydown', e => { if (e.key === 'Enter') loadRecords(); });
document.getElementById('filter-platform').addEventListener('change', loadRecords);
document.getElementById('filter-score').addEventListener('change', loadRecords);

document.getElementById('export-csv-btn').addEventListener('click', async () => {
    const data = await api('/applications?limit=100000');
    const header = '岗位名称,公司,平台,匹配度,匹配技能,投递时间\n';
    const rows = data.items.map(x =>
        `"${(x.name||'').replace(/"/g,'""')}","${(x.company||'').replace(/"/g,'""')}","${x.platform||''}",${x.score}%,"${(x.matched||[]).join('/')}","${x.time||''}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `投递记录_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
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
    await fetch(API + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const btn = document.getElementById('cfg-save-btn');
    const old = btn.textContent;
    btn.textContent = '已保存 ✓';
    setTimeout(() => btn.textContent = old, 1500);
});

// ---- 初始加载 ----
loadOverview().catch(err => console.error(err));
