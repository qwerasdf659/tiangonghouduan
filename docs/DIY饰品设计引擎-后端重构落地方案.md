# DIY 饰品设计引擎 — 后端重构落地方案

> 最后更新：2026-04-08 04:30，后端重构 + 补充修复全部完成并通过测试验证。
>
> 原则：以后端数据库项目为核心权威，前端（Web 管理后台 + 微信小程序）适配后端字段名和接口设计，不做复杂映射，不兼容旧接口。

## ✅ 已修复问题清单（2026-04-08 04:30 全部修复完成）

> 业务规则：源晶/源晶碎片（可叠加资产）兑换 DIY 实物珠子，每颗珠子的定价货币（price_asset_code）由运营动态设定。当前 20 颗珠子全部以 `star_stone`（星石）定价。

### 补充修复清单（2026-04-08 04:30 第二轮修复）

| # | 问题 | 修复内容 | 修改文件 |
|---|---|---|---|
| F1 | diy-slot-editor.js 中 asset_code 字段名 | 经查实际不存在该问题，编辑器只处理槽位坐标（x/y/width/height），不涉及 material_code 或 asset_code | 无需修改 |
| F2 | exchange_records 管理端订单列表 exchangeItem 为 null 时显示空白 | 商品列 render 函数增加 `source === 'diy'` 判断，显示"🎨 DIY 设计兑换"；筛选栏增加"来源"下拉（exchange/bid/diy） | `admin/src/modules/market/pages/exchange-market.js` + `admin/exchange-market.html` |
| F3 | beads 接口返回 createdAt/updatedAt（驼峰）与其他字段 snake_case 不一致 | DiyMaterial 模型添加 `createdAt: 'created_at'`, `updatedAt: 'updated_at'` 显式映射 | `models/DiyMaterial.js` |
| F4 | DiyMaterial.price DECIMAL getter 丢失小数精度（30.00 → 30） | getter 改用 `parseFloat(parseFloat(val).toFixed(2))` 保留两位小数 | `models/DiyMaterial.js` |
| F5 | diy_works 表 5 条历史测试数据（id: 1,3,6,7,8）残留 | 已清理（全部 draft 状态，不在互锁体系内，直接 DELETE） | 数据库操作 |
| F6 | saveWork 中 _validateDesignMaterials 只在 material_group_codes 非空时校验，空数组直接跳过 | 重写为两层校验：第一层校验 material_code 是否存在于 diy_materials 且 is_enabled=true；第二层校验 group_code 是否在模板允许范围内 | `services/DIYService.js` |
| F7 | completeDesign 中 item_type='diy_product' 是否有枚举约束 | 经查 items.item_type 是 STRING(50) 自由文本，已有 prize/product/tradable_item/voucher 四种值，diy_product 完全合法 | 无需修改 |
| F8 | completeDesign 创建 ExchangeRecord 缺少 pay_asset_code/pay_amount 必填字段 | 从 total_cost 快照中提取主支付资产和总金额填入 | `services/DIYService.js` |
| F9 | saveWork 仍接受前端传入的 total_cost（安全隐患） | saveWork 不再接受前端 total_cost，创建时固定为 []，由 confirmDesign 服务端计算 | `services/DIYService.js` |
| F10 | confirmDesign 只支持 slots 格式的 design_data | 兼容三种格式：slots / beading+beads / slots+fillings | `services/DIYService.js` |

### 问题归属分类

| 归属 | 问题编号 | 说明 |
|---|---|---|
| 后端 Service 层 | B1, B2, B3, B4, B5, B7, B8, B9, B10 | DIYService.js 核心逻辑缺陷 |
| 后端数据库 DDL | B6, DB1, DB2, DB3 | 表缺失 / 字段默认值 / 字段缺失 |
| Web 管理后台前端 | W1, W2 | admin/src/api/diy.js 字段适配 |
| 微信小程序前端 | MP1, MP2 | 小程序端字段适配（代码不在本仓库） |

### 后端问题（B 系列）

| # | 问题 | 严重程度 | 代码位置 | 验证结果（2026-04-07 22:00） |
|---|---|---|---|---|
| B1 | `getTemplateMaterials()` 查的是 `material_asset_types`（货币表），不是 `diy_materials`（珠子商品表），导致小程序用户看到"红源晶碎片"而不是"巴西黄水晶 8mm" | 🔴 核心缺陷 | `services/DIYService.js` 第 281/302 行 | 代码仍然 `MaterialAssetType.findAll()` |
| B2 | `confirmDesign()` 从 `work.total_cost` 直接读取冻结明细，这个值是前端传入的，后端没有校验价格是否正确（安全漏洞：前端可以传 0 元）。正确做法：后端根据 design_data 查 diy_materials 的 price + price_asset_code 计算应冻结金额 | 🔴 核心缺陷 | `services/DIYService.js` 第 591 行 | 代码仍然 `const totalCost = work.total_cost` |
| B3 | `_validateDesignMaterials()` 查错表（查 `MaterialAssetType` 而非 `DiyMaterial`），且当 `material_group_codes` 为空数组时直接 return 跳过校验 — 当前 7 个模板全部空数组，校验永远不执行 | 🔴 核心缺陷 | `services/DIYService.js` 第 1314/1318 行 | 代码仍然查 `MaterialAssetType`，空数组直接 `return` |
| B4 | `confirmDesign()` 没有按 `price_asset_code` 分组汇总冻结，而是直接读前端传的 asset_code。正确做法：按每颗珠子的 price_asset_code 分组，逐种资产冻结（不需要 budget_value_points 换算） | 🔴 核心缺陷 | `services/DIYService.js` 第 599-608 行 | 代码直接遍历前端传的 total_cost 数组 |
| B5 | `diy_materials.price` 是 decimal(10,2)（如 6.50），但 `account_asset_balances.available_amount` 是 bigint 整数，冻结时无精度转换逻辑 | 🟡 需处理 | 数据库 `yellow_topaz_8mm` 价格 6.50 | 真实查询确认存在非整数价格 |
| B6 | `diy_materials` 表 DDL 中 `price_asset_code` 默认值是 `'DIAMOND'`（历史遗留），新增珠子时不指定会默认为不存在的资产 | 🟢 低优先级 | 数据库 INFORMATION_SCHEMA | 真实查询确认 `COLUMN_DEFAULT = 'DIAMOND'` |
| B7 | `BalanceService.freeze()` 实际签名需要 `system_code` 参数（2026-01-05 治理决策），当前 `confirmDesign()` 调用时未传 `system_code` | 🟡 需处理 | `services/asset/BalanceService.js` 第 545 行 | 代码审计确认 `freeze(params)` 解构包含 `system_code` |
| B8 | `completeDesign()` 调用 `BalanceService.settleFromFrozen()` 时同样未传 `system_code` | 🟡 需处理 | `services/DIYService.js` 第 682 行 | 代码审计确认 |
| B9 | `cancelDesign()` 调用 `BalanceService.unfreeze()` 时同样未传 `system_code` | 🟡 需处理 | `services/DIYService.js` 第 775 行 | 代码审计确认 |
| B10 | `completeDesign()` 铸造 items 时 `source: 'diy'`，但 items 表当前 source 值只有 `exchange/legacy/lottery/test`，`diy` 是新值，需确认 items 表 source 字段是 varchar(20) 可直接写入 | 🟢 低优先级 | `services/DIYService.js` 第 700 行 | items.source 是 varchar(20)，可直接写入 `'diy'` |

### 数据库缺失（DB 系列）

| # | 问题 | 严重程度 | 说明 |
|---|---|---|---|
| DB1 | `user_addresses` 表不存在 — 实物履约需要收货地址表 | 🔴 核心缺失 | 真实查询确认表不存在 |
| DB2 | `diy_template_slots` 表不存在 — 模板槽位定义表（如果需要精确槽位校验） | 🟡 可选 | 真实查询确认表不存在，当前 layout.bead_count 已能满足基本需求 |
| DB3 | `exchange_records` 表缺少 `address_snapshot` 字段 — 实物发货需要地址快照 | 🔴 核心缺失（实物履约前提） | 真实查询确认字段不存在，但已有 `shipping_company` / `shipping_no` 字段 |

### Web 管理后台前端问题（W 系列）

| # | 问题 | 严重程度 | 说明 |
|---|---|---|---|
| W1 | `admin/src/api/diy.js` 中 API 端点路径已正确（`/api/v4/console/diy/templates` 等），但后端 B1 修复后返回字段会变化，前端需适配新字段名 | 🟡 需适配 | 后端修复后前端跟进 |
| W2 | 管理后台 DIY 材料管理页面（`admin/src/pages/diy/materials.html`）需要适配后端 `diy_materials` 表的真实字段名 | 🟡 需适配 | 直接使用后端字段名，不做映射 |

### 微信小程序前端问题（MP 系列）

| # | 问题 | 严重程度 | 说明 |
|---|---|---|---|
| MP1 | 小程序端调用 `GET /api/v4/diy/templates/:id/materials` 后，返回数据结构会从 `material_asset_types` 字段变为 `diy_materials` 字段，需适配 | 🟡 需适配 | 后端修复后小程序跟进 |
| MP2 | 小程序端 `saveWork` 时传入的 `total_cost` 将不再被后端信任，后端会自行计算，小程序可以不传或传空 | 🟢 低优先级 | 后端修复后小程序可选适配 |

附加数据问题：5 条 `diy_works` 测试数据使用不存在的编码（JADE/AGATE/DIAMOND/red_shard），其中 work_id 7/8 的 `total_cost` 引用 `DIAMOND`，需要清理。`diy_materials.price_asset_code` 的 DDL 默认值 `'DIAMOND'` 需要改为 `'star_stone'`（对齐当前 20 条真实数据全部是 star_stone）。

---

# 第一部分：项目技术全景（基于代码和数据库实际验证）

## 一、后端项目技术全景

项目名：**restaurant-lottery-system-v4-unified v4.0.0**
定位：餐厅积分抽奖系统，V4 RESTful API 架构（扁平化资源导向设计）

| 类别 | 技术（实际 package.json 版本） |
|---|---|
| 运行时 | Node.js >=20.18.0 |
| Web框架 | Express ^4.21.0 |
| ORM | Sequelize ^6.37.3 + sequelize-cli ^6.6.2 |
| 数据库 | MySQL（mysql2 ^3.11.0），Sealos 云平台（dbconn.sealosbja.site:42569） |
| 缓存 | Redis（ioredis ^5.4.1），当前 .env 中 Redis 配置为 localhost |
| 认证 | JWT（jsonwebtoken ^9.0.2，双Token：Access 7d + Refresh 7d）+ Cookie |
| 实时通信 | Socket.IO ^4.7.5 |
| 对象存储 | Sealos 对象存储（@aws-sdk/client-s3） |
| 安全 | helmet、cors、express-rate-limit、bcryptjs |
| 日志 | winston ^3.14.2 |
| 校验 | joi ^17.11.0 |
| API前缀 | 统一 /api/v4/ |
| 响应格式 | ApiResponse 中间件统一注入 { success, code, message, data, timestamp, version, request_id } |
| 事务管理 | TransactionManager.execute() 统一管理 |
| 幂等性 | business_id / idempotency_key 唯一约束 |
| 账本体系 | Account → AccountAssetBalance → AssetTransaction（统一账本三表） |
| 物品体系 | Item（缓存层）+ ItemLedger（真相层）+ ItemHold（锁定层）三表模型 |
| 数据库配置 | timezone: +08:00, charset: utf8mb4, underscored: true, freezeTableName: true |
| 连接池 | max=40, min=5, acquire=10s, idle=60s |
| 模型数量 | 119 个 Sequelize 模型（models/ 目录实际文件数） |
| 服务数量 | 102 个服务类（services/ 目录实际文件数） |

## 二、Web 管理后台前端（在本仓库内）

位置：`/home/devbox/project/admin/`

| 类别 | 技术（实际 package.json 版本） |
|---|---|
| 构建工具 | Vite ^6.4.1 + vite-plugin-ejs ^1.7.0 |
| JS框架 | Alpine.js ^3.15.4（轻量级响应式，非 Vue/React） |
| CSS框架 | Tailwind CSS ^3.4.19 |
| 画布库 | Konva ^10.2.3（用于 DIY 槽位编辑器） |
| 截图 | html2canvas ^1.4.1 |
| 图表 | ECharts ^6.0.0 |
| 拖拽 | SortableJS ^1.15.7 |
| WebSocket | socket.io-client（通过 CDN 或依赖） |
| 架构模式 | MPA（多页应用），vite.config.js 自动扫描所有 .html 入口 |
| API封装 | 原生 fetch 封装（admin/src/api/base.js），统一 JWT Bearer Token 管理 |
| 开发端口 | 5173，proxy 代理 /api → localhost:3000 |

DIY 管理端实际文件：
- API 层：`admin/src/api/diy.js`（17 个函数，对应 14 个管理端接口）
- 页面：4 个 HTML + 4 个 Alpine.js 模块
  - `diy-template-management.html` → `diy-template-management.js`（模板 CRUD）
  - `diy-material-management.html` → `diy-material-management.js`（珠子素材 CRUD）
  - `diy-work-management.html` → `diy-work-management.js`（作品查看）
  - `diy-slot-editor.html` → `diy-slot-editor.js`（Konva 槽位标注编辑器）
- 注意：`admin/src/api/diy.js` 未在 `admin/src/api/index.js` 中统一导出，各页面直接 import

## 三、微信小程序前端

不在本仓库中。本仓库是后端 + Web 管理后台的 monorepo。但后端代码明确支持微信小程序：

- `utils/platformDetector.js` 有完整的微信小程序请求识别（通过 Referer `servicewechat.com`）
- 平台枚举包含 `wechat_mp`
- `.env` 中有 `WX_APPID`、`WX_SECRET` 配置

## 四、DIY 相关的真实数据库数据（2026-04-07 22:00 实时查询）

### 4.1 diy_templates（7 条）

| ID | template_code | display_name | status | is_enabled | material_group_codes |
|---|---|---|---|---|---|
| 1 | DT26033100000154 | 经典串珠手链 | published | ✅ | []（空数组） |
| 2 | DT26033100000279 | 锁骨项链 | published | ✅ | [] |
| 3 | DT260331000003E9 | 心形吊坠 | published | ✅ | [] |
| 14 | DT260331000014A2 | 项链 | draft | ✅ | [] |
| 15 | DT26033100001514 | 项链 | draft | ✅ | [] |
| 16 | DT260331000016FC | 项链1 | draft | ✅ | [] |
| 17 | DT2603310000179B | 项链2 | draft | ✅ | [] |

表结构关键字段：`diy_template_id(bigint PK)`, `template_code(varchar32)`, `display_name(varchar200)`, `category_id(int)`, `status(enum: draft/published/archived)`, `is_enabled(tinyint)`, `layout(json)`, `bead_rules(json)`, `sizing_rules(json)`, `capacity_rules(json)`, `material_group_codes(json)`, `preview_media_id`, `base_image_media_id`, `meta(json)`, `sort_order(int)`

模板 1 的 layout 详情（经典串珠手链）：

```json
{
  "shape": "circle",
  "radius_x": 120, "radius_y": 120,
  "bead_count": 18
}
```

- bead_rules：`{ margin: 10, default_diameter: 8, allowed_diameters: [6,8,10,12] }`
- sizing_rules：S(14珠,95px)/M(18珠,120px)/L(22珠,140px)
- capacity_rules：`{ min_beads: 12, max_beads: 24 }`

> 注意：所有模板的 `material_group_codes` 都是空数组 `[]`，意味着当前没有限制可用材料分组。

### 4.2 diy_materials（20 条，全部启用，全部 star_stone 定价）

表结构关键字段：`diy_material_id(bigint unsigned PK)`, `material_code(varchar100 UNIQUE)`, `display_name(varchar200)`, `material_name(varchar100)`, `group_code(varchar50)`, `diameter(decimal5,1)`, `shape(enum: circle/ellipse/oval/square/heart/teardrop)`, `price(decimal10,2)`, `price_asset_code(varchar50, 默认值='DIAMOND')`, `stock(int, 默认-1)`, `is_stackable(tinyint)`, `image_media_id`, `category_id`, `sort_order`, `is_enabled`, `meta(json)`

| material_code | display_name | material_name | group_code | diameter | price(星石) | 有图 |
|---|---|---|---|---|---|---|
| yellow_crystal_8mm | 巴西黄水晶 | 黄水晶 | yellow | 8mm | 32 | ❌ |
| yellow_crystal_10mm | 巴西黄水晶 | 黄水晶 | yellow | 10mm | 67 | ❌ |
| yellow_lemon_8mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 8mm | 6 | ❌ |
| yellow_lemon_10mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 10mm | 12 | ❌ |
| yellow_lemon_12mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 12mm | 19 | ❌ |
| yellow_topaz_8mm | 黄塔晶 | 黄水晶 | yellow | 8mm | 6.5 | ❌ |
| pink_crystal_8mm | 粉水晶 | 粉水晶 | red | 8mm | 15 | ❌ |
| pink_crystal_10mm | 粉水晶 | 粉水晶 | red | 10mm | 28 | ❌ |
| pink_crystal_12mm | 粉水晶 | 粉水晶 | red | 12mm | 45 | ❌ |
| smoky_crystal_8mm | 茶水晶 | 茶水晶 | orange | 8mm | 10 | ❌ |
| smoky_crystal_10mm | 茶水晶 | 茶水晶 | orange | 10mm | 22 | ❌ |
| phantom_green_8mm | 绿幽灵水晶 | 幽灵水晶 | green | 8mm | 35 | ✅(media_id=31) |
| phantom_green_10mm | 绿幽灵水晶 | 幽灵水晶 | green | 10mm | 58 | ❌ |
| amethyst_8mm | 紫水晶 | 紫水晶 | purple | 8mm | 25 | ❌ |
| amethyst_10mm | 紫水晶 | 紫水晶 | purple | 10mm | 42 | ❌ |
| amethyst_12mm | 紫水晶 | 紫水晶 | purple | 12mm | 68 | ❌ |
| blue_crystal_8mm | 海蓝宝 | 蓝水晶 | blue | 8mm | 30 | ❌ |
| blue_crystal_10mm | 海蓝宝 | 蓝水晶 | blue | 10mm | 55 | ❌ |
| clear_quartz_8mm | 白水晶 | 白水晶 | yellow | 8mm | 8 | ❌ |
| clear_quartz_10mm | 白水晶 | 白水晶 | yellow | 10mm | 15 | ❌ |

关键发现：
- 20 条中只有 1 条有图片（phantom_green_8mm），19 条需要补图
- 全部 stock = -1（无限库存），全部 is_enabled = 1
- **表结构有 `material_name` 字段**（如"黄水晶"），和 `display_name`（如"巴西黄水晶"）是两个不同字段
- **表 DDL 中 `price_asset_code` 默认值是 `DIAMOND`**（历史遗留），但实际 20 条数据全部已设为 `star_stone`

### 4.3 diy_works（5 条，全部 draft，全部是测试数据）

表结构关键字段：`diy_work_id(bigint PK)`, `diy_template_id(bigint)`, `account_id(bigint)`, `work_code(varchar32)`, `work_name(varchar200, 默认='我的设计')`, `status(enum: draft/frozen/completed/cancelled)`, `design_data(json)`, `total_cost(json)`, `preview_media_id`, `item_id(bigint)`, `idempotency_key(varchar64)`, `frozen_at(datetime)`, `completed_at(datetime)`

| work_id | account_id | template_id | status | work_name | design_data 中的编码 | total_cost |
|---|---|---|---|---|---|---|
| 1 | 5 | 1 | draft | 翡翠手链 | JADE（不存在于任何表） | [] |
| 3 | 5 | 1 | draft | 我的设计 | AGATE（不存在于任何表） | [] |
| 6 | 5 | 1 | draft | 我的设计 | AGATE | [] |
| 7 | 5 | 1 | draft | 价格测试手链 | red_shard（不存在，正确的是 red_core_shard） | [{asset_code: "DIAMOND", amount: 180}] |
| 8 | 5 | 1 | draft | 混合价格测试 | red_shard + DIAMOND（都不存在） | [{asset_code: "DIAMOND", amount: 990}] |

关键发现：

- 5 条 works 全部是 account_id=5 的测试数据
- design_data 中使用的编码（JADE、AGATE、red_shard、DIAMOND）在 diy_materials 和 material_asset_types 两张表中都不存在
- total_cost 中引用的 DIAMOND 也不存在于 material_asset_types
- 这些是前端尚未对接真实材料时的测试数据，可以安全清理

### 4.4 material_asset_types（16 条）

表结构关键字段：`material_asset_type_id(bigint PK)`, `asset_code(varchar50 UNIQUE)`, `display_name(varchar100)`, `group_code(varchar50)`, `form(enum: shard/gem/currency/quota)`, `tier(int)`, `sort_order(int)`, `visible_value_points(bigint)`, `budget_value_points(bigint)`, `is_enabled(tinyint)`, `is_tradable(tinyint)`, `merchant_id(int)`

碎片/宝石类（12 条，可用于 DIY 支付）：

| asset_code | display_name | group_code | form | budget_value_points |
|---|---|---|---|---|
| red_core_shard | 红源晶碎片 | red | shard | 1 |
| red_core_gem | 红源晶 | red | gem | 50 |
| orange_core_shard | 橙源晶碎片 | orange | shard | 10 |
| orange_core_gem | 橙源晶 | orange | gem | 100 |
| yellow_core_shard | 黄源晶碎片 | yellow | shard | 20 |
| yellow_core_gem | 黄源晶 | yellow | gem | 200 |
| green_core_shard | 绿源晶碎片 | green | shard | 40 |
| green_core_gem | 绿源晶 | green | gem | 400 |
| blue_core_shard | 蓝源晶碎片 | blue | shard | 80 |
| blue_core_gem | 蓝源晶 | blue | gem | 800 |
| purple_core_shard | 紫源晶碎片 | purple | shard | 160 |
| purple_core_gem | 紫源晶 | purple | gem | 1600 |

