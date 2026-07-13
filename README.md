# 📄 求职助手 (Job Helper) v7.0

一个专为**智联招聘 / Boss直聘 / 前程无忧 / 猎聘**设计的 Tampermonkey 油猴脚本，自动计算岗位与你的技能匹配度，一键投递 + 批量投递 + 黑名单/红旗关键词过滤 + 经验筛选 + 每日限额 + 投递统计图表 + 断点续投。配套本地管理后台（`backend/`）支持 WebSocket 实时同步、投递状态漏斗、CSV 导入导出、数据备份恢复等功能。

---

## ✨ 功能总览

### 脚本端

| 功能 | 说明 |
|:----:|------|
| 🏷️ **匹配度评分** | 每个岗位自动显示 0%~100% 的技能匹配度，按分类展示条形图 |
| 📊 **投递统计图表** | 近14天投递趋势 + 高频匹配技能 Top10 |
| 💰 **薪资评估** | 支持 `7-10K`、`面议` 等多种格式解析 |
| 🎓 **经验要求过滤** | 自动解析"经验不限/3-5年/5年以上"，超出范围自动跳过 |
| 🚫 **黑名单过滤** | 公司黑名单 + 关键词黑名单（如"外包""劳务派遣"） |
| 🚩 **红旗关键词** | 自动识别"日结""押金""培训费"等风险描述 |
| 🔀 **优先级排序** | 同页内按匹配度从高到低排序后再投递 |
| 🌐 **多平台支持** | 智联招聘、Boss直聘、前程无忧、猎聘 |
| ↩️ **断点续投** | 中断后10分钟内可一键继续上次未完成的批次 |
| 📅 **每日限额** | 跨刷新/跨天持久化的每日投递上限 |
| ⚙️ **可视化设置** | 点击 ⚙️ 直接在页面上改配置，无需修改代码 |
| 🔁 **失败自动重试** | 投递按钮点击失败时自动重试 |
| 🔔 **桌面通知 + 提示音** | 每轮投递完成后系统通知提醒 |
| 🐕 **看门狗** | 长时间无成功投递自动停止，避免空跑 |
| ⌨️ **快捷键** | `Alt + S` 快速启动/停止 |
| 🎨 **高亮推荐** | 匹配度 >10% 绿色边框高亮，黑名单岗位置灰 |
| 🛡️ **弹窗安全防护** | 自动确认/关闭限定在弹窗容器内，避免误触发页面导航 |
| ✅ **已投递去重** | 按"岗位名+公司名"联合去重，避免重复投递 |

### 管理后台（`backend/`）

| 功能 | 说明 |
|:----:|------|
| 📊 **总览仪表盘** | 累计/今日投递数、平均匹配度、平台分布、高频技能 Top10 |
| 📈 **投递转化漏斗** | 已投递 → 已回复 → 面试中 → offer 各阶段累计人数 |
| 📋 **投递记录管理** | 搜索/筛选/排序/编辑/删除，支持按状态、平台、薪资筛选 |
| 🔄 **实时同步** | WebSocket 推送，多标签页/多设备自动更新 |
| 📥 **CSV 导入** | 支持文件上传或粘贴文本导入投递记录 |
| 📤 **CSV / JSON 导出** | 一键导出，支持筛选条件 |
| ⚙️ **策略配置** | 城市、关键词、黑名单、薪资、经验等在线调整 |
| 💾 **数据备份恢复** | 自动备份（最多20份）+ 手动备份 + 一键恢复 |
| 🎨 **深色主题** | 运维仪表盘风格，等宽字体数据展示 |

---

## 🆕 更新日志

### v7.0 — 全平台代码审查合并

- **修复弹窗自动确认误触发页面导航**：自动确认/关闭操作限定在弹窗容器内，排除 `<a>` 标签，避免点击导航链接导致页面跳转中断。智联、51job、猎聘三个平台同时生效。
- **弹窗复选框限定弹窗范围**：避免误勾选列表页筛选复选框。
- **修复 51job 岗位卡片选择器**：改为直接定位 `.joblist-item-job-wrapper`，避免嵌套匹配导致重复计分。
- **51job 自动翻页支持**：新增 `nextPageSelectors` 精确定位图标字体翻页按钮。
- **猎聘投递按钮校验补齐**：补充关键词校验，降低误点击风险。
- **统一岗位卡片查找逻辑**：合并为一份共享代码，消除两处选择器/去重逻辑的差异。

### v6.0 — 本地管理后台

- Node.js + Express 后端，JSON 文件存储，零数据库依赖
- 总览仪表盘（趋势图、平台分布、技能频率）
- 投递记录搜索/筛选/编辑/删除/导出 CSV
- 投递策略在线配置
- 脚本「同步到后台」开关 + 一键打开后台页面

