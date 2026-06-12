# 兑换确认弹窗：sku_id 缺失提交失败 + 计价错显（0 / 积分）问题记录

> 提出方：微信小程序前端项目（真机 vConsole 实测 + 临时诊断日志定位）
> 涉及页面：商品详情页确认兑换弹窗（`packageExchange/exchange-detail` + `shared/exchange-confirm`）
> 后端接口：`GET /api/v4/exchange/items/:id`（详情）、`POST /api/v4/exchange`（提交）
> 命名规范：全链路 snake_case，前端适配后端，不做字段映射
> 时间：全链路北京时间（+08:00）
> 记录时间：2026-06-12

---

## 一、两个症状（真机 vConsole 实测）

### 症状 1：兑换提交失败 —— `sku_id 参数不能为空`

商品详情页点「确认兑换」：

```
请求：POST /api/v4/exchange
请求数据：{ exchange_item_id: "6", quantity: 1 }   ← body 缺 sku_id
响应：{ success:false, code:"EXCHANGE_NOT_ALLOWED", message:"sku_id 参数不能为空" } (400)
弹窗：兑换失败：sku_id 参数不能为空
```

### 症状 2：确认弹窗计价错显 —— 金额 0 / 单位错显「积分」

同一弹窗：
- 起初显示「合计消耗 **0 积分**」（金额取不到）。
- 金额修正后显示「10 **积分**」，但该商品实际计价资产是 **红源晶碎片**（应显示「10 红源晶碎片」）。

---

## 二、根因（基于临时诊断日志的真实数据）

排查时在 `_loadProductDetail` 和提交前各加一条临时诊断日志（定位后已删除），真实输出如下：

**日志 1 · 后端商品原始数据**
```
exchange_item_id: "6"          ← 字符串
cost_amount:      undefined    ← SPU 级金额为空
cost_asset_code:  undefined    ← SPU 级计价资产码为空
default_sku_id:   undefined
skus_isArray:     true         ← 后端确实返回了 SKU 数组
```

**日志 2 · 提交前状态**
```
exchange_item_id: "6"
skuList_length:   1
selectedSkuId:    "6"          ← 字符串，不是数字
selectedSkuInfo_skuId: "6"
hasMultiSku:      false
```

### 同一病根的两条分支

后端把**数值字段以字符串下发**（`sku_id="6"`、`cost_amount="500"`），且**计价信息只在 SKU 的 `channelPrices[]` 里**（SPU 级 `cost_amount`/`cost_asset_code` 为 `undefined`）。而前端：

1. **症状 1 根因**：提交 API `exchangeProduct` 用 `typeof sku_id === 'number'` 判断是否带上 sku_id。`typeof "6" === 'number'` 为 `false` → sku_id 被丢出 body → 后端报「sku_id 参数不能为空」。
2. **症状 2-金额根因**：`resolveSkuUnitCost` 用 `typeof picked.cost_amount === 'number'` 取价。`typeof "500" === 'number'` 为 `false` → 一路回退到 0 → 显示「0」。
3. **症状 2-单位根因**：`priceCode = productData.cost_asset_code || POINTS`。SPU 级 `cost_asset_code` 为 `undefined` → 退化成 `points` → 错显「积分」（真实资产码在 SKU 的 `channelPrices[0].cost_asset_code = red_core_shard`）。

### 纯文本数据流图

```
后端 GET /exchange/items/:id
  └─ data.item.cost_amount      = undefined   （SPU 级为空）
  └─ data.item.cost_asset_code  = undefined   （SPU 级为空）
  └─ data.item.skus[0] = {
        sku_id: "6",                                   ← 字符串
        channelPrices: [{ cost_amount:"500"/"10",       ← 字符串
                          cost_asset_code:"red_core_shard" }]  ← 真实资产码在这里
     }
        │
        ▼
微信小程序前端（修复前）
  ❌ typeof "6"  === 'number' → false → 提交丢 sku_id
  ❌ typeof "500"=== 'number' → false → 单价回退 0
  ❌ priceCode = undefined || 'points' → 错显"积分"
        │
        ▼
界面：合计「0/10 积分」；提交报「sku_id 参数不能为空」
```

---

## 三、问题归属

| 项目 | 是否有问题 | 说明 |
|------|-----------|------|
| 微信小程序前端项目 | ✅ 主责，已修复 | `typeof === 'number'` 判断对字符串数值失效；只读 SPU 级 `cost_asset_code` 未顺 `channelPrices` 取。落地修复点在前端 |
| web 端后台管理前端 | ⚪ 无关 | 小程序 C 端兑换流程，不经过管理后台 |
| 后端数据库项目 | ⚠️ 非 bug，契约不规范 | 接口能正常返回数据（金额/sku_id/资产码都在），不算 bug；但"数值字符串化 + SPU 不带计价信息"是连环踩坑的源头，建议反馈 |

---

## 四、前端修复（已落地，真实改动文件）

| 文件 | 改动 |
|------|------|
| `utils/api/backpack.ts` | `exchangeProduct` 的 `sku_id` 参数接受 `number\|string`，`parseInt` 归一后再判断（`!isNaN && >0`），确保 body 一定带 sku_id |
| `utils/product-display.ts` | `resolveSkuUnitCost` 增加 `toNum()`，把"数字或数字字符串"统一转数字（channelPrices→SKU→SPU 三级回退，绝不 NaN）；新增 `resolveSkuAssetCode`，优先取 SKU `channelPrices[0].cost_asset_code` |
| `packageExchange/exchange-detail/exchange-detail.ts` | ① `priceCode` 改为从第一个 active SKU 解析资产码（`resolveSkuAssetCode`），都取不到才兜底 POINTS；② 加载时把每个 SKU 的 `sku_id` 用 `Number()` 归一；③ `onSelectSku` 用 `Number(sku.sku_id)===skuId` 比较；④ 自动选中默认 SKU 时 `selectedSkuId` 归一为数字 |
| `packageExchange/components/exchange/shared/exchange-confirm/exchange-confirm.ts` | 合计/单价 observer 用 `toNum()` 归一计算 `displayUnitCost`/`displayTotalCost`，WXML 只读预计算数值，杜绝 0/NaN |

> 设计原则：在前端 API 边界做"字符串/数字归一 + 资产码顺 channelPrices 取"，符合"前端适配后端、不做字段映射兼容"的项目规范。

---

## 五、修复后预期

- 确认弹窗显示「**10 红源晶碎片**」「合计 **10 红源晶碎片**」（不再是 0 / 积分）。
- 点确认兑换，请求 body 为 `{ exchange_item_id, quantity, sku_id }`（带上 sku_id），不再报「sku_id 参数不能为空」。

## 六、质量门禁（真实结果）

- `npx tsc --noEmit`：通过（exit 0）
- `npm run lint`（ESLint）：通过（exit 0）
- `npx prettier --check`（改动文件）：All matched files use Prettier code style

> 真机验证：微信开发者工具「清除缓存（全部）→ 编译 → 真机调试」后复验上述两点。

---

## 七、给后端的契约建议（非 bug，是否采纳由后端定）

1. **数值字段统一用 JSON number 类型下发**：参与计算的 `cost_amount`、`quantity` 等不应字符串化（`"500"`），否则前端 `+` 运算会变字符串拼接、`typeof`/严格比较失效。
   - 例外：若主键为 BIGINT 且可能超过 JS 安全整数范围（2^53），可保持字符串，但前端约定"只比较、不运算"。
2. **计价信息的取数位置说明**：当前 SPU 级 `cost_amount`/`cost_asset_code` 可能为 `undefined`，真实值在 SKU 的 `channelPrices[]`。前端已按"从 SKU channelPrices 取"实现；建议后端在对接文档中明确这一取数路径，避免其他前端再踩。

> 即使后端不调整，前端现有兼容已能正确工作。本建议用于长期降低各端踩坑成本。

---

# 🏛️ 后端权威核对 + 三端归属重判（2026-06-12，Node.js 直连真实库 + 逐行核对真实代码）

