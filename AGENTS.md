# AGENTS.md — 求职助手项目指南

## 项目概述

Tampermonkey 油猴脚本 + Node.js 本地管理后台，用于在智联招聘 / Boss直聘 / 前程无忧 / 猎聘上自动投递岗位。

## 架构

```
job-helper/
├── script/
│   └── zhaopin_job_helper.user.js   ← 单文件油猴脚本（~2500行，全部逻辑在内）
├── backend/                          ← Node.js 本地管理后台
│   ├── server.js                     ← Express + WS 入口
│   ├── src/
│   │   ├── routes.js                 ← REST API（/api/applications, /api/stats, /api/config）
│   │   ├── db.js                     ← JSON文件存储（无数据库），读写队列防并发
│   │   └── ws.js                     ← WebSocket 广播
│   ├── data/
│   │   ├── applications.json         ← 投递记录（权威数据）
│   │   ├── config.json               ← 策略配置
│   │   └── backups/                  ← 自动备份（最多20份）
│   ├── public/                       ← 管理后台前端
│   └── ecosystem.config.js           ← PM2 部署配置
└── README.md
```

## 关键约定

### 油猴脚本 (`script/zhaopin_job_helper.user.js`)

**结构顺序**（修改时请按此顺序定位）：
1. `DEFAULT_CONFIG` — 所有可调参数（行 40-95）
2. `loadConfig` / `saveConfig` — GM_setValue 持久化
3. `GM_addStyle` — 面板 UI 样式
4. 工具函数（`delay`, `jitter`, `toast`, `beep` 等）
5. 薪资解析（`parseSalary`）、经验解析（`parseExperienceRequirement`）
6. 技能匹配（`calcMatch`）
7. 统一岗位判断（`evaluateJob`）— **所有平台共用**
8. 平台引擎（`ZhaopinAdapter`, `BossEngine`, `WuyouEngine`, `LiepinEngine`）
9. UI 面板（`buildPanel`, 设置/统计模态框）
10. 初始化入口（`init`）

**多平台适配要点**：
- 智联/前程无忧/猎聘使用共享的 `createListEngine()` 工厂函数
- Boss直聘是独立的 `BossEngine` 对象（沟通流程不同）
- 每个平台有各自的 **CSS 选择器**数组（可能因改版失效）
- Boss直聘薪资使用 **自定义字体编码**（私有区 Unicode），需特殊解码

**持久化**：所有配置通过 `GM_setValue('zpm_config_v5', ...)` 存储，用户可在页面 ⚙️ 设置面板中修改

**Boss直聘特殊处理**：
- 卡片薪资是自定义字体编码，用 `decodeBossSalaryFromElement()` 解码
- 沟通按钮只匹配 "立即沟通"，不能匹配 "继续沟通"（之前出过 bug）
- 点击卡片打开详情面板后才能读取真实薪资和经验

### 后端 (`backend/`)

- **无数据库**，用 JSON 文件存储
- 写操作通过 Promise 队列序列化，原子写入（.tmp rename）
- 无认证，不要暴露到公网
- PM2 部署：`pm2 start ecosystem.config.js`，端口 8787
- 路由通过 `asyncHandler` 统一错误处理
- WebSocket 广播通过 `app.broadcast()` 触发

## 常见修改场景

| 需求 | 修改位置 |
|------|---------|
| 调整投递数量/间隔/每日限额 | `DEFAULT_CONFIG` 中 `deliverCount`/`batchInterval`/`dailyLimit` |
| 新增/调整技能匹配 | `DEFAULT_CONFIG.skills` 对象 |
| 修改城市/关键词/黑名单 | `DEFAULT_CONFIG` 对应字段 |
| 平台选择器失效 | 对应引擎的 `jobListSelectors`/`applyBtnSelectors` 数组 |
| Boss直聘薪资解码不准 | `decodeBossSalaryFromElement()` 中的字体映射表 |
| 新增招聘平台 | 参照 `createListEngine()` 模式新增引擎 |

## 调试技巧

- BOSS直聘选择器调试：在控制台执行 `document.querySelector(".job-card-box")?.outerHTML.slice(0, 600)` 查看实际 DOM
- 滚动容器调试：日志会输出 `🖱 滚动容器: xxx`
- 薪资解码调试：详情面板的 `.job-salary` 元素的 `textContent` 中包含私有区字符
