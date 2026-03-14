# 兑换商品详情页 — B+C 混合方案设计文档

> **文档版本**: 3.2.0
> **创建日期**: 2026-03-13
> **后端审查日期**: 2026-03-14（基于真实数据库查询 + 代码走查修正）
> **后端+Web管理后台实施日期**: 2026-03-15（B1-B9 + W1-W6 全部完成，48个测试通过）
> **运行时验证日期**: 2026-03-15（API端到端验证 + ESLint/Prettier 0错误 + 46测试通过 + 健康检查全绿）
> **适用范围**: packageExchange 兑换商城详情页
> **设计理念**: 白底密排信息骨架 + 游戏化视觉外衣 + 所有可变内容由后端控制展示与否
> **权威来源**: 后端数据库项目（字段名、接口路径、响应格式以后端为准，前端适配后端）

---

## 一、方案定位

| 维度 | 纯B（淘宝电商） | 纯C（游戏商城） | **B+C 混合（本方案）** |
|---|---|---|---|
| 信息深度 | 极深（5-8屏） | 轻量（1-2屏） | **适中（2-3屏）** |
| 视觉风格 | 白底密排文字 | 稀有度氛围光效 | **白底密排 + 稀有度光效** |
| 决策路径 | 研究型（看评价→比价→下单） | 冲动型（看图→感受→兑换） | **快速了解型（看图→了解→兑换）** |
| 后端复杂度 | 高（评价/推荐系统） | 零改动 | **低（几个新字段，无新系统）** |
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
│  [💬客服]          [立即兑换]     │  ⑩ 吸底操作栏
│  红水晶 898                      │  余额 + 客服 + 兑换
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
| 数据来源 | 后端 `tags` JSON 数组 + `is_hot`/`is_new`/`is_limited` 布尔标记，样式类型从 `exchange_page_config` 全局配置获取 |
| `style_type: 'game'` | 游戏风彩色圆角标签（带 emoji 图标、彩色背景） |
| `style_type: 'plain'` | 简单文字标签（灰底黑字） |
| 后端不传 tags 时 | 前端根据 `is_hot` / `is_new` / `is_limited` / `has_warranty` / `free_shipping` 布尔字段自动生成标签，样式从页面配置读取 |

### ③ 价格区

| 项目 | 说明 |
|---|---|
| 主价格 | 始终用大号渐变数字（56rpx，橙色渐变），视觉锚点 |
| 划线原价 | `original_price` 有值且大于 `cost_amount` → 显示划线原价 + "省XX" 标签 |

### ④ 属性区

| 项目 | 说明 |
|---|---|
| 展示模式 | 通过 `exchange_page_config` 全局配置控制（非商品级字段） |
| `'grid'` | 网格卡片模式：2列，居中对齐，灰底圆角卡片 |
| `'list'` | 文字列表模式：左标签右值，分隔线分行 |
| 默认模式 | 页面配置不配时默认 `'grid'` |
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
| 数据来源 | 复用 `GET /api/v4/backpack/exchange/items?category=xxx&exclude_id=xxx&page_size=4`（后端 QueryService.getMarketItems 增加 exclude_id 参数） |
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
| 兑换按钮 | 主操作（渐变色、大圆角、阴影），点击弹出兑换确认弹窗 |
| 售罄状态 | 按钮变灰，文案 "已售罄" |
| 余额不足 | 按钮变灰，文案 "余额不足" |

---

## 四、后端数据结构（以后端数据库为准）

### 后端技术栈概况

| 项 | 实际值 |
|---|---|
| 框架 | Express.js |
| ORM | Sequelize 6.x（MySQL） |
| 数据库 | MySQL 8.x，时区 +08:00（北京时间） |
| 认证 | JWT Bearer Token（`authenticateToken` 中间件） |
| 缓存 | Redis（`BusinessCacheHelper`） |
| 事务 | `TransactionManager.execute()` |
| 图片存储 | `image_resources` 表 + 对象存储（S3 兼容），通过 `ImageUrlHelper` 生成公网 URL |
| API 版本 | `/api/v4`，统一响应格式 `{ success, code, message, data, timestamp, version, request_id }` |
| 服务管理 | `ServiceManager`（`req.app.locals.services.getService('xxx')`） |
| 数据脱敏 | `DataSanitizer`（黑名单过滤敏感字段，普通用户不返回 `cost_price`） |

### 数据库现状（2026-03-14 实际查询校正）

| 统计项 | 数值 |
|---|---|
| exchange_items 总量 | 6 条 |
| active 状态商品 | 6 条 |
| 有主图（primary_image_id）的商品 | 3 条（ID 78/79/80） |
| image_resources（exchange 类型） | 3 条（均为 category='products'，context_id 分别关联商品 196/234/235） |
| 所有商品 category | 全部为 NULL（尚未使用分类） |
| 所有商品 rarity_code | 全部为 common |
| rarity_defs 字典表 | 5 种（common/uncommon/rare/epic/legendary，全部启用） |
| **category_defs 字典表** | **9 条（6 条 is_enabled=1），已有完整 CRUD API** |
| 材料资产类型 | DIAMOND、red_shard、red_crystal 等 16 种（material_asset_types 表，字段为 `is_enabled` 而非 `status`） |
| system_configs 页面配置 | `exchange_page` 键已存在，含 tabs/spaces/card_display/shop_filters/ui 等完整配置 |

### exchange_items 表已有字段（数据库真实 schema）