> 核对方式：本项目**无 mysql 客户端**，用 `mysql2` + `.env` 真实凭据直连 `restaurant_points_dev`（MySQL 8.0.30），
> 并用 Grep/Read 逐行核对当前真实后端代码（`routes/v4/exchange/index.js`、`services/exchange/QueryService.js`、
> `services/exchange/CoreService.js`、`services/DataSanitizer.js`、`config/database.js`）+ web 管理后台前端（`admin/src`）。
> **不引用任何历史报告**，只对齐当前代码状态 + 数据库真实数据。
> 原则：**以后端数据库为准、前端适配后端、不做字段映射兼容、不兼容旧、复用现有、零新框架**。

## 一、实测结论速览（与前端文档的差异）

前端文档把根因归为"后端契约不规范（数值字符串化 + SPU 不带计价）"、定性"非 bug"。
**实测后修正如下：这不是契约小瑕疵，而是一个全局技术决策 + 一个详情接口的真实缺口，治本在后端。**

| 现象 | 前端文档说法 | 实测真实根因（以后端代码/真实库为准） |
|------|-------------|-----------------------------------|
| `sku_id="6"` 字符串 | "后端数值字符串化" | ✅ 属实，但**根因是全局配置**：`config/database.js:104-105` `supportBigNumbers:true`+`bigNumberStrings:true`，所有 **BIGINT 列**（`sku_id`/`exchange_item_id`/`cost_amount`/`original_amount`）统一以**字符串**下发。真实库已确认这些列均为 `bigint`。这是为防 JS 2^53 溢出**刻意**的全局策略，非疏漏 |
| `cost_amount="500"` 字符串 | "数值字符串化" | ✅ 同上，`exchange_channel_prices.cost_amount` = `bigint` → 字符串下发 |

## 二、真实库数据核对（item_id=6，前端文档同款商品）

直连 `restaurant_points_dev` 实测（与前端诊断日志一致）：

```
exchange_items(id=6)「衣服」: min_cost_amount=10, max_cost_amount=10,
                              min_cost_asset_code=red_core_shard, stock=42, sold_count=8
exchange_item_skus(item=6): [{ sku_id=6, status=active }]   ← 单 active SKU
exchange_channel_prices(sku=6): [{ cost_asset_code=red_core_shard, cost_amount=10 }]
列类型：sku_id/exchange_item_id/cost_amount/original_amount = BIGINT；cost_asset_code = VARCHAR(50)
```

关键事实：
- 真实计价资产确为 `red_core_shard`（红源晶碎片），金额 10，与前端文档一致。
- SPU 物化列 `min_cost_amount`/`min_cost_asset_code` **真实库里有值**（10 / red_core_shard），
  只是**详情接口没把它映射成契约字段下发** → 这是后端详情接口要补的，不需要前端顺 channelPrices 兜底。

## 三、三端问题归属重判（以后端为权威）

| 项目 | 是否有问题 | 实测定性 |
|------|-----------|---------|
| **后端数据库项目** | ✅ **有 1 个真实缺口 + 1 个全局口径待拍板** | (1) **缺口**：详情接口 `getItemDetail()` 未下发 SPU 级 `cost_amount`/`cost_asset_code`（列表接口有，详情没有，契约不一致）→ 后端补齐，单一真相源在后端。(2) **全局口径**：BIGINT 字符串化是 `config/database.js` 的全局决策，影响**全站所有数值型 BIGINT**，要不要改是**全局拍板项**（见拍板项 P1），不是 exchange 局部问题 |
| **微信小程序前端项目** | 🟢 当前已"治标"可用，但需按后端新契约**回退兼容代码** | 文档第四节的 `typeof`/`toNum()`/顺 channelPrices 取资产码是**前端兜底**。后端补齐 SPU 计价 + 明确 BIGINT 口径后，**前端应删掉这些兜底映射，直接读后端契约字段**（符合你"不做映射、前端适配后端"）。`sku_id` 提交归一仍需保留（见下） |
| **web 端管理后台前端** | 🟡 受 BIGINT 口径拍板影响（非本 bug，但同源） | `admin/src/modules/market/composables/exchange-items.js` 直接读 `item.cost_amount`/`sku.cost_amount` 填表单（:386/955）。若 P1 决定"金额类 BIGINT 改 number 下发"，web 端表单回填逻辑要同步核对（目前靠 `|| 1` 兜底，字符串也能显示但 `cost_amount` 比较/计算同样有隐患） |

## 四、可复用资产 / 可扩展点（基于现有技术栈，零新框架）

后端技术栈实测：Express4 单体 + Sequelize6 + MySQL(`mysql2`) + 服务分层（路由薄、Service 收口）+ DataSanitizer 统一脱敏 + `res.apiSuccess/apiError` 统一响应。可复用：

| 复用/扩展点 | 位置 | 怎么用 |
|------------|------|--------|
| **列表接口的 SPU 映射逻辑（直接复用到详情）** | `QueryService.getMarketItems` :465-468 | 详情 `getItemDetail` 照搬：`cost_amount←min_cost_amount`、`cost_asset_code←min_cost_asset_code`、`default_sku_id`。SPU 物化列已存在、有值，零新查询 |
| **现成"最低渠道价"聚合 helper** | `QueryService._formatExchangeItemForDetail` :1837 | 已有遍历 `skus[].channelPrices[]` 取 cheapest 的逻辑（当前未被 live 详情接口调用）。可在详情接口复用它作为 SPU 物化列的兜底（物化列为空时回退算） |
| **统一脱敏出口** | `DataSanitizer.sanitizeExchangeMarketItem` :1422 | 新增的 SPU 计价字段在这里统一收口/类型归一，前端零映射直接读。已在删 `min_cost_*` 内部列名（:1407-1409），追加"金额类字段数字化"也在此处一处改 |
| **全局 BIGINT 口径开关** | `config/database.js:104-105` | 若拍板分类处理，用 Sequelize 模型字段 `get()` 或 DataSanitizer 出口对"金额类列"做 `Number()`，**保留主键 BIGINT 字符串**（防溢出）。不动全局 `bigNumberStrings`，避免影响全站主键 |

## 五、拍板项（✅ 2026-06-12 已确认采纳全部推荐，作为后续实施唯一依据）

> 项目未上线、可一次性投入、不兼容旧、追求长期低维护低技术债。**用户已确认采纳三项推荐，最终决策锁定如下。**

### ✅ P1 · BIGINT 数值下发口径（全局，影响最大）= 方案 A（已采纳）

当前 `config/database.js` 全局 `bigNumberStrings:true` → 所有 BIGINT 以字符串下发。最终决策：

- **✅ 已采纳 方案 A：分类处理——主键保持字符串，"金额/数量类"业务数值改 number 下发。**
  - 做法：不动全局开关（保护 `user_id`/`order_no` 等主键防 2^53 溢出）；在 **DataSanitizer 出口** 对 `cost_amount`/`original_amount`/`quantity`/`stock` 等"参与计算且不可能超 2^53"的字段做 `Number()` 归一。
  - 理由：金额碎片/积分远不会超 90 万亿，转 number 安全；前端可直接 `+`/比较，**根除 typeof 踩坑**；主键仍安全。对标阿里/美团"金额 number、ID string 按语义分类"。
- ❌ 未采纳 方案 B（全局关 `bigNumberStrings` 全转 number）：主键有 2^53 溢出风险。
- ❌ 未采纳 方案 C（维持全字符串靠前端归一）：把口径问题永久外包给每个前端，违背"后端权威、降技术债"。

### ✅ P2 · 详情接口 SPU 计价字段补齐 = 方案 A（已采纳）

- **✅ 已采纳 方案 A：详情接口对齐列表接口，下发 SPU 级 `cost_amount`/`cost_asset_code`/`default_sku_id`。**
  - 复用列表的 `min_cost_amount→cost_amount` 映射；单 active SKU 下发 `default_sku_id`，多 SKU 为 null。前端详情页直接读 SPU 计价展示，无需顺 channelPrices 兜底。对标淘宝/美团"详情直接给展示价 + 列表/详情契约一致"。
- ❌ 未采纳 方案 B（不改后端、文档说明让前端从 channelPrices 取）：列表/详情契约不一致会长期坑各端。

### ✅ P3 · 多 SKU 商品的 sku_id 选择口径 = 保留现有设计（已采纳）