货币/配额类（4 条）：

| asset_code | display_name | group_code | form | budget_value_points |
|---|---|---|---|---|
| star_stone | 星石 | currency | currency | **0**（⚠️ 注意不是 100） |
| star_stone_quota | 星石配额 | currency | quota | null |
| points | 积分 | points | currency | 1 | 🚫 不可用于 DIY 支付 |
| budget_points | 预算积分 | points | quota | 1（已禁用） | 🔴 内部字段，绝对禁止暴露给用户 |

> ⚠️ **关键纠正**：`star_stone` 的 `budget_value_points = 0`，不是之前文档中写的 100。这意味着星石不能通过 budget_value_points 做等价换算。星石是直接定价货币（diy_materials.price 直接以星石为单位），不参与 budget_value_points 换算体系。

### 4.5 真实资产持有统计（2026-04-06 22:00 实时查询）

| asset_code | 持有人数 | 总可用余额 | 总冻结 |
|---|---|---|---|
| star_stone | 43 人 | 646,969 | 1,165 |
| red_core_shard | 11 人 | 470,025 | -3,700 |
| points | 10 人 | 129,021 | -8,570 |
| orange_core_shard | 5 人 | 3,000 | 0 |
| red_core_gem | 5 人 | 1,200 | 0 |
| budget_points | 1 人 | 1 | 0 |
| star_stone_quota | 1 人 | 9 | 0 |

关键发现：只有 4 种资产有用户持有余额且可用于 DIY 支付（star_stone、red_core_shard、orange_core_shard、red_core_gem）。`points`（积分）不可用于 DIY 支付。`budget_points`（预算积分）是内部运营字段，绝对不能暴露给任何用户。其他 7 种碎片/宝石（yellow/green/blue/purple）目前没有任何用户持有。

## 五、DIY 后端代码现状（基于实际代码审计）

### 5.1 用户端路由（routes/v4/diy.js — 实际 10 个端点）

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | /api/v4/diy/templates | 无 | 模板列表（仅 published + enabled） |
| GET | /api/v4/diy/templates/:id | 无 | 模板详情 |
| GET | /api/v4/diy/templates/:id/materials | 需登录 | 查 material_asset_types + 用户余额（钱包视角） |
| GET | /api/v4/diy/templates/:id/beads | 无 | 珠子素材列表（查 diy_materials） |
| GET | /api/v4/diy/material-groups | 无 | 材料分组列表（聚合 diy_materials 的 group_code） |
| GET | /api/v4/diy/works | 需登录 | 用户作品列表 |
| GET | /api/v4/diy/works/:id | 需登录 | 作品详情 |
| POST | /api/v4/diy/works | 需登录 | 保存作品（创建或更新草稿） |
| DELETE | /api/v4/diy/works/:id | 需登录 | 删除作品（仅 draft） |
| POST | /api/v4/diy/works/:id/confirm | 需登录 | 确认设计（draft→frozen） |
| POST | /api/v4/diy/works/:id/complete | 需登录 | 完成设计（frozen→completed） |
| POST | /api/v4/diy/works/:id/cancel | 需登录 | 取消设计（frozen→cancelled） |

路由特点：
- 使用 `require('../../services').getService('diy')` 延迟加载服务
- works 路由统一使用 `authenticateToken` 中间件 + `getAccountIdByUserId` 转换
- 所有写操作包裹在 `TransactionManager.execute()` 中
- confirm/complete/cancel 传递 `userId: req.user.user_id` 给服务层

### 5.2 管理端路由（routes/v4/console/diy/ — 4 个文件 14 个端点）

| 文件 | 端点数 | 覆盖功能 |
|---|---|---|
| templates.js | 6 | 模板列表/详情/创建/更新/状态变更/删除 |
| materials.js | 5 | 珠子素材列表/详情/创建/更新/删除 |
| works.js | 2 | 作品列表/详情（只读） |
| stats.js | 1 | DIY 统计数据 |

全部需要 role_level >= 60（管理员权限）。

### 5.3 DIYService.js 核心方法（实际代码审计）

**getTemplateMaterials(templateId, accountId)** — 查 `MaterialAssetType` + `AccountAssetBalance` + `MediaAttachment`（多态关联图片）
- 按 template.material_group_codes 筛选（空数组=全部）
- 批量查用户余额，批量查材料图片
- 返回：`{ asset_code, display_name, group_code, form, image_url, thumbnail_url, available_amount, frozen_amount }`

**getUserMaterials(templateId, params)** — 查 `DiyMaterial`
- 支持 group_code、diameter、keyword 筛选
- include MediaFile(as: image_media) + Category
- 返回 DiyMaterial 模型实例数组

**saveWork(accountId, data)** — 保存草稿
- 调用 `_validateDesignMaterials` 校验材料合法性
- 支持创建新作品和更新已有草稿
- 自动生成 work_code（OrderNoGenerator）

**confirmDesign(workId, accountId, options)** — ⚠️ 当前实现有问题
- 从 `work.total_cost`（数组）读取冻结明细
- 遍历 total_cost 逐项调用 `BalanceService.freeze({ user_id, asset_code, amount })`
- **问题**：不接收前端传入的 payments 参数，直接读 work.total_cost
- **问题**：total_cost 需要在 saveWork 时由前端传入，但 saveWork 直接存 `data.total_cost`，没有服务端校验价格

**completeDesign(workId, accountId, options)** — 从冻结扣减 + 铸造物品
- 遍历 total_cost 逐项 `BalanceService.settleFromFrozen`
- 调用 `ItemService.mintItem` 铸造 diy_product 实例
- 更新 work.item_id + status + completed_at

**cancelDesign(workId, accountId, options)** — 解冻
- 遍历 total_cost 逐项 `BalanceService.unfreeze`

**_validateDesignMaterials(template, designData)** — ⚠️ 当前实现有 bug
- 查的是 `MaterialAssetType`（虚拟资产表），不是 `DiyMaterial`（珠子表）
- 从 designData 中提取 `asset_code`（不是 `material_code`）
- 当 material_group_codes 为空数组时直接 return（跳过校验）
- **这意味着当前所有模板都不会执行材料校验**

### 5.4 BalanceService 关键方法签名（services/asset/BalanceService.js）

```javascript
BalanceService.freeze(params, options = {})
// params: { user_id, system_code, asset_code, amount, business_type, idempotency_key, meta }
// options: { transaction }
// ⚠️ 2026-01-05 治理决策：强制要求传入 transaction（requireTransaction 校验）
// ⚠️ 2026-04-07 确认：system_code 是必需参数（如 'diy_freeze'）

BalanceService.unfreeze(params, options = {})
BalanceService.settleFromFrozen(params, options = {})
BalanceService.getBalance(params, options = {})
BalanceService.getAllBalances(params, options = {})
```

全部是 static 方法，支持幂等性控制（idempotency_key），强制事务（2026-01-05 起 requireTransaction 校验）。

### 5.5 account_asset_balances 表结构

| 字段 | 类型 | 说明 |
|---|---|---|
| account_asset_balance_id | bigint PK | 主键 |
| account_id | bigint | 用户账户 ID |
| asset_code | varchar(50) | 资产编码（关联 material_asset_types） |
| available_amount | bigint | 可用余额 |
| frozen_amount | bigint | 冻结余额 |
| lottery_campaign_id | varchar(50) | 活动 ID（可选） |
| lottery_campaign_key | varchar(50) | 活动 key |

> 注意：余额是 bigint 整数，不是 decimal。星石价格在 diy_materials 中是 decimal(10,2)，冻结时需要处理精度转换。

## 六、关键发现和问题分析（基于代码审计和数据库验证）

### 后端数据库项目的问题

1. **confirmDesign 实现逻辑不完整**：它从 `work.total_cost` 读取冻结明细，但 total_cost 是在 saveWork 时由前端直接传入的 `data.total_cost`，后端没有校验价格是否正确。正确做法是 confirmDesign 时由后端根据 design_data 查 diy_materials 当前价格计算 total_cost，而不是信任前端传入的金额。
2. **_validateDesignMaterials 查错了表**：当前查的是 `MaterialAssetType`（虚拟资产），应该查 `DiyMaterial`（珠子商品）。而且当 material_group_codes 为空数组时直接跳过校验，导致当前所有模板都不会执行材料合法性校验。
3. **design_data 字段名混淆**：代码中 _validateDesignMaterials 提取的是 `b.asset_code`，但 design_data 存的应该是珠子的 material_code（来自 diy_materials），不是支付资产的 asset_code（来自 material_asset_types）。
4. **star_stone 的 budget_value_points = 0**：这意味着星石不能参与 budget_value_points 换算体系。星石是直接定价货币，换算公式需要特殊处理星石（直接 1:1 对应 diy_materials.price），而不是走 budget_value_points 除法。
5. **diy_materials.price 是 decimal(10,2)，但 account_asset_balances.available_amount 是 bigint**：冻结时需要处理精度转换（星石价格 6.50 → 冻结 7 还是 6？需要明确取整规则）。
6. **getTemplateMaterials 语义模糊**：方法名叫"获取模板材料"，但实际返回的是用户的虚拟资产余额（钱包），不是珠子材料。
7. **material_group_codes 全部为空**：7 个模板的 material_group_codes 都是 `[]`，没有限制可用材料分组。
8. **19/20 珠子缺图片**：只有 phantom_green_8mm 有图。
9. **5 条测试 works 数据脏**：使用了不存在的编码（JADE、AGATE、DIAMOND、red_shard）。
10. **diy_materials 表 DDL 中 price_asset_code 默认值是 'DIAMOND'**：历史遗留，虽然实际数据都是 star_stone，但新增珠子时如果不显式指定 price_asset_code，会默认为 DIAMOND。

### Web 管理后台前端的问题

- **管理端 DIY 功能已完整**：4 个页面（模板管理、素材管理、作品管理、槽位编辑器）+ 14 个接口全部实现
- **Konva 槽位编辑器已集成**：`diy-slot-editor.js`（17KB）实现了完整的画布编辑能力
- **图片上传已集成**：素材管理和模板管理都使用了 `imageUploadMixin`
- **API 层独立**：`admin/src/api/diy.js` 未在 index.js 中统一导出，各页面直接 import（这是正常的，不是问题）
- **管理端无需大改**：管理端操作的是 diy_materials（珠子商品）和 diy_templates（模板），这些都是正确的

### 微信小程序前端的问题

- **代码不在本仓库**：小程序前端是独立仓库，无法直接查看
- **需要对接的后端接口已存在**：用户端 12 个接口已定义在 routes/v4/diy.js
- **小程序需要适配后端字段名**：直接使用后端返回的字段名（material_code、display_name、diy_material_id 等），不做映射

### 后端已有的可复用能力

| 能力 | 服务/工具 | 说明 |
|---|---|---|
| 资产冻结/扣减/解冻 | BalanceService（static 方法） | 通用接口，所有 asset_code 走同一套，支持幂等性 |
| 物品铸造 | ItemService.mintItem | 三表模型双录（items + item_ledger + item_holds） |
| 事务管理 | TransactionManager.execute() | 统一事务包裹，自动 commit/rollback |
| 幂等性控制 | idempotency_key 唯一约束 | BalanceService 内置支持 |
| 统一响应格式 | ApiResponse | res.apiSuccess() / res.apiError() |
| 图片服务 | MediaService + ImageUrlHelper + MediaAttachment | Sealos 对象存储，多态关联 |
| 订单号生成 | OrderNoGenerator.generate(prefix, id, date) | 标准化编号（DT/DW 前缀） |
| 分布式锁 | UnifiedDistributedLock | Redis 分布式锁 |
| 用户ID转换 | DIYService.getAccountIdByUserId(userId) | user_id → account_id |

### 后端可扩展的点

- **diy_materials 表结构完整**：已有 material_code、material_name、display_name、group_code、diameter、shape、price、price_asset_code、stock、is_stackable、image_media_id、category_id、sort_order、meta 等字段，不需要加字段
- **diy_works 表结构完整**：已有 design_data(JSON)、total_cost(JSON)、item_id、idempotency_key、frozen_at、completed_at，不需要加字段
- **diy_templates 表结构完整**：已有 layout、bead_rules、sizing_rules、capacity_rules、material_group_codes、preview_media_id、base_image_media_id、meta，不需要加字段
- **BalanceService 完全通用**：freeze/unfreeze/settleFromFrozen 接受任意 asset_code，不需要改
- **getUserMaterials 已正确实现**：查 DiyMaterial 表，支持 group_code/diameter/keyword 筛选，include 图片和分类
- **getMaterialGroups 已正确实现**：聚合 diy_materials 的 group_code + count

## 七、需要拍板的决策点

1. **支付方式选择**：文档中设计了"纯星石 / 纯源晶 / 混合支付"三种模式。但真实数据显示只有 4 种资产有用户持有且可用于 DIY 支付（star_stone 43人、red_core_shard 11人、orange_core_shard 5人、red_core_gem 5人），积分（points）不可用于 DIY 支付。你是否要在第一版就支持混合支付？还是先只支持星石支付，后续再扩展？

2. **star_stone 的 budget_value_points = 0 如何处理**：真实数据库中星石的 budget_value_points 是 0，不是 100。这意味着换算公式 `N × budget_value_points ÷ star_stone_bvp` 会除以 0。需要决定：是把星石的 budget_value_points 改为一个合理值（比如 1），还是在换算逻辑中特殊处理星石（星石直接 1:1 对应 price，不走 budget_value_points 换算）？

3. **diy_materials.price 精度问题**：珠子价格是 decimal(10,2)（如 6.50 星石），但余额是 bigint 整数。冻结时 6.50 星石怎么处理？向上取整（7）还是向下取整（6）？还是要求所有珠子价格必须是整数？

4. **测试数据清理**：5 条 diy_works 全部是脏数据（使用不存在的编码），是否直接清理（DELETE）？

5. **珠子图片补齐**：19/20 珠子缺图片。这个由谁负责？是运营在管理后台上传，还是需要开发批量导入？

6. **design_data 中的字段名**：当前测试数据用的是 asset_code，但按照"珠子是商品、资产是货币"的模型，应该改为 material_code。确认改为 material_code？

7. **前端适配策略**：你说"直接修改前端代码使用后端的字段名"。后端 diy_materials 表的字段名是 diy_material_id、material_code、display_name、material_name、group_code、diameter、shape、price、price_asset_code。小程序前端直接用这些字段名，不做任何映射，对吗？

8. **getTemplateMaterials 接口语义**：当前这个接口返回的是用户虚拟资产余额（钱包），但名字叫"materials"容易混淆。是否改名为更清晰的语义，比如 `/api/v4/diy/payment-assets`？还是保持现有路径不变？

9. **price_asset_code 默认值修复**：diy_materials 表 DDL 中 price_asset_code 默认值是 'DIAMOND'（历史遗留），应通过迁移脚本移除默认值（NOT NULL，无默认值），新增珠子时必须显式指定 price_asset_code，为空直接报错

---

# 第二部分：双数据源架构决策与落地方案

## 解决什么问题

DIY 饰品设计引擎存在**双数据源矛盾**：用户端查的是 `material_asset_types`（虚拟资产体系），管理端操作的是 `diy_materials`（实物珠子商品表），两套数据完全不互通。

本文档基于 2026-04-02 对真实数据库和代码的全面审计，确认矛盾仍然存在，并给出最终架构决策。

---

## 一、问题现状（基于真实数据库验证）

### 1.1 两张表的数据

| 维度 | material_asset_types | diy_materials |
|---|---|---|
| 定位 | 全局虚拟资产（碎片/宝石/星石/积分） | DIY 实物珠子商品 |
| 数据量 | 16 种（含 currency/quota），可用于 DIY 支付的 12 种 | 20 种珠子商品 |
| 典型数据 | 红源晶碎片、蓝源晶、星石… | 巴西黄水晶 8mm、粉水晶 10mm… |
| 余额体系 | account_asset_balances（冻结/解冻/扣减） | 无（商品目录，不需要余额） |
| 图片 | 12/12 有图 | 1/20 有图（需补齐） |
| 定价 | 每种有 budget_value_points | 全部以 star_stone 定价（6~68 星石） |

### 1.2 代码中的三个材料查询方法

| 方法 | 查的表 | 路由 | 面向 |
|---|---|---|---|
| `getTemplateMaterials()` | material_asset_types + account_asset_balances | `GET /api/v4/diy/templates/:id/materials` | 用户端 |
| `getUserMaterials()` | diy_materials | `GET /api/v4/diy/templates/:id/beads` | 用户端 |
| `getAdminMaterialList()` | diy_materials | `GET /api/v4/console/diy/materials` | 管理端 |

### 1.3 现有 works 数据

5 条 diy_works 全部是 draft 状态，design_data 中使用的编码（JADE、AGATE、red_shard、DIAMOND）在两张表中都不存在。这些是测试数据，前端尚未对接真实材料。

### 1.4 group_code 有颜色对应但无外键

```
material_asset_types groups: blue, currency, green, orange, points, purple, red, yellow
diy_materials groups:        blue,           green, orange,          purple, red, yellow
```

颜色有交集，但没有外键或编码映射。

---

## 二、架构决策

### 2.1 核心业务规则（业主确认）

```
用户用 源晶/源晶碎片（可叠加资产）兑换 DIY 实物珠子
每颗珠子的定价货币由运营动态设定，可以是星石、源晶、源晶碎片中的任意一种
```

### 2.2 核心业务模型

```
diy_materials = 商品目录（用户选什么珠子）+ 定价（price + price_asset_code 由运营设定）
material_asset_types = 可叠加资产定义（源晶/碎片/星石，都是支付手段）
account_asset_balances = 用户持有各种可叠加资产的余额（钱包）
```

- `diy_materials` 是**唯一的珠子商品目录**，用户在设计器里只从这张表选珠子
- 每颗珠子有 `price`（数量）+ `price_asset_code`（定价货币），由运营在管理后台动态设定
- `price_asset_code` 可以是 `material_asset_types` 中任意一种已启用的可叠加资产（星石、源晶、碎片）
- 确认设计时，后端按每颗珠子的 `price_asset_code` 分组汇总，逐种资产调用 `BalanceService.freeze` 冻结

### 2.3 两张表的职责划分

| 表 | 职责 | 角色 |
|---|---|---|
| `diy_materials` | 珠子商品目录：名称、直径、形状、颜色、图片、定价（price + price_asset_code） | 商品 + 定价 |
| `material_asset_types` | 可叠加资产定义：源晶/碎片/星石的属性（form、budget_value_points） | 货币定义 |
| `account_asset_balances` | 用户持有各种可叠加资产的余额 | 钱包 |

### 2.4 支付方式

每颗珠子的定价货币由运营设定（`price_asset_code` 字段，varchar(50)，可以是任意 asset_code）。

**当前数据库现状**：20 颗珠子全部 `price_asset_code = star_stone`（运营目前统一用星石定价）。

**未来可能的场景**：

| 珠子 | price | price_asset_code | 含义 |
|---|---|---|---|
| 巴西黄水晶 8mm | 32 | star_stone | 32 星石 |
| 粉水晶 10mm | 5 | red_core_gem | 5 颗红源晶 |
| 紫水晶 12mm | 100 | purple_core_shard | 100 颗紫源晶碎片 |

**结算逻辑**：用户选好珠子后，后端根据 design_data 查每颗珠子的 `price` + `price_asset_code`，按 `price_asset_code` 分组汇总，逐种资产冻结。不需要换算，不需要 budget_value_points，直接扣对应资产。

示例：用户选了 10 颗巴西黄水晶（32 星石/颗）+ 8 颗粉水晶（5 红源晶/颗），后端冻结：
- star_stone: 320
- red_core_gem: 40

---

## 三、数据结构设计

### 3.1 design_data（设计数据）

只记录珠子本身，不记录支付方式（支付是确认设计时才决定的）：

```json
{
  "mode": "beading",
  "size": "M",
  "beads": [
    { "slot_index": 0, "material_code": "yellow_crystal_8mm" },
    { "slot_index": 1, "material_code": "pink_crystal_10mm" },
    { "slot_index": 2, "material_code": "amethyst_8mm" },
    { "slot_index": 3, "material_code": "blue_crystal_8mm" }
  ]
}
```

### 3.2 total_cost（确认设计时生成）

记录每颗珠子的价格快照 + 用户选择的支付明细：

```json
{
  "items": [
    { "material_code": "yellow_crystal_8mm", "quantity": 1, "unit_price": 32 },
    { "material_code": "pink_crystal_10mm", "quantity": 1, "unit_price": 28 },
    { "material_code": "amethyst_8mm", "quantity": 1, "unit_price": 25 },
    { "material_code": "blue_crystal_8mm", "quantity": 1, "unit_price": 30 }
  ],
  "total_price": 115,
  "price_unit": "star_stone",
  "payments": [
    { "asset_code": "star_stone", "amount": 50 },
    { "asset_code": "red_core_shard", "amount": 65 }
  ]
}
```

- `items` — 珠子明细 + 价格快照（防改价影响已有设计）
- `total_price` — 总价（星石计价）
- `payments` — 实际支付明细（可以是纯星石、纯源晶、或混合支付）
- payments 各项 amount 换算成星石等价后之和 = total_price

---

## 四、状态流转

### 4.1 保存草稿（saveWork）

只保存 design_data（珠子选择），不涉及支付。

### 4.2 确认设计（confirmDesign：draft → frozen）

前端提交 design_data + payments（用户选择的支付方式）：