| 后端字段名 | 数据库类型 | 说明 | 文档原写法 | 差异说明 |
|---|---|---|---|---|
| `exchange_item_id` | BIGINT PK | 主键 | `exchange_item_id` | 一致 |
| **`item_name`** | VARCHAR(200) | 商品名称 | ~~`name`~~ | **小程序须改用 `item_name`** |
| `description` | TEXT | 文字描述 | `description` | 一致 |
| `sell_point` | VARCHAR(200) | 营销卖点一句话 | `sell_point` | 一致 |
| `cost_amount` | BIGINT | 价格数值（材料数量） | `cost_amount` | 一致，注意 BIGINT |
| `cost_asset_code` | VARCHAR(50) | 资产类型（DIAMOND / red_shard） | `cost_asset_code` | 一致 |
| `original_price` | BIGINT / NULL | 原价（有则显示划线价） | `original_price` | 一致 |
| `stock` | INT | 当前库存 | `stock` | 一致 |
| `sold_count` | INT | 累计已售 | `sold_count` | 一致 |
| `category` | VARCHAR(50) / NULL | 分类（当前全部为 NULL） | `category` | 一致 |
| `space` | VARCHAR(20) | 空间归属 lucky/premium/both | `space` | 多一个 `both` 值 |
| `status` | ENUM('active','inactive') | 商品状态 | `status` | 一致 |
| `rarity_code` | VARCHAR(50) FK→rarity_defs | 稀有度代码 | `rarity_code` | 一致，可联查 display_name/color_hex |
| `is_hot` | TINYINT(1) | 热门标记 | `is_hot` | 一致 |
| `is_new` | TINYINT(1) | 新品标记 | `is_new` | 一致 |
| `is_limited` | TINYINT(1) | 限量标记 | `is_limited` | 一致 |
| `has_warranty` | TINYINT(1) | 含保修 | `has_warranty` | 一致 |
| `free_shipping` | TINYINT(1) | 包邮 | `free_shipping` | 一致 |
| `is_lucky` | TINYINT(1) | 是否幸运商品 | （文档未提及） | 后端额外存在 |
| `tags` | JSON | 标签数组 | `tags` | 一致 |
| `primary_image_id` | INT FK→image_resources | 主图 ID | `primary_image_id` | 一致 |
| `cost_price` | DECIMAL(10,2) | 实际成本（仅管理员可见） | （文档未提及） | DataSanitizer 对普通用户隐藏 |
| `sort_order` | INT | 排序序号 | （文档未提及） | 后端额外存在 |

### rarity_defs 字典表（稀有度定义，已有数据）

| rarity_code | display_name | color_hex | tier |
|---|---|---|---|
| common | 普通 | #9E9E9E | 1 |
| uncommon | 稀有 | #4CAF50 | 2 |
| rare | 精良 | #2196F3 | 3 |
| epic | 史诗 | #9C27B0 | 4 |
| legendary | 传说 | #FF9800 | 5 |

> 小程序可直接使用 `rarity_code` 联查 `rarity_defs` 获取 `display_name` 和 `color_hex`，无需前端硬编码。后端 `ExchangeItem` 模型已有 `belongsTo(RarityDef, { as: 'rarityDef' })` 关联（`models/ExchangeItem.js` 第 263 行），`getItemDetail()` 增加 include 即可返回。

### category_defs 字典表（分类定义，**已有**，2026-03-14 发现）

> **重大发现**：后端已有 `category_defs` 分类字典表 + `CategoryDef` 模型（`models/CategoryDef.js`）+ 完整 CRUD API（`/api/v4/console/dictionaries/categories`，含 GET/POST/PUT/DELETE），由 `DictionaryService` 提供服务。**无需新建 `exchange_categories` 表**。

| category_code | display_name | is_enabled | icon_url |
|---|---|---|---|
| home_life | 家居生活 | 1 | categories/...png |
| lifestyle | 生活日用 | 1 | categories/...png |
| food | 美食饮品 | 1 | categories/...png |
| collectible | 收藏品 | 1 | categories/...png |
| other | 其他 | 1 | categories/...png |
| electronics | 电子产品 | 0（禁用） | categories/...png |
| food_drink | 餐饮美食 | 0（禁用） | categories/...png |
| voucher | 优惠券 | 0（禁用） | categories/...png |
| gift_card | 礼品卡 | 0（禁用） | categories/...png |

**category_defs 表 schema：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `category_code` | VARCHAR(50) **PK** | 类目代码（字符串主键，snake_case 格式） |
| `display_name` | VARCHAR(100) | 显示名称 |
| `description` | VARCHAR(500) | 类目描述 |
| `icon_url` | VARCHAR(500) | 图标 URL（Sealos 对象存储 key） |
| `sort_order` | INT | 排序顺序 |
| `is_enabled` | TINYINT(1) | 是否启用 |

**已有 API 路由**（`routes/v4/console/dictionaries.js`）：

- `GET /api/v4/console/dictionaries/categories` — 分类列表（支持分页筛选）
- `GET /api/v4/console/dictionaries/categories/:code` — 单个分类详情
- `POST /api/v4/console/dictionaries/categories` — 创建分类
- `PUT /api/v4/console/dictionaries/categories/:code` — 更新分类
- `DELETE /api/v4/console/dictionaries/categories/:code` — 删除分类（软删除 is_enabled=false）
- `GET /api/v4/console/dictionaries/all` — 批量获取所有字典（含 categories/rarities/asset_groups）

**对接方案**：`exchange_items.category` 列类型为 VARCHAR(50)，与 `category_defs.category_code` 类型完全一致，直接添加外键约束即可，无需列类型变更。

### image_resources 表结构（已有，多图基础设施）

| 字段 | 类型 | 说明 |
|---|---|---|
| `image_resource_id` | INT PK | 图片资源主键 |
| `business_type` | ENUM | 业务类型：exchange |
| `category` | VARCHAR(50) | 资源分类：products / detail / showcase（可扩展） |
| `context_id` | INT | 上下文 ID（= exchange_item_id） |
| `file_path` | VARCHAR(500) | 对象存储 key（通过 ImageUrlHelper 转公网 URL） |
| `thumbnail_paths` | JSON | `{ small, medium, large }` 三种尺寸缩略图 |
| `sort_order` | INT | 同一 context_id 内排序（数字越小越靠前） |
| `status` | ENUM | active / archived / deleted |

> **关键发现**：后端 `image_resources` 表已具备完整的多图基础设施。通过 `context_id = exchange_item_id` + `category` 分类 + `sort_order` 排序，可以支持主图/详情图/展示图三种图片类型。当前数据库仅有 `category='products'` 的图片，需要扩展 `detail` 和 `showcase` 两个分类。

### 新增需求字段分析