- **✅ 已确认：保留后端"sku_id 必填、多 SKU 不自动兜底"的既有设计。**
- 单 active SKU（如 item 6）：详情下发 `default_sku_id`，前端自动选中，提交带上。
- 多 active SKU：详情下发 `skus[]`，前端**必须让用户选规格**后提交对应 `sku_id`（后端 `CoreService.exchangeItem` :116 `sku_id` 必填、不自动兜底）。对标淘宝/京东"下单必带 skuId、单规格给默认 SKU"，避免买错规格资损。

## 六、后端执行步骤（✅ 决策已定，待你说"开始实施"后落地；本轮仅更新文档未改代码）

> 已确认决策：P1=A 分类处理、P2=A 详情对齐列表、P3 保留必填。

1. **详情接口补 SPU 计价**（`services/exchange/QueryService.js` `getItemDetail` :522）：
   - `marketItemDetailView` 加入 `min_cost_amount`/`max_cost_amount`/`min_cost_asset_code`/`stock`/`sold_count` 物化列；
   - 返回前映射：`item.cost_amount = min_cost_amount`、`item.cost_asset_code = min_cost_asset_code`、单 active SKU 时 `item.default_sku_id = skus[0].sku_id`（多 SKU 为 null）。复用 getMarketItems:465-468 同款逻辑。
2. **金额类 BIGINT 数字化**（`services/DataSanitizer.js` `sanitizeExchangeMarketItems` :1339）：
   - 在出口对 `cost_amount`/`original_amount`/`original_price` 及 `skus[].channelPrices[].cost_amount`/`original_amount` 统一 `Number()`；
   - **主键（`sku_id`/`exchange_item_id` 等）保持字符串不动**（防溢出）；删除内部物化列名沿用现有 :1407-1409。
3. **校验提交链路无需改**：`routes/v4/exchange POST` :344 已 `parseInt(sku_id)`，`CoreService` :116 必填校验保留。
4. **质量门禁**：ESLint + Prettier；Jest+SuperTest 覆盖 `GET /exchange/items/:id`（断言含 number 型 `cost_amount` + `cost_asset_code` + `default_sku_id`）与 `POST /exchange`（带 sku_id 成功 / 不带 sku_id 报 EXCHANGE_NOT_ALLOWED）；Health Check。
5. **重启**：`npm run pm:restart`（带 `--update-env`）。

## 七、前端配套（后端契约定稿后，前端适配后端、删兜底、不做映射）

### 微信小程序前端
- **删除兜底映射**：后端详情接口下发 SPU 级 `cost_amount`(number)/`cost_asset_code`/`default_sku_id` 后，
  `utils/product-display.ts` 的"顺 channelPrices 取资产码"`resolveSkuAssetCode` 与 `toNum()` 三级回退可**简化/删除**，直接读后端 SPU 字段。
- **保留**：`sku_id` 提交前 `Number()` 归一在"金额已数字化、但主键仍为字符串"前提下**仍需保留**（主键不数字化）。提交 body 必须含 `sku_id`（单 SKU 用 `default_sku_id`，多 SKU 用所选）。
- 计价展示直接读后端 `cost_asset_code` 对应中文名（红源晶碎片），不再 `|| 'points'` 误兜底。

### web 管理后台前端
- 若 P1=A 落地，核对 `admin/src/modules/market/composables/exchange-items.js` 表单回填（:386/955 读 `cost_amount`）：金额改 number 后 `|| 1` 兜底仍兼容，但应确认编辑/保存时按 number 提交，避免字符串拼接。
- SKU 主键（`sku.sku_id` :952）保持字符串读取，不做数字化。

## 八、是否符合两端现有技术栈

- **符合后端技术栈**：全部基于现有 Sequelize 模型 + Service 分层 + DataSanitizer 出口 + 物化列，零新依赖、零新表、零新框架；详情接口直接复用列表接口已验证的 SPU 映射逻辑。
- **符合 web 前端技术栈**：`admin/` 是 Vite + Alpine.js + 原生 JS（`admin/src` 模块化 composables），改动仅在数据读取层按 number 适配，不引入新库。
- **符合小程序前端技术栈**：小程序为 TS（`utils/*.ts`），改动是"删兜底、直读后端字段"，与其"前端适配后端、不做映射"规范一致。
- 小程序源码不在本仓（独立仓库），本节为方案指引，需在小程序仓库落地。

## 九、拍板清单（✅ 已确认采纳全部推荐）

| 拍板项 | ✅ 决策 | 影响面 |
|--------|------|--------|
| P1 BIGINT 口径 | **✅ A：主键保持字符串，金额/数量类改 number 下发**（DataSanitizer 出口归一） | 全站数值字段，最大 |
| P2 详情 SPU 计价 | **✅ A：详情接口对齐列表，下发 SPU `cost_amount`/`cost_asset_code`/`default_sku_id`** | exchange 详情接口 |
| P3 多 SKU 选择 | **✅ 保留后端 sku_id 必填、不自动兜底**（前端做选择器） | 提交链路（保留不变） |

> ✅ 三项已确认采纳推荐。待你说"开始实施"后我再动手改后端代码并跑完整质量门禁；前端（小程序/web）由对应前端按第七节适配。**本轮仅更新本文档、未改任何代码。**

---

# 🏛️ 三个拍板项的「行业方案对比 + 最适合本项目选型」（2026-06-12 应需求补充）

> 决策前提（你已明确）：项目**未上线、可一次性投入、不兼容旧接口、长期维护成本低、技术债最少**，
> 必须贴合后端实际技术栈（Express4 单体 + Sequelize6 + MySQL `mysql2`(BIGINT) + DataSanitizer 统一出口脱敏 + 服务分层 + `res.apiSuccess` 统一响应）。
> 每项给出：大厂（美团/腾讯/阿里）/ 小公司 / 游戏公司 / 活动策划公司 / 游戏虚拟物品·二手平台 的真实做法、区别，再给最适合你的选型。

## P1 · 数值/金额字段下发口径（BIGINT 字符串 vs number）

### 行业怎么做

| 主体 | 数值/金额怎么传 | 本质 |
|------|---------------|------|
| 大厂（阿里/腾讯/字节） | **ID 类用 string，金额类用整数 number（最小货币单位"分"）**。如阿里交易系统金额一律 long 存"分"、JSON 传 number；用户 ID/订单号等雪花 ID 用 string 防溢出 | ID=string、金额=整数 number，按语义分类 |
| 美团/京东 | 同上，金额传"分"的整数；商品/订单 ID 因可能超 2^53 用 string；前端不做 typeof 判断，按字段语义读 | 按"是否参与运算"分类 |
| 小公司/创业 | 常见两种乱象：① ORM 默认怎么给就怎么传（你现在 `bigNumberStrings:true` → 全 string）；② 金额用浮点 number 传（精度坑）。少有人按语义分类 | 一刀切（全 string 或全 number），易踩坑 |
| 游戏公司 | 游戏币/钻石/道具数量一律整数 number（无小数）；account_id/role_id 用 string；强类型协议（protobuf/自定义）天然区分 int64 与 string | 协议层强类型，数值=整数 |
| 活动策划平台 | 积分/抽奖次数/库存等整数 number；活动 ID/票据用 string | 计数类 number、标识类 string |
| 游戏虚拟物品/二手（BUFF/悠悠/闲鱼） | 价格用整数"分"number（避免浮点）；商品 ID/订单 ID 用 string（量大、防枚举+防溢出）；前端"价格直接算、ID 只比较不算" | 价格 number、ID string，前端按语义用 |

### 核心规律与最适合你的选型

**核心规律**：成熟团队**从不按"数据库类型"一刀切**，而是按"**字段语义**"分类——**参与算术运算的（金额/数量/库存）传 number，纯标识的（主键/订单号）传 string**。原因：① 金额传 number 前端可直接 `+`/比较，杜绝 typeof 踩坑；② 主键传 string 防 2^53 溢出 + 防 ID 枚举。你的 bug 正是因为**金额和主键都被 `bigNumberStrings:true` 一刀切成 string**。

