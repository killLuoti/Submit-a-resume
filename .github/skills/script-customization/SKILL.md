---
name: script-customization
description: '定制 zhaopin_job_helper.user.js 油猴脚本的配置与行为。USE FOR: 修改投递策略（每日限额/间隔/重试）、调整技能匹配库（增删技能/修改权重/分类）、配置城市/关键词/黑名单/薪资过滤、新增招聘平台支持（选择器适配）、调整后台同步设置、排查脚本不生效/选择器失效问题。DO NOT USE FOR: 后端 server.js 或数据库逻辑修改、前端管理后台 UI 改动、新功能开发。'
argument-hint: '描述你想调整的脚本行为，如"把每日限额改成50"或"新增Java技能匹配"'
---

# 用户脚本定制指南

本 Skill 指导你定制 `script/zhaopin_job_helper.user.js` —— 一个运行在智联招聘、Boss直聘、前程无忧、猎聘上的 Tampermonkey 自动投递脚本。

## 前置知识

脚本文件：`script/zhaopin_job_helper.user.js`（单文件，约 2500+ 行）

核心结构：
```
(function() {
    'use strict';
    // ① DEFAULT_CONFIG — 所有可调参数
    // ② loadConfig / saveConfig — GM_setValue 持久化
    // ③ GM_addStyle — 面板 UI 样式
    // ④ 工具函数 (delay, jitter, toast, beep 等)
    // ⑤ 平台适配器 (ZhaopinAdapter, BossAdapter, WuyouAdapter, LiepinAdapter)
    // ⑥ 匹配引擎 (calcScore)
    // ⑦ 投递引擎 (deliverBatch)
    // ⑧ UI 面板 (buildPanel)
    // ⑨ 初始化入口
})();
```

所有持久化配置通过 `GM_setValue('zpm_config_v5', ...)` 存储，用户可在脚本的 ⚙️ 设置面板中修改，修改后立即生效并持久化。

---

## 定制工作流

### 1. 调整投递策略参数

**涉及位置**：`DEFAULT_CONFIG` 对象（脚本开头约第 40-70 行）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `deliverCount` | `50` | 单次运行最多投递数 |
| `dailyLimit` | `30` | 每日投递上限（跨刷新/跨天持久化） |
| `batchInterval` | `3000` | 每次投递间隔（毫秒），防止被反爬 |
| `jitterPercent` | `30` | 间隔随机浮动百分比，让行为更自然 |
| `watchdogNoProgressMs` | `120000` | 看门狗超时：2分钟内无成功投递则自动停止 |
| `autoNextPage` | `true` | 是否自动翻页 |
| `retryOnFail` | `true` | 投递按钮点击失败时是否重试 |
| `retryTimes` | `2` | 失败重试次数 |

**操作步骤**：
1. 打开 `script/zhaopin_job_helper.user.js`
2. 找到 `const DEFAULT_CONFIG = {` 开始处
3. 修改对应参数值
4. 保存文件，在 Tampermonkey 中更新脚本（或重新安装）
5. 刷新招聘网站页面测试

> ⚠️ `batchInterval` 不建议低于 2000ms，否则可能触发平台反爬机制。`dailyLimit` 不建议超过 100，尊重平台规则。

### 2. 定制技能匹配库

**涉及位置**：`DEFAULT_CONFIG.skills` 对象（约第 70-95 行）

每个技能条目格式：
```js
'技能名': { weight: 数字, category: '分类名' }
```

- `weight`：1-10，影响匹配度计算权重
- `category`：用于分类条形图展示（运维/开发/物联网/网络/测试/其他）

**添加新技能**：
1. 在 `skills` 对象中新增条目
2. 权重参考：核心技能 8-10，辅助技能 5-7，边缘相关 3-4
3. 分类名需与已有分类保持一致（否则条形图会多出新分类）

**调整权重**：
- 直接修改 `weight` 值即可
- 匹配度计算规则：命中技能权重之和 ÷ 总权重之和 × 100%

**示例**：新增一个 PostgreSQL 技能，权重 6，归类为"开发"：
```js
'PostgreSQL': { weight: 6, category: '开发' },
```

### 3. 配置过滤规则

**涉及位置**：`DEFAULT_CONFIG` 中的过滤相关字段

| 参数 | 类型 | 说明 |
|------|------|------|
| `city` | `string` | 目标城市（如 `'佛山'`），用于城市过滤 |
| `jobKeywords` | `string[]` | 目标岗位关键词，脚本优先匹配这些岗位 |
| `blacklistKeywords` | `string[]` | 黑名单关键词，命中则跳过（如"外包""劳务派遣"） |
| `blacklistCompanies` | `string[]` | 黑名单公司名，命中则跳过 |
| `negativeSignals` | `string[]` | 红旗关键词，命中则标记风险（如"日结""押金"） |
| `expectedSalary` | `[number, number]` | 期望薪资范围 `[最低, 最高]` |
| `skipIfSalaryUnknown` | `boolean` | 薪资未知时是否跳过 |
| `myYearsExperience` | `number` | 你的工作年限 |
| `maxExperienceGap` | `number` | 岗位要求年限超过 `你的年限+此值` 时跳过 |

