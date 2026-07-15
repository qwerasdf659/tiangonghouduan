# DIY 饰品定制 — 微信小程序前端对接文档

> 版本：v1.0（2026-07-15）
> 数据来源：当前 worktree 真实代码（routes/v4/diy.js、services/diy/*、models/DiyTemplate.js、models/DiyWork.js、admin/src/modules/diy/pages/diy-slot-editor.js）
> 后端为唯一权威：接口路径 / 字段名 / 响应格式 / 换算规则以后端为准，小程序直接消费后端字段名，**不做映射层**。
> 本文档只覆盖 DIY 饰品定制功能（含"饰品中心位置标注/槽位镶嵌"），不含其它业务域。

## 目录

1. [功能描述](#一功能描述)
2. [业务模型与角色分工](#二业务模型与角色分工)
3. [接口契约（用户端 13 个端点）](#三接口契约用户端-13-个端点)
4. [模板与槽位数据结构](#四模板与槽位数据结构)
5. [标准对齐（必读）](#五标准对齐必读)
6. [渲染流程与完整下单时序](#六渲染流程与完整下单时序)

## 一、功能描述

DIY 饰品定制让用户在小程序里基于运营配置的**款式模板**，自由排布珠子/镶嵌素材，生成一件专属饰品设计，确认后冻结并扣减用户资产（星石 / 源晶体系），铸造成一件实物物品并进入发货链路。

### 1.1 两种设计模式

后端用一套模板体系支撑两种模式，由 `layout.shape` 区分：

| 模式 | `layout.shape` | 用户交互 | 典型品类 |
|---|---|---|---|
| **串珠模式（beading）** | `circle` / `ellipse` / `arc` / `line` | 沿一条绳线按顺序摆放珠子，颗数由手围换算 | 手链、项链 |
| **镶嵌模式（slots）** | `slots` | 在底图预设的**固定位置（槽位）**上填充素材 | 吊坠、戒指、有固定镶口的饰品 |

> "饰品中心位置标注"页面（管理端 `diy-slot-editor.html`）产出的就是**镶嵌模式**的 `slot_definitions`——运营在款式底图上标注每个镶口的位置、大小、旋转角和填充约束，小程序据此在对应位置渲染可点击的槽位并让用户填充素材。

### 1.2 用户操作主线

```
浏览款式模板 → 进入设计器 → (串珠:选手围+摆珠 / 镶嵌:逐槽填素材)
  → 保存草稿 → 确认设计(冻结资产) → 完成(扣减+铸造物品+可填收货地址)
```

对应作品状态机：`draft（草稿）→ frozen（已冻结）→ completed（已完成）`，`frozen` 可 `cancel` 回退解冻。

### 1.3 小程序需要实现的页面（建议）

- 款式列表页（按分类分组展示已发布模板）
- 设计器页（核心：加载底图 + 渲染珠位/槽位 + 素材面板 + 实时计价/长度）
- 手围选择组件（仅串珠模式）
- 确认下单页（展示应付金额、选择支付资产）
- 我的作品列表 / 作品详情页
- 作品分享（小程序码）

## 二、业务模型与角色分工

### 2.1 三张核心表

| 表 | 主键 | 作用 | 谁写 |
|---|---|---|---|
| `diy_templates` | `diy_template_id` | 款式模板：底图、布局、珠子/尺寸/容量规则、可用素材分组 | 管理端配置 |
| `diy_materials` | `diy_material_id` | 素材库：珠子/配饰/吊坠，含价格、物理尺寸、五行寓意等 | 管理端配置 |
| `diy_works` | `diy_work_id` | 用户作品：设计数据、消耗明细、状态、铸造出的物品 | 用户端产生 |

### 2.2 关键概念

- **账户体系**：作品挂在 `account_id` 上。小程序传的是登录态的 `user_id`，后端在 `/works` 中间件里自动换算成 `account_id`（`getAccountIdByUserId`），前端**无需关心 account_id**。
- **支付资产**：DIY 只接受星石（`star_stone`）和源晶体系，**禁止用积分（points/budget_points）支付**（后端硬校验）。
- **服务端权威定价**：珠子单价、应付总额、手围算珠、成品长度校验**全部由后端计算**，前端传的 `total_cost` 一律不被信任，前端只展示后端返回的数字，不自行算价。
- **物品铸造**：`complete` 后作品变成一件 `items` 实例（物品实例，带双录账本 + 锁），进入背包 items 轨，并写 `exchange_records` 打通实物发货。

### 2.3 后端服务结构（前端无需感知，仅供排障参考）

路由 `routes/v4/diy.js` → `getService('diy')`（DiyServiceFacade 门面）→ 委托到 4 个子服务：`TemplateService`（模板）、`WorkService`（作品/状态流转/支付资产）、`MaterialService`（素材）、`QRCodeService`（小程序码）。Facade 保键，拆分对前端零影响。

## 三、接口契约（用户端 13 个端点）

顶层路径前缀：`/api/v4/diy`。以下所有路径均在此前缀下。

### 3.0 统一响应包络

所有接口统一返回：

```json
{ "success": true, "code": "SUCCESS", "message": "文案", "data": {} }
```

失败时 `success=false`，`code` 为错误码（业务错误码见 [5.4](#54-错误码约定)），`data` 可能携带明细（如毫米数据）。前端统一按 `success` 判定，按 `code` 做分支引导。

### 3.1 鉴权约定

- **需要登录的接口**：请求头带 `Authorization: Bearer <token>`。作品域（`/works/*`）、`payment-assets`、`qrcode` 全部需要登录。
- **公开接口**：模板列表/详情、珠子素材、手围估算、材料分组无需登录（便于未登录预览）。
- **X-Device-Id（重要）**：与其它接口一致，所有请求应携带持久化设备标识头 `X-Device-Id`（小程序用 `wx.setStorageSync` 生成并持久化一个 UUID）。详见 [5.5](#55-x-device-id-设备标识)。

### 3.2 端点总表

| # | 方法 | 路径 | 登录 | 说明 |
|---|---|---|---|---|
| 1 | GET | `/templates` | 否 | 模板列表（仅已发布+已启用） |
| 2 | GET | `/templates/:id` | 否 | 模板详情 |
| 3 | GET | `/templates/:id/beads` | 否 | 模板可用珠子/素材 |
| 4 | GET | `/templates/:id/estimate` | 否 | 手围算珠估算（串珠模式） |
| 5 | GET | `/templates/:id/payment-assets` | 是 | 用户可用支付资产余额 |
| 6 | GET | `/material-groups` | 否 | 材料分组（Tab 用） |
| 7 | GET | `/works` | 是 | 我的作品列表 |
| 8 | GET | `/works/:id` | 是 | 作品详情 |
| 9 | POST | `/works` | 是 | 保存作品（创建/更新草稿） |
| 10 | DELETE | `/works/:id` | 是 | 删除作品（仅 draft） |
| 11 | POST | `/works/:id/confirm` | 是 | 确认设计（冻结资产，draft→frozen） |
| 12 | POST | `/works/:id/complete` | 是 | 完成设计（扣减+铸造，frozen→completed） |
| 13 | POST | `/works/:id/cancel` | 是 | 取消设计（解冻，frozen→cancelled） |
| — | GET | `/works/:id/qrcode` | 是 | 生成/获取作品小程序码 |

### 3.3 端点详情

#### ① GET `/templates` — 模板列表

- 无参数。仅返回 `status='published'` 且 `is_enabled=true` 的模板，按 `sort_order` 升序。
- `data` 为**模板对象数组**（媒体字段已安全化，见 [4.1](#41-模板对象diy_template)）。
- 前端可按 `category`（分类）自行分组展示。

#### ② GET `/templates/:id` — 模板详情

- 路径参数 `id` = `diy_template_id`。
- `data` 为单个模板对象。用户端序列化已隐藏对象存储 key，补齐 `public_url` 与衍生图 URL。
- 设计器进入前必调，用它拿到 `layout`（布局/槽位）、`bead_rules`、`sizing_rules`、`material_group_codes`、底图 URL。

#### ③ GET `/templates/:id/beads` — 模板可用素材

- Query：`group_code`（分组码）、`diameter`（直径 mm）、`keyword`（名称模糊）、`slot_id`（按槽位约束过滤）、`item_type`（素材大类：`beads`珠子/`accessories`配饰/`pendants`吊坠）。
- 返回**数组、无分页、上限 200 条**。素材字段见 [4.3](#43-素材对象用户端)。
- `slot_id` 传入时，后端按该槽位 `allowed_diameters` 自动过滤——镶嵌模式点某个槽位时应带上 `slot_id` 拉取该槽位可填素材。

#### ④ GET `/templates/:id/estimate` — 手围算珠估算（仅串珠模式）

- Query（均必填）：`wrist_size_mm`（手围毫米）、`diameter`（主珠直径毫米）。
- **换算规则收敛在后端，前端不写公式**，只展示返回值。镶嵌模式模板调用会返回错误码 `DIY_TEMPLATE_NOT_BEADING`。
- 返回：

```json
{
  "wrist_size_mm": 155,
  "diameter": 10,
  "elastic_margin_mm": 15,
  "target_length_mm": 170,
  "recommend_bead_count": 17,
  "min_length_mm": 155,
  "max_length_mm": 185,
  "matched_size_label": "M"
}
```

- `recommend_bead_count` 是参考颗数（已按 `capacity_rules` 收敛）；`min_length_mm`/`max_length_mm` 是可制作长度区间，与确认时的硬校验同口径。

#### ⑤ GET `/templates/:id/payment-assets` — 用户支付资产余额【需登录】

- 返回该模板下珠子实际使用的定价货币 + 用户在这些货币上的余额，用于"确认设计"页展示钱包、选择支付方式。
- 前端据此判断余额是否够付，不够则引导充值/换素材。

#### ⑥ GET `/material-groups` — 材料分组

- 返回分组数组：`[{ group_code, count, sample_name }]`，用于素材面板的 Tab。

#### ⑦ GET `/works` — 我的作品列表【需登录】

- Query 支持分页与筛选（`status`、`template_id`、`keyword` 等）。返回 `{ rows, count }`。

#### ⑧ GET `/works/:id` — 作品详情【需登录】

- 返回单个作品对象（字段见 [4.4](#44-作品对象diy_work)），含 `design_data`、`total_cost`、`status`、铸造后的 `item` 等。仅能查自己的作品（越权返回 403）。

#### ⑨ POST `/works` — 保存作品（创建 / 更新草稿）【需登录】

- 请求体：

```json
{
  "diy_work_id": 123,
  "diy_template_id": 5,
  "work_name": "我的设计",
  "design_data": { "mode": "beading", "size": { "label": "M", "wrist_size_mm": 155 }, "beads": [ { "position": 0, "material_code": "DM26033100001749" } ] },
  "preview_media_id": 888
}
```

- 不传 `diy_work_id` = 新建草稿；传了 = 更新该草稿。`design_data` 结构见 [4.5](#45-设计数据design_data)。
- 保存阶段后端会校验所用 `material_code` 是否存在且启用（不存在/下架报错），但**不计价、不冻结**。`total_cost` 由后端在 confirm 阶段计算，saveWork 不接受前端传入的 total_cost。

#### ⑩ DELETE `/works/:id` — 删除作品【需登录】

- **仅 `draft` 状态可删**。已冻结/已完成的作品不可删。

#### ⑪ POST `/works/:id/confirm` — 确认设计（draft→frozen）【需登录】

- 请求体：

```json
{ "payments": [ { "asset_code": "star_stone", "amount": 180 } ] }
```

- 后端流程：从 `design_data` 提取逐颗 `material_code` → 查真实单价按币种汇总应付 → 校验颗数/成品长度硬约束（串珠模式，见 [5.4](#54-错误码约定)）→ 校验 `payments` 每币种实付 ≥ 应付 → 逐项冻结资产 → 写 `total_cost` 快照。
- **金额取整**：应付按币种汇总后 `Math.ceil` 向上取整再冻结（余额是整数）。前端展示应付时应以后端返回为准。
- `payments` 的 `amount` 必须为正数；缺失或不足会返回 400。资产不足会由冻结环节报错。
- 成功返回冻结后的作品对象（`status='frozen'`，含 `total_cost.price_snapshot` 定价快照 + `total_cost.payments` 实冻明细）。

#### ⑫ POST `/works/:id/complete` — 完成设计（frozen→completed）【需登录】

- 请求体（可选收货地址）：

```json
{ "address_id": 456 }
```

- 后端：从冻结余额扣减 → 铸造 `items` 物品实例（写 item_ledger 双录）→ 回填 `item_id` → 写 `exchange_records`（含地址快照，打通发货）。
- 传 `address_id` 则后端查 `user_addresses` 生成 `address_snapshot`；不传则订单地址为空，可由管理员后台补录（或后续引导用户补填）。
- 成功返回 `status='completed'` 的作品对象（含 `item_id`、`completed_at`）。

#### ⑬ POST `/works/:id/cancel` — 取消设计（frozen→cancelled）【需登录】

- 无请求体。仅 `frozen` 状态可取消，后端逐项解冻已冻结资产，作品变 `cancelled`。

#### ⑭ GET `/works/:id/qrcode` — 作品小程序码【需登录】

- 首次调用生成微信小程序码并缓存到对象存储，返回 URL；后续调用直接返回缓存 URL。
- `scene` 参数格式为 `diy_work_id={id}`，用于分享后他人扫码进入该作品。

## 四、模板与槽位数据结构

### 4.1 模板对象（diy_template）

| 字段 | 类型 | 说明 |
|---|---|---|
| `diy_template_id` | number | 模板 ID |
| `template_code` | string | 业务编号（DT+日期+序列） |
| `display_name` | string | 展示名 |
| `category_id` / `category` | number / obj | 分类（DIY_BRACELET/NECKLACE/RING/PENDANT） |
| `layout` | JSON | **核心布局**（见 4.2，含槽位定义） |
| `bead_rules` | JSON\|null | 珠子规则（串珠模式）：`{ margin, default_diameter, allowed_diameters:[8,10,12] }` |
| `sizing_rules` | JSON\|null | 尺寸/手围规则（串珠模式，见 4.6） |
| `capacity_rules` | JSON\|null | 容量规则：`{ min_beads, max_beads }` |
| `material_group_codes` | JSON array | 允许的素材分组码（空数组=全部允许） |
| `preview_media` | obj\|null | 预览图（含 `public_url` + `thumbnails`） |
| `base_image_media` | obj\|null | **设计器底图**（含 `public_url`），镶嵌模式必需 |
| `status` / `is_enabled` | enum / bool | 用户端只会拿到 published+启用 |
| `sort_order` | number | 排序权重（越小越靠前） |
| `meta` | JSON\|null | 扩展元数据 |

### 4.2 layout 布局（区分两种模式）

**串珠模式**（`shape` ∈ circle/ellipse/arc/line）：

```json
{ "shape": "circle", "bead_count": 18, "radius_x": 120, "radius_y": 120 }
```

前端沿形状（圆/椭圆/弧/直线）等分排布珠位，`bead_count` 为参考珠数（实际颗数由手围估算 + 用户增减决定）。

**镶嵌模式**（`shape='slots'`，即"位置标注"产物）：

```json
{
  "shape": "slots",
  "background_width": 800,
  "background_height": 1000,
  "slot_definitions": [
    {
      "slot_id": "slot_1",
      "label": "中心主石",
      "x": 0.5, "y": 0.42,
      "width": 0.18, "height": 0.14,
      "rotation": 0,
      "allowed_shapes": ["circle", "ellipse"],
      "allowed_group_codes": [],
      "allowed_diameters": [],
      "render_diameter": null,
      "required": true
    }
  ]
}
```

### 4.3 槽位定义 slot_definitions（位置标注核心）

每个槽位一个对象，字段语义如下（**坐标全部为 0~1 归一化百分比**，适配任意屏幕）：

| 字段 | 类型 | 语义 | 前端用法 |
|---|---|---|---|
| `slot_id` | string | 槽位唯一标识 | 填充数据 `fillings` 的 key；拉素材时作 `slot_id` 传参 |
| `label` | string | 槽位名称（如"中心主石"） | 空槽提示文案 |
| `x` / `y` | number(0~1) | 槽位**中心点**相对底图的横/纵百分比 | 中心像素 = `x * 底图渲染宽`（y 同理） |
| `width` / `height` | number(0~1) | 槽位椭圆的**宽/高**占底图百分比 | 椭圆半径 rx = `width * 底图渲染宽 / 2` |
| `rotation` | number(度) | 旋转角度 | 素材图按此角度旋转 |
| `allowed_shapes` | string[] | 允许填充的素材形状 | 过滤素材面板 |
| `allowed_group_codes` | string[] | 允许的素材分组（空=不限） | 过滤素材面板 |
| `allowed_diameters` | number[] | 允许直径（空=不限） | 传 `slot_id` 时后端已按此过滤 |
| `render_diameter` | number\|null | 渲染参考直径 | 素材缩放参考 |
| `required` | boolean | 是否必填 | 确认前校验必填槽是否已填 |

**坐标还原公式**（与管理端 Konva 编辑器 `renderSlot` 完全一致，务必对齐）：

先把底图按"contain"方式缩放进画布，得到底图实际渲染区域 `drawRect = { x, y, width, height }`（x/y 为底图左上角在画布中的偏移，width/height 为底图渲染尺寸）。则：

```
槽位中心 cx = drawRect.x + slot.x * drawRect.width
槽位中心 cy = drawRect.y + slot.y * drawRect.height
椭圆横半径 rx = (slot.width  * drawRect.width)  / 2
椭圆纵半径 ry = (slot.height * drawRect.height) / 2
旋转       = slot.rotation 度
```

- 底图原始尺寸取 `layout.background_width` / `layout.background_height`（缺省 800 × 1000）。
- 管理端标注时坐标保留 3 位小数、`x/y` 钳制在 [0,1]。小程序渲染只需按上式反算，**不要再自行推算比例**。

### 4.4 素材对象（用户端）

`/templates/:id/beads` 每项字段（已数据最小化 + 库存掩码）：

| 字段 | 说明 |
|---|---|
| `diy_material_id` / `material_code` | 素材 ID / 业务编码（**填充设计数据用 material_code**） |
| `display_name` / `material_name` | 展示名 / 材质名 |
| `group_code` | 分组码（对应 Tab） |
| `diameter` / `shape` | 直径(mm) / 形状 |
| `item_type` | 素材大类：beads/accessories/pendants |
| `material_type` | 材质光影档位（渲染高光参数用，与 item_type 独立） |
| `five_elements` / `meaning` / `energy` / `pairing` | 五行 / 寓意 / 能量 / 搭配（展示文案） |
| `weight` | 重量 |
| `size_length_mm` / `size_width_mm` / `bore_orientation` | 物理尺寸 / 孔向 |
| `cord_occupy_mm` | **后端预计算的单颗沿绳占用毫米**，前端累加即已排长度；`null`=物理数据不完整，展示"信息完善中"且不计长度 |
| `price` / `price_asset_code` | 单价 / 计价货币（star_stone 或源晶体系） |
| `stock` | **库存掩码**：`-1`=无限、`0`=售罄、`1`=有货（不暴露精确库存） |
| `image_media` | 素材图（含 `public_url` + 衍生图） |
| `sort_order` / `is_enabled` | 排序 / 启用 |

### 4.5 设计数据 design_data（保存/确认的核心载荷）

后端 `extractUsedMaterialCodes` 支持三种结构（逐颗提取 material_code）：

**串珠模式**：

```json
{
  "mode": "beading",
  "size": { "label": "M", "wrist_size_mm": 155 },
  "beads": [
    { "position": 0, "material_code": "DM26033100001749" },
    { "position": 1, "material_code": "DM26033100001750" }
  ]
}
```

- `size.wrist_size_mm` 是手围档位：confirm 时后端据此做成品长度硬校验；**缺 size 时跳过长度校验、只按 capacity_rules 做颗数兜底**。
- `beads` 数组长度即颗数（含重复），顺序即绳上排列顺序。

**镶嵌模式**：

```json
{
  "mode": "slots",
  "fillings": {
    "slot_1": { "material_code": "DM26033100001749" },
    "slot_2": { "material_code": "DM26033100001751" }
  }
}
```

- `fillings` 以 `slot_id` 为 key，值含该槽填充的 `material_code`。空槽不放 key。
- 确认前前端应校验所有 `required=true` 的槽位都已填充。

> 兼容说明：后端还兼容一种顶层 `slots: [{ material_code }]` 数组结构，但**新接入统一用上面两种（mode 明确）**，不要用旧结构。

### 4.6 sizing_rules 尺寸规则（串珠模式手围联动）

```json
{
  "default_size": "M",
  "elastic_margin_mm": 15,
  "size_options": [
    { "label": "S", "display": "小号 (约15cm)", "bead_count": 14, "radius_x": 95, "radius_y": 95, "wrist_size_mm": 140, "target_length_mm": 155 },
    { "label": "M", "display": "中号 (约16cm)", "bead_count": 16, "radius_x": 105, "radius_y": 105, "wrist_size_mm": 155, "target_length_mm": 170 }
  ]
}
```

- `wrist_size_mm`：手围毫米（手链品类必填；项链等无手围概念的品类不填）。
- `target_length_mm`：目标成品周长毫米（所有串珠模板必填，长度联动/校验基准）。
- `elastic_margin_mm`：弹力/工艺余量（缺省 15mm）。
- 前端手围组件展示 `size_options` 供选择，选中后把该档 `wrist_size_mm` 传给 `/estimate` 与写入 `design_data.size`。项链档位无手围时，把佩戴长度作为 `wrist_size_mm` 传入即可（后端按双字段命中）。

### 4.7 作品对象（diy_work）

| 字段 | 说明 |
|---|---|
| `diy_work_id` / `work_code` | 作品 ID / 业务编号（DW+日期+序列） |
| `diy_template_id` / `template` | 所属模板 |
| `work_name` | 作品名 |
| `design_data` | 设计数据（见 4.5） |
| `total_cost` | 消耗明细（confirm 后有值）：`{ price_snapshot:[{material_code,price,price_asset_code}], payments:[{asset_code,amount}] }` |
| `preview_media` / `preview_media_id` | 预览图 |
| `item_id` / `item` | 铸造出的物品实例（completed 才有） |
| `status` | draft/frozen/completed/cancelled |
| `frozen_at` / `completed_at` | 冻结/完成时间 |

## 五、标准对齐（必读）

本章是小程序与后端**必须严格对齐**的规则，违反会导致下单失败、渲染错位或对账不一致。

### 5.1 权威边界：后端算，前端展示

| 事项 | 谁负责 | 前端禁止 |
|---|---|---|
| 珠子单价、应付总额 | 后端（confirm 时查库计算） | 前端自行算价、信任本地 total_cost |
| 手围→颗数/长度换算 | 后端 `/estimate` | 前端写换算公式 |
| 单颗沿绳占用长度 | 后端 `cord_occupy_mm` | 前端按形状分支自算长度 |
| 成品长度是否合格 | 后端 confirm 硬校验 | 前端放行后端会拒绝的设计 |
| 库存 | 后端掩码 `-1/0/1` | 前端假设能拿到精确库存 |

前端可以用后端返回值做**实时预估展示**（累加 `cord_occupy_mm`、累加 `price`），但最终以 confirm 返回为准。

### 5.2 字段命名：直接用后端字段名，不做映射层

这是全项目统一技术路线：**小程序直接消费后端字段名，禁止在前端建立"后端字段→前端短名"的映射层**。例如后端叫 `diy_template_id` 就全程用 `diy_template_id`，不要改名成 `templateId`/`tid`。管理端有 `check-frontend-mappings.cjs` 黑名单门禁强制此约定，小程序应遵循同一原则以避免联调字段错位。

### 5.3 金额与单位

- 所有长度字段单位为**毫米（mm）**，字段名带 `_mm` 后缀。
- 素材单价 `price` 为整数（后端强制整数定价）；应付总额按币种汇总后**向上取整**（`Math.ceil`）。
- 支付货币仅限星石（`star_stone`）与源晶体系，`payments[].asset_code` 必须是其中之一，**不可传 points/budget_points**。

### 5.4 错误码约定

失败响应顶层 `code` 携带业务错误码，前端据此引导用户：

| 错误码 | 触发 | 前端引导 |
|---|---|---|
| `DIY_TEMPLATE_NOT_BEADING` | 对镶嵌模板调 `/estimate` | 镶嵌模式不显示手围组件 |
| `DIY_SIZING_RULES_MISSING` | 模板未配尺寸规则 | 提示该款式暂不支持手围估算 |
| `DIY_BEAD_COUNT_OUT_OF_RANGE` | 颗数超出容量规则 | 提示可用颗数范围（data 含 min_beads/max_beads） |
| `DIY_MATERIAL_SIZE_MISSING` | 所用素材缺沿绳尺寸 | 提示更换素材（data 含 material_codes） |
| `DIY_LENGTH_BELOW_MIN` | 成品长度低于可戴下限 | 提示加珠或换小手围 |
| `DIY_LENGTH_EXCEED_LIMIT` | 成品长度超可制作上限 | 提示减珠或换大手围 |

其余通用错误：`400`（参数/支付不足/未放珠子）、`403`（越权操作他人作品）、`404`（作品/模板不存在）、`409`（状态机不允许，如非 draft 确认、非 frozen 取消）。

### 5.5 X-Device-Id 设备标识

与全项目会话体系对齐：小程序所有请求应携带 `X-Device-Id` 头，值为一次生成并持久化的设备 UUID（`wx.setStorageSync`）。后端按 `(user_id, device_id)` 做会话隔离。参照管理端 `admin/src/api/base.js` 的 localStorage 方案，小程序用 wx storage 等价实现。

### 5.6 作品状态机（前端按钮可用性据此控制）

```
draft ──confirm──▶ frozen ──complete──▶ completed
  │                   │
delete              cancel
  ▼                   ▼
(删除)             cancelled
```

- `draft`：可编辑 / 保存 / 删除 / 确认
- `frozen`：可完成 / 取消（不可再改设计；要改需先取消回 draft 重来）
- `completed` / `cancelled`：终态，只读

### 5.7 媒体 URL 使用

模板底图、素材图、预览图均通过关联对象的 `public_url` 取用，并提供 `thumbnails.w375/w750/w1080` 衍生图。列表页用小图（w375），设计器底图用大图（public_url 或 w1080），按网络情况做降级。对象存储 key（object_key）已被后端隐藏，前端拿不到也不需要。

## 六、渲染流程与完整下单时序

### 6.1 设计器渲染流程

**镶嵌模式（位置标注/槽位填充）**

1. 调 `/templates/:id` 拿模板，取 `layout.slot_definitions` 与 `base_image_media.public_url`。
2. 底图按 contain 缩放进画布，算出 `drawRect`。
3. 遍历 `slot_definitions`，用 [4.3](#43-槽位定义-slot_definitions位置标注核心) 的公式把归一化坐标还原为像素，在对应位置画出可点击的槽位（椭圆/热区）。
4. 用户点某槽 → 调 `/templates/:id/beads?slot_id=slot_x&item_type=...` 拉该槽可填素材 → 用户选中 → 把素材图按 `render_diameter`/槽位尺寸缩放、`rotation` 旋转，叠加到该槽位。
5. 填充结果写入 `design_data.fillings[slot_id] = { material_code }`。
6. 确认前校验所有 `required=true` 槽位已填。

**串珠模式**

1. 调 `/templates/:id` 拿 `layout.shape`、`bead_rules`、`sizing_rules`。
2. 用户选手围档位 → 调 `/estimate?wrist_size_mm=&diameter=` 拿 `recommend_bead_count` 与长度区间。
3. 沿形状等分画珠位，用户逐颗选素材（`/beads` 拉取）。
4. 实时累加 `cord_occupy_mm` 展示当前长度、累加 `price` 展示预估费用（仅展示）。
5. 写入 `design_data`：`{ mode:'beading', size:{label,wrist_size_mm}, beads:[{position,material_code}] }`。

### 6.2 完整下单链路时序

```
用户                          小程序                             后端(/api/v4/diy)
 │  进入 DIY 首页                 │                                    │
 │ ───────────────────────────▶ │  GET /templates                    │
 │                              │ ─────────────────────────────────▶ │ 返回已发布模板[]
 │  选款式                        │  GET /templates/:id                │
 │                              │ ─────────────────────────────────▶ │ 返回 layout/规则/底图
 │                              │  GET /templates/:id/beads[?slot_id] │
 │                              │ ─────────────────────────────────▶ │ 返回可用素材[]
 │  (串珠)选手围                  │  GET /templates/:id/estimate       │
 │                              │ ─────────────────────────────────▶ │ 返回颗数/长度区间
 │  摆珠/填槽                     │  (本地实时预估:累加 price/长度)      │
 │  保存                         │  POST /works {design_data}          │
 │                              │ ─────────────────────────────────▶ │ 校验素材有效,存草稿
 │  点确认                        │  GET /templates/:id/payment-assets  │
 │                              │ ─────────────────────────────────▶ │ 返回可用资产余额
 │  选支付方式+确认               │  POST /works/:id/confirm {payments} │
 │                              │ ─────────────────────────────────▶ │ 计价+硬校验+冻结资产
 │                              │                                     │  (失败:返回错误码)
 │  完成(填收货地址)              │  POST /works/:id/complete {address_id}│
 │                              │ ─────────────────────────────────▶ │ 扣减+铸造物品+写发货单
 │  分享                         │  GET /works/:id/qrcode              │
 │                              │ ─────────────────────────────────▶ │ 返回小程序码 URL
```

### 6.3 联调自查清单

- [ ] 所有请求带 `Authorization`（登录接口）与 `X-Device-Id`
- [ ] 字段名与后端完全一致（无本地映射层）
- [ ] 槽位坐标严格按 4.3 公式还原，与管理端标注位置一致
- [ ] 确认前校验 `required` 槽位已填、串珠颗数在容量范围
- [ ] `payments.asset_code` 只用 star_stone / 源晶，金额取后端应付（向上取整）
- [ ] 错误码分支覆盖 5.4 全部 DIY_* 码
- [ ] 状态机按钮可用性正确（draft/frozen/completed/cancelled）
- [ ] 库存按掩码 -1/0/1 处理（售罄置灰）
- [ ] 金额/长度单位为整数/毫米

---

> 附：管理端产出侧参考文件（非小程序调用，仅供理解位置标注来源）：`admin/diy-slot-editor.html` + `admin/src/modules/diy/pages/diy-slot-editor.js`（Konva.js 可视化标注，保存写回 `diy_templates.layout.slot_definitions`）。后端权威：`routes/v4/diy.js`、`services/diy/{TemplateService,WorkService,MaterialService}.js`、`models/{DiyTemplate,DiyWork}.js`。