> **🎯 推荐 P1 = 方案 A（分类处理：主键 string、金额/数量类 number），在 DataSanitizer 出口统一归一**：
> - **为什么不选方案 B（全局关 `bigNumberStrings`、全转 number）**：会把 `user_id`/`order_no` 等主键也转 number，雪花 ID/大自增有 2^53 溢出风险——这正是当初开 `bigNumberStrings` 的原因，不能盲目回退。
> - **为什么不选方案 C（维持全 string、靠前端归一）**：等于把后端口径问题永久外包给每个前端（小程序 + web + 未来任何端都要写 `toNum()`），违背"后端权威、降技术债"。
> - **为什么在 DataSanitizer 出口做而不是改 ORM 全局**：你已有 `DataSanitizer` 作为**统一对外响应出口**（exchange 走的就是它），在这里对"金额类字段"`Number()` 是**一处改、全 exchange 接口生效**，不动全局 ORM 行为（不影响主键、不影响其它未走脱敏的内部查询），最小爆炸半径、最贴你现有分层。
> - 对标谁：阿里/美团"金额 number、ID string 按语义分类"，是大厂标准做法的轻量落地版。
> - 贴合技术栈：零新依赖，复用现有 DataSanitizer 出口，符合"配置/口径单一真相源"。

## P2 · 详情接口要不要带"展示价/计价资产"（SPU 聚合价）

### 行业怎么做

| 主体 | 商品详情价格怎么给 | 本质 |
|------|------------------|------|
| 大厂电商（淘宝/京东/美团） | 详情接口**直接返回"展示价/起售价"**（SPU 级聚合，如"￥99 起"），同时给 SKU 列表供选规格后显示精确价。前端进详情即可渲染价格，不用自己遍历 SKU 算 | SPU 聚合价 + SKU 明细价，双层 |
| 美团商品 | 列表和详情**同一套价格契约**（都给 `min_price`/`display_price`），保证两个页面价格口径一致 | 列表/详情契约一致 |
| 小公司/创业 | 常见：详情只回 SKU 数组，让前端自己遍历取最低价/资产码（**正是你现在详情接口的状态**）→ 列表有聚合价、详情没有，两端不一致 | 前端自算，契约不一致 |
| 游戏公司（道具商城） | 商品详情直接给"价格 + 货币类型"（钻石/金币），多档位也给一个默认展示价；不让客户端遍历算价 | 服务端给定展示价+货币 |
| 活动策划平台 | 兑换/抽奖商品详情给"所需积分 + 资产类型"，服务端算好直接下发 | 服务端算好门槛 |
| 游戏虚拟物品/二手 | 商品详情给"当前价 + 计价货币（人民币/平台币）"，多规格给区间价 + 选中后精确价；绝不让前端遍历报价数组自己拼 | 服务端给展示价+货币 |

### 核心规律与最适合你的选型

**核心规律**：成熟平台**列表和详情用同一套价格契约**，且**服务端算好"展示价 + 计价货币/资产"直接下发**，不让前端遍历 SKU/报价数组自己算价。你的列表接口已经这么做了（`min_cost_amount→cost_amount`），**只有详情接口漏了**——这是"把没做完的事做完"，不是新设计。

> **🎯 推荐 P2 = 方案 A（详情接口对齐列表，下发 SPU 级 `cost_amount`/`cost_asset_code`/`default_sku_id`）**：
> - **为什么不选方案 B（不改后端、文档说明让前端从 channelPrices 取）**：会让"列表有聚合价、详情没有"的契约不一致**永久存在**，每个接入详情的前端（小程序 + 未来 H5/其它端）都要重复写"遍历 channelPrices 取最低价 + 资产码"的兜底——典型技术债。
> - **完全复用现有**：SPU 物化列 `min_cost_amount`/`min_cost_asset_code` **真实库已有值**（item 6 实测 = 10 / red_core_shard），列表接口的映射逻辑（QueryService:465-468）直接照搬到详情，零新查询、零新表。
> - 对标谁：淘宝/美团"详情直接给展示价 + 列表/详情契约一致"。
> - 贴合技术栈：改在 `getItemDetail` + `marketItemDetailView` 视图常量，符合你"统一数据输出视图"的现有约定。

## P3 · 下单主体：是否强制 sku_id（多 SKU 不自动兜底）

### 行业怎么做

| 主体 | 下单带 SKU 的口径 | 本质 |
|------|-----------------|------|
| 大厂电商（淘宝/京东/美团） | **下单必须带 skuId**，SKU 是库存/价格/履约的唯一主体；单规格商品也有一个"默认 SKU"，前端自动选中带上。绝不让后端"猜"用户要哪个规格 | SKU 必填，单规格给默认 SKU |
| 美团商品 | 同上，加购/下单都落到具体 sku；多规格未选规格则**前端拦截**，不发请求 | 前端强制选规格 |
| 小公司/创业 | 两种：① 没有 SKU 概念，直接按商品下单；② 有 SKU 但后端"默认取第一个"兜底——多规格时**买错规格**风险 | 易省略或乱兜底 |
| 游戏公司 | 道具有多档位（如不同数量礼包）时，购买必须指定档位 ID，服务端不兜底；单档位前端自动带 | 档位必填 |
| 活动策划平台 | 兑换多规格奖品必须选规格再兑，服务端校验 | 规格必填 |
| 游戏虚拟物品/二手 | 一口价/多规格商品下单必带具体 sku/lot id（关系到唯一库存件），后端绝不猜 | SKU 必填，防买错 |

### 核心规律与最适合你的选型

**核心规律**：凡是"一个商品有多规格（SKU）"的电商/游戏系统，**下单一律强制带 sku_id，后端不为多 SKU 自动兜底**（兜底=帮用户瞎选规格，买错就是资损/客诉）；**单规格商品由后端下发"默认 SKU"、前端自动选中**带上，体验不打折。你后端 `CoreService.exchangeItem` 的 sku_id 必填 + 不兜底，**正是大厂标准做法**。

> **🎯 推荐 P3 = 保留后端"sku_id 必填、多 SKU 不自动兜底"的既有设计**：
> - **为什么不改成"后端兜底默认 sku"**：多规格商品后端随便取一个 SKU = 帮用户买错规格，是资损/客诉来源；大厂一致做法是"宁可前端拦截让用户选，也不后端猜"。
> - **单 SKU 体验不打折**：靠 P2 的 `default_sku_id`（详情/列表已下发），前端单规格商品自动选中、用户无感，不需要后端兜底也顺滑。
> - 对标谁：淘宝/京东"下单必带 skuId + 单规格默认 SKU"。
> - 贴合技术栈：**零改动**（仅确认保留现有 `CoreService` :116 校验），最低技术债。

## 📌 三项最终推荐一览（✅ 2026-06-12 已确认采纳，对标行业 + 最贴你项目）

| 拍板项 | ✅ 决策 | 一句话理由 | 对标谁 |
|--------|------|-----------|--------|
| P1 数值口径 | **✅ A：主键 string、金额/数量类 number（DataSanitizer 出口归一）** | 按字段语义分类，根除 typeof 踩坑、主键防溢出、一处改全生效 | 阿里/美团"金额number·ID string" |
| P2 详情计价 | **✅ A：详情对齐列表，下发 SPU `cost_amount`/`cost_asset_code`/`default_sku_id`** | 列表/详情契约一致，复用已有物化列+映射逻辑，零新查询 | 淘宝/美团"详情给展示价" |
| P3 SKU 必填 | **✅ 保留 sku_id 必填、多 SKU 不兜底（单 SKU 给 default_sku_id）** | 防买错规格，单规格体验不打折，零改动 | 淘宝/京东"下单必带 skuId" |

> 共性：三项全部"不兼容旧、改前端适配后端、不做字段映射、复用现有、零新框架"，最贴合你"未上线、可一次性投入、长期低维护低技术债"。
> ✅ **已确认采纳全部三项推荐**。待你说"开始实施"后我再动手改后端代码并跑完整质量门禁。**本轮仅更新本文档、未改任何代码。**

---

# 🔬 复核 V2：Node.js 直连真实库 + 逐行核对当前代码（2026-06-12，本轮实测）