**操作步骤**：
1. 修改对应数组/值
2. 黑名单关键词区分大小写不敏感（脚本内自动处理）
3. 经验过滤逻辑：岗位要求 `min` 年 > `myYearsExperience + maxExperienceGap` 时跳过

### 4. 配置后台同步

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `syncEnabled` | `false` | 是否同步投递记录到本地管理后台 |
| `backendUrl` | `'http://127.0.0.1:8787/api'` | 后台 API 地址 |

**启用同步**：
1. 确保 `backend/` 已启动：`cd backend && node server.js`
2. 将 `syncEnabled` 改为 `true`
3. 如后台运行在其他端口，修改 `backendUrl`

### 5. 调整打招呼语模板（Boss直聘专属）

修改 `greetingTemplate` 字段：
```js
greetingTemplate: '您好，我有4年IT技术支持/运维经验，看到贵司该岗位与我的技能比较匹配，希望有机会进一步沟通，谢谢！',
```

---

## 新增招聘平台支持（高级）

如需为新平台添加适配器，需完成以下步骤：

### 5.1 在 `@match` 中添加域名

在脚本头部的 UserScript 元数据块中添加：
```
// @match        https://新平台域名.com/*
```

### 5.2 实现平台适配器对象

在脚本中找到现有适配器（搜索 `const adapters`），参考现有模式新增：

```js
新平台名: {
    // 岗位卡片选择器 — 必须精确匹配单个岗位卡片
    cardSelector: '.job-card',
    
    // 从卡片中提取字段的方法
    extract: (card) => ({
        name: card.querySelector('.job-title')?.textContent?.trim() || '',
        company: card.querySelector('.company-name')?.textContent?.trim() || '',
        salary: parseSalary(card.querySelector('.salary')?.textContent || ''),
        city: card.querySelector('.location')?.textContent?.trim() || '',
        description: card.querySelector('.job-desc')?.textContent?.trim() || '',
    }),
    
    // 投递按钮选择器 — 用于自动点击
    applyBtnSelector: '.btn-apply',
    
    // 翻页选择器（可选）
    nextPageSelectors: ['.pagination .next', '.page-next'],
    
    // 弹窗关闭/确认选择器（可选）
    popupCloseSelector: '.dialog-close, .modal-close',
    popupConfirmSelector: '.dialog-confirm, .modal-submit',
}
```

### 5.3 测试验证

1. 打开目标平台的搜索列表页
2. 确认右侧出现 🤖 面板
3. 确认岗位卡片上出现匹配度评分
4. 手动点击一次投递确认可用
5. 运行自动投递，观察日志

---

## 配置模板预设

以下是几套常用配置预设，可直接替换 `DEFAULT_CONFIG` 中对应字段。在 ⚙️ 设置面板中也可手动切换。

### 🚀 激进投递（最大化投递量）

适用场景：急需大量投递，不在意反爬风险。

```js
deliverCount: 100,
dailyLimit: 80,
batchInterval: 1500,        // 1.5秒间隔，较快
jitterPercent: 15,           // 较小浮动
watchdogNoProgressMs: 300000, // 5分钟看门狗
autoNextPage: true,
retryOnFail: true,
retryTimes: 3,
skipIfSalaryUnknown: false,  // 不放过任何岗位
```

### 🐢 保守投递（防反爬优先）

适用场景：账号安全第一，模拟人工浏览节奏。

```js
deliverCount: 20,
dailyLimit: 15,
batchInterval: 8000,         // 8秒间隔
jitterPercent: 50,            // 大幅浮动，行为不规律
watchdogNoProgressMs: 60000,  // 1分钟看门狗
autoNextPage: false,          // 不自动翻页
retryOnFail: false,
skipIfSalaryUnknown: true,   // 薪资不明就跳过
```

### 👀 仅浏览评分（不投递）

适用场景：先观察市场，只评分不投递。

```js
deliverCount: 0,
dailyLimit: 0,
autoNextPage: false,
```

> 此时脚本仅显示匹配度评分和高亮，通过 ⚙️ 面板关闭自动投递即可。适合在多个平台对比后再决定投递策略。

### 🎯 精准投递（高匹配优先）

适用场景：宁缺毋滥，只投高匹配度岗位。

```js
deliverCount: 30,
dailyLimit: 20,
batchInterval: 4000,
myYearsExperience: 4,
maxExperienceGap: 1,         // 只投经验要求 ±1 年内的
expectedSalary: [8000, 12000], // 薪资下限提高
skipIfSalaryUnknown: true,
blacklistKeywords: ['外包', '劳务派遣', '中介', '兼职', '实习', '助理'],
```

