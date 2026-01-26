# 🎨 Admin 前端 UI 布局改造方案

> **方案名称**: 组合2 - 侧边栏 + Tab工作台  
> **创建日期**: 2026-01-24  
> **状态**: 🚀 **即将实施**  
> **采用方案**: ✅ **方案C（页面重构）**  
> **核心原则**: 外壳改造 + 内容保留，业务逻辑零修改

---

## 🎯 功能清单

| 功能 | 状态 | 说明 |
|-----|------|------|
| **侧边栏导航** | ✅ 必须实现 | 可折叠的左侧菜单 |
| **Tab 工作台** | ✅ 必须实现 | 多标签页管理 |
| **一键换主题** | ✅ 必须实现 | 切换亮色/暗色/自定义主题 |
| **Tab 切换不丢数据** | ✅ 自动支持 | iframe 保留内存状态 |
| **草稿自动保存** | ✅ 必须实现 | 防止关闭/刷新丢失数据 |

---

## ⚠️ 技术框架声明

> **🔒 技术栈完全不变**  
> 本方案仅涉及 UI 布局和视觉风格的改造，**不会改变现有的技术框架、技术方案和技术路线**。

| 项目 | 保持不变 | 说明 |
|-----|---------|------|
| **构建工具** | ✅ Vite | 继续使用 Vite 构建，不切换其他工具 |
| **UI框架** | ✅ Alpine.js | 继续使用 Alpine.js，不引入 Vue/React |
| **样式框架** | ✅ Tailwind CSS | 继续使用 Tailwind，新样式也使用 Tailwind 变量 |
| **模板引擎** | ✅ EJS | 继续使用 EJS 模板，新模板也用 EJS 编写 |
| **业务逻辑** | ✅ 完全保留 | 所有 `x-data`、API 调用、数据绑定不做任何修改 |
| **页面结构** | ✅ 保持兼容 | 现有页面可直接在新布局中通过 iframe 加载 |
| **依赖版本** | ✅ 保持不变 | 不升级/不更换任何现有依赖包 |

---

## 📋 目录