| 文档需求字段 | 是否需要新建数据库列 | 实现方案 | 责任方 |
|---|---|---|---|
| `images`（多图数组） | **否** | 复用 `image_resources` 表，`WHERE business_type='exchange' AND context_id=? AND category='products'` | 后端增强 `getItemDetail()` |
| `detail_images`（介绍长图） | **否** | 复用 `image_resources` 表，`category='detail'` | 后端增强 + Web管理后台增加上传入口 |
| `showcase_images`（展示图） | **否** | 复用 `image_resources` 表，`category='showcase'` | 后端增强 + Web管理后台增加上传入口 |
| `usage_rules`（使用说明） | **是，新增 JSON 列** | `exchange_items` 表新增 `usage_rules JSON` 列 | 后端迁移 + Web管理后台增加编辑入口 |
| `attr_display_mode` | **否** | 通过 `exchange_page_config` 全局配置下发（已有配置系统） | Web管理后台配置 |
| `tag_style_type` | **否** | 通过 `exchange_page_config` 全局配置下发（已有配置系统） | Web管理后台配置 |

### 新增字段分级（确认版）

- **第一优先级**（详情页基础体验）：`images`（已有基础设施）、`usage_rules`（需新增列）、`detail_images`（已有基础设施）
- **第二优先级**（展示增强）：`showcase_images`（已有基础设施）、`attr_display_mode`（走页面配置）、`tag_style_type`（走页面配置）

---

## 五、所有 "后端决定" 的控制点汇总（以后端实际能力为准）

| 前端行为 | 后端控制来源 | 后端不传时的默认处理 | 当前状态（2026-03-15 运行时验证） |
|---|---|---|---|
| 图片展示几张 | `images` 数组（来自 image_resources 表 category='products'） | 用 `primary_image` 展示1张 | **✅ 已完成** getItemDetail 返回 images 数组（API验证通过） |
| 标签是游戏风还是简单文字 | `exchange_page_config.detail_page.tag_style_type` | 默认 `'game'`（游戏风） | **✅ 已完成** API 返回 detail_page.tag_style_type="game"（含默认值补充逻辑） |
| 属性是网格还是列表 | `exchange_page_config.detail_page.attr_display_mode` | 默认 `'grid'`（网格卡片） | **✅ 已完成** API 返回 detail_page.attr_display_mode="grid"（含默认值补充逻辑） |
| 介绍是文字还是长图还是混排 | `description` + `detail_images`（image_resources category='detail'） | 有啥展示啥，全无则隐藏 | **✅ 已完成** getItemDetail 返回 detail_images 数组（当前0张，待运营上传） |
| 展示图展示几张 | `showcase_images`（image_resources category='showcase'） | 0张 = 不显示此区块 | **✅ 已完成** getItemDetail 返回 showcase_images 数组（当前0张，待运营上传） |
| 使用说明内容 | `usage_rules` JSON 字段（exchange_items 表新增列） | 无 = 前端显示通用规则 | **✅ 已完成** 数据库列已迁移，API返回 usage_rules（当前null，待运营填写） |
| 相关推荐 | 复用 `getMarketItems` 接口 + `exclude_id` 参数 | 无结果 = 不显示此区块 | **✅ 已完成** exclude_id 过滤验证通过（6条→5条排除成功） |
| 稀有度中文名+颜色 | `rarity_defs` 字典表（已有完整数据） | 前端可本地映射兜底 | **✅ 已完成** API返回 rarity_def 联查对象（含 display_name/color_hex/tier） |
| 商品分类名称+图标 | `category_defs` 字典表（已有 9 条，6 条启用） | 显示 category 原始值 | **✅ 已完成** API返回 category_def 联查对象（当前null因category待填写） |

---

## 六、后端 API 接口（以后端实际路由和响应格式为准）

### 6.1 商品详情（已有路由，需增强 Service 层返回字段）

```
GET /api/v4/backpack/exchange/items/:exchange_item_id
Header: Authorization: Bearer {jwt_token}
```

**后端调用链**：`route → authenticateToken → QueryService.getItemDetail(itemId) → DataSanitizer.sanitizeExchangeMarketItem(item, dataLevel) → res.apiSuccess()`

**后端统一响应格式**（`res.apiSuccess` 自动包装，小程序须按此格式解析）：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取商品详情成功",
  "data": {
    "item": {
      "exchange_item_id": 196,
      "item_name": "幸运宝箱·黄金版",
      "description": "打开后可随机获得1-3件稀有道具...",
      "sell_point": "开箱必出稀有道具，欧皇必备",
      "cost_asset_code": "red_shard",
      "cost_amount": 100,
      "original_price": 150,
      "stock": 992,
      "sold_count": 8,
      "category": "collectible",
      "space": "lucky",
      "status": "active",
      "rarity_code": "rare",
      "is_hot": true,
      "is_new": false,
      "is_limited": false,
      "is_lucky": false,
      "has_warranty": false,
      "free_shipping": true,
      "tags": ["热销", "每周更新", "必出稀有"],
      "sort_order": 100,
      "primary_image_id": 78,
      "primary_image": {
        "image_resource_id": 78,
        "url": "https://xxx/products/xxx.jpg",
        "mime": "image/jpeg",
        "thumbnail_url": "https://xxx/products/thumbnails/small/xxx.jpg"
      },
      "rarity_def": {
        "rarity_code": "rare",
        "display_name": "精良",
        "color_hex": "#2196F3",
        "tier": 3
      },
      "category_def": {
        "category_code": "collectible",
        "display_name": "收藏品",
        "icon_url": "categories/xxx.png"
      },
      "images": [
        {
          "image_resource_id": 78,
          "imageUrl": "https://xxx/img1.jpg",
          "thumbnails": { "small": "https://xxx/small.jpg", "medium": "https://xxx/medium.jpg", "large": "https://xxx/large.jpg" },
          "sort_order": 0
        }
      ],
      "detail_images": [],
      "showcase_images": [],
      "usage_rules": null,
      "created_at": "2026-03-01T10:00:00.000+08:00",
      "updated_at": "2026-03-13T10:00:00.000+08:00"
    }
  },
  "timestamp": "2026-03-13T20:19:57.000+08:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

> **注意**：`data.item` 而非 `data` 直接包含字段。小程序解析时应为 `res.data.data.item`。

### 6.2 相关推荐（复用已有列表接口，后端增加 exclude_id 参数）

```
GET /api/v4/backpack/exchange/items?category=collectible&exclude_id=196&page_size=4&status=active
Header: Authorization: Bearer {jwt_token}
```

> 后端已有 `getMarketItems()` 支持 `category`（VARCHAR 值，对应 `category_defs.category_code`）、`status`、`page_size` 筛选，仅需增加 `exclude_id` 参数。注意 `category` 传的是字符串 code（如 `collectible`），不是数字 ID。