> 核对方式：本项目无 mysql 客户端，用 `mysql2` + `.env`（`restaurant_points_dev`，外网 `dbconn.sealosbja.site:42569`）直连真实库；
> 用 Read/Grep 逐行核对当前真实代码，**不引用任何历史报告/其它文档**，只对齐当前代码状态 + 数据库真实数据。
> 原则：以后端数据库为权威、前端适配后端、不做字段映射、不兼容旧、复用现有、零新框架。

## 0. 本轮新发现：必须先纠正前面章节里的两处事实性偏差

前面（V1/权威核对）章节里有两条与**当前真实代码**对不上，按"以实际代码为准"在此更正（后续实施以本节为准）：

| 事项 | 前文写法 | 本轮实测真相（当前代码/真实库） |
|------|---------|------------------------------|
| 详情接口的路由路径 | `GET /api/v4/exchange/items/:id` | 实际是 `GET /api/v4/exchange/items/:exchange_item_id`（`routes/v4/exchange/index.js:210`）。路径参数名是 `exchange_item_id` 不是 `id` |
| 主键列名 | 文中多处把 item 主键当作 `id` | 真实库 `exchange_items` 主键列是 `exchange_item_id`（bigint PRI），**没有 `id` 列**；`exchange_item_skus` 主键是 `sku_id`，`exchange_channel_prices` 主键才是 `id` |
| web 后台"受影响" | 称 `admin/src/.../exchange-items.js` 直接读 C 端 `item.cost_amount` 受 P1 影响 | web 后台走的是**另一套接口** `/api/v4/console/exchange/*`（`admin/src/api/exchange-item/index.js`），**不经过** C 端 `sanitizeExchangeMarketItem`。详见第 4 节，blast radius 比前文写的小 |

## 1. 真实库实测数据（item 6「衣服」，直连查询）

```
exchange_items(exchange_item_id=6)：
  item_name=衣服, status=active, stock=42, sold_count=8,
  min_cost_amount="10", max_cost_amount="10", min_cost_asset_code="red_core_shard"
exchange_item_skus(exchange_item_id=6)：
  [{ sku_id="6", sku_code="legacy_234_1", stock=39, sold_count=11, status="active", cost_price=null }]   ← 单 active SKU
exchange_channel_prices(sku_id=6)：
  [{ id="6", cost_asset_code="red_core_shard", cost_amount="10", original_amount=null, is_enabled=1 }]
```

真实列类型（information_schema 实测）：

```
exchange_items.exchange_item_id   = bigint (PRI)
exchange_items.min_cost_amount    = bigint   → mysql2 下发 "10"（字符串）
exchange_items.min_cost_asset_code= varchar(50)
exchange_items.stock / sold_count = int      → 下发 42 / 8（已是 number）
exchange_item_skus.sku_id         = bigint (PRI) → 下发 "6"（字符串）
exchange_channel_prices.cost_amount      = bigint     → "10"（字符串）
exchange_channel_prices.original_amount  = bigint NULL → 字符串或 null
exchange_records.pay_amount       = bigint → 字符串；quantity = int → number；total_cost = decimal(10,2)
```

实测 typeof（`bigNumberStrings:true` 下）：`min_cost_amount`/`sku_id`/`cost_amount` 全部 `typeof === 'string'`。
→ **前端文档的"数值字符串化"完全属实**，根因确为 `config/database.js:104-105` 的 `supportBigNumbers:true`+`bigNumberStrings:true` 全局开关作用于所有 BIGINT 列。

## 2. 当前代码逐行核对（确认 P1/P2/P3 缺口仍真实存在）

### P2 缺口（详情接口不下发 SPU 计价）— ✅ 仍然存在

- 列表接口 `QueryService.getMarketItems`（`services/exchange/QueryService.js:465-468`）：已映射
  `plain.cost_amount = plain.min_cost_amount`、`plain.cost_asset_code = plain.min_cost_asset_code`、`plain.default_sku_id = ...`。
- 详情接口 `QueryService.getItemDetail`（:522-617）：`marketItemDetailView`（:134-160）**不含** `min_cost_amount`/`max_cost_amount`/`min_cost_asset_code`，
  返回前也**没有**做 `cost_amount`/`cost_asset_code`/`default_sku_id` 映射。详情只 include 了 `skus[].channelPrices[]`（:566-569）。
- 结论：**列表有聚合展示价、详情没有，契约不一致**确为真实缺口。现成兜底 helper `_formatExchangeItemForDetail`（:1837-1863）有"遍历 channelPrices 取 cheapest"逻辑，但**未被 live 详情接口调用**（`getItemDetail` 没用它）。

### P1（BIGINT 字符串化）— ✅ 仍然存在；C 端真正出口只有 2 处

- 全局开关：`config/database.js:104-105` `supportBigNumbers:true`+`bigNumberStrings:true`。
- C 端脱敏出口 `DataSanitizer.sanitizeExchangeMarketItems`（`services/DataSanitizer.js:1339-1413`）：当前**只删内部列名**（:1407-1409 删 `min_cost_amount`/`max_cost_amount`/`min_cost_asset_code`），**未对金额做 `Number()`**。
- 真正调用方实测**只有 2 处**，都在 C 端：`routes/v4/exchange/index.js:174`（列表）、`:238`（详情）。
  → 即"金额类 BIGINT 在出口 `Number()`"这步若放在 `sanitizeExchangeMarketItems`，**只影响 C 端 exchange 列表/详情**，blast radius 很小、很安全。

### P3（sku_id 必填、不自动兜底）— ✅ 仍然是当前设计

- `CoreService.exchangeItem`（`services/exchange/CoreService.js:116-118`）：`if (!sku_id) throw BusinessError('sku_id 参数不能为空','EXCHANGE_NOT_ALLOWED',400)`，无自动兜底。
- 提交路由 `routes/v4/exchange/index.js:344-347`：已 `parseInt(sku_id,10)` 并校验 `>0`。
  → 提交链路本身**已能正确处理字符串 sku_id**（后端 `parseInt`）。前端文档"症状1"的真因是**前端没把 sku_id 放进 body**（前端 `typeof==='number'` 判断），后端这侧无需改。

## 3. 🐞 本轮额外发现的真实后端 BUG（与本需求同模块，建议一并修）

`services/exchange/admin/MarketQueryService.js:337` — `getItemDashboard()` 里有一行**无条件 `throw`**：

```js
const item = await this.ExchangeItem.findByPk(exchangeItemId, { attributes: [...] })
 throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)   // ← 缺了 if (!item) 守卫，永远抛错
const sevenDaysAgo = ...   // ← 这行及之后全是死代码，永不执行
```

- 真相：本应是 `if (!item) { throw ... }`，现在写成裸 `throw`，导致**单品看板统计接口对任何商品都报"商品不存在"**，后续逻辑成为死代码。
- 影响面：web 管理后台「单品统计/看板」功能（若已接此方法）。属于现存生产质量缺口，与本兑换需求同文件、同模块。
- 这是"对齐真实代码"才发现的，前文任何报告都未提及。
- ✅ **决策（2026-06-12）：本轮一并修**（一行：补 `if (!item)` 守卫）。详见第 7 节步骤 4。

## 4. web 管理后台前端真实情况（更正前文）

实测调用链：`admin/src/modules/market/composables/exchange-items.js`
→ `ExchangeItemAPI`（`admin/src/api/exchange-item/index.js`）
→ 走 `CONSOLE_PREFIX = /api/v4/console`，即 `/api/v4/console/exchange/items*`、`/console/exchange/items/:id/skus`。

- 该路由（`routes/v4/console/exchange/items.js`）用 `ExchangeItemService.listExchangeItems`/`getExchangeItemDetail` + `toItemWithImage`，
  **直接 `row.get({plain:true})` 原样下发**，**不经过** `DataSanitizer.sanitizeExchangeMarketItem`（那只在 C 端 `routes/v4/exchange/index.js` 用）。
- 列表项**不含** `cost_amount`/`cost_asset_code` 顶层字段（list 不回填 SPU 映射；价格信息在 `skus[].channelPrices[]` 里）。
  `exchange-items.js:386` 的 `item.cost_amount || 1` 在编辑回填时多数取不到值、落到兜底 `1` —— 这与"金额是 string 还是 number"无关，是**它读的是 C 端才有的字段名**。
