# DIY 饰品设计引擎 — 后端重构落地方案

> 最后更新：2026-04-06，基于真实数据库查询和代码审计（非历史报告）。含第五部分：可叠加资产支付 DIY 实物饰品可行性验证。

## 待解决问题清单（6 个后端问题，全部未修复，2026-04-06 验证）

> 业务规则：源晶/源晶碎片（可叠加资产）兑换 DIY 实物珠子，每颗珠子的定价货币（price_asset_code）由运营动态设定

| # | 问题 | 严重程度 | 代码位置 | 验证结果 |
|---|---|---|---|---|
| B1 | `getTemplateMaterials()` 查的是 `material_asset_types`（货币表），不是 `diy_materials`（珠子商品表），导致小程序用户看到"红源晶碎片"而不是"巴西黄水晶 8mm" | 🔴 核心缺陷 | `services/DIYService.js` 第 281/302 行 | 代码仍然 `MaterialAssetType.findAll()` |
| B2 | `confirmDesign()` 从 `work.total_cost` 直接读取冻结明细，这个值是前端传入的，后端没有校验价格是否正确（安全漏洞：前端可以传 0 元）。正确做法：后端根据 design_data 查 diy_materials 的 price + price_asset_code 计算应冻结金额 | 🔴 核心缺陷 | `services/DIYService.js` 第 591 行 | 代码仍然 `const totalCost = work.total_cost` |
| B3 | `_validateDesignMaterials()` 查错表（查 `MaterialAssetType` 而非 `DiyMaterial`），且当 `material_group_codes` 为空数组时直接 return 跳过校验 — 当前 7 个模板全部空数组，校验永远不执行 | 🔴 核心缺陷 | `services/DIYService.js` 第 1314/1318 行 | 代码仍然查 `MaterialAssetType`，空数组直接 `return` |
| B4 | `confirmDesign()` 没有按 `price_asset_code` 分组汇总冻结，而是直接读前端传的 asset_code。正确做法：按每颗珠子的 price_asset_code 分组，逐种资产冻结（不需要 budget_value_points 换算） | 🔴 核心缺陷 | `services/DIYService.js` 第 599-608 行 | 代码直接遍历前端传的 total_cost 数组 |
| B5 | `diy_materials.price` 是 decimal(10,2)（如 6.50），但 `account_asset_balances.available_amount` 是 bigint 整数，冻结时无精度转换逻辑 | 🟡 需处理 | 数据库 `yellow_topaz_8mm` 价格 6.50 | 真实查询确认存在非整数价格 |
| B6 | `diy_materials` 表 DDL 中 `price_asset_code` 默认值是 `'DIAMOND'`（历史遗留），新增珠子时不指定会默认为不存在的资产 | 🟢 低优先级 | 数据库 INFORMATION_SCHEMA | 真实查询确认 `COLUMN_DEFAULT = 'DIAMOND'` |

附加数据问题：5 条 `diy_works` 测试数据使用不存在的编码（JADE/AGATE/DIAMOND/red_shard），其中 work_id 7/8 的 `total_cost` 引用 `DIAMOND`，需要清理。

---

# 第一部分：项目技术全景（基于代码和数据库实际验证）

## 一、后端项目技术全景

项目名：**restaurant-lottery-system-v4-unified v4.0.0**
定位：餐厅积分抽奖系统，V4 RESTful API 架构（扁平化资源导向设计）

