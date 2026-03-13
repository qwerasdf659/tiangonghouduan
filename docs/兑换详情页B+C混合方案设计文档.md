# 兑换商品详情页 — B+C 混合方案设计文档

> **文档版本**: 1.0.0
> **创建日期**: 2026-03-13
> **适用范围**: packageExchange 兑换商城详情页
> **设计理念**: 白底密排信息骨架 + 游戏化视觉外衣 + 所有可变内容由后端控制展示与否

---

## 一、方案定位

| 维度 | 纯B（淘宝电商） | 纯C（游戏商城） | **B+C 混合（本方案）** |
|---|---|---|---|
| 信息深度 | 极深（5-8屏） | 轻量（1-2屏） | **适中（2-3屏）** |
| 视觉风格 | 白底密排文字 | 稀有度氛围光效 | **白底密排 + 稀有度光效** |
| 决策路径 | 研究型（看评价→比价→下单） | 冲动型（看图→感受→兑换） | **快速了解型（看图→了解→兑换）** |
| 后端复杂度 | 高（评价/推荐/优惠券系统） | 零改动 | **低（几个新字段，无新系统）** |
| 扩展性 | 强但过重 | 轻但受限 | **强且不过重** |

---

## 二、页面结构总览

```
┌──────────────────────────────────┐
│  ← 返回          商品详情         │  导航栏
├──────────────────────────────────┤
│                                  │
│  ┌──────────────────────────┐    │
│  │  稀有度渐变背景 + 光效脉冲  │    │  ① 图片区
│  │                          │    │  后端决定展示几张
│  │     [图1] [图2] [图3]     │    │  1张=大图展示
│  │       · · ·  指示器       │    │  多张=轮播(带稀有度边框光效)
│  └──────────────────────────┘    │
│                                  │
│  [🔥热门] [⏰限量] [🆕新品]      │  ② 标签区
│  也可能是简单文字标签              │  后端下发标签内容+样式类型
│                                  │
├──────────────────────────────────┤  白底信息密排区域开始 ↓
│                                  │
│  ★ 传说级 · 臻选空间             │  稀有度 + 来源空间
│  商品名称XXXXXXXXXXXXXXX         │  名称
│                                  │
│  💎 500  钻石   原价 800 省300   │  ③ 价格区：大号渐变数字主价格
│  ┌─────────────────────────┐    │
│  │ 🎫 满1000减200 | 🎫 新人9折 │    │  优惠券/满减行（有则显示）
│  │ 预计到手价: 💎 300        │    │  到手价（有则显示）
│  └─────────────────────────┘    │
│                                  │
│  ┌库存 992 ┐ ┌已售 8  ┐         │  ④ 属性区
│  ├分类 道具 ┤ ├品质 传说┤         │  后端决定展示为网格卡片
│  └🛡️保修   ┘ └📦包邮  ┘         │  或者文字列表
│  ▓▓▓▓▓▓▓▓▓░░ 库存剩余 99%       │
│                                  │
│  也可能是:                        │
│  库存: 992件  |  已售: 8件       │  ← 文字列表模式
│  分类: 道具   |  品质: 传说       │
│  🛡️ 含保修  |  📦 包邮          │
│                                  │
├──────────────────────────────────┤
│                                  │
│  ━━━ 商品介绍 ━━━━━━━━━━━━━━━   │  ⑤ 介绍区
│  ✨ 开箱必出稀有道具，欧皇必备     │  卖点高亮
│                                  │
│  (纯文字模式)                     │  后端决定展示模式
│  这是一段详细的商品描述文字...     │  description 有内容 → 纯文字
│                                  │
│  (长图模式)                       │  detail_images 有图 → 长图
│  ┌────────────────────────┐     │  支持混排：文字段落 + 图片
│  │    商品详情长图1          │     │
│  └────────────────────────┘     │
│  一段文字说明...                  │
│  ┌────────────────────────┐     │
│  │    商品详情长图2          │     │
│  └────────────────────────┘     │
│                                  │
├──────────────────────────────────┤
│                                  │
│  ━━━ 商品展示 ━━━━━━━━━━━━━━━   │  ⑥ 展示图区
│  后端决定展示几张                  │  0张=不显示此区块
│  [效果图1] [效果图2]              │  1张=单图
│  [效果图3] [效果图4]              │  多张=2列网格或横向滚动
│                                  │
├──────────────────────────────────┤
│                                  │
│  ━━━ 使用说明 ━━━━━━━━━━━━━━━   │  ⑦ 兑换规则区
│  1. 兑换后物品自动进入背包         │  后端下发或前端通用规则
│  2. 每人每日限兑2次               │
│  3. 虚拟物品一经兑换不可退还       │
│                                  │
├──────────────────────────────────┤
│                                  │
│  ━━━ 相关推荐 ━━━━━━━━━━━━━━━   │  ⑧ 同分类商品
│  [商品卡片1] [商品卡片2]          │  SQL: WHERE category=? LIMIT 4
│  [商品卡片3] [商品卡片4]          │  点击可跳转到对应详情页
│                                  │
├──────────────────────────────────┤
│                                  │
│  #热销 #每周更新 #必出稀有         │  ⑨ 标签云
│                                  │
├──────────────────────────────────┤
│  [💬客服] [🛒购物车]  [立即兑换]  │  ⑩ 吸底操作栏
│  红水晶 898                      │  余额 + 客服 + 购物车 + 兑换
└──────────────────────────────────┘
```