### 6.3 执行兑换（已有，无需改动）

```
POST /api/v4/backpack/exchange
Header: Authorization: Bearer {jwt_token}
Header: Idempotency-Key: {unique_key}
Body: { "exchange_item_id": 196, "quantity": 1 }
```

### 6.4 用户资产余额（已有，无需改动）

小程序获取用户材料资产余额通过已有的资产账本接口，不在本文档范围。

---

## 七、三端责任划分（后端 / Web管理后台 / 微信小程序）

### 7.1 后端数据库项目需要做的事

| 序号 | 任务 | 类型 | 涉及文件 | 工作量 | 当前状态 |
|---|---|---|---|---|---|
| B1 | `exchange_items` 表新增 `usage_rules` JSON 列 | DB 迁移 | `migrations/20260314004932-add-usage-rules-and-category-fk.js` | 小 | **已完成** (2026-03-14) |
| B2 | `exchange_items.category` 添加外键约束指向 `category_defs.category_code` | DB 迁移 | `migrations/20260314004932-add-usage-rules-and-category-fk.js` | 小 | **已完成** (2026-03-14) |
| B3 | `ExchangeItem` 模型新增 `usage_rules` 字段 + `belongsTo(CategoryDef)` 关联 | 模型变更 | `models/ExchangeItem.js` | 小 | **已完成** (2026-03-14) |
| B4 | `QueryService.getItemDetail()` 增强：include 多图（按 category 分组）+ rarityDef + categoryDef | Service 增强 | `services/exchange/QueryService.js` | 中 | **已完成** (2026-03-14) |
| B5 | `marketItemDetailView` + `marketItemView` 常量增加 `'usage_rules'`、`'category'` | 常量变更 | `services/exchange/QueryService.js` | 小 | **已完成** (2026-03-14) |
| B6 | `QueryService.getMarketItems()` 增加 `exclude_id` 筛选参数 | Service 增强 | `services/exchange/QueryService.js` | 小 | **已完成** (2026-03-14) |
| B7 | `DataSanitizer.sanitizeExchangeMarketItems()` 增强：透传 images/detail_images/showcase_images/usage_rules/rarity_def/category_def | 脱敏增强 | `services/DataSanitizer.js` | 中 | **已完成** (2026-03-14) |
| B8 | 路由层增加 `exclude_id` 参数透传 | 路由变更 | `routes/v4/backpack/exchange.js` | 小 | **已完成** (2026-03-14) |
| B9 | `AdminService` 增加 `usage_rules` 字段接收和写入 | Service 增强 | `services/exchange/AdminService.js` | 小 | **已完成** (2026-03-14) |

> **原 B2/B3/B9/B11 已取消**：v2.0 文档提出新建 `exchange_categories` 表和 `ExchangeCategory` 模型，经 2026-03-14 代码走查发现 `category_defs` 表已存在（9 条数据），`CategoryDef` 模型已存在（`models/CategoryDef.js`），分类 CRUD API 已存在（`routes/v4/console/dictionaries.js`），**全部可直接复用**。

**后端可复用基础设施**（2026-03-14 代码走查确认）：
- `image_resources` 表多图架构（context_id + category + sort_order）**完全可复用**
- `ImageResources.toSafeJSON()` 方法（`models/ImageResources.js` 第 189-232 行）自动生成安全 URL + 三种缩略图 **完全可复用**
- `ImageUrlHelper` 对象 key 转公网 URL **完全可复用**
- `BusinessCacheHelper` Redis 缓存 **完全可复用**
- `exchange_page_config` 全局配置系统（`system_configs` 表 key=`exchange_page`）**完全可复用**
- `rarity_defs` 字典表 + `RarityDef` 模型 + `ExchangeItem.belongsTo(RarityDef)` 关联 **已有**
- `category_defs` 字典表 + `CategoryDef` 模型 + 完整 CRUD API **已有**
- `DictionaryService`（`services/DictionaryService.js`）分类管理方法 **已有**
- `AdminService` 已支持 `sell_point`/`original_price`/`space`/`tags`/`category` 的创建和更新 **已有**

**后端可扩展点**：
- `image_resources.category` 新增 `'detail'`、`'showcase'` 分类值（无需 DB 变更，VARCHAR 字段直接写入新值即可）
- 图片上传 API `POST /api/v4/console/system/admin/image-upload` 已支持 `business_type` + `category` 参数，直接可用

### 7.2 Web 管理后台前端需要做的事

| 序号 | 任务 | 涉及文件 | 工作量 | 当前状态 |
|---|---|---|---|---|
| W1 | `itemForm` 补齐缺失字段 + 动态加载字典数据（替代硬编码 rarityOptions） | `admin/src/modules/market/composables/exchange-items.js` | 中 | **已完成** (2026-03-14) |
| W2 | 商品编辑表单增加 `usage_rules`/`sell_point`/`tags`/`original_price`/`space` 编辑器 | `admin/exchange-market.html` + composable | 中 | **已完成** (2026-03-14) |
| W3 | 商品编辑表单增加"详情图"上传区（category='detail'） | `admin/exchange-market.html` + composable | 中 | **已完成**（composable 已有状态，补完上传 UI） |
| W4 | 商品编辑表单增加"展示图"上传区（category='showcase'） | `admin/exchange-market.html` + composable | 中 | **已完成** (2026-03-14) |
| W5 | 兑换页面配置增加 `detail_page.attr_display_mode` 和 `detail_page.tag_style_type` | `admin/exchange-page-config.html` + composable | 小 | **已完成** (2026-03-14) |
| W6 | 商品编辑表单 `category` 改为从 `category_defs` 下拉选择 | composable | 小 | **已完成** (2026-03-14) |

> **原 W5（新增分类管理页面）已取消**：分类 CRUD API 已存在于 `/api/v4/console/dictionaries/categories`，如需管理界面可后续在字典管理页面中统一处理。

**Web 管理后台技术栈**（2026-03-14 确认）：Vite 6.4 + Alpine.js 3.15 + Tailwind CSS 3.4，多页应用架构，完全兼容当前任务需求。

**Web 管理后台可复用组件**（2026-03-14 代码走查确认）：
- 图片上传已有完整实现（`POST /api/v4/console/system/admin/image-upload`，支持 `business_type` + `category`）
- 商品编辑表单（`exchange-items.js` composable）已有 `itemForm` 结构 + `detailImages` 状态，扩展字段即可
- 页面配置编辑器（`exchange-page-config.js` composable）已有完整的配置读写流程
- 字典数据批量获取 API（`GET /api/v4/console/dictionaries/all`）一次返回 categories + rarities + asset_groups

