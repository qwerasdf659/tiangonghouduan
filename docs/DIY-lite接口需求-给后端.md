# DIY 手串设计台（diy-lite）· 前端接口需求（给后端）—— 后端审查批复版

> 面向对象：微信小程序前端 / Web 管理后台前端 / 后端
> 提出方：微信小程序前端；批复方：后端数据库项目
> 审查时间：2026-07-09
> 审查方式：后端实际代码（`routes/v4/diy.js`、`services/diy/*`、`models/Diy*.js`、`migrations/`、`admin/src/modules/diy/*`）+ Node.js（mysql2）直连真实数据库 `restaurant_points_dev` 逐表核对，未引用任何历史报告与备份文件。
> **权威原则：接口路径、响应格式、字段命名、数据结构一律以后端数据库项目为准；小程序前端与 Web 管理后台前端直接修改代码使用后端字段名，不做映射层，不做旧接口兼容。**

---

## 0. 审查总结论

1. **后端 DIY 引擎已存在且链路完整**：用户端 12 个接口（模板/素材/分组/钱包/作品全生命周期）+ 管理端模板/素材/作品/统计 CRUD 全部真实存在，作品有 `draft → frozen → completed / cancelled` 状态机，接通资产冻结（BalanceService）、物品铸造（ItemService）、实物发货（exchange_records + 地址快照）。原文档第 1 节"复用接口"全部核实有效。
2. **本需求的核心缺口在一张表**：`diy_materials` 真实表结构中没有 `material_type / meaning / weight / energy / pairing / five_elements`，也没有异形珠几何字段。解决方式：**一支 Sequelize 迁移 + 模型/服务/管理后台表单同步**，完全在现有技术栈内，无架构变更。
3. **原文档有 7 处假设与后端权威不符**（见第 2 节），以后端为准修正，小程序前端直接改代码适配。
4. **真实数据未就绪，代码就绪 ≠ 可上线**：真实库中素材 21 条仅 3 条启用且 3 条全部缺图；模板 4 个仅 1 个已发布且是镶嵌（slots）吊坠，**没有任何已发布的串珠（beading）手链模板**；`diy_works` 为 0 行。上线前必须完成数据运营（见 5.4）。
5. 拍板事项已定稿（第 7 节，含业界方案对照）：①②③④⑥ 按推荐通过；⑤ 升级为「`shape` 改 VARCHAR + 代码层枚举」方案，为唯一待老板最终确认项（次选：ENUM 追加）。

---

## 1. 后端技术权威现状（真实代码 + 真实库核对）

### 1.1 技术栈（新增功能必须遵循）

- Node.js + Express + Sequelize（MySQL），服务层 `DiyServiceFacade` 委托 4 个子服务（Template/Work/Material/AdminQuery），路由经 `getService('diy')` 调用，写操作走 `TransactionManager.execute`。
- 响应统一信封（`utils/ApiResponse.js`）：`{ success, code, message, data, timestamp }`，前端一律从 `data` 取业务数据。
- 命名：全部 `snake_case`，主键 `{table}_id`，业务编号由 `OrderNoGenerator` 生成（DM/DT/DW 前缀）。
- 图片：`media_files` 表 + Sealos 对象存储，`public_url` 为虚拟字段自动输出；**表中存有 `width`/`height`**；管理后台上传素材图时已强制 `trim_transparent: true`（自动裁掉透明边距）。
- 管理后台：Alpine.js + Vite + Tailwind 多页应用，页面模块在 `admin/src/modules/diy/pages/`，API 封装在 `admin/src/api/diy.js`。

### 1.2 `diy_materials` 真实表结构（SHOW COLUMNS 核对，2026-07-09）

```
diy_material_id BIGINT UNSIGNED PK | material_code VARCHAR(100) UNIQUE | display_name VARCHAR(200)
material_name VARCHAR(100) | group_code VARCHAR(50) | diameter DECIMAL(5,1)
shape ENUM('circle','ellipse','oval','square','heart','teardrop') | price DECIMAL(10,2)（强制整数定价）
price_asset_code VARCHAR(50)（现有数据全部为 star_stone） | stock INT（-1=无限,0=售罄）
is_stackable | image_media_id（FK→media_files，ON DELETE RESTRICT） | category_id | sort_order | is_enabled
meta JSON | created_at | updated_at
```