---

## 三、十大区块详细说明

### ① 图片区

| 项目 | 说明 |
|---|---|
| 数据来源 | 后端 `images` 数组 |
| 1张图 | 全屏大图展示，无轮播指示器 |
| 2张以上 | 轮播滑动，底部圆点指示器 |
| 稀有度背景 | 所有模式都叠加稀有度渐变背景 |
| 光效动画 | epic/legendary 叠加脉冲光效动画 |
| 稀有度角标 | 固定在右上角 |
| 后端不传时 | 用 `primary_image_id` 展示1张，无图则显示 emoji 占位 |

**稀有度背景色映射：**

| rarity_code | 背景渐变 | 光效 |
|---|---|---|
| common | 灰色 #e8eaf6 → #f5f5f5 | 无 |
| uncommon | 绿色 #e8f5e9 → #c8e6c9 | 无 |
| rare | 蓝色 #e3f2fd → #bbdefb | 无 |
| epic | 紫色 #f3e5f5 → #e1bee7 | 紫色脉冲光效 |
| legendary | 金色 #fff3e0 → #ffe0b2 | 金色脉冲光效 |

### ② 标签区

| 项目 | 说明 |
|---|---|
| 数据来源 | 后端下发标签数组，每个标签含 `text` + `style_type` |
| `style_type: 'game'` | 游戏风彩色圆角标签（带 emoji 图标、彩色背景） |
| `style_type: 'plain'` | 简单文字标签（灰底黑字） |
| 后端不传时 | 根据 `is_hot` / `is_new` / `is_limited` / `has_warranty` / `free_shipping` 自动生成，默认 game 风格 |

### ③ 价格区

| 项目 | 说明 |
|---|---|
| 主价格 | 始终用大号渐变数字（56rpx，橙色渐变），视觉锚点 |
| 划线原价 | `original_price` 有值且大于 `cost_amount` → 显示划线原价 + "省XX" 标签 |
| 优惠券行 | `coupons` 数组有值 → 显示可领取优惠券（可选功能） |
| 满减/活动行 | `promotions` 数组有值 → 显示满减信息（可选功能） |
| 到手价 | `estimated_price` 有值 → 显示 "预计到手价"（可选功能） |
| 附加行策略 | **有则显示、无则不占空间**，页面不会空洞 |

### ④ 属性区

| 项目 | 说明 |
|---|---|
| 展示模式 | 后端通过 `attr_display_mode` 字段控制 |
| `'grid'` | 网格卡片模式：2列，居中对齐，灰底圆角卡片 |
| `'list'` | 文字列表模式：左标签右值，分隔线分行 |
| 默认模式 | 后端不传时默认 `'grid'` |
| 库存进度条 | 始终显示（stock > 0 且 sold_count > 0 时） |

**属性区包含的字段：**

- 库存（stock）
- 已售（sold_count）
- 分类（category）
- 品质（rarity_code → 中文名 + 对应颜色）
- 保修标识（has_warranty）
- 包邮标识（free_shipping）

### ⑤ 商品介绍区

| 项目 | 说明 |
|---|---|
| 卖点高亮 | `sell_point` 始终在介绍区顶部高亮展示（金底卡片） |
| 纯文字模式 | 只有 `description` 文字 → 纯文字段落渲染 |
| 长图模式 | 只有 `detail_images` 图片数组 → 图片竖向铺满 |
| 混排模式 | 两者都有 → 文字段落 + 图片交替排列 |
| 后端不传时 | 仅 `sell_point` 有值则只显示卖点，全无则隐藏整个区块 |

### ⑥ 商品展示图区

| 项目 | 说明 |
|---|---|
| 数据来源 | 后端 `showcase_images` 数组 |
| 0张 | 整个区块不渲染 |
| 1张 | 单图展示 |
| 2-4张 | 2列网格 |
| 5张以上 | 横向可滚动（左右滑动浏览） |
| 点击行为 | `wx.previewImage` 预览大图 |

### ⑦ 使用说明区

| 项目 | 说明 |
|---|---|
| 数据来源 | 后端 `usage_rules` 字符串数组 |
| 后端有值 | 按数组顺序渲染编号列表 |
| 后端不传 | 前端显示通用规则（兑换后进背包、虚拟物品不退换等） |