### 7.3 微信小程序前端需要做的事

| 序号 | 任务 | 说明 |
|---|---|---|
| M1 | **`name` 改为 `item_name`**（最关键的字段名修正） | 后端数据库字段为 `item_name`，小程序直接使用 |
| M2 | 响应数据从 `res.data.data.item` 取值（后端统一包装格式） | 注意 `data.item` 嵌套层级 |
| M3 | `images` 数组格式适配后端 `toSafeJSON()` 输出 | 每项含 `image_resource_id`、`imageUrl`(公网 URL)、`thumbnails.{small,medium,large}`(公网 URL)、`sort_order` |
| M4 | 稀有度颜色从 `rarity_def.color_hex` 获取 | 后端返回 rarity_defs 联查结果，无需前端硬编码色值 |
| M5 | 分类名称从 `category_def.display_name` 获取 | 后端返回 category_defs 联查结果，`category` 字段为 code 字符串（如 `'collectible'`），`category_def.display_name` 为中文名 |
| M6 | 标签样式和属性展示模式从页面配置获取（或使用默认值） | `tag_style_type` 和 `attr_display_mode` 在 `exchange_page_config.detail_page` 中，不在商品数据中 |
| M7 | 兑换接口需传 `Idempotency-Key` Header | 后端强制要求幂等键 |
| M8 | `space` 字段注意 `'both'` 值（文档原版未提及） | 后端 space 有三个值：lucky / premium / both |
| M9 | `cost_amount` 和 `original_price` 为 BIGINT | JavaScript 安全整数范围内，但注意后续大数场景 |
| M10 | 相关推荐查询参数用 `category=xxx`（字符串 code） | 注意传的是 `category_defs.category_code`（如 `collectible`），不是数字 ID |

---

## 八、需要拍板的决策点（含行业调研）

### 决策1：`attr_display_mode` 和 `tag_style_type` 的控制粒度

| 方案 | 说明 |
|---|---|
| **A：全局配置**（走已有 `exchange_page_config`） | 所有商品统一样式，无需 DB 迁移 |
| **B：每商品单独配** | `exchange_items` 表新增两列，每商品可不同样式 |

**行业做法对比：**

| 类型 | 代表 | 做法 | 原因 |
|---|---|---|---|
| 大型电商 | 淘宝/京东/美团 | 每 SKU 独立控制展示模板 | 品类跨度极大（食品 vs 电子 vs 服装），必须差异化 |
| 游戏商城 | 原神/王者荣耀/崩铁 | **同一商店内全局统一**，不同商店（星辉商店/创世结晶商店）各自主题 | 同一商店内的虚拟物品本质相同（都是角色/武器/道具），不需要差异化布局 |
| 积分商城 | 招行掌上生活/中国移动 | 全局统一，按分类切换卡片尺寸 | 品类有限，统一样式降低维护 |
| 虚拟交易平台 | 5173/C5Game/交易猫 | **按品类**统一，不按单品 | CSGO皮肤一套样式，原神账号另一套，但同品类内统一 |
| 小型/初创项目 | 各类小程序积分兑换 | 全局统一 | 资源有限，统一样式 ROI 最高 |

**本项目适配分析：**

- 当前 6 个商品全部是虚拟兑换品，同质性高（和游戏商城一样）
- 后端已有 `exchange_page_config` 全局配置系统，零成本复用
- 方案 B 需要 DB 迁移 + 管理后台加两个字段编辑器 + 每次新建商品多两个选项要填，长期维护成本更高
- 如果未来商品量到 50+ 且品类差异大，从 A 升级到 B 只需一次迁移加两列，10 分钟的事

**已拍板：采用方案 A（全局配置）。** 和原神/王者荣耀等游戏商城设计一致——同一个兑换商店内所有商品统一展示风格。已有 `exchange_page_config` 零成本复用，不加列，无需 DB 迁移。

---

### 决策2：商品分类（category）的数据治理

当前数据库所有 6 条商品的 `category` 全部为 NULL。相关推荐功能依赖 `category` 字段做同分类查询。

**2026-03-14 代码走查重大发现：`category_defs` 分类字典表已存在，无需决策。**

| 已有基础设施 | 状态 | 说明 |
|---|---|---|
| `category_defs` 表 | **已有** 9 条数据（6 条启用） | PK 为 `category_code` VARCHAR(50)，含 display_name/icon_url/sort_order/is_enabled |
| `CategoryDef` 模型 | **已有** | `models/CategoryDef.js`，含 `getEnabled()` 静态方法 |
| 分类 CRUD API | **已有** 完整 GET/POST/PUT/DELETE | `routes/v4/console/dictionaries.js`，路径 `/api/v4/console/dictionaries/categories` |
| `DictionaryService` | **已有** | `createCategory`/`updateCategory`/`getCategoryByCode` 等方法 |
| `exchange_items.category` 列 | **已有** VARCHAR(50) | 与 `category_defs.category_code` 类型完全一致，直接加外键即可 |
| `exchange_page_config.shop_filters.categories` | **已有** | 配置中已包含 6 个分类筛选项（与 `category_defs` 启用的 6 条一致） |

**v2.0 文档原方案（新建 `exchange_categories` 表）属于重复造轮子，已取消。** 实际只需：

1. `exchange_items.category` 列添加外键约束指向 `category_defs.category_code`（一条 ALTER TABLE）
2. `ExchangeItem` 模型增加 `belongsTo(CategoryDef, { as: 'categoryDef', foreignKey: 'category' })` 关联
3. Web 管理后台商品编辑表单 `category` 字段改为下拉选择（调已有 API）
4. 给现有 6 条商品补填 `category` 值

**已拍板：需要补填。** 在后端迁移步骤中加入 SQL 批量补填现有 6 条商品的 `category` 值，写在同一个迁移文件中，随外键约束一起执行。具体分配在 Web 管理后台商品编辑页完成后由运营人员通过后台手动为每条商品选择正确分类。

---

### 决策3：`sold_count` 是否对普通用户可见