- SKU 表单 `editSku`（:951-959）读 `sku.cost_amount`/`sku.cost_asset_code`：真实 SKU 行价格在 `channelPrices[]`，SKU 顶层也没有 `cost_amount` 列（SKU 表只有 `cost_price`）。即 web 后台这里本就**字段对不齐**，靠兜底跑着。
- **写入侧实测**：`saveItem`（:434）把 `itemForm.cost_amount`/`cost_asset_code` 一并 PUT/POST 给 `/console/exchange/items`，但后端 `ExchangeItemService._pickExchangeItemPayload`（:683-715）的白名单**不含这两个字段**，会被**静默丢弃**——商品价格其实由独立的 `PUT /console/exchange/items/skus/:sku_id/channel-prices`（`bulkSetPrices`）维护。即 web 表单里的"商品级 cost_amount"既读不准、写也不生效，是**纯粹的历史字段错位**。

> 结论更正：web 后台**不受 P1（C 端出口 Number 化）影响**（它不走那个出口）。但 web 后台自身存在"读/写不存在的顶层 `cost_amount`/`cost_asset_code`、靠 `|| 1` 兜底"的**既有契约错位**，是 web 前端项目自己的问题。
> ✅ **决策（2026-06-12）：本轮一并校正**（不再单独排期）。校正方向：价格统一走"SKU + channelPrices"真相源，移除商品级 `cost_amount`/`cost_asset_code` 的读写错位。详见第 7 节步骤 5 + 第 8 节。

## 5. 三端问题归属（本轮实测重判）

| 项目 | 是否有问题 | 实测定性（以当前代码/真实库为准） |
|------|-----------|-----------------------------------|
| **后端数据库项目** | ✅ 1 缺口 + 1 全局口径 + 1 额外 BUG（均本轮处理） | ① P2：C 端详情 `getItemDetail` 未下发 SPU `cost_amount`/`cost_asset_code`/`default_sku_id`（列表有、详情没有），契约不一致——**后端补齐**。② P1：BIGINT 字符串化是 `config/database.js` 全局策略，影响全站；金额类在 C 端 `DataSanitizer` 出口 `Number()`（仅影响 C 端 exchange 列表/详情 2 处调用，安全）。③ 额外 BUG：`MarketQueryService.js:337` 无条件 throw——✅ 本轮一并修 |
| **微信小程序前端项目** | 🟢 当前兜底可用，后端定稿后删兜底 | 文档第四节的 `typeof`→`toNum()`/顺 channelPrices 取资产码是**前端兜底**。后端 P2 补齐 + P1 金额数字化后，**删兜底直读后端 SPU 字段**。`sku_id` 提交前 `Number()` 归一 + body 必带 sku_id **保留**（主键仍是字符串）。注：小程序源码**不在本仓**，本节为指引 |
| **web 端管理后台前端** | 🟡 自身既有契约错位——✅ 本轮一并校正 | 走 `/api/v4/console/*` 独立接口，**不受 P1 影响**。但 `exchange-items.js` 读/写顶层 `cost_amount`/`cost_asset_code`（C 端才有 + 后端白名单丢弃），靠 `|| 1` 兜底——本轮统一改为以"SKU + channelPrices"为价格真相源。SKU 主键 `sku_id` 保持字符串读取 |

## 6. 可复用 / 可扩展点（基于现有技术栈，零新框架）

后端技术栈实测：**Express4 单体 + Sequelize6 + mysql2(BIGINT) + 服务分层（路由薄/Service 收口）+ DataSanitizer 统一脱敏出口 + `res.apiSuccess/apiError` 统一响应（HTTP 恒 200，业务码在 body）+ 北京时间出口**。

| 复用/扩展点 | 真实位置 | 怎么用 |
|------------|---------|--------|
| 列表的 SPU 映射逻辑（直接搬到详情） | `QueryService.getMarketItems` :465-468 | 详情 `getItemDetail` 照搬 `cost_amount←min_cost_amount`、`cost_asset_code←min_cost_asset_code`、单 active SKU 给 `default_sku_id`。SPU 物化列真实库已有值（item6=10/red_core_shard），零新查询 |
| 详情视图常量 | `EXCHANGE_MARKET_ATTRIBUTES.marketItemDetailView` :134-160 | 追加 `min_cost_amount`/`max_cost_amount`/`min_cost_asset_code`/`stock`/`sold_count` 5 列（与 `marketItemView` :104-129 已有的对齐） |
| 统一脱敏出口 | `DataSanitizer.sanitizeExchangeMarketItems` :1339-1413 | 已在删内部列名（:1407-1409）。在此处对 `cost_amount`/`original_amount` 及 `skus[].channelPrices[].cost_amount`/`original_amount` 追加 `Number()`；**主键 `sku_id`/`exchange_item_id` 不动**。一处改，仅 C 端 2 调用生效 |
| 现成 cheapest 兜底 helper | `QueryService._formatExchangeItemForDetail` :1837-1863 | 物化列为空时的回退算价逻辑已存在，可选作详情兜底（正常 item6 物化列有值，不需要） |
| 统一响应/时间 | `utils/ApiResponse.js`（`res.apiSuccess`）+ 北京时间出口 | 新增字段直接进 `data`，前端零映射读，符合现有契约 |

## 7. 后端执行步骤（修正版，含真实文件/行号；本轮仅文档，未改代码）

> 接口路径、查询、响应、字段一律按**后端现有技术体系**来，不按前端写法。

**步骤 1 — C 端详情接口补 SPU 计价（P2，方案 A）**
- 文件 `services/exchange/QueryService.js`：
  - `marketItemDetailView`（:134-160）追加 `'min_cost_amount'`、`'max_cost_amount'`、`'min_cost_asset_code'`、`'stock'`、`'sold_count'`。
  - `getItemDetail`（:522-617）返回前，对 `itemWithDisplayNames` 补：
    `cost_amount = min_cost_amount`、`cost_asset_code = min_cost_asset_code`；
    单 active SKU 时 `default_sku_id = skus[0].sku_id`（多 SKU 为 `null`）。复用列表 :465-468 同款写法。

**步骤 2 — 金额类 BIGINT 出口数字化（P1，方案 A）**
- 文件 `services/DataSanitizer.js` `sanitizeExchangeMarketItems`（:1339-1413）：
  - 在 `delete min_cost_*`（:1407-1409）附近，对 `sanitized.cost_amount`、`sanitized.original_price/original_amount` 及 `sanitized.skus?.[].channelPrices?.[].cost_amount/original_amount` 做 `=== null ? null : Number()`。
  - **主键 `exchange_item_id`/`sku_id`/`default_sku_id` 保持字符串不动**（防 2^53 溢出）。
  - 仅 C 端 2 处调用（`routes/v4/exchange/index.js:174/238`）生效，不影响 console、不动全局 ORM。

**步骤 3 — 提交链路确认无需改（P3）**
- `routes/v4/exchange/index.js:344-347` 已 `parseInt(sku_id)`；`CoreService.exchangeItem:116` 必填校验保留。✅ 零改动。

**步骤 4 — 修 `getItemDashboard` 无条件 throw BUG（Q1，✅ 本轮做）**
- 文件 `services/exchange/admin/MarketQueryService.js:337`：把裸 `throw new BusinessError('商品不存在', ...)` 改为
  `if (!item) { throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404) }`，让其后统计逻辑恢复执行。
- 验证：对存在的商品（如 item 6）调用应返回看板数据；对不存在 id 才报 404。

**步骤 5 — 校正 web 后台价格字段错位（Q2，✅ 本轮做；改前端适配后端真相源）**
> 价格真相源 = `exchange_item_skus` + `exchange_channel_prices`（每 SKU 多渠道价）。商品级（SPU）没有可写的 `cost_amount`/`cost_asset_code` 列，C 端的 SPU `cost_amount` 是 `min_*` 物化列的只读映射。web 后台据此校正：
- 文件 `admin/src/modules/market/composables/exchange-items.js`：
  - **读（编辑回填）**：`editItem`(:380) 移除 `cost_asset_code: item.cost_asset_code`、`cost_amount: item.cost_amount || 1` 这两个商品级字段（后端本就不返回、不接收）；商品价格改由"SKU + 渠道价"子表单管理。
  - **SKU 回填**：`editSku`(:951) 的 `cost_amount`/`cost_asset_code` 改为从该 SKU 的 `channelPrices[0]` 读取（`listSkus` 已 include channelPrices）；保存时走已有的 `setChannelPrices(skuId, prices)`（`PUT /console/exchange/items/skus/:sku_id/channel-prices`）而非塞进 SKU 主体。
  - **必填校验**：`saveItem`(:435) 的 `!this.itemForm.cost_asset_code` 必填判断移除（商品级不再有该字段），改为在 SKU/渠道价子表单处校验。