### 🏭 制造业/物联网方向预设

适用场景：如果你的求职方向是物联网、嵌入式、智能制造。

```js
jobKeywords: ['物联网', '嵌入式', '单片机', 'STM32', '智能硬件', 'IoT', '自动化', '工控'],
city: '深圳',  // 物联网岗位集中在深圳
expectedSalary: [8000, 15000],
skills: {
    '物联网':      { weight: 10, category: '物联网' },
    'STM32':       { weight: 10, category: '嵌入式' },
    '单片机':      { weight: 9,  category: '嵌入式' },
    '嵌入式':      { weight: 9,  category: '嵌入式' },
    'C/C++':       { weight: 8,  category: '开发' },
    'RTOS':        { weight: 8,  category: '嵌入式' },
    '传感器':      { weight: 8,  category: '物联网' },
    'MQTT':        { weight: 7,  category: '物联网' },
    'Python':      { weight: 7,  category: '开发' },
    'PCB':         { weight: 6,  category: '硬件' },
    '万用表':      { weight: 5,  category: '硬件' },
    '示波器':      { weight: 5,  category: '硬件' },
    'PLC':         { weight: 6,  category: '自动化' },
    '组态':        { weight: 5,  category: '自动化' },
},
```

### 💻 IT运维/技术支持方向预设

适用场景：桌面运维、网络管理、IT 技术支持。

```js
jobKeywords: ['IT技术支持', '运维工程师', '网络管理员', '桌面运维', 'helpdesk', 'IT专员'],
city: '佛山',
expectedSalary: [6000, 10000],
skills: {
    '桌面运维':    { weight: 10, category: '运维' },
    'IT支持':      { weight: 10, category: '运维' },
    '网络运维':    { weight: 9,  category: '运维' },
    'Windows Server': { weight: 8, category: '运维' },
    'AD域':        { weight: 8,  category: '运维' },
    '故障排除':    { weight: 8,  category: '运维' },
    '打印机':      { weight: 6,  category: '运维' },
    'VPN':         { weight: 7,  category: '网络' },
    '防火墙':      { weight: 7,  category: '网络' },
    '交换机':      { weight: 7,  category: '网络' },
    'VLAN':        { weight: 7,  category: '网络' },
    'Linux':       { weight: 6,  category: '运维' },
    'Shell':       { weight: 5,  category: '运维' },
},
```

> 使用预设时，直接替换 `DEFAULT_CONFIG` 中的对应字段即可。切换预设后建议在 Tampermonkey 存储中清除 `zpm_config_v5`，避免旧值覆盖。

---

## 常见问题排查

### 脚本不生效 / 面板不显示

1. **检查 `@match` 是否覆盖当前 URL**：打开 Tampermonkey → 脚本详情 → 包含的页面
2. **检查脚本是否启用**：Tampermonkey 图标应有红色数字角标
3. **控制台是否有报错**：F12 → Console，查看红色错误
4. **确认不是 iframe 内页面**：部分招聘平台在 iframe 中加载列表，需单独添加 match

### 选择器失效（匹配度不显示 / 不投递）

平台可能更新页面结构，需更新选择器：
1. F12 审查元素，找到岗位卡片的 CSS 类名
2. 更新对应平台的 `cardSelector`
3. 更新 `extract` 中的子选择器

### 投递按钮点击无反应

1. 确认 `applyBtnSelector` 正确指向可点击元素
2. 检查是否有弹窗需要先关闭（补充 `popupCloseSelector`）
3. 查看控制台日志 `🤖 自动投递助手`

### 每日限额不生效

1. 检查 `dailyLimit` 值是否被设置面板覆盖
2. 限额数据存储在 `GM_getValue('zpm_daily_count_xxx')` 中
3. 可在 Tampermonkey 存储中手动清除

---

## 修改后生效方式

1. **仅改 DEFAULT_CONFIG**：在 Tampermonkey 中更新脚本后，需清除已存储的配置（Tampermonkey → 存储 → 删除 `zpm_config_v5`），否则旧配置会覆盖默认值。或者直接在脚本的 ⚙️ 面板中修改对应字段。
2. **改 UI / 逻辑代码**：更新脚本后刷新页面即可。
3. **改 @match / @grant**：需在 Tampermonkey 中重新安装脚本（而非仅更新）。

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `script/zhaopin_job_helper.user.js` | 油猴脚本本体 |
| `backend/server.js` | 管理后台入口 |
| `backend/src/routes.js` | API 路由 |
| `backend/src/db.js` | 数据存储层 |
| `backend/public/` | 管理后台前端 |
| `README.md` | 项目总览 |