### ⑧ 相关推荐区

| 项目 | 说明 |
|---|---|
| 数据来源 | `SELECT * FROM exchange_items WHERE category = ? AND exchange_item_id != ? AND status = 'active' ORDER BY sort_order LIMIT 4` |
| 展示方式 | 2列商品卡片网格（复用列表页的卡片组件） |
| 点击行为 | 跳转到对应商品的详情页 |
| 无推荐结果 | 整个区块不渲染 |

### ⑨ 标签云

| 项目 | 说明 |
|---|---|
| 数据来源 | 后端 `tags` 字符串数组 |
| 展示方式 | 水平流式排列，灰底圆角标签，前缀 # |
| 无标签时 | 整个区块不渲染 |

### ⑩ 吸底操作栏

| 项目 | 说明 |
|---|---|
| 位置 | 固定吸底，iOS 安全区域适配 |
| 左侧 | 当前资产余额（资产名 + 数值） |
| 客服按钮 | `<button open-type="contact">` 拉起微信客服 |
| 购物车按钮 | 跳转购物车页面（后续建设购物车功能时启用，暂可隐藏） |
| 兑换按钮 | 主操作（渐变色、大圆角、阴影），点击弹出兑换确认弹窗 |
| 售罄状态 | 按钮变灰，文案 "已售罄" |
| 余额不足 | 按钮变灰，文案 "余额不足" |

---

## 四、后端数据结构

### 现有字段（无需改动）

| 字段 | 类型 | 说明 |
|---|---|---|
| `exchange_item_id` | int | 主键 |
| `name` | string | 商品名称 |
| `description` | string | 文字描述 |
| `sell_point` | string | 卖点一句话 |
| `cost_amount` | number | 价格数值 |
| `cost_asset_code` | string | 资产类型（DIAMOND / red_shard / POINTS 等） |
| `original_price` | number / null | 原价（有则显示划线价） |
| `stock` | number | 当前库存 |
| `sold_count` | number | 累计已售 |
| `category` | string | 分类 |
| `space` | string | 来源空间 lucky / premium |
| `status` | string | 状态 active / inactive |
| `rarity_code` | string | 稀有度 common / uncommon / rare / epic / legendary |
| `is_hot` | boolean | 热门标记 |
| `is_new` | boolean | 新品标记 |
| `is_limited` | boolean | 限量标记 |
| `has_warranty` | boolean | 含保修 |
| `free_shipping` | boolean | 包邮 |
| `tags` | string[] | 标签数组 |
| `primary_image_id` | int / null | 主图 ID |

### 新增字段

| 字段 | 类型 | 说明 | 必需 |
|---|---|---|---|
| `images` | object[] | 多图数组（主图 + 附图），每项含 `url` / `thumbnail_url` | 推荐 |
| `detail_images` | object[] | 介绍区长图数组，每项含 `url` / `sort_order` / `caption`(可选) | 可选 |
| `showcase_images` | object[] | 展示图数组，每项含 `url` / `thumbnail_url` | 可选 |
| `usage_rules` | string[] | 使用说明条目数组 | 可选 |
| `attr_display_mode` | string | 属性展示模式 `'grid'` / `'list'` | 可选，默认 grid |
| `tag_style_type` | string | 标签样式类型 `'game'` / `'plain'` | 可选，默认 game |
| `coupons` | object[] | 可用优惠券，每项含 `text` / `discount` | 可选 |
| `promotions` | object[] | 满减/活动信息，每项含 `text` | 可选 |
| `estimated_price` | number / null | 预计到手价 | 可选 |

### 新增字段分级

- **第一优先级**（详情页基础体验）：`images`、`usage_rules`、`detail_images`
- **第二优先级**（展示增强）：`showcase_images`、`attr_display_mode`、`tag_style_type`
- **第三优先级**（营销能力，可后期追加）：`coupons`、`promotions`、`estimated_price`

---

## 五、所有 "后端决定" 的控制点汇总

| 前端行为 | 后端控制字段 | 后端不传时的默认处理 |
|---|---|---|
| 图片展示几张 | `images.length` | 用 `primary_image_id` 展示1张 |
| 标签是游戏风还是简单文字 | `tag_style_type` | 默认 `'game'`（游戏风） |
| 属性是网格还是列表 | `attr_display_mode` | 默认 `'grid'`（网格卡片） |
| 介绍是文字还是长图还是混排 | `description` + `detail_images` 是否有值 | 有啥展示啥，全无则隐藏 |
| 展示图展示几张 | `showcase_images.length` | 0张 = 不显示此区块 |
| 优惠券/满减行是否显示 | `coupons` / `promotions` 是否有值 | 无 = 不显示 |
| 到手价是否显示 | `estimated_price` 是否有值 | 无 = 不显示 |
| 使用说明内容 | `usage_rules` | 无 = 前端显示通用规则 |
| 相关推荐 | 同分类查询结果 | 无结果 = 不显示此区块 |

