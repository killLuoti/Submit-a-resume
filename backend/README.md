# 投递管理后台 (job-helper-backend)

配合 `zhaopin_job_helper.user.js` v6.0+ 使用的本地管理与统计后台。数据保存在本地 `data/` 目录的 JSON 文件中，不依赖任何数据库，也不会把数据发送到任何第三方服务器。

## 🆕 v1.2.0 更新（投递状态流转 + 转化漏斗）

- **新增投递状态字段**：每条记录现在有 `status`，取值为「已投递 → 已回复 → 面试中 → offer」四个正向阶段之一，或终止态「已拒绝」。新记录默认「已投递」，「投递记录」页面每一行都有下拉框可以直接改状态。
- **新增 `stageReached`（曾到达过的最远阶段）**：这是让漏斗统计准确的关键——如果一条记录曾经推进到"面试中"，后来才被标记「已拒绝」，`stageReached` 仍然保留"面试中"，不会因为拒绝而抹掉之前的进度。也就是说，漏斗图里"面试中"这一档的计数，包含了后来被拒的那些，能真实反映"到底有多少投递走到了面试这一步"。
- **新增 `GET /api/stats/funnel`**：返回每个阶段的累计到达人数（到面试中的，也会计入已投递、已回复的计数）+ 已拒绝总数，总览页新增一个横向柱状图展示转化漏斗。
- **新增 `GET /api/meta/statuses`**：返回合法的状态取值列表，前端下拉框直接用这个渲染，不在前端硬编码。
- **状态可筛选/可导出**：`GET /api/applications`、CSV 导出都支持 `status` 参数筛选；投递记录页面新增"全部状态"下拉筛选框；CSV 也新增了"状态"这一列。
- **向后兼容旧数据**：v1.2.0 之前创建、没有 `status`/`stageReached` 字段的历史记录，统计和展示时自动按「已投递」处理，不需要手动迁移数据。

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

---

## 🚀 部署到 Linux 服务器（内网/云服务器通用）

### 1. 上传代码到服务器

```bash
# 将整个 backend/ 目录上传到服务器，例如：
scp -r backend/ user@192.168.x.x:/opt/job-helper/
```

### 2. 安装 Node.js（如未安装）

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证
node -v   # 应 >= 18
npm -v
```

### 3. 安装依赖

```bash
cd /opt/job-helper/backend
npm install --production
```

### 4. 安装 PM2（进程守护）

```bash
sudo npm install -g pm2
```

### 5. 启动应用

```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs job-helper
```

### 6. 设置开机自启

```bash
pm2 startup
# 按提示执行输出的 sudo 命令
pm2 save
```

### 7. 开放防火墙端口

```bash
# Ubuntu (ufw)
sudo ufw allow 8787/tcp

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=8787/tcp
sudo firewall-cmd --reload
```

### 8. 验证部署

浏览器访问 `http://<服务器IP>:8787`，应该能看到管理后台页面。

### PM2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看所有进程状态 |
| `pm2 logs job-helper` | 查看实时日志 |
| `pm2 restart job-helper` | 重启应用 |
| `pm2 stop job-helper` | 停止应用 |
| `pm2 delete job-helper` | 删除应用 |

### 修改端口

如需修改端口，编辑 `ecosystem.config.js` 中的 `PORT` 环境变量，然后重启：

```bash
pm2 restart job-helper
```

---

## 让油猴脚本把数据同步过来

1. 先确保后台已启动（上面的 `node server.js`）。
2. 打开智联招聘/Boss直聘等页面，点击脚本面板右上角 **⚙️ 设置**。
3. 找到「管理后台同步」区块：
   - 勾选「投递成功后同步记录到本地管理后台」
   - 后台地址默认是 `http://127.0.0.1:8787/api`，如果部署到了内网服务器，需要改为 `http://<服务器IP>:8787/api`
   - 点「测试连接」确认能连通
4. 保存设置。之后每次自动投递成功，都会把岗位名、公司、匹配度、匹配技能等同步一条记录到后台。

面板右上角的 🌐 图标可以直接打开管理后台页面。

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/applications` | 查询投递记录，支持 `platform` / `minScore` / `status` / `q`(搜索) / `limit`(≤5000) / `offset` |
| GET | `/api/applications/export.csv` | 服务端直出 CSV 下载，支持与上面相同的筛选参数 |
| POST | `/api/applications` | 新增一条投递记录（脚本自动调用） |
| PATCH | `/api/applications/:id` | 修正一条记录的部分字段（name/company/score/matched/platform/salary/city/status） |
| DELETE | `/api/applications/:id` | 删除一条记录，记录不存在时返回 404 |
| GET | `/api/stats/overview` | 总投递数、今日投递数、平均匹配度、平台分布 |
| GET | `/api/stats/daily?days=14` | 按天统计投递数量 |
| GET | `/api/stats/skills?top=10` | 高频匹配技能排行 |
| GET | `/api/stats/funnel` | 投递转化漏斗：各阶段累计到达数 + 已拒绝总数 |
| GET | `/api/meta/statuses` | 合法的投递状态取值列表 |
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