**确认：前端所需的 6 个展示字段与异形珠几何字段，当前一个都不存在**，需按第 3 节迁移新增。

### 1.3 真实数据现状（直连库查询结果）

| 表 | 现状 | 对上线的影响 |
| --- | --- | --- |
| `diy_materials` | 21 条，分组 yellow(8)/red(3)/green(3)/purple(3)/blue(2)/orange(2)；**仅 3 条 is_enabled=1，且这 3 条 image_media_id 全部为 NULL**（历史悬空图片指针被迁移 20260624090000 置空） | 用户端珠子列表几乎为空且全部无图，**必须重传图片并批量启用** |
| `diy_templates` | 4 条，仅 id=65（项链12，slots 镶嵌模式）published；两个串珠模板（手链/项链）均为 draft | **diy-lite 是串珠玩法，无可用模板**，须配置并发布手链模板 |
| `diy_works` | 0 条 | 无存量兼容负担，schema 可放心定死 |
| `asset_group_defs` | yellow/red/orange/green/blue/purple 六个材料分组已定义 | 与管理后台 GROUP_LABELS 一致，无需改 |

另发现：模板 65 的 `layout.slot_definitions` 里残留 `_previewMaterial` 脏数据（含绝对 URL），需数据治理清除。

### 1.4 现有接口清单（全部核实存在）

| 用途 | 方法与路径 | 核对结论 |
| --- | --- | --- |
| 模板列表（published+enabled） | `GET /api/v4/diy/templates` | ✅ |
| 模板详情 | `GET /api/v4/diy/templates/:id` | ✅ 含 `bead_rules/sizing_rules/capacity_rules`（JSON 列） |
| 珠子素材列表 | `GET /api/v4/diy/templates/:id/beads` | ✅ 支持 `group_code/diameter/keyword/slot_id`；⚠️ 固定 `limit 200` 无分页 |
| 材料分组 | `GET /api/v4/diy/material-groups` | ✅ 返回 `[{ group_code, count, sample_name }]` |
| 支付钱包 | `GET /api/v4/diy/templates/:id/payment-assets` | ✅ 返回该模板计价货币 + 用户余额 |
| 作品列表/详情/保存/删除 | `GET·POST /api/v4/diy/works`、`GET·DELETE /works/:id` | ✅ 详情**仅作者可读（403）**，分享场景见拍板③ |
| 确认/完成/取消 | `POST /works/:id/confirm · complete · cancel` | ✅ 服务端定价、资产冻结/结算/解冻、铸造物品、生成兑换单 |
| 作品小程序码 | `GET /works/:id/qrcode` | ⚠️ 路由存在，`QRCodeService` 抛"待微信小程序上线后对接" |
| 用户图片上传（作品预览图通道） | `POST /api/v4/user/images/upload`（multipart，返回 media_id） | ✅ 已存在，保存作品时把 media_id 传 `preview_media_id` |

---

## 2. 原文档假设与后端权威的差异修正（小程序前端必须改）

| # | 原文档/前端假设 | 后端权威（以此为准） | 前端改法 |
| --- | --- | --- | --- |
| 1 | `design_data.beads` 每颗存 `diy_material_id` | 后端校验与定价均按 **`material_code`** 提取（WorkService.confirmDesign / _validateDesignMaterials） | beads 数组改存 `material_code` |
| 2 | `five_elements` 为逗号分隔字符串 `"water,wood"` | 后端 JSON 多值一律用 **JSON 数组**（同 `material_group_codes` 惯例）→ `["water","wood"]` | 按数组解析 |
| 3 | 需要新字段 `image_bbox_ratio` | **不新增**。上传已裁透明边，`image_media.width / height` 即真实边界比例 | 用 `image_media.width/height` 计算 |
| 4 | `price` 按人民币理解 | `price` 是 **star_stone（星石）资产整数计价**（模型层强制整数校验），非 RMB | 展示单位改星石；不出现"¥" |
| 5 | "加入购物车"电商流程 | 后端**无购物车概念**。链路为：`POST /works` 存稿 → `confirm`（传 `payments` 冻结星石）→ `complete`（扣减+铸造+兑换单发货） | "购物车/下单"映射到该三步 |
| 6 | 手围cm→绳长→容量公式由后端"确认前端算法" | 后端 `sizing_rules` 现行权威模型是 **S/M/L 档位 + bead_count**（非手围公式）；已定稿按 4.3 扩展 JSON schema（拍板①=B） | 按 4.3 下发规则实现 |
| 7 | 分享好友直接 `GET /works/:id` 还原 | 该接口非作者 **403**，分享还原走新增只读接口（第 4.1 节，拍板③） | 分享页调 `/works/:id/shared` |

