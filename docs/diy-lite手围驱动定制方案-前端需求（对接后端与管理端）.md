# diy-lite 自由定制饰品 · 「手围驱动定制」方案 — 微信小程序前端需求文档

> 文档类型：微信小程序前端项目需求（对接后端数据库项目 + Web 管理后台前端项目）
> 编写时间：2026-07-11（`Get-Date` 真实日期）
> 提出方：微信小程序前端
> 面向对象：产品负责人 / 后端数据库开发 / Web 管理后台前端开发
> 对标产品：养个石头（2025-05 上线，全国首家在线水晶手串 DIY 平台，"手围输入 → 珠径智能算珠 → 拖拽实时预览 → 长度/重量/价格全联动"）
> 关联：《自由定制饰品 diy-lite 与 S1-S5 商品体系-对接方案与拍板决议》
>
> ⚠️ **本方案会扩展/调整原拍板① 的"纯颗数制"口径**（原口径为省录入成本、避免"戴不上手"客诉而采用）。
> 对标养个石头需引入"手围毫米"作为用户入口与联动核心，属**业务决策**。
>
> ✅ **2026-07-11 后端已完成三端审查**：基于后端仓库当前真实代码 + Node.js 直连真实数据库
> （`restaurant_points_dev`）核查，结论与权威设计见 **§十 ~ §十五**（以后端数据库项目为准，
> §5/§6 中与后端体系不一致的提案已在 §十一 中修正口径，前端按 §十一/§十二 执行，不按 §5 原样执行）。
>
> ✅ **2026-07-11 Q1~Q7 已全部拍板定案**（决议见 §九 / §十五）：手围驱动全量上（P0~P2 一次到位）、
> 换算走后端 estimate 接口、`cord_occupy_mm` 序列化派生、confirm 硬校验、发布护栏拒绝发布、
> 档位先用行业默认值。**本文档已从"求证文档"转为"已决议的实施依据"，无遗留待拍板项。**
>
> 🎉 **2026-07-11 后端数据库项目 + Web 管理后台前端项目已全部实施完成并通过质量检查**
> （实施记录、验证结果、小程序对接契约见 **§十六**）。§十二 Phase 1/Phase 2 全部落地，
> **微信小程序前端（Phase 3）按 §11.8 + §16.3 对接即可，后端接口已可用（真机 curl 验证通过）。**

---

## 一、目标与对标拆解

### 1.1 目标

将 diy-lite 从"选颗数档位"升级为对标养个石头的**「手围驱动全联动」**定制体验：

1. 用户以**手围（cm）**为入口表达需求（符合用户真实语言）；
2. 选珠径后系统**按毫米智能反算**参考颗数与排布；
3. 拖拽增删珠子时，**长度 / 颗数 / 重量 / 价格实时联动**展示；
4. 下单前给出**明确的成品尺寸预期**（带弹力/工艺余量说明），降低"戴不上手"客诉。

### 1.2 养个石头模式拆解（对标基线）

| 能力 | 养个石头表现 | 本方案对应章节 |
|---|---|---|
| 手围输入入口 | 用户输入/选择手围 cm | §3.1 |
| 珠径智能算珠 | 手围 ÷ 珠径 → 参考颗数 | §3.2 |
| 拖拽实时预览 | Canvas 拖拽增删/换位（**已具备**） | 已上线，无需新增 |
| 长度实时联动 | 已排长度 / 目标长度 / 还差 | §3.3 |
| 重量实时联动 | 累计克重 | §3.4 |
| 价格实时联动 | 累计价格（**已具备**） | 已上线 |
| 成品尺寸校验 | 长度约束下单 | §3.5 |

> 结论：**拖拽预览与价格联动前端已具备**；本方案新增的核心是"**手围毫米驱动 + 长度/重量联动 + 尺寸校验**"，
> 其成立**强依赖后端补齐每颗素材的精确毫米/克重数据**（见 §5）与管理端录入能力（见 §6）。

---

## 二、前端职责边界（先明确"谁干什么"）

遵循"后端是数据权威，前端只做展示与调用"的既定原则：

| 事项 | 归属 | 说明 |
|---|---|---|
| 手围输入 UI、拖拽预览、长度/重量/价格实时展示 | ✅ 小程序前端 | 本文档主体，前端落地 |
| 每颗素材的精确沿绳尺寸、克重、穿绳方向 | ❌ 后端数据 | 前端只读，不推算、不兜底 |
| "手围 → 参考颗数/排布"的换算规则、弹力余量、工艺约束 | ❌ 后端权威 | 前端按后端下发规则展示，**不在前端写死业务公式** |
| 成品尺寸能否下单的校验 | ❌ 后端权威 | 前端做前置友好提示，最终以后端校验为准 |
| 素材毫米/克重数据的录入界面 | ❌ Web 管理后台前端 | 见 §6，非本项目 |
| 手围档位、余量、工艺规则的配置界面 | ❌ Web 管理后台前端 | 见 §6，非本项目 |

> 前端**不做**的事（若发现只能说明后端缺数据，由后端补）：不从 `display` 文案里解析尺寸数字、
> 不在前端写死"手围-颗数"换算系数、不为缺失的毫米/克重数据编造默认值。

---

## 三、前端功能需求（小程序侧落地范围）

### 3.1 手围输入入口

- 进入设计台后，提供**手围选择**（下拉档位 + 可选自定义输入 cm）；
- 手围档位来自后端 `sizing_rules.size_options[]`（每档需含数值型手围，见 §5.1）；
- 支持"不确定手围"引导：提供测量说明图文（前端静态内容，非业务数据）。

### 3.2 珠径智能算珠（展示参考值）

- 用户选定手围 + 主珠径后，前端展示**参考颗数**："约需 X 颗 8mm 珠"；
- 该参考值 = 后端下发的换算结果，或按后端下发的"手围/余量"规则计算（**规则由后端给，前端不自定义系数**）；
- 参考颗数仅为**引导展示**，用户仍可自由拖拽增减（真实约束见 §3.5）。

### 3.3 长度实时联动（核心体验）

- 顶部信息条实时展示三段：
  - **已排长度**：珠子沿绳尺寸累加（圆珠按直径、异形珠按 `bore_orientation` 取长/短边，前端已实现累加逻辑）；
  - **目标长度**：当前手围对应的目标周长（后端 `size_options[].target_length_mm`，见 §5.1）；
  - **差值**："还差约 X.X cm" / "已超出约 X.X cm"。
- 措辞统一带"约"（估算值，见 §7）。

### 3.4 重量实时联动

- 展示累计克重"约 X.X g"，= 各珠子 `weight` 累加（后端字段，见 §5.2）；
- 后端未给某颗 `weight` 时该颗不计入并标注"部分素材暂无克重"，**前端不按体积估算兜底**（避免与实物出入）。

### 3.5 成品尺寸约束与校验

- **前置友好提示**（前端）：已排长度接近/超出目标手围时，提示"当前偏长，建议换大手围或减珠"；
- **最终校验（后端权威）**：提交时后端按"长度 + 工艺余量"校验是否可制作，返回明确错误码与中文文案；
- 前端对后端校验错误码做展示与引导（如 `DIY_LENGTH_EXCEED_LIMIT` → 提示换手围）；
- **颗数上限**（原 `bead_count`）保留为**兜底防呆**（防止极端数量），与长度约束并存。

### 3.6 兼容既有能力（不回退）

以下已上线能力全部保留：拖拽换位/删除、多选批量删、撤销重做、售罄禁购（`stock===0`）、
素材类型 Tab（beads/accessories/pendants）、镶嵌双模式、伪 3D、分享还原、五行雷达图、寓意/能量/搭配展示。

---

## 四、用户操作流程（对标养个石头）

```
进入设计台
  → ① 选手围（15cm）              [前端 UI，档位来自后端]
  → ② 选主珠径（8mm）            [前端 UI]
  → ③ 系统提示"约需 18 颗"        [后端换算规则 / 参考展示]
  → ④ 拖拽增删珠子                [前端已具备]
       实时更新：已排 12 颗 · 约11.2cm / 目标15cm（还差约3.8cm） · 约86g · ¥320
  → ⑤ 接近/超目标 → 前端友好提示   [前端前置]
  → ⑥ 提交 → 后端按长度+余量校验   [后端权威]
       通过 → 下单；不通过 → 返回错误码，前端引导调整
```