| 方案 | 说明 |
|---|---|
| **A：后端始终返回，前端智能展示** | 后端不做隐藏，前端根据数值大小决定是否渲染 |
| **B：后端隐藏** | DataSanitizer 对普通用户删除 `sold_count` 字段 |

**行业做法对比：**

| 类型 | 代表 | 做法 | 原因 |
|---|---|---|---|
| 大型电商 | 淘宝/京东/拼多多 | **始终展示**，"已售 10万+" 是核心转化要素 | 销量是最强社会证明，直接影响购买决策 |
| 外卖 | 美团/饿了么 | **始终展示**，"月售 XXX" 是用户第一决策因素 | 不展示月售的商家基本无人点 |
| 游戏商城 | 原神/崩铁 | **不展示已售**，只展示剩余库存或"限量 XX 件" | 游戏商城卖的是稀缺感，不是从众心理 |
| 积分商城 | 招行/移动 | 展示，但通常显示"已兑 XXX 次" | 增加信任感 |
| 虚拟交易 | 5173/交易猫 | 展示成交量（作为信誉指标） | 交易平台需要信任背书 |
| 限量抢购 | 小米/得物 | **展示库存进度条**（"已抢 80%"），不单独展示已售数 | 制造紧迫感比展示绝对数更有效 |

**本项目适配分析：**

- 当前真实数据：sold_count 值为 0、8、12，数值很低
- 展示"已售 0 件"反而降低信心，展示"已售 8 件"也没有说服力
- 但页面已设计了**库存进度条**（"库存剩余 99%"），这比绝对数字更能传达信息
- 本项目的商品更偏游戏虚拟兑换品，用户决策靠的是"稀有度 + 价格 + 外观"，不是"多少人买过"
- 从长期维护角度：**后端始终返回数据，前端决定是否渲染**是最灵活的，不会造成"想展示时发现后端没给"的困境

**已拍板：采用方案 A（后端始终返回，前端智能展示）。** 后端 DataSanitizer 不做任何改动，`sold_count` 保持返回，无需 DB 迁移。小程序前端自行决定展示策略——库存进度条始终展示，"已售 X 件"文字仅在 `sold_count >= 10` 时渲染（避免低数值反噬）。和小米/得物的限量抢购模式一致：进度条传达紧迫感，弱化绝对数字。

---

### 决策4：详情页配置（`attr_display_mode` / `tag_style_type`）在 `exchange_page` 中的存放层级

当前 `exchange_page` 配置结构（`system_configs` 表 key=`exchange_page`）：

```
exchange_page
├── tabs            （Tab 配置）
├── spaces          （空间配置）
├── card_display    （列表页卡片配置）
├── shop_filters    （商品筛选）
├── market_filters  （交易市场筛选）
└── ui              （运营参数）
```

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A1：新增 `detail_page` 子节点** | `exchange_page.detail_page.attr_display_mode` | 结构清晰，列表页和详情页配置分离，后续详情页扩展配置都放这里 | 多一层嵌套 |
| A2：塞进已有 `card_display` | `exchange_page.card_display.attr_display_mode` | 不改结构 | 语义不对，`card_display` 是列表页卡片的配置，详情页配置混进去会乱 |

**已拍板：采用方案 A1（新增 `detail_page` 子节点）。** 配置结构变为：

```
exchange_page
├── tabs
├── spaces
├── card_display      ← 列表页卡片
├── detail_page       ← 详情页（新增）
│   ├── attr_display_mode: "grid"   （属性区展示模式：grid / list）
│   └── tag_style_type: "game"      （标签样式：game / plain）
├── shop_filters
├── market_filters
└── ui
```

后端 `exchange-page-config.js` 路由的 PUT 校验和 GET 返回无需改动（配置为 JSON 自由结构），仅 Web 管理后台配置页面增加两个下拉项。

> **2026-03-15 运行时验证修复**：发现公开配置 API `GET /api/v4/system/config/exchange-page` 在数据库配置中缺少 `detail_page` 时不会自动补充默认值。已在 `routes/v4/system/config.js` 中增加默认值补充逻辑：当数据库配置不含 `detail_page` 时，API 自动返回 `{ attr_display_mode: "grid", tag_style_type: "game" }` 默认值，确保小程序端始终能获取到配置。

---

### 决策5：Admin 前端 `rarityOptions` 硬编码与数据库 `rarity_defs` 不一致

代码走查发现 `admin/src/modules/market/composables/exchange-items.js` 第 56-62 行硬编码了稀有度选项，其中 `uncommon` 显示名为 **"优质"**，但数据库 `rarity_defs` 表存的是 **"稀有"**。

| 来源 | uncommon 显示名 |
|---|---|
| 数据库 `rarity_defs.display_name` | 稀有 |
| Admin 前端硬编码 `rarityOptions` | 优质 |

| 方案 | 做法 |
|---|---|
| B1：修正前端硬编码为"稀有" | 保持与数据库一致，但仍然是硬编码 |
| B2：改数据库为"优质" | 如果"优质"更符合业务语义 |
| **B3：前端改为动态加载** | 调用 `GET /api/v4/console/dictionaries/all` 获取 `rarities`，彻底不硬编码 |

**已拍板：采用方案 B3（动态加载）。** 从长期维护角度根除硬编码问题。后端 API 已就绪（`GET /api/v4/console/dictionaries/all` 返回 `{ categories, rarities, asset_groups }`），Admin 前端在初始化时调一次接口即可替代硬编码的 `rarityOptions` 数组。同时可复用于 `category` 下拉选择（W6 任务），一个接口同时解决两个下拉数据源。

**对应修改**（归入 W1 任务）：
- 删除 `exchange-items.js` 第 56-62 行硬编码的 `rarityOptions`
- 新增 `loadDictionaries()` 方法，调用 `GET /api/v4/console/dictionaries/all`
- 用返回的 `rarities` 填充 `rarityOptions`，用 `categories` 填充分类下拉

---

## 九、执行步骤（后端为主导，前端适配）

> 基于 2026-03-14 代码走查修正，删除了所有「重复造轮子」的步骤（原 v2.0 中新建 exchange_categories 表/模型/路由等 4 个步骤）。

### 第一阶段：后端增强（预计 1 天）

**步骤 1**：数据库迁移 — 新增 `usage_rules` 列 + `category` 加外键

一个 Sequelize 迁移文件 `migrations/xxx-add-usage-rules-and-category-fk.js` 包含两步：

