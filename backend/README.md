# 投递管理后台 (job-helper-backend)

配合 `zhaopin_job_helper.user.js` v6.0+ 使用的本地管理与统计后台。数据保存在本地 `data/` 目录的 JSON 文件中，不依赖任何数据库，也不会把数据发送到任何第三方服务器。

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

浏览器打开这个地址即可看到管理面板：总览统计（趋势图、平台分布、技能频率）、投递记录（搜索/筛选/删除/导出CSV）、投递策略配置。

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
| GET | `/api/applications` | 查询投递记录，支持 `platform` / `minScore` / `q`(搜索) / `limit` / `offset` |
| POST | `/api/applications` | 新增一条投递记录（脚本自动调用） |
| DELETE | `/api/applications/:id` | 删除一条记录 |
| GET | `/api/stats/overview` | 总投递数、今日投递数、平均匹配度、平台分布 |
| GET | `/api/stats/daily?days=14` | 按天统计投递数量 |
| GET | `/api/stats/skills?top=10` | 高频匹配技能排行 |
| GET | `/api/config` | 读取投递策略配置 |
| PUT | `/api/config` | 更新投递策略配置 |

## 目录结构

```
backend/
  server.js          # Express 入口
  src/
    db.js            # JSON 文件存储 + 统计逻辑
    routes.js         # API 路由
  public/
    index.html        # 管理面板页面
    app.js             # 前端逻辑（原生 JS，无需构建）
    style.css
  data/
    applications.json  # 投递记录（自动生成）
    config.json         # 投递策略配置（自动生成）
```

## 注意事项

- 默认监听 `8787` 端口，如被占用可以 `PORT=9000 node server.js` 换端口启动。
- 这是个人单机工具，没有做登录鉴权，请不要把它暴露到公网。
- `data/` 目录里的 JSON 文件就是全部数据，想备份直接复制这个文件夹即可。