---

## 五、需**后端数据库项目**补充的字段 / 接口

> 这是本方案能否成立的**关键前提**。以下数据前端只读、不推算。

### 5.1 尺码档位补数值字段（`sizing_rules.size_options[]`）

接口：`GET /api/v4/diy/templates`、`GET /api/v4/diy/templates/:id`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `wrist_size_mm` | number | 是 | 该档位对应的**手围**（毫米），用户入口值，如 150 |
| `target_length_mm` | number | 是 | 该档位**目标成品周长**（毫米，通常 = 手围 + 工艺余量），用于长度联动展示与校验基准 |
| `elastic_margin_mm` | number | 否 | 弹力/工艺余量（毫米），用于"可戴范围"提示，缺省用后端全局默认 |

> 说明：原 `bead_count` 保留作兜底防呆上限；新增以上字段后，长度成为主口径、颗数退为副。

### 5.2 素材补精确物理字段（`diy_materials` / beads 接口）

接口：`GET /api/v4/diy/templates/:id/beads`

| 字段 | 类型 | 必填 | 含义 | 现状 |
|---|---|---|---|---|
| `diameter` | number | 是 | 圆珠直径（毫米） | ✅ 已有 |
| `size_length_mm` | number\|null | 异形珠必填 | 异形珠实物长边（毫米） | ✅ 已对接 |
| `size_width_mm` | number\|null | 异形珠必填 | 异形珠实物短边（毫米） | ✅ 已对接 |
| `bore_orientation` | enum | 是 | 穿绳方向 along_length/along_width/none（决定沿绳占位） | ✅ 已对接 |
| `weight` | number\|null | 建议必填 | 单颗净重（克），用于重量联动 | ⚠️ 已有字段，需运营**录全** |
| `cord_occupy_mm` | number\|null | 建议 | **单颗沿绳占用长度**（毫米，后端按形状+穿绳方向预计算），前端直接累加最准 | 🆕 建议新增 |

> `cord_occupy_mm` 是关键优化：若后端直接下发"每颗沿绳占多少毫米"，前端累加即为精确已排长度，
> 无需前端按形状分支推算（前端推算 = 业务逻辑下沉，违背职责边界）。**强烈建议后端预计算此字段。**
>
> 📌 **后端勘误（2026-07-11 直连真实库核查）**：`weight` 现有 21 条素材已 **21/21 录全**（无 NULL），
> 无需运营补录；`cord_occupy_mm` 已采纳但为**接口序列化派生字段而非数据库列**，详见 §10.3 / §11.2。

### 5.3 手围→颗数换算规则（二选一）

- **方案甲（推荐，后端权威）**：前端传 `wrist_size_mm + 主珠径` 调用后端，后端返回参考颗数与可戴范围；
  - 建议接口：`GET /api/v4/diy/templates/:id/estimate?wrist_size_mm=150&diameter=8`
  - 返回：`{ recommend_bead_count, min_length_mm, max_length_mm, elastic_margin_mm }`
- **方案乙（次选）**：后端在模板详情下发换算规则参数（余量、公式系数），前端按规则展示。
  - 风险：换算逻辑分散到前端，后续规则调整需前端改代码，不利于统一。

### 5.4 提交校验错误码（`POST /api/v4/diy/works` 及 confirm）

| 错误码 | 含义 | 前端处理 |
|---|---|---|
| `DIY_LENGTH_EXCEED_LIMIT` | 成品长度超出该手围可制作上限 | 提示"偏长，换大手围或减珠" |
| `DIY_LENGTH_BELOW_MIN` | 成品长度低于最小可制作长度 | 提示"偏短，加珠或换小手围" |
| `DIY_MATERIAL_SIZE_MISSING` | 存在缺失沿绳尺寸的素材，无法精确校验 | 提示"该素材信息完善中，暂不可用" |

---

## 六、需 **Web 管理后台前端项目**补充的录入 / 配置能力

> 非本项目，但本方案的数据前提在管理端，前端在此列出诉求供管理端评估。

1. **素材物理数据录入**：`diy_materials` 编辑页需支持录入并校验
   `diameter / size_length_mm / size_width_mm / bore_orientation / weight`（以及 §5.2 的 `cord_occupy_mm` 若采纳）；
   - 建议：异形珠必填长短边 + 穿绳方向，缺失时禁止 `is_enabled`（防止"无尺寸素材"流入 C 端算错长度）。
2. **手围档位配置**：模板 `sizing_rules` 编辑支持配置每档
   `wrist_size_mm / target_length_mm / elastic_margin_mm / bead_count(兜底)`。
3. **换算规则配置**（若采用 §5.3 方案乙）：全局或模板级的弹力余量、工艺余量配置项。
4. **数据完整度校验**：模板发布（published）前校验其可用素材均已录全物理数据，否则提示不可发布。

---

## 七、展示口径与防客诉约定（前端自行落地）

1. 所有长度/重量均为**估算展示值**，文案统一带"**约**"（"参考串长约 15.2cm"、"约 86g"）；
2. 长度不含绳结、弹力拉伸、穿孔损耗，**不可写成承诺尺寸**；
3. 超目标时提示"可换大手围"，不硬性拦截（最终以后端校验为准）；
4. 缺失物理数据的素材：前端如实提示"信息完善中"，不编造默认值、不参与精确长度计算；
5. cm 保留 1 位小数，g 保留 1 位小数。

---

## 八、实施阶段建议（前端视角）

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P0（可先行） | 手围输入 UI + 参考串长展示（复用已实现的 `_usedLengthMm`） | 后端补 `target_length_mm`（§5.1） |
| P1 | 重量联动 + 珠径智能算珠参考值 | 后端 `weight` 录全 + §5.3 换算接口 |
| P2 | 成品尺寸后端校验 + 错误码引导 + 精确 `cord_occupy_mm` | 后端 §5.2/§5.4 + 管理端 §6 录入完成 |

> P0 与之前提交的《diy-lite 参考串长展示需求》方案 A/B 可合并推进；P1/P2 是对标养个石头的完整能力，
> 依赖后端与管理端数据就绪。前端对所有新字段做"有则用、无则降级"容错，不强依赖、不阻塞既有功能。

---

## 九、待决策项（✅ 2026-07-11 已全部拍板）

| 编号 | 待决策 | 选项 | 决策 |
|---|---|---|---|
| Q1 | 是否正式对标养个石头（扩展拍板① 到手围驱动） | 是 / 否（维持纯颗数制）/ 仅做 P0 参考展示 | ✅ **是（全量对标，正式扩展拍板① 口径：长度为主、颗数退为兜底）** |
| Q2 | 手围→颗数换算归属 | 甲：后端 estimate 接口（推荐）/ 乙：前端按后端规则参数算 | ✅ **甲（后端 estimate 接口，规则收敛后端一处，见 §11.3）** |
| Q3 | 是否新增 `cord_occupy_mm`（后端预计算沿绳占用） | 是（前端最省、最准）/ 否（前端按形状分支累加） | ✅ **是（后端序列化派生下发，不加数据库列，见 §11.2）** |
| Q4 | 成品尺寸是否硬校验下单 | 硬校验（后端拦截）/ 仅提示不拦截 | ✅ **硬校验（后端拦截 + 错误码引导，见 §11.4）** |
| Q5 | 实施范围 | P0 / P0+P1 / 全量 P0~P2 | ✅ **全量 P0~P2 一次到位（避免两套口径并存的技术债）** |

> ✅ 决议依据见 §十五（含 Q6/Q7 两项新增拍板）。三端按 §十一 权威设计 + §十二 执行步骤排期落地，
> 原拍板① 的"纯颗数制"容量口径自本决议起正式调整为"长度为主、颗数兜底"。
>
> ⬇️ **以下为 2026-07-11 后端审查回填内容（§十 ~ §十五），为本文档的权威结论部分。**

---

## 十、后端审查结论（2026-07-11，基于真实代码 + 真实数据库）

### 10.1 审查方法与范围

- **代码**：后端 `routes/v4/diy.js`（用户端 12 接口）、`routes/v4/console/diy/*`（管理端）、
  `services/diy/{TemplateService,MaterialService,WorkService,AdminQueryService,QRCodeService}.js`、
  `models/{DiyTemplate,DiyMaterial,DiyWork}.js`；管理端 `admin/src/modules/diy/pages/*.js` + `admin/diy-*.html`。
