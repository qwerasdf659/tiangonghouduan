# DIY 饰品设计引擎 - 技术方案与待澄清问题

| 信息项   | 说明                                              |
| -------- | ------------------------------------------------- |
| 对应需求 | 微信小程序「养个石头」通用 DIY 饰品设计引擎 V2.0  |
| 编制日期 | 2026-03-28                                        |
| 编制角色 | 前端开发                                          |
| 文档状态 | 全部确认完毕，可进入开发                          |
| 后端对齐 | 2026-04-02 已完成后端代码+数据库真实状态对齐，直连真实数据库验证（120 张表） |
| 决策状态 | 5 项架构决策全部已确认并已落地实现（见 8.7 节）   |
| 实现状态 | 后端 3 张表（`diy_templates` 7 条 + `diy_works` 0 条 + `diy_materials` 61 条）+ 1 个服务 + 26 个接口已全部实现，admin 4 个页面已建好 |

> **架构升级说明**：V1.0 仅支持手串单一款式，V2.0 升级为 **模板驱动的通用 DIY 设计引擎**。
> 后端上传款式模板（手链/项链/戒指等），前端根据模板参数动态渲染对应的排列形状、尺寸规则和专属素材。
>
> **双模式支持**：V2.0 同时支持两种设计模式：
> - **串珠模式**（circle / ellipse / arc / line）：珠子沿几何形状排列，适用于手链/项链/戒指等
> - **镶嵌模式**（slots）：吊坠/挂件提供预定义槽位，用户选择宝石填入指定位置，适用于吊坠/胸针等

---

## 一、核心架构：模板驱动设计

### 0. 款式模板体系（✅ 已确认）

系统不再仅支持手串，而是由 **后端定义款式模板**，前端根据模板参数动态渲染。

#### 用户操作流程

**先选分类 → 再选具体款式 → 进入设计页**。款式选择页采用「分类 Tab + 模板列表」布局：顶部 Tab 切换大分类（手链/项链/戒指/吊坠，数据来自 `categories` 表的 DIY 饰品子分类），下方展示该分类下的具体款式模板卡片（如"18 颗珠经典手链"、"24 颗珠细珠手链"等，数据来自 `diy_templates` 按 `category_id` 筛选）。用户点击一个款式卡片后跳转到设计页，加载该款式的模板参数和专属素材。设计页根据模板的 `layout.shape` 自动切换为串珠模式或镶嵌模式，两种模式共用同一个页面和渲染引擎。

#### 款式模板数据结构（后端定义）

```
Template {
  id: string                    // 款式 ID
  name: string                  // 款式名称（如"经典手链"、"锁骨项链"、"简约戒指"、"花瓣吊坠"）
  type: string                  // 款式类型标识（bracelet / necklace / ring / pendant）
  icon: string                  // 款式图标 URL

  // ========== 排列形状参数（后端完全自定义，判别联合体） ==========
  //
  // 根据 layout.shape 分为两大模式：
  //   串珠模式（circle / ellipse / arc / line）— 珠子沿几何形状排列
  //   镶嵌模式（slots）— 宝石填入吊坠/挂件的预定义槽位

  layout: {
    shape: string               // 形状类型（circle / ellipse / arc / line / slots）
    params: {                   // 形状参数，不同 shape 参数不同

      // ---- 串珠模式 ----

      // circle（圆形，手链/戒指）
      // 无额外参数，半径由屏幕自适应

      // ellipse（椭圆，项链）
      radiusRatioX: number      // 横轴半径比例（相对展示区宽度）
      radiusRatioY: number      // 纵轴半径比例（相对展示区高度）

      // arc（弧线，项链正面展示）
      arcAngle: number          // 弧线张角（度），如 180 = 半圆弧
      openDirection: string     // 开口方向（top / bottom）

      // line（直线，手链展开视图等）
      direction: string         // 方向（horizontal / vertical）

      // ---- 镶嵌模式 ----

      // slots（槽位镶嵌，吊坠/胸针）
      backgroundImage: string   // 吊坠/挂件背景图 URL（Sealos 对象存储）
      backgroundWidth: number   // 背景图设计宽度（px），用于坐标映射
      backgroundHeight: number  // 背景图设计高度（px）
      slots: SlotDefinition[]   // 预定义槽位列表（见下方定义）
    }
  }

  // 尺寸规则（串珠模式必填，镶嵌模式无此字段）
  sizing?: {
    label: string               // 尺寸标签（如"手围"、"颈围"、"指围"）
    unit: string                // 单位（mm / cm）
    options: number[]           // 可选尺寸档位（如 [140, 150, 160, 170, 180]）
    defaultValue: number        // 默认值
    margin: number              // 弹性余量（mm）
  }

  // 容量规则
  // 串珠模式：minBeads/maxBeads 为珠子数量限制，allowedDiameters 为可用直径
  // 镶嵌模式：minBeads = 必填槽位数，maxBeads = 总槽位数，allowedDiameters 为全局默认可用直径
  capacity: {
    minBeads: number            // 最少珠子/宝石数
    maxBeads: number            // 最多珠子/宝石数（串珠模式 0=仅受尺寸限制，镶嵌模式=总槽位数）
    allowedDiameters: number[]  // 该款式可用的珠子/宝石直径（mm）
  }

  // 专属素材分组 code 列表
  material_group_codes: string[]  // 该款式可用的材料分组（如 ["red","blue","green"]），对应 asset_group_defs.group_code。空数组 [] 表示不限制，所有分组均可用
}

// ========== 槽位定义（镶嵌模式专用） ==========

SlotDefinition {
  slotId: string                // 槽位唯一标识（后端生成，如 "slot_center"、"slot_left_1"）
  label: string                 // 槽位显示名（如"主石位"、"副石位1"），用于 UI 提示

  // 位置与尺寸（均为 0~1 百分比，相对 backgroundWidth / backgroundHeight，屏幕自适应）
  x: number                     // 槽位中心 X 坐标百分比
  y: number                     // 槽位中心 Y 坐标百分比
  width: number                 // 槽位宽度百分比
  height: number                // 槽位高度百分比

  // 槽位形状（决定渲染裁剪蒙版和空槽位轮廓）
  slotShape: string             // circle / oval / square / rectangle

  // 约束规则（每个槽位独立约束）
  allowedDiameters: number[]    // 该槽位可容纳的宝石直径（mm），空数组表示不限
  allowedShapes?: string[]      // 该槽位允许的宝石形状（circle / oval / square / rectangle / marquise / pear / heart 等），空/不传表示仅匹配 slotShape
  allowed_group_codes?: string[] // 该槽位允许的宝石分组 code（可选，空/不传则继承模板级 material_group_codes）

  // 必填标记
  required: boolean             // 是否为必填槽位（影响结算校验：required 槽位未填则不可提交）
}
```

#### 已支持的排列形状

| shape    | 适用款式     | 模式     | 说明                                     |
| -------- | ------------ | -------- | ---------------------------------------- |
| circle   | 手链、戒指   | 串珠模式 | 闭合圆形，等角度分布                      |
| ellipse  | 项链         | 串珠模式 | 椭圆形，等角度分布，适合展示长链          |
| arc      | 项链正面视图 | 串珠模式 | 弧线展示，仅渲染正面可见部分              |
| line     | 展开视图     | 串珠模式 | 直线排列，用于编辑或详情展示              |
| slots    | 吊坠、胸针   | 镶嵌模式 | 背景图 + 预定义槽位，宝石填入指定位置     |

> **扩展性**：新增款式时后端只需创建新的模板配置，前端渲染引擎根据 `layout.shape` 自动适配，无需发版。串珠模式和镶嵌模式共用同一个设计页和渲染引擎，通过 `shape` 值自动分发。

---

### 1. 核心计算规则

> **模式差异说明**：以下弹性余量和珠子规格规则仅适用于 **串珠模式**。**镶嵌模式** 不使用弹性余量和尺寸概念，其容量由模板定义的槽位数量和每个槽位的独立约束（`SlotDefinition.allowedDiameters` / `allowedCategoryIds`）决定。

#### 1.1 弹性余量（串珠模式）

PRD 公式：`所有珠子直径之和 ≤ 尺寸(mm) - 弹性余量`

弹性余量由款式模板的 `sizing.margin` 字段定义，不同款式可配置不同余量值。

> **建议值**：预留 **π × 绳径 ≈ 10mm**（按常见 1mm 弹力绳计算），即 15cm 手围 → 可用周长 = 150 - 10 = 140mm。
>
> **✅ 已确认**：默认 **10mm**，存储在 `diy_templates.bead_rules` JSON 字段中（`{ "margin": 10 }`），每个款式模板可独立配置不同余量值（如戒指 5mm、项链 15mm）。行业标准（周大福/潘多拉）统一预留 π × 绳径 ≈ 10mm。

#### 1.2 珠子规格范围（串珠模式）

PRD 提到珠子有不同尺寸（单位 mm），但未列出具体可选尺寸。每个款式模板通过 `capacity.allowedDiameters` 定义该款式支持的珠子直径。

> 常见水晶珠规格为 4 / 6 / 8 / 10 / 12 / 14mm。
>
> **✅ 已确认**：全局支持 **4/6/8/10/12/14mm** 六档（水晶行业标准），每个款式模板通过 `bead_rules.allowed_diameters` 约束可用尺寸。材料本身不区分尺寸（`material_asset_types` 是可叠加碎片），珠子尺寸是设计参数，消耗数量按尺寸定价（大珠子消耗更多碎片），通过 `exchange_channel_prices` 的 `cost_amount` 控制。

---

### 2. 排列算法

> **✅ 已确认：采用等角度间隔分布**，所有珠子按添加顺序等角度排列，视觉对称、展示清晰。
>
> **✅ 已确认：排列形状由后端模板参数完全自定义**，前端渲染引擎支持 circle / ellipse / arc / line / slots 五种形状，根据模板 `layout.shape` 和 `layout.params` 动态计算珠子坐标或读取槽位坐标。
>
> **✅ 已确认：同时支持串珠模式和镶嵌模式**，镶嵌模式下宝石位置由模板预定义的槽位坐标决定（非算法计算），用户可先点槽位再选宝石，也可直接选宝石自动填入下一个空槽位。

---

### 3. 数据来源

#### 3.1 珠子素材数据

> **✅ 已确认：走后端 API**。素材的数量、价格、图片、库存均由后端动态管理，支持运营随时调整。
>
> **✅ 已确认：不同款式有各自专属素材**，通过款式模板的 `material_group_codes` 字段关联（如 `["red","blue","green"]`），前端根据当前款式仅加载其专属材料分组。

#### 3.2 珠子图片资源

> **✅ 已确认**：图片托管在 **Sealos 对象存储** 中，前端通过后端返回的图片 URL 加载，不打包到小程序内。
>
> **✅ 已确认**：
> - 图片必须 **PNG 透明底**（Canvas 绘制宝石需要透明背景，JPG 白底会遮挡底图）
> - 尺寸规格直接复用后端现有三档自动缩略图：`small` 150×150（素材列表）、`medium` 300×300（素材卡片）、`large` 600×600（Canvas 渲染），上传时自动生成，无需额外配置

---

### 4. 价格体系

现有项目同时存在 **积分体系** 和 **人民币兑换体系**。

> **✅ 已确认**：
> - 珠子属于 **可叠加资产**（同一款珠子可拥有/使用多颗）
> - 兑换价格由 **后端设置和调整**，前端仅做展示，不硬编码价格
> - 价格单位为 **星石**（`star_stone`，原 DIAMOND），与项目现有资产体系一致
> - `diy_materials` 表中所有珠子的 `price_asset_code` 均为 `star_stone`
>
> **✅ 已确认**：
> - 不做套餐优惠/满减逻辑。行业标准（潘多拉/施华洛世奇）均为单颗定价，无组合优惠
> - 现有 `exchange_channel_prices` 已支持 `original_amount`（划线原价）+ `cost_amount`（实际价），未来要做折扣直接改数据即可
> - 如需扩展，在 `diy_templates.meta` JSON 加 `discount_rules` 字段，不影响现有架构

---

### 5. 结算对接

PRD 要求"跳转至下单结算流程，完成商业闭环"。

> **✅ 已确认并已实现：三步状态机流程（draft → frozen → completed/cancelled）**。
> - DIY 是"用户消耗材料（源晶碎片/源晶）→ 平台铸造饰品 → 生成物品实例"
> - 实际实现为三步分离流程（非一步到位）：
>   1. `POST /api/v4/diy/works` — 保存设计草稿（draft），计算 `total_cost`
>   2. `POST /api/v4/diy/works/:id/confirm` — 确认设计，逐项调用 `BalanceService.freeze` 冻结材料（draft → frozen）
>   3. `POST /api/v4/diy/works/:id/complete` — 完成设计，调用 `BalanceService.settleFromFrozen` 从冻结扣减 + `ItemService.mintItem` 铸造 `items` 实例（`item_type='diy_product'`）+ 写 `item_ledger` 双录流水（frozen → completed）
> - 取消流程：`POST /api/v4/diy/works/:id/cancel` — 逐项 `BalanceService.unfreeze` 解冻材料（frozen → cancelled）
> - 超时保护：frozen 状态超过 24 小时自动 cancel（解冻材料）
> - 所有操作在事务内执行，幂等机制通过 `idempotency_key` 保证

---

### 6. 分享设计

PRD 要求"生成小程序分享卡片，他人打开可直接加载对应设计"。

设计数据的传递有两种方案：

| 方案                     | 实现方式                                           | 限制                                             |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------ |
| 方案 A：URL 参数传递     | 将珠子列表序列化后拼接到分享卡片 path 中           | 小程序 path 有长度限制（约 1024 字符），珠子多时会超限 |
| 方案 B：后端存储 + ID    | 先调接口保存设计，获取 designId，分享时携带 ID      | 需要后端接口支持，但无长度限制                    |

> **✅ 已确认：采用方案 B**（后端存储 + ID）。分享时先调接口保存设计获取 designId，分享卡片 path 仅携带 ID，他人打开时从后端拉取完整设计数据还原。需后端提供设计存储与查询接口。

---

### 7. 保存海报

PRD 要求"自动将预览区的完整手串生成高清海报"。

> **✅ 已确认**：海报内容包含以下三部分：
> 1. **饰品图** — 预览区的完整饰品渲染图（根据款式自适应）
> 2. **品牌 Logo** — "养个石头"品牌标识
> 3. **小程序码** — 扫码可直接打开该设计
>
> **✅ 已确认：750×1334px @2x，三段式布局，代码写死布局参数**：
> - 顶部 120px：品牌 Logo + 渐变背景
> - 中间 900px：Canvas 导出的饰品渲染图（居中留白）+ 作品名称 + 材料标签，背景色 `#F8F6F3`（暖灰白）
> - 底部 314px：小程序码（200×200）+ 引导文案"扫码查看我的设计" + 用户昵称
> - 不用背景图，不需要设计稿模板，Canvas 离屏渲染直接画，后续调整改参数即可

---

### 8. 交互细节补充