```
Step 1: 根据 design_data 计算 total_price（查 diy_materials 当前价格）
Step 2: 校验 payments 总额 ≥ total_price（按 budget_value_points 换算）
Step 3: 遍历 payments，逐项 BalanceService.freeze(asset_code, amount)
Step 4: 生成 total_cost 快照，保存到 diy_works
```

### 4.3 完成设计（completeDesign：frozen → completed）

```
Step 1: 遍历 total_cost.payments，逐项 BalanceService.settleFromFrozen(asset_code, amount)
Step 2: ItemService.mintItem 铸造 diy_product 实例
```

### 4.4 取消设计（cancelDesign：frozen → cancelled）

```
Step 1: 遍历 total_cost.payments，逐项 BalanceService.unfreeze(asset_code, amount)
```

---

## 五、用户端接口设计

### 5.1 珠子商品列表（已实现）

`GET /api/v4/diy/templates/:id/beads` → 查 `diy_materials`

返回：珠子图片、名称、直径、形状、星石价格

### 5.2 用户资产余额（已实现）

`GET /api/v4/diy/templates/:id/materials` → 查 `material_asset_types` + `account_asset_balances`

返回：用户持有的各种资产余额（星石 N 个、红源晶碎片 N 个、蓝源晶 N 个…），供前端展示"你的钱包"

### 5.3 前端设计器 UI 逻辑

1. 用户从珠子列表选珠子放到槽位（数据来自 `/beads`）
2. 底部实时显示总价（星石计价）
3. 点击"确认设计"时弹出支付面板，展示用户钱包余额（数据来自 `/materials`）
4. 用户选择支付方式（纯星石 / 纯源晶 / 混合），前端计算 payments
5. 提交 confirm 请求，后端冻结对应资产

---

## 六、代码改动清单（基于实际代码审计）

### 6.1 需要改的（后端）

| 改动点 | 文件 | 说明 |
|---|---|---|
| confirmDesign | services/DIYService.js | 改为：接收 payments 参数，根据 design_data 查 diy_materials 当前价格计算 total_price，校验 payments 总额 ≥ total_price，逐项冻结。不再信任前端传入的 total_cost |
| completeDesign | services/DIYService.js | 从 total_cost.payments 逐项 settleFromFrozen（当前从 total_cost 数组读取，格式需要适配） |
| cancelDesign | services/DIYService.js | 从 total_cost.payments 逐项 unfreeze（同上） |
| _validateDesignMaterials | services/DIYService.js | **改为查 DiyMaterial 表**（当前错误地查 MaterialAssetType），校验 material_code 在 diy_materials 中存在且启用。即使 material_group_codes 为空也要校验 material_code 合法性 |
| saveWork | services/DIYService.js | design_data 格式适配（只存 material_code，不存 asset_code）。移除 total_cost 的前端直传，改为 confirmDesign 时服务端计算 |
| getTemplateMaterials | services/DIYService.js | 改路径为 /api/v4/diy/payment-assets，方法语义改为"获取 DIY 可用支付资产 + 用户余额" |
| 用户端路由 | routes/v4/diy.js | confirm 接口增加 payments 参数；新增 /payment-assets 路由；移除 /templates/:id/materials |
| 价格精度处理 | services/DIYService.js | 新增价格取整逻辑（diy_materials.price decimal → bigint 冻结金额） |
| price_asset_code 默认值 | 迁移脚本 | 移除 diy_materials 表 price_asset_code 的默认值（NOT NULL，无默认值），新增珠子时必须显式指定，为空报错 |

### 6.2 不需要改的

- `getUserMaterials()` — 已正确查 DiyMaterial 珠子列表，支持筛选
- `getMaterialGroups()` — 已正确聚合 diy_materials 的 group_code
- 管理端 CRUD（templates.js / materials.js / works.js / stats.js）— 已完整
- 管理端前端 4 个页面 — 已完整，不需要改
- BalanceService 冻结/扣减/解冻 — 通用接口，所有 asset_code 走同一套
- 表结构 — 不需要新建表，不需要加字段（total_cost 是 JSON 字段）
- ItemService.mintItem — 通用铸造接口，不需要改
- TransactionManager — 通用事务管理，不需要改

---

## 七、真实数据参考（2026-04-06 数据库实时查询）

### 7.1 可用支付资产（12 种碎片/宝石 + 星石，不含积分）

> ⚠️ **硬性规则**：`points`（积分）不可用于 DIY 支付。`budget_points`（预算积分）是内部运营字段，绝对不能暴露给任何用户。

| asset_code | 名称 | budget_value_points | 有用户持有 | 说明 |
|---|---|---|---|---|
| star_stone | 星石 | 0 | ✅ 43人，余额646,969 | 直接定价货币，不走 bvp 换算 |
| red_core_shard | 红源晶碎片 | 1 | ✅ 11人，余额470,025 | 最低价值源晶 |
| red_core_gem | 红源晶 | 50 | ✅ 5人，余额1,200 | |
| orange_core_shard | 橙源晶碎片 | 10 | ✅ 5人，余额3,000 | |
| orange_core_gem | 橙源晶 | 100 | ❌ 无人持有 | |
| yellow_core_shard | 黄源晶碎片 | 20 | ❌ 无人持有 | |
| yellow_core_gem | 黄源晶 | 200 | ❌ 无人持有 | |
| green_core_shard | 绿源晶碎片 | 40 | ❌ 无人持有 | |
| green_core_gem | 绿源晶 | 400 | ❌ 无人持有 | |
| blue_core_shard | 蓝源晶碎片 | 80 | ❌ 无人持有 | |
| blue_core_gem | 蓝源晶 | 800 | ❌ 无人持有 | |
| purple_core_shard | 紫源晶碎片 | 160 | ❌ 无人持有 | |
| purple_core_gem | 紫源晶 | 1600 | ❌ 无人持有 | 最高价值源晶 |

> 🚫 **排除**：`points`（积分，10人持有，余额129,021）— 不可用于 DIY 支付。`budget_points`（预算积分）— 内部字段，禁止暴露。

### 7.2 珠子商品（20 种，摘要）

| material_code | 名称 | 直径 | 星石价格 | 有图 |
|---|---|---|---|---|
| yellow_crystal_8mm | 巴西黄水晶 | 8mm | 32 | ❌ |
| yellow_crystal_10mm | 巴西黄水晶 | 10mm | 67 | ❌ |
| yellow_lemon_8mm | 透体柠檬黄水晶 | 8mm | 6 | ❌ |
| pink_crystal_8mm | 粉水晶 | 8mm | 15 | ❌ |
| pink_crystal_10mm | 粉水晶 | 10mm | 28 | ❌ |
| smoky_crystal_8mm | 茶水晶 | 8mm | 10 | ❌ |
| phantom_green_8mm | 绿幽灵水晶 | 8mm | 35 | ✅ |
| amethyst_8mm | 紫水晶 | 8mm | 25 | ❌ |
| blue_crystal_8mm | 海蓝宝 | 8mm | 30 | ❌ |
| clear_quartz_8mm | 白水晶 | 8mm | 8 | ❌ |

全部以 star_stone 定价，19/20 需要补图。

---

## 八、结算规则说明（无需换算，直接按 price_asset_code 扣减）

> 业务规则确认：每颗珠子的定价货币由运营动态设定（price_asset_code），不需要 budget_value_points 换算。

### 8.1 结算模型

```
每颗珠子有 price（数量）+ price_asset_code（定价货币）
确认设计时：按 price_asset_code 分组汇总 → 逐种资产调用 BalanceService.freeze
```

**不需要换算**。运营给珠子定价时已经决定了"这颗珠子值多少个什么资产"，后端直接按定价扣减，不做跨资产换算。

### 8.2 结算示例

假设运营设定了以下定价：

| 珠子 | price | price_asset_code |
|---|---|---|
| 巴西黄水晶 8mm | 32 | star_stone |
| 粉水晶 10mm | 5 | red_core_gem |
| 紫水晶 12mm | 100 | purple_core_shard |

用户选了 10 颗巴西黄水晶 + 4 颗粉水晶 + 4 颗紫水晶，后端计算：

| price_asset_code | 汇总 | 冻结调用 |
|---|---|---|
| star_stone | 10 × 32 = 320 | `BalanceService.freeze({ asset_code: 'star_stone', amount: 320 })` |
| red_core_gem | 4 × 5 = 20 | `BalanceService.freeze({ asset_code: 'red_core_gem', amount: 20 })` |
| purple_core_shard | 4 × 100 = 400 | `BalanceService.freeze({ asset_code: 'purple_core_shard', amount: 400 })` |

**没有溢价问题，没有换算精度问题，没有 budget_value_points 除以 0 的问题。**

### 8.3 当前数据库现状

当前 20 颗珠子全部 `price_asset_code = star_stone`，所以当前只会冻结星石。未来运营改了定价货币后，代码自动适配（因为是按 price_asset_code 动态分组的）。

---

## 九、待办事项

- [ ] 后端：confirmDesign 改为根据 design_data 查 diy_materials 的 price + price_asset_code，按 price_asset_code 分组汇总，逐种资产冻结
- [ ] 后端：completeDesign / cancelDesign 从 total_cost.payments 逐项结算/解冻
- [ ] 后端：_validateDesignMaterials 改查 DiyMaterial 表，校验 material_code 合法性
- [ ] 后端：saveWork 适配新 design_data 格式（只存 material_code，不存 total_cost）
- [ ] 后端：新增 /payment-assets 接口（返回用户可用支付资产余额）
- [ ] 后端：price_asset_code 移除默认值（NOT NULL，无默认值），新增珠子时必须显式指定，为空报错
- [ ] 数据：diy_materials 19 条珠子补齐图片
- [ ] 数据：清理 5 条测试 works
- [ ] 前端（小程序）：设计器从 /beads 接口加载珠子列表，直接用后端字段名
- [ ] 前端（小程序）：确认设计时展示用户持有的相关资产余额
- [ ] 前端（管理后台）：素材管理页 price_asset_code 移除硬编码默认值，改为必填下拉框（为空不允许提交），下拉选项从 material_asset_types 已启用资产动态加载

---

# 第三部分：6 大决策点分析与最终决策

## 决策点 1：支付方式 — 第一版就支持混合支付，还是先只支持星石？

### 行业怎么做的

**游戏公司（米哈游/网易/腾讯游戏）：**

- 原神、崩铁的锻造/合成系统：第一版就支持多币种。因为游戏内货币体系是核心玩法，限制支付方式等于砍掉玩法深度。
- 但它们的"多币种"本质上是固定配方（3个铁矿+1个煤=1个钢），不是用户自选支付方式。

**电商平台（美团/淘宝/京东）：**

- 下单时支持"余额+优惠券+积分抵扣"混合支付，第一版就做了。
- 但它们的混合支付是结算层的事，和商品选择完全解耦。

**小众平台（闲鱼/得物/Buff）：**

- 虚拟物品交易只支持单一货币（人民币/平台币），不搞混合支付。
- 简单直接，降低用户认知成本。

**活动策划/积分商城（有赞/微盟）：**

- 积分兑换商品，通常是"纯积分"或"积分+现金"两种模式。
- 第一版只做纯积分，验证跑通后再加混合支付。

### 你的项目实际情况

- 你有 12 种碎片/宝石 + 星石，但只有 4 种有用户持有且可用于 DIY 支付（star_stone 43人、red_core_shard 11人、orange_core_shard 5人、red_core_gem 5人）。积分（points）不可用于 DIY 支付，预算积分（budget_points）禁止暴露
- BalanceService.freeze/unfreeze/settleFromFrozen 已经是通用的，接受任意 asset_code
- 混合支付的后端复杂度不高（遍历 payments 数组逐项冻结），因为 BalanceService 已经抽象好了
- 混合支付的前端复杂度很高（用户要选择用哪种资产付多少，需要实时换算 UI）
- **star_stone 的 budget_value_points = 0**，星石是直接定价货币，不走 budget_value_points 换算

### ✅ 推荐：第一版就支持全部支付方式（纯星石 / 纯源晶 / 混合）

理由：

1. 你的 BalanceService 已经是通用的，后端改动量几乎一样 — 不管支持 1 种还是 13 种，都是遍历 payments 数组调 freeze
2. 如果第一版只支持星石，后面加混合支付时 design_data 和 total_cost 的 JSON 结构要改，前端也要改，等于返工
3. 项目没上线，没有兼容负担，一步到位成本最低
4. 前端复杂度可以通过默认推荐星石支付 + 高级选项展开混合支付来降低

---

## 决策点 2：测试数据清理

### 行业做法

所有公司在上线前都会清理测试数据，没有例外。区别只在于方式：

- **大公司**：通过迁移脚本清理，留审计记录
- **小公司**：直接 DELETE，快速干净

### ✅ 推荐：直接 DELETE，加一条迁移记录

理由：

1. 5 条数据全部是 account_id=5 的测试数据，编码（JADE/AGATE/DIAMOND/red_shard）在任何表中都不存在
2. 全部是 draft 状态，没有冻结过资产，没有关联物品
3. 项目没上线，不存在用户数据保护问题
4. 建议用 Sequelize 迁移脚本做，而不是手动 SQL，这样有记录可追溯

---

## 决策点 3：珠子图片补齐

### 行业做法

- **大公司**：运营在 CMS/管理后台上传，开发不碰内容数据
- **小公司**：开发写脚本批量导入初始数据，后续运营在管理后台维护
- **游戏公司**：美术出图 → 技术批量导入 → 运营在后台微调

### ✅ 推荐：运营在管理后台上传

理由：

1. 你的管理后台已经有完整的材料 CRUD（`PUT /api/v4/console/diy/materials/:id`），包含图片上传能力（image_media_id 字段 + MediaService）
2. Konva 编辑器已集成，管理端功能完整
3. 图片是运营内容，不应该硬编码在代码或迁移脚本里
4. 19 张图片手动上传工作量不大（半小时内完成）

---

## 决策点 4：design_data 字段名 — asset_code 改为 material_code

### 行业怎么命名的

**电商系统（淘宝/京东/有赞）：**

- 购物车里存的是 sku_id / product_id（商品标识），不是 payment_method（支付方式）
- 商品和支付完全分离

**游戏系统（原神/崩铁）：**

- 装备栏存的是 item_id（物品标识），不是 currency_code
- 合成配方里存的是 material_id（材料标识）

所有正规系统的共识：**设计数据（用户选了什么）和支付数据（用户怎么付钱）必须分离。**

### ✅ 推荐：改为 material_code，没有任何犹豫

理由：

1. asset_code 在你的系统中有明确含义 — 它是 material_asset_types 表的主键，代表虚拟资产（星石/碎片/宝石）
2. material_code 是 diy_materials 表的主键，代表珠子商品
3. design_data 存的是"用户选了哪些珠子"，用 material_code 语义完全正确
4. 现有 5 条测试数据反正要清理，不存在兼容问题
5. 如果不改，后续每个读 design_data 的人都会困惑"这个 asset_code 是支付资产还是珠子？"

---

## 决策点 5：前端直接用后端字段名，不做映射

### 行业怎么做的

**大公司（美团/阿里）：**

- 有 BFF 层（Backend For Frontend），后端字段名和前端字段名可以不同
- 但 BFF 层本身就是技术债务，很多团队在去 BFF 化

**中小公司 / 新项目：**

- 前端直接用后端字段名，零映射
- GraphQL 项目天然就是前端直接用后端 schema

**游戏公司：**

- 客户端直接用服务端协议字段名，不做映射
- 减少一层转换 = 减少一层 bug

**得物/Buff 等平台：**

- API 返回什么字段名，前端就用什么字段名

### ✅ 推荐：前端直接用后端字段名，零映射

理由：

1. 你的后端字段名已经很规范了：material_code、display_name、group_code、diameter、shape、price、price_asset_code — 语义清晰，命名一致
2. 映射层是纯粹的技术债务 — 每加一个字段要改两处（后端+映射），每改一个字段名要改三处（后端+映射+前端）
3. 项目没上线，小程序前端可以一次性对齐
4. diy_material_id 这个主键名前端也直接用，不要映射成 id — 因为你的系统有多种 ID（diy_template_id、diy_work_id），统一用全名避免混淆

---

## 决策点 6：getTemplateMaterials 接口路径改名

### 行业怎么设计 API 路径的

**RESTful 最佳实践（Google API Design Guide / Microsoft REST API Guidelines）：**

- 资源名必须准确反映返回内容
- `/users/123/orders` 返回的必须是订单，不能是用户的收藏夹

**大公司实际做法：**

- 支付宝：`/my/wallet`（钱包）、`/my/assets`（资产）
- 美团：`/user/balance`（余额）、`/user/coupons`（优惠券）
- 游戏：`/player/inventory`（背包）、`/player/currencies`（货币）

**你当前的问题：**

- `/api/v4/diy/templates/:id/materials` 返回的是用户虚拟资产余额（钱包），但路径暗示的是"模板的材料列表"
- `/api/v4/diy/templates/:id/beads` 返回的才是真正的珠子材料列表
- 两个接口都挂在 `templates/:id` 下，但"用户钱包"跟模板没有从属关系

### ✅ 推荐：改路径，但不是改成 /wallet

分析你的 API 体系，你已经有 `/api/v4/assets/balances` 这个资产余额查询接口。DIY 钱包本质上就是"筛选出可用于 DIY 支付的资产余额"。

推荐方案：

```
GET /api/v4/diy/payment-assets          → 返回可用于DIY支付的资产列表+用户余额
GET /api/v4/diy/templates/:id/beads     → 返回珠子商品列表（保持不变）
```

理由：

1. `payment-assets` 语义精确 — "可用于支付的资产"
2. 从 `templates/:id/` 下移出来，因为支付资产跟具体模板无关（所有模板都用同一套支付资产）
3. 保持和你现有 `/api/v4/assets/` 域的命名风格一致
4. 不叫 `/wallet` 是因为你的系统里"钱包"概念更大（包含积分、配额等），这里只是 DIY 可用的支付资产子集

---

## 总结决策表

| # | 决策点 | 推荐 | 核心理由 |
|---|---|---|---|
| 1 | 支付方式 | 第一版就支持全部（纯星石/纯源晶/混合） | BalanceService 已通用，后端改动量一样，一步到位避免返工 |
| 2 | 测试数据 | 直接 DELETE，用迁移脚本 | 全是脏数据，draft 状态，无关联 |
| 3 | 珠子图片 | 运营在管理后台上传 | 管理端 CRUD 已完整，19 张图半小时搞定 |
| 4 | design_data 字段名 | 改为 material_code | 商品和支付必须分离，语义正确，无兼容负担 |
| 5 | 前端字段映射 | 零映射，直接用后端字段名 | 减少技术债务，字段名已规范 |
| 6 | 接口路径 | 改为 `GET /api/v4/diy/payment-assets` | 语义精确，解除与模板的错误从属关系 |

这 6 个决策全部是从"长期维护成本最低、技术债务最少"的角度出发，且完全基于后端现有的技术体系（Sequelize + BalanceService + ApiResponse + TransactionManager）。

---

# 第四部分：基于真实代码和数据库的求证报告（微信小程序前端视角）

> 以下所有结论均来自对后端数据库真实数据、后端代码实际实现、Web 管理后台前端代码的直接检查，不引用任何历史报告或外部文档。

## 一、这份文档到底在解决什么问题

### 核心问题：DIY 模块存在"双数据源"架构缺陷

小程序用户在 DIY 设计器中选择珠子时，后端 `getTemplateMaterials()` 方法查询的是 `material_asset_types` 表（资产/货币定义表），而不是 `diy_materials` 表（珠子商品表）。这导致：

| 问题 | 具体表现 |
|---|---|
| 数据源错位 | 用户看到的"材料"是资产类型（红源晶碎片、星石等），不是珠子商品（巴西黄水晶 8mm、海蓝宝 10mm 等） |
| 定价逻辑混乱 | `diy_materials` 表有 `price` + `price_asset_code` 字段（每颗珠子定价），但 `getTemplateMaterials()` 根本没查这张表 |
| 冻结资产错误 | `confirmDesign()` 冻结的是 `material_asset_types` 中的资产余额，而不是按珠子商品价格扣减 `star_stone` |
| 商品与货币混为一谈 | 珠子是"商品"（有尺寸、形状、图片），资产是"货币"（用来支付的），两者不应混用 |

### 文档提出的方案 C 核心思路

- `diy_materials` 表 = 商品目录（珠子的物理属性 + 定价）
- `material_asset_types` 表 = 支付货币定义（星石、源晶等）
- 用户选珠子 → 查 `diy_materials`，支付 → 用 `price_asset_code` 指向的资产（当前全部是 `star_stone`）
- 商品和支付分离，各司其职

## 二、真实数据库现状（2026-04-06 实查，Node.js 连接真实数据库）

> 以下数据全部通过 Node.js + Sequelize 连接真实 MySQL 数据库（dbconn.sealosbja.site:42569/restaurant_points_dev）查询获得。

### 2.1 diy_templates（款式模板）— 7 条数据

| diy_template_id | template_code | display_name | status | is_enabled | material_group_codes |
|---|---|---|---|---|---|
| 1 | DT26033100000154 | 经典串珠手链 | published | ✅ | `[]`（空数组） |
| 2 | DT26033100000279 | 锁骨项链 | published | ✅ | `[]` |
| 3 | DT260331000003E9 | 心形吊坠 | published | ✅ | `[]` |
| 14 | DT260331000014A2 | 项链 | draft | ✅ | `[]` |
| 15 | DT26033100001514 | 项链 | draft | ✅ | `[]` |
| 16 | DT260331000016FC | 项链1 | draft | ✅ | `[]` |
| 17 | DT2603310000179B | 项链2 | draft | ✅ | `[]` |

**关键发现**：所有模板的 `material_group_codes` 都是空数组 `[]`。这意味着当前 `_validateDesignMaterials()` 直接 return 跳过校验，`getTemplateMaterials()` 中的 `group_code` 过滤条件不生效。