---

## 六、后端 API 接口

### 商品详情（已有，需扩展返回字段）

```
GET /api/v4/backpack/exchange/items/:exchange_item_id
```

响应示例（扩展后）：

```json
{
  "success": true,
  "data": {
    "exchange_item_id": 196,
    "name": "幸运宝箱·黄金版",
    "description": "打开后可随机获得1-3件稀有道具...",
    "sell_point": "开箱必出稀有道具，欧皇必备",
    "cost_asset_code": "red_shard",
    "cost_amount": 100,
    "original_price": 150,
    "stock": 992,
    "sold_count": 8,
    "category": "宝箱",
    "space": "lucky",
    "status": "active",
    "rarity_code": "rare",
    "is_hot": true,
    "is_new": false,
    "is_limited": false,
    "has_warranty": false,
    "free_shipping": true,
    "tags": ["热销", "每周更新", "必出稀有"],

    "images": [
      { "url": "https://xxx/img1.jpg", "thumbnail_url": "https://xxx/img1_thumb.jpg" },
      { "url": "https://xxx/img2.jpg", "thumbnail_url": "https://xxx/img2_thumb.jpg" }
    ],

    "detail_images": [
      { "url": "https://xxx/detail1.jpg", "sort_order": 1, "caption": "宝箱外观" },
      { "url": "https://xxx/detail2.jpg", "sort_order": 2, "caption": "开箱动画" }
    ],

    "showcase_images": [
      { "url": "https://xxx/show1.jpg", "thumbnail_url": "https://xxx/show1_thumb.jpg" },
      { "url": "https://xxx/show2.jpg", "thumbnail_url": "https://xxx/show2_thumb.jpg" }
    ],

    "usage_rules": [
      "兑换后物品自动进入背包",
      "每人每日限兑2次",
      "虚拟物品一经兑换不可退还"
    ],

    "attr_display_mode": "grid",
    "tag_style_type": "game",

    "coupons": [],
    "promotions": [],
    "estimated_price": null
  }
}
```

### 相关推荐（新增或复用列表接口）

```
GET /api/v4/backpack/exchange/items?category=宝箱&exclude_id=196&limit=4&status=active
```

复用现有的 `getExchangeProducts` 接口即可，增加 `exclude_id` 参数排除当前商品。

---

## 七、前端实现路径

### 第一阶段：模拟数据验证 UI（当前已完成）

- [x] 创建 `packageExchange/exchange-detail/` 页面
- [x] 注册路由到 `app.json`
- [x] 修改 `exchange-shelf.ts` 点击跳转到详情页
- [x] 稀有度光效 + 标签系统 + 属性网格 + 吸底兑换栏
- [x] 模拟数据覆盖全部稀有度和资产类型

### 第二阶段：对接真实 API

- [ ] `_loadProductDetail` 替换为 `API.getExchangeItemDetail(itemId)`
- [ ] 余额数据从 Store / Page 壳获取
- [ ] 兑换逻辑替换为 `API.exchangeProduct(itemId, quantity)`
- [ ] 兑换成功后通知 Page 壳刷新积分

### 第三阶段：扩展区块

- [ ] 图片轮播（后端 `images` 多图）
- [ ] 商品介绍区：纯文字 / 长图 / 混排三种模式
- [ ] 商品展示图区
- [ ] 使用说明区
- [ ] 相关推荐区（同分类商品卡片）
- [ ] 属性区双模式切换（grid / list）
- [ ] 标签区双模式切换（game / plain）

### 第四阶段：营销能力（可选）

- [ ] 优惠券展示与领取
- [ ] 满减/活动信息展示
- [ ] 到手价计算
- [ ] 客服按钮接入
- [ ] 购物车功能

---

## 八、方案来源对比分析

本方案融合了以下行业实践的优势：

| 来源 | 取其精华 | 去其糟粕 |
|---|---|---|
| 淘宝/京东（方案B） | 白底信息密排、多图展示、优惠券体系、使用说明、相关推荐 | 评价系统、问答系统、店铺体系、购物车凑单、推荐算法 |
| 游戏内商城（方案C） | 稀有度渐变光效、游戏风标签、结构化属性网格、吸底操作栏、冲动型决策路径 | 信息过于简略、无法承载复杂营销 |
| 积分商城（招行/移动） | 兑换规则说明、余额展示、简洁兑换流程 | 视觉平淡、缺乏品质感 |
| 虚拟交易平台（5173/交易猫） | 价格参考、商品属性展示 | 担保交易流程（不适用于积分兑换） |