响应格式补充：所有接口返回 `{ success, code, message, data, timestamp }`；列表类接口 `data` 为 `{ rows, count }` 或数组，前端按后端实际返回处理，不自行包装。

---

## 3. 后端迁移方案：`diy_materials` 新增字段（核心交付）

一支迁移完成（命名遵循现有惯例，如 `2026XXXXXXXXXX-diy-materials-add-display-and-geometry-fields.js`）：

| 新列 | 类型（MySQL） | 空/默认 | 说明 |
| --- | --- | --- | --- |
| `material_type` | ENUM('crystal','stone','metal','matte') | NOT NULL DEFAULT 'crystal' | 渲染光影档位；**闭合集合**（档位由前端渲染引擎定义，加档位本就要改前端代码），用 ENUM |
| `meaning` | VARCHAR(500) | NULL | 寓意文案 |
| `weight` | DECIMAL(6,1) | NULL | 单颗净重（克，1 位小数），仅展示 |
| `energy` | VARCHAR(200) | NULL | 能量属性文案 |
| `pairing` | VARCHAR(500) | NULL | 搭配建议文案 |
| `five_elements` | JSON | NULL | 五行数组，元素取值 `metal/wood/water/fire/earth`，如 `["water","wood"]` |
| `size_length_mm` | DECIMAL(5,1) | NULL | 异形珠长边；圆珠留空 |
| `size_width_mm` | DECIMAL(5,1) | NULL | 异形珠短边；圆珠留空 |
| `bore_orientation` | ENUM('none','along_length','along_width') | NOT NULL DEFAULT 'none' | 穿绳方向；**闭合集合**（物理上仅此三种），用 ENUM |

同迁移内处理 `shape`（拍板⑤，推荐方案）：**从 ENUM 改为 `VARCHAR(20)`** + 模型层 `validate.isIn` + 常量文件（`constants/DiyShape.js`，沿用项目 `constants/` 惯例），初始合法值 `circle/ellipse/oval/square/heart/teardrop/tube/oblate`。设计原则：`status`、`bore_orientation` 这类**闭合状态集**用 ENUM；`shape` 是**开放集合**（管珠/药片之后还会有跑环、盘珠、切角、雕件……），每加一种珠形只改一行常量、不跑生产 DDL——这也是阿里 MySQL 规范"禁用 ENUM 存开放集合"的口径。次选（若老板否决）：ENUM 末尾追加 `tube/oblate`（MySQL 8 instant DDL，但以后每加形状都要一支迁移）。

迁移骨架（供后端实现参考，与项目现有迁移风格一致）：

```javascript
// up：全部 addColumn + shape 改列，包在一个事务里
await queryInterface.addColumn('diy_materials', 'material_type', {
  type: Sequelize.ENUM('crystal', 'stone', 'metal', 'matte'),
  allowNull: false, defaultValue: 'crystal', comment: '材质渲染档位'
}, { transaction: t })
// ... meaning / weight / energy / pairing / five_elements / size_length_mm / size_width_mm / bore_orientation 同理
await queryInterface.changeColumn('diy_materials', 'shape', {
  type: Sequelize.STRING(20),   // ENUM → VARCHAR，合法值由模型层 isIn + constants/DiyShape.js 约束
  allowNull: false, defaultValue: 'circle', comment: '切割形状（开放集合，代码层枚举约束）'
}, { transaction: t })
// down：removeColumn ×9 + shape 还原为原 ENUM
```

配套代码改动点（不在此处贴全码，实施时按文件落地）：