| 问题                         | 说明                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| 手围修改的 UI 形式？         | **✅ 已确认**：采用 Picker 滚动选择器，尺寸档位由模板 `sizing.options` 定义 |
| 删除珠子是否支持多选？       | **✅ 已确认**：支持多选删除 + 一键清空                                |
| 是否需要撤销/重做？          | **✅ 已确认**：支持撤销和重做                                         |
| 珠子顺序能否调整？           | **✅ 已确认**：支持调整珠子顺序（串珠模式）                           |
| 相同珠子是否可重复添加？     | **✅ 已确认**：允许（珠子为可叠加资产）                               |
| 镶嵌模式交互方式？           | **✅ 已确认**：同时支持两种方式 — ① 点击槽位激活后选宝石填入 ② 直接选宝石自动填入下一个空槽位 |
| 镶嵌模式槽位数量？           | **✅ 已确认**：后端灵活配置，不限定数量                               |
| 镶嵌模式槽位独立约束？       | **✅ 已确认**：每个槽位有独立的尺寸/分类约束（allowedDiameters / allowedCategoryIds） |
| 镶嵌模式宝石互换？           | 支持长按拖拽交换两个槽位的宝石（swapSlots）                          |
| 空白预览区视觉样式？         | **✅ 已确认**：串珠模式：灰色虚线圆环（`#D1D5DB`）+ 占位圆点 + 中心引导文案"点击下方素材开始设计"；镶嵌模式：底图正常显示，空槽位虚线轮廓 + "+" 图标（`#9CA3AF`），激活槽位高亮 `#FF6B35` |

---

## 二、技术方案

### 1. 分包与目录结构

新建独立分包 `packageDIY`，与现有 `packageTrade`/`packageExchange` 平级。

```
packageDIY/
├── diy-select/                      # 款式选择页（入口页）
│   ├── diy-select.ts
│   ├── diy-select.wxml
│   ├── diy-select.scss
│   └── diy-select.json
├── diy-design/                      # 通用 DIY 设计页（根据模板动态渲染）
│   ├── diy-design.ts
│   ├── diy-design.wxml
│   ├── diy-design.scss
│   └── diy-design.json
├── sub/                             # 页面级子组件
│   ├── shape-renderer/              # 通用形状渲染引擎（Canvas 2D）
│   │   ├── shape-renderer.ts        #   根据 layout.shape 分发渲染逻辑
│   │   ├── shape-renderer.wxml
│   │   ├── shape-renderer.scss
│   │   └── shape-renderer.json
│   ├── bead-card/                   # 珠子素材卡片组件
│   │   ├── bead-card.ts
│   │   ├── bead-card.wxml
│   │   ├── bead-card.scss
│   │   └── bead-card.json
│   ├── category-nav/                # 左侧分类导航组件
│   │   ├── category-nav.ts
│   │   ├── category-nav.wxml
│   │   ├── category-nav.scss
│   │   └── category-nav.json
│   └── fly-animation/               # 飞入动画浮动层组件
│       ├── fly-animation.ts
│       ├── fly-animation.wxml
│       ├── fly-animation.scss
│       └── fly-animation.json
└── diy-result/                      # 设计结果/结算中转页（可选）
    ├── diy-result.ts
    ├── diy-result.wxml
    ├── diy-result.scss
    └── diy-result.json
```

### 2. 核心技术选型

| 模块         | 技术方案                         | 理由                                                                                       |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| 形状渲染引擎 | **Canvas 2D**                    | 项目已有 `price-chart` Canvas 2D 组件经验；Canvas 对多种形状（圆/椭圆/弧/线）渲染性能优于 DOM；可直接导出海报图片 |
| 飞入动画     | **CSS Animation + fixed 浮动层** | 350ms 短距离动画用 CSS `transition` + `transform` 即可保证 30fps 流畅度，无需引入 Canvas 动画 |
| 状态管理     | **MobX Store**                   | 新增 `store/diy.ts`，统一管理当前模板、已选珠子、尺寸、总价等状态，与项目现有架构一致       |
| 本地缓存     | **wx.setStorageSync**            | 每次编辑后自动序列化设计数据到 Storage，附带过期时间戳（7 天），启动时检查并恢复              |
| 素材加载     | **分类懒加载 + 内存缓存**       | 仅加载当前款式的专属分类素材，已加载过的分类缓存在内存中，避免重复请求                       |
| 海报生成     | **Canvas 离屏渲染**              | 复用 `shape-renderer` 的绘制逻辑，在离屏 Canvas 上额外绘制背景/品牌元素后调用 `canvasToTempFilePath` 导出 |
| 搜索         | **前端本地过滤**                 | 素材总量有限，全量加载后前端 filter 即可，无需每次请求后端搜索接口                           |

### 3. 通用形状渲染引擎 — shape-renderer

核心思路：根据款式模板的 `layout.shape` 分发到不同的坐标计算策略，所有策略均采用等角度/等间距分布。渲染引擎是一个纯函数，输入模板参数 + 珠子列表，输出每颗珠子的 (x, y) 坐标。

```
算法伪代码：

输入：template.layout (形状配置)
      beads[] (已选珠子列表)
      canvasWidth, canvasHeight (画布尺寸)

// 根据 shape 分发计算
switch (template.layout.shape):

  case 'circle':  // 手链、戒指
    radius = min(canvasWidth, canvasHeight) * 0.35
    angleStep = (2 * π) / beads.length
    for (i = 0; i < beads.length; i++):
      angle = (i * angleStep) - π / 2
      beads[i].x = centerX + radius * cos(angle)
      beads[i].y = centerY + radius * sin(angle)

  case 'ellipse':  // 项链
    rx = canvasWidth * layout.params.radiusRatioX
    ry = canvasHeight * layout.params.radiusRatioY
    angleStep = (2 * π) / beads.length
    for (i = 0; i < beads.length; i++):
      angle = (i * angleStep) - π / 2
      beads[i].x = centerX + rx * cos(angle)
      beads[i].y = centerY + ry * sin(angle)

  case 'arc':  // 项链正面弧线
    arcRad = layout.params.arcAngle * π / 180
    startAngle = -π/2 - arcRad/2
    radius = canvasWidth * 0.4
    angleStep = arcRad / (beads.length - 1 || 1)
    for (i = 0; i < beads.length; i++):
      angle = startAngle + i * angleStep
      beads[i].x = centerX + radius * cos(angle)
      beads[i].y = centerY + radius * sin(angle)

  case 'line':  // 直线展开
    spacing = canvasWidth / (beads.length + 1)
    for (i = 0; i < beads.length; i++):
      beads[i].x = spacing * (i + 1)
      beads[i].y = centerY

  // ======== 镶嵌模式 ========

  case 'slots':  // 吊坠、胸针 — 背景图 + 槽位镶嵌
    params = template.layout.params
    slotDefs = params.slots              // SlotDefinition[]
    slotFillings = store.slotFillings    // Map<slotId, Bead>

    // 1. 绘制吊坠/挂件背景图（自适应画布，保持宽高比）
    bgAspect = params.backgroundWidth / params.backgroundHeight
    canvasAspect = canvasWidth / canvasHeight
    if (bgAspect > canvasAspect):
      drawWidth = canvasWidth * 0.85
      drawHeight = drawWidth / bgAspect
    else:
      drawHeight = canvasHeight * 0.85
      drawWidth = drawHeight * bgAspect
    offsetX = (canvasWidth - drawWidth) / 2
    offsetY = (canvasHeight - drawHeight) / 2
    ctx.drawImage(backgroundImage, offsetX, offsetY, drawWidth, drawHeight)

    // 2. 遍历槽位，绘制空槽位轮廓或已填入的宝石
    for (slot in slotDefs):
      slotX = offsetX + slot.x * drawWidth    // 百分比坐标 → 画布绝对坐标
      slotY = offsetY + slot.y * drawHeight
      slotW = slot.width * drawWidth
      slotH = slot.height * drawHeight

      gem = slotFillings.get(slot.slotId)
      if (gem):
        // 已填入宝石：按槽位形状裁剪绘制宝石图片
        ctx.save()
        clipByShape(ctx, slot.slotShape, slotX, slotY, slotW, slotH)
        ctx.drawImage(gem.imageUrl, slotX - slotW/2, slotY - slotH/2, slotW, slotH)
        ctx.restore()
      else:
        // 空槽位：绘制虚线轮廓 + 可选"+"提示
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = '#ccc'
        drawShapeOutline(ctx, slot.slotShape, slotX, slotY, slotW, slotH)

      // 3. 高亮当前激活槽位（activeSlotId）
      if (slot.slotId == store.activeSlotId):
        ctx.strokeStyle = '#FF6B35'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        drawShapeOutline(ctx, slot.slotShape, slotX, slotY, slotW, slotH)

输出：
  串珠模式 → 每颗珠子的 (x, y) 坐标及角度
  镶嵌模式 → 背景图 + 每个槽位的渲染状态（空/已填/激活）

容量校验（按模式分发）：
  if (shape != 'slots'):
    // 串珠模式：直径之和校验
    usedDiameter = sum(beads.map(b => b.diameter))
    maxDiameter = template.sizing.selectedValue - template.sizing.margin
    canAdd = (usedDiameter + newBead.diameter) <= maxDiameter
  else:
    // 镶嵌模式：目标槽位约束校验（尺寸 + 形状 + 分类三重校验）
    targetSlot = activeSlotId ? getSlot(activeSlotId) : getNextEmptySlot()
    canAdd = targetSlot != null
             && (targetSlot.allowedDiameters.length == 0 || targetSlot.allowedDiameters.includes(gem.diameter))
             && (targetSlot.allowedShapes == null || targetSlot.allowedShapes.includes(gem.shape))
             && (targetSlot.allowedCategoryIds == null || targetSlot.allowedCategoryIds.includes(gem.categoryId))
```

增删珠子后全量重算坐标，Canvas 全量重绘（珠子数量有限，性能无压力）。镶嵌模式下每次操作后重绘背景图 + 所有槽位状态。

### 4. 飞入动画方案

```
实现步骤：

1. 用户点击素材卡片
2. 通过 wx.createSelectorQuery 获取素材卡片在页面中的绝对坐标 (startX, startY)
3. 计算目标坐标 (endX, endY)：
   - 串珠模式：目标为圆环上下一个珠子位置（由排列算法计算）
   - 镶嵌模式：目标为当前激活槽位的中心坐标（activeSlotId 对应的槽位），
     若无激活槽位则为下一个空槽位的中心坐标
4. 在 fixed 浮动层创建一个临时珠子元素（与选中珠子同样式同尺寸）
5. 初始位置设为 (startX, startY)
6. 通过 CSS transition 350ms ease-out 将 transform 设为 translate(endX-startX, endY-startY)
7. 中间控制点通过 CSS 动画关键帧模拟贝塞尔曲线弧线路径
8. 动画结束后（transitionend 事件）销毁临时元素，触发 Canvas 重绘正式渲染珠子/宝石
```

贝塞尔曲线模拟：使用 `@keyframes` 分别对 X 轴和 Y 轴设置不同缓动函数（X 轴 linear，Y 轴 ease-in），组合后视觉呈弧线飞入效果。

### 5. MobX Store 设计

新增 `store/diy.ts`：

```
状态字段：

  // ===== 通用状态（两种模式共用） =====
  currentTemplate: Template     // 当前款式模板（含排列形状、尺寸规则、容量规则）
  activeGroupCode: string       // 当前激活材料分组 code（从模板 material_group_codes 中选取，如 "red"/"blue"）
  undoStack: Snapshot[]         // 撤销栈，记录每次操作前的完整状态快照
  redoStack: Snapshot[]         // 重做栈，撤销后可重做恢复

  // ===== 串珠模式专用 =====
  selectedSize: number          // 当前选择的尺寸值（mm），从模板 sizing.options 中选取
  selectedBeads: Bead[]         // 已选珠子列表（有序，支持调整顺序）
  highlightedBeadIndices: Set<number>  // 当前选中的预览区珠子索引集合（支持多选删除）

  // ===== 镶嵌模式专用 =====
  slotFillings: Map<string, Bead>  // 槽位填充状态（slotId → Bead），空槽位不在 Map 中
  activeSlotId: string | null      // 当前激活的槽位 ID（用户点击槽位后设置，选宝石时填入此槽位）

  // Snapshot 类型定义（撤销/重做用）：
  // 串珠模式: { mode: 'beads', selectedBeads: Bead[], selectedSize: number }
  // 镶嵌模式: { mode: 'slots', slotFillings: Map<string, Bead> }

计算属性：

  // ===== 模式判断 =====
  isSlotMode: boolean           // currentTemplate.layout.shape === 'slots'

  // ===== 串珠模式计算属性 =====
  totalDiameter: number         // 已选珠子直径之和（仅串珠模式）
  maxDiameter: number           // 当前尺寸可容纳最大直径 = selectedSize - template.sizing.margin（仅串珠模式）
  remainingSpace: number        // 剩余可用空间（仅串珠模式）
  sizeLabel: string             // 尺寸标签（从模板获取，如"手围"/"颈围"/"指围"）

  // ===== 镶嵌模式计算属性 =====
  filledSlotCount: number       // 已填入宝石的槽位数
  totalSlotCount: number        // 总槽位数（= template.layout.params.slots.length）
  nextEmptySlotId: string|null  // 下一个空槽位 ID（按模板 slots 数组顺序查找第一个未填充的）
  requiredSlotsFilled: boolean  // 所有 required 槽位是否已填充（结算校验用）
  activeSlotConstraints: {      // 当前激活槽位的约束信息（用于素材列表过滤：不匹配的宝石灰显不可选）
    allowedDiameters: number[]
    allowedShapes: string[]
    allowedCategoryIds: string[]
  } | null

  // ===== 通用计算属性 =====
  totalPrice: number            // 总价（串珠: sum(selectedBeads.price)，镶嵌: sum(slotFillings.values().price)）
  canUndo: boolean              // 撤销栈是否非空
  canRedo: boolean              // 重做栈是否非空
  availableCategories: Category[] // 当前款式的专属分类列表
  canSubmit: boolean            // 是否可提交（串珠: 珠子数 ≥ minBeads，镶嵌: requiredSlotsFilled）

操作方法：

  // ===== 通用方法 =====
  setTemplate(template)         // 设置款式模板（从款式选择页传入），根据 shape 初始化对应模式状态
  clearDesign()                 // 清空设计（串珠: 清空 selectedBeads，镶嵌: 清空 slotFillings），推入撤销栈
  undo()                        // 撤销：从 undoStack 弹出恢复，当前状态推入 redoStack
  redo()                        // 重做：从 redoStack 弹出恢复，当前状态推入 undoStack
  restoreFromCache()            // 从本地缓存恢复
  saveToCache()                 // 保存到本地缓存

  // ===== 串珠模式方法 =====
  addBead(bead)                 // 添加珠子（含容量校验），推入撤销栈
  removeBead(index)             // 删除指定位置珠子，推入撤销栈
  removeSelectedBeads()         // 批量删除所有选中珠子（多选删除）
  moveBead(fromIndex, toIndex)  // 调整珠子顺序，推入撤销栈
  toggleBeadSelection(index)    // 切换珠子选中状态（支持多选）
  clearSelection()              // 清空选中状态
  setSize(size)                 // 修改尺寸（手围/颈围/指围）

  // ===== 镶嵌模式方法 =====
  setActiveSlot(slotId)         // 设置当前激活槽位（用户点击预览区槽位时触发）
  fillSlot(bead, slotId?)       // 填入宝石到指定槽位（含约束校验），推入撤销栈
                                //   slotId 不传时：优先填入 activeSlotId，其次 nextEmptySlotId
                                //   校验：allowedDiameters + allowedShapes + allowedCategoryIds（三重匹配）
                                //   填入后自动将 activeSlotId 移到下一个空槽位
  clearSlot(slotId)             // 清空指定槽位的宝石，推入撤销栈
  swapSlots(slotIdA, slotIdB)   // 交换两个槽位的宝石（长按拖拽触发），推入撤销栈
```

### 6. API 层扩展

新增 `utils/api/diy.ts`，遵循项目现有 barrel re-export 模式，在 `utils/api/index.ts` 中聚合导出：