- **数据**：Node.js + `mysql2`（项目自带依赖）直连 `.env` 配置的真实数据库 `restaurant_points_dev`，
  未使用任何备份文件或历史报告。

### 10.2 三端技术栈确认（本方案必须遵循的框架事实）

| 端 | 技术栈 | 与本方案相关的关键机制 |
|---|---|---|
| 后端 | Node.js 20 + Express + Sequelize 6 + MySQL + Redis | ① 统一响应 `ApiResponse`：`{ success, code, message, data, timestamp, version, request_id }`；② 业务错误：service 层 `throw error`（带 `error.statusCode` + `error.errorCode`），`asyncHandler` → `handleServiceError` 自动映射，**错误码走响应的 `code` 字段**；③ 服务注册 `app.locals.services.getService('diy')` → `DiyServiceFacade` 门面委托子服务；④ 迁移 `sequelize-cli`，命名 `YYYYMMDDHHMMSS-{action}-{table}-{desc}.js`；⑤ 事务统一 `TransactionManager.execute` |
| Web 管理后台前端 | Vite + Alpine.js + Tailwind CSS（多页应用，页面 = `admin/*.html` + `admin/src/modules/*/pages/*.js`） | API 封装集中在 `admin/src/api/diy.js`；表单直接使用后端 snake_case 字段名（零映射）；页面组件用 `createPageMixin` + `imageUploadMixin` |
| 微信小程序前端 | （外部仓库）Canvas 设计台，已实现 `_usedLengthMm` 累加 | 只读后端下发字段，按 §十一 权威口径直接使用后端字段名，不做映射 |

### 10.3 真实数据库现状（直连核查结果，非备份/非文档推断）

| 核查项 | 真实结果 | 对本方案的影响 |
|---|---|---|
| `diy_templates` | 共 4 条：串珠模板 2 条（id=1 手链、id=2 项链，**均为 draft**）；slots 镶嵌模板 2 条（id=40 draft、id=65 published） | **当前线上没有任何已发布的串珠模板**。手围功能是串珠模式专属，上线前运营必须先补数据并发布串珠模板 |
| `sizing_rules` 现有结构 | `size_options[]` 仅含 `label / display / radius_x / radius_y / bead_count`，`display` 为"小号 (约15cm)"等文案 | §5.1 判断正确：无任何数值型毫米字段，长度联动无数据可用（前端从 `display` 解析数字的做法被禁止，正确） |
| `diy_materials` | 共 21 条（启用 3 条），全部 `item_type=beads`；`diameter` 21/21 已录；**`weight` 21/21 已录、无一缺失**；无异形珠（`shape` 全部 circle，`bore_orientation` 全部 none，`size_length_mm/size_width_mm` 全部为空属正常） | **§5.2 "weight 需运营录全"的现状描述与真实数据不符——weight 已录全**，P1 重量联动的数据前提已具备，无需运营补录 |
| `diy_works` | 0 条 | 无存量作品，`design_data` 结构调整（§11.4）无兼容负担，可直接定新口径 |

### 10.4 逐项判定：已支持 / 需新增 / 归属

| 文档条目 | 现状判定 | 归属 |
|---|---|---|
| §5.1 `wrist_size_mm / target_length_mm / elastic_margin_mm` | ❌ 后端无此概念（全仓库检索 wrist/target_length/elastic 零命中） | **后端新增**（`sizing_rules` 是 JSON 列，扩展 key 即可，**无需 ALTER TABLE**；见 §11.1）+ **管理端新增录入 UI**（见 10.4 §6.2 行） |
| §5.2 `diameter / size_length_mm / size_width_mm / bore_orientation / weight` | ✅ 后端模型、真实表结构、用户端 beads 接口序列化（`toUserMaterialJSON`）均已完整支持，且真实数据已录全 | 无需任何改动 |
| §5.2 `cord_occupy_mm` | 🆕 采纳，但**不加数据库列**：它可由 `bore_orientation + size_length_mm/size_width_mm/diameter` 唯一确定，加列会产生两份事实（改直径忘改占位 → 数据不一致技术债）。后端在 beads 接口**序列化时派生计算**下发（见 §11.2） | **后端新增**（约 15 行代码） |
| §5.3 手围→颗数换算 | ✅ 采纳**方案甲**（后端 estimate 接口）。路径 `GET /api/v4/diy/templates/:id/estimate` 符合后端既有嵌套子资源风格（同 `/templates/:id/payment-assets`），响应字段见 §11.3 | **后端新增** |
| §5.4 提交校验错误码 | ⚠️ 机制已支持（`error.errorCode` → 响应 `code` 字段，`handleServiceError` 现成），但 `confirmDesign` 当前**连 `capacity_rules` 颗数上下限都没校验**（真实缺口，与手围无关也该修），更无长度校验 | **后端新增**（见 §11.4） |
| §6.1 管理端素材物理字段录入 | ✅ **已支持**：`diy-material-management.js` 表单已含 `diameter / shape / size_length_mm / size_width_mm / bore_orientation / weight` 全部字段及空串归 null 处理 | 无需改动（`cord_occupy_mm` 是派生字段，无需录入） |
| §6.2 管理端手围档位配置 | ❌ **不支持**：`diy-template-management.html` 表单只暴露 `layout.shape / layout.bead_count / bead_rules.default_diameter / bead_rules.margin`，**`sizing_rules` 完全没有编辑 UI**（目前只能吃 `emptyForm()` 默认值或直接改库——这是管理端现存缺口） | **管理端新增** |
| §6.3 换算规则配置界面 | 不需要：采纳方案甲后，换算规则收敛在后端 estimate 逻辑 + 模板 `sizing_rules`（§6.2 的 UI 已覆盖 `elastic_margin_mm` 录入），无独立配置页 | 取消此项 |
| §6.4 发布前数据完整度校验 | ⚠️ 部分支持：`updateTemplateStatus` 发布护栏现只校验底图/预览图；`AdminQueryService` 已有 `completeness` 统计体系（缺图/缺文案/0价）可直接扩展 | **后端扩展 + 管理端展示**（见 §11.5） |

### 10.5 对 §5 前端提案的口径修正（以后端为准，前端按此执行）

1. **响应格式**：一律为后端统一信封 `{ success, code, message, data, timestamp, version, request_id }`。
   业务数据在 `data` 内；**校验错误码在顶层 `code` 字段**（字符串），不是 `data.error_code`。
2. **`cord_occupy_mm` 不是数据库字段**，是 beads 接口的**序列化派生字段**。前端用法不变（直接累加），
   但要理解：该字段为 `null` = 该素材物理数据不完整（异形珠缺长短边），按 §7-4 展示"信息完善中"。
3. **单位统一为毫米（mm）**：§3.1 写"手围 cm"、§5.1 写"毫米"，口径混用。后端存储/传输一律 mm
   （与既有 `size_length_mm / diameter` 一致），cm 仅是前端展示层换算。
4. **后端校验需要知道用户选的手围**：前端保存作品时须在 `design_data` 中写入
   `size: { label, wrist_size_mm }`（见 §11.4），否则后端 confirm 无法做长度校验。
   `diy_works` 现为 0 条，无兼容负担，直接定此口径。
5. `estimate` 接口参数与返回字段名以 §11.3 为准（snake_case，与前端 §5.3 提案基本一致，返回体有增补）。

---

## 十一、权威设计（后端数据库项目定稿，三端以此为准）

### 11.1 `sizing_rules` 权威 Schema（JSON 列扩展，零 DDL）

`diy_templates.sizing_rules` 本就是 `JSON` 列，直接扩展 key，**不需要任何表结构迁移**；
既有渲染字段（`radius_x/radius_y`）与兜底字段（`bead_count`）全部保留：

```json
{
  "default_size": "M",
  "elastic_margin_mm": 15,
  "size_options": [
    {
      "label": "S",
      "display": "小号 (约15cm)",
      "radius_x": 95,
      "radius_y": 95,
      "bead_count": 14,
      "wrist_size_mm": 140,
      "target_length_mm": 155
    },
    {
      "label": "M",
      "display": "中号 (约17cm)",
      "radius_x": 120,
      "radius_y": 120,
      "bead_count": 18,
      "wrist_size_mm": 155,
      "target_length_mm": 170
    },
    {
      "label": "L",
      "display": "大号 (约19cm)",
      "radius_x": 140,
      "radius_y": 140,
      "bead_count": 22,
      "wrist_size_mm": 175,
      "target_length_mm": 190
    }
  ]
}
```