1. 新增 `constants/DiyShape.js`：形状合法值常量（含中文标签映射，供管理后台/校验复用）。
2. `models/DiyMaterial.js`：新增 9 个字段定义；`shape` 改 STRING + `validate.isIn(DiyShape 常量)`；`five_elements` 加自定义校验（必须是数组且元素 ∈ 五行枚举）；`weight/size_*` 加 getter 转 Number（与 `diameter` 现有写法一致）。
3. `services/diy/MaterialService.js`：
   - `createMaterial` 的 create 载荷与 `updateMaterial` 的 `allowedFields` 白名单各追加 9 个字段；
   - **顺手修 Bug**：`createMaterial` 中 `shape: data.shape || 'round'` —— `'round'` 不在合法值内，未传 shape 时必然报错，应改为 `'circle'`。
4. 用户端 `getUserMaterials` 查询本身无需改（`findAll` 返回全列，新字段自动下发）；按已定稿的拍板④在此处加序列化白名单 + 库存三态掩码。

以上全部是现有技术路线内的常规操作（Sequelize 迁移 + 模型 + 服务白名单），**可复用**现有事务/校验/日志模式，**可扩展**（后续再加字段照此模板）。

---

## 4. 后端需新增/调整的接口与数据契约

### 4.1 新增：作品分享只读接口（支撑分享还原，拍板③）

```
GET /api/v4/diy/works/:id/shared     （无需登录）
```

- 实现：`DiyWorkService.getSharedWork(workId)`，路由挂在 `router.use('/works', authenticateToken)` **之前**。
- 脱敏返回（白名单）：`diy_work_id、work_name、diy_template_id、design_data、preview_media(public_url)、template(display_name, layout, bead_rules, sizing_rules, capacity_rules)`；**不返回** `account_id、total_cost、idempotency_key、状态时间戳`。
- 小程序分享路径：`/packageDIY/diy-lite/diy-lite?workId={diy_work_id}`，好友打开调此接口还原。

### 4.2 `design_data` 权威 schema（beading 模式，后端定义，前端照用）

```json
{
  "mode": "beading",
  "beads": [
    { "position": 0, "material_code": "DM26033100000191", "diameter": 8.0 }
  ],
  "wrist_size_cm": 16,
  "wrap_count": 1
}
```

- 后端强校验：`mode`、`beads[].material_code`（存在且启用、分组合法——现有 `_validateDesignMaterials` 已覆盖）。
- `wrist_size_cm / wrap_count` 为还原参数，后端透传存储（JSON 列，无迁移）。
- 保存草稿即 `POST /api/v4/diy/works`；再次保存带 `diy_work_id` 走更新。**小程序删除本地 storage 草稿方案。**

### 4.3 `sizing_rules` 手围扩展（拍板①已定稿方案 B，生效）

`sizing_rules` 是 JSON 列，扩展 key 零迁移。后端在 `DiyTemplate` 模型注释中定义 schema，管理后台模板表单（已支持 JSON 编辑）直接录入：

```json
{
  "default_size": "M",
  "size_options": [ { "label": "M", "display": "中号 (约17cm)", "bead_count": 18, "radius_x": 120, "radius_y": 120 } ],
  "wrist_options": { "min_cm": 10, "max_cm": 22, "step_cm": 0.5, "default_cm": 16 },
  "wrap_options": [
    { "wraps": 1, "length_factor": 1.0 },
    { "wraps": 2, "length_factor": 2.05 },
    { "wraps": 3, "length_factor": 3.1 }
  ],
  "capacity_formula": { "rope_mm": "wrist_cm * 10 * length_factor", "margin_mm": 10 }
}
```

容量口径（后端权威）：`绳长(mm) = 手围cm × 10 × 圈数系数`，可用绳长减 `margin_mm`（沿用 `bead_rules.margin`），圆珠按 `diameter` 占位、异形珠按 `bore_orientation` 对应边（along_length 取 `size_length_mm`，along_width 取 `size_width_mm`）占位；`capacity_rules.min_beads/max_beads` 仍为硬上下限。前端严格按此实现，不再自行估算。

### 4.4 其他后端调整

| 项 | 说明 | 优先级 |
| --- | --- | --- |
| `getUserMaterials` 分页 | 现固定 `limit 200`，几百种珠子会截断；加 `page/page_size`（复用 `findAndCountAll` 模式） | 上线前 |
| 库存掩码（拍板④已定稿） | 用户端 beads 序列化白名单，`stock` 只输出 -1/0/1 三态；同时隐藏 `meta`、`is_stackable` 等内部字段 | 上线前 |
| QRCode 对接 | 路由已有，`QRCodeService` 待接 `wxacode.getUnlimited` + Sealos 缓存（注释已写明方案） | 可后延（分享用 `?workId=` 链接即可先上线） |
| 模板 65 脏数据 | 清除 `layout` 内 `_previewMaterial` 残留 | 数据治理 |