```
接口规划（已与后端实际实现对齐）：

GET  /api/v4/diy/templates?category_id=xxx → getTemplates(categoryId?)
     返回：[{ diy_template_id, template_code, display_name, category_id, layout, bead_rules, sizing_rules, capacity_rules, material_group_codes, ... }]
     说明：获取已发布的款式模板列表（status='published', is_enabled=1），支持按 category_id 筛选

GET  /api/v4/diy/templates/:id          → getTemplateById(templateId)
     返回：完整模板数据（含 layout/bead_rules/sizing_rules/capacity_rules + 关联的 Category 和 MediaFile）

GET  /api/v4/diy/templates/:id/materials → getTemplateMaterials(templateId)
     返回：[{ asset_code, display_name, group_code, form, tier, visible_value_points, image_url, available_amount, frozen_amount }]
     说明：获取该模板可用的材料列表（按 material_group_codes 过滤 MaterialAssetType）+ 用户持有量

GET  /api/v4/diy/templates/:id/beads    → getTemplateBeads(templateId)
     返回：该模板可用的实物珠子/宝石素材列表（diy_materials 表数据）
     说明：按模板的 material_group_codes 过滤 diy_materials，返回实物素材信息

GET  /api/v4/diy/works                  → getWorks()
     返回：[{ diy_work_id, work_code, work_name, status, template, preview_media, ... }]
     说明：获取当前用户的作品列表

GET  /api/v4/diy/works/:id              → getWorkById(workId)
     返回：完整作品数据（含模板 + 材料 + 预览图）

GET  /api/v4/diy/materials/user         → getUserMaterials(templateId?)
     返回：用户持有的材料列表（支持按模板筛选）

GET  /api/v4/diy/material-groups        → getMaterialGroups()
     返回：所有材料分组列表（group_code + display_name）

POST /api/v4/diy/works                  → saveWork(workData)
     请求：{ diy_template_id, work_name, design_data: { mode, beads/fillings }, total_cost: [{ asset_code, amount }] }
     返回：{ diy_work_id, work_code, status: 'draft' }
     说明：保存设计草稿（创建或更新）

DELETE /api/v4/diy/works/:id            → deleteWork(workId)
     说明：删除作品（仅 draft 状态可删）

POST /api/v4/diy/works/:id/confirm      → confirmDesign(workId)
     说明：确认设计，冻结材料（draft → frozen）

POST /api/v4/diy/works/:id/complete     → completeDesign(workId)
     说明：完成设计，从冻结扣减 + 铸造物品（frozen → completed）

POST /api/v4/diy/works/:id/cancel       → cancelDesign(workId)
     说明：取消设计，解冻材料（frozen → cancelled）
```

> **注意**：旧文档中设计的 `GET /api/v4/diy/categories`、`POST /api/v4/diy/designs`、`POST /api/v4/diy/orders` 等接口已不存在。实际实现为上述 12 个用户端接口。材料查询拆分为三个维度：`/templates/:id/materials`（虚拟资产材料+持有量）、`/templates/:id/beads`（实物珠子素材）、`/materials/user`（用户持有材料）。设计保存/确认/完成/取消拆分为 4 个独立接口。

### 7. 本地缓存策略

```
缓存 Key：DIY_DRAFT_{templateId}      // 按款式分别缓存
缓存结构（串珠模式）：{
  version: 3,                    // 数据版本号（V3 支持双模式）
  mode: "beads",                 // 模式标识
  templateId: "tpl_bracelet_01", // 款式模板 ID
  selectedSize: 150,             // 当前选择的尺寸
  beads: [{ beadId, name, diameter, price, imageUrl, position }],
  updatedAt: 1711526400000,      // 最后编辑时间戳
  expiresAt: 1712131200000       // 过期时间 = updatedAt + 7天
}

缓存结构（镶嵌模式）：{
  version: 3,
  mode: "slots",                 // 模式标识
  templateId: "tpl_pendant_01",  // 款式模板 ID
  slotFillings: {                // 槽位填充数据（slotId → Bead）
    "slot_center": { beadId, name, diameter, price, imageUrl },
    "slot_left_1": { beadId, name, diameter, price, imageUrl }
  },
  updatedAt: 1711526400000,
  expiresAt: 1712131200000
}

写入时机：
  串珠模式：每次 addBead / removeBead / moveBead / setSize 后自动写入
  镶嵌模式：每次 fillSlot / clearSlot / swapSlots 后自动写入
恢复时机：进入设计页 onLoad 时，根据 templateId 检查缓存，未过期则自动恢复并提示"已恢复上次未完成的设计"
清除时机：用户点击"清空设计" / 缓存过期 / 成功下单后
```

### 8. 性能保障措施

| 目标                    | 措施                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| 首屏 ≤ 2s              | 分包懒加载；款式选择页轻量加载模板列表；设计页仅加载当前款式专属分类素材；图片走 Sealos 对象存储 + webp 格式 |
| 动画 ≥ 30fps           | 飞入动画使用 CSS transform（GPU 加速）；Canvas 渲染珠子数 ≤ 25 颗，单次重绘 < 16ms |
| 内存 ≤ 50MB            | 图片使用缩略图（200×200）展示，仅 Canvas 渲染时加载高清图；已加载分类上限缓存 5 个 |
| 操作响应 ≤ 100ms       | 点击添加时先更新 Store 状态触发 UI 反馈，动画异步执行                              |

### 9. 兼容性处理

| 场景                         | 处理方案                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Canvas 2D 不支持（低版本）    | 检测 `wx.canIUse('canvas.bindtap')`，降级为旧版 Canvas API     |
| 小屏手机（3.5-5 寸）         | 渲染引擎按屏幕宽度动态计算形状尺寸，各 shape 均自适应       |
| 大屏手机 / iPad              | 形状最大尺寸设上限，超出部分居中展示                         |
| 网络异常                     | 素材加载失败显示占位图 + 重试按钮；已缓存设计离线可查看不可提交 |

---

## 三、风险与依赖

| 风险项                         | 影响       | 应对措施                                                    |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| 后端接口未就绪                 | 阻塞联调   | 接口协议提前对齐，前后端同步开发，确保接口就绪后直接联调     |
| 珠子素材图片量大               | 分包超限   | 图片托管在 Sealos 对象存储，不打包到小程序内                  |
| Canvas 2D 在部分 Android 机型渲染异常 | 显示错位 | 预留 DOM 渲染降级方案（用 absolute 定位代替 Canvas）          |
| 分享路径长度超限               | ✅ 已解决  | 已确认采用后端存储 designId 方案，路径仅传 ID               |
| 海报生成耗时长                 | 用户等待   | 显示"正在生成海报…"loading，Canvas 绘制饰品图+Logo+小程序码完成后再调起保存 |
| 管理端槽位标注工具开发量       | 延长工期   | Web 管理后台独立项目，不影响小程序前端工期；镶嵌模式前置依赖，建议优先开发 |

---

## 四、镶嵌模式槽位标注方案

### 1. 核心问题

后端上传一张吊坠底图后，前端如何知道哪些位置需要镶嵌？

槽位坐标（`SlotDefinition.x/y/width/height`）不可能由前端自动识别，必须有人在底图上**标注**出来。这是镶嵌模式的前置依赖。

### 2. 行业方案对比

#### 大厂方案（腾讯/阿里/美团）

| 公司/场景 | 做法 | 核心特征 |
|-----------|------|----------|
| 腾讯游戏（装备镶嵌系统） | 内部编辑器工具链（如 Unity Editor 扩展），策划在编辑器中拖拽标注装备槽位，导出 JSON 配置 | **可视化编辑器 + 配置导出**，编辑器内部开发不对外 |
| 阿里（淘宝/天猫定制商品） | 商家后台提供「定制区域标注工具」，商家上传商品图 → 在图上框选可定制区域 → 保存为百分比坐标 | **Web 端可视化标注**，嵌入商家后台 |
| 美团（营销活动配置） | 运营后台的「图片热区编辑器」，运营人员在活动图上画框标注点击区域和跳转链接 | **图片热区编辑器**，技术栈 React + Canvas |

**共同点**：全部采用**可视化标注工具**，不让运营/策划手填坐标。一次投入开发成本，长期零配置错误。

#### 游戏公司方案

| 场景 | 做法 |
|------|------|
| MMORPG 装备镶嵌（魔兽世界/梦幻西游类） | 装备模板预定义固定槽位数和类型，**不需要图上标注**（槽位是逻辑概念，UI 固定布局） |
| 二次元换装游戏（奇迹暖暖/闪耀暖暖类） | 美术出图时同步输出挂点坐标 JSON，或在 Spine/Live2D 编辑器中标注 |
| 宝石镶嵌类玩法（暗黑破坏神类） | 物品模板定义槽位数和约束规则，**纯数据驱动**，UI 按固定布局排列 |

**关键洞察**：游戏行业的镶嵌槽位分两种 —— 如果槽位位置固定且少（1~5 个），用模板定义即可；如果位置必须精确对应图片，必须有可视化标注工具。你的场景属于后者。

#### 小公司/小众平台方案

| 方案 | 做法 | 问题 |
|------|------|------|
| 手填 JSON | 后端开发者量像素 → 算百分比 → 手写 JSON | 效率极低，反复调试，每个模板耗时 30min+ |
| Excel 配表 | 策划在 Excel 填坐标 → 导入系统 | 比手填 JSON 好一点，但仍然无法所见即所得 |
| 复用开源热区编辑器 | 嵌入 GrapesJS / 图片热区编辑器库 | 功能过重，需要大量裁剪适配 |

### 3. 方案选型（✅ 推荐方案）

基于项目实际情况的选型判断：

| 项目现状 | 影响选型 |
|----------|----------|
| 项目未上线，无旧接口包袱 | 可一步到位，不需要渐进迁移 |
| 后端已有图片上传能力（`POST /api/v4/user/images/upload` → Sealos 对象存储 → MediaObject） | 底图上传零成本复用 |
| 后端已有 `media_files` 表 + 缩略图自动生成（small/medium/large） | 底图存储和加载已有基础设施 |
| 愿意一次性投入，追求长期低维护 | 选可视化方案，一劳永逸 |
| 标注是精细操作，需要大屏 + 鼠标 | 必须在 Web 端，不适合手机小屏 |

**✅ 推荐：Web 管理后台可视化槽位标注工具**

行业标准做法：**标注配置在 Web 管理后台完成，小程序前端纯消费数据**。

#### 职责边界（明确分工）

```
Web 管理后台（标注端）                    小程序前端（消费端）
─────────────────────                    ─────────────────
上传吊坠底图                              ×
在底图上拖拽标注槽位坐标                   ×
配置每个槽位的约束规则                     ×
保存模板（含 SlotDefinition[]）            ×
发布/下线模板                              ×
                                          调 API 获取模板数据 ✓
                                          根据 layout.shape 分发渲染 ✓
                                          读取 slots[].x/y 渲染槽位 ✓
                                          校验宝石与槽位约束匹配 ✓
                                          用户交互（选宝石/填槽位）✓
```

小程序前端**不需要关心槽位坐标怎么来的**，只需要：
1. 从 `GET /api/v4/diy/templates/:id` 拿到完整模板数据（含 `layout.params.slots[]`）
2. 把 `slots[].x/y` 百分比坐标映射到 Canvas 像素坐标
3. 画底图 + 画槽位 + 处理用户交互

### 4. Web 管理后台槽位标注工具

> **说明**：此部分为 Web 管理后台的技术方案，不属于小程序前端工程范畴。
> 小程序前端仅消费后端 API 返回的模板数据，不参与模板创建和槽位标注。
> 此处列出方案是为了与后端对齐接口协议和数据结构。

#### 4.1 技术栈建议

| 模块 | 建议方案 | 理由 |
|------|----------|------|
| 前端框架 | Vue 3 + Element Plus / React + Ant Design | 管理后台主流选型 |
| 标注画布 | Fabric.js / Konva.js | 成熟的 Canvas 交互库，原生支持拖拽、缩放、框选、对象序列化 |
| API 对接 | 复用后端现有 `/api/v4/console/` 路由体系 | 与小程序管理端共用权限和认证 |
| 图片上传 | 复用现有 `POST /api/v4/user/images/upload` → Sealos 对象存储 | 零成本复用 |

#### 4.2 标注工具交互流程

```
管理员操作流程（Web 端，大屏 + 鼠标操作）：

1. 进入「DIY 模板管理」列表页 → 点击「新建模板」
2. 填写基本信息：款式名称、类型（bracelet/necklace/ring/pendant）、专属素材分类
3. 选择模式：
   - 串珠模式 → 配置 shape（circle/ellipse/arc/line）+ sizing 参数 → 保存即可，无需标注
   - 镶嵌模式 → 进入可视化标注编辑器
4. 上传吊坠底图 → 图片显示在 Canvas 画布上
5. 在底图上操作（Fabric.js / Konva.js 提供开箱即用能力）：
   - 鼠标拖拽画矩形/圆形/椭圆 → 创建一个槽位
   - 拖拽移动槽位位置（精确对齐底图镶嵌位）
   - 拖拽边角调整槽位大小
   - 双击槽位 → 弹出约束配置面板：
     ┌─────────────────────────────────────┐
     │ 槽位名称：[主石位                ]  │
     │ 槽位形状：○圆形 ○椭圆 ○方形 ○矩形  │
     │ 允许宝石尺寸：□4 □6 □8 ☑10 ☑12 mm │
     │ 允许宝石形状：☑圆形 □椭圆 □方形     │
     │ 允许素材分类：[全部分类        ▼]   │
     │ 是否必填：☑是                        │
     │              [确定]  [删除槽位]      │
     └─────────────────────────────────────┘
   - 右侧面板实时显示所有槽位列表及其参数
6. 点击「保存」→ Canvas 像素坐标自动转换为 0~1 百分比 → 调 API 保存
7. 点击「预览」→ 模拟小程序端渲染效果，确认槽位位置准确
8. 确认无误 → 点击「发布」→ 用户端可见

坐标转换公式（标注工具自动计算）：
  slot.x = slotCenterX / canvasImageWidth         // 0~1 百分比
  slot.y = slotCenterY / canvasImageHeight         // 0~1 百分比
  slot.width = slotPixelWidth / canvasImageWidth   // 0~1 百分比
  slot.height = slotPixelHeight / canvasImageHeight // 0~1 百分比
```

#### 4.3 管理端 API

```
// 后端路由：/api/v4/console/diy/（已全部实现，14 个接口）

// 模板管理（6 个）
GET    /api/v4/console/diy/templates             → 模板列表（含草稿，分页/筛选）
GET    /api/v4/console/diy/templates/:id         → 模板详情
POST   /api/v4/console/diy/templates             → 创建模板
PUT    /api/v4/console/diy/templates/:id         → 更新模板（含槽位标注数据）
PUT    /api/v4/console/diy/templates/:id/status  → 发布/下线模板（状态机校验）
DELETE /api/v4/console/diy/templates/:id         → 删除模板（仅草稿且无关联作品可删，role_level >= 80）

// 作品查看（2 个，只读）
GET    /api/v4/console/diy/works                 → 所有用户作品列表
GET    /api/v4/console/diy/works/:id             → 作品详情

// 材料管理（5 个）
GET    /api/v4/console/diy/materials             → 材料列表
GET    /api/v4/console/diy/materials/:id         → 材料详情
POST   /api/v4/console/diy/materials             → 创建材料
PUT    /api/v4/console/diy/materials/:id         → 更新材料
DELETE /api/v4/console/diy/materials/:id         → 删除材料

// 统计（1 个）
GET    /api/v4/console/diy/stats                 → DIY 模块统计数据

// 权限：所有接口 role_level >= 60，删除模板 role_level >= 80
```

#### 4.4 模板生命周期

```
草稿（draft）→ 已发布（published）→ 已下线（archived）

管理员创建模板 → 上传底图 → 标注槽位 → 保存（草稿状态）
→ 预览确认无误 → 点击发布 → 用户端可见
→ 需要调整 → 下线 → 编辑 → 重新发布
```