- `elastic_margin_mm` 为**模板级**弹力/工艺余量（挂在 `sizing_rules` 顶层，非每档重复），
  档位缺 `target_length_mm` 时后端按 `wrist_size_mm + elastic_margin_mm` 推导；
- 该 Schema 由模板详情接口原样下发（`toUserTemplateJSON` 对规则字段本就是原样透传，**零代码改动**）；
- 数据写入靠：① 管理端新 UI（§11.6）；② 存量 2 个串珠模板用数据回填迁移（§12 步骤 6）。

> **品类差异（重要）**：`target_length_mm` 对所有串珠模板必填、是长度联动与校验的统一基准；
> `wrist_size_mm` **仅手链品类（DIY_BRACELET）必填**——项链品类（如真实库 id=2"锁骨项链"，
> 档位为 38/45/55cm 佩戴长度）无"手围"概念，档位只配 `target_length_mm`（S=380/M=450/L=550），
> estimate 接口对项链模板按 `target_length_mm` 直接换算（不走手围加余量分支），
> 小程序端项链模板的入口文案为"选择佩戴长度"而非"选择手围"。

### 11.2 beads 接口新增派生字段 `cord_occupy_mm`（后端预计算，无 DB 列）

`services/diy/MaterialService.js` 新增派生函数，并在 `toUserMaterialJSON` 输出中追加一个字段：

```js
/**
 * 计算单颗素材的沿绳占用长度（毫米）
 *
 * 派生规则（唯一事实来源是 bore_orientation + 实物尺寸字段，不落库避免双份事实）：
 * - along_length（管珠，绳穿长轴）→ size_length_mm
 * - along_width（药片，绳穿短边）→ size_width_mm
 * - none（圆珠）→ diameter
 * 所需尺寸缺失时返回 null（前端展示"信息完善中"，不计入长度累加）
 *
 * @param {Object} plain - 素材 plain 对象
 * @returns {number|null} 沿绳占用毫米数
 */
function deriveCordOccupyMm(plain) {
  if (plain.bore_orientation === 'along_length') return plain.size_length_mm ?? null
  if (plain.bore_orientation === 'along_width') return plain.size_width_mm ?? null
  return plain.diameter ?? null
}
```

`toUserMaterialJSON` 返回体中增加一行：`cord_occupy_mm: deriveCordOccupyMm(plain)`。
（真实数据核查：现有 21 颗全部为圆珠且 `diameter` 已录全，上线即全量可用，无 null。）

### 11.3 手围算珠接口（Q2 方案甲，后端权威换算）

**`GET /api/v4/diy/templates/:id/estimate?wrist_size_mm=150&diameter=8`**（公开接口，与模板查询一致无需登录）

`routes/v4/diy.js` 按既有模式追加：

```js
/** 手围算珠估算（后端权威换算，拍板 Q2 方案甲） */
router.get(
  '/templates/:id/estimate',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const result = await DIYService.estimateBeadCount(Number(req.params.id), req.query)
    return res.apiSuccess(result, '手围估算成功')
  })
)
```

`services/diy/TemplateService.js` 新增（并在 `services/diy/index.js` 门面加一行委托）：

```js
/** 全局默认弹力/工艺余量（毫米），模板 sizing_rules.elastic_margin_mm 可覆盖 */
const DEFAULT_ELASTIC_MARGIN_MM = 15

/**
 * 手围算珠估算（拍板 Q2 方案甲：换算规则收敛在后端）
 *
 * 规则：
 * - target_length_mm：优先取 size_options 中 wrist_size_mm 完全匹配档位的配置值，
 *   否则 = wrist_size_mm + elastic_margin_mm
 * - recommend_bead_count = round(target_length_mm / diameter)，并按 capacity_rules 收敛
 * - 可制作范围：min = wrist_size_mm（短于手围戴不上）；max = target + elastic_margin
 *
 * @param {number} templateId - diy_template_id
 * @param {Object} params - { wrist_size_mm, diameter }
 * @returns {Object} 估算结果
 */
static async estimateBeadCount(templateId, params = {}) {
  const wristSizeMm = Number(params.wrist_size_mm)
  const diameter = Number(params.diameter)
  if (!Number.isFinite(wristSizeMm) || wristSizeMm <= 0) {
    const error = new Error('wrist_size_mm 必须为正数（毫米）')
    error.statusCode = 400
    throw error
  }
  if (!Number.isFinite(diameter) || diameter <= 0) {
    const error = new Error('diameter 必须为正数（毫米）')
    error.statusCode = 400
    throw error
  }

  const template = await DiyTemplateService.getTemplateDetail(templateId)
  const sizing = template.sizing_rules
  if (!sizing || !Array.isArray(sizing.size_options)) {
    const error = new Error('该模板未配置尺寸规则，不支持手围估算')
    error.statusCode = 400
    error.errorCode = 'DIY_SIZING_RULES_MISSING'
    throw error
  }

  const elasticMarginMm = Number(sizing.elastic_margin_mm) || DEFAULT_ELASTIC_MARGIN_MM
  const matched = sizing.size_options.find(o => Number(o.wrist_size_mm) === wristSizeMm)
  const targetLengthMm = Number(matched?.target_length_mm) || wristSizeMm + elasticMarginMm

  let recommend = Math.round(targetLengthMm / diameter)
  const { min_beads: minBeads, max_beads: maxBeads } = template.capacity_rules || {}
  if (minBeads) recommend = Math.max(recommend, minBeads)
  if (maxBeads) recommend = Math.min(recommend, maxBeads)

  return {
    wrist_size_mm: wristSizeMm,
    diameter,
    elastic_margin_mm: elasticMarginMm,
    target_length_mm: targetLengthMm,
    recommend_bead_count: recommend,
    min_length_mm: wristSizeMm,
    max_length_mm: targetLengthMm + elasticMarginMm,
    matched_size_label: matched?.label || null
  }
}
```

响应示例（统一信封内的 `data`）：

```json
{
  "wrist_size_mm": 150, "diameter": 8, "elastic_margin_mm": 15,
  "target_length_mm": 165, "recommend_bead_count": 21,
  "min_length_mm": 150, "max_length_mm": 180, "matched_size_label": null
}
```

### 11.4 confirm 硬校验 + 错误码（Q4 建议硬校验）

**前端契约**：保存作品（`POST /api/v4/diy/works`）时 `design_data` 须携带手围档位：

```json
{
  "mode": "beading",
  "size": { "label": "M", "wrist_size_mm": 155 },
  "beads": [{ "material_code": "DM26...", "position": 0 }]
}
```

**后端**：`WorkService.confirmDesign` 在服务端算价**之前**插入校验（`_validateDesignConstraints`），
错误码用既有 `error.errorCode` 机制（响应顶层 `code` = 错误码，HTTP 状态 = `error.statusCode`）：

| 错误码 | HTTP | 触发条件 | 错误响应 `data` 附带 |
|---|---|---|---|
| `DIY_BEAD_COUNT_OUT_OF_RANGE` | 400 | 颗数超出 `capacity_rules.min_beads/max_beads`（**现状缺口，无论 Q1 是否通过都应补**） | `{ bead_count, min_beads, max_beads }` |
| `DIY_LENGTH_EXCEED_LIMIT` | 400 | 沿绳长度合计 > `max_length_mm`（= target + elastic_margin） | `{ current_length_mm, target_length_mm, max_length_mm }` |
| `DIY_LENGTH_BELOW_MIN` | 400 | 沿绳长度合计 < `min_length_mm`（= wrist_size_mm） | `{ current_length_mm, min_length_mm }` |
| `DIY_MATERIAL_SIZE_MISSING` | 400 | 所用素材存在 `cord_occupy_mm` 派生为 null 的项，无法精确校验 | `{ material_codes: [...] }` |

校验实现要点（与 §11.2 共用同一派生函数，保证"前端展示 = 后端校验"口径一致）：