**成本价/进货价/供应商字段确认：`diy_materials` 表根本没有这些列，无泄密风险**；`price` 即售价（星石），可放心下发。

---

## 5. 问题归属清单

### 5.1 后端数据库项目的问题（本项目改）

1. `diy_materials` 缺 9 个字段（第 3 节迁移）——核心缺口。
2. `MaterialService.createMaterial` 的 `shape || 'round'` 枚举 Bug。
3. 无分享只读接口（4.1）。
4. `getUserMaterials` 无分页 + 用户端返回全模型字段（含精确库存）。
5. `QRCodeService` 未实现（已知 TODO，可后延）。
6. `design_data` beading schema 未含 `wrist_size_cm/wrap_count` 约定（4.2 补充定义，仅文档/校验层面）。

### 5.2 Web 管理后台前端的问题（admin/ 改）

1. `diy-material-management.js` + 对应 HTML：表单缺新 9 字段的录入控件（`emptyForm()`、`openEditForm()`、`saveMaterial()` 载荷、表格列）。`material_type/bore_orientation` 用下拉、`five_elements` 用多选 checkbox 存数组、其余文本/数字输入——Alpine.js 双向绑定加字段即可，**完全契合现有技术栈**。
2. 模板管理页：`sizing_rules` 已是 JSON 编辑，无代码改动；建议在表单旁加 4.3 schema 的占位提示文案（低成本）。
3. 批量填充工具（拍板②已定稿配套项，**要做**）：素材列表按 `material_name` 批量填充五行/文案/材质档位——逐颗录入的运营成本用一次性工具解决，避免引入"属性继承 + 运行时合并"的查询链路技术债。
4. 素材列表加"资料完整度"提示列（拍板⑥配套）：标出缺文案/缺五行/缺图的珠子，运营看板化补录。

### 5.3 微信小程序前端的问题（小程序项目改，按第 2 节权威修正）

1. 删除 `bead-data.ts` 离线数据，改调 `GET /templates/:id/beads`，**直接使用后端字段名**（`material_type/meaning/weight/energy/pairing/five_elements/size_length_mm/size_width_mm/bore_orientation`），不做映射。
2. `design_data.beads` 用 `material_code`；`five_elements` 按 JSON 数组解析。
3. 异形珠比例改用 `image_media.width/height`，删除 `image_bbox_ratio` 期待。
4. 价格展示改星石（整数），删除人民币假设；"购物车/下单"重构为 `works → confirm(payments) → complete(address_id)` 流程，钱包用 `payment-assets` 接口。
5. 草稿/还原/分享删除本地 storage 方案：保存走 `POST /works`，还原走 `GET /works/:id`，分享还原走 `GET /works/:id/shared`；预览图经 `POST /api/v4/user/images/upload` 换 media_id 后随作品保存。
6. 手围/圈数/容量按 4.3 下发的 `sizing_rules` 严格实现，删除前端写死规则。
7. 五行雷达图空态逻辑保留（字段为 NULL 的珠子不计入统计）。

### 5.4 数据运营问题（非代码，上线阻塞项）

1. 3 条启用素材图片全部缺失 → 管理后台重传（上传即自动裁透明边）。
2. 18 条素材未启用；几百种珠子需批量录入（含新字段文案与五行）。
3. **无已发布串珠手链模板** → 配置 `DIY_BRACELET` 模板（含 4.3 的 sizing_rules）并发布。
4. 珠子图片规范：带透明通道 PNG/WebP、实物居中（后端管道已裁边，Sealos 即 CDN 通道，架构无需改）。

---

## 6. 执行步骤（建议顺序，项目未上线、无兼容负担，一次到位）