---

## 五、产品确认汇总（全部已确认）

| 序号 | 问题                                       | 建议                        | 状态       |
| ---- | ------------------------------------------ | --------------------------- | ---------- |
| 0    | 系统为模板驱动通用 DIY 设计引擎            | 后端定义款式模板            | ✅ 已确认  |
| 0.1  | 用户流程：分类 Tab → 选具体款式 → 设计页   | 分类 Tab + 模板卡片列表     | ✅ 已确认  |
| 0.2  | 排列形状由后端参数完全自定义               | circle/ellipse/arc/line/slots | ✅ 已确认  |
| 0.3  | 不同款式有各自专属素材                     | 通过 material_group_codes 关联 | ✅ 已确认  |
| 0.4  | 同时支持串珠模式和镶嵌模式                 | shape 值自动分发            | ✅ 已确认  |
| 0.5  | 镶嵌模式交互：点槽位选宝石 + 选宝石自动填入 | 两种方式并存              | ✅ 已确认  |
| 0.6  | 镶嵌模式槽位数量由后端灵活配置             | 不限定数量                  | ✅ 已确认  |
| 0.7  | 镶嵌模式每个槽位有独立约束                 | allowedDiameters/allowedShapes/allowedCategoryIds | ✅ 已确认  |
| 0.8  | 槽位标注方案：Web 管理后台可视化标注工具   | 小程序前端纯消费数据        | ✅ 已确认  |
| 1    | 弹性余量具体值                             | 默认 10mm，按模板独立配置   | ✅ 已确认  |
| 2    | 可选珠子尺寸规格                           | 4/6/8/10/12/14mm 六档，按模板约束 | ✅ 已确认  |
| 3    | 排列方式（等角度分布）                     | 等角度分布                  | ✅ 已确认  |
| 4    | 素材数据来源（后端 API）                   | 后端 API                    | ✅ 已确认  |
| 5    | 图片托管方式                               | Sealos 对象存储             | ✅ 已确认  |
| 5.1  | 图片格式与尺寸规格                         | PNG 透明底，复用现有三档缩略图 150/300/600 | ✅ 已确认  |
| 6    | 价格由后端设置调整                         | 后端管理                    | ✅ 已确认  |
| 6.1  | 价格单位为可叠加资产价格                   | 资产体系                    | ✅ 已确认  |
| 6.2  | 套餐优惠/满减逻辑                          | 不做，单颗定价              | ✅ 已确认  |
| 7    | 珠子为可叠加资产                           | 同款可多颗                  | ✅ 已确认  |
| 8    | 结算流程                                   | 三步状态机：draft→frozen→completed | ✅ 已确认  |
| 9    | 分享方案（后端存储 + ID）                  | 后端存储 ID                 | ✅ 已确认  |
| 10   | 海报内容：饰品图 + 品牌 Logo + 小程序码   | 需布局设计稿                | ✅ 已确认  |
| 10.1 | 海报尺寸、布局排版、背景样式               | 750×1334 @2x 三段式，代码写死 | ✅ 已确认  |
| 11   | 尺寸选择 UI 形式（Picker）                 | Picker 滚动选择器           | ✅ 已确认  |
| 12   | 支持多选删除 + 一键清空                    | 多选删除 + 一键清空         | ✅ 已确认  |
| 13   | 支持撤销和重做                             | 撤销 + 重做                 | ✅ 已确认  |
| 14   | 珠子顺序可调整                             | 支持调整顺序（串珠模式）    | ✅ 已确认  |
| 15   | 空白预览区视觉样式                         | 虚线轮廓 + 引导文案，代码实现 | ✅ 已确认  |

---

## 六、前后端数据对接清单

> **本章说明**：以下是小程序前端需要后端提供的**完整数据清单**。
> 前端不参与模板创建、槽位标注、素材管理等管理端操作，只负责**接收数据 → 渲染 → 用户交互 → 提交结果**。

### 1. 款式模板数据

**接口**：`GET /api/v4/diy/templates`（列表）、`GET /api/v4/diy/templates/:id`（详情）

前端在款式选择页调用列表接口，用户选择后调用详情接口获取完整模板。

```
后端需返回的字段（以镶嵌模式吊坠为例）：

{
  "id": "tpl_pendant_flower",
  "name": "花瓣吊坠",
  "type": "pendant",
  "icon": "https://sealos.xxx/icons/pendant_flower.png",   // 款式选择页展示用图标

  "layout": {
    "shape": "slots",                                        // ← 前端据此判断进入镶嵌模式
    "params": {
      "backgroundImage": "https://sealos.xxx/pendants/flower_bg.png",  // 吊坠底图 URL
      "backgroundWidth": 800,                                // 底图原始设计宽度（px）
      "backgroundHeight": 1000,                              // 底图原始设计高度（px）
      "slots": [                                             // ← 核心：Web 管理后台标注后生成的槽位列表
        {
          "slotId": "slot_center",
          "label": "主石位",
          "x": 0.50,                                         // 槽位中心 X（0~1 百分比）
          "y": 0.30,                                         // 槽位中心 Y（0~1 百分比）
          "width": 0.15,                                     // 槽位宽度（0~1 百分比）
          "height": 0.12,                                    // 槽位高度（0~1 百分比）
          "slotShape": "circle",                             // 槽位形状（决定渲染裁剪蒙版）
          "allowedDiameters": [10, 12],                      // 该槽位只接受 10mm 或 12mm 的宝石
          "allowedShapes": ["circle"],                       // 该槽位只接受圆形切割宝石
          "allowedCategoryIds": [],                          // 空 = 不限分组，继承模板级 material_group_codes（数据库字段名为 allowed_group_codes）
          "required": true                                   // 必填（不填不能提交订单）
        },
        {
          "slotId": "slot_left_1",
          "label": "左副石位",
          "x": 0.30,
          "y": 0.50,
          "width": 0.08,
          "height": 0.08,
          "slotShape": "circle",
          "allowedDiameters": [4, 6],
          "allowedShapes": ["circle"],
          "allowedCategoryIds": [],
          "required": false                                  // 非必填（可以留空）
        },
        {
          "slotId": "slot_right_1",
          "label": "右副石位",
          "x": 0.70,
          "y": 0.50,
          "width": 0.08,
          "height": 0.08,
          "slotShape": "oval",
          "allowedDiameters": [4, 6],
          "allowedShapes": ["circle", "oval"],
          "allowedCategoryIds": [],
          "required": false
        }
      ]
    }
  },

  "sizing": null,                                            // 镶嵌模式无尺寸概念，null

  "capacity": {
    "minBeads": 1,                                           // 至少填 1 个槽位（= required 槽位数）
    "maxBeads": 3,                                           // 总共 3 个槽位
    "allowedDiameters": [4, 6, 8, 10, 12]                   // 全局可用直径（槽位级约束优先）
  },

  "material_group_codes": ["red", "blue", "green", "purple"]  // 该款式可用的材料分组 code（对应 asset_group_defs.group_code）
}
```

```
串珠模式示例（经典手链）：

{
  "id": "tpl_bracelet_classic",
  "name": "经典手链",
  "type": "bracelet",
  "icon": "https://sealos.xxx/icons/bracelet_classic.png",

  "layout": {
    "shape": "circle",                                       // ← 前端据此进入串珠模式
    "params": {}                                             // circle 无额外参数
  },

  "sizing": {
    "label": "手围",
    "unit": "mm",
    "options": [140, 150, 160, 170, 180],
    "defaultValue": 160,
    "margin": 10                                             // 弹性余量 10mm
  },

  "capacity": {
    "minBeads": 1,
    "maxBeads": 0,                                           // 0 = 仅受尺寸限制
    "allowedDiameters": [4, 6, 8, 10, 12, 14]
  },

  "material_group_codes": ["red", "orange", "yellow", "green", "blue", "purple"]  // 该款式可用的材料分组（空数组 [] 表示不限制，所有分组均可用）
}
```

### 2. 素材分类数据

**接口**：`GET /api/v4/diy/templates/:id/materials`

前端进入设计页后，按当前模板的 `material_group_codes` 加载对应材料。

```
后端实际返回的字段（按 group_code 分组的 MaterialAssetType 列表）：

[
  {
    "asset_code": "red_core_shard",
    "display_name": "红源晶碎片",
    "group_code": "red",
    "form": "shard",
    "tier": 1,
    "visible_value_points": 10,
    "image_url": "https://objectstorageapi.bja.sealos.run/xxx/red_core_shard.png",
    "available_amount": 50,
    "frozen_amount": 0
  },
  {
    "asset_code": "red_core_gem",
    "display_name": "红源晶",
    "group_code": "red",
    "form": "gem",
    "tier": 2,
    "visible_value_points": 100,
    "image_url": "https://objectstorageapi.bja.sealos.run/xxx/red_core_gem.png",
    "available_amount": 5,
    "frozen_amount": 0
  }
]
```

> **注意**：此接口返回的是 `MaterialAssetType`（虚拟资产类型），不是 `DiyMaterial`（实物珠子商品）。前端按 `group_code` 分组展示（红/橙/黄/绿/蓝/紫），每组内按 `tier` 排序（shard 在前，gem 在后）。

### 3. 珠子/宝石素材数据

**接口**：`GET /api/v4/diy/templates/:id/materials`（与第 2 节同一接口）

前端按 `group_code` 分组展示材料，用户点击选择。

```
后端返回的材料数据中，前端需要关注的字段：

- asset_code: 材料唯一标识（如 "red_core_shard"），用于 design_data 和 total_cost
- display_name: 展示名称（如 "红源晶碎片"）
- group_code: 分组（如 "red"），用于分类 Tab
- form: 形态（"shard" 碎片 / "gem" 完整宝石）
- tier: 等级（1=碎片, 2=宝石），用于排序
- visible_value_points: 价值点数，用于计算总价
- image_url: 材料图片 URL
- available_amount: 用户当前可用数量（0 时灰显不可选）
- frozen_amount: 用户已冻结数量
```

**前端使用方式**：
- 串珠模式：展示全部素材，用户点击即添加到珠串末尾
- 镶嵌模式：根据当前激活槽位的 `allowed_diameters` + `allowed_shapes` + `allowed_group_codes` **过滤**素材列表，不匹配的灰显不可选
- `available_amount = 0` 时灰显不可选（用户没有该材料）

### 4. 设计保存与分享还原

**保存接口**：`POST /api/v4/diy/works`

```
前端提交的数据：

串珠模式：
{
  "diy_template_id": 1,
  "work_name": "我的手链",
  "design_data": {
    "mode": "beading",
    "selected_size": "M",
    "beads": [
      { "position": 0, "asset_code": "red_core_shard", "diameter": 10 },
      { "position": 1, "asset_code": "blue_core_gem", "diameter": 10 },
      { "position": 2, "asset_code": "red_core_shard", "diameter": 10 }
    ]
  },
  "total_cost": [
    { "asset_code": "red_core_shard", "amount": 2 },
    { "asset_code": "blue_core_gem", "amount": 1 }
  ]
}

镶嵌模式：
{
  "diy_template_id": 3,
  "work_name": "我的吊坠",
  "design_data": {
    "mode": "slots",
    "fillings": {
      "slot_center": { "asset_code": "purple_core_gem" },
      "slot_left_1": { "asset_code": "blue_core_shard" }
    }
  },
  "total_cost": [
    { "asset_code": "purple_core_gem", "amount": 1 },
    { "asset_code": "blue_core_shard", "amount": 1 }
  ]
}

后端返回：
{
  "diy_work_id": 6,
  "work_code": "DW260401000006XX",
  "status": "draft"
}
```

**还原接口**：`GET /api/v4/diy/works/:id`

```
后端返回的字段（分享还原 / 查看详情时调用）：

{
  "diy_work_id": 6,
  "work_code": "DW260401000006XX",
  "work_name": "我的手链",
  "status": "draft",
  "design_data": { ... },                // 完整设计数据
  "total_cost": [ ... ],                 // 材料消耗明细
  "template": {                          // 关联的模板完整数据
    "diy_template_id": 1,
    "template_code": "DT26033100000154",
    "display_name": "经典串珠手链",
    "layout": { ... },
    "bead_rules": { ... },
    "sizing_rules": { ... },
    "category": { "category_id": 191, "category_name": "手链", "category_code": "DIY_BRACELET" }
  },
  "preview_media": null,                 // 预览图（如有）
  "created_at": "2026-04-01T10:00:00.000Z"
}
```

### 5. 确认/完成/取消接口

**确认设计**：`POST /api/v4/diy/works/:id/confirm`（draft → frozen，冻结材料）
**完成设计**：`POST /api/v4/diy/works/:id/complete`（frozen → completed，扣减 + 铸造物品）
**取消设计**：`POST /api/v4/diy/works/:id/cancel`（frozen → cancelled，解冻材料）

```
确认设计后返回：
{
  "diy_work_id": 6,
  "status": "frozen",
  "frozen_at": "2026-04-01T10:05:00.000Z"
}

完成设计后返回：
{
  "diy_work_id": 6,
  "status": "completed",
  "item_id": 8001,                       // 铸造的物品实例 ID
  "completed_at": "2026-04-01T10:10:00.000Z"
}

取消设计后返回：
{
  "diy_work_id": 6,
  "status": "cancelled"
}
```

### 6. 海报小程序码

**接口**：`GET /api/v4/diy/works/:id/qrcode`（或复用微信现有小程序码接口）

```
后端需返回：
{
  "qrcode_url": "https://objectstorageapi.bja.sealos.run/xxx/qrcodes/work_6.png"   // 小程序码图片 URL
}

小程序码扫码后的路径：
  /packageDIY/diy-design/diy-design?workId=6
```