```js
/**
 * 确认前设计约束校验（长度 + 颗数，拍板 Q4 硬校验）
 * design_data.size 缺失时跳过长度校验（未配手围的旧模板/镶嵌模式不受影响），
 * 颗数校验始终执行。
 * @private
 */
static async _validateDesignConstraints(template, designData, materialRows) {
  const beadCount = usedMaterialCodes.length // confirmDesign 中已有该数组
  const { min_beads: minBeads, max_beads: maxBeads } = template.capacity_rules || {}
  if ((minBeads && beadCount < minBeads) || (maxBeads && beadCount > maxBeads)) {
    const error = new Error(`珠子颗数 ${beadCount} 超出允许范围 ${minBeads}~${maxBeads}`)
    error.statusCode = 400
    error.errorCode = 'DIY_BEAD_COUNT_OUT_OF_RANGE'
    error.data = { bead_count: beadCount, min_beads: minBeads, max_beads: maxBeads }
    throw error
  }

  const wristSizeMm = Number(designData?.size?.wrist_size_mm)
  if (!wristSizeMm) return // 未选手围档位 → 仅颗数兜底（Q1 若拍板"仅 P0"即此分支）

  // materialRows 需补查 diameter/size_length_mm/size_width_mm/bore_orientation 四个字段
  const missing = []
  let totalMm = 0
  for (const code of usedMaterialCodes) {
    const occupy = deriveCordOccupyMm(materialPriceMap.get(code))
    if (occupy === null) missing.push(code)
    else totalMm += occupy
  }
  if (missing.length > 0) {
    const error = new Error('存在物理尺寸信息不完整的素材，无法精确校验成品长度')
    error.statusCode = 400
    error.errorCode = 'DIY_MATERIAL_SIZE_MISSING'
    error.data = { material_codes: [...new Set(missing)] }
    throw error
  }
  // min/max 与 §11.3 estimate 同一套规则……（超出/不足分别抛对应错误码）
}
```

> 注意：`confirmDesign` 现查询 `diy_materials` 时 `attributes` 只取了
> `['material_code', 'price', 'price_asset_code']`，需扩为再加
> `'diameter', 'size_length_mm', 'size_width_mm', 'bore_orientation'` 四列（一次查询复用，不加查询）。

### 11.5 发布护栏扩展（承接 §6.4，后端）

`TemplateService.updateTemplateStatus`（及 `updateTemplate` 直接置 published 分支）在既有
"底图/预览图必填"校验后追加两条（仅串珠模式模板，`layout.shape !== 'slots'`）：

1. **尺寸规则完整**：`sizing_rules.size_options` 每档必须含数值型 `wrist_size_mm` 与 `target_length_mm`，
   否则报错"发布失败：尺寸档位缺手围/目标周长数据，请在模板编辑中补录"；
2. **素材物理数据完整**：模板 `material_group_codes` 范围内 `is_enabled=true` 的素材，
   若存在 `cord_occupy_mm` 派生为 null 的项 → 拒绝发布并在错误信息中列出素材编码（拍板 Q6，建议拒绝而非警告）。

配套：`AdminQueryService._getCompletenessStats()` 的 `materials` 节点增加
`missing_physical_count`（异形珠缺长短边 / 圆珠缺直径的启用素材数），
`getAdminMaterialList` 增加 `missing_physical=true` 快捷筛选——完全复用既有 completeness 模式
（同 `missing_image / missing_copy / zero_price_enabled` 三兄弟）。

### 11.6 管理端改动（Web 管理后台前端项目）

1. **模板表单新增"尺寸档位"编辑区**（`diy-template-management.html` + `.js`，串珠模式时渲染）：
   - 表格式编辑 `size_options[]`：`label / display / wrist_size_mm / target_length_mm / bead_count / radius_x / radius_y`，支持增删行；
   - 顶部一个 `elastic_margin_mm` 数字输入（模板级余量，默认 15）；
   - 沿用既有 Alpine `x-model.number` + `form.sizing_rules` 直绑模式（字段名即后端字段名，零映射）；
   - 这同时补上管理端现存缺口（目前 `sizing_rules` 无任何编辑入口）。
2. **素材页**：无需新增录入项（§6.1 已支持；`cord_occupy_mm` 为派生不录入）。
   可选增强：列表加一列展示派生沿绳占位，方便运营核对。
3. **完备度卡片**：素材页与 DIY 大屏加"缺物理数据"卡片（数据源 §11.5 的 `missing_physical_count`），
   点击带 `?filter=missing_physical` 过滤，复用既有 `toggleCompletenessFilter` 模式。

### 11.7 数据看板与运营功能增量（管理端 + stats 接口扩展）

**现状盘点**（2026-07-11 审查 `diy-dashboard.js` + `AdminQueryService.getAdminStats`）：
DIY 大屏已具备 P0 完备度卡片（素材缺图/缺文案/0价、模板缺图/未发布）、P1 经营看板
（draft→frozen→completed 转化漏斗、GMV 按币种/日维度 + exchange_records 交叉校验、待发货/缺地址履约）、
P2 素材热度 Top20 + 五行分布。**体系是完整的，手围方案只做增量、不推倒**。
既定架构约定继续遵守：所有新指标挂在 `GET /api/v4/console/diy/stats` 同一接口（不建独立数据源），
卡片可点击跳转对应管理页并带筛选参数（运营工作清单模式，非只读报表），图表用既有 ECharts 懒加载。

**A 档 · 随本方案必做（P0，数据保障 + 客诉排查闭环）：**

1. **"缺物理数据"完备度卡片**（§11.5 已定）：`stats.completeness.materials.missing_physical_count`
   → 素材页 + 大屏卡片，点击带 `?filter=missing_physical` 过滤；
2. **"已发布模板缺档位数据"兜底计数**：`stats.completeness.templates.published_missing_sizing_count`
   （published 串珠模板中 `size_options` 缺 `wrist_size_mm/target_length_mm` 的数量）。
   发布护栏（§11.5）只拦**新发布动作**，对存量 published 模板无效，这个计数是存量脏数据的唯一暴露口
   （当前真实库 published 只有 slots 模板，存量风险为零，但护栏哲学要求兜底可见）；
3. **作品详情页展示手围与成品长度**（`diy-work-management` 详情弹窗 + 履约信息区）：
   - 展示 `design_data.size`（档位 label + `wrist_size_mm`）；
   - 展示服务端计算的成品沿绳长度 `computed_length_mm`（后端 `getAdminWorkDetail` 返回体新增派生字段，
     复用 §11.2 `deriveCordOccupyMm` 同一函数计算，保证与 C 端口径一致，管理端只展示不计算）；
   - 价值：这是客服排查"戴不上手"客诉的第一入口，也是**产线履约必需信息**（发货前要知道成品做多长）。

**B 档 · 建议做（P1，有成交数据后价值显现，本期一并实现成本低）：**

4. **手围档位分布看板**：frozen/completed 作品按 `design_data.size.label / wrist_size_mm` 聚合
   → `stats.size_distribution`，大屏柱状图。用途：配货备料（哪个手围段卖得多 → 对应珠径/数量备货）；
5. **长度健康度指标**：completed 作品 `|computed_length_mm − target_length_mm|` 差值分布
   → `stats.length_deviation`（如 ≤5mm / 5~10mm / >10mm 三档计数）。
   用途：`elastic_margin_mm` 余量参数是否合理的量化依据（差值普遍偏大 → 调余量，数据驱动而非拍脑袋）。

**C 档 · 明确缓做（P2，先日志后看板，不建新表）：**

6. **硬校验拦截监控**（`DIY_LENGTH_*` 错误码触发次数/拦截率）：大厂上硬校验必配拦截监控，
   但拦截发生在**被 rollback 的事务内**，落表需事务外二次写入，复杂度高于当前价值。
   决议：confirm 校验失败时用 winston 结构化日志记录（`logger.warn('[DIYService] 长度校验拦截', { errorCode, diy_work_id, current_length_mm })`），
   上线后若拦截率需要进看板再评估建表——**本期不建新表、不加事务外写入**；
7. **estimate 调用量统计**：同上，先靠既有请求日志，不单独建指标。

### 11.8 微信小程序前端适配（直接用后端字段名，不做映射）

1. 手围档位下拉：数据源 `sizing_rules.size_options[]`，直接读 `wrist_size_mm / target_length_mm / label / display`；
2. 自定义手围 + 珠径 → 调 `GET /templates/:id/estimate`，直接展示 `recommend_bead_count`，**前端不写换算公式**；
3. 长度联动：累加 beads 接口下发的 `cord_occupy_mm`（替换/校准现有 `_usedLengthMm` 的形状分支推算），
   `null` 项不计入并提示"部分素材信息完善中"；