- 文件 `admin/src/modules/market/composables/exchange-items.js` 的 `itemForm`/`skuForm` 初始值（:42-43、:106）同步去掉商品级 `cost_amount`/`cost_asset_code`。
- 后端 `/console` 接口**无需改**（白名单本就不收这俩字段，渠道价端点已存在）——纯前端适配后端真相源。
- SKU 主键 `sku_id` 在 web 端保持**字符串**读取（与 P1 主键不数字化一致）。

**步骤 6 — 质量门禁**（贴合现有脚本）
- 后端：`npm run lint`（ESLint9）+ Prettier；`npm run check:api-contract` / `check:fields`；
- Jest+SuperTest 覆盖：`GET /api/v4/exchange/items/:exchange_item_id`（断言 `data.item.cost_amount` 为 number、含 `cost_asset_code='red_core_shard'`、单 SKU 有 `default_sku_id`）、`POST /api/v4/exchange`（带 sku_id 成功 / 不带报 `EXCHANGE_NOT_ALLOWED`）、`getItemDashboard`（存在商品返回数据、不存在报 404）；
- web 前端：`cd admin && npm run lint`（ESLint9）+ Prettier；手测商品/SKU 编辑回填与渠道价保存；
- `npm run health:check`。

**步骤 7 — 重启**：`npm run pm:restart`（带 `--update-env`，按服务进程管理规范）。

## 8. 前端配套（后端定稿后，删兜底、不做映射）

- **微信小程序**（独立仓库）：删 `resolveSkuAssetCode`/`toNum()` 三级兜底，直读后端 `cost_amount`(number)/`cost_asset_code`/`default_sku_id`；保留 `sku_id` 提交 `Number()` 归一 + body 必带 sku_id；计价单位直接按 `cost_asset_code` 映射中文（红源晶碎片），删 `|| 'points'` 误兜底。
- **web 管理后台**（本仓 `admin/`，✅ 本轮做）：与 P1 无关；按第 7 节步骤 5 校正——移除商品级 `cost_amount`/`cost_asset_code` 的读/写错位，价格统一走"SKU + `channelPrices`"真相源（已有 `setChannelPrices` 端点）；SKU `sku_id` 保持字符串。后端 `/console` 接口零改动。

## 9. 是否符合两端现有技术栈

- **后端**：全部基于 Sequelize 模型 + Service 分层 + DataSanitizer 出口 + 已有 SPU 物化列 + 统一响应，**零新依赖/表/框架**，详情直接复用列表已验证的映射；BUG 修复为一行守卫。✅
- **web 前端**：`admin/` = Vite6 + Alpine.js3 + 原生 JS + Tailwind3（实测 `admin/package.json`）。改动仅在数据读取/写入层（去商品级价格错位、改走已有渠道价端点），不引新库、后端 `/console` 接口零改动。✅
- **小程序前端**：TS，改动是"删兜底直读后端字段"，符合"前端适配后端、不做映射"。源码不在本仓。✅

## 10. 拍板项（含本轮新增，✅ 均已确认）

> P1/P2/P3 三项前面已确认采纳推荐（保持不变）。本轮实测新增 2 项，**2026-06-12 已确认：Q1、Q2 都本轮一起做**。

| 编号 | 事项 | ✅ 决策 | 落地位置 |
|------|------|---------|---------|
| **P1** | BIGINT 数值下发口径 | A：主键 string、金额/数量类 number（DataSanitizer 出口归一） | 第 7 节步骤 2 |
| **P2** | 详情接口 SPU 计价补齐 | A：详情对齐列表，下发 `cost_amount`/`cost_asset_code`/`default_sku_id` | 第 7 节步骤 1 |
| **P3** | 多 SKU 的 sku_id 选择 | 保留 sku_id 必填、不自动兜底（单 SKU 给 default_sku_id） | 第 7 节步骤 3（零改动） |
| **Q1** | `MarketQueryService.js:337` 无条件 throw BUG | ✅ **本轮一并修**（一行 `if (!item)` 守卫） | 第 7 节步骤 4 |
| **Q2** | web 后台商品级 `cost_amount`/`cost_asset_code` 读写错位 | ✅ **本轮一并校正**（价格统一走 SKU+渠道价真相源，后端零改动） | 第 7 节步骤 5 |

> 其余（接口路径用 `:exchange_item_id`、主键列名 `exchange_item_id`、金额仅 C 端出口 Number 化、主键保持字符串、web 后端 `/console` 接口零改动）均已按后端真实技术体系锁定，无需再拍板。
> 本轮**仅更新本文档、未改任何代码**；待你说"开始实施"后按第 7 节步骤 1-7 落地 + 跑完整质量门禁。

---

# ✅ 实施完成记录（2026-06-12，后端 + web 管理后台已落地并跑完质量门禁）

> 本轮已按"开始实施"在 sealos devbox 真实环境落地。后端（P1/P2/P3/Q1）+ web 管理后台（Q2）已改完并通过门禁；
> 微信小程序为独立仓库，由你拿第 16 节契约对接。所有验证均直连真实库 `restaurant_points_dev`，无 mock。

## 11. 后端改动（已落地）

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| P2 | `services/exchange/QueryService.js` | `marketItemDetailView` 追加 `stock/sold_count/min_cost_amount/max_cost_amount/min_cost_asset_code` 5 列；`getItemDetail` 返回前映射 `cost_amount←min_cost_amount`、`cost_asset_code←min_cost_asset_code`、单 active SKU 给 `default_sku_id`（多 SKU=null） | 详情对齐列表契约，复用列表同款映射 |
| P1 | `services/DataSanitizer.js` | 新增模块级 `toBusinessNumber()` 工具；`sanitizeExchangeMarketItems` 出口对 `cost_amount`/`original_price` 及 `skus[].channelPrices[].cost_amount`/`original_amount` 做 `Number()` 归一；主键 `exchange_item_id`/`sku_id`/`default_sku_id` 保持字符串 | 仅作用于 C 端 exchange 列表/详情 2 处调用，零全局影响 |
| Q1 | `services/exchange/admin/MarketQueryService.js` | `getItemDashboard` 第 337 行裸 `throw` 修为 `if (!item) { throw ... }` | 单品看板统计恢复正常 |
| P3 | （无改动） | `routes/v4/exchange POST :344` 已 `parseInt(sku_id)`；`CoreService:116` 必填校验保留 | 确认无需改动 |

## 12. web 管理后台改动（已落地，本仓 `admin/`）

| 文件 | 改动 |
|------|------|
| `admin/src/modules/market/composables/exchange-items.js` | ① `itemForm` 初始值/`openAddItemModal`/`editItem` 移除商品级 `cost_amount`/`cost_asset_code`（后端白名单本就不收）；② `saveItem` 移除 `cost_asset_code` 必填校验，仅校验 `item_name`；③ `editSku` 改从 `sku.channelPrices[0]` 读价；④ `saveSku` 重写：SKU 主体只写库存/状态/规格，价格通过已有 `setChannelPrices` 端点全量替换（复用 `prop-shop.js` 同款一体化模式） |
| `admin/src/modules/market/pages/exchange-market.js` | 新增 `skuPriceLabel(sku)` 助手（从 `channelPrices[0]` 取价展示） |
| `admin/exchange-market.html` | ① 商品卡片价格改读 `min_cost_amount`/`min_cost_asset_code`（console 列表真实列）；② SKU 表格价格列改用 `skuPriceLabel(sku)`；③ 商品弹窗移除 SPU 级"消耗资产/消耗数量"输入，替换为指引（价格按 SKU 在渠道价管理） |

> web 后台已 `npm run build` 重新构建（dist 已更新）；浏览器需硬刷新/清缓存加载新构建。

