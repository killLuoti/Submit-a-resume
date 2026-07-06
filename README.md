# 📄 Submit-a-resume - 智能岗位匹配助手

> 一个专为**智联招聘**设计的 Tampermonkey 油猴脚本，自动计算岗位与你的技能匹配度，快速筛选适合你的工作。

---

## ✨ 功能特点

| 功能 | 说明 |
|:----:|------|
| 🏷️ **匹配度评分** | 每个岗位自动显示 **0%~100%** 的技能匹配度 |
| 💰 **薪资评估** | 自动判断薪资是否在你的期望范围内 |
| 🧩 **技能标签云** | 岗位卡片底部显示匹配到的技能关键词 |
| 🎨 **高亮推荐** | 匹配度 ≥60% 的岗位绿色边框高亮 |
| 🎛️ **浮动面板** | 右侧统计面板，实时显示匹配数据 |
| 🔍 **一键筛选** | 「全部」「仅看高匹配」「薪资合适」一键切换 |
| 🔄 **自动刷新** | 翻页后自动重新计算匹配度 |
| 📦 **可拖拽** | 面板可拖拽到任意位置 |

---

## 📦 安装方法

### 1. 安装油猴插件
| 浏览器 | 插件地址 |
|--------|----------|
| Chrome | [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |

### 2. 安装脚本
- 点击 `zhaopin_job_helper.user.js` 文件
- 点击右上角 **Raw** 按钮
- Tampermonkey 会自动弹出安装提示 → 点击 **安装**

### 3. 使用
- 打开 [智联招聘](https://www.zhaopin.com/) 搜索任意岗位
- 页面右侧出现 **🎯 智能岗位匹配** 面板
- 每个岗位卡片自动显示匹配度评分

---

## 🛠️ 自定义配置

打开脚本，找到 `MY_SKILLS` 和 `PREFERENCES` 进行修改：

```javascript
// 修改你的技能库
const MY_SKILLS = {
    'Python': { weight: 10, category: 'dev' },
    'Kubernetes': { weight: 9, category: 'dev' },  // 新增技能
    // ...
};

// 修改期望薪资和城市
const PREFERENCES = {
    expectedSalary: [7000, 10000],  // 期望薪资
    city: '佛山',                    // 目标城市
};
```

---

## 📝 个人信息

- **姓名**: 罗启盛
- **年龄**: 28岁
- **经验**: 4年 IT技术支持
- **学历**: 大专 · 物联网技术与应用
- **期望**: IT技术支持与运维工程师 · 7-10K · 佛山

---

## 📄 许可证

MIT License