4. 重量联动：累加 `weight`（真实库已录全）；
5. 保存作品：`design_data` 中写入 `size: { label, wrist_size_mm }`（后端校验依据，§11.4 契约）；
6. confirm 失败处理：读响应顶层 `code` 匹配 §11.4 错误码表，`data` 内的毫米数用于引导文案
   （如"当前约 X.Xcm，超出上限约 Y.Ycm，建议换大手围或减珠"）；
7. 单位：所有接口字段均为 mm，展示层自行 ÷10 保留 1 位小数。

---

## 十二、执行步骤（后端 → 管理端 → 小程序，一次到位不留兼容层）

### Phase 1 — 后端数据库项目（预估 1.5 人日）

| # | 改动 | 文件 | 说明 |
|---|---|---|---|
| 1 | `deriveCordOccupyMm` 派生函数 + `toUserMaterialJSON` 增加 `cord_occupy_mm` 输出 | `services/diy/MaterialService.js` | §11.2，导出该函数供 WorkService 复用 |
| 2 | `estimateBeadCount` 服务方法 + 门面委托 + 路由 | `services/diy/TemplateService.js`、`services/diy/index.js`、`routes/v4/diy.js` | §11.3 |
| 3 | `confirmDesign` 前置 `_validateDesignConstraints`（颗数 + 长度 + 缺尺寸），素材查询 attributes 扩 4 列 | `services/diy/WorkService.js` | §11.4；`handleServiceError` 已支持 `error.errorCode/data`，零框架改动 |
| 4 | 发布护栏扩展（尺寸规则完整 + 素材物理数据完整） | `services/diy/TemplateService.js` | §11.5 |
| 5 | completeness 增加 `missing_physical_count` / `published_missing_sizing_count` + 素材列表 `missing_physical` 筛选 | `services/diy/AdminQueryService.js`、`MaterialService.js` | §11.5 / §11.7-A1/A2 配套 |
| 6 | 数据回填迁移：手链模板 id=1 回填 `wrist_size_mm + target_length_mm`（Q7 决议默认值 S=140/155、M=155/170、L=175/190），项链模板 id=2 仅回填 `target_length_mm`（S=380/M=450/L=550，按 display 既有档位），两模板均写 `elastic_margin_mm=15` | `migrations/20260711xxxxxx-migrate-data-diy-templates-sizing-wrist-mm.js` | 唯一一个迁移，且是**数据迁移非 DDL**；骨架见下 |
| 7 | stats 扩展看板指标：`size_distribution`（手围档位分布）+ `length_deviation`（长度偏差分布）；`getAdminWorkDetail` 返回体增加 `computed_length_mm` 派生字段；confirm 拦截 winston 结构化日志 | `services/diy/AdminQueryService.js`、`WorkService.js` | §11.7-A3/B4/B5/C6；复用 `deriveCordOccupyMm`，聚合模式同既有 `_getMaterialHeatStats`（解析 `design_data.size` / `total_cost.price_snapshot`），不建新表 |
| 8 | 单测：estimate 换算 / confirm 四个错误码 / 派生函数三分支 / stats 新指标聚合 | `tests/services/DIYService.test.js` 扩展 | 沿用既有 jest 体系 |

迁移文件骨架（遵循项目"迁移头部注释 + 可回滚"规范）：

```js
'use strict'

/**
 * 数据迁移: diy_templates.sizing_rules 回填手围毫米字段（手围驱动定制方案）
 *
 * 创建时间: 2026-07-11（北京时间）
 * 背景: docs/diy-lite手围驱动定制方案-前端需求（对接后端与管理端）.md §11.1
 * - 为存量串珠模板（id=1 手链 / id=2 项链）的 size_options 逐档回填
 *   wrist_size_mm / target_length_mm，并写入模板级 elastic_margin_mm=15。
 * - JSON 列内容更新，无 DDL；回滚 = 删除新增 key 恢复原 JSON。
 */

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT diy_template_id, sizing_rules FROM diy_templates WHERE JSON_EXTRACT(layout, '$.shape') IN ('circle','ellipse','arc','line') AND sizing_rules IS NOT NULL"
    )
    // 手链档位映射（毫米）：S=140/155, M=155/170, L=175/190；项链按品类另表……
    for (const row of rows) {
      const sizing = typeof row.sizing_rules === 'string' ? JSON.parse(row.sizing_rules) : row.sizing_rules
      sizing.elastic_margin_mm = sizing.elastic_margin_mm ?? 15
      sizing.size_options = (sizing.size_options || []).map(opt => ({
        ...opt,
        wrist_size_mm: opt.wrist_size_mm ?? WRIST_BY_LABEL[row.diy_template_id]?.[opt.label]?.wrist,
        target_length_mm: opt.target_length_mm ?? WRIST_BY_LABEL[row.diy_template_id]?.[opt.label]?.target
      }))
      await queryInterface.sequelize.query(
        'UPDATE diy_templates SET sizing_rules = ? WHERE diy_template_id = ?',
        { replacements: [JSON.stringify(sizing), row.diy_template_id] }
      )
    }
  },
  async down(queryInterface) {
    /* 逐模板剔除 wrist_size_mm / target_length_mm / elastic_margin_mm key（省略） */
  }
}
```

### Phase 2 — Web 管理后台前端项目（预估 1.5 人日）

| # | 改动 | 文件 |
|---|---|---|
| 9 | 模板表单"尺寸档位"编辑表格 + `elastic_margin_mm` 输入（§11.6-1） | `admin/diy-template-management.html`、`admin/src/modules/diy/pages/diy-template-management.js` |
| 10 | 完备度卡片扩展："缺物理数据"（素材页 + 大屏，`?filter=missing_physical` 跳转）+ "已发布模板缺档位数据"（§11.7-A1/A2） | `admin/src/modules/diy/pages/diy-material-management.js`、`diy-dashboard.js`、`diy-template-management.js` |
| 11 | 作品详情弹窗展示手围档位 + 服务端 `computed_length_mm` 成品长度（§11.7-A3，客服/产线履约信息） | `admin/src/modules/diy/pages/diy-work-management.js`、`admin/diy-work-management.html` |
| 12 | 大屏新增手围档位分布柱状图 + 长度偏差分布卡片（§11.7-B4/B5，ECharts 懒加载复用既有模式） | `admin/src/modules/diy/pages/diy-dashboard.js`、`admin/diy-dashboard.html` |

### Phase 3 — 微信小程序前端项目（预估 2 人日，依赖 Phase 1 完成）

| # | 改动 | 依赖 |
|---|---|---|
| 13 | 手围选择 UI（档位 + 自定义 mm）+ 测量引导 | 步骤 6 数据回填 |
| 14 | estimate 调用 + 参考颗数展示 | 步骤 2 |
| 15 | 长度联动切换为累加 `cord_occupy_mm`；重量联动累加 `weight` | 步骤 1 |
| 16 | `design_data.size` 写入 + confirm 错误码引导 | 步骤 3 |

> 顺序即依赖：后端全部合并后管理端与小程序可并行。运营动作（不占开发）：
> 用新 UI 核对/调整 2 个串珠模板档位数据 → 发布串珠模板（当前 published 的只有 slots 模板）。

---

## 十三、问题归属清单（谁的问题谁改）

**后端数据库项目：**
1. `sizing_rules` 无毫米字段（历史拍板①口径所致，非 bug）→ §11.1 扩展 Schema + 步骤 6 回填；
2. **`confirmDesign` 未校验 `capacity_rules` 颗数上下限**——现存真实缺口，与手围方案无关也应修（步骤 3 一并补）；
3. 无手围换算能力 → §11.3 estimate 接口；
4. 发布护栏不含尺寸规则/素材物理数据完整度 → §11.5。

**Web 管理后台前端项目：**
1. **模板表单没有 `sizing_rules` 任何编辑入口**（现存缺口：改尺寸档位只能改库）→ §11.6-1；
2. 素材物理字段录入已完备，无问题；按 §11.7-A 增加完备度卡片与作品详情手围/长度展示；
3. 数据看板增量（手围档位分布、长度偏差分布）→ §11.7-B，随本期一并实现。