```sql
-- A: exchange_items 新增 usage_rules 列
ALTER TABLE exchange_items ADD COLUMN usage_rules JSON DEFAULT NULL
  COMMENT '使用说明条目数组，如 ["兑换后物品自动进入背包","虚拟物品一经兑换不可退还"]'
  AFTER sell_point;

-- B: exchange_items.category 添加外键约束指向已有的 category_defs 表
ALTER TABLE exchange_items
  ADD CONSTRAINT fk_exchange_items_category
  FOREIGN KEY (category) REFERENCES category_defs(category_code)
  ON UPDATE CASCADE ON DELETE SET NULL;
```

> 注意：不需要新建分类表，不需要改列类型。`exchange_items.category` 已经是 VARCHAR(50)，与 `category_defs.category_code` 类型完全一致。

**步骤 2**：模型层 — `ExchangeItem` 增强

在 `models/ExchangeItem.js` 中：
- 新增 `usage_rules` JSON 字段定义
- 在 `associate()` 方法中增加 `belongsTo(models.CategoryDef, { as: 'categoryDef', foreignKey: 'category', targetKey: 'category_code' })` 关联（复用已有 `CategoryDef` 模型，无需新建模型）

**步骤 3**：查询视图常量 — 新增 `usage_rules`、`category`

在 `services/exchange/QueryService.js` 的 `marketItemDetailView` 数组（第 65-90 行）中增加 `'usage_rules'`（`category` 已在列表中）。

**步骤 4**：`getItemDetail()` 增强 — 多图 + rarityDef + categoryDef

修改 `QueryService.getItemDetail()` 方法（第 341-373 行），增加 include：

```javascript
include: [
  { model: this.ImageResources, as: 'primaryImage',
    attributes: ['image_resource_id', 'file_path', 'mime_type', 'thumbnail_paths'],
    required: false },
  { model: this.models.RarityDef, as: 'rarityDef',
    attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
    required: false },
  { model: this.models.CategoryDef, as: 'categoryDef',
    attributes: ['category_code', 'display_name', 'icon_url'],
    required: false }
]
```

然后在返回前，查询该商品的所有关联图片并按 category 分组：

```javascript
const allImages = await this.ImageResources.findAll({
  where: { business_type: 'exchange', context_id: item_id, status: 'active' },
  order: [['sort_order', 'ASC']]
})
const images = allImages.filter(i => i.category === 'products').map(i => i.toSafeJSON())
const detail_images = allImages.filter(i => i.category === 'detail').map(i => i.toSafeJSON())
const showcase_images = allImages.filter(i => i.category === 'showcase').map(i => i.toSafeJSON())
```

将 `images`、`detail_images`、`showcase_images` 挂载到返回的 item 对象上。

**步骤 5**：`DataSanitizer.sanitizeExchangeMarketItems()` 增强

在 `services/DataSanitizer.js`（第 989-1038 行）的脱敏方法中，增加新字段透传：

```javascript
// 多图透传
sanitized.images = sanitized.images || []
sanitized.detail_images = sanitized.detail_images || []
sanitized.showcase_images = sanitized.showcase_images || []
sanitized.usage_rules = sanitized.usage_rules || null

// 关联对象透传
sanitized.rarity_def = sanitized.rarityDef || sanitized.rarity_def || null
delete sanitized.rarityDef
sanitized.category_def = sanitized.categoryDef || sanitized.category_def || null
delete sanitized.categoryDef
```

**步骤 6**：`getMarketItems()` 增加 `exclude_id` 参数

在 `QueryService.getMarketItems()` 方法（第 181 行）的 options 解构中增加 `exclude_id = null`，在 where 条件构建中增加：

```javascript
if (exclude_id) {
  where.exchange_item_id = { [Op.ne]: parseInt(exclude_id, 10) }
}
```

路由层 `routes/v4/backpack/exchange.js` 的 GET /items 路由透传 `req.query.exclude_id` 到 options。

**步骤 7**：AdminService — 支持 `usage_rules` 写入

在 `services/exchange/AdminService.js` 的 `createExchangeItem`（第 138 行附近）和 `updateExchangeItem` 中增加 `usage_rules` 字段的接收和写入（同现有 `tags` 字段处理模式）。

> 注意：AdminService 已支持 `sell_point`/`original_price`/`space`/`tags`/`category` 字段的写入（代码走查确认），仅需增加 `usage_rules`。

### 第二阶段：Web 管理后台增强（预计 1 天）

**步骤 8**：`itemForm` 补齐缺失字段

在 `admin/src/modules/market/composables/exchange-items.js` 的 `itemForm`（第 37-54 行）和 `openAddItemModal`（第 178-195 行）和 `editItem` 方法中，补齐：

```javascript
sell_point: '',
original_price: null,
space: 'lucky',
tags: [],
usage_rules: [],
category: null  // 改为从 category_defs 下拉选择
```

**步骤 9**：商品编辑表单 HTML — 新增字段 UI

在 `admin/exchange-market.html` 的商品编辑弹窗中增加：
- `sell_point`：单行文本输入
- `original_price`：数字输入
- `space`：下拉选择（lucky/premium/both）
- `tags`：动态数组输入（逗号分隔或添加按钮）
- `usage_rules`：动态数组输入（每条一行，添加/删除按钮）
- `category`：下拉选择（调用 `GET /api/v4/console/dictionaries/categories` 或 `GET /api/v4/console/dictionaries/all`）

**步骤 10**：详情图/展示图上传

composable 已有 `detailImages` 状态和 `detailImageUploading` 标志，补完上传 UI：
- 详情图上传区（调用已有图片上传 API，`category='detail'`）
- 展示图上传区（调用已有图片上传 API，`category='showcase'`）

**步骤 11**：兑换页面配置 — 新增 `detail_page` 子节点

在 `admin/exchange-page-config.html` 和 `admin/src/modules/system/composables/exchange-page-config.js` 中，往 `exchange_page` 配置增加 `detail_page` 子节点：

```json
{
  "detail_page": {
    "attr_display_mode": "grid",
    "tag_style_type": "game"
  }
}
```

### 第三阶段：微信小程序对接（预计 1-2 天）

**步骤 12**：字段名适配

- `name` → `item_name`（全局替换）
- 响应层级 `res.data.data.item`
- 图片数组格式适配 `toSafeJSON()` 输出（每项含 `imageUrl`、`thumbnails.{small,medium,large}`）
- 分类显示名从 `category_def.display_name` 获取