### 2.2 diy_materials（珠子商品）— 20 条数据

| material_code | display_name | material_name | group_code | diameter | price | price_asset_code |
|---|---|---|---|---|---|---|
| yellow_crystal_8mm | 巴西黄水晶 | 黄水晶 | yellow | 8.0 | 32 | star_stone |
| yellow_crystal_10mm | 巴西黄水晶 | 黄水晶 | yellow | 10.0 | 67 | star_stone |
| yellow_lemon_8mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 8.0 | 6 | star_stone |
| yellow_lemon_10mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 10.0 | 12 | star_stone |
| yellow_lemon_12mm | 透体柠檬黄水晶 | 黄水晶 | yellow | 12.0 | 19 | star_stone |
| yellow_topaz_8mm | 黄塔晶 | 黄水晶 | yellow | 8.0 | 6.5 | star_stone |
| pink_crystal_8mm | 粉水晶 | 粉水晶 | red | 8.0 | 15 | star_stone |
| pink_crystal_10mm | 粉水晶 | 粉水晶 | red | 10.0 | 28 | star_stone |
| pink_crystal_12mm | 粉水晶 | 粉水晶 | red | 12.0 | 45 | star_stone |
| smoky_crystal_8mm | 茶水晶 | 茶水晶 | orange | 8.0 | 10 | star_stone |
| smoky_crystal_10mm | 茶水晶 | 茶水晶 | orange | 10.0 | 22 | star_stone |
| phantom_green_8mm | 绿幽灵水晶 | 幽灵水晶 | green | 8.0 | 35 | star_stone |
| phantom_green_10mm | 绿幽灵水晶 | 幽灵水晶 | green | 10.0 | 58 | star_stone |
| amethyst_8mm | 紫水晶 | 紫水晶 | purple | 8.0 | 25 | star_stone |
| amethyst_10mm | 紫水晶 | 紫水晶 | purple | 10.0 | 42 | star_stone |
| amethyst_12mm | 紫水晶 | 紫水晶 | purple | 12.0 | 68 | star_stone |
| blue_crystal_8mm | 海蓝宝 | 蓝水晶 | blue | 8.0 | 30 | star_stone |
| blue_crystal_10mm | 海蓝宝 | 蓝水晶 | blue | 10.0 | 55 | star_stone |
| clear_quartz_8mm | 白水晶 | 白水晶 | yellow | 8.0 | 8 | star_stone |
| clear_quartz_10mm | 白水晶 | 白水晶 | yellow | 10.0 | 15 | star_stone |

**关键发现**：
- 所有珠子的 `price_asset_code` 都是 `star_stone`（星石支付）
- 价格范围 6～68 星石/颗，按材质和尺寸定价
- 表有 `material_name`（如"黄水晶"）和 `display_name`（如"巴西黄水晶"）两个名称字段
- 表 DDL 中 `price_asset_code` 默认值是 `'DIAMOND'`（历史遗留），但实际 20 条数据全部已设为 `star_stone`
- 19/20 缺图片（只有 phantom_green_8mm 有 image_media_id=31）

### 2.3 material_asset_types（资产类型定义）— 16 条数据

| asset_code | display_name | group_code | form | budget_value_points |
|---|---|---|---|---|
| star_stone | 星石 | currency | currency | **0** ⚠️ |
| red_core_shard | 红源晶碎片 | red | shard | 1 |
| red_core_gem | 红源晶 | red | gem | 50 |
| orange_core_shard | 橙源晶碎片 | orange | shard | 10 |
| orange_core_gem | 橙源晶 | orange | gem | 100 |
| yellow_core_shard | 黄源晶碎片 | yellow | shard | 20 |
| yellow_core_gem | 黄源晶 | yellow | gem | 200 |
| green_core_shard | 绿源晶碎片 | green | shard | 40 |
| green_core_gem | 绿源晶 | green | gem | 400 |
| blue_core_shard | 蓝源晶碎片 | blue | shard | 80 |
| blue_core_gem | 蓝源晶 | blue | gem | 800 |
| purple_core_shard | 紫源晶碎片 | purple | shard | 160 |
| purple_core_gem | 紫源晶 | purple | gem | 1600 |
| star_stone_quota | 星石配额 | currency | quota | null |
| points | 积分 | points | currency | 1 | 🚫 不可用于 DIY 支付 |
| budget_points | 预算积分 | points | quota | 1（已禁用） | 🔴 内部字段，绝对禁止暴露给用户 |

**⚠️ 关键纠正**：`star_stone` 的 `budget_value_points = 0`，不是之前文档中写的 10 或 100。星石是直接定价货币，不参与 budget_value_points 换算体系。

### 2.4 diy_works（用户作品）— 5 条测试数据

| diy_work_id | account_id | template_id | status | work_name | design_data 中的编码 | total_cost |
|---|---|---|---|---|---|---|
| 1 | 5 | 1 | draft | 翡翠手链 | JADE（不存在） | [] |
| 3 | 5 | 1 | draft | 我的设计 | AGATE（不存在） | [] |
| 6 | 5 | 1 | draft | 我的设计 | AGATE | [] |
| 7 | 5 | 1 | draft | 价格测试手链 | red_shard（不存在） | [{asset_code: "DIAMOND", amount: 180}] |
| 8 | 5 | 1 | draft | 混合价格测试 | red_shard + DIAMOND | [{asset_code: "DIAMOND", amount: 990}] |

**关键发现**：
- 5 条全部是 account_id=5 的测试数据，design_data 中使用的编码在两张表中都不存在
- total_cost 中引用的 DIAMOND 也不存在于 material_asset_types
- 所有作品都是 `draft` 状态，没有进入过 `frozen` 或 `completed` 流程
- 说明 `confirmDesign()` 冻结逻辑从未在生产数据上真正执行过

### 2.5 account_asset_balances（资产余额）— 真实持有统计

| asset_code | 持有人数 | 总可用余额 | 总冻结 |
|---|---|---|---|
| star_stone | 43 人 | 646,969 | 1,165 |
| red_core_shard | 11 人 | 470,025 | -3,700 |
| points | 10 人 | 129,021 | -8,570 |
| orange_core_shard | 5 人 | 3,000 | 0 |
| red_core_gem | 5 人 | 1,200 | 0 |

## 三、问题归属分析 — 后端 vs Web管理后台 vs 微信小程序

### 3.1 后端数据库项目的问题（6 个）

| # | 问题 | 当前代码位置 | 严重程度 |
|---|---|---|---|
| B1 | `getTemplateMaterials()` 查的是 material_asset_types（钱包），不是 diy_materials（珠子） | `services/DIYService.js` | 🔴 核心缺陷（语义错位） |
| B2 | `confirmDesign()` 从 work.total_cost 读取冻结明细，total_cost 是前端直传的，后端没有校验价格 | `services/DIYService.js` | 🔴 核心缺陷（安全漏洞） |
| B3 | `_validateDesignMaterials()` 查错表（查 MaterialAssetType 而非 DiyMaterial），且空 material_group_codes 直接跳过校验 | `services/DIYService.js` | 🔴 核心缺陷（校验失效） |
| B4 | `star_stone.budget_value_points = 0`，换算公式需要特殊处理星石 | `material_asset_types` 表数据 | 🟡 需要决策 |
| B5 | `diy_materials.price` 是 decimal(10,2)，但 `account_asset_balances.available_amount` 是 bigint，精度转换未处理 | 跨表类型不匹配 | 🟡 需要处理 |
| B6 | `diy_materials` 表 DDL 中 `price_asset_code` 默认值是 'DIAMOND'（历史遗留） | 表 DDL | 🟢 低优先级 |

### 3.2 Web 管理后台前端项目的问题（0 个核心问题）

| # | 现状 | 说明 |
|---|---|---|
| W1 | `diy-material-management.js` 直接使用后端字段名 | `price`、`price_asset_code`、`group_code`、`diameter` 等字段零映射，直接对齐后端 |
| W2 | API 调用路径正确 | `GET /api/v4/console/diy/materials` 对应后端 `routes/v4/console/diy/materials.js` |
| W3 | CRUD 功能完整 | 创建/编辑/删除珠子素材，字段完整传递 |
| W4 | Konva 槽位编辑器已集成 | `diy-slot-editor.js`（17KB）实现了完整的画布编辑能力 |
| W5 | 图片上传已集成 | 素材管理和模板管理都使用了 `imageUploadMixin` |

管理后台唯一可能需要改的：作品详情页展示 total_cost 格式变了（从数组变为对象），需要适配展示逻辑。

管理后台技术栈（Alpine.js + Tailwind CSS + Vite MPA）完全符合当前方案，不需要改技术栈。

**结论**：Web 管理后台前端已经正确对接了 `diy_materials` 表的 CRUD，不需要改动。管理员通过 Web 后台录入的珠子数据（20 条）已经在数据库中，字段完整。

### 3.3 微信小程序前端项目的问题（3 个）

| # | 问题 | 说明 |
|---|---|---|
| M1 | 小程序 DIY 设计器的材料选择 UI 需要对接正确的后端接口 | 珠子列表用 `GET /api/v4/diy/templates/:id/beads`（已存在），支付资产用 `GET /api/v4/diy/payment-assets`（需新增） |
| M2 | design_data 中的字段名需要改为 material_code | 当前测试数据用的是 asset_code，应改为 material_code |
| M3 | 确认设计时需要传 payments 参数 | `POST /api/v4/diy/works/:id/confirm` 需要传 `{ payments: [{ asset_code, amount }] }` |

## 四、基于后端现有技术体系的落地方案

### 4.1 后端技术栈可复用清单

| 组件 | 可复用性 | 说明 |
|---|---|---|
| `BalanceService.freeze/unfreeze/settleFromFrozen` | ✅ 完全复用 | 冻结→结算链路成熟，static 方法，支持幂等性（idempotency_key），强制事务 |
| `TransactionManager.execute()` | ✅ 完全复用 | 事务管理器，所有状态流转已在用 |
| `ApiResponse` 中间件 | ✅ 完全复用 | 统一响应格式 `{ success, code, message, data, timestamp, version, request_id }` |
| `DiyMaterial` 模型 | ✅ 完全复用 | 已有完整的 Sequelize 模型定义，字段齐全（material_code, material_name, display_name, group_code, diameter, shape, price, price_asset_code, stock, is_stackable, image_media_id, category_id, sort_order, meta） |
| `DiyWork` 模型 | ✅ 完全复用 | `total_cost` 字段是 JSON 类型，格式可调整 |
| `DiyTemplate` 模型 | ✅ 完全复用 | layout, bead_rules, sizing_rules, capacity_rules, material_group_codes 全部是 JSON 字段 |
| `OrderNoGenerator` | ✅ 完全复用 | 生成业务单号（DT/DW 前缀） |
| `ItemService.mintItem()` | ✅ 完全复用 | 铸造 DIY 成品物品（三表模型双录） |
| `authenticateToken` 中间件 | ✅ 完全复用 | JWT 认证 |
| `MediaAttachment` 多态关联 | ✅ 完全复用 | 珠子图片已通过此机制管理 |
| `ImageUrlHelper.getImageUrl()` | ✅ 完全复用 | Sealos 对象存储 URL 生成 |
| `UnifiedDistributedLock` | ✅ 完全复用 | Redis 分布式锁（防并发冻结） |
| `getUserMaterials()` | ✅ 完全复用 | 已正确查 DiyMaterial 表，支持 group_code/diameter/keyword 筛选 |
| `getMaterialGroups()` | ✅ 完全复用 | 已正确聚合 diy_materials 的 group_code + count |

### 4.2 后端技术栈需要改动的点

| 改动点 | 说明 |
|---|---|
| `DIYService.confirmDesign()` | 重写：接收 payments 参数，服务端计算 total_price，校验换算，逐项冻结 |
| `DIYService._validateDesignMaterials()` | 修复：改查 DiyMaterial 表，校验 material_code 合法性 |
| `DIYService.saveWork()` | 适配：design_data 用 material_code，移除 total_cost 前端直传 |
| `routes/v4/diy.js` | 新增 /payment-assets 路由，confirm 接口增加 payments 参数 |
| 价格精度处理 | 新增 decimal → bigint 取整逻辑 |

### 4.3 Web 管理后台前端技术栈兼容性

| 组件 | 兼容性 | 说明 |
|---|---|---|
| Alpine.js 3.x | ✅ 无需改动 | 管理后台的 DIY 材料管理页面已正确对接 `diy_materials` CRUD |
| Tailwind CSS 3.x | ✅ 无需改动 | 样式层不受影响 |
| Vite 6 MPA 构建 | ✅ 无需改动 | 页面入口不变 |
| `src/api/diy.js` | ✅ 无需改动 | 管理端 API 封装已正确指向 `/api/v4/console/diy/materials/*` |
| `src/api/base.js` (fetch 封装) | ✅ 无需改动 | 基础请求层不受影响 |
| Konva 槽位编辑器 | ✅ 无需改动 | `diy-slot-editor.js` 操作的是模板 layout，不涉及支付逻辑 |
| 图片上传 | ✅ 无需改动 | `imageUploadMixin` 已集成 |

**结论**：Web 管理后台前端项目几乎不需要改动。唯一可能需要改的是作品详情页展示 total_cost 格式变了（从数组变为对象）。

## 五、执行步骤（基于实际代码状态的改动计划）

### 步骤 0：数据清理

```sql
-- 清理脏测试数据（5 条 works 全部是不存在编码的测试数据）
DELETE FROM diy_works WHERE diy_work_id IN (1, 3, 6, 7, 8);

-- 移除 diy_materials 表 price_asset_code 默认值（NOT NULL，无默认值，新增时必须显式指定）
ALTER TABLE diy_materials ALTER COLUMN price_asset_code DROP DEFAULT;
```

### 步骤 1：修复 `_validateDesignMaterials()`（后端）

**当前代码**（错误）：查 MaterialAssetType 表，空 material_group_codes 直接 return 跳过校验

**目标代码**：查 DiyMaterial 表，校验 material_code 存在且 is_enabled = true，校验 diameter 在模板 bead_rules.allowed_diameters 范围内

### 步骤 2：修复 `saveWork()`（后端）

- design_data 中每个珠子用 `material_code`（不是 `asset_code`）
- 移除 total_cost 的前端直传（saveWork 只存 design_data，不存 total_cost）

### 步骤 3：重写 `confirmDesign()` 冻结逻辑（后端，核心改动）

**当前逻辑**（错误）：从 work.total_cost 读取冻结明细（前端直传，未校验），遍历 total_cost 逐项冻结

**目标逻辑**：
```
Step 1: 根据 design_data 中的 material_code 批量查 diy_materials 当前价格
Step 2: 计算 total_price_star_stone = sum(每颗珠子的 price)
Step 3: 接收前端传入的 payments: [{ asset_code, amount }]
Step 4: 校验 payments 总等价 ≥ total_price_star_stone
  - star_stone: amount 直接等于星石数（bvp=0，不走换算）
  - 源晶: amount × budget_value_points = 星石等价
Step 5: 遍历 payments，逐项 BalanceService.freeze
Step 6: 生成 total_cost 快照，保存到 diy_works
```

**total_cost 新格式**：
```json
{
  "total_price_star_stone": 576,
  "payments": [
    { "asset_code": "star_stone", "amount": 500 },
    { "asset_code": "red_core_shard", "amount": 76 }
  ],
  "price_snapshot": [
    { "material_code": "yellow_crystal_8mm", "count": 18, "unit_price": 32, "subtotal": 576 }
  ]
}
```

### 步骤 4：适配 `completeDesign()` 和 `cancelDesign()`（后端）

- 从 `work.total_cost.payments` 读取冻结明细
- completeDesign：逐项 `settleFromFrozen` + `mintItem`
- cancelDesign：逐项 `unfreeze`

### 步骤 5：路由调整（后端）

- `POST /api/v4/diy/works/:id/confirm` 接收 `{ payments: [{ asset_code, amount }] }`
- 新增 `GET /api/v4/diy/payment-assets`（需登录，返回用户可用支付资产 + 余额）
- 移除或重命名 `GET /api/v4/diy/templates/:id/materials` → `/api/v4/diy/payment-assets`

### 步骤 6：精度处理（后端）

新增 decimal → bigint 取整逻辑：diy_materials.price 6.50 → 冻结 7 星石（Math.ceil）

### 步骤 7：微信小程序前端适配

| 改动项 | 说明 |
|---|---|
| 珠子列表 | `GET /api/v4/diy/templates/:id/beads`，直接使用 material_code、display_name、diameter、price 等字段 |
| 支付资产 | `GET /api/v4/diy/payment-assets`，获取用户可用支付资产余额 |
| design_data | 用 material_code（不是 asset_code） |
| 确认设计 | 传 `{ payments: [{ asset_code, amount }] }` |
| 字段映射 | 零映射，直接用后端字段名 |

## 六、需要你拍板的决策

### 决策 1：支付方式选择

**现状**：只有 4 种资产有用户持有且可用于 DIY 支付（star_stone 43人、red_core_shard 11人、orange_core_shard 5人、red_core_gem 5人）。积分不可用于 DIY 支付

**选项**：
- **A. 第一版只支持星石支付**：简化前端 UI，后端只冻结 star_stone
- **B. 第一版就支持全部支付方式（纯星石 / 纯源晶 / 混合）**：后端改动量几乎一样（遍历 payments 数组调 freeze），前端复杂度高

**建议**：选 B。BalanceService 已经是通用的，后端改动量一样。项目没上线，一步到位成本最低。

### 决策 2：star_stone 的 budget_value_points = 0 如何处理

**选项**：
- **A. 把 star_stone 的 budget_value_points 改为 1**：统一走 budget_value_points 换算
- **B. 在换算逻辑中特殊处理星石**：星石直接 1:1 对应 price，不走 budget_value_points 换算

**建议**：选 B。星石是直接定价货币，改 budget_value_points 可能影响其他使用 budget_value_points 的业务逻辑。

### 决策 3：价格精度取整规则

**现状**：diy_materials.price 是 decimal(10,2)（如 6.50），account_asset_balances.available_amount 是 bigint

**选项**：
- **A. 向上取整（Math.ceil）**：6.50 → 冻结 7 星石（用户多付 0.50）
- **B. 要求所有珠子价格必须是整数**：管理后台录入时校验
- **C. 余额改为支持小数**：改动太大，不推荐

**建议**：选 B。在管理后台素材管理页面增加价格整数校验，同时后端 saveWork 时也校验。当前 20 条数据中只有 yellow_topaz_8mm（6.50）不是整数。

### 决策 4：是否允许积分（points）用于 DIY 支付（已确认 ✅ 不允许）

**结论**：积分（points）不可用于 DIY 支付。DIY 支付仅限星石（star_stone）和源晶体系（碎片/宝石）。`budget_points`（预算积分）是内部运营字段，绝对不能暴露给任何用户。后端需要在 `confirmDesign()` 和管理端材料编辑接口中校验 `price_asset_code` 白名单。

### 决策 5：溢价支付是否允许（已决策 ✅ — 不涉及，因为采用"商品绑定定价货币"模型）

**原问题**：高价值源晶（如蓝源晶 bvp=800）用来买低价珠子（32 星石）会严重溢价。

**已消解**：本文档最终采用"商品绑定定价货币"模型（第二部分 §二 架构决策），每颗珠子的 `price_asset_code` 由运营动态设定（当前 20 颗全部是 `star_stone`）。后端按 `price_asset_code` 分组冻结，不做跨资产换算，不存在"用蓝源晶买星石定价的珠子"这种场景 — 除非运营把某颗珠子的 `price_asset_code` 改为 `blue_core_gem`，此时价格就是以蓝源晶为单位的整数，也没有溢价问题。

**结论**：溢价问题在"商品绑定定价货币"模型下不存在。无需额外处理。

### 决策 6：测试数据清理

**建议**：直接 DELETE。5 条数据全部是脏数据，编码不存在，全部 draft 状态。

### 决策 7：`GET /api/v4/diy/templates/:id/materials` 路径处理

**选项**：
- **A. 保留路径，改底层实现**：改为返回 diy_materials 珠子列表（和 /beads 功能重复）
- **B. 改为 /api/v4/diy/payment-assets**：语义精确，返回用户可用支付资产 + 余额
- **C. 直接删除**：珠子列表用 /beads，支付资产用 /payment-assets

**建议**：选 C。/beads 已经返回珠子列表，/payment-assets 返回支付资产，/materials 语义模糊且功能重复。

## 七、总结

| 项目 | 需要改动 | 改动量 |
|---|---|---|
| 后端数据库项目 | ✅ 是（核心） | 重写 confirmDesign + 修复 _validateDesignMaterials + 修复 saveWork + 新增 /payment-assets 路由 + 精度处理 + 数据清理 |
| Web 管理后台前端 | ⚠️ 极小 | 作品详情页 total_cost 展示格式适配（可选：价格整数校验） |
| 微信小程序前端 | ✅ 是（适配） | 珠子列表字段适配 + 支付资产接口对接 + design_data 字段名改为 material_code + confirm 传 payments |

改动的本质：后端把"查错表"改为"查对表"，小程序前端把"显示资产类型"改为"显示珠子商品"。Web 管理后台不动。

---

# 第五部分：可叠加资产支付 DIY 实物饰品 — 可行性验证（2026-04-06 真实数据库验证）

> 本章节基于连接真实数据库（dbconn.sealosbja.site:42569/restaurant_points_dev）查询验证，不引用任何历史报告。

## 一、验证问题

**能否用可叠加资产（星石、源晶、源晶碎片）支付 DIY 中的实物饰品？**

## 二、真实数据库验证结果

### 2.1 支付引擎能力（已就绪 ✅）

`DIYService.js` 已实现完整的 freeze→settle→mint 链路：