1. [现状分析](#一-现状分析)
2. [改造策略](#二-改造策略)
3. [布局设计](#三-布局设计)
4. [文件修改清单](#四-文件修改清单)
5. [样式代码](#五-样式代码)
6. [组件代码](#六-组件代码)
7. [模板代码](#七-模板代码)
8. [页面改造方式](#八-页面改造方式)（✅ 采用方案C）
9. [一键换主题功能](#九-一键换主题功能)（✅ 必须实现）
10. [草稿自动保存功能](#十-草稿自动保存功能)（✅ 必须实现）
11. [实施步骤](#十一-实施步骤)
12. [业务逻辑保证](#十二-业务逻辑保证)

---

## 一、现状分析

### 技术栈

| 项目 | 技术选型 |
|-----|---------|
| 构建工具 | Vite |
| UI框架 | Alpine.js |
| 样式框架 | Tailwind CSS |
| 模板引擎 | EJS |

### 当前布局方式

- **导航方式**: 每个页面独立顶部导航栏（蓝色背景）
- **内容布局**: container 居中内容区
- **页面访问**: 通过 Dashboard 功能卡片访问各页面
- **页面数量**: 约 20+ 个 HTML 入口页面

### 当前问题

1. 无全局侧边栏导航系统
2. 功能分类按技术优先级（P0-P4），运营人员不易理解
3. 每次操作需返回 Dashboard 查找功能入口
4. 视觉风格为标准 Bootstrap 配色，缺乏品牌识别度

---

## 二、改造策略

### 核心思路：外壳改造 + 内容保留

**只改变外层布局容器，不触碰页面内部的业务逻辑和数据绑定**

```
┌─────────────────────────────────────────────────────────────────┐
│  【新增】顶部 Header 栏 + Tab 标签栏                             │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│ 【新增】  │   【保留原样】页面内容区                               │
│  侧边栏   │   ← 原有的 x-data、表格、表单、Modal 全部保留          │
│  导航    │                                                      │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 改造范围

| 改造项 | 说明 |
|-------|------|
| ✅ 新增 | 侧边栏导航组件 |
| ✅ 新增 | Tab 工作台组件 |
| ✅ 新增 | 新布局模板 |
| ✅ 新增 | 新配色样式 |
| ❌ 不动 | 页面业务逻辑 |
| ❌ 不动 | API 调用代码 |
| ❌ 不动 | 数据绑定和表单 |

---

## 三、布局设计

### 整体布局示意

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🎰 抽奖管理系统    [📊仪表盘 ×] [📋消费审核 ×] [🎰活动管理 ×] [+]  🔔 管理员 ▼ │
├──────────┬──────────────────────────────────────────────────────────────┤
│          │                                                              │
│ 🏠 工作台│   ┌─────────────────────────────────────────────────────┐   │
│          │   │                                                     │   │
│ 📋 日常运营│   │              📊 仪表盘内容区域（当前Tab）            │   │
│  ├ 消费审核│   │                                                     │   │
│  ├ 欠账管理│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐          │   │
│  └ 风控告警│   │   │今日用户  │  │今日抽奖  │  │中奖金额  │          │   │
│          │   │   │  1,234  │  │  5,678  │  │ ¥12,345 │          │   │
│ 🎰 抽奖活动│   │   └─────────┘  └─────────┘  └─────────┘          │   │
│  ├ 活动管理│   │                                                     │   │
│  └ 奖品配置│   │                     📈 7日趋势图                    │   │
│          │   │                                                     │   │
│ 💎 资产中心│   └─────────────────────────────────────────────────────┘   │
│ 🏪 市场交易│                                                              │
│ 👥 用户门店│  最近访问: 消费审核 | 活动管理 | 用户列表 | 奖品配置          │
│ ⚙️ 系统设置│                                                              │
│          │                                                              │
│ [« 折叠] │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

### 组件架构

```
┌─────────────────────────────────────────────────────────┐
│                    AdminLayout                          │
│  ┌─────────────┐  ┌───────────────────────────────────┐ │
│  │             │  │            TabContainer            │ │
│  │  Sidebar    │  │  ┌─────────────────────────────┐  │ │
│  │  Component  │  │  │        TabBar               │  │ │
│  │             │  │  │  [Tab1] [Tab2] [Tab3] [+]   │  │ │
│  │  - NavGroup │  │  └─────────────────────────────┘  │ │
│  │  - NavItem  │  │  ┌─────────────────────────────┐  │ │
│  │  - Collapse │  │  │        TabPanel             │  │ │
│  │             │  │  │     (iframe/动态内容)        │  │ │
│  │             │  │  │                             │  │ │
│  └─────────────┘  │  └─────────────────────────────┘  │ │
│                   └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 导航模块分组（7大业务模块）

```
🏠 工作台
   └─ dashboard.html (仪表盘)

📋 日常运营（运营最常用）
   ├─ 消费记录审核
   ├─ 欠账管理
   ├─ 风控告警
   └─ 客服工作台

🎰 抽奖活动
   ├─ 活动管理
   ├─ 奖品配置
   ├─ 策略引擎
   └─ 抽奖监控

💎 资产中心
   ├─ 资产管理
   ├─ 资产调整
   └─ 孤儿冻结清理

🏪 市场交易
   ├─ 兑换市场
   ├─ C2C交易
   └─ 市场管理

👥 用户门店
   ├─ 用户管理
   ├─ 用户层级
   └─ 门店管理

⚙️ 系统设置
   ├─ 系统配置
   ├─ 内容管理
   └─ 会话管理

📊 数据分析
   ├─ 统计报表
   └─ 运营分析
```

### 🎨 配色方案

#### 推荐方案：深蓝科技风（推荐）

这是目前最流行的企业级后台管理风格：

```
┌─────────────────────────────────────────────────────────────┐
│ 🏪 餐厅抽奖管理系统                    管理员 ▼  🔔  退出   │  ← 顶部栏（白色/浅色）
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ 🏠 工作台│   📊 今日数据概览                                 │
│          │   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│ 📋 日常运营│   │ 用户 │ │ 抽奖 │ │中奖率│ │ 客服 │           │
│  ├ 消费审核│   │ 1,234│ │ 5,678│ │ 23% │ │  12  │           │
│  ├ 欠账管理│   └──────┘ └──────┘ └──────┘ └──────┘           │
│  └ 风控告警│                                                 │
│          │   ┌────────────────────────────────────────┐     │
│ 🎰 抽奖活动│   │          📈 7日趋势图表                │     │
│  ├ 活动管理│   │                                       │     │
│  ├ 奖品配置│   └────────────────────────────────────────┘     │
│  └ 策略引擎│                                                 │
│          │                                                   │
│ 💎 资产中心│                                                 │
│          │                                                   │
│ 🏪 市场交易│                                                 │
│          │                                                 │
│ 👥 用户门店│                                                 │
│          │                                                   │
│ ⚙️ 系统设置│                                                 │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
     ↑ 深色侧边栏                         ↑ 浅灰内容区
    (#0f172a)                           (#f8fafc)
```

```css
:root {
  /* 侧边栏 - 深色系 */
  --sidebar-bg: #0f172a;           /* 深海蓝黑 */
  --sidebar-hover: #1e293b;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #3b82f6, #2563eb);  /* 激活渐变 */
  --sidebar-text: #94a3b8;         /* 未选中文字 */
  --sidebar-text-active: #ffffff;  /* 选中文字 */
  
  /* 主色调 */
  --primary: #3b82f6;              /* 明亮蓝 */
  --primary-hover: #2563eb;
  --primary-gradient: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  
  /* 功能色 */
  --success: #10b981;              /* 翠绿 */
  --warning: #f59e0b;              /* 琥珀 */
  --danger: #ef4444;               /* 珊瑚红 */
  --info: #06b6d4;                 /* 青色 */
  
  /* 内容区 */
  --content-bg: #f8fafc;           /* 极浅灰 */
  --card-bg: #ffffff;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
}
```

#### 备选方案一：紫色渐变风（更时尚）

```css
:root {
  --sidebar-bg: #1a1625;           /* 深紫黑 */
  --sidebar-hover: #2d2640;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #8b5cf6, #a855f7);  /* 激活渐变 */
  --sidebar-text: #a78bfa;         /* 未选中文字 */
  --sidebar-text-active: #ffffff;  /* 选中文字 */
  
  --primary: #8b5cf6;              /* 紫色 */
  --primary-hover: #7c3aed;
  --primary-gradient: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
}
```

#### 备选方案二：暗绿商务风（稳重）

```css
:root {
  --sidebar-bg: #0d1f17;           /* 深墨绿 */
  --sidebar-hover: #1a3d2e;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #10b981, #059669);  /* 激活渐变 */
  --sidebar-text: #6ee7b7;         /* 未选中文字 */
  --sidebar-text-active: #ffffff;  /* 选中文字 */
  
  --primary: #10b981;              /* 翠绿 */
  --primary-hover: #059669;
  --primary-gradient: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
}
```

#### 备选方案三：暗黑极简风（护眼）

```css
:root {
  --sidebar-bg: #18181b;           /* 纯黑灰 */
  --sidebar-hover: #27272a;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #f59e0b, #d97706);  /* 琥珀橙 */
  --sidebar-text: #a1a1aa;         /* 中性灰 */
  --sidebar-text-active: #ffffff;
  
  --primary: #f59e0b;              /* 琥珀橙 */
  --primary-hover: #d97706;
  --content-bg: #09090b;           /* 深黑内容区 */
  --header-bg: #18181b;
}
```

#### 备选方案四：蓝紫渐变风（高端）

```css
:root {
  --sidebar-bg: #1e1b4b;           /* 深靛蓝 */
  --sidebar-hover: #312e81;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #6366f1, #8b5cf6);  /* 靛紫渐变 */
  --sidebar-text: #a5b4fc;         /* 浅靛蓝 */
  --sidebar-text-active: #ffffff;
  
  --primary: #6366f1;              /* 靛蓝 */
  --primary-hover: #4f46e5;
  --content-bg: #f5f3ff;           /* 淡紫背景 */
}
```

#### 备选方案五：翠绿清新风（年轻）

```css
:root {
  --sidebar-bg: #ffffff;           /* 白色侧边栏 */
  --sidebar-hover: #f0fdf4;        /* 浅绿悬停 */
  --sidebar-active: linear-gradient(135deg, #22c55e, #16a34a);  /* 翠绿渐变 */
  --sidebar-text: #374151;         /* 深灰文字 */
  --sidebar-text-active: #ffffff;
  
  --primary: #22c55e;              /* 翠绿 */
  --primary-hover: #16a34a;
  --content-bg: #f0fdf4;           /* 浅绿背景 */
}
```

#### 备选方案六：玫瑰粉暖风（时尚）

```css
:root {
  --sidebar-bg: #1c1917;           /* 暖黑 */
  --sidebar-hover: #292524;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #f43f5e, #e11d48);  /* 玫瑰渐变 */
  --sidebar-text: #a8a29e;         /* 暖灰 */
  --sidebar-text-active: #ffffff;
  
  --primary: #f43f5e;              /* 玫瑰红 */
  --primary-hover: #e11d48;
  --content-bg: #fafaf9;           /* 暖白背景 */
}
```

#### 备选方案七：海洋青蓝风（科技）

```css
:root {
  --sidebar-bg: #042f2e;           /* 深青蓝 */
  --sidebar-hover: #134e4a;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #14b8a6, #0d9488);  /* 青蓝渐变 */
  --sidebar-text: #5eead4;         /* 青绿 */
  --sidebar-text-active: #ffffff;
  
  --primary: #14b8a6;              /* 青蓝 */
  --primary-hover: #0d9488;
  --content-bg: #f0fdfa;           /* 淡青背景 */
}
```

#### 备选方案八：浅色极简风（明亮）

```css
:root {
  --sidebar-bg: #ffffff;           /* 纯白 */
  --sidebar-hover: #f1f5f9;        /* 浅灰悬停 */
  --sidebar-active: linear-gradient(135deg, #3b82f6, #2563eb);  /* 蓝色渐变 */
  --sidebar-text: #64748b;         /* 灰色文字 */
  --sidebar-text-active: #ffffff;
  --sidebar-border: #e2e8f0;       /* 可见边框 */
  
  --primary: #3b82f6;              /* 蓝色 */
  --primary-hover: #2563eb;
  --content-bg: #f8fafc;           /* 极浅灰 */
}
```

#### 备选方案九：暗红商务风（金融）

```css
:root {
  --sidebar-bg: #1a1a1a;           /* 纯黑 */
  --sidebar-hover: #2d2d2d;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #dc2626, #b91c1c);  /* 暗红渐变 */
  --sidebar-text: #9ca3af;         /* 灰色 */
  --sidebar-text-active: #ffffff;
  
  --primary: #dc2626;              /* 暗红 */
  --primary-hover: #b91c1c;
  --content-bg: #fafafa;           /* 纯白背景 */
}
```

#### 备选方案十：赛博朋克风（未来）

```css
:root {
  --sidebar-bg: #0a0a0a;           /* 纯黑 */
  --sidebar-hover: #1a1a2e;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #00f5d4, #00bbf9);  /* 霓虹渐变 */
  --sidebar-text: #00f5d4;         /* 霓虹青 */
  --sidebar-text-active: #ffffff;
  
  --primary: #f72585;              /* 霓虹粉 */
  --primary-hover: #b5179e;
  --content-bg: #16213e;           /* 深蓝背景 */
}
```

#### 备选方案十一：日落橙暖风（餐饮）

```css
:root {
  --sidebar-bg: #1f1f1f;           /* 深灰 */
  --sidebar-hover: #2d2d2d;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #ff6b35, #f7931e);  /* 日落渐变 */
  --sidebar-text: #fbbf77;         /* 暖橙 */
  --sidebar-text-active: #ffffff;
  
  --primary: #ff6b35;              /* 日落橙 */
  --primary-hover: #ea580c;
  --content-bg: #fffbeb;           /* 暖白背景 */
}
```

#### 备选方案十二：薰衣草紫风（优雅）

```css
:root {
  --sidebar-bg: #f3e8ff;           /* 浅紫白 */
  --sidebar-hover: #e9d5ff;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #a855f7, #9333ea);  /* 紫色渐变 */
  --sidebar-text: #6b21a8;         /* 深紫 */
  --sidebar-text-active: #ffffff;
  
  --primary: #a855f7;              /* 薰衣草紫 */
  --primary-hover: #9333ea;
  --content-bg: #faf5ff;           /* 淡紫背景 */
}
```

#### 备选方案十三：森林墨绿风（自然）

```css
:root {
  --sidebar-bg: #14532d;           /* 深森绿 */
  --sidebar-hover: #166534;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #84cc16, #65a30d);  /* 酸橙渐变 */
  --sidebar-text: #bbf7d0;         /* 浅绿 */
  --sidebar-text-active: #ffffff;
  
  --primary: #84cc16;              /* 酸橙绿 */
  --primary-hover: #65a30d;
  --content-bg: #f7fee7;           /* 浅绿背景 */
}
```

#### 备选方案十四：午夜蓝风（航空）

```css
:root {
  --sidebar-bg: #020617;           /* 深夜蓝 */
  --sidebar-hover: #0f172a;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #0ea5e9, #0284c7);  /* 天蓝渐变 */
  --sidebar-text: #7dd3fc;         /* 浅蓝 */
  --sidebar-text-active: #ffffff;
  
  --primary: #0ea5e9;              /* 天空蓝 */
  --primary-hover: #0284c7;
  --content-bg: #f0f9ff;           /* 淡蓝背景 */
}
```

#### 备选方案十五：咖啡棕暖风（复古）

```css
:root {
  --sidebar-bg: #292524;           /* 深棕 */
  --sidebar-hover: #44403c;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #d97706, #b45309);  /* 琥珀渐变 */
  --sidebar-text: #d6d3d1;         /* 暖灰 */
  --sidebar-text-active: #ffffff;
  
  --primary: #d97706;              /* 琥珀棕 */
  --primary-hover: #b45309;
  --content-bg: #fef3c7;           /* 暖黄背景 */
}
```

#### 备选方案十六：电竞霓虹风（娱乐）

```css
:root {
  --sidebar-bg: #000000;           /* 纯黑 */
  --sidebar-hover: #1a1a1a;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #a855f7, #ec4899);  /* 霓虹渐变 */
  --sidebar-text: #c084fc;         /* 紫粉 */
  --sidebar-text-active: #ffffff;
  
  --primary: #ec4899;              /* 霓虹粉紫 */
  --primary-hover: #db2777;
  --content-bg: #18181b;           /* 深灰背景 */
}
```

#### 备选方案十七：北欧极简风（家居）

```css
:root {
  --sidebar-bg: #fafafa;           /* 极浅灰 */
  --sidebar-hover: #f5f5f5;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #475569, #334155);  /* 石板渐变 */
  --sidebar-text: #64748b;         /* 灰色 */
  --sidebar-text-active: #ffffff;
  
  --primary: #475569;              /* 石板灰 */
  --primary-hover: #334155;
  --content-bg: #ffffff;           /* 纯白背景 */
}
```

#### 备选方案十八：皇家金色风（奢华）

```css
:root {
  --sidebar-bg: #1c1917;           /* 暖黑 */
  --sidebar-hover: #292524;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #eab308, #ca8a04);  /* 金色渐变 */
  --sidebar-text: #fde047;         /* 金黄 */
  --sidebar-text-active: #ffffff;
  
  --primary: #eab308;              /* 皇家金 */
  --primary-hover: #ca8a04;
  --content-bg: #fefce8;           /* 淡金背景 */
}
```

#### 备选方案十九：樱花粉风（日系）

```css
:root {
  --sidebar-bg: #fdf2f8;           /* 浅粉白 */
  --sidebar-hover: #fce7f3;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #ec4899, #db2777);  /* 粉红渐变 */
  --sidebar-text: #9d174d;         /* 深粉 */
  --sidebar-text-active: #ffffff;
  
  --primary: #ec4899;              /* 樱花粉 */
  --primary-hover: #db2777;
  --content-bg: #fff1f2;           /* 淡粉背景 */
}
```

#### 备选方案二十：海军蓝正统风（政务）

```css
:root {
  --sidebar-bg: #1e3a5f;           /* 海军蓝 */
  --sidebar-hover: #274a7a;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #60a5fa, #3b82f6);  /* 蓝色渐变 */
  --sidebar-text: #93c5fd;         /* 浅蓝 */
  --sidebar-text-active: #ffffff;
  
  --primary: #1e40af;              /* 海军蓝 */
  --primary-hover: #1d4ed8;
  --content-bg: #eff6ff;           /* 淡蓝背景 */
}
```

#### 备选方案二十一：薄荷清凉风（医疗）

```css
:root {
  --sidebar-bg: #ecfdf5;           /* 浅薄荷 */
  --sidebar-hover: #d1fae5;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #34d399, #10b981);  /* 薄荷渐变 */
  --sidebar-text: #047857;         /* 深绿 */
  --sidebar-text-active: #ffffff;
  
  --primary: #34d399;              /* 薄荷绿 */
  --primary-hover: #10b981;
  --content-bg: #f0fdf4;           /* 淡绿背景 */
}
```

#### 备选方案二十二：火山岩深灰风（工业）

```css
:root {
  --sidebar-bg: #262626;           /* 深灰 */
  --sidebar-hover: #404040;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #f97316, #ea580c);  /* 火山渐变 */
  --sidebar-text: #a3a3a3;         /* 中灰 */
  --sidebar-text-active: #ffffff;
  
  --primary: #f97316;              /* 火山橙 */
  --primary-hover: #ea580c;
  --content-bg: #fafafa;           /* 浅灰背景 */
}
```

#### 备选方案二十三：星空紫夜风（梦幻）

```css
:root {
  --sidebar-bg: #0c0a1d;           /* 深紫夜 */
  --sidebar-hover: #1a1832;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #818cf8, #6366f1);  /* 星空渐变 */
  --sidebar-text: #a5b4fc;         /* 浅紫 */
  --sidebar-text-active: #ffffff;
  
  --primary: #818cf8;              /* 星空紫 */
  --primary-hover: #6366f1;
  --content-bg: #eef2ff;           /* 淡紫背景 */
}
```

#### 备选方案二十四：中国红喜庆风（节日）

```css
:root {
  --sidebar-bg: #450a0a;           /* 深红 */
  --sidebar-hover: #7f1d1d;        /* 悬停色 */
  --sidebar-active: linear-gradient(135deg, #ef4444, #dc2626);  /* 红色渐变 */
  --sidebar-text: #fca5a5;         /* 浅红 */
  --sidebar-text-active: #ffffff;
  
  --primary: #dc2626;              /* 中国红 */
  --primary-hover: #b91c1c;
  --content-bg: #fef2f2;           /* 淡红背景 */
}
```

### 📊 配色方案速览表

| # | 方案名称 | 侧边栏 | 主色调 | 适用场景 |
|---|---------|-------|-------|---------|
| 1 | 深蓝科技风 ✅推荐 | 深蓝黑 | 蓝 | 企业通用 |
| 2 | 紫色渐变风 | 深紫黑 | 紫 | 创意设计 |
| 3 | 暗绿商务风 | 深墨绿 | 绿 | 金融环保 |
| 4 | 暗黑极简风 | 纯黑 | 橙 | 开发护眼 |
| 5 | 蓝紫渐变风 | 深靛蓝 | 靛紫 | 高端神秘 |
| 6 | 翠绿清新风 | 白色 | 翠绿 | 清新年轻 |
| 7 | 玫瑰粉暖风 | 暖黑 | 玫瑰红 | 时尚活力 |
| 8 | 海洋青蓝风 | 深青蓝 | 青蓝 | 医疗科技 |
| 9 | 浅色极简风 | 白色 | 蓝 | 传统明亮 |
| 10 | 暗红商务风 | 纯黑 | 暗红 | 金融高端 |
| 11 | 赛博朋克风 | 纯黑 | 霓虹粉 | 游戏潮流 |
| 12 | 日落橙暖风 | 深灰 | 日落橙 | 餐饮温暖 |
| 13 | 薰衣草紫风 | 浅紫白 | 薰衣草紫 | 优雅美妆 |
| 14 | 森林墨绿风 | 深森绿 | 酸橙绿 | 自然农业 |
| 15 | 午夜蓝风 | 深夜蓝 | 天空蓝 | 航空物流 |
| 16 | 咖啡棕暖风 | 深棕 | 琥珀棕 | 咖啡复古 |
| 17 | 电竞霓虹风 | 纯黑 | 霓虹粉紫 | 电竞娱乐 |
| 18 | 北欧极简风 | 白灰 | 石板灰 | 极简高端 |
| 19 | 皇家金色风 | 暖黑 | 皇家金 | 奢华VIP |
| 20 | 樱花粉风 | 浅粉白 | 樱花粉 | 日系甜美 |
| 21 | 海军蓝正统风 | 深海军蓝 | 海军蓝 | 政务正式 |
| 22 | 薄荷清凉风 | 浅薄荷 | 薄荷绿 | 健康医疗 |
| 23 | 火山岩深灰风 | 深灰 | 火山橙 | 工业制造 |
| 24 | 星空紫夜风 | 深紫夜 | 星空紫 | 梦幻教育 |
| 25 | 中国红喜庆风 | 深红 | 中国红 | 喜庆节日 |

> **切换方式**: 修改 `src/styles/layout/variables.css` 文件，将对应方案的CSS变量复制进去，然后执行 `npm run build` 重新构建。

### 📐 组件样式规范

#### 数据卡片

```css
.stat-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-card .value {
  font-size: 32px;
  font-weight: 700;
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

#### 按钮样式

```css
/* 主按钮 - 渐变 */
.btn-primary {
  background: var(--primary-gradient);
  border: none;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 500;
  transition: opacity 0.2s, transform 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 危险操作按钮 */
.btn-danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

/* 成功操作按钮 */
.btn-success {
  background: linear-gradient(135deg, #10b981, #059669);
}
```

#### 表格样式

```css
/* 现代表格样式 */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--card-bg);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.data-table th {
  background: #f8fafc;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.data-table td {
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  color: var(--text-primary);
}

.data-table tr:hover td {
  background: #f8fafc;
}
```

#### 徽章/标签样式

```css
/* 状态徽章 */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.badge-success {
  background: #d1fae5;
  color: #059669;
}

.badge-warning {
  background: #fef3c7;
  color: #d97706;
}

.badge-danger {
  background: #fee2e2;
  color: #dc2626;
}

.badge-info {
  background: #cffafe;
  color: #0891b2;
}
```

---

## 四、文件修改清单

### 📁 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/styles/layout/variables.css` | 新配色变量定义 |
| `src/styles/layout/sidebar.css` | 侧边栏样式 |
| `src/styles/layout/workspace-tabs.css` | Tab 工作台样式 |
| `src/alpine/components/sidebar-nav.js` | 侧边栏 Alpine 组件 |
| `src/alpine/components/workspace-tabs.js` | Tab 管理器 Alpine 组件 |
| `src/templates/layouts/workspace.ejs` | 新布局模板（侧边栏+Tab） |
| `src/templates/partials/sidebar.ejs` | 侧边栏 HTML 模板 |
| `src/templates/partials/workspace-header.ejs` | 新顶部栏模板 |

### 📝 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/styles/index.css` | 引入新的布局样式文件 |
| `src/alpine/index.js` | 注册 sidebar-nav 和 workspace-tabs 组件 |

### 📄 业务页面（可选改造）

现有业务页面可保持不变，通过 iframe 方式嵌入 Tab 工作台。

---

## 五、样式代码

### 5.1 布局变量 `src/styles/layout/variables.css`

```css
/**
 * 布局变量定义
 * @description 侧边栏 + Tab 工作台布局的 CSS 变量
 */

:root {
  /* ========== 侧边栏 ========== */
  --sidebar-width: 260px;
  --sidebar-collapsed-width: 72px;
  --sidebar-bg: #0f172a;
  --sidebar-hover: #1e293b;
  --sidebar-active-gradient: linear-gradient(135deg, #3b82f6, #2563eb);
  --sidebar-text: #94a3b8;
  --sidebar-text-active: #ffffff;
  --sidebar-border: rgba(255, 255, 255, 0.1);
  
  /* ========== 顶部栏 ========== */
  --header-height: 56px;
  --header-bg: #ffffff;
  --header-border: #e2e8f0;
  
  /* ========== Tab 栏 ========== */
  --tab-bar-height: 40px;
  --tab-bar-bg: #f8fafc;
  --tab-active-bg: #ffffff;
  --tab-text: #64748b;
  --tab-text-active: #1e293b;
  
  /* ========== 主色调 ========== */
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-gradient: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  
  /* ========== 功能色 ========== */
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #06b6d4;
  
  /* ========== 内容区 ========== */
  --content-bg: #f3f4f6;
}
```

### 5.2 侧边栏样式 `src/styles/layout/sidebar.css`

```css
/**
 * 侧边栏布局样式
 */

/* ========== 布局容器 ========== */
.admin-layout {
  display: flex;
  min-height: 100vh;
}

/* ========== 侧边栏 ========== */
.admin-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  transition: width 0.3s ease;
}

.admin-sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.admin-sidebar.collapsed .nav-text,
.admin-sidebar.collapsed .logo-text,
.admin-sidebar.collapsed .toggle-icon {
  display: none;
}

.admin-sidebar.collapsed .nav-group-items {
  display: none;
}

/* ========== Logo 区域 ========== */
.sidebar-logo {
  height: var(--header-height);
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--sidebar-border);
}

.logo-icon {
  font-size: 24px;
  min-width: 32px;
  text-align: center;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  margin-left: 12px;
}

/* ========== 导航菜单 ========== */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px;
}

/* 导航分组 */
.nav-group {
  margin-bottom: 8px;
}

.nav-group-title {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  color: var(--sidebar-text);
  cursor: pointer;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  user-select: none;
}

.nav-group-title:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

.nav-group-title .nav-icon {
  width: 20px;
  min-width: 20px;
  text-align: center;
  font-size: 16px;
}

.nav-group-title .nav-text {
  flex: 1;
  margin-left: 12px;
}

.nav-group-title .toggle-icon {
  font-size: 12px;
  transition: transform 0.3s;
  color: var(--sidebar-text);
}

.nav-group.expanded .toggle-icon {
  transform: rotate(180deg);
}

/* 导航子项容器 */
.nav-group-items {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.nav-group.expanded .nav-group-items {
  max-height: 500px;
}

/* 导航项 */
.nav-item {
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 48px;
  color: var(--sidebar-text);
  text-decoration: none;
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.2s;
  cursor: pointer;
  margin: 2px 0;
}

.nav-item:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

.nav-item.active {
  background: var(--sidebar-active-gradient);
  color: var(--sidebar-text-active);
}

/* 单项菜单（如工作台） */
.nav-single {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  color: var(--sidebar-text);
  text-decoration: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
  margin-bottom: 8px;
}

.nav-single:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-text-active);
}

.nav-single.active {
  background: var(--sidebar-active-gradient);
  color: var(--sidebar-text-active);
}

.nav-single .nav-icon {
  width: 20px;
  min-width: 20px;
  text-align: center;
  font-size: 16px;
}

.nav-single .nav-text {
  margin-left: 12px;
}

/* ========== 侧边栏底部 ========== */
.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--sidebar-border);
}

.collapse-btn {
  width: 100%;
  padding: 10px;
  background: var(--sidebar-hover);
  border: none;
  border-radius: 8px;
  color: var(--sidebar-text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.collapse-btn:hover {
  color: var(--sidebar-text-active);
  background: rgba(255, 255, 255, 0.1);
}

/* ========== 主内容区 ========== */
.admin-main {
  flex: 1;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 0.3s ease;
  background: var(--content-bg);
}

.admin-sidebar.collapsed ~ .admin-main {
  margin-left: var(--sidebar-collapsed-width);
}

/* ========== 响应式设计 ========== */
@media (max-width: 1024px) {
  .admin-sidebar {
    transform: translateX(-100%);
  }
  
  .admin-sidebar.mobile-open {
    transform: translateX(0);
  }
  
  .admin-main {
    margin-left: 0;
  }
}
```

### 5.3 Tab 工作台样式 `src/styles/layout/workspace-tabs.css`

```css
/**
 * Tab 工作台样式
 */

/* ========== 顶部栏 ========== */
.workspace-header {
  height: var(--header-height);
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 移动端菜单按钮 */
.mobile-menu-btn {
  display: none;
  padding: 8px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #64748b;
}

@media (max-width: 1024px) {
  .mobile-menu-btn {
    display: block;
  }
}

/* 面包屑 */
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #64748b;
}

.breadcrumb-nav a {
  color: var(--primary);
  text-decoration: none;
}

.breadcrumb-nav a:hover {
  text-decoration: underline;
}

/* 全局搜索 */
.global-search {
  position: relative;
  display: flex;
  align-items: center;
}

.global-search-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  font-size: 14px;
}

.global-search input {
  width: 240px;
  padding: 8px 12px 8px 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
  background: #f8fafc;
}

.global-search input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  background: #ffffff;
}

/* 通知按钮 */
.header-btn {
  position: relative;
  padding: 8px;
  background: none;
  border: none;
  font-size: 20px;
  color: #64748b;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.header-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
}

/* 用户下拉菜单 */
.user-dropdown {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  background: #f8fafc;
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.2s;
}

.user-dropdown:hover {
  background: #f1f5f9;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}

/* ========== Tab 栏 ========== */
.workspace-tab-bar {
  height: var(--tab-bar-height);
  background: var(--tab-bar-bg);
  border-bottom: 1px solid var(--header-border);
  display: flex;
  align-items: flex-end;
  padding: 0 16px;
  gap: 4px;
  overflow-x: auto;
}

.workspace-tab-bar::-webkit-scrollbar {
  height: 4px;
}

.workspace-tab-bar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}

/* Tab 项 */
.workspace-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-size: 13px;
  color: var(--tab-text);
  transition: all 0.2s;
  white-space: nowrap;
  max-width: 180px;
}

.workspace-tab:hover {
  background: #ffffff;
  border-color: #e2e8f0;
}

.workspace-tab.active {
  background: var(--tab-active-bg);
  color: var(--tab-text-active);
  border-color: #e2e8f0;
  margin-bottom: -1px;
  padding-bottom: 9px;
}

.workspace-tab .tab-icon {
  font-size: 14px;
}

.workspace-tab .tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.workspace-tab .tab-close {
  padding: 2px 4px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: all 0.2s;
  cursor: pointer;
}

.workspace-tab:hover .tab-close {
  opacity: 1;
}

.workspace-tab .tab-close:hover {
  background: #fee2e2;
  color: var(--danger);
}

/* 新增 Tab 按钮 */
.workspace-tab.tab-add {
  border: 1px dashed #cbd5e1;
  color: #64748b;
  padding: 6px 12px;
}

.workspace-tab.tab-add:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: transparent;
}

/* ========== 内容区 ========== */
.workspace-content {
  flex: 1;
  background: var(--content-bg);
  position: relative;
}

.tab-panel {
  display: none;
  height: 100%;
}

.tab-panel.active {
  display: block;
}

.tab-panel iframe {
  width: 100%;
  height: calc(100vh - var(--header-height) - var(--tab-bar-height));
  border: none;
}

/* ========== 响应式设计 ========== */
@media (max-width: 768px) {
  .workspace-header {
    padding: 0 16px;
  }
  
  .global-search {
    display: none;
  }
  
  .workspace-tab .tab-title {
    max-width: 80px;
  }
}
```

---

## 六、组件代码

### 6.1 侧边栏导航组件 `src/alpine/components/sidebar-nav.js`

```javascript
/**
 * 侧边栏导航组件
 * @description 管理侧边栏导航的展开/折叠和菜单状态
 */
export function sidebarNav() {
  return {
    // 侧边栏折叠状态
    collapsed: false,
    // 移动端菜单显示状态
    mobileOpen: false,
    // 默认展开的分组
    expandedGroups: ['operations', 'lottery'],
    
    // 导航配置（7大业务模块）
    navGroups: [
      {
        id: 'dashboard',
        name: '工作台',
        icon: '🏠',
        type: 'single',
        url: '/admin/dashboard.html'
      },
      {
        id: 'operations',
        name: '日常运营',
        icon: '📋',
        items: [
          { id: 'consumption', name: '消费记录审核', url: '/admin/finance-management.html?page=consumption' },
          { id: 'debt', name: '欠账管理', url: '/admin/finance-management.html?page=debt' },
          { id: 'risk', name: '风控告警', url: '/admin/risk-alerts.html', badge: true },
          { id: 'customer', name: '客服工作台', url: '/admin/customer-service.html' }
        ]
      },
      {
        id: 'lottery',
        name: '抽奖活动',
        icon: '🎰',
        items: [
          { id: 'campaigns', name: '活动管理', url: '/admin/lottery-management.html?page=campaigns' },
          { id: 'prizes', name: '奖品配置', url: '/admin/lottery-management.html?page=prizes' },
          { id: 'strategy', name: '策略引擎', url: '/admin/lottery-management.html?page=strategy' },
          { id: 'metrics', name: '抽奖监控', url: '/admin/lottery-management.html?page=metrics' },
          { id: 'presets', name: '抽奖预设', url: '/admin/presets.html' }
        ]
      },
      {
        id: 'assets',
        name: '资产中心',
        icon: '💎',
        items: [
          { id: 'asset-mgmt', name: '资产管理', url: '/admin/asset-management.html' },
          { id: 'asset-adj', name: '资产调整', url: '/admin/asset-adjustment.html' },
          { id: 'orphan', name: '孤儿冻结清理', url: '/admin/orphan-frozen.html' },
          { id: 'material-rules', name: '物料转换规则', url: '/admin/material-conversion-rules.html' }
        ]
      },
      {
        id: 'market',
        name: '市场交易',
        icon: '🏪',
        items: [
          { id: 'exchange', name: '兑换市场', url: '/admin/exchange-market.html' },
          { id: 'trade', name: 'C2C交易', url: '/admin/trade-management.html' },
          { id: 'market-mgmt', name: '市场管理', url: '/admin/market-management.html' }
        ]
      },
      {
        id: 'users',
        name: '用户门店',
        icon: '👥',
        items: [
          { id: 'user-mgmt', name: '用户管理', url: '/admin/user-management.html' },
          { id: 'user-hierarchy', name: '用户层级', url: '/admin/user-hierarchy.html' },
          { id: 'stores', name: '门店管理', url: '/admin/store-management.html' }
        ]
      },
      {
        id: 'system',
        name: '系统设置',
        icon: '⚙️',
        items: [
          { id: 'settings', name: '系统配置', url: '/admin/system-settings.html' },
          { id: 'content', name: '内容管理', url: '/admin/content-management.html' },
          { id: 'sessions', name: '会话管理', url: '/admin/sessions.html' },
          { id: 'item-tpl', name: '物品模板', url: '/admin/item-templates.html' },
          { id: 'config-tools', name: '配置工具', url: '/admin/config-tools.html' }
        ]
      },
      {
        id: 'analytics',
        name: '数据分析',
        icon: '📊',
        items: [
          { id: 'stats', name: '统计报表', url: '/admin/statistics.html' },
          { id: 'analytics', name: '运营分析', url: '/admin/analytics.html' }
        ]
      }
    ],
    
    /**
     * 初始化
     */
    init() {
      // 从 localStorage 恢复折叠状态
      const savedCollapsed = localStorage.getItem('sidebar_collapsed');
      if (savedCollapsed !== null) {
        this.collapsed = savedCollapsed === 'true';
      }
      
      // 从 localStorage 恢复展开的分组
      const savedGroups = localStorage.getItem('sidebar_expanded_groups');
      if (savedGroups) {
        try {
          this.expandedGroups = JSON.parse(savedGroups);
        } catch (e) {
          console.warn('恢复侧边栏分组状态失败', e);
        }
      }
      
      // 根据当前 URL 高亮对应菜单并展开分组
      this.highlightCurrentPage();
    },
    
    /**
     * 切换侧边栏折叠状态
     */
    toggleCollapse() {
      this.collapsed = !this.collapsed;
      localStorage.setItem('sidebar_collapsed', this.collapsed);
    },
    
    /**
     * 切换移动端菜单
     */
    toggleMobileMenu() {
      this.mobileOpen = !this.mobileOpen;
    },
    
    /**
     * 切换分组展开/折叠
     */
    toggleGroup(groupId) {
      const index = this.expandedGroups.indexOf(groupId);
      if (index > -1) {
        this.expandedGroups.splice(index, 1);
      } else {
        this.expandedGroups.push(groupId);
      }
      localStorage.setItem('sidebar_expanded_groups', JSON.stringify(this.expandedGroups));
    },
    
    /**
     * 判断分组是否展开
     */
    isGroupExpanded(groupId) {
      return this.expandedGroups.includes(groupId);
    },
    
    /**
     * 根据当前 URL 高亮菜单
     */
    highlightCurrentPage() {
      const currentPath = window.location.pathname + window.location.search;
      
      for (const group of this.navGroups) {
        if (group.type === 'single') {
          if (currentPath.includes(group.url.split('?')[0])) {
            // 单项菜单高亮
          }
        } else if (group.items) {
          for (const item of group.items) {
            if (currentPath.includes(item.url.split('?')[0])) {
              // 展开对应分组
              if (!this.expandedGroups.includes(group.id)) {
                this.expandedGroups.push(group.id);
              }
              break;
            }
          }
        }
      }
    },
    
    /**
     * 判断菜单项是否激活
     */
    isItemActive(url) {
      const currentPath = window.location.pathname + window.location.search;
      return currentPath.includes(url.split('?')[0]);
    },
    
    /**
     * 导航到指定页面（在 Tab 中打开）
     */
    navigateTo(url, itemId, itemName, icon) {
      // 通知 Tab 管理器打开新 Tab
      window.dispatchEvent(new CustomEvent('open-tab', {
        detail: { 
          url, 
          id: itemId,
          title: itemName,
          icon: icon || '📄'
        }
      }));
      
      // 移动端关闭菜单
      this.mobileOpen = false;
    }
  };
}
```

### 6.2 Tab 工作台管理器 `src/alpine/components/workspace-tabs.js`

```javascript
/**
 * Tab 工作台管理器
 * @description 管理多 Tab 页面的打开、切换、关闭
 */
export function workspaceTabs() {
  return {
    // Tab 列表
    tabs: [],
    // 当前激活的 Tab ID
    activeTabId: null,
    // 最大 Tab 数量
    maxTabs: 10,
    
    /**
     * 初始化
     */
    init() {
      // 恢复 Tab 状态
      this.loadState();
      
      // 监听侧边栏导航事件
      window.addEventListener('open-tab', (e) => {
        this.openTab(e.detail);
      });
      
      // 监听浏览器前进/后退
      window.addEventListener('popstate', () => {
        // 可选：根据 URL 切换 Tab
      });
      
      // 默认打开仪表盘
      if (this.tabs.length === 0) {
        this.openTab({
          id: 'dashboard',
          title: '工作台',
          icon: '📊',
          url: '/admin/dashboard.html'
        });
      }
    },
    
    /**
     * 打开新 Tab
     */
    openTab(config) {
      const { id, title, icon, url } = config;
      
      // 已存在则切换
      const existing = this.tabs.find(t => t.id === id);
      if (existing) {
        this.switchTab(id);
        return;
      }
      
      // 超出限制则关闭最早打开的
      if (this.tabs.length >= this.maxTabs) {
        // 不关闭仪表盘
        const oldestNonDashboard = this.tabs.find(t => t.id !== 'dashboard');
        if (oldestNonDashboard) {
          this.closeTab(oldestNonDashboard.id);
        } else {
          this.tabs.shift();
        }
      }
      
      // 添加新 Tab
      this.tabs.push({ 
        id, 
        title, 
        icon: icon || '📄', 
        url, 
        openTime: Date.now() 
      });
      
      this.activeTabId = id;
      this.saveState();
    },
    
    /**
     * 切换 Tab
     */
    switchTab(id) {
      if (!this.tabs.find(t => t.id === id)) return;
      this.activeTabId = id;
      this.saveState();
    },
    
    /**
     * 关闭 Tab
     */
    closeTab(id) {
      const index = this.tabs.findIndex(t => t.id === id);
      if (index === -1) return;
      
      this.tabs.splice(index, 1);
      
      // 关闭的是当前 Tab，切换到最后一个
      if (this.activeTabId === id) {
        this.activeTabId = this.tabs.length > 0 
          ? this.tabs[this.tabs.length - 1].id 
          : null;
      }
      
      this.saveState();
    },
    
    /**
     * 关闭其他 Tab
     */
    closeOtherTabs(keepId) {
      this.tabs = this.tabs.filter(t => t.id === keepId);
      this.activeTabId = keepId;
      this.saveState();
    },
    
    /**
     * 关闭所有 Tab
     */
    closeAllTabs() {
      this.tabs = [];
      this.activeTabId = null;
      this.saveState();
      
      // 重新打开仪表盘
      this.openTab({
        id: 'dashboard',
        title: '工作台',
        icon: '📊',
        url: '/admin/dashboard.html'
      });
    },
    
    /**
     * 判断是否为激活 Tab
     */
    isActiveTab(id) {
      return this.activeTabId === id;
    },
    
    /**
     * 获取当前激活的 Tab
     */
    getActiveTab() {
      return this.tabs.find(t => t.id === this.activeTabId);
    },
    
    /**
     * 刷新当前 Tab
     */
    refreshCurrentTab() {
      const activeTab = this.getActiveTab();
      if (activeTab) {
        // 通过改变 URL 触发 iframe 刷新
        const iframe = document.querySelector(`[data-tab-id="${activeTab.id}"] iframe`);
        if (iframe) {
          iframe.src = activeTab.url;
        }
      }
    },
    
    /**
     * 右键菜单处理
     */
    showContextMenu(tabId, event) {
      event.preventDefault();
      // 可扩展：显示右键菜单
    },
    
    /**
     * 保存状态到 localStorage
     */
    saveState() {
      localStorage.setItem('workspace_tabs', JSON.stringify({
        tabs: this.tabs,
        activeTabId: this.activeTabId
      }));
    },
    
    /**
     * 从 localStorage 加载状态
     */
    loadState() {
      try {
        const state = JSON.parse(localStorage.getItem('workspace_tabs'));
        if (state) {
          this.tabs = state.tabs || [];
          this.activeTabId = state.activeTabId;
        }
      } catch (e) {
        console.warn('加载 Tab 状态失败', e);
      }
    }
  };
}
```

### 6.3 组件注册 `src/alpine/index.js` 修改

```javascript
// 在现有的 initAlpine 函数中添加组件注册

import { sidebarNav } from './components/sidebar-nav.js'
import { workspaceTabs } from './components/workspace-tabs.js'

export function initAlpine() {
  // ... 现有代码 ...
  
  // 注册布局组件
  Alpine.data('sidebarNav', sidebarNav)
  Alpine.data('workspaceTabs', workspaceTabs)
  
  // ... 现有代码 ...
}
```

---

## 七、模板代码

### 7.1 新布局模板 `src/templates/layouts/workspace.ejs`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <%- include('../partials/head', { title: title || '管理后台', pageStyle: pageStyle || '' }) %>
</head>
<body class="bg-gray-100" x-cloak>
  
  <div class="admin-layout" 
       x-data="{ ...sidebarNav(), ...workspaceTabs() }" 
       x-init="$nextTick(() => { sidebarNav().init.call($data); workspaceTabs().init.call($data); })">
    
    <!-- 侧边栏 -->
    <%- include('../partials/sidebar') %>
    
    <!-- 移动端遮罩 -->
    <div 
      class="fixed inset-0 bg-black/50 z-[999] lg:hidden"
      x-show="mobileOpen"
      x-transition:enter="transition-opacity ease-out duration-300"
      x-transition:enter-start="opacity-0"
      x-transition:enter-end="opacity-100"
      x-transition:leave="transition-opacity ease-in duration-200"
      x-transition:leave-start="opacity-100"
      x-transition:leave-end="opacity-0"
      @click="mobileOpen = false"
      style="display: none;"
    ></div>
    
    <!-- 主内容区 -->
    <div class="admin-main">
      
      <!-- 顶部栏 -->
      <%- include('../partials/workspace-header') %>
      
      <!-- Tab 栏 -->
      <div class="workspace-tab-bar">
        <template x-for="tab in tabs" :key="tab.id">
          <div 
            class="workspace-tab"
            :class="{ 'active': isActiveTab(tab.id) }"
            @click="switchTab(tab.id)"
            @contextmenu="showContextMenu(tab.id, $event)"
          >
            <span class="tab-icon" x-text="tab.icon"></span>
            <span class="tab-title" x-text="tab.title"></span>
            <button 
              class="tab-close" 
              @click.stop="closeTab(tab.id)"
              x-show="tab.id !== 'dashboard'"
            >×</button>
          </div>
        </template>
        <div class="workspace-tab tab-add" title="打开新页面">+</div>
      </div>
      
      <!-- 内容区 -->
      <div class="workspace-content">
        <template x-for="tab in tabs" :key="tab.id">
          <div 
            class="tab-panel" 
            :class="{ 'active': isActiveTab(tab.id) }"
            :data-tab-id="tab.id"
          >
            <iframe :src="tab.url"></iframe>
          </div>
        </template>
      </div>
      
    </div>
  </div>

  <%- include('../partials/footer') %>
</body>
</html>
```

### 7.2 侧边栏模板 `src/templates/partials/sidebar.ejs`

```html
<!-- 侧边栏 -->
<aside 
  class="admin-sidebar" 
  :class="{ 'collapsed': collapsed, 'mobile-open': mobileOpen }"
>
  <!-- Logo 区域 -->
  <div class="sidebar-logo">
    <span class="logo-icon">🎰</span>
    <span class="logo-text">抽奖管理系统</span>
  </div>
  
  <!-- 导航菜单 -->
  <nav class="sidebar-nav scrollbar-thin">
    <template x-for="group in navGroups" :key="group.id">
      
      <!-- 单项菜单（如工作台） -->
      <template x-if="group.type === 'single'">
        <a 
          :href="group.url"
          class="nav-single"
          :class="{ 'active': isItemActive(group.url) }"
          @click.prevent="navigateTo(group.url, group.id, group.name, group.icon)"
        >
          <span class="nav-icon" x-text="group.icon"></span>
          <span class="nav-text" x-text="group.name"></span>
        </a>
      </template>
      
      <!-- 分组菜单 -->
      <template x-if="group.type !== 'single'">
        <div class="nav-group" :class="{ 'expanded': isGroupExpanded(group.id) }">
          <!-- 分组标题 -->
          <div class="nav-group-title" @click="toggleGroup(group.id)">
            <span class="nav-icon" x-text="group.icon"></span>
            <span class="nav-text" x-text="group.name"></span>
            <span class="toggle-icon">▾</span>
          </div>
          
          <!-- 分组内的菜单项 -->
          <div class="nav-group-items">
            <template x-for="item in group.items" :key="item.id">
              <a 
                :href="item.url"
                class="nav-item"
                :class="{ 'active': isItemActive(item.url) }"
                @click.prevent="navigateTo(item.url, item.id, item.name, group.icon)"
              >
                <span x-text="item.name"></span>
                <template x-if="item.badge">
                  <span class="ml-auto px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">3</span>
                </template>
              </a>
            </template>
          </div>
        </div>
      </template>
      
    </template>
  </nav>
  
  <!-- 侧边栏底部 -->
  <div class="sidebar-footer">
    <button class="collapse-btn" @click="toggleCollapse()">
      <span x-text="collapsed ? '展开 »' : '« 折叠'"></span>
    </button>
  </div>
</aside>
```

### 7.3 顶部栏模板 `src/templates/partials/workspace-header.ejs`

```html
<!-- 顶部栏 -->
<header class="workspace-header">
  <div class="header-left">
    <!-- 移动端菜单按钮 -->
    <button class="mobile-menu-btn" @click="toggleMobileMenu()">
      ☰
    </button>
    
    <!-- 面包屑导航 -->
    <nav class="breadcrumb-nav">
      <a href="/admin/dashboard.html" @click.prevent="navigateTo('/admin/dashboard.html', 'dashboard', '工作台', '📊')">首页</a>
      <span>/</span>
      <span x-text="getActiveTab()?.title || '工作台'"></span>
    </nav>
  </div>
  
  <div class="header-right">
    <!-- 全局搜索 -->
    <div class="global-search">
      <span class="global-search-icon">🔍</span>
      <input type="text" placeholder="搜索功能..." />
    </div>
    
    <!-- 刷新按钮 -->
    <button class="header-btn" @click="refreshCurrentTab()" title="刷新当前页面">
      🔄
    </button>
    
    <!-- 通知按钮 -->
    <button class="header-btn">
      🔔
      <span class="notification-dot"></span>
    </button>
    
    <!-- 用户信息 -->
    <div class="user-dropdown" x-data="{ user: JSON.parse(localStorage.getItem('admin_user') || '{}') }">
      <div class="user-avatar" x-text="(user.nickname || '管理员').charAt(0)"></div>
      <span class="user-name" x-text="user.nickname || '管理员'"></span>
    </div>
  </div>
</header>
```

---

## 八、页面改造方式

### ✅ 采用方案：方案C（页面重构）

> **决策说明**：选择方案C是因为需要实现**一键换主题**功能，而 iframe 方案存在 CSS 隔离问题，无法统一控制主题样式。

| 维度 | 方案A (iframe) | 方案B (内容提取) | **方案C (页面重构)** ✅ | 方案D (渐进式) |
|-----|---------------|-----------------|----------------------|---------------|
| **一键换主题** | ❌ 不支持 | ✅ 支持 | ✅ **完美支持** | ⚠️ 部分支持 |
| **业务代码改动** | 无 | 微量 | **微量** | 微量 |
| **实施周期** | 1-2天 | 3-5天 | **5-7天** | 持续 |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐⭐ | **⭐⭐⭐⭐⭐** | ⭐⭐⭐⭐ |
| **长期维护** | 复杂 | 中等 | **简单** | 复杂 |

---

### 🎯 方案C：页面重构（✅ 采用）

**核心原理**: 每个页面改用新的 EJS 布局模板，业务逻辑代码完全保留

```html
<!-- 原页面 -->
<!DOCTYPE html>
<html>
<head>...</head>
<body>
  <nav>...</nav>
  <div x-data="assetManagement()">
    <!-- 业务逻辑 -->
  </div>
</body>
</html>

<!-- 改造后 - 使用新布局模板 -->
<%- include('layouts/workspace', { title: '资产管理' }) %>
<% block('content') %>
  <div x-data="assetManagement()">
    <!-- 业务逻辑完全不变 -->
  </div>
<% endblock %>
```

**改动范围**：
- ✏️ 每个页面改用新的 EJS 布局模板
- ✅ 业务逻辑代码 **完全保留**
- ✅ CSS 变量统一控制，支持一键换主题

**方案C 核心优势**:

| 优势 | 说明 |
|-----|------|
| ✅ **一键换主题** | CSS 变量全局生效，无隔离问题 |
| ✅ 最优性能 | 无 iframe 开销 |
| ✅ 统一的布局管理 | 修改布局只需改模板 |
| ✅ 维护更方便 | 长期维护成本低 |
| ✅ Tab 切换不丢数据 | iframe 保留内存状态 |

**实施工作量**：
| 任务 | 数量 | 时间 |
|-----|------|------|
| 创建布局模板 | 3个 | 0.5天 |
| 改造页面模板 | 20+个 | 3-4天 |
| 测试验证 | 全部页面 | 1-2天 |
| **总计** | - | **5-7天** |

---

### 📋 其他方案简介（未采用）

<details>
<summary><b>方案A：iframe 嵌入</b>（❌ 未采用 - 不支持一键换主题）</summary>

**原理**: 通过 iframe 加载现有页面，零改动

**未采用原因**: iframe 存在 CSS 隔离，无法实现一键换主题

```
❌ 主页面切换主题 → iframe 内页面无法同步切换
```
</details>

<details>
<summary><b>方案B：内容提取</b>（❌ 未采用 - 维护成本较高）</summary>

**原理**: 移除每个页面的导航栏，保留内容区

**未采用原因**: 需要手动维护每个页面的导航移除，不如方案C统一管理
</details>

<details>
<summary><b>方案D：渐进式迁移</b>（❌ 未采用 - 混合方案复杂度高）</summary>

**原理**: 先 iframe 上线，再逐步改造

**未采用原因**: 混合管理增加复杂度，且 iframe 部分仍无法实现一键换主题
</details>

---

## 九、一键换主题功能

### ✅ 必须实现

一键换主题是本次改造的核心功能之一，允许用户在多种主题风格之间切换。

### 9.1 功能设计

| 功能 | 说明 |
|-----|------|
| **主题切换** | 亮色 / 暗色 / 自定义主题 |
| **切换方式** | 顶部栏按钮一键切换 |
| **状态持久化** | localStorage 保存用户偏好 |
| **全局生效** | 所有页面统一切换，无隔离问题 |

### 9.2 技术实现：CSS 变量方案

**核心原理**: 通过修改 `<html>` 标签的 `data-theme` 属性，切换 CSS 变量值

```css
/* src/styles/layout/themes.css */

/* 亮色主题（默认） */
:root,
[data-theme="light"] {
  /* 主色调 */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-primary-light: #dbeafe;
  
  /* 背景色 */
  --color-bg-base: #f8fafc;
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #1e293b;
  
  /* 文字色 */
  --color-text-primary: #1e293b;
  --color-text-secondary: #64748b;
  --color-text-inverse: #ffffff;
  
  /* 边框色 */
  --color-border: #e2e8f0;
  --color-border-light: #f1f5f9;
  
  /* 状态色 */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #06b6d4;
}

/* 暗色主题 */
[data-theme="dark"] {
  /* 主色调 */
  --color-primary: #60a5fa;
  --color-primary-hover: #3b82f6;
  --color-primary-light: #1e3a5f;
  
  /* 背景色 */
  --color-bg-base: #0f172a;
  --color-bg-card: #1e293b;
  --color-bg-sidebar: #0f172a;
  
  /* 文字色 */
  --color-text-primary: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-text-inverse: #0f172a;
  
  /* 边框色 */
  --color-border: #334155;
  --color-border-light: #1e293b;
}

/* 蓝紫主题 */
[data-theme="purple"] {
  --color-primary: #8b5cf6;
  --color-primary-hover: #7c3aed;
  --color-primary-light: #ede9fe;
  --color-bg-base: #faf5ff;
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #4c1d95;
}

/* 绿色主题 */
[data-theme="green"] {
  --color-primary: #10b981;
  --color-primary-hover: #059669;
  --color-primary-light: #d1fae5;
  --color-bg-base: #ecfdf5;
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #065f46;
}
```

### 9.3 Alpine.js 主题切换组件

```javascript
// src/alpine/components/theme-switcher.js

/**
 * 主题切换组件
 */
function themeSwitcher() {
  return {
    // 可用主题列表
    themes: [
      { id: 'light', name: '亮色', icon: '☀️' },
      { id: 'dark', name: '暗色', icon: '🌙' },
      { id: 'purple', name: '紫色', icon: '💜' },
      { id: 'green', name: '绿色', icon: '💚' }
    ],
    
    // 当前主题
    currentTheme: 'light',
    
    // 下拉菜单是否打开
    isOpen: false,
    
    // 初始化
    init() {
      // 从 localStorage 读取保存的主题
      const savedTheme = localStorage.getItem('admin_theme');
      if (savedTheme && this.themes.find(t => t.id === savedTheme)) {
        this.currentTheme = savedTheme;
      }
      // 应用主题
      this.applyTheme(this.currentTheme);
    },
    
    // 切换主题
    setTheme(themeId) {
      this.currentTheme = themeId;
      this.applyTheme(themeId);
      // 保存到 localStorage
      localStorage.setItem('admin_theme', themeId);
      this.isOpen = false;
      console.log(`🎨 主题已切换: ${themeId}`);
    },
    
    // 应用主题到 DOM
    applyTheme(themeId) {
      document.documentElement.setAttribute('data-theme', themeId);
      
      // 同步到所有 iframe（如果有的话）
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          iframe.contentDocument?.documentElement?.setAttribute('data-theme', themeId);
        } catch (e) {
          // 跨域 iframe 忽略
        }
      });
    },
    
    // 获取当前主题信息
    getCurrentThemeInfo() {
      return this.themes.find(t => t.id === this.currentTheme) || this.themes[0];
    },
    
    // 快速切换（亮色/暗色切换）
    toggleDarkMode() {
      const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(newTheme);
    }
  };
}

// 注册组件
document.addEventListener('alpine:init', () => {
  Alpine.data('themeSwitcher', themeSwitcher);
});
```

### 9.4 顶部栏主题切换按钮

```html
<!-- 在 workspace-header.ejs 中添加主题切换按钮 -->
<div x-data="themeSwitcher()" class="theme-switcher">
  <!-- 主题切换按钮 -->
  <button 
    @click="isOpen = !isOpen"
    class="theme-btn"
    :title="'当前主题: ' + getCurrentThemeInfo().name"
  >
    <span x-text="getCurrentThemeInfo().icon">☀️</span>
  </button>
  
  <!-- 主题下拉菜单 -->
  <div 
    x-show="isOpen" 
    @click.away="isOpen = false"
    x-transition
    class="theme-dropdown"
  >
    <div class="theme-dropdown-title">选择主题</div>
    <template x-for="theme in themes" :key="theme.id">
      <button 
        @click="setTheme(theme.id)"
        class="theme-option"
        :class="{ 'active': currentTheme === theme.id }"
      >
        <span x-text="theme.icon"></span>
        <span x-text="theme.name"></span>
        <span x-show="currentTheme === theme.id" class="check">✓</span>
      </button>
    </template>
  </div>
</div>
```

### 9.5 主题切换样式

```css
/* src/styles/layout/theme-switcher.css */

.theme-switcher {
  position: relative;
}

.theme-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
}

.theme-btn:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.theme-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  min-width: 160px;
  padding: 8px;
  z-index: 1000;
}

.theme-dropdown-title {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.15s;
}

.theme-option:hover {
  background: var(--color-primary-light);
}

.theme-option.active {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.theme-option .check {
  margin-left: auto;
  font-weight: bold;
}
```

### 9.6 使用 CSS 变量的页面样式

```css
/* 所有页面样式改为使用 CSS 变量 */

/* 示例：卡片样式 */
.card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text-primary);
}

/* 示例：按钮样式 */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

/* 示例：表格样式 */
.table {
  background: var(--color-bg-card);
}

.table th {
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
}

.table td {
  border-color: var(--color-border);
  color: var(--color-text-primary);
}
```

### 9.7 用户体验效果

```
用户操作流程：
┌─────────────────────────────────────────────────┐
│  顶部栏                              [☀️ 主题]  │
│                                                 │
│  点击主题按钮 ↓                                  │
│  ┌─────────────┐                               │
│  │ 选择主题     │                               │
│  │ ☀️ 亮色  ✓  │ ← 当前选中                     │
│  │ 🌙 暗色     │                               │
│  │ 💜 紫色     │                               │
│  │ 💚 绿色     │                               │
│  └─────────────┘                               │
│                                                 │
│  选择"暗色"后 → 整个页面立即切换为暗色主题        │
│  刷新页面后 → 主题保持不变（localStorage 记忆）   │
└─────────────────────────────────────────────────┘
```

### 9.8 功能复杂度评估

| 模块 | 代码量 | 复杂度 |
|-----|--------|--------|
| CSS 变量定义 | ~80行 | ⭐ |
| Alpine 组件 | ~50行 | ⭐ |
| 切换按钮模板 | ~25行 | ⭐ |
| 按钮样式 | ~50行 | ⭐ |
| **总计** | ~200行 | **简单** |

---

## 十、草稿自动保存功能

### ✅ 必须实现

草稿自动保存功能防止用户在编辑表单时因意外操作（关闭 Tab、刷新页面、关闭浏览器）导致数据丢失。

### 10.1 问题场景

| 操作 | 数据是否丢失 |
|-----|-------------|
| 切换 Tab | ✅ 不丢失（iframe 保留） |
| **关闭 Tab（点×）** | ❌ **会丢失** → 草稿保存解决 |
| **刷新整个页面（F5）** | ❌ **会丢失** → 草稿保存解决 |
| **关闭浏览器** | ❌ **会丢失** → 草稿保存解决 |

### 10.2 解决方案

通过 `localStorage` 自动保存表单数据：

- ✅ 输入时自动保存（防抖 500ms）
- ✅ 重新打开页面自动恢复草稿
- ✅ 提交成功后自动清除草稿
- ✅ 草稿过期自动清理（24小时）

### 10.3 核心代码（约 30 行）

```javascript
/**
 * 表单草稿自动保存 Mixin
 * @description 为任何编辑表单添加草稿自动保存功能
 */
function withDraftAutoSave(componentName) {
  return {
    formData: {},
    recordId: null,
    draftKey: `draft_${componentName}`,
    
    // 初始化时恢复草稿
    initDraft() {
      const draft = localStorage.getItem(this.draftKey);
      if (draft) {
        try {
          const saved = JSON.parse(draft);
          const savedTime = new Date(saved.savedAt);
          const hours = (new Date() - savedTime) / 1000 / 60 / 60;
          
          // 24小时过期
          if (hours > 24) {
            localStorage.removeItem(this.draftKey);
            console.log('📝 草稿已过期，已清除');
            return;
          }
          
          // 恢复草稿
          if (saved.recordId === this.recordId) {
            this.formData = saved.formData;
            console.log(`📝 恢复草稿（${Math.round(hours)}小时前保存）`);
          }
        } catch (e) {
          console.warn('草稿恢复失败', e);
        }
      }
    },
    
    // 保存草稿
    saveDraft() {
      localStorage.setItem(this.draftKey, JSON.stringify({
        recordId: this.recordId,
        formData: this.formData,
        savedAt: new Date().toISOString()
      }));
    },
    
    // 清除草稿
    clearDraft() {
      localStorage.removeItem(this.draftKey);
    },
    
    // 检查是否有草稿
    hasDraft() {
      return localStorage.getItem(this.draftKey) !== null;
    }
  };
}
```

### 10.4 在编辑组件中使用

```javascript
// 消费记录编辑组件示例
function consumptionEdit() {
  return {
    // 混入草稿保存功能
    ...withDraftAutoSave('consumption_edit'),
    
    // 表单数据
    formData: {
      userName: '',
      amount: '',
      remark: ''
    },
    
    // 打开编辑弹窗
    openEdit(record) {
      this.recordId = record?.id || 'new';
      this.formData = record ? { ...record } : { userName: '', amount: '', remark: '' };
      this.initDraft();  // 恢复草稿
      this.showModal = true;
    },
    
    // 提交表单
    async submit() {
      try {
        await api.saveConsumption(this.formData);
        this.clearDraft();  // ✅ 提交成功，清除草稿
        this.showModal = false;
        this.$dispatch('refresh');
      } catch (error) {
        alert('保存失败: ' + error.message);
      }
    },
    
    // 取消编辑
    cancel() {
      if (this.hasDraft()) {
        if (!confirm('是否保留草稿？下次打开时可恢复。')) {
          this.clearDraft();
        }
      }
      this.showModal = false;
    }
  };
}
```

### 10.5 模板中绑定自动保存

```html
<div x-data="consumptionEdit()">
  <!-- 输入框：输入后 500ms 自动保存草稿 -->
  <input 
    x-model="formData.userName" 
    @input.debounce.500ms="saveDraft()"
    placeholder="用户名"
  />
  
  <input 
    x-model="formData.amount" 
    @input.debounce.500ms="saveDraft()"
    placeholder="金额"
  />
  
  <textarea 
    x-model="formData.remark" 
    @input.debounce.500ms="saveDraft()"
    placeholder="备注"
  ></textarea>
  
  <button @click="submit()">提交</button>
  <button @click="cancel()">取消</button>
</div>
```

### 10.6 用户体验效果

```
场景1：填写表单 → 关闭 Tab → 重新打开
┌────────────────────────────────────────┐
│  📝 检测到上次未保存的草稿，已自动恢复  │
│                                        │
│  姓名：张三 ✅                          │
│  金额：100  ✅                          │
└────────────────────────────────────────┘

场景2：填写表单 → 刷新页面 → 自动恢复
┌────────────────────────────────────────┐
│  表单数据自动恢复，用户无感知           │
└────────────────────────────────────────┘

场景3：提交成功 → 草稿自动清除
┌────────────────────────────────────────┐
│  ✅ 保存成功                           │
│  📝 草稿已清除                         │
└────────────────────────────────────────┘
```

### 10.7 功能复杂度评估

| 功能 | 代码量 | 复杂度 |
|-----|--------|--------|
| 核心 Mixin | ~30行 | ⭐ |
| 组件集成 | ~15行/组件 | ⭐ |
| 模板绑定 | ~5行/表单 | ⭐ |
| **总计** | ~50行 | **很简单** |

---

## 十一、实施步骤

### 阶段一：基础框架搭建（1-2天）

| 步骤 | 任务 | 产出物 |
|-----|------|-------|
| 1.1 | 创建布局样式文件 | `variables.css`, `sidebar.css`, `workspace-tabs.css`, `themes.css` |
| 1.2 | 创建 Alpine 组件 | `sidebar-nav.js`, `workspace-tabs.js`, `theme-switcher.js` |
| 1.3 | 创建草稿保存 Mixin | `draft-auto-save.js` |
| 1.4 | 修改样式入口文件 | `index.css` 引入新样式 |
| 1.5 | 注册 Alpine 组件 | `alpine/index.js` 添加注册 |

**验收标准**:
- [ ] 样式文件可正常加载
- [ ] Alpine 组件可正常初始化
- [ ] 主题切换功能可用
- [ ] 草稿保存 Mixin 可用

### 阶段二：模板和入口页面（1天）

| 步骤 | 任务 | 产出物 |
|-----|------|-------|
| 2.1 | 创建侧边栏模板 | `partials/sidebar.ejs` |
| 2.2 | 创建顶部栏模板（含主题切换按钮） | `partials/workspace-header.ejs` |
| 2.3 | 创建布局模板 | `layouts/workspace.ejs` |
| 2.4 | 创建入口页面 | `workspace.html` |

**验收标准**:
- [ ] 访问 `/admin/workspace.html` 可看到新布局
- [ ] 侧边栏可折叠/展开
- [ ] Tab 可打开/关闭/切换
- [ ] 一键换主题功能可用

### 阶段三：页面改造（3-4天）

| 步骤 | 任务 | 说明 |
|-----|------|------|
| 3.1 | 改造高频页面 | 仪表盘、消费审核、活动管理 |
| 3.2 | 改造中频页面 | 资产管理、用户管理、商品管理 |
| 3.3 | 改造低频页面 | 系统设置、日志等 |
| 3.4 | 集成草稿保存 | 为所有编辑表单添加草稿保存功能 |

**验收标准**:
- [ ] 所有页面使用新布局模板
- [ ] 一键换主题在所有页面生效
- [ ] 编辑表单支持草稿自动保存

### 阶段四：功能验证（1-2天）

| 步骤 | 任务 | 说明 |
|-----|------|------|
| 4.1 | 测试业务功能 | 验证所有页面业务逻辑正常 |
| 4.2 | 测试主题切换 | 验证所有页面主题一致切换 |
| 4.3 | 测试草稿保存 | 验证草稿保存/恢复/清除功能 |
| 4.4 | 测试响应式 | 移动端侧边栏正常工作 |

**验收标准**:
- [ ] 业务功能无异常
- [ ] 主题切换正常
- [ ] 草稿保存正常
- [ ] 移动端适配正常

### 阶段五：上线切换（0.5天）

| 步骤 | 任务 | 说明 |
|-----|------|------|
| 5.1 | 配置入口跳转 | `/admin/` 跳转到 `/admin/workspace.html` |
| 5.2 | 保留旧入口 | 旧页面仍可直接访问（降级方案） |
| 5.3 | 用户通知 | 告知运营人员新布局上线 |

---

## 十二、业务逻辑保证

### 不修改项清单

| 类别 | 具体内容 | 保证说明 |
|-----|---------|---------|
| **Alpine 组件** | 各页面的 `x-data` 函数 | 完全保留，不做任何修改 |
| **API 调用** | 所有 API 请求逻辑 | 保持原样，不修改请求/响应处理 |
| **数据绑定** | `x-model`、`x-text`、`x-for` 等 | 不修改任何数据绑定 |
| **表单逻辑** | 表单验证、提交处理 | 完全保留（仅增加草稿保存 Mixin） |
| **Modal 弹窗** | 所有 Modal 组件 | 保持原样 |
| **样式类名** | 现有 Tailwind 类 | 新增 CSS 变量，不覆盖现有类 |

### 验证方法

```javascript
// 业务逻辑验证脚本
function verifyBusinessLogic() {
  const testCases = [
    { page: 'asset-management.html', action: '查看资产类型列表' },
    { page: 'asset-management.html', action: '新增资产类型' },
    { page: 'lottery-management.html', action: '查看活动列表' },
    { page: 'user-management.html', action: '搜索用户' },
    // ... 更多测试用例
  ];
  
  testCases.forEach(tc => {
    console.log(`验证: ${tc.page} - ${tc.action}`);
    // 手动验证或自动化测试
  });
}
```

---

## 附录：快速开始命令

```bash
# 1. 创建目录结构
mkdir -p src/styles/layout
mkdir -p src/alpine/components
mkdir -p src/alpine/mixins
mkdir -p src/templates/layouts

# 2. 创建样式文件
touch src/styles/layout/variables.css
touch src/styles/layout/sidebar.css
touch src/styles/layout/workspace-tabs.css
touch src/styles/layout/themes.css           # 主题样式
touch src/styles/layout/theme-switcher.css   # 主题切换按钮样式

# 3. 创建组件文件
touch src/alpine/components/sidebar-nav.js
touch src/alpine/components/workspace-tabs.js
touch src/alpine/components/theme-switcher.js  # 主题切换组件

# 4. 创建 Mixin 文件
touch src/alpine/mixins/draft-auto-save.js     # 草稿自动保存

# 5. 创建模板文件
touch src/templates/layouts/workspace.ejs
touch src/templates/partials/sidebar.ejs
touch src/templates/partials/workspace-header.ejs

# 6. 创建入口页面
touch workspace.html
```

---

## 附录：功能实现清单

| 功能 | 状态 | 文件 | 代码量 |
|-----|------|------|--------|
| **侧边栏导航** | ✅ 必须实现 | `sidebar-nav.js`, `sidebar.css` | ~150行 |
| **Tab 工作台** | ✅ 必须实现 | `workspace-tabs.js`, `workspace-tabs.css` | ~200行 |
| **一键换主题** | ✅ 必须实现 | `theme-switcher.js`, `themes.css` | ~200行 |
| **草稿自动保存** | ✅ 必须实现 | `draft-auto-save.js` | ~50行 |
| **总计** | - | - | **~600行** |

---

*文档创建日期: 2026-01-24*  
*文档更新日期: 2026-01-24*  
*采用方案: 方案C（页面重构）*  
*适用项目: /home/devbox/project/admin*