| 类别 | 技术（实际 package.json 版本） |
|---|---|
| 运行时 | Node.js >=20.18.0 |
| Web框架 | Express ^4.18.2 |
| ORM | Sequelize ^6.35.2 + sequelize-cli ^6.6.2 |
| 数据库 | MySQL（mysql2 ^3.6.5），Sealos 云平台（dbconn.sealosbja.site:42569） |
| 缓存 | Redis（ioredis ^5.7.0），当前 .env 中 Redis 配置为 localhost |
| 认证 | JWT（jsonwebtoken ^9.0.2，双Token：Access 7d + Refresh 7d）+ Cookie |
| 实时通信 | Socket.IO ^4.8.1 |
| 对象存储 | Sealos 对象存储（@aws-sdk/client-s3） |
| 安全 | helmet、cors、express-rate-limit、bcryptjs |
| 日志 | winston ^3.11.0 |
| 校验 | joi ^17.11.0 |
| API前缀 | 统一 /api/v4/ |
| 响应格式 | ApiResponse 中间件统一注入 { success, code, message, data, timestamp, version, request_id } |
| 事务管理 | TransactionManager.execute() 统一管理 |
| 幂等性 | business_id / idempotency_key 唯一约束 |
| 账本体系 | Account → AccountAssetBalance → AssetTransaction（统一账本三表） |
| 物品体系 | Item（缓存层）+ ItemLedger（真相层）+ ItemHold（锁定层）三表模型 |
| 数据库配置 | timezone: +08:00, charset: utf8mb4, underscored: true, freezeTableName: true |
| 连接池 | max=40, min=5, acquire=10s, idle=60s |
| 模型数量 | 80+ 个 Sequelize 模型（models/index.js 实际加载） |
| 服务数量 | 80+ 个服务类 |

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

## 四、DIY 相关的真实数据库数据（2026-04-06 实时查询）

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
| phantom_green_8mm | 绿幽灵水晶 | 绿幽灵 | green | 8mm | 35 | ✅(media_id=31) |
| phantom_green_10mm | 绿幽灵水晶 | 绿幽灵 | green | 10mm | 58 | ❌ |
| amethyst_8mm | 紫水晶 | 紫水晶 | purple | 8mm | 25 | ❌ |
| amethyst_10mm | 紫水晶 | 紫水晶 | purple | 10mm | 42 | ❌ |
| amethyst_12mm | 紫水晶 | 紫水晶 | purple | 12mm | 68 | ❌ |
| blue_crystal_8mm | 海蓝宝 | 海蓝宝 | blue | 8mm | 30 | ❌ |
| blue_crystal_10mm | 海蓝宝 | 海蓝宝 | blue | 10mm | 55 | ❌ |
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
| points | 积分 | points | currency | 1 |
| budget_points | 预算积分 | points | quota | 1（已禁用） |

> ⚠️ **关键纠正**：`star_stone` 的 `budget_value_points = 0`，不是之前文档中写的 100。这意味着星石不能通过 budget_value_points 做等价换算。星石是直接定价货币（diy_materials.price 直接以星石为单位），不参与 budget_value_points 换算体系。

### 4.5 真实资产持有统计（2026-04-06 查询）

| asset_code | 持有人数 | 总可用余额 | 总冻结 |
|---|---|---|---|
| star_stone | 42 人 | 1,094,866 | 1,385 |
| red_core_shard | 11 人 | 470,025 | -3,700 |
| points | 9 人 | 181,573 | -7,670 |
| orange_core_shard | 5 人 | 3,000 | 0 |
| red_core_gem | 5 人 | 1,200 | 0 |
| budget_points | 1 人 | 1 | 0 |
| star_stone_quota | 1 人 | 9 | 0 |

关键发现：只有 5 种资产有用户持有余额（star_stone、red_core_shard、points、orange_core_shard、red_core_gem）。其他 7 种碎片/宝石（yellow/green/blue/purple）目前没有任何用户持有。

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
// params: { user_id, asset_code, amount, business_type, idempotency_key, meta }
// options: { transaction }