| 方法 | 功能 | 状态 |
|---|---|---|
| `confirmDesign` | 遍历 `total_cost[]`，逐项调用 `BalanceService.freeze()` 冻结资产 | ✅ 已实现 |
| `completeDesign` | 逐项调用 `BalanceService.settleFromFrozen()` 扣减，调用 `ItemService.mintItem()` 铸造 item | ✅ 已实现 |
| `cancelDesign` | 逐项调用 `BalanceService.unfreeze()` 释放冻结 | ✅ 已实现 |

支付介质是 `total_cost` 数组，格式 `[{asset_code, amount}]`，BalanceService 对所有 asset_code 走同一套逻辑，不区分资产类型。

### 2.2 实物珠子商品数据（已就绪 ✅）

`diy_materials` 表 20 条启用数据，全部 `star_stone` 定价：

| 珠子 | 规格 | 价格（星石） | group_code |
|---|---|---|---|
| 巴西黄水晶 | 8mm/10mm | 32/67 | yellow |
| 透体柠檬黄水晶 | 8mm/10mm/12mm | 6/12/19 | yellow |
| 黄塔晶 | 8mm | 6.5 | yellow |
| 粉水晶 | 8mm/10mm/12mm | 15/28/45 | red |
| 茶水晶 | 8mm/10mm | 10/22 | orange |
| 绿幽灵水晶 | 8mm/10mm | 35/58 | green |
| 紫水晶 | 8mm/10mm/12mm | 25/42/68 | purple |
| 海蓝宝 | 8mm/10mm | 30/55 | blue |
| 白水晶 | 8mm/10mm | 8/15 | yellow |

### 2.3 可叠加资产持有情况（流动性充足 ✅）

数据库实查 `account_asset_balances`：

| asset_code | 持有人数 | 总可用余额 |
|---|---|---|
| star_stone | 多人 | 最高单人 393,355 |
| red_core_shard | 多人 | 最高单人 267,065 |
| 其他源晶/碎片 | 均有持有 | 余额充足 |

### 2.4 DIY 材料 group_code 与可叠加资产 group_code 完全一致

| group_code | diy_materials 有 | material_asset_types 有 |
|---|---|---|
| red | ✅ | ✅ |
| orange | ✅ | ✅ |
| yellow | ✅ | ✅ |
| green | ✅ | ✅ |
| blue | ✅ | ✅ |
| purple | ✅ | ✅ |

这意味着运营可以把珠子的 `price_asset_code` 设为对应颜色的源晶（如绿幽灵用 `green_core_gem` 定价），实现「同色源晶兑换同色珠子」的业务逻辑。

## 三、核心问题定位：商品与货币混为一谈

当前代码存在两张「材料表」，但只接入了一张：

| | `material_asset_types`（货币表） | `diy_materials`（商品表） |
|---|---|---|
| 是什么 | 虚拟可叠加资产（绿源晶、红源晶碎片…） | 实物珠子（巴西黄水晶、粉水晶…） |
| 接入设计流程 | ✅ 被 `getTemplateMaterials` 查询 | ❌ 未接入 |
| 接入支付流程 | ✅ 被 `confirmDesign` 冻结 | ❌ 未接入 |
| 有定价 | 无单价概念，直接扣数量 | 有（price + price_asset_code） |

**问题本质**：代码把虚拟资产当珠子用了。用户在小程序设计手链时，往上面放的「珠子」是绿源晶、红源晶碎片这些虚拟资产本身，而不是巴西黄水晶、粉水晶这些实物珠子。`diy_materials` 表虽然数据已录好 20 条，但是个孤岛——没有任何 service 方法在支付链路里读它。

### 具体场景说明

以「巴西红水晶定价 50 绿源晶」为例：

**当前代码的执行路径（错误）**：
1. 用户设计时看到的是「绿源晶」（来自 `material_asset_types`）
2. 放到手链上的「珠子」就是绿源晶本身
3. `total_cost` = `[{asset_code: 'green_core_gem', amount: 5}]`（前端传入，后端不校验）
4. 冻结 5 个绿源晶 → 扣减 → 铸造 item
5. 用户拿到的是一个「由绿源晶组成的虚拟手链」，不是实物

**文档方案修复后的执行路径（正确）**：
1. 用户设计时看到的是「巴西红水晶 8mm」（来自 `diy_materials`，有图片、尺寸、形状）
2. 放到手链上的珠子记录 `material_code: 'pink_crystal_8mm'`
3. 确认设计时，后端查 `diy_materials` 算出总价：3 颗 × 50 绿源晶 = 150 绿源晶
4. 后端生成 `total_cost = [{asset_code: 'green_core_gem', amount: 150}]`
5. 冻结 150 绿源晶 → 扣减 → 铸造 item
6. 用户拿到的是一个「由巴西红水晶组成的实物手链」

## 四、结论

### 可行性判定：✅ 可行，支付引擎已就绪，缺的是计价桥接层

| 能力 | 状态 | 说明 |
|---|---|---|
| BalanceService freeze/settle/unfreeze | ✅ 已就绪 | 对所有 asset_code 通用，不需要改 |
| ItemService.mintItem | ✅ 已就绪 | 通用铸造接口，不需要改 |
| diy_materials 商品数据 | ✅ 已就绪 | 20 条珠子，定价完整 |
| 用户可叠加资产余额 | ✅ 充足 | star_stone/源晶/碎片均有持有 |
| 计价桥接（珠子→资产价格） | ❌ 未接通 | 本文档 B1-B4 修复后即可打通 |
| 实物履约（收货地址+物流） | ❌ 未建设 | 见第六部分方案 |

### 修复优先级

本文档第六章「代码改动清单」中的 B1-B4 修复完成后，「用可叠加资产支付 DIY 实物饰品」的核心链路即可跑通。实物履约方案见第六部分。

---

# 第六部分：实物履约链路设计方案（2026-04-06 决策）

> 基于真实数据库验证 + 行业方案调研，已决策采用方案 A。

## 一、现有履约能力盘点（真实数据库验证）

`exchange_records` 表 + `CoreService.js` 已实现完整的订单状态机：

```
pending → approved（管理员审批）→ shipped（管理员发货）→ received（用户确认收货）→ completed
```

| 能力 | 状态 | 代码位置 |
|---|---|---|
| 订单状态机（9 种状态 + 合法转换白名单） | ✅ 已实现 | `services/exchange/CoreService.js` 第 46 行 |
| 管理员审批通过 | ✅ 已实现 | `routes/v4/console/exchange/orders.js` `PATCH /:order_no/approve` |
| 管理员标记发货（填快递公司+单号） | ✅ 已实现 | `routes/v4/console/exchange/orders.js` `PATCH /:order_no/ship` |
| 快递公司字典（顺丰/圆通/中通/申通/韵达/京东/EMS/德邦） | ✅ 已实现 | `services/shipping/ShippingTrackService.js` |
| 快递轨迹查询（快递100 主 + 快递鸟备，Redis 缓存） | ✅ 已实现 | `services/shipping/ShippingTrackService.js` |
| 物流字段（shipping_company / shipping_no / shipped_at） | ✅ 表里有 | `exchange_records` 表 |
| 用户确认收货 | ✅ 已实现 | `CoreService.js` |
| 7 天自动确认收货定时任务 | ✅ 已实现 | `jobs/daily-exchange-order-auto-confirm.js` |
| 退款（approved/shipped 阶段可退） | ✅ 已实现 | `CoreService.js` |
| 订单事件日志 | ✅ 已实现 | `exchange_order_events` 表 |

### 唯一缺失：收货地址

`exchange_records` 表没有收货地址字段。119 张表中也没有 `user_addresses` 表。现有积分商城兑换实物商品（衣服 stock=42, sold=8）也没有收货地址能力。

## 二、行业方案调研

| 方案 | 谁在用 | 设计 | 优点 | 缺点 |
|---|---|---|---|---|
| A. 独立地址表 + 订单地址快照 | 阿里/美团/京东/拼多多 | `user_addresses` 表管理地址，订单 JSON 快照冻结 | 全平台复用、地址簿体验好、快照不可变 | 多一张表 |
| B. 订单内嵌地址字段 | 游戏积分兑换/活动抽奖/小公司 | 订单表直接加 receiver_name/phone/address | 开发最快、零额外表 | 每次重填、无法复用、后续要建表等于返工 |
| C. 订单只存 address_id 外键 | 教科书方案（无人实际使用） | 订单表外键指向地址表 | 无冗余 | 用户改地址后历史订单地址跟着变，发货对不上 |
| D. JSON 内嵌在订单 metadata | 闲鱼早期/小众二手平台 | 订单 meta JSON 里嵌 receiver 对象 | 不改表结构 | 不可查询、不可索引、无地址管理能力 |

### 关键行业共识

- 大厂全部采用「独立地址表 + 订单快照」，原因：快照不可变（用户改地址不影响已下单订单）、分库分表不需要跨表 JOIN
- 游戏/活动公司用方案 B 是因为兑换频率极低且不需要地址复用
- 方案 C 无人使用，因为地址可变导致历史订单数据不一致
- 微信小程序有 `wx.chooseAddress()` API，用户一键授权获取地址，配合独立地址表体验最好

## 三、决策：采用方案 A（独立地址表 + 订单地址快照）

### 决策理由

1. **全平台复用**：不只 DIY 需要地址，积分商城兑换实物也需要。建一次，DIY + exchange 全部复用
2. **微信地址 API**：`wx.chooseAddress()` 返回的就是拆开的省/市/区/详细地址，直接入库
3. **长期维护成本低**：方案 B 看似省事，但后续加地址簿功能时还是要建表，等于返工
4. **和现有架构一致**：`exchange_records.item_snapshot` 已经是 JSON 快照模式，地址快照同理

### 3.1 新建 `user_addresses` 表

| 字段 | 类型 | 说明 |
|---|---|---|
| address_id | bigint PK AUTO_INCREMENT | 主键 |
| user_id | int NOT NULL | 用户 ID（关联 users 表） |
| receiver_name | varchar(50) NOT NULL | 收货人姓名 |
| receiver_phone | varchar(20) NOT NULL | 收货人手机号 |
| province | varchar(50) NOT NULL | 省 |
| city | varchar(50) NOT NULL | 市 |
| district | varchar(50) NOT NULL | 区 |
| detail_address | varchar(500) NOT NULL | 详细地址 |
| is_default | tinyint(1) NOT NULL DEFAULT 0 | 是否默认地址 |
| created_at | datetime NOT NULL | |
| updated_at | datetime NOT NULL | |

索引：`idx_user_id (user_id)` — 按用户查地址列表

约束：每用户最多 10 个地址（应用层校验）

省/市/区拆开存的原因：
- 微信 `wx.chooseAddress()` 返回格式就是拆开的
- 未来可做区域限制发货（某些地区不发货、某些地区只发顺丰）
- 管理后台可按省/市统计订单分布

### 3.2 `exchange_records` 表加 1 个 JSON 字段

```sql
ALTER TABLE exchange_records 
  ADD COLUMN address_snapshot JSON NULL COMMENT '下单时收货地址快照（不可变）';
```

快照内容格式：

```json
{
  "address_id": 1,
  "receiver_name": "张三",
  "receiver_phone": "138xxxx1234",
  "province": "广东省",
  "city": "深圳市",
  "district": "南山区",
  "detail_address": "科技园xxx号",
  "snapshot_at": "2026-04-06T20:00:00+08:00"
}
```

为什么用 JSON 快照而不是 3 个 varchar 字段：
- 和现有 `item_snapshot` 设计风格一致
- 快照是不可变的历史记录，不需要单独查询或建索引
- 地址结构变化时（比如加邮编）不需要 ALTER TABLE

### 3.3 完整履约流程

```
用户设计完成
  → 选择/填写收货地址（微信 wx.chooseAddress 或从地址簿选择）
  → 地址存入 user_addresses 表
  → confirmDesign：冻结资产
  → completeDesign：扣减资产 + 铸造 item + 创建 exchange_record（写入 address_snapshot）
  → 管理员在后台审批（PATCH /approve）
  → 管理员填快递单号发货（PATCH /ship）
  → 用户确认收货 / 7天自动确认
  → completed
```

### 3.4 代码改动清单

| 改动点 | 类型 | 说明 |
|---|---|---|
| 新建 `models/UserAddress.js` | 新增 | Sequelize 模型，字段如上 |
| 新建 `routes/v4/user/addresses.js` | 新增 | 地址 CRUD（增删改查 + 设默认），逻辑简单不需要 service 层 |
| `exchange_records` 加 `address_snapshot` 字段 | ALTER | 1 条 SQL |
| `models/ExchangeRecord.js` 加 `address_snapshot` 字段定义 | 修改 | 加 1 个 DataTypes.JSON 字段 |
| `DIYService.completeDesign` 末尾创建 exchange_record | 修改 | 铸造 item 后，创建 exchange_record（source='diy'，写入 address_snapshot） |
| `routes/v4/diy.js` confirm 接口增加 `address_id` 参数 | 修改 | 前端传入地址 ID，后端查 user_addresses 写入快照 |
| 管理端发货/物流/确认收货 | 0 改动 | 全部复用现有 exchange 订单管理 |

### 3.5 不需要做的事

- ❌ 不需要新建 `diy_orders` 表 — 复用 `exchange_records`，`source='diy'` 区分
- ❌ 不需要新建物流表 — `exchange_records` 已有 shipping_company / shipping_no / shipped_at
- ❌ 不需要新建 service — 地址 CRUD 逻辑简单，路由里直接写；订单创建复用 CoreService
- ❌ 不需要改管理后台 — 管理员看到的就是 exchange 订单，审批/发货/退款流程不变

---

## 第六部分：问题归属分类 + 技术栈对齐 + 可复用分析 + 执行步骤

> 2026-04-06 基于 Node.js 连接真实数据库（dbconn.sealosbja.site:42569）+ 代码审计。不引用任何历史报告。

### 1. 三端问题归属分类

#### 1.1 后端数据库项目问题（7 个，全部需要后端修复）

| # | 问题 | 严重度 | 代码位置 | 说明 |
|---|---|---|---|---|
| B1 | `getTemplateMaterials()` 查 `MaterialAssetType`（货币表）而非 `DiyMaterial`（珠子商品表） | 🔴 核心 | `services/DIYService.js:281` | 用户看到"红源晶碎片"而不是"巴西黄水晶 8mm" |
| B2 | `confirmDesign()` 直接读 `work.total_cost` 冻结，后端不校验价格 | 🔴 核心 | `services/DIYService.js:591` | 前端可传 0 元，安全漏洞 |
| B3 | `_validateDesignMaterials()` 查错表 + 空数组跳过校验 | 🔴 核心 | `services/DIYService.js:1314-1318` | 7 个模板全部 `material_group_codes=[]`，校验永远不执行 |
| B4 | `diy_materials.price` 是 `DECIMAL(10,2)` 但代码用 `parseInt` 截断 | 🟡 中等 | `services/DIYService.js` | `yellow_topaz_8mm` 价格 6.50 会变成 6 |
| B5 | `exchange_records` 表没有收货地址字段，`user_addresses` 表不存在 | 🔴 核心 | 数据库 | 实物履约无法进行 |
| B6 | `design_data` 实际结构是 `[{size, asset_code, slot_index}]` 数组，但 `_validateDesignMaterials` 期望 `{mode:'beading', beads:[...]}` | 🟡 中等 | `services/DIYService.js:1326-1333` | 结构不匹配，校验逻辑无法正确提取 `usedCodes` |
| B7 | `completeDesign()` 铸造 item 写入 `items` 表，但 `items.source` 没有 `'diy'` 枚举值 | 🟡 中等 | `models/Item.js` | 需确认 `source` 字段是否支持 `'diy'` |

#### 1.2 Web 管理后台前端项目问题（2 个）

| # | 问题 | 严重度 | 代码位置 | 说明 |
|---|---|---|---|---|
| W1 | 管理端 DIY 材料管理页面（`admin/src/api/diy.js`）已有 CRUD 接口封装，但后端 `console/diy/materials.js` 的材料列表返回的是 `DiyMaterial` 模型数据，前端需确认字段名是否对齐 | 🟢 低 | `admin/src/api/diy.js` | 后端已有 5 个材料管理接口（GET列表/GET详情/POST创建/PUT更新/DELETE删除） |
| W2 | 管理端需要新增「DIY 订单管理」入口，筛选 `exchange_records` 中 `source='diy'` 的记录 | 🟡 中等 | `admin/src/modules/` | 复用现有 exchange 订单管理页面，加一个 source 筛选条件即可 |

#### 1.3 微信小程序前端项目问题（3 个）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| M1 | 小程序 DIY 设计器提交的 `design_data` 结构需要与后端约定统一 | 🔴 核心 | 当前实际数据是 `[{size, asset_code, slot_index}]`，后端校验期望 `{mode:'beading', beads:[...]}`。**以后端定义为准，小程序适配后端** |
| M2 | 小程序需要新增收货地址选择/填写页面 | 🔴 核心 | 可用微信 `wx.chooseAddress` API 或自建地址管理页面 |
| M3 | 小程序材料列表页需要适配后端新的 `getTemplateMaterials` 返回字段（修复后返回 `DiyMaterial` 字段而非 `MaterialAssetType` 字段） | 🟡 中等 | 直接使用后端字段名 `material_code`、`display_name`、`diameter`、`price`、`price_asset_code`，不做映射 |

### 2. 三端技术栈对齐分析

#### 2.1 后端数据库项目技术栈（权威基准）

| 层级 | 技术 | 版本 |
|---|---|---|
| 运行时 | Node.js | v18+ |
| Web 框架 | Express | ^4.21.0 |
| ORM | Sequelize | ^6.37.3 |
| 数据库 | MySQL 8.0（Sealos 云） | mysql2 ^3.11.0 |
| 缓存 | Redis | ioredis ^5.4.1 |
| 实时通信 | Socket.IO | ^4.7.5 |
| 认证 | JWT | jsonwebtoken ^9.0.2 |
| 校验 | Joi | ^17.11.0 |
| 日志 | Winston | ^3.14.2 |
| 进程管理 | PM2 | ecosystem.config.js |
| 部署 | Sealos 云平台 | — |

| 架构特征 | 说明 |
|---|---|
| 模型数量 | 119 个 Sequelize 模型 |
| 服务数量 | 102 个服务类 |
| API 版本 | `/api/v4/` 统一前缀 |
| 路由结构 | 用户端 `/api/v4/diy/*`（12 个接口），管理端 `/api/v4/console/diy/*`（14 个接口） |
| 响应格式 | `res.apiSuccess(data, message)` / `res.apiError(message, code, details, status)` |
| 事务管理 | `TransactionManager` 工具类 |
| 资产系统 | `BalanceService.freeze/deduct/unfreeze` 三阶段 |
| 铸造系统 | `items` 表（`item_id`, `tracking_code`, `owner_account_id`, `source`, `source_ref_id`） |
| 兑换系统 | `exchange_records` 表（已有 `source` 字段，当前值全部为 `'exchange'`，25 条记录） |

#### 2.2 Web 管理后台前端技术栈

| 层级 | 技术 | 版本 |
|---|---|---|
| 构建工具 | Vite | ^6.4.1 |
| JS 框架 | Alpine.js | ^3.15.4（轻量响应式，非 Vue/React） |
| CSS 框架 | Tailwind CSS | ^3.4.19 |
| Canvas 编辑器 | Konva | ^10.2.3（DIY 槽位编辑器） |
| 图表 | ECharts | ^6.0.0 |
| 富文本 | WangEditor | ^5.1.23 |
| WebSocket | socket.io-client | ^4.8.3 |
| 导出 | xlsx ^0.18.5, jspdf ^4.2.0, html2canvas ^1.4.1 |

| 架构特征 | 说明 |
|---|---|
| 页面模式 | MPA（59 个 HTML 入口页） |
| API 模块 | 36 个 API 文件（`admin/src/api/`），含 `diy.js` |
| 请求封装 | `admin/src/api/base.js` 统一 `request()` + `buildURL()` |
| 状态管理 | Alpine.js `x-data` 组件级状态 |
| DIY 管理 | 已有模板 CRUD + 材料 CRUD + 作品列表 + 统计面板 |

#### 2.3 微信小程序前端技术栈

| 层级 | 技术 |
|---|---|
| 框架 | 微信原生小程序（WXML + WXSS + JS） |
| 请求 | `wx.request` 封装 |
| 地址 | `wx.chooseAddress`（微信内置） |
| Canvas | 微信 Canvas 2D API |

### 3. 后端现有可复用能力分析

#### 3.1 可直接复用（0 改动）

| 能力 | 后端位置 | 说明 |
|---|---|---|
| 资产冻结/扣减/解冻 | `services/BalanceService.js` | `freeze()` / `deduct()` / `unfreeze()` 三阶段，支持 `idempotency_key` 幂等 |
| 事务管理 | `utils/TransactionManager.js` | 统一事务包装，自动回滚 |
| JWT 认证中间件 | `middleware/auth.js` | `authenticateToken` 已在所有 DIY 路由使用 |
| 统一响应格式 | `middleware/apiResponse.js` | `res.apiSuccess()` / `res.apiError()` |
| 管理端 exchange 订单审批/发货 | `routes/v4/console/exchange/` | 审批、发货、退款流程完整 |
| 物流字段 | `exchange_records` 表 | `shipping_company` / `shipping_company_name` / `shipping_no` / `shipped_at` 已存在 |
| 管理端 DIY 模板 CRUD | `routes/v4/console/diy/templates.js` | 6 个接口（列表/详情/创建/更新/状态/删除） |
| 管理端 DIY 材料 CRUD | `routes/v4/console/diy/materials.js` | 5 个接口（列表/详情/创建/更新/删除） |
| 管理端 DIY 作品查看 | `routes/v4/console/diy/works.js` | 2 个接口（列表/详情） |
| 管理端 DIY 统计 | `routes/v4/console/diy/stats.js` | 1 个接口 |
| 用户端 DIY 路由框架 | `routes/v4/diy.js` | 12 个接口已定义（模板/作品/确认/完成/取消） |

