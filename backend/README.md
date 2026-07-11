# 投递管理后台 (job-helper-backend)

配合 `zhaopin_job_helper.user.js` v6.0+ 使用的本地管理与统计后台。数据保存在本地 `data/` 目录的 JSON 文件中，不依赖任何数据库，也不会把数据发送到任何第三方服务器。

## 🆕 v1.1.0 更新（完善与修复）

- **修复接口返回值 bug**：`POST /applications`、`DELETE /applications/:id`、`PUT /config` 内部都通过串行写队列（Promise）落盘，但路由层之前没有 `await`，导致：
  - `DELETE` 对不存在的记录永远不会返回 404（虽然实际也没删成功，但接口谎报成功）
  - `PUT /config` 恒定返回 `{}`，看不到真正写入后的配置内容
  - 数据本身写入磁盘没有问题（这是这个 bug 一直没被发现的原因），现在已修复为正确的 `async/await`，接口返回值准确对应实际结果。
- **自动数据备份**：每次覆盖写入 `applications.json` / `config.json` 前，会先在 `data/backups/` 保留一份带时间戳的快照（最多 20 份，自动清理最旧的），防止误操作或某次写入逻辑出错导致投递历史丢失。
- **配置写入类型校验**：`PUT /config` 现在会按字段类型过滤请求体，类型不对的字段会被丢弃并在响应里通过 `rejected` 字段告知，不会再让脏数据污染 `config.json`。
- **新增 `PATCH /applications/:id`**：可以单独修正某条记录的字段（比如公司名打错了），管理面板"投递记录"里点 ✎ 图标即可用。
- **新增服务端 CSV 导出**：`GET /api/applications/export.csv`，支持和 `/applications` 一样的 `platform`/`minScore`/`q` 筛选参数，命令行 `curl` 或浏览器直接打开链接都能下载，不再依赖前端 JS 拼 CSV。
- **统一错误处理**：新增全局错误处理中间件，任何路由异常现在都返回结构化 JSON（而不是 Express 默认的 HTML 错误页），并在终端打印详细堆栈方便排查。`/api` 下未匹配到的路径统一返回 JSON 404。
- **分页参数加了合理上限**：`limit` 最大 5000、`offset` 不允许为负，避免误传导致一次性序列化过大响应。
- **补充 `.gitignore`**：`data/applications.json` 和 `data/config.json` 包含真实公司名、投递历史等隐私信息，之前没有被排除在版本控制之外。现在这两个文件已加入 `.gitignore`，不会被提交到（尤其是公开的）Git 仓库；`data/` 目录结构通过 `.gitkeep` 保留，首次运行 `node server.js` 会自动重新生成这两个文件。

> ⚠️ 如果你在 v1.1.0 之前已经把 `data/applications.json` 提交到 Git 历史里，光加 `.gitignore` 只能防止**以后**的提交，历史记录里的文件仍然存在。如果仓库是公开的，建议执行 `git rm --cached data/applications.json data/config.json` 并提交，必要时用 `git filter-repo` 或 BFG 清理历史。

## 快速开始

```bash
cd backend
npm install
node server.js
```

启动后终端会显示：

```
✅ 岗位投递管理后台已启动: http://localhost:8787
```

浏览器打开这个地址即可看到管理面板：总览统计（趋势图、平台分布、技能频率）、投递记录（搜索/筛选/编辑/删除/导出CSV）、投递策略配置。

## 让油猴脚本把数据同步过来

1. 先确保后台已启动（上面的 `node server.js`）。
2. 打开智联招聘/Boss直聘等页面，点击脚本面板右上角 **⚙️ 设置**。
3. 找到「管理后台同步」区块：
   - 勾选「投递成功后同步记录到本地管理后台」
   - 后台地址默认是 `http://127.0.0.1:8787/api`，如果你改了端口需要同步修改
   - 点「测试连接」确认能连通
4. 保存设置。之后每次自动投递成功，都会把岗位名、公司、匹配度、匹配技能等同步一条记录到后台。

面板右上角的 🌐 图标可以直接打开管理后台页面。

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/applications` | 查询投递记录，支持 `platform` / `minScore` / `q`(搜索) / `limit`(≤5000) / `offset` |
| GET | `/api/applications/export.csv` | 服务端直出 CSV 下载，支持与上面相同的筛选参数 |
| POST | `/api/applications` | 新增一条投递记录（脚本自动调用） |
| PATCH | `/api/applications/:id` | 修正一条记录的部分字段（name/company/score/matched/platform/salary/city） |
| DELETE | `/api/applications/:id` | 删除一条记录，记录不存在时返回 404 |
| GET | `/api/stats/overview` | 总投递数、今日投递数、平均匹配度、平台分布 |
| GET | `/api/stats/daily?days=14` | 按天统计投递数量 |
| GET | `/api/stats/skills?top=10` | 高频匹配技能排行 |
| GET | `/api/config` | 读取投递策略配置 |
| PUT | `/api/config` | 更新投递策略配置；响应体为 `{ config, rejected }`，`rejected` 列出因类型不对被丢弃的字段 |

## 目录结构

```
backend/
  server.js          # Express 入口 + 全局错误处理
  src/
    db.js            # JSON 文件存储 + 备份轮转 + 统计逻辑 + 配置校验
    routes.js         # API 路由（async/await）
  public/
    index.html        # 管理面板页面
    app.js             # 前端逻辑（原生 JS，无需构建）
    style.css
  data/
    applications.json  # 投递记录（自动生成，已加入 .gitignore）
    config.json         # 投递策略配置（自动生成，已加入 .gitignore）
    backups/            # 自动备份快照（最多保留20份，已加入 .gitignore）
  .gitignore
```

## 注意事项

- 默认监听 `8787` 端口，如被占用可以 `PORT=9000 node server.js` 换端口启动。
- 这是个人单机工具，没有做登录鉴权，请不要把它暴露到公网。
- `data/` 目录里的 JSON 文件就是全部数据，想备份直接复制这个文件夹即可；`data/backups/` 里也会自动保留最近20次写入前的快照。
- `data/applications.json` 和 `data/config.json` 含个人隐私信息，已加入 `.gitignore`，不会被提交到 Git；如果你的仓库是公开的且这两个文件之前已经提交过，请参考上面 v1.1.0 更新里的说明清理历史记录。