| 步骤 | 内容 | 项目 |
| --- | --- | --- |
| 1 | 迁移新增 9 字段 + shape 按拍板⑤定稿改造 + 修 'round' Bug + 模型/服务白名单（第 3 节） | 后端 |
| 2 | 分享只读接口 + beads 分页 + 用户端序列化白名单/库存掩码（第 4 节） | 后端 |
| 3 | `design_data`/`sizing_rules` schema 定稿写入模型注释（4.2/4.3） | 后端 |
| 4 | 素材表单加 9 字段控件；模板表单加 schema 提示；批量填充工具 + 完整度提示列 | 管理后台 |
| 5 | 重传素材图、批量录入/启用素材、发布手链模板、清模板 65 脏数据 | 数据运营 |
| 6 | 小程序按 5.3 清单改造对接，联调 | 小程序 |
| 7 | QRCode 对接微信（不阻塞上线） | 后端 |

测试要求（后端现有 Jest 体系）：`tests/services/DIYService.test.js` 补新字段 CRUD、五行数组校验、分享接口脱敏、库存掩码用例。

---

## 7. 拍板事项定稿（含业界方案对照）

> 决策边界：项目未上线、无兼容负担、可一次性投入，以长期维护成本低/技术债最小为准；全部方案必须落在现有技术栈（Node.js + Express + Sequelize + JSON 配置列 + Alpine.js 管理后台）内，不引入新框架/中间件/新表。
> **定稿状态：①②③④⑥ 已定稿；⑤ 推荐"shape 改 VARCHAR"，为唯一待老板最终确认项。**

### ① 手围模型 → 定稿 B：`sizing_rules` JSON 扩展

| 业界 | 做法 |
| --- | --- |
| 游戏公司（网易/米哈游装备合成） | 数值规则做成策划配置表（本质 JSON）下发，客户端只是执行引擎，改规则不发版 |
| 大厂电商定制类（天猫珠宝定制） | 手围 10~22cm 连续值输入，规则服务端下发；S/M/L 档位是服装快消的精度妥协 |
| 小公司 | 规则硬编码在前端——即 diy-lite 被判定废除的现状 |

区别本质：**规则放配置（改数据）还是放代码（改代码发版）**。`sizing_rules` 本来就是 JSON 列，扩展 key 零迁移、管理后台已支持 JSON 编辑，schema 仍由后端定义（4.3）。

### ② 字段录入维度 → 定稿 A：逐颗录入 + 批量填充工具

| 业界 | 做法 |
| --- | --- |
| 淘宝/京东 | 类目属性模板 + SPU 继承 + SKU 覆盖三层体系——为亿级商品建的基础设施，需专门属性平台养着 |
| 游戏公司 | 物品表一行一条、字段填满，策划逐行填，重复靠批量工具；**运行时不做属性继承合并** |
| 二手/饰品交易平台（BUFF/igxe） | 商品维度直接存，无继承 |

区别本质：**继承省录入成本，但把复杂度永久转移到查询链路**（多一层合并逻辑 + "这个值从哪来"的排查成本）。几百颗珠子的规模远不到需要属性继承的量级；录入成本用管理后台一次性批量工具（5.2-3）解决。

### ③ 分享还原 → 定稿 A：新增脱敏只读接口 `/works/:id/shared`

业界无分歧：腾讯游戏战绩/皮肤分享、淘宝搭配分享、微信小程序官方 scene 模式，全部是**独立公开只读接口 + 字段白名单**。直接放开 `GET /works/:id` 会暴露 `total_cost`（价格快照）、`idempotency_key`、`account_id`，大厂安全评审必打回。可选增强（不阻塞）：大厂会加 share_token 防自增 ID 遍历爬取，未上线量小先用 `diy_work_id`，将来加 token 只是加一列，不构成债务。

### ④ 库存口径 → 定稿 A：掩码三态 + 序列化白名单

| 业界 | 做法 |
| --- | --- |
| 大厂电商 | 从不下发精确库存；"仅剩 N 件"是营销阈值话术非真实值（精确库存是竞对推算销量的爬虫目标） |
| 游戏虚拟物品交易平台（BUFF） | 公开的是 C2C 挂单深度（交易信息本身），与平台自营库存不是一个场景 |
| 小公司 | ORM 整行直接 `res.json` 扔出去——`getUserMaterials` 现状，典型泄密点 |

定稿内容：用户端 beads 序列化白名单（即大厂 DTO/VO 层模式），`stock` 只输出 -1/0/1。一次性成本换来"以后给表加任何内部字段都不会意外漏给前端"，是六项中对长期技术债影响最实在的一项。将来做"仅剩 N 件"营销，正确做法也是后端下发营销标志而非精确数。