#### 3.2 需要修改（改动量小）

| 能力 | 改动内容 | 工作量 |
|---|---|---|
| `DIYService.getTemplateMaterials()` | 查询从 `MaterialAssetType` 改为 `DiyMaterial`，JOIN `media_attachments` 取图片 | 改 1 个方法，约 30 行 |
| `DIYService.confirmDesign()` | 后端根据 `design_data` 查 `diy_materials` 计算价格，不信任前端 `total_cost`。校验 `price_asset_code` 不为 `'points'` 或 `'budget_points'` | 改 1 个方法，约 50 行 |
| `DIYService._validateDesignMaterials()` | 查询改为 `DiyMaterial`，按 `material_code` 校验 | 改 1 个方法，约 20 行 |
| `DIYService` 价格计算 | `parseFloat` 替代 `parseInt`，保留 DECIMAL 精度 | 全局搜索替换 |
| `models/ExchangeRecord.js` | 加 `address_snapshot` JSON 字段 | 加 1 个字段定义 |
| `items.source` 枚举 | 确认是否需要加 `'diy'` 值 | 检查 1 个模型 |

#### 3.3 需要新建（改动量中等）

| 能力 | 新建内容 | 工作量 |
|---|---|---|
| `user_addresses` 表 + 模型 | Sequelize 模型 + migration | 1 个模型文件 + 1 个迁移文件 |
| 地址 CRUD 路由 | `routes/v4/user/addresses.js`（增删改查 + 设默认） | 1 个路由文件，约 100 行 |
| `exchange_records.address_snapshot` 列 | ALTER TABLE 加 JSON 列 | 1 条 SQL |
| `DIYService.completeDesign()` 末尾创建 exchange_record | 铸造 item 后写入 exchange_record（source='diy'） | 改 1 个方法，约 20 行 |

#### 3.4 不需要做的事（明确排除）

- ❌ 不需要新建 `diy_orders` 表 — 复用 `exchange_records`，`source='diy'` 区分
- ❌ 不需要新建物流表 — `exchange_records` 已有 shipping 字段
- ❌ 不需要新建 DIY 专用 service — 地址 CRUD 逻辑简单，路由里直接写
- ❌ 不需要新建管理端 DIY 订单页面 — 复用 exchange 订单管理，加 source 筛选
- ❌ 不需要做字段映射层 — 前端直接使用后端字段名

### 4. 执行步骤（按优先级排序）

#### 第一步：修复后端核心缺陷（B1-B4）— 纯后端改动

**改动文件**：`services/DIYService.js`

1. `getTemplateMaterials()`：查询从 `MaterialAssetType.findAll()` 改为 `DiyMaterial.findAll()`，返回字段改为 `material_code`、`display_name`、`material_name`、`group_code`、`diameter`、`price`、`price_asset_code`、`image_url`（JOIN media_attachments）
2. `confirmDesign()`：不再读 `work.total_cost`，改为遍历 `design_data` 中每个 slot 的 `asset_code`（即 `material_code`），查 `diy_materials` 获取 `price` + `price_asset_code`，后端计算应冻结金额
3. `_validateDesignMaterials()`：查询改为 `DiyMaterial`，按 `material_code` 校验
4. 全局 `parseInt(price)` 改为 `parseFloat(price)` 或直接用 Sequelize 返回的 DECIMAL 值

#### 第二步：统一 design_data 结构约定 — 后端定义，前端适配

**后端定义的标准结构**（以后端为准）：

```json
{
  "mode": "beading",
  "beads": [
    { "slot_index": 0, "material_code": "yellow_crystal_8mm", "size": 8 },
    { "slot_index": 1, "material_code": "pink_crystal_10mm", "size": 10 }
  ]
}
```

- 后端 `_validateDesignMaterials` 按此结构解析
- 小程序前端提交时按此结构组装
- 现有 5 条 `diy_works` 数据（全部 `total_cost=[]`，status=draft）可以清理或迁移

#### 第三步：新建收货地址能力（B5）— 后端 + 小程序

**后端**：
1. 新建 `models/UserAddress.js`（Sequelize 模型）
2. 新建 `migrations/xxx-create-user-addresses.js`
3. 新建 `routes/v4/user/addresses.js`（CRUD + 设默认）
4. `exchange_records` 加 `address_snapshot` JSON 列（ALTER TABLE）
5. `models/ExchangeRecord.js` 加 `address_snapshot` 字段定义

**小程序**：
1. 新增地址选择页面（可用 `wx.chooseAddress` 或自建）
2. confirm 接口传入 `address_id`

#### 第四步：打通实物履约链路 — 后端改动

1. `DIYService.completeDesign()` 末尾：铸造 item 后创建 `exchange_record`（`source='diy'`，写入 `address_snapshot`）
2. 管理端 exchange 订单列表加 `source` 筛选（Web 前端改动：加一个下拉筛选项）

### 5. Web 管理后台前端兼容性分析

| 检查项 | 结果 | 说明 |
|---|---|---|
| API 请求封装 | ✅ 兼容 | `admin/src/api/base.js` 的 `request()` 已对齐后端 `/api/v4/` 前缀 |
| DIY 模板管理 | ✅ 已有 | `admin/src/api/diy.js` 已封装 `getTemplateList`、`createTemplate`、`updateTemplate` 等 |
| DIY 材料管理 | ✅ 已有 | 同上，已封装材料 CRUD |
| DIY 作品查看 | ✅ 已有 | 已封装 `getWorkList`、`getWorkDetail` |
| DIY 统计面板 | ✅ 已有 | 已封装 `getStats` |
| Exchange 订单管理 | ✅ 已有 | `admin/src/api/exchange-item/` 目录已有完整订单管理 |
| 字段名对齐 | ✅ 已对齐 | `admin/src/api/diy.js` 注释中明确列出后端返回字段（`diy_template_id`、`template_code`、`display_name` 等），与后端模型一致 |
| Konva 编辑器 | ✅ 已有 | `konva ^10.2.3` 用于 DIY 槽位编辑器 |
| 需要新增 | 🟡 1 处 | exchange 订单列表页加 `source` 筛选下拉框（区分普通兑换和 DIY 订单） |

**结论**：Web 管理后台前端与后端技术栈完全对齐，DIY 相关功能已有完整的 API 封装和页面框架。唯一需要新增的是 exchange 订单列表的 source 筛选。

### 6. 需要你拍板的决策项（含行业方案对比）

#### 决策 1：design_data 结构标准化

**现状**：
- 后端模型注释定义的标准结构：`{ mode: 'beading', beads: [{ position, asset_code, diameter }] }`（见 `models/DiyWork.js` 第 112 行）
- 数据库中 5 条 `diy_works` 实际存的是：`[{size, asset_code, slot_index}]` 扁平数组
- 后端 `_validateDesignMaterials` 按 `{mode, beads}` 解析
- 5 条数据全部 account_id=5、status=draft、total_cost=[]，asset_code 用的是 `'JADE'`/`'DIAMOND'`（不存在于 diy_materials 表）

**行业方案对比**：

| 方案 | 谁在用 | 结构 | 优点 | 缺点 |
|---|---|---|---|---|
| **嵌套对象 + mode 字段** | 美团（外卖定制餐）、腾讯（QQ秀装扮）、网易（阴阳师御魂搭配） | `{mode, items:[{slot, code, attrs}]}` | 一个字段支持多种模式，扩展性强，后端校验逻辑清晰 | 结构稍复杂 |
| **扁平数组** | 小型电商、早期 MVP | `[{slot, code, size}]` | 简单直接 | 无法区分模式，扩展时要改结构，破坏兼容性 |
| **独立关联表** | 阿里（淘宝定制商品）、大型游戏（魔兽世界装备宝石镶嵌） | `design_slots` 表，每个槽位一行 | 可索引查询、支持复杂约束 | 过度设计，你只有 18 个槽位，JSON 足够 |
| **配置化 DSL** | Figma、Canva | `{version, layers:[...]}` | 极致灵活 | 你不是设计工具，不需要这个复杂度 |

**最适合你的项目**：嵌套对象 + mode 字段。理由：
1. **你的后端模型已经这样定义了**（`models/DiyWork.js` 第 112 行），不需要改后端
2. 18 个槽位用 JSON 完全够，不需要独立关联表
3. `mode` 字段让你未来可以加 `'slots'`（镶嵌模式，模型注释第 113 行已预留）、`'weaving'`（编织）等，零成本扩展
4. 项目未上线，5 条测试数据用的是不存在的 asset_code（`JADE`/`DIAMOND`），没有保留价值

**结论**：选 `{mode, beads}` 结构。这不是"选择"，而是"对齐" — 你的后端模型定义本来就是这个结构，只是小程序前端没按规范提交。

#### 决策 2：支付方式范围

**现状**：20 颗珠子全部 `price_asset_code='star_stone'`。`BalanceService.freeze()` 已支持任意 asset_code。`items.source` 是 `varchar(20)` 不是枚举，天然支持 `'diy'`。`exchange_records.source` 也是 `varchar(20)`。

> ⚠️ **硬性约束**：`price_asset_code` 不允许设为 `'points'` 或 `'budget_points'`。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 优点 | 缺点 |
|---|---|---|---|---|
| **单一货币** | 拼多多（仅人民币）、早期小游戏 | 所有商品只用一种货币定价 | 最简单 | 运营灵活性为零 |
| **商品绑定定价货币** | 腾讯（Q币/点券分开定价）、米哈游（原神：原石/摩拉/各种素材分别定价）、网易（阴阳师：勾玉/体力/金币） | 每个商品有 `price_currency` 字段，结算时按该货币扣减 | 运营可灵活调整，代码不需要改 | 需要白名单防止设错货币 |
| **统一换算** | 部分二手平台（闲鱼信用分换算） | 所有货币换算成统一基准再扣减 | 用户理解简单 | 换算精度问题，你的 star_stone bvp=0 无法换算 |
| **购物车多币种混合支付** | 美团（余额+红包+优惠券混合）、京东（京豆+现金混合） | 一笔订单可以用多种货币组合支付 | 最灵活 | 实现复杂，对账困难 |

**最适合你的项目**：商品绑定定价货币（方案 B）。理由：
1. **你的数据库已经这样设计了** — `diy_materials.price_asset_code` 字段就是"商品绑定定价货币"
2. `BalanceService.freeze(user_id, asset_code, amount)` 已经支持任意 asset_code，**零额外代码**
3. 运营可以在管理后台把绿幽灵珠子的 `price_asset_code` 改为 `green_core_gem`，实现"同色源晶兑换同色珠子"
4. 加一个白名单校验（排除 points/budget_points）就够了，约 5 行代码
5. 你的 `star_stone.budget_value_points = 0`，统一换算方案根本不可行

**结论**：选 B（商品绑定定价货币）。同样不是"选择"，而是"对齐" — 你的数据库和 BalanceService 已经是这个架构。

#### 决策 3：收货地址方案

**现状**：`user_addresses` 表不存在（119 张表中没有），`exchange_records` 没有地址字段。现有 25 条 exchange_records 全部 source='exchange'（虚拟商品兑换，不需要地址）。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 优点 | 缺点 |
|---|---|---|---|---|
| **独立地址表 + 订单快照** | 淘宝、京东、美团、拼多多、所有正规电商 | `user_addresses` 存用户地址簿，下单时快照到订单的 `address_snapshot` JSON 字段 | 用户可管理多个地址、设默认；订单地址不受后续修改影响；全平台复用 | 需要建表 |
| **仅微信地址 API** | 微信小商店、极简小程序 | 每次下单调 `wx.chooseAddress`，地址直接写入订单 | 不需要建表 | 用户每次都要重新填/选；无法设默认；Web 端无法用；不可复用 |
| **订单内嵌地址** | 部分小型二手平台 | 不建地址表，地址字段直接放在订单表 | 最简单 | 用户无法管理地址；每次重新填写 |
| **第三方地址服务** | 大型物流平台（顺丰、菜鸟） | 调用第三方地址解析/存储 API | 地址标准化 | 依赖外部服务，你的体量不需要 |

**最适合你的项目**：独立地址表 + 订单快照（方案 A）。理由：
1. **长期复用**：不只 DIY 需要地址，你的积分商城兑换实物（exchange_items 表有 42 件衣服 stock=42, sold=8）也需要地址能力。建一次，DIY + exchange 全部复用
2. **你的 exchange_records 已有物流字段**（shipping_company / shipping_no / shipped_at），只差地址
3. `address_snapshot` JSON 快照是电商行业标准做法 — 用户下单后修改地址不影响已有订单
4. 你的后端是 Sequelize + MySQL，建一张表 + 一个 migration 的成本极低（1 个模型文件 + 1 个迁移文件）
5. 微信 `wx.chooseAddress` 只能在小程序端用，你的 Web 管理后台无法调用

**结论**：选 A（独立地址表 + 订单快照）。这是电商行业的标准做法，从淘宝到拼多多到美团全部这样做，没有例外。

#### 决策 4：现有测试数据处理

**现状**：5 条 `diy_works`，全部 account_id=5、status=draft、created_at=2026-03-31（同一天创建）。

| diy_work_id | work_name | total_cost | design_data 中的 asset_code | 问题 |
|---|---|---|---|---|
| 1 | 翡翠手链 | `[]` | `JADE`（不存在于 diy_materials） | 无效 |
| 3 | 我的设计 | `[]` | `JADE` | 无效 |
| 6 | 我的设计 | `[]` | `JADE` | 无效 |
| 7 | 价格测试手链 | `[{amount:180, asset_code:'DIAMOND'}]` | 未查 | `DIAMOND` 不存在 |
| 8 | 混合价格测试 | `[{amount:990, asset_code:'DIAMOND'}]` | 未查 | `DIAMOND` 不存在 |

**行业做法**：

| 场景 | 做法 |
|---|---|
| 项目未上线 | 直接 DELETE，干净利落。淘宝/美团/腾讯在上线前都会清理测试数据 |
| 项目已上线但数据量小 | 写迁移脚本转换格式，保留用户数据 |
| 项目已上线且数据量大 | 双写过渡期 + 灰度迁移 |

**结论**：直接 DELETE。理由：
1. 项目未上线，没有真实用户数据
2. 5 条数据全部是同一个 account_id=5 的测试数据
3. asset_code 用的是 `JADE`/`DIAMOND`，在 `diy_materials` 表中根本不存在
4. total_cost 要么为空要么引用不存在的资产
5. design_data 结构与目标格式不一致

清理 SQL：`DELETE FROM diy_works WHERE diy_work_id IN (1, 3, 6, 7, 8);`

#### 决策 5：积分（points）不可用于 DIY 支付（已确认 ✅）

**结论**：积分（points）不允许用于 DIY 支付。DIY 支付仅限星石（star_stone）和源晶体系（碎片/宝石）。后端需要在 `confirmDesign()` 中校验：`diy_materials.price_asset_code` 不能是 `'points'` 或 `'budget_points'`，管理端材料编辑也需要限制 `price_asset_code` 的可选范围。

> ⚠️ **安全红线**：`budget_points`（预算积分）是内部运营字段，绝对不能暴露给任何用户（包括小程序端和 Web 管理后台普通管理员）。所有面向用户的 API 响应中必须过滤掉 `budget_points` 相关数据。

---

# 第七部分：三端完整审计补充（2026-04-07 基于真实数据库 + 后端代码 + Web 前端项目审计）

> 本部分基于对真实数据库、后端全部代码、Web 管理后台前端项目的完整审计，补充文档中缺失的关键信息。

## 一、项目三端技术栈全景

### 1.1 后端（本仓库 — 权威基准）

| 类别 | 技术栈 | 版本 |
|---|---|---|
| 运行时 | Node.js | ≥20.18 |
| Web 框架 | Express | ^4.21.0 |
| ORM | Sequelize + sequelize-cli | ^6.37.3 / ^6.6.2 |
| 数据库驱动 | mysql2 | ^3.11.0 |
| 缓存 | ioredis | ^5.4.1 |
| 实时通信 | Socket.IO | ^4.8（服务端 ^4.7.5） |
| 进程管理 | PM2 | ecosystem.config.js |
| 认证 | JWT（jsonwebtoken ^9.0.2） | 双 Token：Access 7d + Refresh 7d |
| 对象存储 | Sealos（@aws-sdk/client-s3） | — |
| 校验 | Joi | ^17.11.0 |
| 日志 | Winston | ^3.14.2 |
| 安全 | helmet + cors + express-rate-limit + bcryptjs | — |

| 架构指标 | 数值 |
|---|---|
| Sequelize 模型 | 119 个（`models/` 目录） |
| Service 服务类 | 102 个（`services/` 目录） |
| 路由文件 | 193 个（`routes/` 目录） |
| API 前缀 | 统一 `/api/v4/` |
| 响应格式 | `ApiResponse` 中间件统一注入 `{ success, code, message, data, timestamp, version, request_id }` |
| 事务管理 | `TransactionManager.execute()` 统一管理 |
| 幂等性 | `business_id` / `idempotency_key` 唯一约束 |
| 账本体系 | Account → AccountAssetBalance → AssetTransaction（统一账本三表） |
| 物品体系 | Item（缓存层）+ ItemLedger（真相层）+ ItemHold（锁定层）三表模型 |
| 数据库配置 | `timezone: +08:00`, `charset: utf8mb4`, `underscored: true`, `freezeTableName: true` |
| 连接池 | `max=40, min=5, acquire=10s, idle=60s` |

### 1.2 Web 管理后台前端（本仓库 `admin/` 目录）

| 类别 | 技术栈 | 版本 |
|---|---|---|
| 构建工具 | Vite + vite-plugin-ejs | ^6.4.1 |
| JS 框架 | Alpine.js | ^3.15.4（轻量级响应式，非 Vue/React） |
| CSS 框架 | Tailwind CSS | ^3.4.19 |
| 画布库 | Konva | ^10.2.3（DIY 槽位编辑器） |
| 图表 | ECharts | ^6.0.0 |
| 拖拽 | SortableJS | ^1.15.7 |
| 截图 | html2canvas | ^1.4.1 |
| WebSocket | socket.io-client | ^4.8.3 |
| 导出 | xlsx ^0.18.5 + jsPDF ^4.2.0 | — |

| 架构指标 | 数值 |
|---|---|
| 页面模式 | MPA（多页应用），59 个 HTML 入口页 |
| API 模块文件 | 36 个（`admin/src/api/` 目录） |
| 请求封装 | `admin/src/api/base.js` 统一 `request()` + `buildURL()` |
| 状态管理 | Alpine.js `x-data` 组件级状态 |
| 开发端口 | 5173，proxy 代理 `/api` → `localhost:3000` |
| DIY 管理页面 | 4 个 HTML + 4 个 Alpine.js 模块（模板/材料/作品/槽位编辑器） |
| DIY API 封装 | `admin/src/api/diy.js`（17 个函数，对应 14 个管理端接口） |

### 1.3 微信小程序前端（独立仓库 — 不在本仓库中）

- **代码位置**：独立仓库，当前环境无法访问代码
- **本仓库中的小程序支持证据**：
  - `utils/platformDetector.js` 有完整的微信小程序请求识别（Referer `servicewechat.com`）
  - 平台枚举包含 `wechat_mp`
  - `.env` 中有 `WX_APPID`、`WX_SECRET` 配置
- **技术栈**（根据后端对接情况推断）：微信原生小程序（WXML + WXSS + JS），使用 `wx.request` 封装请求，`wx.chooseAddress` 获取收货地址，微信 Canvas 2D API 渲染设计器

---

## 二、问题归属分类（后端 / Web 前端 / 小程序前端）

> 文档之前主要列了后端问题。以下按三端分类，补充 Web 前端和小程序前端各自的问题。

### 2.1 后端数据库项目的问题（10 个）

| # | 问题 | 严重度 | 代码/数据库位置 |
|---|---|---|---|
| B1 | `getTemplateMaterials()` 查 `MaterialAssetType`（货币表）不是 `DiyMaterial`（珠子商品表），导致小程序用户看到"红源晶碎片"而不是"巴西黄水晶 8mm" | 🔴 核心 | `services/DIYService.js:281/302` |
| B2 | `confirmDesign()` 从 `work.total_cost` 直接读冻结明细，这个值是前端传入的，后端没有校验价格（安全漏洞：前端可传 0 元） | 🔴 核心 | `services/DIYService.js:591` |
| B3 | `_validateDesignMaterials()` 查错表 + 空 `material_group_codes` 直接 return 跳过校验（7 个模板全部空数组，校验永远不执行） | 🔴 核心 | `services/DIYService.js:1314-1318` |
| B4 | `confirmDesign()` 没有按 `price_asset_code` 分组汇总冻结，而是直接读前端传的 `asset_code` | 🔴 核心 | `services/DIYService.js:599-608` |
| B5 | `diy_materials.price` 是 `DECIMAL(10,2)`（如 6.50），但 `account_asset_balances.available_amount` 是 `bigint` 整数，冻结时无精度转换逻辑 | 🟡 需处理 | 跨表类型不匹配 |
| B6 | `diy_materials` 表 DDL 中 `price_asset_code` 默认值是 `'DIAMOND'`（历史遗留不存在的资产） | 🟢 低优先级 | 数据库 DDL |
| B7 | `BalanceService.freeze()` 需要 `system_code` 参数，当前 `confirmDesign()` 未传 | 🟡 需处理 | `services/asset/BalanceService.js` |
| B8 | `exchange_records` 表缺少 `address_snapshot` 字段（实物履约需要快照收货地址） | 🔴 核心 | 数据库 `exchange_records` 表 |
| B9 | `user_addresses` 表不存在（需要新建） | 🔴 核心 | 数据库（119 张表中无此表） |
| B10 | `items.source` 是 `varchar(20)` 不是枚举，新增 `'diy'` 值无需 ALTER TABLE | 🟢 信息确认 | `models/Item.js` |