### v5.0 — 多平台 + 智能过滤

- 新增前程无忧、猎聘支持
- 经验要求自动过滤、红旗关键词过滤
- 优先级排序投递、断点续投、看门狗保护
- 投递统计图表、打招呼语模板（Boss直聘）

---

## 📦 安装方法

### 1. 安装油猴插件

| 浏览器 | 插件地址 |
|--------|----------|
| Chrome | [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |

### 2. 安装脚本

- 打开 `zhaopin_job_helper.user.js`
- 点击右上角 **Raw** 按钮 → Tampermonkey 自动弹出安装提示 → 点击 **安装**

### 3. 使用

打开以下任一平台的搜索结果页：

- [智联招聘](https://www.zhaopin.com/)（`sou.zhaopin.com` 搜索列表页）
- [Boss直聘](https://www.zhipin.com/)（岗位搜索页，非聊天页）
- [前程无忧](https://we.51job.com/)
- [猎聘](https://www.liepin.com/)

页面右侧出现 **🤖 自动投递** 面板，每个岗位卡片自动显示匹配度评分。点击 ⚙️ 调整配置。

### 4. 启动管理后台（可选）

```bash
cd backend
npm install
node server.js
# → http://localhost:8787
```

管理后台是可选组件：不启动它，脚本本身的自动投递、匹配度评分、黑名单过滤等功能完全不受影响。详见 [backend/README.md](backend/README.md)。

---

## ⚙️ 脚本设置面板

点击面板右上角 ⚙️ 图标即可配置：

| 配置项 | 说明 |
|--------|------|
| 目标城市 | 自动过滤非目标城市的岗位 |
| 岗位关键词 | 逗号分隔，支持多个 |
| 黑名单关键词/公司 | 命中即自动跳过 |
| 期望薪资范围 | 有重叠即视为合适 |
| 投递数量 | 单轮目标 / 每日上限 / 投递间隔(ms) |
| 开关项 | 自动翻页、失败重试、提示音、桌面通知 |
| 技能库 | JSON 格式，自定义技能权重和分类 |

设置保存在浏览器本地（`GM_setValue`），持久化生效。

---

## 📁 项目结构

```
job-helper/
├── script/
│   └── zhaopin_job_helper.user.js   # 油猴脚本
├── backend/
│   ├── server.js                    # Express + WebSocket 服务
│   ├── src/
│   │   ├── db.js                    # 数据存储（JSON 文件，串行写队列）
│   │   ├── routes.js                # REST API 路由
│   │   └── ws.js                    # WebSocket 实时推送
│   ├── public/
│   │   ├── index.html               # 管理后台页面
│   │   ├── app.js                   # 前端逻辑
│   │   └── style.css                # 深色主题样式
│   └── data/                        # 数据目录（自动创建，已 gitignore）
├── README.md
└── backend/README.md
```

## 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/applications` | 查询投递记录（支持 `platform`/`minScore`/`q`/`status`/`city`/`sortBy` 等筛选） |
| POST | `/api/applications` | 新增投递记录 |
| PATCH | `/api/applications/:id` | 更新记录（状态/字段修改） |
| DELETE | `/api/applications/:id` | 删除记录 |
| POST | `/api/applications/import` | CSV 导入 |
| GET | `/api/applications/export.csv` | CSV 导出 |
| GET | `/api/applications/export.json` | JSON 导出 |
| POST | `/api/applications/batch/delete` | 批量删除 |
| PATCH | `/api/applications/batch/status` | 批量修改状态 |
| GET | `/api/stats/overview` | 总览统计 |
| GET | `/api/stats/daily` | 近N天投递趋势 |
| GET | `/api/stats/skills` | 技能匹配频率 |
| GET | `/api/stats/funnel` | 投递转化漏斗 |
| GET | `/api/meta/statuses` | 合法状态取值 |
| GET | `/api/config` | 读取配置 |
| PUT | `/api/config` | 更新配置 |
| GET | `/api/backups` | 列出备份 |
| POST | `/api/backups/restore` | 从备份恢复 |
| WS | `ws://localhost:8787` | WebSocket 实时推送（数据变更事件） |

## ⚠️ 使用须知

- 请遵守各招聘平台用户协议，合理设置每日投递数量，避免账号被限制。
- 自动投递不能替代针对性投递，建议对高匹配度岗位手动确认后再投递。
- 黑名单和薪资过滤基于页面文本关键词匹配，无法保证 100% 准确。
- 选择器如遇平台改版失效，请按 F12 检查实际 class 名后在 `SITE_CONFIGS` 里调整。

## 📄 许可证

MIT License