## 13. 质量门禁结果（真实执行，非预设）

| 门禁 | 命令 | 结果 |
|------|------|------|
| 后端 ESLint | `npx eslint services/exchange/QueryService.js services/DataSanitizer.js` | ✅ 通过（exit 0） |
| 后端 Prettier | `npx prettier --check`（同上文件） | ✅ All matched files use Prettier code style |
| web 后台 ESLint | `cd admin && npx eslint`（改动文件） | ✅ 通过（exit 0） |
| web 后台 Prettier | `npx prettier --check`（改动 js + html） | ✅ 通过 |
| web 后台构建 | `cd admin && npm run build` | ✅ built（exchange-market 重新打包） |
| 功能测试 Jest+SuperTest | `npx jest tests/security/business-data-sanitizer.test.js tests/services/ExchangeService.test.js` | ✅ 95 passed（新增 2 条：P1 金额归一/主键 string、P2 详情契约字段） |
| 真实库链路验证 | 临时脚本直连 `restaurant_points_dev` 走 getItemDetail+DataSanitizer | ✅ 7 项断言全通过（已删除临时脚本） |
| 服务重启 | `npm run pm:restart` | ✅ 4 实例 online + redis online |
| 健康检查 | `curl /health` + `npm run health:check` | ✅ SYSTEM_HEALTHY；database/redis connected；5 阶段全通过 |
| 线上接口验证 | `curl /api/v4/exchange/items/6` | ✅ `cost_amount:10`(number)、`cost_asset_code:red_core_shard`、`default_sku_id` 已下发、主键 string、内部列名未泄露 |

## 14. 新增/扩展的测试（真实业务语义，非硬编码）

- `tests/services/ExchangeService.test.js`：新增"详情接口应下发 SPU 计价契约字段"——动态取真实活跃商品，断言含 `cost_amount`/`cost_asset_code`/`default_sku_id`，且单 active SKU 必给 `default_sku_id`、多 SKU 为 null。
- `tests/security/business-data-sanitizer.test.js`：新增"金额类归一为 number、主键保持 string"——模拟 `bigNumberStrings:true` 真实下发形态（BIGINT 字符串），断言金额转 number、主键保持 string。

## 15. 本轮发现的"非本次任务"其它问题（清单，待你定夺）

1. **web 后台手动建 SKU 缺 `sku_code`** — ✅ **已解决（2026-06-12，采纳"后端自动生成"）**：
   `services/exchange/ExchangeItemService.createSku` 不再要求前端传 `sku_code`；未传入时后端自动生成
   `P{exchange_item_id}_{北京时间紧凑时间戳}_{4位随机}`（与笛卡尔 SKU 的 `P{pid}_` 前缀风格一致、唯一索引校验、最多重试 5 次），
   显式传入仍沿用（保留批量导入/迁移场景）。新增集成测试 `POST /console/exchange/items/:id/skus` 验证自动生成 + 自清理。
2. **`.eslintignore` 把 `admin/` 整目录忽略** — ✅ **已解决（2026-06-12）**：
   `.eslintignore` 最后一行 `admin/`（无前导斜杠）会匹配任意含 `admin/` 的路径，误伤后端 `services/exchange/admin/`、`services/lottery/admin/`、`tests/business/admin/`，导致 Q1 改的 `MarketQueryService.js` 等从未真正过 lint。
   修法：收紧为 `/admin/`（仅根级前端目录）。重新纳入后修掉暴露出的真实 error：
   - `services/exchange/admin/MarketQueryService.js`：删 6 个未用导入（`assertAndGetTransaction`/`fn`/`col`/`sqlWhere`/`literal`/`AdminSystemService`，代码实际用 `this.sequelize.fn` 等）、补类/构造器 JSDoc、补 `@returns` 描述、7 处 object-property-newline。
   - `services/exchange/admin/{BatchOperationService,ItemManagementService,SkuService,OrderQueryService}.js`、`services/lottery/admin/{DisplayService,QueryService,CRUDService}.js`：补类/构造器/`@returns`/参数 JSDoc、padded-blocks。
   - `tests/business/admin/{lottery-pages-api,staff_delete,user_resolve,market-pages-api}.test.js`：comma-dangle、multiline-comment-style、行尾空行、移除引用未配置规则的无效 `eslint-disable node/no-unpublished-require`。
   结果：`npm run lint` 全仓 **0 error**（仅余 11 个 `no-await-in-loop` 警告，属既有可接受的顺序处理模式，非阻塞）。受影响服务的 73 条测试全过、服务重启 SYSTEM_HEALTHY。
3. **两个历史遗留临时脚本仍在 devbox 后台运行** — ✅ **已解决（2026-06-12）**：
   `scripts/_tmp_fix_action_rules.js`（PID 49528）、`scripts/_tmp_verify_market_items.js`（PID 61602）的**脚本文件早已从磁盘删除**，仅残留孤儿进程（CPU 0%、非主服务）。已 `kill` 两个孤儿进程并确认主服务 4 实例不受影响。

## 16. 微信小程序前端对接契约（交接用，独立仓库落地）

> 后端契约已定稿并上线。小程序按下表"前端适配后端、不做字段映射、删兜底"。

### 16.1 详情接口 `GET /api/v4/exchange/items/:exchange_item_id`（注意路径参数名）

返回 `data.item` 关键字段（已脱敏、已归一）：

```
exchange_item_id   string   商品主键（BIGINT 字符串，前端只比较不运算）
cost_amount        number   展示价（=最低单价，已 Number 化，可直接运算）；无价时 null
cost_asset_code    string   计价资产码（如 "red_core_shard" 红源晶碎片）；无则 null
default_sku_id      string|null  单 active SKU 时为该 sku_id（前端自动选中提交）；多 SKU 为 null
skus[]             array    active SKU 列表
  ├ sku_id           string   SKU 主键（字符串，提交前 Number() 归一）
  ├ status           string   'active'
  └ channelPrices[]  array
       ├ cost_amount      number  渠道价（已 Number 化）
       ├ cost_asset_code  string  计价资产码
       └ original_amount  number|null
```

### 16.2 提交接口 `POST /api/v4/exchange`

```
Header: Idempotency-Key: <唯一幂等键>（必填）
Body:   { exchange_item_id, quantity(默认1,1-10), sku_id }
约束：sku_id 必填且不自动兜底（CoreService 强校验）。
      单规格商品：用详情的 default_sku_id；多规格：用户选规格后传对应 sku_id。
失败：不带 sku_id → code=EXCHANGE_NOT_ALLOWED, message="sku_id 参数不能为空"
```

### 16.3 小程序需做（删兜底、直读）

- **删兜底**：删除 `resolveSkuAssetCode` 顺 `channelPrices` 找资产码、`toNum()` 三级回退等兜底；直接读详情顶层 `cost_amount`(number)/`cost_asset_code`/`default_sku_id`。
- **保留**：`sku_id` 提交前 `Number()` 归一（主键仍是字符串）；提交 body 必带 `sku_id`（单 SKU 用 `default_sku_id`，多 SKU 用所选）。
- **计价展示**：直接按 `cost_asset_code` 映射中文（`red_core_shard`→红源晶碎片），删除 `|| 'points'` 误兜底。
- **数值**：`cost_amount` 已是 number，可直接 `单价 × 数量` 计算合计，无需 `typeof`/字符串转换。

### 16.4 纯文本数据流图（修复后）

```
后端 GET /exchange/items/:exchange_item_id
  └─ DataSanitizer 出口归一后下发：
       item.cost_amount      = 10            （number，来自 min_cost_amount）
       item.cost_asset_code  = "red_core_shard"（来自 min_cost_asset_code）
       item.default_sku_id   = "6"           （string，单 active SKU）
       item.skus[0].channelPrices[0].cost_amount = 10 （number）
        │
        ▼
微信小程序（适配后）
  ✅ 直读 item.cost_amount(number) → 合计 = 10 × 数量
  ✅ 直读 item.cost_asset_code → 显示"红源晶碎片"
  ✅ 提交 body = { exchange_item_id, quantity, sku_id: Number(default_sku_id) }
        │
        ▼
界面：合计「10 红源晶碎片」；提交成功（带 sku_id）
```