**微信小程序前端项目：**
1. §5 提案与后端体系的偏差按 §10.5 修正（响应格式、`cord_occupy_mm` 为派生字段、错误码在顶层 `code`）；
2. 文档内手围 cm/mm 口径混用 → 统一 mm（§10.5-3）；
3. 长度累加逻辑从"前端按形状分支推算"切换为"直接累加后端 `cord_occupy_mm`"（消除业务逻辑下沉）；
4. 保存作品需新增 `design_data.size` 契约字段（§11.4）。

---

## 十四、可复用 / 可扩展盘点（贴合后端既有技术路线）

**直接复用（零新造轮子）：**
- `sizing_rules` JSON 列 → 扩 key 即可，全方案**只有 1 个数据迁移、0 个 DDL**；
- `error.statusCode + error.errorCode + error.data` → `handleServiceError` 错误码机制现成；
- `/templates/:id/xxx` 嵌套子资源路由风格（estimate 与 payment-assets 同构）；
- `toUserMaterialJSON` 序列化收敛点（派生字段只加在这一处，管理端接口不受影响）;
- `completeness` 统计 + 快捷筛选 + 卡片跳转全链路模式（缺物理数据 = 第 4 张卡片）；
- 管理端 Alpine 表单直绑后端字段名模式（素材页已证明可行）；
- `TransactionManager`、jest 单测体系、迁移命名规范与工具链。

**可扩展（本期不做，架构已留口）：**
- estimate 未来支持"混排估算"（传素材列表精确算），签名不变扩参数即可；
- `elastic_margin_mm` 未来若需全局配置，可迁入系统配置表，读取点只在 `estimateBeadCount` 一处；
- 发布护栏为清单式校验，后续加规则只在 `updateTemplateStatus` 追加条目。

---

## 十五、拍板决议（✅ 2026-07-11 已确认，Q1~Q7 全部定案）

| 编号 | 决策项 | ✅ 决议 | 依据 |
|---|---|---|---|
| Q1 | 是否对标养个石头（手围驱动） | **是（全量）**，正式扩展拍板① 口径 | 电商定制业务（淘宝定制珠宝/京东 C2M）通行做法：以用户真实语言（尺寸）为入口，后端参数化换算——定制品客诉/退货风险必须在入口消化；技术成本已核实极低（后端 1.5 人日、0 DDL、素材物理数据已录全） |
| Q2 | 换算归属 | **甲（后端 estimate 接口）** | 规则收敛后端一处（§11.3），符合"后端是数据权威"既定原则；方案乙会把业务公式散进前端，规则一调就要发版 |
| Q3 | `cord_occupy_mm` | **是，以序列化派生实现，不加数据库列** | 唯一事实来源是 `bore_orientation + 实物尺寸`（§11.2），加列 = 双份事实的技术债；对前端而言与"后端字段"无差别 |
| Q4 | 尺寸是否硬校验下单 | **硬校验（后端拦截 + 错误码引导）** | 大厂铁律（腾讯/阿里/美团）：客户端校验只是体验优化，服务端必须重算重验；游戏公司经济系统更是全量服务端仿真。本项目 `confirmDesign` 已是服务端权威算价路线，长度校验只是同一哲学的延伸，`error.errorCode` 机制现成、边际成本≈0 |
| Q5 | 实施范围 | **全量 P0~P2 一次到位（约 5 人日，含 §11.7 看板增量）** | 大厂分期灰度是为控制存量用户风险；本项目未上线、`diy_works` 0 条，分期只会造成"颗数口径先做一版、手围口径重做一版"两套口径并存——恰是要避免的技术债 |
| Q6 | 发布护栏遇"缺物理数据素材" | **拒绝发布（错误信息列出缺失素材编码清单）** | 大厂/游戏公司强卡点文化（商品上架必填校验、配置表 CI 校验不过不进版本）：警告一定会被运营忽略，脏数据流入 C 端的排查成本远高于卡点成本；与本项目既有"缺底图禁发布""0 价禁启用"护栏哲学完全一致 |
| Q7 | 存量 2 个串珠模板档位毫米数值 | **先用行业默认值上线：手链 S=140/155、M=155/170、L=175/190（手围/目标周长，mm）、弹力余量 15mm；上线前由运营找供应链/代工厂核对工艺后可调** | 行业惯例：成品内周长 = 手围 + 1~2cm 余量（弹力绳款通常 +1.5cm），女性手围集中 14~16cm、男性 16~18cm；数值存于模板 `sizing_rules`，管理端新 UI（§11.6-1）随时可改、免发版 |

### 15.1 决议后的架构定位说明（为什么这套最适合本项目）

各流派对比后的选型结论：

- **大厂流派**（规则引擎 + 配置中心 Apollo/Nacos + BFF + 错误码目录）：服务端权威最彻底，但基础设施为百人团队设计，单体 Express 项目引入是纯负债——**只取其"服务端权威换算/校验 + 错误码目录"思想，不引入其基础设施**；
- **游戏公司 / 虚拟物品交易平台流派**（冻结→结算→铸造 + 双录账本 + 幂等键 + 价格快照）：本项目 DIY 链路
  `freeze → settleFromFrozen → mintItem`（写 `item_ledger` 双录、逐步 `idempotency_key`、`total_cost` 存
  `price_snapshot`）**已经就是这套**，是虚拟物品经济中最抗对账事故的设计，不动；
- **小公司流派**（前端算 + 后端存）：已被"后端是数据权威"既定原则否定，不回头。

最终形态 = **模板 JSON 列当"游戏配置表"用**（规则随模板走、免 DDL、运营可配）+ **大厂式服务端权威换算与校验**
（estimate 接口 + confirm 硬校验），刻意不引入规则引擎/配置中心/新表/新服务。全方案仅 1 个数据回填迁移，
所有规则读取点各只有一处（换算在 `estimateBeadCount`、派生在 `deriveCordOccupyMm`、护栏在
`updateTemplateStatus`），这是本项目技术栈下长期维护成本最低的形态。

> **本文档决议已闭环**：三端即日起按 §十一 权威设计 + §十二 执行步骤排期，无遗留待拍板项。

---

## 十六、实施完成记录（✅ 2026-07-11，后端 + 管理端已交付）

### 16.1 后端数据库项目 — 已完成（§十二 Phase 1 全部落地）

| §十二步骤 | 实施结果 | 文件 |
|---|---|---|
| 1 | ✅ `deriveCordOccupyMm` 派生函数（导出供跨服务复用）+ beads 接口下发 `cord_occupy_mm` + 素材列表 `missing_physical=true` 筛选 | `services/diy/MaterialService.js` |
| 2 | ✅ `estimateBeadCount` 换算方法（含 `DIY_TEMPLATE_NOT_BEADING` / `DIY_SIZING_RULES_MISSING` 分支）+ 门面委托 + `GET /api/v4/diy/templates/:id/estimate` 路由 | `services/diy/TemplateService.js`、`services/diy/index.js`、`routes/v4/diy.js` |
| 3 | ✅ `confirmDesign` 冻结前硬校验 `_validateDesignConstraints`（颗数兜底 + 长度校验 + 4 错误码 + winston 拦截日志）；素材查询扩 4 个物理列一次复用；素材编码提取重构为公共方法 `extractUsedMaterialCodes`（消除 3 处重复实现） | `services/diy/WorkService.js` |
| 4 | ✅ 发布护栏 `_assertPublishable`：串珠模板发布时校验档位毫米数据（`DIY_SIZING_RULES_INCOMPLETE`）+ 可用素材物理数据（`DIY_MATERIAL_SIZE_MISSING`，拒绝发布并列素材编码清单）；`updateTemplateStatus` 与 `updateTemplate` 直接置 published 两条路径都挂钩，且按"本次更新落库后最终状态"校验 | `services/diy/TemplateService.js` |
| 5 | ✅ completeness 新增 `materials.missing_physical_count` + `templates.published_missing_sizing_count` | `services/diy/AdminQueryService.js` |
| 6 | ✅ 数据回填迁移**已执行**：模板 #1 手链回填 S=140/155、M=155/170、L=175/190；模板 #2 项链仅回填 target 380/450/550；均写 `elastic_margin_mm=15`；迁移含回读验证 + 可回滚 + 可重复执行 | `migrations/20260711080000-migrate-data-diy-templates-sizing-wrist-mm.js` |
| 7 | ✅ stats 新增 `size_distribution`（手围档位分布）+ `length_deviation`（长度偏差四分档）；`getAdminWorkDetail` 返回体新增派生字段 `computed_length_mm`（与 C 端同派生函数） | `services/diy/AdminQueryService.js` |
| 8 | ✅ 测试扩展 13 个用例（estimate 4 / cord_occupy 1 / 发布护栏 1 / confirm 拦截 4 / 管理端详情长度 1 / stats 结构 1 / 迁移回填验证 1），**全套 43/43 通过**，真实数据库、颗数按真实珠径动态计算不硬编码 | `tests/services/DIYService.test.js` |