### 2.2 Web 管理后台前端项目的问题（3 个）

| # | 问题 | 严重度 | 代码位置 |
|---|---|---|---|
| W1 | `admin/src/api/diy.js` 中的 API 调用路径和字段名需要对齐后端实际返回（后端修复 B1-B4 后，返回的数据结构会变化） | 🟡 需确认 | `admin/src/api/diy.js` |
| W2 | Konva 画布编辑器（槽位编辑器）的数据结构需要与后端 `diy_templates.slot_config` JSON 格式对齐 | 🟡 需确认 | `admin/src/modules/diy-slot-editor.js` |
| W3 | 材料管理页面的 `price_asset_code` 下拉选项需要限制（排除 `points` / `budget_points`），当前可能允许选择任意资产 | 🟡 需处理 | `admin/src/modules/diy-material-management.js` |

### 2.3 微信小程序前端项目的问题（3 个）

| # | 问题 | 严重度 | 说明 |
|---|---|---|---|
| M1 | 代码不在本仓库，无法直接审计 | — | 独立仓库 |
| M2 | 后端 B1 修复后，`getTemplateMaterials` 返回的字段会从资产类型字段（`asset_code`, `form`, `budget_value_points`）变为珠子商品字段（`material_code`, `display_name`, `diameter`, `price`），小程序需要适配新的返回字段名 | 🔴 核心 | 后端修好后小程序必须同步改 |
| M3 | 确认设计接口需要传 `payments` 参数 + `address_id` 参数，小程序需要新增支付选择 UI 和收货地址选择页面 | 🔴 核心 | 新 UI 开发 |

---

## 三、后端现有可复用能力盘点

> 以下是后端已有的、DIY 模块可以直接复用的成熟能力，无需额外开发。

| # | 能力 | 服务 / 工具 | 说明 |
|---|---|---|---|
| 1 | 资产冻结 / 解冻 / 结算 | `BalanceService.freeze()` / `unfreeze()` / `settleFromFrozen()` | 完整的幂等 + 事务支持，DIY 支付直接复用。static 方法，接受任意 `asset_code`，强制 `transaction` 参数 |
| 2 | DIY 工单号生成 | `OrderNoGenerator.generate('DW', ...)` | 已有 DIY 工单号生成器（'DW' 前缀），模板号用 'DT' 前缀 |
| 3 | 多态媒体系统 | `MediaAttachment` + `MediaFile` + `ImageUrlHelper` | 珠子图片可直接通过 `image_media_id` 挂载，Sealos 对象存储 URL 生成 |
| 4 | 兑换记录体系 | `ExchangeRecord` + `ExchangeService` + `CoreService` | 完整的订单状态机（pending→approved→shipped→received→completed），实物履约可直接扩展 `source='diy'` |
| 5 | 物品实例体系 | `ItemInstance` + `ItemService.mintItem()` | DIY 铸造产出的饰品可以作为 item 实例，三表模型双录（items + item_ledger + item_holds） |
| 6 | C2C 交易市场 | `C2CMarketService` | DIY 饰品铸造后可直接上架 C2C 交易市场 |
| 7 | 审计日志 | `AuditLogService` | 所有 DIY 操作（冻结 / 扣减 / 铸造 / 取消）可复用审计日志记录 |
| 8 | 事务管理 | `TransactionManager.execute()` | 统一事务包裹，自动 commit / rollback，所有 DIY 状态流转已在用 |
| 9 | 统一响应格式 | `ApiResponse` 中间件 | `res.apiSuccess(data, message)` / `res.apiError(message, code, details, status)` |
| 10 | JWT 认证 | `authenticateToken` 中间件 | 已在所有 DIY 写操作路由上使用 |
| 11 | 分布式锁 | `UnifiedDistributedLock` | Redis 分布式锁，防止并发冻结 / 重复确认 |
| 12 | 用户 ID 转换 | `DIYService.getAccountIdByUserId(userId)` | `user_id` → `account_id` 转换 |
| 13 | 快递物流 | `ShippingTrackService` | 快递 100 主 + 快递鸟备，Redis 缓存，支持顺丰 / 圆通 / 中通 / 申通 / 韵达 / 京东 / EMS / 德邦 |
| 14 | 7 天自动确认收货 | `jobs/daily-exchange-order-auto-confirm.js` | 定时任务，发货 7 天后自动确认收货 |

**底层架构数据**：119 个 Sequelize 模型、102 个 Service、193 个路由文件 — 成熟的三层分离架构（Model → Service → Route），DIY 模块完全遵循同一套规范。

---

## 四、后端现有可扩展点

> 以下是现有数据库和代码中需要扩展（而非重建）的点。

| # | 扩展点 | 当前状态 | 需要做的 |
|---|---|---|---|
| 1 | `items.source` 字段 | `varchar(20)`，当前值有 `'lottery'`、`'exchange'` 等 | 直接写入 `'diy'` 即可，不需要 ALTER TABLE 改表结构 |
| 2 | `exchange_records` 表 | 有 `shipping_company` / `shipping_no` / `shipped_at` 物流字段，但没有 `address_snapshot` | 新增 `address_snapshot JSON NULL` 字段（1 条 ALTER TABLE） |
| 3 | `user_addresses` 表 | 当前数据库不存在（119 张表中无此表） | 需要新建：Sequelize 模型 + migration 迁移文件 |
| 4 | `diy_materials.price_asset_code` DDL 默认值 | 当前默认 `'DIAMOND'`（不存在的资产） | 改为 `'star_stone'`（对齐当前 20 条真实数据全部是 `star_stone`），或移除默认值改为 NOT NULL 无默认 |
| 5 | `exchange_records.source` 字段 | `varchar(20)`，当前 25 条记录全部是 `'exchange'` | 直接写入 `'diy'` 区分 DIY 订单，不需要改表结构 |
| 6 | `confirmDesign()` 的 `system_code` | 当前调用 `BalanceService.freeze()` 时未传 `system_code` | 定义新的 `system_code` 值（建议 `'diy_freeze'`），传入 freeze / unfreeze / settleFromFrozen |

---

## 五、Web 前端技术栈兼容性分析

> 分析 Web 管理后台前端是否能支撑 DIY 管理功能的新增需求。

| 检查项 | 结论 | 依据 |
|---|---|---|
| Konva 画布能力 | ✅ 已具备 | `konva ^10.2.3` 已在用，`diy-slot-editor.js`（17KB）实现了完整的槽位标注画布编辑器 |
| CRUD 页面能力 | ✅ 已具备 | Alpine.js + Tailwind CSS 轻量级但足够，材料管理 / 模板管理 CRUD 页面已完整实现 |
| API 调用层 | ✅ 已有骨架 | `admin/src/api/diy.js` 已存在（17 个函数），封装了 14 个管理端接口的调用 |
| 新增页面机制 | ✅ 零成本 | MPA 架构，`vite.config.js` 自动扫描所有 `.html` 入口文件，新增 DIY 管理页面只需新建 `admin/diy-xxx.html` 入口文件 |
| 图片上传 | ✅ 已集成 | 素材管理和模板管理都使用了 `imageUploadMixin`，通过 `MediaService` 上传到 Sealos 对象存储 |
| 图表统计 | ✅ 已具备 | ECharts ^6.0.0 已在用，DIY 统计面板可直接使用 |
| WebSocket | ✅ 已具备 | `socket.io-client ^4.8.3` 已在用，管理端实时通知可复用 |
| 请求封装 | ✅ 已对齐 | `admin/src/api/base.js` 的 `request()` 已对齐后端 `/api/v4/` 前缀，JWT Bearer Token 统一管理 |

**结论**：Web 前端技术栈完全兼容 DIY 管理功能需求，不需要引入新框架。唯一需要调整的是：
1. 材料管理页 `price_asset_code` 下拉选项增加白名单过滤（排除 `points` / `budget_points`）
2. 作品详情页适配 `total_cost` 新的 JSON 结构（从数组变为对象）
3. exchange 订单列表页加 `source` 筛选下拉框（区分普通兑换和 DIY 订单）

---

## 六、需要拍板的决策项（6 项） — 含行业方案深度对比

> 以下决策项需要业主拍板。每项都附上大公司/小公司/游戏公司/活动策划平台/二手交易平台的实际做法，以及基于本项目后端技术栈（Node.js + Express + Sequelize + MySQL bigint 账本）的最优选择。
>
> 项目前提：未上线、愿意一次性投入、不兼容旧接口、以长期维护成本最低为目标。

---

### 决策 A：精度策略 — diy_materials.price 是 DECIMAL(10,2)，余额是 bigint，怎么对齐？

**你的项目实际情况**：`diy_materials.price` 字段类型 `DECIMAL(10,2)`（如 6.50），`account_asset_balances.available_amount` 字段类型 `bigint`（整数）。20 条珠子中只有 `yellow_topaz_8mm`（6.50）不是整数，其余 19 条全部是整数。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 精度问题 | 改动成本 | 长期维护成本 |
|---|---|---|---|---|---|
| **最小单位存储（分/厘）** | 支付宝/微信支付/美团/京东/所有金融级系统 | 1 元 = 100 分，数据库只存整数分。`price=650` 表示 6.50 元 | 零精度损失 | 巨大：需要改 `account_asset_balances` 全表数据（43 人 star_stone + 其他资产），改 `diy_materials` 20 条，改所有读写余额的代码（BalanceService + 前端展示除以 100）| 极低（金融级标准） |
| **浮点运算 + Math.ceil** | 小型电商/早期创业项目/闲鱼早期 | 数据库存 DECIMAL，代码里浮点运算后取整 | 浮点精度问题（0.1+0.2≠0.3），`Math.ceil` 用户可能多付 | 最小：只改 `confirmDesign` 一处 | 中等（每次涉及金额都要考虑精度） |
| **强制整数定价** | 腾讯游戏（Q 币/点券全部整数）、原神（原石/摩拉全部整数）、网易游戏（勾玉整数）、得物（积分整数）、Steam（Steam 钱包整数分） | 商品价格必须是整数，数据库 DECIMAL 保留但业务层校验整数 | 零精度问题 | 极小：改 1 条数据 `yellow_topaz_8mm` 6.50→7，加一条 Joi 校验规则 | 极低（从源头消灭问题） |
| **双精度 + 分布式对账** | 银行/证券/大型金融平台 | 数据库和代码全部用高精度库（如 Java BigDecimal），定时对账 | 零精度损失 | 巨大：引入 decimal.js 库，改全部金额计算代码 | 高（对账系统维护成本） |

**为什么大公司全部用整数或最小单位**：支付宝/微信支付用"分"是因为人民币最小单位是分；腾讯游戏用"整数 Q 币"是因为虚拟货币没有"半个 Q 币"的概念；原神的原石/摩拉也全部整数。**虚拟货币没有小数的必要性** — 你的"星石"是虚拟货币，不是法币，完全可以强制整数。

**你的项目最适合方案：强制整数定价（方案 C）**

理由：
1. **你的余额体系已经是 bigint 整数**（`account_asset_balances.available_amount`），这是不可更改的基础设施 — `BalanceService` 的 102 个服务类和 119 个模型都依赖整数余额
2. **改最小单位（方案 A）成本太大**：要改 `account_asset_balances` 全表数据 + 所有读写余额的代码 + 前端展示逻辑，等于重构整个资产体系
3. **浮点运算（方案 B）是技术债务**：每次新增涉及金额的功能都要处理精度，长期维护成本高
4. **改动量最小**：当前 20 条中只有 `yellow_topaz_8mm`（6.50）一条不是整数，改为 7 即可
5. **腾讯/网易/米哈游的虚拟货币全部整数** — 这是游戏/虚拟经济行业的共识

**最终决策**：✅ **选 C — 强制整数定价**。迁移脚本 `UPDATE diy_materials SET price = 7 WHERE material_code = 'yellow_topaz_8mm'`，管理后台和后端各加一条整数校验。

---

### 决策 B：收货地址方案 — user_addresses 表不存在，实物发货怎么搞？

**你的项目实际情况**：119 张表中没有 `user_addresses`；`exchange_records` 已有 `shipping_company` / `shipping_no` / `shipped_at` 物流字段但没有地址字段；现有 25 条 `exchange_records` 全部 `source='exchange'`，status=pending，没有一条走过发货流程。积分商城有实物商品（衣服 stock=42, sold=8）但也没有地址能力。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 用户体验 | 开发成本 | 长期维护成本 | 适合体量 |
|---|---|---|---|---|---|---|
| **独立地址表 + 订单快照** | 淘宝/京东/美团/拼多多/得物/所有正规电商 | `user_addresses` 表管理地址簿，下单时快照到订单的 `address_snapshot` JSON | 地址簿管理、一键选择、设默认 | 1 个模型 + 1 个路由文件 + 1 条 ALTER TABLE | 极低（标准电商架构，所有业务复用） | 任何体量 |
| **仅微信地址 API** | 微信小商店/极简拼团小程序/社区团购 | 每次下单调 `wx.chooseAddress()`，地址直接写入订单 JSON | 依赖微信授权，每次都要操作 | 最小：0 张新表 | 中等（Web 管理后台无法用微信 API） | 纯小程序、无 Web 端 |
| **订单内嵌地址字段** | 游戏积分兑换（如王者荣耀皮肤+周边兑换）/活动抽奖寄送 | 订单表直接加 `receiver_name`/`phone`/`address` 三个 varchar 字段 | 每次重填 | 最小：3 个 ALTER TABLE | 高（后续要建地址表等于返工，且每个订单表都要加字段） | 极低频兑换 |
| **第三方地址服务** | 顺丰/菜鸟/大型物流平台 | 调用高德/百度地址解析 API 标准化地址 | 地址自动补全 | 高：引入第三方依赖 | 高（API 调用量费用） | 日发货万单以上 |

**大公司怎么做的具体细节**：
- **淘宝/京东**：`user_addresses` 独立表（省/市/区拆分存），下单时快照到 `order.address_snapshot` JSON。用户改地址后已发货订单的地址不变 — **这是电商行业铁律**
- **美团外卖**：独立地址表 + 高德 API 补全 + 骑手端展示。你不需要高德 API，但独立地址表的设计一样
- **拼多多**：同淘宝，独立地址表 + JSON 快照。拼多多虽然简陋但地址体系和淘宝一模一样
- **得物/Buff**：虚拟商品不要地址，实物鉴定/交易需要地址 — 独立地址表 + 快照
- **游戏公司**（王者荣耀/原神周边兑换）：因为兑换频率极低（一年几次），直接在订单里嵌地址字段。但他们也承认这是技术债务

**为什么你不能用"仅微信地址 API"**：你的 Web 管理后台（`admin/` — Vite + Alpine.js）运行在浏览器里，无法调用 `wx.chooseAddress()`。管理员手动填写发货地址时也需要查看用户地址。

**你的项目最适合方案：独立地址表 + 订单快照（方案 A）**

理由：
1. **你的积分商城兑换实物也需要地址** — `exchange_records` 表已有 25 条记录但没地址，说明现在积分商城的实物商品（衣服 stock=42）也没法发货。建一次 `user_addresses` 表，DIY + exchange 全部复用
2. **你的 `exchange_records` 已有 `item_snapshot` JSON 快照模式** — 地址快照 `address_snapshot` 完全一致的设计风格，零认知成本
3. **微信 `wx.chooseAddress()` 返回格式天然匹配**：`provinceName`/`cityName`/`countyName`/`detailInfo`/`userName`/`telNumber` 直接映射到表字段
4. **项目没上线，一步到位成本最低**
5. **所有正规电商无一例外用独立地址表** — 淘宝/京东/美团/拼多多/得物，没有例外

**最终决策**：✅ **选 A — 独立 `user_addresses` 表 + 订单 `address_snapshot` JSON 快照**。新建 1 个 Sequelize 模型 + 1 个迁移文件 + 1 个路由文件 + 1 条 ALTER TABLE。

---

### 决策 C：DIY 铸造产出物放哪张表？

**你的项目实际情况**：`items` 表已有 7609 条记录，`source` 字段是 `varchar(20)`，当前值有 `lottery`/`exchange`/`legacy`/`test`。`ItemService.mintItem()` 是通用铸造方法。`C2CMarketService` 已实现完整的 C2C 交易市场。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 可交易性 | 开发成本 | 长期维护成本 |
|---|---|---|---|---|---|
| **统一物品表 + source 区分** | Steam（所有物品统一 inventory，source 区分来源）、原神（背包统一存所有来源物品）、CS2（饰品统一表，来源：开箱/交易/掉落） | 一张 `items` 表，`source` 字段区分来源 | 天然可交易（同表 = 同市场） | 零：复用现有 `ItemService.mintItem()` | 极低 |
| **独立产出表** | 少数企业内部 ERP（不同业务线独立表）| 每个业务一张产出表 | 需要额外对接交易市场 | 高：新建表 + 新建 Service + C2C 市场改造 | 高（每个业务一套代码） |
| **多态关联 + 基础表** | Rails/Django 社区常见模式 | 基础 `items` 表 + `diy_item_details` 扩展表 | 基础表可交易，扩展表存额外属性 | 中等：多一张表但核心逻辑复用 | 中等 |

**为什么 Steam/原神/CS2 全部用统一物品表**：物品的核心属性（所有者、状态、来源、价值）是通用的，不同来源的物品在市场上交易时没有区别。分开存 = 分开维护 = 交易对接时要写适配层 = 纯技术债务。

**你的项目最适合方案：复用 `items` 表（方案 A）**

理由：
1. **`items.source` 是 `varchar(20)` 不是 ENUM** — 直接写入 `'diy'` 零成本，不需要 ALTER TABLE
2. **`DIYService.completeDesign()` 已经调用 `ItemService.mintItem({ source: 'diy' })`** — 代码已写好，只是还没跑通
3. **铸造后的 DIY 饰品可以直接上 C2C 交易市场** — `C2CMarketService` 对 `items` 表通用
4. **独立表方案的成本全部是浪费** — 新建表、新建 Service、改 C2C 市场适配，全是不必要的工作

**最终决策**：✅ **选 A — 复用 `items` 表，`source='diy'`**。零改动。

---

### 决策 D：diy_materials.price_asset_code 默认值处理

**你的项目实际情况**：DDL 默认值是 `'DIAMOND'`（不存在于 `material_asset_types` 的 16 条记录中），20 条真实数据全部手动设为 `star_stone`。管理后台创建材料时如果不传 `price_asset_code`，会默认写入 `'DIAMOND'`。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 安全性 | 长期维护成本 |
|---|---|---|---|---|
| **有默认值（合理默认）** | 大多数电商平台（默认人民币 CNY）、游戏（默认金币）| 字段有默认值，且默认值是合法的 | 中等：运营忘了设也能工作 | 低 |
| **有默认值（不合理默认）** | ❌ 没有正规公司会这样做 | 默认值指向不存在的数据 | 极低：运营忘了设 = 系统报错 | 高（排查"DIAMOND 是什么"） |
| **NOT NULL 无默认 + 前端必填校验** | 支付宝（支付方式必选）、美团（配送方式必选）、得物（尺码必选）| 数据库不给默认值，前端和后端都校验必填 | 高：不可能遗漏 | 极低 |

**你的 `'DIAMOND'` 是一个不合理默认值** — 它在 `material_asset_types` 中不存在，如果有珠子用了这个默认值，`confirmDesign()` 冻结时会报错。没有任何正规公司会把不存在的值设为默认值。

**你的项目最适合方案：NOT NULL 无默认 + 前端必填校验（方案 B）**

理由：
1. **你的管理后台已有材料 CRUD** — `admin/src/api/diy.js` 的 `createMaterial(data)` 和 `updateMaterial(id, data)` 已实现，只需在 Alpine.js 表单里加 `required` 即可
2. **强制显式指定比"合理默认"更安全** — 运营不可能"忘了设定价货币然后上线"，因为提交按钮会灰掉
3. **`'star_stone'` 作为默认值也不好** — 未来如果有珠子用源晶定价，运营可能忘了改，默认 star_stone 导致定价错误

**最终决策**：✅ **选 B — 移除默认值，NOT NULL 无默认**。`ALTER TABLE diy_materials ALTER COLUMN price_asset_code DROP DEFAULT`。

---

### 决策 E：BalanceService 调用参数 — user_id 还是 system_code？

**纠正说明**：经代码审计，`BalanceService.freeze/unfreeze/settleFromFrozen` 的参数 `user_id` 和 `system_code` 是**互斥的**（见 `getOrCreateAccount` 第 111-115 行：`if (user_id && system_code) throw Error('不能同时提供')`）。`user_id` 用于用户账户操作，`system_code` 用于系统账户（如平台手续费账户）。DIY 冻结是用户的钱，必须用 `user_id`。

**当前代码的实际问题**：`confirmDesign()` 第 600-608 行传的是 `user_id: userId`，没有传 `system_code`。这本身是正确的（用户操作用 `user_id`），但 `business_type` 需要明确为 DIY 专属值。

**行业方案对比**：

| 方案 | 谁在用 | 做法 | 审计追踪性 | 长期维护成本 |
|---|---|---|---|---|
| **业务域独立 business_type** | 美团（外卖/酒店/打车各自 business_type）、腾讯（游戏/音乐/视频各自）| 每个业务域有独立的 `business_type` 前缀 | 极好：`asset_transactions` 表中可以按 business_type 筛选 DIY 流水 | 极低 |
| **统一 business_type** | 小型项目/MVP | 所有业务共用 `'freeze'` / `'settle'` / `'unfreeze'` | 差：无法区分是 DIY 冻结还是其他业务冻结 | 高（排查问题时要关联多张表） |