### 7. 数据流总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web 管理后台                               │
│  上传底图 → 标注槽位坐标 → 配置约束规则 → 保存模板               │
│  管理珠子材料 → 上传图片 → 配置价格（star_stone 计价）           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ 写入数据库
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                         后端 API                                  │
│  模板数据（含槽位坐标）、材料数据（含图片URL）、作品存储、铸造    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP JSON
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                      小程序前端（纯消费端）                        │
│                                                                   │
│  款式选择页                                                       │
│    ← GET /api/v4/diy/templates（列表，按分类分组）                │
│    展示款式卡片，用户点击选择                                     │
│                                                                   │
│  设计页                                                           │
│    ← GET /api/v4/diy/templates/:id（完整模板，含 layout/rules）   │
│    ← GET /api/v4/diy/templates/:id/materials（材料列表+用户持有量）│
│    根据 layout.shape 自动切换串珠/镶嵌渲染模式                   │
│    用户操作：选材料 → 添加/填入 → 调整 → 预览                   │
│                                                                   │
│  提交流程                                                         │
│    → POST /api/v4/diy/works（保存草稿）                          │
│    → POST /api/v4/diy/works/:id/confirm（确认设计，冻结材料）    │
│    → POST /api/v4/diy/works/:id/complete（完成设计，铸造物品）   │
│    → POST /api/v4/diy/works/:id/cancel（取消设计，解冻材料）     │
│                                                                   │
│  分享还原                                                         │
│    ← GET /api/v4/diy/works/:id（完整作品数据，含模板+设计数据）  │
└──────────────────────────────────────────────────────────────────┘
```

### 8. 前端对后端的关键要求

| 要求 | 说明 | 影响 |
|------|------|------|
| 图片必须 PNG 透明底 | Canvas 绘制宝石需要透明背景，JPG 白底会遮挡底图 | 渲染正确性 |
| 图片需提供缩略图 | 列表展示用缩略图（200×200），Canvas 渲染用高清图（400×400），已有 `thumbnail_keys` 三档 | 性能（内存/加载速度） |
| 槽位坐标必须是 0~1 百分比 | 前端按屏幕宽度自适应缩放，像素绝对坐标无法适配不同机型 | 多机型兼容 |
| 模板需返回完整 layout | 前端不二次请求槽位数据，一次 `GET /api/v4/diy/templates/:id` 拿到全部 | 减少请求数 |
| 作品还原需返回完整模板信息 | `GET /api/v4/diy/works/:id` 返回的 template 需含完整 layout/rules，前端直接渲染 | 分享页秒开 |
| `available_amount=0` 时前端灰显 | 后端返回用户实时持有量，前端据此控制可选状态 | 余额准确性 |
| 价格由后端计算和校验 | 前端展示的总价仅供参考，确认设计时后端根据 `total_cost` 重新校验并冻结 | 防篡改 |

---

## 七、Mock 开发方案

> **说明**：前后端并行开发阶段，小程序前端使用 Mock 数据开发和调试。Mock 数据的字段名必须与后端实际返回的蛇形命名一致（见第八章对齐规范），联调时直接切换 API 地址即可，无需改字段映射。

---

## 八、后端数据库真实状态对齐分析

> **编制日期**：2026-04-02（三次对齐，直连真实数据库验证）
> **分析依据**：直连后端真实数据库（`restaurant_points_dev`，120 张表），逐表 DESCRIBE + SELECT 验证；逐文件分析后端代码实现
> **分析范围**：后端 Node.js 项目代码 + Web 管理后台（admin/）+ 真实数据库数据
> **重要变更**：自 2026-03-30 首次对齐以来，后端已完成虚拟资产命名重构（DIAMOND→star_stone，shard/crystal→core_shard/core_gem），DIY 模块已全部实现。本次对齐修正了数据量统计（模板 7 条、作品 0 条、珠子 61 条）和 `material_asset_types` 实际为 16 种（无 merchant_points），补充了 `diy_materials.price_asset_code` DDL 默认值遗留问题

### 8.1 后端技术栈实况（真实数据库验证）

| 层级 | 技术 | 真实数据验证 |
|------|------|------|
| 框架 | Express 4.18 + Sequelize 6.35 | Node.js ≥20.18.0，mysql2 3.6 驱动 |
| 数据库 | MySQL（Sealos 云数据库 `dbconn.sealosbja.site:42569`） | **120 张表**，时区 `+08:00` |
| 路由 | v4 路由文件 | 统一 `/api/v4/` 前缀，按业务域分目录 |
| 服务层 | 分层架构 | 含 `UnifiedLotteryEngine` 子系统、`DIYService`（1345 行） |
| 响应格式 | `ApiResponse` 中间件 | `success/code/message/data/timestamp/version/request_id` 7 字段标准格式 |
| 媒体系统 | `media_files` + `media_attachments` | 多态关联（`attachable_type` + `attachable_id`），Sealos S3 存储，自动生成 small/medium/large 三档缩略图 |
| 账户体系 | `accounts` + `account_asset_balances` | 双余额模型（`available_amount` + `frozen_amount`），支持冻结/解冻/结算 |
| 物品体系 | `item_templates` → `items` → `item_ledger` | 三表架构：模板→实例→双录记账本，`item_holds` 管理锁定 |
| 分类体系 | `categories`（**30 个**，2 级树形） | 含 DIY 饰品分类（id=190-194），支持 `icon_media_id` 图标关联 |
| 稀有度 | `rarity_defs`（5 级） | common(普通)/uncommon(稀有)/rare(精良)/epic(史诗)/legendary(传说) |
| 材料资产 | `material_asset_types`（**16 种**） | **已完成命名重构**：6 色 core_shard + 6 色 core_gem + star_stone + points + budget_points + star_stone_quota |
| 材料分组 | `asset_group_defs`（9 个） | 6 色材料组（red/orange/yellow/green/blue/purple，`group_type='material'`）+ 3 个系统组（currency/points/system，`group_type='system'`） |
| 资产常量 | `constants/AssetCode.js` | 统一枚举，键 UPPER_SNAKE_CASE，值 lower_snake_case（如 `AssetCode.STAR_STONE = 'star_stone'`） |
| DIY 模块 | **已全部实现** | 3 张表 + 1 个服务 + 26 个接口 + 4 个 admin 页面 |

#### 虚拟资产命名重构对照表（已完成）

| 旧名称 | 新名称 | asset_code | display_name |
|--------|--------|------------|-------------|
| 钻石 DIAMOND | 星石 | `star_stone` | 星石 |
| 钻石配额 DIAMOND_QUOTA | 星石配额 | `star_stone_quota` | 星石配额 |
| 红色碎片 red_shard | 红源晶碎片 | `red_core_shard` | 红源晶碎片 |
| 红色水晶 red_crystal | 红源晶 | `red_core_gem` | 红源晶 |
| 橙色碎片 orange_shard | 橙源晶碎片 | `orange_core_shard` | 橙源晶碎片 |
| 橙色水晶 orange_crystal | 橙源晶 | `orange_core_gem` | 橙源晶 |
| 黄色碎片 yellow_shard | 黄源晶碎片 | `yellow_core_shard` | 黄源晶碎片 |
| 黄色水晶 yellow_crystal | 黄源晶 | `yellow_core_gem` | 黄源晶 |
| 绿色碎片 green_shard | 绿源晶碎片 | `green_core_shard` | 绿源晶碎片 |
| 绿色水晶 green_crystal | 绿源晶 | `green_core_gem` | 绿源晶 |
| 蓝色碎片 blue_shard | 蓝源晶碎片 | `blue_core_shard` | 蓝源晶碎片 |
| 蓝色水晶 blue_crystal | 蓝源晶 | `blue_core_gem` | 蓝源晶 |
| 紫色碎片 purple_shard | 紫源晶碎片 | `purple_core_shard` | 紫源晶碎片 |
| 紫色水晶 purple_crystal | 紫源晶 | `purple_core_gem` | 紫源晶 |

> **注意**：form 字段也已重构：`shard`（碎片，tier=1）、`gem`（完整宝石，tier=2，原 crystal）、`currency`（自由流通货币）、`quota`（受限配额）
| 材料媒体 | `media_attachments` 已挂载 15 条 `material_asset_type` icon | 每种材料资产都有 icon 图片 |
| 转换规则 | `material_conversion_rules`（2 条） | 目前均已禁用，未来可用于碎片合成源晶 |
| Web 管理后台 | Alpine.js 3.15 + Tailwind CSS 3.4 + Vite 6.4 MPA | 60+ 个 HTML 页面入口，11 个业务模块，12 个 Alpine mixin |
| 微信小程序 | 独立仓库 | 不在本项目中，MobX Store + TypeScript |

### 8.2 可直接复用的现有能力（真实数据库验证）

| 能力 | 现有实现（真实数据验证） | DIY 复用方式 |
|------|----------|-------------|
| 媒体上传/存储 | `MediaService`（upload/attach/detach/replaceMedia）+ Sealos S3 + `media_files` / `media_attachments`，自动生成 small/medium/large 三档缩略图，SHA-256 去重 | 模板预览图/底图走 `preview_media_id`/`base_image_media_id` 直接外键；材料图片走 `media_attachments`（`attachable_type='material_asset_type'`） |
| 材料资产 | `material_asset_types`（16 种），按颜色分组：red/orange/yellow/green/blue/purple 各有 core_shard(碎片,tier=1) + core_gem(源晶,tier=2)，另有 star_stone(星石)、points(积分)、budget_points(预算积分)、star_stone_quota(星石配额) | **碎片/源晶就是珠子/宝石素材**，用 `asset_code` 标识（如 `red_core_shard`、`blue_core_gem`），`media_attachments` 已挂载 icon 图片 |
| 材料图片 | `media_attachments`（`attachable_type='material_asset_type'`, `role='icon'`）已关联到每种材料 | 珠子/宝石的展示图片已有，通过 `MediaService.getMediaForEntity('material_asset_type', id)` 获取 |
| 账户余额 | `accounts` + `account_asset_balances`，`available_amount` + `frozen_amount` 双余额 | 用户持有的材料数量直接查 `account_asset_balances WHERE account_id=? AND asset_code=?` |
| 资产扣减 | `BalanceService`（freeze / settleFromFrozen / unfreeze，事务 + 幂等 `idempotency_key`） | 确认设计→冻结材料，完成设计→从冻结扣减，取消设计→解冻 |
| 分类体系 | `categories`（30 个，2 级树形），**已新增 DIY 分类**：id=190 DIY饰品(L1) → id=191 手链 / id=192 项链 / id=193 戒指 / id=194 吊坠(L2) | 模板通过 `category_id` 关联分类 |
| 稀有度 | `rarity_defs`（5 级：common/uncommon/rare/epic/legendary） | 材料稀有度展示，注意**实际只有 5 级，无 mythic** |
| 统一响应 | `ApiResponse` 中间件（`res.apiSuccess/apiError/apiPaginated/apiCreated`） | 所有新接口统一格式 |
| 认证中间件 | JWT + `authenticateToken` + `requireRoleLevel`（`middleware/auth.js`） | 用户鉴权 + 管理端权限控制（role_level ≥ 60） |
| 图片上传组件 | admin 的 `imageUploadMixin`（`admin/src/alpine/mixins/image-upload.js`） | 模板管理页面直接复用 |
| CRUD Mixin | admin 的 `createCrudMixin` + `paginationMixin` + `formValidationMixin` + `modalMixin` | 模板管理页面直接复用 |
| 转换规则 | `material_conversion_rules`（2 条，目前均禁用），支持 `from_asset_code → to_asset_code` + 手续费 | DIY 场景暂不需要，但未来"碎片合成源晶"可复用 |
| 资产常量 | `constants/AssetCode.js` 统一枚举 | 消除硬编码，如 `AssetCode.STAR_STONE`、`AssetCode.RED_CORE_SHARD` |

**关键说明**：
1. 材料的 `group_code` 是颜色名（`red`/`orange`/`yellow`/`green`/`blue`/`purple`），对应 `asset_group_defs` 中的 6 个材料分组
2. 每个颜色有 2 种形态：`shard`（碎片，tier=1，低价值）和 `gem`（完整宝石，tier=2，高价值），通过 `form` 字段区分
3. 材料的 `visible_value_points` 按颜色递增：红(10/100) → 橙(20/200) → 黄(40/400) → 绿(80/800) → 蓝(160/1600) → 紫(320/3200)，形成完整的价值梯度
4. 材料查询接口为 `GET /api/v4/diy/templates/:id/materials`，查 `MaterialAssetType` + 关联的 `MediaFile` + 用户 `AccountAssetBalance`

### 8.3 后端已完成实现的内容（✅ 全部落地）

> **状态更新**（2026-04-02）：以下所有内容已全部实现并部署到数据库，不再是"需要新建"。

#### 8.3.1 `diy_templates` 表（✅ 已建好，7 条数据）

数据库中已有 7 个模板，其中 3 个已发布（published），4 个草稿（draft）。

```sql
diy_templates
├── diy_template_id (PK, BIGINT, 自增)
├── template_code (VARCHAR 32, UNIQUE, 如 'DT26033100000154')  -- OrderNoGenerator 生成
├── display_name (VARCHAR 200, '经典串珠手链')
├── category_id (FK → categories.category_id)    -- 复用现有分类体系
├── layout (JSON)              -- 核心：shape + 几何参数 + slot_definitions（镶嵌模式）
├── bead_rules (JSON)          -- 珠子规则：margin/default_diameter/allowed_diameters
├── sizing_rules (JSON)        -- 尺寸规则：size_options 数组（label/display/radius/bead_count）
├── capacity_rules (JSON)      -- 容量规则：min_beads/max_beads
├── material_group_codes (JSON)-- 该款式可用的材料分组 code 列表（如 ["red","blue","green"]）
├── preview_media_id (FK → media_files.media_id, BIGINT UNSIGNED)  -- 款式预览图
├── base_image_media_id (FK → media_files.media_id, BIGINT UNSIGNED, NULLABLE)  -- 镶嵌模式底图
├── status (ENUM: 'draft','published','archived', 默认 'draft')
├── is_enabled (TINYINT, 默认 1)
├── sort_order (INT, 默认 0)
├── meta (JSON)                -- 扩展字段
├── created_at (DATETIME, 默认 CURRENT_TIMESTAMP)
├── updated_at (DATETIME, 默认 CURRENT_TIMESTAMP ON UPDATE)
```

**真实数据示例**（经典串珠手链，id=1）：
- `layout`: `{ "shape": "circle", "radius_x": 120, "radius_y": 120, "bead_count": 18 }`
- `bead_rules`: `{ "margin": 10, "default_diameter": 8, "allowed_diameters": [6,8,10,12] }`
- `sizing_rules`: `{ "default_size": "M", "size_options": [{"label":"S","display":"小号 (约15cm)","radius_x":95,"radius_y":95,"bead_count":14}, {"label":"M",...}, {"label":"L",...}] }`
- `capacity_rules`: `{ "min_beads": 12, "max_beads": 24 }`
- `material_group_codes`: `[]`（空数组表示不限制材料分组，所有分组均可用）
- `category_id`: 191（手链），`status`: `published`，`is_enabled`: 1

**真实数据示例**（心形吊坠，id=3，镶嵌模式）：
- `layout`: `{ "shape": "slots", "background_width": 800, "background_height": 1000, "slot_definitions": [{"slot_id":"slot_center","label":"主石位","x":0.50,"y":0.25,"width":0.15,"height":0.12,"rotation":0,"required":true,"allowed_shapes":["circle","ellipse"],"allowed_group_codes":[]}, ...共 5 个槽位] }`
- `category_id`: 194（吊坠），`status`: `published`，`is_enabled`: 1
- `material_group_codes`: `[]`（空数组，不限制分组）

**全部 7 条模板**：

| id | template_code | display_name | category_id | layout.shape | status |
|----|--------------|-------------|-------------|-------------|--------|
| 1 | DT26033100000154 | 经典串珠手链 | 191（手链） | circle | published |
| 2 | DT26033100000279 | 锁骨项链 | 192（项链） | ellipse | published |
| 3 | DT260331000003E9 | 心形吊坠 | 194（吊坠） | slots | published |
| 14 | DT260331000014A2 | 项链 | 192（项链） | circle | draft |
| 15 | DT26033100001514 | 项链 | 194（吊坠） | circle | draft |
| 16 | DT260331000016FC | 项链1 | 194（吊坠） | slots | draft |
| 17 | DT2603310000179B | 项链2 | 192（项链） | slots | draft |

> **注意**：分类 id=193（戒指）已建好但尚无对应模板。4 条 draft 模板（id=14-17）为管理后台测试数据，`category_id` 标注有误（如 id=15 标为 194 吊坠但名称为"项链"），正式上线前需清理。

#### 8.3.2 `diy_works` 表（✅ 已建好，0 条数据）

```sql
diy_works
├── diy_work_id (PK, BIGINT, 自增)
├── work_code (VARCHAR 32, UNIQUE)              -- 作品编号（OrderNoGenerator 生成）
├── account_id (FK → accounts.account_id, BIGINT)  -- 复用现有账户体系
├── diy_template_id (FK → diy_templates.diy_template_id, BIGINT)
├── work_name (VARCHAR 200, 用户自定义名称)
├── design_data (JSON)                           -- 核心：用户的珠子/宝石选择方案
│   串珠模式：{ mode: 'beading', beads: [{ asset_code, slot_index, size, ... }] }
│   镶嵌模式：{ mode: 'slots', fillings: { slotId: { asset_code, ... } } }
├── total_cost (JSON)                            -- 总消耗：[{ "asset_code": "red_core_shard", "amount": 5 }, ...]
├── preview_media_id (FK → media_files.media_id, BIGINT UNSIGNED, NULLABLE)
├── item_id (FK → items.item_id, BIGINT, NULLABLE)  -- 完成后铸造的物品实例
├── status (ENUM: 'draft','frozen','completed','cancelled')
├── idempotency_key (VARCHAR 100, UNIQUE)        -- 幂等键，复用现有幂等体系
├── frozen_at (DATETIME, NULLABLE)               -- 冻结时间（用于超时自动解冻）
├── completed_at (DATETIME, NULLABLE)            -- 完成时间
├── created_at (DATETIME, 默认 CURRENT_TIMESTAMP)
├── updated_at (DATETIME, 默认 CURRENT_TIMESTAMP ON UPDATE)
```

**状态机**：`draft`（设计中）→ `frozen`（材料已冻结，待确认）→ `completed`（已扣减，生成物品）/ `cancelled`（取消，解冻材料）
**超时机制**：frozen 状态超过 24 小时自动 cancel（解冻材料）

**真实数据**：当前数据库中 `diy_works` 表为空（0 条记录），尚无用户创建过 DIY 作品。`items` 表中也没有 `item_type='diy_product'` 的铸造物品。

#### 8.3.3 `diy_materials` 表（✅ 已建好，61 条数据）

> 这是独立的实物珠子/宝石商品展示表，与 `material_asset_types`（虚拟资产类型）是两套体系。

```sql
diy_materials
├── diy_material_id (PK, BIGINT UNSIGNED, 自增)
├── material_code (VARCHAR 100, UNIQUE, 如 'amethyst_8mm')
├── display_name (VARCHAR 200, '紫水晶')
├── material_name (VARCHAR 100, '紫水晶')
├── group_code (VARCHAR 50, 如 'purple')
├── diameter (DECIMAL 5,1, 如 8.0)
├── shape (ENUM: 'circle','ellipse','oval','square','heart','teardrop', 默认 'circle')
├── price (DECIMAL 10,2, 如 25.00)
├── price_asset_code (VARCHAR 50, DDL 默认 'DIAMOND'，Sequelize 模型默认 'star_stone')  -- 定价资产代码，实际数据全部为 star_stone
├── stock (INT, 默认 -1 表示无限库存)
├── is_stackable (TINYINT, 默认 1)
├── image_media_id (BIGINT UNSIGNED, NULLABLE)
├── category_id (FK → categories.category_id, NULLABLE)
├── sort_order (INT, 默认 0)
├── is_enabled (TINYINT, 默认 1)
├── meta (JSON)
├── created_at (DATETIME)
├── updated_at (DATETIME)
```

**真实数据（61 条珠子，按分组统计）**：

| 分组 group_code | 数量 | 代表品种 | 直径范围 | 价格范围（星石） |
|----------------|------|---------|---------|----------------|
| yellow | 14 | 巴西黄水晶、透体柠檬黄水晶、黄塔晶、白水晶 | 8-12mm | 6.00 ~ 67.00 |
| red | 12 | 粉水晶、草莓晶、石榴石、红玛瑙、红碧玺 | 8-12mm | 8.00 ~ 120.00 |
| green | 10 | 绿幽灵、绿碧玺、橄榄石、东陵玉 | 8-12mm | 6.00 ~ 85.00 |
| purple | 9 | 紫水晶、紫锂辉石、舒俱来 | 8-12mm | 12.00 ~ 150.00 |
| blue | 9 | 海蓝宝、蓝碧玺、青金石、天河石 | 8-12mm | 10.00 ~ 95.00 |
| orange | 7 | 茶水晶、太阳石、琥珀 | 8-12mm | 8.00 ~ 55.00 |

直径分布：8mm、10mm、12mm 三种规格。价格范围：6.00 ~ 150.00 星石。全部 `price_asset_code = 'star_stone'`，`stock = -1`（无限库存），`is_stackable = 1`。

> **注意**：数据库 `price_asset_code` 列的 DDL 默认值仍为 `'DIAMOND'`（命名重构前遗留），但实际 61 条数据已全部更新为 `'star_stone'`。Sequelize 模型层 `defaultValue` 已设为 `'star_stone'`，新增数据不受影响。

> **图片状态**：61 条珠子中仅少量有 `image_media_id`（已上传图片），大部分尚未上传珠子图片。`media_attachments` 表中有 15 条 `attachable_type='material_asset_type'` 的记录（虚拟材料 icon），但 `diy_materials` 的实物珠子图片仍需补充。

#### 8.3.4 已完成的后端文件清单

| 文件 | 路径 | 说明 | 状态 |
|------|------|------|------|
| `DiyTemplate.js` 模型 | `models/DiyTemplate.js` | Sequelize 模型，关联 `Category` + `MediaFile`（preview/base_image） | ✅ 已实现 |
| `DiyWork.js` 模型 | `models/DiyWork.js` | Sequelize 模型，关联 `Account` + `DiyTemplate` + `MediaFile` + `Item` | ✅ 已实现 |
| `DiyMaterial.js` 模型 | `models/DiyMaterial.js` | Sequelize 模型，关联 `MediaFile`（image）+ `Category` | ✅ 已实现 |
| `DIYService.js` 服务 | `services/DIYService.js` | **1345 行**核心业务逻辑 | ✅ 已实现 |
| `diy.js` 用户端路由 | `routes/v4/diy.js` | 12 个用户端接口 | ✅ 已实现 |
| `diy/index.js` 管理端路由 | `routes/v4/console/diy/index.js` | 管理端路由入口 | ✅ 已实现 |
| `diy/templates.js` | `routes/v4/console/diy/templates.js` | 6 个模板管理接口 | ✅ 已实现 |
| `diy/works.js` | `routes/v4/console/diy/works.js` | 2 个作品查看接口 | ✅ 已实现 |
| `diy/materials.js` | `routes/v4/console/diy/materials.js` | 5 个材料管理接口 | ✅ 已实现 |
| `diy/stats.js` | `routes/v4/console/diy/stats.js` | 1 个统计接口 | ✅ 已实现 |

#### 8.3.5 已完成的后端路由清单

**用户端（小程序调用，12 个接口）**：

| 接口 | 说明 | 核心逻辑 |
|------|------|----------|
| `GET /api/v4/diy/templates` | 获取已发布的模板列表（按分类分组） | `DiyTemplate.findAll({ where: { status: 'published', is_enabled: 1 }, include: [Category, MediaFile] })` |
| `GET /api/v4/diy/templates/:id` | 获取模板详情 | 含 layout/bead_rules/sizing_rules/capacity_rules + 关联的 Category 和 MediaFile |
| `GET /api/v4/diy/templates/:id/materials` | 获取模板可用材料（含用户持有量） | 查 `MaterialAssetType`（按 material_group_codes 过滤）+ `MediaFile` + `AccountAssetBalance` |
| `GET /api/v4/diy/templates/:id/beads` | 获取模板可用的实物珠子/宝石素材 | 查 `DiyMaterial`（按 material_group_codes 过滤），返回实物素材信息 |
| `GET /api/v4/diy/works` | 获取用户作品列表 | `DiyWork.findAll({ where: { account_id }, include: [DiyTemplate, MediaFile] })` |
| `GET /api/v4/diy/works/:id` | 获取作品详情 | 含完整模板数据 + 材料信息 + 预览图 |
| `GET /api/v4/diy/materials/user` | 获取用户持有的材料列表 | 支持按模板筛选，查 `AccountAssetBalance` + `MaterialAssetType` |
| `GET /api/v4/diy/material-groups` | 获取所有材料分组列表 | 返回 group_code + display_name 列表 |
| `POST /api/v4/diy/works` | 保存作品（创建或更新草稿） | 校验模板 + 材料合法性，计算 total_cost |
| `DELETE /api/v4/diy/works/:id` | 删除作品（仅 draft 状态） | 硬删除 |
| `POST /api/v4/diy/works/:id/confirm` | 确认设计（冻结材料） | 事务内：逐项 `BalanceService.freeze` → 更新状态为 frozen |
| `POST /api/v4/diy/works/:id/complete` | 完成设计（扣减 + 铸造） | 事务内：`BalanceService.settleFromFrozen` → `ItemService.mintItem`（item_type='diy_product'）→ 写 item_ledger |
| `POST /api/v4/diy/works/:id/cancel` | 取消设计（解冻材料） | 事务内：逐项 `BalanceService.unfreeze` → 更新状态为 cancelled |

**管理端（Web 后台调用，14 个接口）**：

| 接口 | 说明 | 权限 |
|------|------|------|
| `GET /api/v4/console/diy/templates` | 模板列表（含草稿，分页/筛选） | `role_level >= 60` |
| `GET /api/v4/console/diy/templates/:id` | 模板详情 | `role_level >= 60` |
| `POST /api/v4/console/diy/templates` | 创建模板 | `role_level >= 60` |
| `PUT /api/v4/console/diy/templates/:id` | 更新模板（含槽位标注数据） | `role_level >= 60` |
| `PUT /api/v4/console/diy/templates/:id/status` | 发布/下线模板（状态机校验） | `role_level >= 60` |
| `DELETE /api/v4/console/diy/templates/:id` | 删除模板（仅草稿且无关联作品可删） | `role_level >= 80` |
| `GET /api/v4/console/diy/works` | 所有用户作品列表（分页/筛选） | `role_level >= 60` |
| `GET /api/v4/console/diy/works/:id` | 作品详情 | `role_level >= 60` |
| `GET /api/v4/console/diy/materials` | 材料列表（分页/筛选） | `role_level >= 60` |
| `GET /api/v4/console/diy/materials/:id` | 材料详情 | `role_level >= 60` |
| `POST /api/v4/console/diy/materials` | 创建材料 | `role_level >= 60` |
| `PUT /api/v4/console/diy/materials/:id` | 更新材料 | `role_level >= 60` |
| `DELETE /api/v4/console/diy/materials/:id` | 删除材料 | `role_level >= 60` |
| `GET /api/v4/console/diy/stats` | DIY 模块统计数据 | `role_level >= 60` |

材料冻结/扣减走 `BalanceService`（freeze / settleFromFrozen / unfreeze），事务内操作 `account_asset_balances` 中对应 `asset_code` 的 `available_amount`/`frozen_amount`，幂等机制通过 `idempotency_key` 保证。

> **重要说明**：`getTemplateMaterials` 接口查询的是 `MaterialAssetType`（虚拟资产类型表，即用户账户中的源晶碎片/源晶），不是 `DiyMaterial`（实物珠子商品表）。两者是不同的体系：
> - `MaterialAssetType`：虚拟资产，用户通过抽奖/活动获得，存在 `account_asset_balances` 中
> - `DiyMaterial`：实物珠子商品展示，用 `star_stone`（星石）定价，独立的商品目录

### 8.4 Web 管理后台前端已完成的内容（✅ 已建好 4 个页面）

> **状态更新**（2026-04-02）：admin 管理后台已建好 4 个 DIY 页面，不再是"需要新建"。

#### 8.4.1 已建好的 admin 页面

| 页面文件 | 路径 | 说明 |
|----------|------|------|
| `diy-template-management.html` | `admin/diy-template-management.html` | 款式模板管理（CRUD + 状态切换） |
| `diy-material-management.html` | `admin/diy-material-management.html` | 珠子/宝石材料管理（CRUD） |
| `diy-work-management.html` | `admin/diy-work-management.html` | 用户作品查看（只读） |
| `diy-slot-editor.html` | `admin/diy-slot-editor.html` | 镶嵌模式槽位标注工具 |

#### 8.4.2 已建好的 admin JS 模块

| JS 文件 | 路径 | 说明 |
|---------|------|------|
| `diy-template-management.js` | `admin/src/modules/diy/pages/diy-template-management.js` | 模板管理页面逻辑 |
| `diy-material-management.js` | `admin/src/modules/diy/pages/diy-material-management.js` | 材料管理页面逻辑 |
| `diy-work-management.js` | `admin/src/modules/diy/pages/diy-work-management.js` | 作品查看页面逻辑 |
| `diy-slot-editor.js` | `admin/src/modules/diy/pages/diy-slot-editor.js` | 槽位标注工具逻辑 |

| 页面 | 文件 | 职责 | 技术 |
|------|------|------|------|
| 模板管理页 | `admin/diy-templates.html` + `admin/src/modules/diy/pages/diy-templates.js` | 列表 CRUD（名称、分类、启用/禁用、排序、预览图上传、珠子规则配置） | Alpine.js + Tailwind，复用 `createCrudMixin` + `imageUploadMixin` + `paginationMixin` |
| 槽位标注页 | `admin/diy-slot-editor.html` + `admin/src/modules/diy/pages/diy-slot-editor.js` | Konva.js Canvas 编辑器（上传底图、拖拽标注椭圆槽位、导出 JSON） | Alpine.js + Konva.js（npm 安装，Vite tree-shake） |

**符合现有技术体系**：
- MPA 架构：每个页面一个 HTML 入口，Vite 自动扫描 `admin/*.html`
- Alpine.js 组件化：`Alpine.data('diyTemplatesPage', () => ({...}))` 模式
- Mixin 复用：`imageUploadMixin`（图片上传）、`paginationMixin`（分页）、`formValidationMixin`（表单验证）、`modalMixin`（弹窗）
- API 层：新建 `admin/src/api/diy.js`，复用 `base.js` 的 `request()` 封装（基于 fetch，自动 token 管理）
- 侧边栏：在 `sidebar-nav.js` 的 `navGroups` 中新增 "DIY 饰品" 分组

页面关系：模板管理页的"编辑槽位"按钮跳转到标注页（带 `diy_template_id` 参数），标注页保存后写回 `diy_templates.layout.slot_definitions`，再跳回模板管理页。串珠模式的模板不需要进标注页（没有底图和槽位），只有镶嵌模式才需要。

#### 8.4.2 页面一：模板管理页 `diy-templates.html`

**技术方案**：完全复用现有 admin 开发模式，与 `exchange-item-management.html`、`bid-management.html` 等页面同构。

**页面布局**：

```
┌─────────────────────────────────────────────────────────┐
│  顶部操作栏                                              │
│  [+ 新建模板]  [搜索框]  [分类筛选下拉]  [状态筛选]      │
├─────────────────────────────────────────────────────────┤
│  模板列表表格                                            │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬────┐ │
│ │ 预览 │ 名称 │ 编码 │ 分类 │ 模式 │ 排序 │ 状态 │操作│ │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────┤ │
│ │ [图] │18颗珠│brace │手链  │串珠  │  1   │ ✅  │编辑│ │
│ │      │经典  │let_18│      │circle│      │      │槽位│ │
│ │      │手链  │      │      │      │      │      │删除│ │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────┤ │
│ │ [图] │花瓣  │penda │吊坠  │镶嵌  │  2   │ ✅  │编辑│ │
│ │      │吊坠  │nt_01 │      │slots │      │      │槽位│ │
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┴────┘ │
│  [分页组件]                                              │
├─────────────────────────────────────────────────────────┤
│  编辑模态框（点击"编辑"弹出）                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 基础信息                        预览图上传           │ │
│ │ ┌─────────────────────┐       ┌──────────────┐     │ │
│ │ │ 模板名称 [________] │       │              │     │ │
│ │ │ 模板编码 [________] │       │  [点击上传]   │     │ │
│ │ │ 所属分类 [下拉选择]  │       │              │     │ │
│ │ │ 排序权重 [________] │       └──────────────┘     │ │
│ │ └─────────────────────┘                             │ │
│ │                                                     │ │
│ │ 设计模式  ○ 串珠模式  ○ 镶嵌模式                    │ │
│ │                                                     │ │
│ │ ── 串珠模式参数（选串珠时显示）──                    │ │
│ │ 排列形状 [circle ▼]  珠子数量 [18]                  │ │
│ │ 半径X [120] 半径Y [120]  弹性余量 [10] mm           │ │
│ │ 可用直径 ☑4 ☑6 ☑8 ☑10 ☑12 ☑14 mm                  │ │
│ │ 默认珠径 [10] mm  最小 [4] mm  最大 [14] mm         │ │
│ │                                                     │ │
│ │ ── 镶嵌模式参数（选镶嵌时显示）──                    │ │
│ │ 底图上传 [imageUploadMixin]                         │ │
│ │ 槽位数据 [只读 JSON 预览] [去标注页编辑 →]           │ │
│ │                                                     │ │
│ │              [取消]  [保存]                          │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Alpine.js 组件结构**：

```javascript
// admin/src/modules/diy/pages/diy-templates.js
Alpine.data('diyTemplatesPage', () => ({
  // 复用现有 Mixin
  ...createCrudMixin({
    apiModule: 'diy',
    resourceName: 'template',
    listApi: diyApi.getTemplates,
    createApi: diyApi.createTemplate,
    updateApi: diyApi.updateTemplate,
    deleteApi: diyApi.deleteTemplate,
  }),
  ...imageUploadMixin(),       // 预览图 + 底图上传
  ...paginationMixin(),        // 分页

  // 页面特有状态
  categoryFilter: '',          // 分类筛选
  designMode: 'beading',       // 串珠 beading / 镶嵌 slots

  // 表单字段（编辑模态框）
  form: {
    template_code: '',
    display_name: '',
    category_id: null,
    sort_order: 0,
    is_enabled: 1,
    layout: { shape: 'circle', bead_count: 18, radius_x: 120, radius_y: 120 },
    bead_rules: { margin: 10, default_diameter: 10, allowed_diameters: [4,6,8,10,12,14], min_size: 4, max_size: 14 },
  },

  // 跳转槽位标注页
  goToSlotEditor(templateId) {
    window.location.href = `/admin/diy-slot-editor.html?id=${templateId}`
  },
}))
```

**API 层**：新建 `admin/src/api/diy.js`

```javascript
// admin/src/api/diy.js
import { request } from './base.js'

export const diyApi = {
  getTemplates: (params) => request({ url: '/api/v4/diy/templates', method: 'GET', params }),
  getTemplate: (id) => request({ url: `/api/v4/diy/templates/${id}`, method: 'GET' }),
  createTemplate: (data) => request({ url: '/api/v4/diy/templates', method: 'POST', data }),
  updateTemplate: (id, data) => request({ url: `/api/v4/diy/templates/${id}`, method: 'PUT', data }),
  deleteTemplate: (id) => request({ url: `/api/v4/diy/templates/${id}`, method: 'DELETE' }),
  updateSlotDefinitions: (id, data) => request({ url: `/api/v4/diy/templates/${id}/slots`, method: 'PUT', data }),
}
```

**侧边栏导航**：在 `sidebar-nav.js` 的 `navGroups` 中新增：

```javascript
{
  title: 'DIY 饰品',
  icon: 'palette',
  items: [
    { label: '模板管理', href: '/admin/diy-templates.html', icon: 'template' },
  ]
}
```

#### 8.4.3 页面二：槽位标注页 `diy-slot-editor.html`

**技术方案**：Alpine.js 管理侧边栏表单状态 + Konva.js 管理 Canvas 交互，两者通过事件通信。

**页面布局**：

```
┌──────────────────────────────────────────────────────────────┐
│  顶部工具栏                                                   │
│  [← 返回模板管理]  模板名称：花瓣吊坠  [+ 添加槽位]  [保存]  │
├────────────────────────────────────┬─────────────────────────┤
│                                    │  右侧属性面板            │
│                                    │                         │
│   Konva.js Canvas 画布              │  当前选中：槽位 #1       │
│                                    │  ┌───────────────────┐  │
│   ┌────────────────────────┐       │  │ 标签  [主石位]     │  │
│   │                        │       │  │ X     [0.45]      │  │
│   │    [底图]               │       │  │ Y     [0.32]      │  │
│   │         ╭───╮          │       │  │ 宽度  [0.15]      │  │
│   │        │ 1  │          │       │  │ 高度  [0.12]      │  │
│   │         ╰───╯          │       │  │ 旋转  [15°]       │  │
│   │    ╭──╮      ╭──╮     │       │  │ 允许形状 ☑圆 ☑椭圆 │  │
│   │   │ 2 │    │ 3 │     │       │  │ 允许分类 [下拉多选] │  │
│   │    ╰──╯      ╰──╯     │       │  └───────────────────┘  │
│   │                        │       │                         │
│   └────────────────────────┘       │  槽位列表               │
│                                    │  ┌───────────────────┐  │
│   缩放：[- ][100%][+ ]  适应画布    │  │ #1 主石位    [🗑]  │  │
│                                    │  │ #2 左副石    [🗑]  │  │
│                                    │  │ #3 右副石    [🗑]  │  │
│                                    │  └───────────────────┘  │
│                                    │                         │
│                                    │  JSON 预览              │
│                                    │  ┌───────────────────┐  │
│                                    │  │ [只读 JSON 展示]   │  │
│                                    │  └───────────────────┘  │
├────────────────────────────────────┴─────────────────────────┤
│  底部状态栏：共 3 个槽位 │ 画布尺寸 800×800 │ 上次保存 14:32  │
└──────────────────────────────────────────────────────────────┘
```

**Alpine.js + Konva.js 协作架构**：

```javascript
// admin/src/modules/diy/pages/diy-slot-editor.js
Alpine.data('diySlotEditorPage', () => ({
  // 页面状态
  templateId: new URLSearchParams(location.search).get('id'),
  templateName: '',
  slots: [],              // 槽位数据数组
  selectedSlotIndex: -1,  // 当前选中槽位索引
  stage: null,            // Konva.Stage 实例
  layer: null,            // Konva.Layer 实例
  transformer: null,      // Konva.Transformer 实例（缩放/旋转手柄）

  // 初始化
  async init() {
    const res = await diyApi.getTemplate(this.templateId)
    this.templateName = res.data.display_name
    this.slots = res.data.layout?.slot_definitions || []
    this.initKonva()
    this.renderSlots()
  },

  // 初始化 Konva 画布
  initKonva() {
    this.stage = new Konva.Stage({ container: 'canvas-container', width: 800, height: 800 })
    this.layer = new Konva.Layer()
    this.stage.add(this.layer)

    // 加载底图
    const bgImage = new Image()
    bgImage.onload = () => {
      const bg = new Konva.Image({ image: bgImage, width: 800, height: 800 })
      this.layer.add(bg)
      bg.moveToBottom()
      this.layer.draw()
    }
    bgImage.src = this.baseImageUrl

    // Transformer（选中槽位时显示缩放/旋转手柄）
    this.transformer = new Konva.Transformer({ rotateEnabled: true, enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'] })
    this.layer.add(this.transformer)
  },

  // 添加槽位
  addSlot() {
    const index = this.slots.length
    const slot = { label: `槽位${index + 1}`, x: 0.5, y: 0.5, width: 0.1, height: 0.08, rotation: 0, allowed_shapes: ['circle','ellipse'], allowed_category_ids: [] }
    this.slots.push(slot)
    this.renderOneSlot(slot, index)
  },

  // 渲染单个槽位为 Konva.Ellipse
  renderOneSlot(slot, index) {
    const ellipse = new Konva.Ellipse({
      x: slot.x * 800, y: slot.y * 800,
      radiusX: slot.width * 400, radiusY: slot.height * 400,
      rotation: slot.rotation,
      stroke: '#FF6B35', strokeWidth: 2, fill: 'rgba(255,107,53,0.15)',
      draggable: true, name: `slot_${index}`,
    })

    // 拖拽结束 → 更新 Alpine 数据
    ellipse.on('dragend', () => {
      this.slots[index].x = +(ellipse.x() / 800).toFixed(4)
      this.slots[index].y = +(ellipse.y() / 800).toFixed(4)
    })

    // 点击选中 → 显示 Transformer + 更新侧边栏
    ellipse.on('click tap', () => {
      this.selectedSlotIndex = index
      this.transformer.nodes([ellipse])
      this.layer.draw()
    })

    // 变换结束（缩放/旋转）→ 更新 Alpine 数据
    ellipse.on('transformend', () => {
      this.slots[index].width = +(ellipse.radiusX() * ellipse.scaleX() / 400).toFixed(4)
      this.slots[index].height = +(ellipse.radiusY() * ellipse.scaleY() / 400).toFixed(4)
      this.slots[index].rotation = +ellipse.rotation().toFixed(1)
      ellipse.scaleX(1); ellipse.scaleY(1) // 重置 scale，用实际 radius 存储
    })

    this.layer.add(ellipse)
    this.layer.draw()
  },

  // 侧边栏数值编辑 → 同步到 Konva 图形
  updateSlotFromPanel() {
    const slot = this.slots[this.selectedSlotIndex]
    const ellipse = this.layer.findOne(`.slot_${this.selectedSlotIndex}`)
    if (ellipse) {
      ellipse.x(slot.x * 800); ellipse.y(slot.y * 800)
      ellipse.radiusX(slot.width * 400); ellipse.radiusY(slot.height * 400)
      ellipse.rotation(slot.rotation)
      this.layer.draw()
    }
  },

  // 保存 → 写回后端
  async save() {
    await diyApi.updateSlotDefinitions(this.templateId, { slot_definitions: this.slots })
    // 提示保存成功，跳回模板管理页
  },
}))
```

**关键设计说明**：

| 设计点 | 方案 | 理由 |
|--------|------|------|
| 坐标系 | 0~1 百分比（相对画布） | 小程序端不同屏幕宽度自适应缩放，像素绝对坐标无法适配 |
| 数据流向 | Konva 拖拽 → 更新 Alpine data → 侧边栏实时显示 | 单向数据流，状态一致 |
| 反向同步 | 侧边栏输入 → 更新 Alpine data → 同步 Konva 图形 | 精确数值微调 |
| 保存格式 | `slot_definitions` JSON 数组 | 直接写入 `diy_templates.layout.slot_definitions` |
| 底图显示 | Konva.Image 铺满画布底层 | 运营在真实底图上标注，所见即所得 |

#### 8.4.4 符合现有技术体系的情况

| 项目 | 说明 | 真实验证 |
|------|------|----------|
| Alpine.js 组件化 | 新建页面 + Alpine data 组件，完全符合现有 MPA 模式 | 现有 11 个模块 60+ 页面均采用此模式 |
| 图片上传 | 直接复用 `imageUploadMixin`（`admin/src/alpine/mixins/image-upload.js`），调用 `POST /api/v4/media/upload` + `POST /api/v4/media/attach` | `media_files` + `media_attachments` 多态关联体系 |
| 表格/表单 | 复用现有的 Tailwind 组件样式和 `paginationMixin` / `formValidationMixin` / `modalMixin` | 所有管理页面统一风格 |
| API 封装 | 复用 `admin/src/api/base.js` 的 `request()` 函数（基于 fetch，自动 token 管理，401 跳转） | 现有 35 个 API 模块文件均采用此模式 |
| Canvas 标注工具 | Konva.js（npm 安装 + Vite tree-shake），Alpine.js 管理表单状态，Konva.js 管理 Canvas 交互 | 仅在 admin 后台使用，不影响小程序包大小 |
| 侧边栏导航 | 在 `sidebar-nav.js` 的 `navGroups` 数组中新增 "DIY 饰品" 分组 | 现有分组：系统管理/用户管理/抽奖管理/兑换管理/市场管理/资产管理/运营管理/内容管理/数据分析/门店管理/商户管理 |

#### 8.4.5 不需要的东西

- **不需要** Fabric.js（功能与 Konva.js 重叠，Konva.js 更轻量且 API 更简洁）
- **不需要** SortableJS 拖拽排序（admin 已有但 DIY 场景不需要）
- **不需要** ECharts（DIY 没有图表需求）

### 8.5 微信小程序前端需要改的关键点（对齐后端）

#### 8.5.1 字段命名对齐（驼峰 → 蛇形）

后端 Sequelize 模型统一使用蛇形命名（`underscored: true`），API 响应也是蛇形。小程序直接使用后端返回的蛇形字段，不做映射。

| 文档里写的（驼峰） | 后端实际（蛇形） | 数据来源 |
|---------------------|------------------|------|
| `template.id` | `diy_template_id` | `diy_templates` 表主键 |
| `template.name` | `display_name` | `diy_templates.display_name` |
| `template.shape` | `layout.shape` | `diy_templates.layout` JSON 内嵌字段 |
| `template.beadCount` | `layout.bead_count` | `diy_templates.layout` JSON |
| `template.radiusX/Y` | `layout.radius_x` / `layout.radius_y` | `diy_templates.layout` JSON |
| `template.slotDefinitions` | `layout.slot_definitions` | `diy_templates.layout` JSON |
| `template.categoryIds` | `material_group_codes` | `diy_templates.material_group_codes` JSON 数组，存的是 `asset_group_defs.group_code`（如 `["red","blue"]`） |
| `bead.id` | `asset_code` | `material_asset_types.asset_code`（如 `red_core_shard`、`blue_core_gem`） |
| `bead.name` | `display_name` | `material_asset_types.display_name`（如"红源晶碎片"、"蓝源晶"） |
| `bead.imageUrl` | 通过 `media_attachments` 关联查出 | `MediaService.getMediaForEntity('material_asset_type', id)` 返回 `object_key`（由 `ImageUrlHelper.getImageUrl()` 动态生成完整 URL）+ `thumbnail_keys` |
| `bead.category` | `group_code` | `material_asset_types.group_code`（如 `red`、`blue`） |
| `bead.price` | `visible_value_points` | `material_asset_types.visible_value_points`（展示价值） |
| `bead.stock` | `available_amount` | `account_asset_balances.available_amount`（用户持有量，不是全局库存） |
| `userBalance` | `available_amount` | `account_asset_balances.available_amount` |
| `priceAssetCode` | `cost_asset_code` | 定价资产代码，如 `star_stone`（星石） |
| `slot.allowedCategoryIds` | `allowed_group_codes` | `diy_templates.layout.slot_definitions[].allowed_group_codes`（槽位允许的材料分组 code） |

**核心原则**：小程序直接使用后端返回的蛇形命名字段，不做映射。Store 中的字段名也用蛇形。

#### 8.5.2 API 路径对齐

所有接口统一走 `/api/v4/` 前缀，这是后端的统一规范。文档前几章中写的 `GET /api/diy/templates` 等路径，实际应为 `GET /api/v4/diy/templates`。

#### 8.5.3 材料列表接口已实现

文档里设计的 `getBeadsByCategory()` 接口**不需要**。后端已实现三个维度的材料查询接口：

1. `GET /api/v4/diy/templates/:id/materials` — 查虚拟资产材料（`MaterialAssetType`）+ 用户持有量：
   - 该模板允许的 `material_asset_types` 列表（按 `material_group_codes` 过滤，`WHERE is_enabled=1`，按 `group_code` 分组）
   - 每种材料关联的 `media_files` 图片（icon + thumbnails）
   - 当前用户的 `account_asset_balances`（持有量：`available_amount` + `frozen_amount`）

2. `GET /api/v4/diy/templates/:id/beads` — 查实物珠子素材（`DiyMaterial`）：
   - 按模板的 `material_group_codes` 过滤 `diy_materials` 表
   - 返回实物珠子/宝石的商品信息（名称、直径、形状、价格等）

3. `GET /api/v4/diy/materials/user` — 查用户持有的材料列表：
   - 支持按模板筛选
   - 查 `AccountAssetBalance` + `MaterialAssetType`

小程序拿到后按 `group_code` 分组展示即可。前端的"分类"概念对应后端的 `group_code`（红/橙/黄/绿/蓝/紫），不是 `categories` 表。

> **注意**：此接口查询的是 `MaterialAssetType`（虚拟资产类型，用户账户中的源晶碎片/源晶），不是 `DiyMaterial`（实物珠子商品表）。两者是不同的体系。

#### 8.5.4 材料"库存"概念对齐

文档中的 `stock` 字段需要区分两套体系：
- **虚拟材料（`MaterialAssetType`）**：没有全局库存上限，用户持有量存在 `account_asset_balances.available_amount`。前端展示"可用 × 5"而非"库存 999"。`available_amount = 0` 时灰显不可选
- **实物珠子（`diy_materials`）**：`stock` 字段表示全局库存，`-1` 表示无限库存（当前 61 条珠子全部为 `-1`）。`is_stackable = 1` 表示可叠加

#### 8.5.5 Mock 数据字段名对齐

Mock 开发方案可以保留，但 Mock 数据的字段名必须改成后端实际的蛇形命名（`diy_template_id`、`display_name`、`layout.shape`、`material_group_codes` 等）。

### 8.6 不符合后端技术体系、需要改掉的文档内容

| 问题 | 文档里写的 | 应改为 | 影响端 |
|------|-----------|--------|--------|
| 接口路径 | `/api/diy/xxx` | `/api/v4/diy/xxx` | 小程序 |
| 响应格式 | 自定义响应结构 | 后端统一的 `ApiResponse` 格式（`success/code/message/data/timestamp/version/request_id`） | 小程序 |
| 字段命名 | 驼峰命名（`beadCount`、`radiusX`） | 蛇形命名（`bead_count`、`radius_x`） | 小程序 + Web 管理后台 |
| 素材接口 | `getBeadsByCategory` 独立接口 | 统一 `GET /api/v4/diy/templates/:id/materials` 查 `MaterialAssetType` + `MediaFile` + `AccountAssetBalance` | 后端 + 小程序 |
| 素材分类 | `categoryIds` 关联 `categories` 表 | `material_group_codes` 关联 `asset_group_defs.group_code`（红/橙/黄/绿/蓝/紫） | 后端 + 小程序 |
| 用户余额 | `userBalance` | `account_asset_balances.available_amount` | 小程序 |
| 图片 URL | `imageUrl` 平铺字段 | 通过 `media_attachments` 多态关联查出 `media_files.object_key`，再由 `ImageUrlHelper.getImageUrl(object_key)` 动态生成完整 URL（含 CDN 前缀）；缩略图通过 `media_files.thumbnail_keys` JSON 字段获取 | 后端 |
| 库存概念 | `stock: 999`（全局库存） | `available_amount`（用户持有量），材料资产无全局库存上限 | 小程序 |
| 稀有度等级 | 6 级（含 mythic） | 5 级（common/uncommon/rare/epic/legendary，**无 mythic**） | 文档 |
| 材料分组 | `group_code=gem_shard` | 实际按颜色分组：`red`/`orange`/`yellow`/`green`/`blue`/`purple` | 文档 |
| 管理后台标注工具 | Fabric.js / 原生 Canvas | Konva.js + Alpine.js 事件通信 | Web 管理后台 |
| 管理后台 Mixin 路径 | `admin/src/mixins/` | 实际路径 `admin/src/alpine/mixins/` | Web 管理后台 |
| `diy_materials.price_asset_code` DDL 默认值 | `'DIAMOND'`（旧名） | 应改为 `'star_stone'`（Sequelize 模型层已修正，但 DDL 默认值未同步） | 后端 |

### 8.7 需要拍板的决策点

#### 决策 1：DIY 模板是独立表还是复用 `item_templates`？ — ✅ 已决策：独立建表

**建议：独立建 `diy_templates` 表**。

理由（基于真实数据验证）：
- `item_templates` 全部是 `item_type='voucher'/'product'` 的优惠券/商品模板，字段语义完全不同（`reference_price_points` 是面值、`max_edition` 是限量版数量、`is_tradable` 是可交易性）
- DIY 模板需要 `layout`（几何参数）、`bead_rules`（珠子规则）、`sizing_rules`（尺寸规则）、`material_group_codes`（材料分组）等专属字段，硬塞 `meta` JSON 会污染现有体系
- 独立表长期维护成本更低，不影响现有物品模板的查询和管理
- **已落地**：`diy_templates` 表已建好，7 条数据

#### 决策 2：用户设计作品是否需要生成 `items` 实例？ — ✅ 已决策：方案 B（同时铸造 `items` 实例）

| 方案 | 说明 | 适用场景 | 复杂度 |
|------|------|----------|--------|
| ~~A：仅存 `diy_works`~~ | ~~纯记录，不进入物品流转体系~~ | ~~"设计完下单制作"场景，作品不可交易/赠送~~ | ~~低~~ |
| **✅ B：同时生成 `items` 实例** | `item_type='diy_product'`，关联 `item_template_id`，可进入交易/展示/背包/C2C 市场体系 | "用户设计的饰品可以交易/展示/赠送"场景 | 中 |

**真实数据参考**：现有 `items` 表已有完整的流转体系（`item_ledger` 双录记账、`item_holds` 锁定、`market_listings` C2C 挂单）。选方案 B，DIY 作品直接进入这套体系。

**实现要点（已落地）**：
- `POST /api/v4/diy/works/:id/complete` 内部调用 `ItemService.mintItem()` 铸造实例
- 铸造时 `item_type='diy_product'`，`source='diy'`，`instance_attributes` 存设计数据（design_data + total_cost）
- 铸造后 `diy_works.item_id` 外键指向生成的 `items.item_id`
- 作品自动进入用户背包，可展示/交易/赠送

#### 决策 3：材料扣减时机？ — ✅ 已决策：方案 C（冻结→扣减）

| 方案 | 说明 | 复杂度 | 用户体验 |
|------|------|--------|----------|
| ~~A：点"确认设计"时立即扣减 `available_amount`~~ | ~~简单直接，一步到位~~ | ~~低~~ | ~~用户可能误操作，扣了不好退~~ |
| ~~B：点"下单"时才扣减~~ | ~~设计阶段只是预览，不扣材料~~ | ~~低~~ | ~~可能出现"设计完发现材料被别处用了"的竞态~~ |
| **✅ C：设计时冻结 `frozen_amount`，确认时从冻结扣减** | 最严谨，现有 `account_asset_balances` 已有 `frozen_amount` 字段 | 中 | 最佳，材料被锁定不会被其他操作消耗 |

**真实数据参考**：`account_asset_balances` 表已有 `available_amount` + `frozen_amount` 双余额字段，`BalanceService` 已实现冻结/解冻/结算逻辑（`marketplace` 挂单时就在用）。

**状态机（已落地）**：
- `draft`（设计中，保存草稿）
- → `frozen`（`POST /api/v4/diy/works/:id/confirm` 冻结材料）
- → `completed`（`POST /api/v4/diy/works/:id/complete` 从冻结扣减 + 铸造 `items` 实例）
- → `cancelled`（`POST /api/v4/diy/works/:id/cancel` 解冻材料）
- 超时保护：frozen 状态超过 24 小时自动 cancel

**超时自动解冻**：定时任务扫描 `status='frozen' AND frozen_at < NOW() - INTERVAL 24 HOUR`，自动解冻归还材料，状态改为 `cancelled`。

#### 决策 4：是否给 `categories` 表新增 DIY 相关分类？ — ✅ 已决策并已落地

**已完成**：`categories` 表已新增 DIY 饰品分类树：

| category_id | parent | category_name | category_code | level |
|-------------|--------|---------------|---------------|-------|
| 190 | null | DIY饰品 | DIY_JEWELRY | 1 |
| 191 | 190 | 手链 | DIY_BRACELET | 2 |
| 192 | 190 | 项链 | DIY_NECKLACE | 2 |
| 193 | 190 | 戒指 | DIY_RING | 2 |
| 194 | 190 | 吊坠 | DIY_PENDANT | 2 |

模板通过 `category_id` 关联到具体的二级分类。共 1 个顶级分类 + 4 个二级分类。

**注意**：DIY 模板的"素材分类"（红/橙/黄/绿/蓝/紫）不走 `categories` 表，而是走 `asset_group_defs.group_code`，两者是不同维度的分类。

#### 决策 5：槽位标注工具的实现方案 — ✅ 已决策：Konva.js 可视化标注

镶嵌模式需要标注椭圆形槽位，并支持拖拽、缩放、旋转调整。这不是"在图上点几个圆点"那么简单，原生 Canvas 方案已经不够用。

**原生 Canvas vs Konva.js 对比**：

| 对比项 | 原生 Canvas | Konva.js |
|--------|-------------|----------|
| 椭圆标注 | 自己画，自己算碰撞检测 | `new Konva.Ellipse()` 一行 |
| 拖拽移动 | 自己写 mousedown/move/up | `draggable: true` 一个属性 |
| 缩放大小 | 自己写手柄 + 计算 | `new Konva.Transformer()` 自动出现 8 个手柄 |
| 旋转角度 | 自己写旋转手柄 + 矩阵变换 | Transformer 自带旋转手柄 |
| 包大小 | 0 | 150KB（只在 admin 后台，不影响小程序） |
| 开发量 | 7-10 天（手写 800-1000 行交互代码） | 3-4 天（150-200 行代码） |
| 维护成本 | 高（全是自己的代码） | 低（库处理交互细节） |

Konva.js 只装在 admin 后台项目里，不会影响小程序端的包大小。

**运营操作流程**：

1. 上传底座 PNG 图片（槽位区域透明）
2. Konva.js Canvas 显示底座图
3. 点击"添加槽位" → 在图上出现一个可拖拽的椭圆框
4. 拖拽调整位置、拉手柄调整大小、旋转手柄调整角度
5. 侧边栏可以精确编辑数值（x/y/width/height/rotation/label）
6. 点击"保存" → 导出 `slot_definitions` JSON → 写入 `diy_templates.layout`

**与现有 admin 技术栈的集成方式**：

- Konva.js 通过 npm 安装，Vite 自动 tree-shake
- Alpine.js 管理表单状态和侧边栏，Konva.js 管理 Canvas 交互
- 两者通过事件通信（Konva 选中槽位 → 更新 Alpine data → 侧边栏显示属性）

### 8.8 各端问题归属和执行步骤

#### 后端数据库项目（✅ 已全部完成）

| 序号 | 任务 | 状态 |
|------|------|------|
| B1 | `diy_templates` 表 + Sequelize 模型 | ✅ 已完成（7 条数据：3 published + 4 draft） |
| B2 | `diy_works` 表 + Sequelize 模型 | ✅ 已完成（0 条数据，表结构就绪） |
| B3 | `diy_materials` 表 + Sequelize 模型 | ✅ 已完成（61 条珠子数据，6 色分组） |
| B4 | `categories` 新增 DIY 分类（id=190-194） | ✅ 已完成（1 个顶级 + 4 个二级：手链/项链/戒指/吊坠） |
| B5 | `DIYService.js`（1345 行核心业务逻辑） | ✅ 已完成 |
| B6 | `routes/v4/diy.js` 用户端路由（12 个接口） | ✅ 已完成 |
| B7 | `routes/v4/console/diy/` 管理端路由（14 个接口） | ✅ 已完成 |

#### Web 管理后台前端项目（✅ 已全部完成）

| 序号 | 任务 | 状态 |
|------|------|------|
| W1 | `admin/src/modules/diy/pages/` 4 个页面 JS | ✅ 已完成 |
| W2 | `admin/diy-template-management.html` 模板管理页 | ✅ 已完成 |
| W3 | `admin/diy-material-management.html` 材料管理页 | ✅ 已完成 |
| W4 | `admin/diy-work-management.html` 作品查看页 | ✅ 已完成 |
| W5 | `admin/diy-slot-editor.html` 槽位标注工具 | ✅ 已完成 |

#### 微信小程序前端项目（待开发）

| 序号 | 任务 | 工作量 | 依赖 |
|------|------|--------|------|
| M1 | 新建 `packageDIY/` 分包 + 3 个页面（分类选择→设计器→预览确认） | 大（8 天） | 后端接口已就绪 |
| M2 | 新建 `store/diy.ts` MobX Store | 中（2 天） | 无 |
| M3 | 新建 `utils/api/diy.ts` API 层 | 小（0.5 天） | 后端接口已就绪 |
| M4 | 字段名全部使用后端蛇形命名，不做映射 | 贯穿 M1-M3 | — |

#### 执行顺序建议（更新后）

```
后端 + admin 已全部完成，小程序可直接开始开发：
第 1 周：小程序 M2-M3（Store + API 层）+ M1 开始（分类选择页 + 设计器页面框架）
第 2 周：小程序 M1 继续（串珠模式渲染引擎 + 材料选择面板）
第 3 周：小程序 M1 继续（镶嵌模式 + 预览确认页 + 确认/取消流程）
第 4 周：前后端联调 + 测试
```

### 8.9 工作量总览

| 项目 | 端 | 状态 | 工作量 |
|------|-----|------|--------|
| `diy_templates` 表 + 模型 | 后端 | ✅ 已完成 | — |
| `diy_works` 表 + 模型 | 后端 | ✅ 已完成 | — |
| `diy_materials` 表 + 模型 | 后端 | ✅ 已完成 | — |
| `DIYService.js` 服务（1345 行） | 后端 | ✅ 已完成 | — |
| 用户端路由（12 个接口）+ 管理端路由（14 个接口） | 后端 | ✅ 已完成 | — |
| `categories` 新增 DIY 分类（5 条：1 个顶级 + 4 个二级） | 后端 | ✅ 已完成 | — |
| admin 模板管理页 | Web 前端 | ✅ 已完成 | — |
| admin 材料管理页 | Web 前端 | ✅ 已完成 | — |
| admin 作品查看页 | Web 前端 | ✅ 已完成 | — |
| admin 槽位标注工具 | Web 前端 | ✅ 已完成 | — |
| 小程序 `packageDIY/` 分包 + 3 个页面 | 小程序 | 🔲 待开发 | 大（8 天） |
| 小程序 `store/diy.ts` MobX Store | 小程序 | 🔲 待开发 | 中（2 天） |
| 小程序 `utils/api/diy.ts` API 层 | 小程序 | 🔲 待开发 | 小（0.5 天） |

**总计**：后端 + admin 已全部完成，剩余小程序端约 **10.5 天**工作量。

### 8.10 一句话总结

**后端已全部完成：3 张表（`diy_templates` 7 条 + `diy_works` 0 条 + `diy_materials` 61 条）+ 1 个服务（`DIYService.js` 1345 行）+ 26 个接口（用户端 12 个 + 管理端 14 个），admin 4 个页面已建好。全部复用现有的媒体系统（`MediaService` + Sealos S3）、账户资产体系（`accounts` + `account_asset_balances` + `BalanceService` 冻结/扣减/结算）、物品体系（`items` + `item_ledger` 铸造 + 双录）、分类体系（`categories` 树形，已新增 DIY 分类 id=190-194，共 4 个二级分类：手链/项链/戒指/吊坠）、材料资产（`material_asset_types` 16 种，已完成命名重构为 star_stone + core_shard/core_gem + star_stone_quota）、认证中间件（JWT）、统一响应（`ApiResponse`）。虚拟资产命名已从 DIAMOND/shard/crystal 重构为 star_stone/core_shard/core_gem。前端（admin + 小程序）的字段名和接口路径全部对齐后端蛇形命名和 v4 路由规范，不做映射。数据库共 120 张表。`account_asset_balances` 中已有 104 条余额记录（覆盖 7 种资产代码：star_stone / star_stone_quota / points / budget_points / red_core_shard / red_core_gem / orange_core_shard），64 个账户。小程序端是唯一剩余的开发工作。**