### ⑤ `shape` 字段策略 → 推荐：改 `VARCHAR(20)` + 代码层枚举（唯一待最终确认项）

| 业界 | 做法 |
| --- | --- |
| 阿里 MySQL 开发规范 | **禁用 ENUM 类型**，用 varchar/tinyint + 代码层枚举（ENUM 每加值都要生产 DDL） |
| 游戏公司 | 配置表字符串 + 出包前校验管线，不用 DB ENUM 存开放集合 |

设计原则（本项目采用）：`status`（draft/frozen/completed/cancelled）、`bore_orientation`（物理上仅三种）是**闭合状态集**，ENUM 合适、维持现状；`shape` 是**开放集合**（tube/oblate 之后还会有跑环、盘珠、切角、雕件……），推荐趁未上线改 `VARCHAR(20)` + `validate.isIn` + `constants/DiyShape.js`，以后加珠形只改一行常量、零 DDL。次选：ENUM 追加 tube/oblate（MySQL 8 instant DDL 不贵，但每加形状都要一支迁移）。**请老板确认选主推还是次选。**

### ⑥ 运营文案 → 定稿：DB 可空 + 应用层上架门槛

业界通行做法一致：内容字段 DB 层从不 NOT NULL，靠"发布门槛"控制——淘宝商品发布完整度检查是应用层可配置规则，游戏是策划表校验脚本。本项目已有先例：`createMaterial` 强制图片（渲染必需）；文案是体验增强，分级处理。前端空态已实现，运营分批补录，配套管理后台"资料完整度"提示列（5.2-4）。

### 定稿汇总

| # | 结论 | 业界对应模式 | 状态 |
| --- | --- | --- | --- |
| ① | B：`sizing_rules` JSON 扩展（4.3） | 游戏配置表驱动 / 电商规则下发 | ✅ 定稿 |
| ② | A：逐颗录入 + 批量填充工具 | 游戏物品表模式 | ✅ 定稿 |
| ③ | A：脱敏只读接口（4.1） | 全行业一致 | ✅ 定稿 |
| ④ | A：掩码三态 + 序列化白名单 | 大厂 DTO/VO 层 | ✅ 定稿 |
| ⑤ | 主推 shape 改 VARCHAR + isIn；次选 ENUM 追加 | 阿里 MySQL 规范禁用 ENUM 存开放集合 | ⏳ 待老板确认 |
| ⑥ | 可空 + 后台完整度提示 | 上架门槛模式 | ✅ 定稿 |

六项均不引入新框架/中间件/新表，全部落在现有 Sequelize 迁移 + 服务层白名单 + JSON 配置列 + Alpine.js 表单技术路线内。

---

## 8. 对原文档"问题清单"的逐条批复

1. **能否补 5 个展示字段？** 能，做实体列（第 3 节）；录入维度已定稿逐颗录入 + 管理后台批量填充（拍板②）。
2. **能否补 `five_elements`？** 能，JSON 数组（非逗号字符串），枚举 `metal/wood/water/fire/earth`。
3. **异形珠几何？** 补 `size_length_mm/size_width_mm/bore_orientation` 三列；`image_bbox_ratio` 不做，用 `image_media.width/height`。
4. **图片规范与 CDN？** 上传管道已裁透明边、`public_url` 走 Sealos（即 CDN 通道）；存量 3 条启用素材缺图需重传（数据问题非架构问题）。
5. **容量公式？** 以 `sizing_rules` JSON 扩展下发（4.3），公式 `手围cm×10×圈数系数−margin_mm`，异形珠按 `bore_orientation` 取边。
6. **库存口径？** 已定稿掩码三态 + 序列化白名单（拍板④）。
7. **商业机密字段？** 表中无成本/供应商列；掩码后无泄露面。
8. **草稿/还原/分享？** 直接用现有 `POST /works` + `GET /works/:id`，分享用新增 `/works/:id/shared`；`design_data` schema 见 4.2；预览图上传通道 `POST /api/v4/user/images/upload` 已存在。

---

**说明**：本文档为唯一权威对接文档。字段命名 `snake_case`、接口沿用 `/api/v4/diy/` 体系、响应信封 `{ success, code, message, data, timestamp }`；小程序与管理后台按本批复直接使用后端字段名实现，不做映射与旧格式兼容。