**你的项目最适合方案：DIY 专属 business_type（方案 A）**

当前 `confirmDesign()` 已经用了 `business_type: 'diy_freeze_material'`，`completeDesign()` 用了 `business_type: 'diy_settle_material'`，`cancelDesign()` 用了 `business_type: 'diy_unfreeze_material'` — 这些已经是正确的 DIY 专属值，不需要改。

唯一需要做的是确认 `user_id` 参数在 `confirmDesign/completeDesign/cancelDesign` 中正确传递（当前代码传的是 `options.userId`，来自路由层的 `req.user.user_id`，这是正确的）。

**最终决策**：✅ **保持现有 `business_type` 值不变**（`diy_freeze_material` / `diy_settle_material` / `diy_unfreeze_material`），已经符合行业最佳实践。无需新增 `system_code`，DIY 操作的是用户资产，正确使用 `user_id`。

---

### 决策 F：是否清理 5 条脏测试数据

**你的项目实际情况**：`diy_works` 表 5 条数据全部是 `account_id=5` 在 2026-03-31 同一天创建的测试数据，`design_data` 中的 `asset_code` 值（`JADE`/`AGATE`/`DIAMOND`/`red_shard`）在 `diy_materials`（20 条）和 `material_asset_types`（16 条）两张表中都不存在。全部 `status=draft`，没有进入过 `frozen` 或 `completed` 流程。

**行业方案对比**：

| 场景 | 谁怎么做 | 做法 |
|---|---|---|
| **项目未上线 + 脏数据** | 淘宝/美团/腾讯/阿里 — 全部直接 DELETE | 上线前清理所有测试数据，不留任何历史包袱 |
| **项目已上线 + 用户数据需迁移** | 大公司用灰度迁移（双写过渡），小公司用停机迁移 | 写迁移脚本转换数据格式 |
| **项目已上线 + 少量脏数据** | 写迁移脚本 + 审计日志 | 迁移脚本记录操作，可追溯 |

**没有任何公司会在上线前保留明确的脏数据** — 这 5 条数据引用的编码不存在，`design_data` 结构不符合目标格式，total_cost 引用 `DIAMOND`（不存在的资产），如果不清理，`confirmDesign()` 修复后这些数据会直接报错。

**你的项目最适合方案：直接 DELETE（方案 A）**

理由：
1. **项目未上线** — 没有用户数据保护义务
2. **5 条全部是同一个 account_id=5 的测试数据** — 不是真实用户
3. **编码全部无效** — `JADE`/`AGATE`/`DIAMOND`/`red_shard` 在数据库中不存在
4. **用 Sequelize 迁移脚本执行** — 有迁移记录可追溯（`npx sequelize-cli db:migrate:undo` 可回滚）

**最终决策**：✅ **选 A — 直接 DELETE**。`DELETE FROM diy_works WHERE diy_work_id IN (1, 3, 6, 7, 8);`

---

### 决策汇总表

| # | 决策项 | 最终选择 | 核心理由 | 改动量 |
|---|---|---|---|---|
| A | 精度策略 | ✅ **强制整数定价** | 余额体系已是 bigint 整数不可更改；腾讯/网易/米哈游虚拟货币全部整数；只有 1 条数据需改 | 改 1 条数据 + 加 1 条 Joi 校验 |
| B | 收货地址 | ✅ **独立 `user_addresses` 表 + 订单快照** | 电商行业标准做法无例外；积分商城兑换实物也复用；微信 `wx.chooseAddress` 天然匹配 | 1 个模型 + 1 个迁移 + 1 个路由 + 1 条 ALTER TABLE |
| C | 铸造产出物 | ✅ **复用 `items` 表，`source='diy'`** | `varchar(20)` 天然支持；C2C 市场直接可用；`completeDesign()` 代码已写好 | 零改动 |
| D | `price_asset_code` 默认值 | ✅ **移除默认值，NOT NULL 无默认** | `'DIAMOND'` 是不合理默认值；强制显式指定更安全 | 1 条 ALTER TABLE + 管理后台加 required |
| E | BalanceService 参数 | ✅ **保持现有 business_type 不变** | `diy_freeze_material` 等已是正确的 DIY 专属值；用 `user_id` 不用 `system_code` | 零改动 |
| F | 脏测试数据 | ✅ **直接 DELETE** | 项目未上线；5 条全是无效编码的测试数据 | 1 条 DELETE SQL |

---

## 七、执行步骤（按后端技术框架的标准开发流程，2026-04-07 22:00 更新）

> 按照后端实际架构的标准写法：Migration → Sequelize 模型 → Service → Route → 中间件 → 管理端适配 → 验证收尾。
> 每一步对应修改哪个文件、哪个方法。以后端数据库为核心权威，前端直接使用后端字段名，不做映射。

### 阶段 0：数据准备（Migration 迁移脚本）

**目标**：清理脏数据 + 建表 + 加字段 + 修正 DDL 默认值

| 步骤 | 操作 | 文件 | SQL / 说明 |
|---|---|---|---|
| 0.1 | 清理 5 条脏测试 works | 新建 `migrations/XXXXXXXX-cleanup-diy-test-data.js` | `DELETE FROM diy_works WHERE diy_work_id IN (1, 3, 6, 7, 8)` — 全部是 account_id=5 的测试数据，asset_code 引用不存在的 JADE/DIAMOND |
| 0.2 | 去掉 `price_asset_code` 的 DDL 默认值 | 同一迁移文件 | `ALTER TABLE diy_materials ALTER COLUMN price_asset_code DROP DEFAULT` — 当前默认值 `'DIAMOND'` 是历史遗留，不存在此资产 |
| 0.3 | 新建 `user_addresses` 表 | 新建 `migrations/XXXXXXXX-create-user-addresses.js` | `createTable('user_addresses', { address_id(bigint PK AUTO_INCREMENT), user_id(int NOT NULL), receiver_name(varchar50), receiver_phone(varchar20), province(varchar50), city(varchar50), district(varchar50), detail_address(varchar500), is_default(tinyint DEFAULT 0), created_at, updated_at })`，索引 `idx_user_addresses_user_id` |
| 0.4 | `exchange_records` 加 `address_snapshot` 字段 | 新建 `migrations/XXXXXXXX-add-address-snapshot-to-exchange-records.js` | `addColumn('exchange_records', 'address_snapshot', { type: DataTypes.JSON, allowNull: true, comment: '下单时收货地址快照（不可变）' })` — 该表已有 `shipping_company` / `shipping_no` 字段可复用 |
| 0.5 | 修正 `yellow_topaz_8mm` 价格为整数 | 同 0.1 迁移文件 | `UPDATE diy_materials SET price = 7 WHERE material_code = 'yellow_topaz_8mm'` — 当前 6.50，改为 7（如决策 A 选 C） |

**执行命令**：`npx sequelize-cli db:migrate`（项目已有 `.sequelizerc` 配置）

### 阶段 1：Sequelize 模型层

**目标**：新建 / 修改模型定义，遵循项目现有模型规范（`underscored: true`, `freezeTableName: true`, `timestamps: true`）

| 步骤 | 操作 | 文件 | 改动内容 |
|---|---|---|---|
| 1.1 | 新建 UserAddress 模型 | 新建 `models/UserAddress.js` | 定义 `address_id`(bigint PK AUTO_INCREMENT)、`user_id`(int NOT NULL, references users)、`receiver_name`(varchar50)、`receiver_phone`(varchar20)、`province`(varchar50)、`city`(varchar50)、`district`(varchar50)、`detail_address`(varchar500)、`is_default`(tinyint DEFAULT 0)。关联：`User.hasMany(UserAddress, { foreignKey: 'user_id', as: 'addresses' })`。索引 `idx_user_addresses_user_id` |
| 1.2 | 修改 ExchangeRecord 模型 | 修改 `models/ExchangeRecord.js` | 增加 `address_snapshot: { type: DataTypes.JSON, allowNull: true, comment: '下单时收货地址快照（不可变）' }` |
| 1.3 | 确认 Item 模型 source 字段 | 检查 `models/Item.js` | 确认 `source` 字段是 `DataTypes.STRING(20)` 而非 ENUM，支持写入 `'diy'`（已确认 varchar(20)，无需改动） |
| 1.4 | 在 `models/index.js` 注册 UserAddress | 修改 `models/index.js` | 确保 UserAddress 被自动加载并建立关联 |

### 阶段 2：Service 服务层

**目标**：修复核心业务逻辑缺陷 B1-B9，以后端数据库 `diy_materials` 表为核心权威

| 步骤 | 操作 | 文件 | 方法 | 改动内容 |
|---|---|---|---|---|
| 2.1 | 修复材料校验（B3） | `services/DIYService.js` | `_validateDesignMaterials(template, designData)` | 查询从 `MaterialAssetType.findAll()` → `DiyMaterial.findAll({ where: { material_code: { [Op.in]: usedCodes }, is_enabled: true } })`；移除空 `material_group_codes` 直接 return 的逻辑；提取 `designData.beads[].material_code` 而非 `asset_code` |
| 2.2 | 修复保存草稿（B2 前置） | `services/DIYService.js` | `saveWork(accountId, data)` | `design_data` 中每个珠子用 `material_code`（对齐 `diy_materials` 表主键）；移除 `total_cost` 前端直传（`saveWork` 只存 `design_data`，`total_cost` 在 `confirmDesign` 时由后端计算） |
| 2.3 | **重写确认设计（B1/B2/B4/B7）** | `services/DIYService.js` | `confirmDesign(workId, accountId, options)` | 核心改动：(1) 从 `work.design_data.beads` 提取所有 `material_code`；(2) 批量查 `DiyMaterial` 获取 `price` + `price_asset_code`；(3) 按 `price_asset_code` 分组汇总金额（`Math.ceil()` 或要求整数价格）；(4) 逐种资产调用 `BalanceService.freeze({ user_id, system_code: 'diy', asset_code, amount, business_type: 'diy_freeze', idempotency_key: 'diy_freeze_{workId}_{asset_code}', meta }, { transaction })`；(5) 生成 `total_cost` 快照写入 `diy_works`（含 `price_snapshot` 和 `payments` 数组） |
| 2.4 | 适配完成设计（B8） | `services/DIYService.js` | `completeDesign(workId, accountId, options)` | 从 `work.total_cost.payments` 逐项 `BalanceService.settleFromFrozen({ system_code: 'diy', business_type: 'diy_settle' })`；铸造 `ItemService.mintItem({ source: 'diy', source_ref_id: workId })`；创建 `ExchangeRecord`（`source: 'diy'`，写入 `address_snapshot`） |
| 2.5 | 适配取消设计（B9） | `services/DIYService.js` | `cancelDesign(workId, accountId, options)` | 从 `work.total_cost.payments` 逐项 `BalanceService.unfreeze({ system_code: 'diy', business_type: 'diy_unfreeze' })` |
| 2.6 | **重写材料查询（B1）** | `services/DIYService.js` | `getTemplateMaterials(templateId, accountId)` | 查询从 `MaterialAssetType.findAll()` → `DiyMaterial.findAll({ where: { is_enabled: true }, include: [{ model: MediaFile, as: 'image_media' }] })`；如果模板 `material_group_codes` 非空则按 `group_code` 过滤；返回字段直接用 `diy_materials` 表字段名：`material_code, display_name, material_name, group_code, diameter, price, price_asset_code, image_url` |
| 2.7 | 新增支付资产查询 | `services/DIYService.js` | 新增 `getPaymentAssets(accountId)` | 查 `MaterialAssetType`（排除 `points` / `budget_points`）+ `AccountAssetBalance` 用户余额，返回可用于 DIY 支付的资产列表 + 余额 |
| 2.8 | 新增地址服务 | 新建 `services/UserAddressService.js` | CRUD 方法 | `list(userId)` / `create(userId, data)` / `update(userId, addressId, data)` / `delete(userId, addressId)` / `setDefault(userId, addressId)` / `getById(addressId)` — 遵循项目现有 Service 规范（静态方法 + 事务支持） |

### 阶段 3：Route 路由层

**目标**：调整用户端路由，新增地址路由。遵循项目现有路由规范（`asyncHandler` 包装 + `authenticateToken` 中间件 + `TransactionManager.execute()` 事务管理）

| 步骤 | 操作 | 文件 | 改动内容 |
|---|---|---|---|
| 3.1 | 新增支付资产路由 | `routes/v4/diy.js` | 新增 `GET /api/v4/diy/payment-assets`（需 `authenticateToken`），调用 `diyService.getPaymentAssets(req.accountId)` |
| 3.2 | confirm 接口增加参数 | `routes/v4/diy.js` | `POST /api/v4/diy/works/:id/confirm` 增加请求体参数 `address_id`（收货地址 ID），传入 `confirmDesign(workId, accountId, { transaction, userId, addressId })` |
| 3.3 | 修改材料查询路由 | `routes/v4/diy.js` | `GET /api/v4/diy/templates/:id/materials` 保留路径不变，但内部改为调用修复后的 `getTemplateMaterials()`（返回 `diy_materials` 数据而非 `material_asset_types`）。不返回 410，因为路径语义正确（查模板可用材料），只是内部查错了表 |
| 3.4 | 新建地址 CRUD 路由 | 新建 `routes/v4/user/addresses.js` | `GET /api/v4/user/addresses`（地址列表）、`POST /api/v4/user/addresses`（新增）、`PUT /api/v4/user/addresses/:id`（修改）、`DELETE /api/v4/user/addresses/:id`（删除）、`PUT /api/v4/user/addresses/:id/default`（设默认），全部需要 `authenticateToken` |
| 3.5 | 注册地址路由 | `routes/v4/index.js` | `router.use('/user/addresses', require('./user/addresses'))` — 遵循项目现有路由注册方式 |

### 阶段 4：中间件 / 校验层

**目标**：增加业务校验规则

| 步骤 | 操作 | 文件 | 改动内容 |
|---|---|---|---|
| 4.1 | confirm 请求体校验 | `routes/v4/diy.js` 或独立 Joi schema | 用 Joi 校验 `address_id`（必填，正整数）— 项目已有 Joi ^17.11.0 依赖 |
| 4.2 | 地址 CRUD 请求体校验 | `routes/v4/user/addresses.js` | 用 Joi 校验：`receiver_name`（必填 2-50 字符）、`receiver_phone`（必填手机号格式）、`province`/`city`/`district`（必填）、`detail_address`（必填 5-500 字符） |
| 4.3 | `price_asset_code` 白名单校验 | `services/DIYService.js` `confirmDesign()` 中 | 校验所有珠子的 `price_asset_code` 不为 `'points'` 或 `'budget_points'`，违规则抛出 400 错误 |
| 4.4 | 价格整数校验 | `services/DIYService.js` `confirmDesign()` 中 | 校验汇总后的冻结金额是否为整数（`Number.isInteger(amount)`），非整数则报错提示管理员修正珠子价格 |

### 阶段 5：管理端适配（Web 管理后台 — `admin/` 目录）

**目标**：Web 管理后台前端小幅调整，直接使用后端字段名，不做映射

> Web 管理后台技术栈：Vite ^6.4.1 + Alpine.js ^3.15.4 + Tailwind CSS ^3.4.19，MPA 多页应用架构（59 个独立 HTML 页面），API 调用通过 `admin/src/api/base.js` 的 `request()` 封装（原生 fetch + JWT Bearer Token）

| 步骤 | 操作 | 文件 | 改动内容 |
|---|---|---|---|
| 5.1 | 材料管理页 `price_asset_code` 限制 | `admin/src/modules/diy-material-management.js` | `price_asset_code` 下拉选项从 `material_asset_types` 动态加载，但排除 `asset_code IN ('points', 'budget_points')`，字段改为必填。直接使用后端字段名 `price_asset_code`、`material_code`、`display_name` |
| 5.2 | 作品详情页 `total_cost` 展示适配 | `admin/src/modules/diy-work-management.js` | 适配新的 `total_cost` JSON 结构（从旧的 `[{asset_code, amount}]` 数组变为 `{ payments: [...], price_snapshot: [...] }` 对象） |
| 5.3 | exchange 订单列表增加 source 筛选 | `admin/src/modules/exchange-order-management.js`（或对应页面） | 订单列表增加 `source` 下拉筛选（全部 / exchange / diy），区分普通兑换和 DIY 订单 |
| 5.4 | 材料管理 API 适配 | `admin/src/api/diy.js` | 确认 `DIY_ENDPOINTS.MATERIALS` 路径 `/api/v4/console/diy/materials` 已正确（当前已正确），确保 CRUD 请求体字段名与后端 `diy_materials` 表字段名一致 |

**Web 前端可复用能力**（无需引入新框架）：
- `imageUploadMixin`（图片上传到 Sealos 对象存储）→ 珠子图片上传可直接复用
- `admin/src/api/base.js` 的 `request()` 封装 → 新增地址管理 API 可直接复用
- Konva ^10.2.3 画布库 → DIY 槽位编辑器已在用
- ECharts ^6.0.0 → DIY 统计面板可直接复用

### 阶段 6：验证与收尾

| 步骤 | 操作 | 说明 |
|---|---|---|
| 6.1 | 运行迁移脚本 | `npx sequelize-cli db:migrate`，验证 `user_addresses` 表已创建、`exchange_records.address_snapshot` 字段已添加、测试数据已清理 |
| 6.2 | 后端单元测试 | 验证 `_validateDesignMaterials()` 使用 `DiyMaterial` 查询；验证 `confirmDesign()` 服务端计算价格、拒绝前端伪造金额；验证 `price_asset_code` 白名单（拒绝 `points`/`budget_points`）；验证 `system_code: 'diy'` 正确传入 `BalanceService.freeze/settleFromFrozen/unfreeze` |
| 6.3 | 接口联调测试 | 用 Postman / curl 测试完整链路：`saveWork` → `confirmDesign`（验证冻结 + 地址快照）→ `completeDesign`（验证结算 + 铸造 + 创建 exchange_record）→ 管理端查看 DIY 订单 |
| 6.4 | 运营补充数据 | 运营在管理后台上传 19 张珠子图片（当前 20 条 `diy_materials` 中 `image_media_id` 全部为 null）；修正 `yellow_topaz_8mm` 价格为整数（如果选决策 A 选项 C） |
| 6.5 | 小程序前端适配 | 对接新的 `material_code` 字段名（直接使用后端 `diy_materials` 表字段名，不做映射）；对接 `/payment-assets` 接口；新增收货地址选择页面；`confirmDesign` 传 `address_id` |

### 执行顺序依赖关系

```
阶段 0（Migration — DDL + 数据清理）
  └→ 阶段 1（Model — Sequelize 模型定义）
       └→ 阶段 2（Service — 核心改动，B1-B9 全部在这一步修复）
            └→ 阶段 3（Route — 路由层适配）
                 └→ 阶段 4（中间件/校验 — Joi 校验规则）
                      └→ 阶段 5（管理端适配 — admin/ 前端）— 与阶段 3-4 可并行
                           └→ 阶段 6（验证收尾 + 小程序适配）
```

阶段 5（管理端适配）与阶段 3-4 没有强依赖，可以并行开发。小程序前端适配（阶段 6.5）依赖后端阶段 2-4 全部完成。

---

## 八、可复用能力盘点（后端现有能力，无需新建）

| 能力 | 后端现有实现 | DIY 模块复用方式 |
|---|---|---|
| 统一账本体系 | `Account` → `AccountAssetBalance` → `AssetTransaction` 三表模型 | `confirmDesign` 冻结 / `completeDesign` 结算 / `cancelDesign` 解冻，全部走 `BalanceService` |
| 物品铸造 | `ItemService.mintItem()` → `Item` + `ItemLedger` + `ItemHold` 三表 | `completeDesign` 铸造 DIY 成品，`source: 'diy'` |
| 事务管理 | `TransactionManager.execute(async (transaction) => { ... })` | 所有 DIY 写操作已在路由层用 `TransactionManager` 包装 |
| 幂等性控制 | `idempotency_key` 唯一约束 | `diy_freeze_{workId}_{asset_code}` 格式 |
| 统一响应格式 | `ApiResponse` 中间件注入 `res.apiSuccess()` / `res.apiError()` | 所有 DIY 路由已使用 |
| 认证中间件 | `authenticateToken` + `requireRoleLevel(N)` | 用户端路由用 `authenticateToken`，管理端用 `requireRoleLevel(60)` |
| 对象存储 | `MediaService` + Sealos S3 | 珠子图片上传已有 `image_media_id` 外键 |
| 编码生成 | `OrderNoGenerator` | `work_code` / `template_code` 已在用 |
| 日志 | Winston `logger.info/warn/error` | 所有 DIY 路由已有日志记录 |

## 九、可扩展点（基于现有架构可低成本扩展）

| 扩展方向 | 现有基础 | 扩展成本 |
|---|---|---|
| 新增珠子材质分类 | `diy_materials.group_code` 已支持任意分组 | 仅需管理后台录入新数据 |
| 新增模板类型 | `diy_templates.layout/bead_rules/sizing_rules` 全部 JSON 灵活配置 | 仅需管理后台录入新模板 |
| 多币种混合支付 | `price_asset_code` 已支持每颗珠子独立定价货币 | `confirmDesign` 已按 `price_asset_code` 分组冻结 |
| 实物发货管理 | `exchange_records` 已有 `shipping_company` / `shipping_no` / `status` 状态机 | 新增 `address_snapshot` 后即可支持 |
| DIY 作品分享 | `diy_works.design_data` 已存储完整设计数据 | 新增分享链接生成接口即可 |
| 快递查询 | `.env` 已预留 `KUAIDI100_KEY` / `KDNIAO_APP_ID` 配置 | 填入 API Key 即可启用 |