BalanceService.unfreeze(params, options = {})
BalanceService.settleFromFrozen(params, options = {})
BalanceService.getBalance(params, options = {})
BalanceService.getAllBalances(params, options = {})
```

全部是 static 方法，支持幂等性控制（idempotency_key），强制事务。

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

1. **支付方式选择**：文档中设计了"纯星石 / 纯源晶 / 混合支付"三种模式。但真实数据显示只有 5 种资产有用户持有（star_stone 42人、red_core_shard 11人、points 9人、orange_core_shard 5人、red_core_gem 5人），其他 7 种碎片/宝石没有任何用户持有。你是否要在第一版就支持混合支付？还是先只支持星石支付，后续再扩展？

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

### 7.1 可用支付资产（12 种碎片/宝石 + 星石）

| asset_code | 名称 | budget_value_points | 有用户持有 | 说明 |
|---|---|---|---|---|
| star_stone | 星石 | 0 | ✅ 42人，余额1,094,866 | 直接定价货币，不走 bvp 换算 |
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

> 注意：`points`（积分，bvp=1）有 9 人持有，余额 181,573。是否允许积分用于 DIY 支付？当前方案未包含积分。

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

- 你有 12 种碎片/宝石 + 星石，但只有 5 种有用户持有（star_stone 42人、red_core_shard 11人、points 9人、orange_core_shard 5人、red_core_gem 5人）
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
| phantom_green_8mm | 绿幽灵水晶 | 绿幽灵 | green | 8.0 | 35 | star_stone |
| phantom_green_10mm | 绿幽灵水晶 | 绿幽灵 | green | 10.0 | 58 | star_stone |
| amethyst_8mm | 紫水晶 | 紫水晶 | purple | 8.0 | 25 | star_stone |
| amethyst_10mm | 紫水晶 | 紫水晶 | purple | 10.0 | 42 | star_stone |
| amethyst_12mm | 紫水晶 | 紫水晶 | purple | 12.0 | 68 | star_stone |
| blue_crystal_8mm | 海蓝宝 | 海蓝宝 | blue | 8.0 | 30 | star_stone |
| blue_crystal_10mm | 海蓝宝 | 海蓝宝 | blue | 10.0 | 55 | star_stone |
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
| points | 积分 | points | currency | 1 |
| budget_points | 预算积分 | points | quota | 1（已禁用） |

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
| star_stone | 42 人 | 1,094,866 | 1,385 |
| red_core_shard | 11 人 | 470,025 | -3,700 |
| points | 9 人 | 181,573 | -7,670 |
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

**现状**：只有 5 种资产有用户持有（star_stone 42人、red_core_shard 11人、points 9人、orange_core_shard 5人、red_core_gem 5人）

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

### 决策 4：是否允许积分（points）用于 DIY 支付

**现状**：points 有 9 人持有，余额 181,573，budget_value_points = 1

**选项**：
- **A. 不允许**：DIY 支付只接受星石和源晶
- **B. 允许**：积分也可以用来支付 DIY 珠子

### 决策 5：溢价支付是否允许

**现状**：高价值源晶（如蓝源晶 bvp=800）用来买低价珠子（32 星石）会严重溢价

**选项**：
- **A. 允许溢价**：用户自己选择，多付的部分不退
- **B. 不允许溢价**：payments 总等价必须精确等于 total_price（不允许多付）
- **C. 允许小额溢价**：溢价不超过最小支付单位的 budget_value_points

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
| 粉水晶 | 8mm/10mm | 15/28 | red |
| 紫水晶 | 8mm/10mm | 18/35 | purple |
| 海蓝宝 | 8mm/10mm | 22/45 | blue |
| 绿幽灵 | 8mm/10mm | 25/50 | green |
| 橙石榴石 | 8mm/10mm | 20/40 | orange |
| 幻影绿 | 8mm | 68 | green |

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
| 实物履约（收货地址+物流） | ❌ 未建设 | 需要额外建设，不在本文档范围 |

### 修复优先级

本文档第六章「代码改动清单」中的 B1-B4 修复完成后，「用可叠加资产支付 DIY 实物饰品」的核心链路即可跑通。实物履约（收货地址、物流追踪）是独立的后续需求，不阻塞支付链路的打通。