**步骤 13**：对接详情 API

`_loadProductDetail` 替换为 `GET /api/v4/backpack/exchange/items/:exchange_item_id`。

**步骤 14**：对接兑换 API

`POST /api/v4/backpack/exchange`，携带 `Idempotency-Key` Header。

**步骤 15**：对接相关推荐

调用 `GET /api/v4/backpack/exchange/items?category=collectible&exclude_id=196&page_size=4`（注意 `category` 传字符串 code，不是数字 ID）。

**步骤 16**：页面配置获取

`attr_display_mode` 和 `tag_style_type` 从 `exchange_page_config.detail_page` 获取（可缓存本地）。

**步骤 17**：`sold_count` 智能展示

库存进度条始终展示，"已售 X 件"文字仅在 `sold_count >= 10` 时渲染。

---

## 十、前端实现路径（修正版）

### 第一阶段：模拟数据验证 UI（当前已完成）

- [x] 创建 `packageExchange/exchange-detail/` 页面
- [x] 注册路由到 `app.json`
- [x] 修改 `exchange-shelf.ts` 点击跳转到详情页
- [x] 稀有度光效 + 标签系统 + 属性网格 + 吸底兑换栏
- [x] 模拟数据覆盖全部稀有度和资产类型

### 第二阶段：对接真实 API（需后端第一阶段完成）

- [ ] **`name` 全局改为 `item_name`**（最重要的修正）
- [ ] `_loadProductDetail` 替换为 `GET /api/v4/backpack/exchange/items/:exchange_item_id`
- [ ] 响应解析层级适配 `res.data.data.item`
- [ ] 余额数据从 Store / Page 壳获取
- [ ] 兑换逻辑替换为 `POST /api/v4/backpack/exchange`（携带 Idempotency-Key）
- [ ] 兑换成功后通知 Page 壳刷新积分
- [ ] 稀有度颜色从 `rarity_def.color_hex` 获取（后端联查返回）
- [ ] 分类名称从 `category_def.display_name` 获取（后端联查返回）

### 第三阶段：扩展区块（需后端第一阶段完成）

- [ ] 图片轮播（后端 `images` 数组，每项含 `url` + `thumbnails`）
- [ ] 商品介绍区：纯文字 / 长图 / 混排三种模式（`description` + `detail_images`）
- [ ] 商品展示图区（`showcase_images` 数组）
- [ ] 使用说明区（`usage_rules` JSON 数组）
- [ ] 相关推荐区（复用列表接口 + `category=xxx&exclude_id=xxx`，注意 category 传字符串 code）
- [ ] 属性区/标签区模式切换（从页面配置获取，而非商品数据）

### 第三阶段补充：客服按钮

- [ ] 客服按钮接入（`<button open-type="contact">` 微信原生客服，纯前端实现，无需后端支持）

---

## 十一、方案来源对比分析

本方案融合了以下行业实践的优势：

| 来源 | 取其精华 | 去其糟粕 |
|---|---|---|
| 淘宝/京东（方案B） | 白底信息密排、多图展示、使用说明、相关推荐 | 评价系统、问答系统、店铺体系、购物车凑单、推荐算法、优惠券体系 |
| 游戏内商城（方案C） | 稀有度渐变光效、游戏风标签、结构化属性网格、吸底操作栏、冲动型决策路径 | 信息过于简略、无法承载复杂营销 |
| 积分商城（招行/移动） | 兑换规则说明、余额展示、简洁兑换流程 | 视觉平淡、缺乏品质感 |
| 虚拟交易平台（5173/交易猫） | 价格参考、商品属性展示 | 担保交易流程（不适用于积分兑换） |

---

## 十二、运行时验证报告（2026-03-15）

### 验证结果汇总

| 验证项 | 结果 | 说明 |
|---|---|---|
| 数据库迁移 | ✅ 通过 | `usage_rules` JSON列已存在，`fk_exchange_items_category` 外键已创建 |
| 模型关联 | ✅ 通过 | ExchangeItem → RarityDef / CategoryDef / ImageResources 关联均正确 |
| 商品详情API | ✅ 通过 | 21/21字段全部返回（含 images/detail_images/showcase_images/rarity_def/category_def/usage_rules） |
| exclude_id过滤 | ✅ 通过 | 6条→5条排除成功 |
| 页面配置API | ✅ 通过 | detail_page 配置正确返回（含默认值补充逻辑） |
| 字典数据API | ✅ 通过 | categories 5条 + rarities 5条 |
| ESLint | ✅ 0错误 | 修改的后端文件全部通过 |
| Prettier | ✅ 格式正确 | All matched files use Prettier code style |
| 功能测试 | ✅ 46/48通过 | 2个失败为存量问题（背包POINTS过滤、幂等性事务），与本次无关 |
| 健康检查 | ✅ 全绿 | 数据库connected + Redis connected + Node v20.18.0 |
| Web管理后台 | ✅ 构建成功 | Vite 构建无错误，exchange-market 模块 30.41 kB |

### 修复记录

| 发现问题 | 修复内容 | 修复文件 |
|---|---|---|
| 配置API不返回 `detail_page` | 增加默认值补充逻辑 + 兜底配置增加 `detail_page` 节点 | `routes/v4/system/config.js` |

### 数据现状（需运营通过Web管理后台补充）

| 数据项 | 当前状态 | 操作方式 |
|---|---|---|
| 商品 `category` | 全部 NULL（6条） | Web管理后台 → 兑换商城 → 编辑 → 选择分类 |
| 商品 `rarity_code` | 全部 common | Web管理后台 → 兑换商城 → 编辑 → 选择稀有度 |
| 商品 `usage_rules` | 全部 NULL | Web管理后台 → 兑换商城 → 编辑 → 添加使用说明 |
| 商品 `sell_point` | 全部 NULL | Web管理后台 → 兑换商城 → 编辑 → 填写卖点 |
| 商品 `tags` | 全部 NULL | Web管理后台 → 兑换商城 → 编辑 → 添加标签 |
| 详情图 / 展示图 | 0张 | Web管理后台 → 兑换商城 → 编辑 → 上传 |
| 测试商品 ID 209/215/220 | 幂等性测试数据 | 可设为 inactive 或清理 |