**质量检查结果（全部通过）：**
- ESLint（standard + import/node/promise 插件）：0 error（顺带修复 `services/index.js` 一处历史注释风格 error；剩余 13 个 warning 均为其它模块既有 `no-await-in-loop`，与本次无关）
- Prettier：本次改动文件全部通过
- 循环依赖检查：0 处真实循环
- Jest + SuperTest 功能测试：DIY 套件 43/43 通过（真实库 `restaurant_points_dev`，测试账号 13612227910/13612227930）
- `npm run pm:restart` 统一入口重启（PM2 cluster ×4 + redis online）→ `/health` 返回 `SYSTEM_HEALTHY`（database/redis connected）
- 真机 curl 验证：`GET /api/v4/diy/templates/1/estimate?wrist_size_mm=155&diameter=8` 返回
  `{ target_length_mm: 170, recommend_bead_count: 21, matched_size_label: "M", min_length_mm: 155, max_length_mm: 185 }`；
  `GET /api/v4/diy/templates/65/beads` 每颗素材已下发 `cord_occupy_mm`

### 16.2 Web 管理后台前端项目 — 已完成（§十二 Phase 2 全部落地，已 `npm run build`）

| §十二步骤 | 实施结果 | 文件 |
|---|---|---|
| 9 | ✅ 模板表单新增"尺寸档位（手围驱动）"编辑表格（label/display/手围/目标周长/兜底颗数/半径 XY，支持增删行）+ 模板级弹力余量输入；串珠模板缺 `sizing_rules` 时自动给 Q7 默认结构；保存时数字字段空串归 null | `admin/diy-template-management.html`、`admin/src/modules/diy/pages/diy-template-management.js` |
| 10 | ✅ 素材页新增"缺物理数据"完备度卡片（点击筛选 `missing_physical`，支持 URL `?filter=missing_physical` 带参跳转）；模板页新增"已发布缺档位数据"卡片；大屏 P0 区新增两张对应卡片 | `admin/diy-material-management.html/.js`、`admin/diy-template-management.html`、`admin/diy-dashboard.html` |
| 11 | ✅ 作品详情弹窗新增"手围档位"（`design_data.size` → "M 档 · 手围 15.5cm"）与"成品长度"（后端 `computed_length_mm` → "约 15.2cm"，无法计算时明确提示原因）展示 | `admin/diy-work-management.html/.js` |
| 12 | ✅ 大屏新增"手围看板"区：手围档位分布柱状图（ECharts 懒加载复用既有模式）+ 长度偏差四分档卡片（≤5mm/5~10mm/>10mm/不可测） | `admin/diy-dashboard.html/.js` |

管理端 ESLint 通过、本次改动文件 Prettier 通过、`npm run build` 构建成功（改源码后已重新构建，dist 已更新）。

### 16.3 微信小程序前端对接契约（Phase 3 唯一依据，后端接口已可用）

1. **模板详情/列表**（`GET /api/v4/diy/templates`、`/templates/:id`）：`sizing_rules` 已含
   `elastic_margin_mm` + 每档 `wrist_size_mm / target_length_mm`（项链品类档位无 `wrist_size_mm`，
   入口文案用"选择佩戴长度"）；
2. **算珠**（`GET /api/v4/diy/templates/:id/estimate?wrist_size_mm=155&diameter=8`）：返回 `data` 字段
   `{ wrist_size_mm, diameter, elastic_margin_mm, target_length_mm, recommend_bead_count, min_length_mm, max_length_mm, matched_size_label }`，全部毫米单位，前端 ÷10 展示 cm；
3. **长度联动**（`GET /api/v4/diy/templates/:id/beads`）：每颗素材新增 `cord_occupy_mm`（number|null），
   直接累加即为已排长度；`null` = 物理数据不完整，不计入并提示"信息完善中"；
4. **保存作品**（`POST /api/v4/diy/works`）：`design_data` 中写入 `size: { label, wrist_size_mm }`；
   项链模板把用户所选**佩戴长度毫米值**填进 `wrist_size_mm`（后端档位匹配双字段命中：
   手链按 `wrist_size_mm`、项链按 `target_length_mm`，estimate 接口同口径）；
   不带 `size.wrist_size_mm` 时后端跳过长度硬校验、仅颗数兜底；
5. **确认设计**（`POST /api/v4/diy/works/:id/confirm`）：新增 4 个业务错误码（响应**顶层 `code` 字段**，
   HTTP 400，`data` 内带毫米明细用于引导文案）：
   `DIY_BEAD_COUNT_OUT_OF_RANGE` / `DIY_MATERIAL_SIZE_MISSING` / `DIY_LENGTH_BELOW_MIN` / `DIY_LENGTH_EXCEED_LIMIT`；
6. 响应统一信封 `{ success, code, message, data, timestamp, version, request_id }`，时间字段 UTC ISO8601 带 Z，展示转北京时间由前端组件完成。

### 16.4 遗留清单（未完成项 + 非本次任务的发现）

**属于本方案但未完成（均为非开发动作或外部项目）：**
1. 微信小程序前端 Phase 3（步骤 13~16）：外部仓库，由小程序前端团队按 §11.8 + §16.3 落地；
2. 运营动作：用模板管理页新"尺寸档位"编辑区核对 Q7 默认毫米数值（建议找代工厂确认弹力绳工艺）后，
   将串珠模板 #1/#2 发布（当前均为 draft，线上 published 只有 slots 模板 #40 已归档/#65）——发布时新护栏会自动校验数据完整性；
3. 硬校验拦截率看板（§11.7-C6 决议缓做）：本期只落了 winston 结构化拦截日志
   （`[DIYService] 确认拦截：*`），上线后有需要再评估建表。

**检查过程中发现的、不属于本次任务的其它问题：**
1. `admin/src/modules/diy/pages/diy-slot-editor.js` 存在**既有** Prettier 格式偏差（本次未触碰该文件，未顺手重排以免混入无关 diff）；
2. 后端 13 个既有 ESLint `no-await-in-loop` warning（`services/lottery/*`、`services/exchange/*` 等，多数带事务内串行注释豁免场景，但未加行内豁免注释）；
3. `tests/services/DIYService.test.js` 既有用例中「管理端作品订单接口」引用了固定作品 id=35，真实库 `diy_works` 当前为 0 条，该用例靠 `if (res.body.data)` 容错通过——语义上是弱断言，建议后续改为测试内自建数据；
4. `DiyMaterial.diameter` 模型定义 `allowNull: false`，但 `MaterialService.createMaterial` 写入 `data.diameter || null`——现有数据全部有值未触发，属于潜在的写库失败点（吊坠/配饰类未来可能无直径）。

### 16.5 本次实施的文件变更清单

**后端（修改 6 个 + 新建 1 个）：**
- 修改：`services/diy/MaterialService.js`、`services/diy/TemplateService.js`、`services/diy/WorkService.js`、
  `services/diy/AdminQueryService.js`、`services/diy/index.js`、`routes/v4/diy.js`
- 修改（顺带修复历史 lint error）：`services/index.js`
- 修改（测试扩展）：`tests/services/DIYService.test.js`
- 新建（数据迁移，已执行）：`migrations/20260711080000-migrate-data-diy-templates-sizing-wrist-mm.js`

**Web 管理后台前端（修改 8 个，已重新构建）：**
- `admin/diy-template-management.html` + `admin/src/modules/diy/pages/diy-template-management.js`
- `admin/diy-material-management.html` + `admin/src/modules/diy/pages/diy-material-management.js`
- `admin/diy-work-management.html` + `admin/src/modules/diy/pages/diy-work-management.js`
- `admin/diy-dashboard.html` + `admin/src/modules/diy/pages/diy-dashboard.js`

**数据库（真实库 `restaurant_points_dev`，走迁移非手写 SQL）：**
- `diy_templates` #1/#2 的 `sizing_rules` JSON 已回填毫米字段（0 个 DDL，无表结构变更）
