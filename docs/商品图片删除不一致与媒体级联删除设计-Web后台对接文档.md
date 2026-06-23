# 商品图片删除不一致与媒体级联删除设计文档（微信小程序前端求证 / 后端为权威版）

> 归属方：后端数据库项目（含 Web 管理后台前端适配；不涉及微信小程序前端代码改动）
> 核查方式：Node.js（`mysql2`）直连 `.env` 真实库 `restaurant_points_dev`（`dbconn.sealosbja.site:42569`）+ 直读当前代码（`services/MediaService.js`、`services/SealosStorageService.js`、`routes/v4/images.js`、`routes/v4/console/operations/{media,storage}.js`、`utils/ImageUrlHelper.js`、`services/exchange/{QueryService,CoreService}.js`、`services/DataSanitizer.js`、`jobs/*.js`、`admin/src/...`）
> 日期：2026-06-24（北京时间）
> 技术栈（实测核对）：Node.js 20+ + Express 4 + Sequelize 6 + MySQL（utf8mb4）+ Sealos 对象存储（aws-sdk v2，S3 兼容）+ sharp 0.34；图片表 `media_files` / 多态关联表 `media_attachments` / 业务表 `primary_media_id` 等外键直引；Web 后台 = Vite 6 + Alpine.js 3 + Tailwind 3
> 状态：**本轮已用真实库 + 真实代码逐条复核，修正了原文档与现状不符的多处结论（见 §0.5）**。本文档只做分析与设计 + 执行步骤/代码方案，不直接落码，待拍板后施工。
> 原则：**以后端数据库项目为唯一权威**。接口路径 / DB 查询 / 响应格式 / 字段命名一律以后端现有体系为准；前端（Web 后台、微信小程序）一律改为直读后端字段名，**不做兼容旧接口的映射层**；项目未上线，按"长期维护成本最低、技术债最小"取舍。

---

## 〇.5、实测核对：原文档与现状不符之处（连真实库 + 代码逐条核实，必须先看）

> 下面每条都给出"实测真相"。原文档很多结论是旧报告口径，与当前代码/库不一致，已在本版改写。

| # | 原文档说法 | 实测真相（真实库 / 当前代码） | 影响 |
| --- | --- | --- | --- |
| C1 | §十 称 `getStorageOverview/getTrashList/getDuplicates/getOrphanedMedia/cleanup` **"❌ 未暴露成路由""前端未使用"** | **全部已暴露且已被前端使用**：`routes/v4/console/operations/storage.js` 已挂 `/console/storage/{overview,orphans,trash,cleanup,duplicates}`，`operations/index.js` 已 `router.use('/storage', ...)`；前端 `admin/src/modules/content/composables/storage.js` + `media-library.js` 已调用，端点常量在 `admin/src/api/system/admin.js`（`STORAGE_*`/`MEDIA_*`）| §十"现状差距/接出能力"绝大部分**已完成**，本轮不是"接出"，而是"增删改与治本" |
| C2 | "4 张表的 `primary_media_id` 直引" | 真实库引用 `media_files.media_id` 的外键**共 9 处 / 7 张表**：`exchange_items.primary_media_id`、`prize_definitions.primary_media_id`、`item_templates.primary_media_id`、`ad_creatives.primary_media_id`、`categories.icon_media_id`、`diy_templates.base_image_media_id`、`diy_templates.preview_media_id`、`diy_works.preview_media_id`、`exchange_item_skus.image_id` | 引用面比文档大，RESTRICT/级联设计与孤儿判定**必须覆盖全部 9 处**，否则仍会误删 |
| C3 | 默认隐含"删除前需补强约束、外键多为无保护" | 真实库外键 **`ON DELETE` 规则已分化**：`media_attachments.media_id`=**CASCADE**；`exchange_items.primary_media_id` 与 `exchange_item_skus.image_id`=**NO ACTION**（即 RESTRICT，删被引用图会被 DB 拦截）；其余 6 处=**SET NULL** | "引用约束"本就部分存在；治本要做的是**统一规则**，而非从零加约束 |
| C4 | §六决策4/决策1 称"回收站保留期=30 天（已拍板）" | 当前代码 `jobs/daily-media-trash-cleanup.js` + `scheduled_tasks.js` 实际按 **7 天**物理清（`DailyMediaTrashCleanup.execute(7)`）；`MediaService.cleanup` 默认 `olderThanDays=7` | 30 天只是文档结论，**代码未落**；要么改代码到 30 天，要么把决策改回 7 天（需拍板） |
| C5 | §五A/决策3 称"废除按需生成 WebP，改上传时预生成 w375/w560/w750" | 当前 `SealosStorageService` 仍是：上传预生成 **JPG 三档 small(150)/medium(300)/large(800)**；`getOrCreateResizedImage` 仍**运行时按 `?width=` 离散档(375/560/750/1080→钳1200)裁 WebP 并回写缓存**。两套并存 | "废除按需生成"是设计目标，**代码完全未改**；这是本轮真正要施工的核心 |
| C6 | §一 称"已于 06-23 修复 `getOrphanedMedia` 纳入 primary_media_id" | 代码确已修复（`MediaService.getOrphanedMedia` 已并入 4 张 `primary_media_id` 表）；**但仍只覆盖 4 表，未覆盖 C2 的另 5 处引用列**（categories/diy_*/exchange_item_skus）。实测当前这 5 列引用的图恰好都另被 attachments/primary 覆盖，**眼下无受害数据，但逻辑漏洞仍在** | 孤儿判定仍是"白名单漏列"模式，属高危残留 |
| C7 | "媒体审计需新增 ENUM、可能要迁移" | `admin_operation_logs.operation_type`/`target_type` 实测均为 **varchar(50)**（非 DB ENUM）；校验在 `constants/AuditOperationTypes.js`（应用层 `isValidOperationType`） | 加媒体审计类型**只改常量文件，零迁移** |
| C8 | 样本"2号商品 637 / media 122" | 真实库 `exchange_items` 有图记录仅 2 条：`637→122`、`633→121`，均 status=active，确为字段直引 | 样本属实，可作回归验证锚点 |

> 结论先行：**真正要施工的是 §五的 A（预生成替代按需）+ B（统一引用规则覆盖 9 处）+ C（软删/GC 落 30 天或改回 7 天）**；而 §十 绝大多数"看板/能力接出"**已经存在**，本轮应聚焦"补全回收站恢复/彻底删/引用拦截提示/缺原图核对"等真实缺口，不要重复建设。

---

## 〇、这份文档解决什么问题（一句话）

**解决"删一张商品图后，物理产物删不干净、引用变悬空，导致同一商品在不同页面一会儿有图一会儿没图"的媒体数据不一致问题**，并给出"删一张原图 = 原图 + 全部衍生图（JPG 缩略图 + WebP 动态裁剪缓存）+ 全部关联引用，一次性干净消失"的级联删除治本设计。

具体由三个真实现象触发：

1. **「我的订单」里的兑换商品没有商品图**（小程序前端截图）；
2. **兑换商城列表「2号商品」有图，但「我的订单」同一个商品没图**；
3. **小程序商城有图，但 Web 管理后台同一个商品没图**。

三个现象**根因相同**：同一张图在对象存储里**只剩按需生成的 WebP 裁剪图，原图 JPG 和静态 JPG 缩略图已被误删**——哪个页面用"WebP 裁剪 URL"就有图，用"原图/JPG 缩略图 URL"就没图。

---

## 一、根因分析（连真实库 + 对象存储实测，纯文本数据流）

### 1.1 实测证据（样本：商品「2号商品」exchange_item_id=637，主图 media_id=122）

| 核查点 | 实测结果 |
| --- | --- |
| 订单快照 `item_snapshot` | ✅ 完整：item_name="2号商品"、image_url 都在 |
| 脱敏层 `DataSanitizer.sanitizeExchangeMarketOrders` | ✅ 明确保留 item_name/description/image_url |
| `media_files` 记录(media_id=122) | ✅ status=active，created_at=2026-06-22 13:00:35，thumbnail_keys 登记 small/medium/large |
| 对象存储 原图 `uploads/{base}.jpg` | ❌ NoSuchKey（不存在） |
| 对象存储 静态缩略图 `thumbnails/small\|medium\|large/{base}.jpg` | ❌ 不存在 |
| 对象存储 动态裁剪 `thumbnails/w375\|w560\|w750/{base}.webp` | ✅ 存在（删除前小程序带 ?width= 访问时生成并缓存） |
| 后端图片代理实测 | 原图/JPG 缩略图 URL → HTTP 404；`?width=750/375` → HTTP 200 image/webp |

### 1.2 一张图的全部物理产物（当前技术栈）

```
原图          uploads/{base}.jpg
静态缩略图     uploads/thumbnails/small|medium|large/{base}.jpg   ← deleteImageWithThumbnails 删这些
动态裁剪缓存   uploads/thumbnails/w375|w560|w750/{base}.webp      ← 运行时按需生成，删除逻辑碰不到
```

### 1.3 时间线（北京时间，连真实库 + git 核实）

```
06-22 13:00:35  运营上传"2号商品"主图 → media_id=122
                对象存储落盘：原图.jpg + small/medium/large 缩略图.jpg ✅（上传流程本身正确）
                绑定：exchange_items.primary_media_id=122（字段直引，不走 media_attachments）
                小程序访问商城（带 ?width=）→ 后端裁出 w375/w560/w750 的 .webp 并永久缓存

06-22 13:00 之后约24h内：
                定时任务 hourly-cleanup-unbound-media 执行 cleanupOrphanedMedia
                ❌ 旧版 getOrphanedMedia 只查 media_attachments，未查 primary_media_id 直引
                → media 122（仅靠 primary_media_id 绑定）被误判为"孤儿"
                → 调 deleteImageWithThumbnails(原图, thumbnail_keys)
                → 删掉 原图.jpg + small/medium/large.jpg
                → w375/w560/w750 的 .webp 不在 thumbnail_keys 内，未被删 → 幸存

06-23 19:18     git 提交修复：getOrphanedMedia 纳入 primary_media_id 直引（MediaService.js 注释为证）
                此后不再误删，但已删的原图无法恢复
```

### 1.4 为什么"一个有图一个没图"（而非都没图）

```
对象存储现状：原图.jpg ❌ | small/medium/large.jpg ❌ | w375/w560/w750.webp ✅（误删前已缓存）

小程序商城（有图）：<image> 用带 ?width= 的 URL → 命中幸存 .webp → 有图
我的订单 / Web 后台（没图）：用原图.jpg 或 large 缩略图.jpg → 已被删 → 404 → 没图
```

误删只清了原图 + JPG 缩略图，没清运行时缓存的 WebP；哪个页面用 WebP-URL 就有图，用原图/JPG-URL 就没图。

---

## 二、责任归属（哪个项目的问题 — 连真实库 + 代码逐条判定）

> 你要的"哪些是后端、哪些是 Web 后台前端、哪些是小程序前端的问题"，逐项给到：

| 项目 | 判定 | 实测依据 |
| --- | --- | --- |
| **微信小程序前端** | ✅ **无代码问题** | 取图字段是后端 `DataSanitizer.sanitizeExchangeMarketItems` 下发的 `primary_image.{url,thumbnail_url,thumbnails.small/medium/large}`，订单走 `item_snapshot.image_url`；URL 均由后端 `ImageUrlHelper.getImageUrl` 生成（走 `/api/v4/images/{key}?h=` 代理）。小程序只是被动消费，碰巧用到的档命中了幸存缓存就有图。**不需要改小程序代码** |
| **Web 管理后台前端** | △ **基本无问题，仅需小幅适配** | `admin/src/...` 已用后端字段：列表读 `primary_image.thumbnails.large/public_url/url`（`exchange-items.js`/`exchange-market.js`），媒体/存储治理 composable 已对接全部 `MEDIA_*`/`STORAGE_*` 端点。真正缺口只有：①删除被 RESTRICT 拦截时的"引用清单 + 指引"弹窗；②回收站"恢复/立即彻底删"按钮；③"缺原图核对"入口。其余为**已建** |
| **后端数据库项目** | ❌ **根因 + 治本主战场** | ①孤儿清理 `getOrphanedMedia` 仍是"白名单漏列"（只覆盖 4 张 primary 表，漏 C2 另 5 处引用列）；②删除逻辑 `deleteImageWithThumbnails` 只删 `thumbnail_keys` 登记的 JPG 档，**删不到运行时生成的 `thumbnails/w{档}/*.webp` 动态缓存**（C5 两套并存的直接后果）；③外键 `ON DELETE` 规则不统一（C3：CASCADE/NO ACTION/SET NULL 混用）；④回收站保留期代码=7 天，与文档"30 天"不一致（C4） |

> 一句话：**问题几乎全在后端**（清理白名单漏列 + 动态 WebP 删不净 + 外键规则不统一 + 保留期未落）。小程序前端零改动；Web 后台只补 3 个小交互。


---

## 三、目标（你的诉求）

**实现「删一张原图 → 原图 + 全部衍生图（JPG 缩略图 + WebP 动态裁剪缓存）+ 全部关联引用，一次性干净消失」**，根除"原图没了但缓存还在、一边有图一边没图"的不一致。业界称为媒体资源的**级联删除 / 一致性 GC**。

---

## 四、各类公司设计对比（决策依据）

### 4.1 "图删了，衍生和引用怎么全消失"

| 公司类型 | 删除/级联设计 | 衍生物如何追踪 | 引用如何处理 |
| --- | --- | --- | --- |
| 大厂（阿里/腾讯/美团 媒体中台） | 原图为唯一真相源，尺寸纯按需生成+CDN缓存；删原图→CDN purge→衍生 URL 立即失效，存储侧异步 GC | 不落库固定尺寸，靠 CDN TTL+purge | 引用计数：被引用不能物理删，归零才回收 |
| 小公司/SaaS | 删"已知的几个固定 key"（原图+small/medium/large） | 硬编码已知尺寸 | 常无保护（**本项目旧逻辑即此型，且漏删动态 WebP**） |
| 游戏公司 | 资源版本化：删除=版本下线，旧版本整包 GC | manifest 清单登记 | 版本切换，旧引用随版本失效 |
| 活动策划公司 | 按活动ID/批次前缀整体存放，活动结束按前缀批量清空 | 前缀即归属 | 活动级联，不做单图引用 |
| 虚拟物品/二手平台 | 图与商品强绑定，商品删→图级联删；软删+举证保留期 | DB 登记每张图及衍生 key | 引用完整性约束（RESTRICT/SET NULL），删前校验 |

### 4.2 区别本质（两个分叉点）

1. **衍生物怎么删干净**：大厂靠 CDN purge（本项目无 CDN，不适用）；小公司靠硬编码尺寸（脆、漏动态缓存=本次 bug）；二手/游戏靠 **DB 登记每个衍生 key 清单**（精确）；或靠存储前缀扫描（S3 只能按前缀，`{base}` 在路径中间，捞不全，不可靠）。
2. **引用怎么不被删坏**：引用计数 / 外键约束（RESTRICT 禁删、或 SET NULL 置空），防止"图删了商品还指着它"的悬空。

---

## 五、最适合本项目的方案（基于现有技术栈，零新表零新框架）

将"二手/交易平台的 DB登记 + 级联 + 引用约束"落到现有 `media_files`/`media_attachments`/`primary_media_id` + `SealosStorageService`/`MediaService` 上：

### 5.1 三件套（治本）

- **A. 衍生物预生成 + DB 登记（根除"漏删动态缓存"）**：废除"按需生成 WebP 缓存"路线，改为**上传时一次性预生成所有固定尺寸档**（含原 small/medium/large 与小程序用的 w375/w560/w750 统一档位），并把**全部**衍生 key 登记进 `media_files.thumbnail_keys`（**已有字段**）。删除时 `deleteImageWithThumbnails` 照清单全删 → 原图 + 所有衍生一次清干净，不再有"运行时冒出来、删不到"的衍生物。
- **B. 引用完整性（根除悬空 + 误删）**：删 `media_files` 前统一经 `MediaService` 校验全部引用（`media_attachments` + 4 张表的 `primary_media_id`）。把 06-23 的修复升级为强约束，彻底焊死"在用图被误删"。
- **C. 删除语义：软删 → 回收站(30天) → GC**：删除先置 `media_files.status='trashed'`（回收站），保留 30 天后由定时任务物理删（原图 + 全衍生，按 A 的清单）。定时任务**只清"已软删且过期"的项，不再自动判孤儿物理删**。

### 5.2 引用分两类，分流处理（精确、低债务）

```
类型1：media_attachments（gallery/detail/showcase/icon）——图为该实体而存在
类型2：primary_media_id（exchange_item/prize_definition/item_template/ad_creative 字段引用）——实体引用某图
```

---

## 六、已拍板决策（2026-06-24，全部确认）

| # | 决策项 | 结论 | 行业依据（§四 / §九） |
| --- | --- | --- | --- |
| 1 | 删除语义 | ✅ **软删 → 回收站 → 过保留期物理 GC** | 二手平台软删举证期；未上线也防误删，删除最终彻底 |
| 2 | 衍生图追踪 | ✅ **DB 登记清单**（全衍生 key 入 `media_files.thumbnail_keys`，删时照单全删） | 二手/游戏 DB 登记，精确，契合现有字段 |
| 3 | 动态裁剪 WebP 去留 | ✅ **废除按需生成，改上传时预生成所有固定尺寸 + 登记清单** | 无 CDN 项目的标准答案；根除"运行时衍生物删不全"的土壤 |
| 4 | 回收站保留期 | ✅ **30 天** | 交易平台举证窗口，覆盖售后纠纷周期；比现默认 7 天更稳 |
| 5 | 物理 GC 触发 | ✅ **仅清"已软删且过期 30 天"的项；废除"扫描孤儿自动物理删"** | 大厂/二手平台：物理删只发生在显式软删项上，定时任务不做孤儿判断（本次事故制度性根治） |
| 6 | 引用策略 | ✅ **primary_media_id 用 RESTRICT（禁删、先换图）+ media_attachments 受控级联（连带删关联）** | 大厂"被引用禁物理删" + 二手"强引用约束"；分流处理 |
| 7 | RESTRICT 拦截交互 | ✅ **后台报错 + 明确指引"请先在商品里换图/下架"，不做一键强删** | 大厂/二手：报错引导，避免"商品悄悄变无图" |
| 8 | 存量受损数据 | ✅ **运营重新上传**（缺原图的商品图由运营在后台重传，重传即落原图+全预生成衍生） | — |

### 6.1 施工参数（决策落地的具体取值，连真实库/代码核实，全部零新表零迁移）

| # | 参数项 | 取值 | 说明 |
| --- | --- | --- | --- |
| a | 预生成尺寸档位 | ✅ **统一 3 档宽度 `w375 / w750 / w1080`**，废除旧 `small(150)/medium(300)/large(800)` JPG 档 | 对齐前端真实展示位（小程序列表卡/SKU 1倍屏、详情主图 2倍屏、大图预览 3倍屏）；按宽度档是响应式图片标准，比正方裁剪更贴合手机竖图商品 |
| b | 输出格式 | ✅ **原图保真存（JPG，透明图 PNG）+ 3 档衍生统一 WebP** | 原图保真=未来改档位可从母本重裁不二次劣化；衍生 WebP 体积最小、小程序与现代浏览器全支持。前端取图统一带 `?width=` 取 WebP，废除 `thumbnails/large/x.jpg` 静态 JPG 路径 |
| c | RESTRICT 保护范围 | ✅ **只看"引用关系是否存在"，不看商品上下架状态** | 下架是临时态、商品仍引用图，删图会致重新上架无图；保护与业务状态解耦，逻辑最简、最不易错 |
| d | 引用计数 | ✅ **不做独立计数器**；用决策6的"删除前统一校验所有引用点（`media_attachments` + 4 表 `primary_media_id`），有引用即 RESTRICT" | 兑换商品图实为运营一对一私有图，无真实"一图多商品共用"；校验式 RESTRICT = 轻量版引用计数，够用且无"计数器与实际引用不同步"的新债（YAGNI） |
| e | 回收站过期判定字段 | ✅ **复用已有 `media_files.trashed_at` 字段**（实测已存在），无需迁移 | 软删写 `status='trashed', trashed_at=NOW()`；GC 按 `trashed_at < NOW()-30天` 判过期 |

---

## 七、引用策略详解（已拍板：RESTRICT + 受控级联，分流）

场景：一张图正被商品/奖品/广告用作主图（`primary_media_id`）或挂载（`media_attachments`），此时删图怎么办？

| 选项 | 做法 | 取舍 | 采用 |
| --- | --- | --- | --- |
| ① 纯 RESTRICT | 被任何引用时禁止删，必须先换图/解绑 | 最安全、根除悬空；删图需两步 | 用于 primary_media_id |
| ② 纯 SET NULL | 删图同时把引用方 `primary_media_id` 置空 | 一步到位；但商品会悄悄变无图占位 | ❌ 不采用 |
| ③ 彻底级联 | 删图连"仅为该图存在"的关联记录一起删 | 最接近"关联全消失" | 用于 media_attachments |
| ⭐ **最终采用：①+③ 分流** | **primary_media_id → RESTRICT（禁删、先换图）；media_attachments → 受控级联（连带删关联）** | 在用主图最安全（根治本次 bug），专属挂载图删得彻底（满足"关联全消失"） | ✅ |

> 决策理由：本次故障根因就是"在用主图被误删"，对 primary 引用用 RESTRICT 是制度性根治；attachments 级联删保证"图删则其专属关联全消失"，正好实现"关联图全部消失"。纯 SET NULL 会让商品悄悄变无图，不符合"要么都在、要么都干净消失"的诉求。

---

## 八、施工范围（拍板后执行，仅后端 + 必要 Web 后台，不碰小程序）

1. **后端**：
   - `SealosStorageService`：上传时预生成所有固定尺寸档并写衍生清单；`deleteImageWithThumbnails` 按清单全删（原图 + 全 JPG/WebP 衍生）；废除/改造 `getOrCreateResizedImage` 按需生成路径。
   - `MediaService`：删除前引用校验（primary_media_id → RESTRICT 拦截；media_attachments → 受控级联）；软删进回收站（`status='trashed'`）；物理 GC 只清"软删且过期 30 天"的项。
   - 定时任务：废除 `hourly-cleanup-unbound-media` 的"扫描孤儿自动物理删"行为，改为只清过期回收站项。
2. **Web 后台**：被 RESTRICT 拦截时，商品/奖品/广告编辑页删除按钮给出明确报错 + 指引"请先换图/下架"，不提供一键强删。
3. **存量受损数据**：06-22~06-23 误删窗口期内缺原图的商品图，**由运营在 Web 后台重新上传**（重传即落原图 + 全预生成衍生，列表/详情/新订单恢复正常）。已生成的旧测试订单快照仍指向旧失效 URL，属测试数据，随测试数据清理即可。
4. **质量门禁**：ESLint + Prettier、Jest、Health Check、连真实库验证"删一张图→原图+全 WebP/JPG 衍生+关联全部消失、且在用主图删不掉"。

---

## 九、§六各拍板项的五类公司设计对比（决策留痕）

### 9.1 动态裁剪 WebP 去留（决策3）

| 公司类型 | 设计 | 特征 |
| --- | --- | --- |
| 大厂（阿里/腾讯/美团） | 按需生成 + CDN，删原图发 purge | 按需，靠 CDN 兜一致性 |
| 小公司/SaaS | 上传预生成固定几档存库 | 预生成、简单可控 |
| 游戏公司 | 离线预生成 + 打包随包分发 | 全预生成 |
| 活动策划 | 预生成 banner/缩略几档 | 预生成 |
| 虚拟物品/二手平台 | 上传预生成 + DB 登记每档 key | 预生成 + 登记，删除照单清 |

→ 本质：按需生成的衍生物"运行时冒出来"，删除追不全（本次 bug 根源）；预生成在上传时就全部确定并登记。大厂能用按需因有 CDN purge 兜底，**本项目无 CDN（代码注释明确不使用 CDN），按需即纯负债** → 选预生成。

### 9.2 回收站保留期（决策4）

| 公司类型 | 保留期 |
| --- | --- |
| 大厂 | 7~30 天分级（交易/合规 30~90 天） |
| 小公司 | 7 天或不做 |
| 游戏 | 版本资源长留，临时 7 天 |
| 活动策划 | 活动后 30 天 |
| 二手/交易平台 | 30~90 天（纠纷举证期） |

→ 本质：保留期 = 误删后悔窗口 + 合规举证窗口。本项目是积分兑换交易平台，商品图带举证属性 → 选 30 天（覆盖售后周期，又不让回收站无限膨胀）。

### 9.3 物理 GC 触发方式（决策5）

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 软删即时 + 异步 GC 清过期回收站；从不"自动判孤儿物理删" |
| 小公司 | 定时扫孤儿直接物理删（**本次踩雷模式**） |
| 游戏/活动 | 版本下线/活动结束触发 |
| 二手/交易平台 | 只有显式删进回收站；定时只清过期回收站项 |

→ 本质：危险的不是"定时任务"，而是"定时任务自作主张判孤儿物理删"——判断有漏洞就批量误删在用资源（本次 primary_media_id 漏判即此）。安全模式：物理删只发生在"已显式软删 + 过期"的项上 → 选只清过期回收站、废除孤儿自动物理删。

### 9.4 RESTRICT 拦截交互（决策7）

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 报错 + 列出被引用处，引导解绑；不提供危险一键强删 |
| 小公司 | 直接报错"使用中无法删除" |
| 游戏/活动 | 显示引用清单，禁止删 |
| 二手/交易平台 | 报错 + 指引"请先在商品编辑页换图/下架" |

→ 本质：是否给"一键解绑/强删"。一键强删会绕过运营对"商品变无图"的感知 → 选报错引导，强制运营先处理引用方，符合"要么都在、要么都干净消失"。

### 9.5 施工参数（a~e）的五类公司设计对比

**a. 预生成尺寸档位**

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 不固定档，URL 带任意 width 实时裁 + CDN |
| 小公司/SaaS | 固定 2~3 档 |
| 游戏 | 按 UI 槽位固定几档 |
| 活动策划 | banner + 列表缩略 2 档 |
| 二手/电商 | 按前端真实展示位固定 3~4 档 |

→ 档位不是越多越好（每档=多裁多存）；应对齐前端真实展示位。无 CDN 项目用固定档，3 档（375/750/1080）覆盖 1/2/3 倍屏，是电商/二手典型选择。

**b. 输出格式**

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 原图保真 + 衍生按 Accept 自适应（WebP/AVIF/JPG） |
| 小公司 | 原图 JPG + 衍生 JPG |
| 二手/电商 | 原图保真 + 衍生统一 WebP |

→ 原图是可重裁母本，须保真（转 WebP 有损会致未来重裁二次劣化）；衍生 WebP 体积最优、小程序全支持。

**c. RESTRICT 保护范围**

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 引用即保护，与业务状态解耦 |
| 二手/电商 | 引用关系存在即保护（下架≠删除，随时可能重新上架） |

→ 看"引用关系是否存在"而非"引用方是否 active"，逻辑最简、最不易错。

**d. 引用计数**

| 公司类型 | 设计 |
| --- | --- |
| 大厂/游戏 | 引用计数，删到最后一个引用才回收（资源共享场景） |
| 二手/电商 | 多数图私有一对一，不做计数 |

→ 兑换商品图为一对一私有图，无真实复用；删除前统一引用校验（有引用即 RESTRICT）已等价"引用数>0 禁删"，无需独立计数器（避免计数不同步新债，YAGNI）。

**e. 回收站过期字段**

→ `media_files.trashed_at` 字段实测已存在，直接复用，零迁移。

---

> 本文档为 2026-06-24 连真实库 + 对象存储 + 当前代码的根因分析与治本设计。§六 8 项主决策 + §6.1 五项施工参数（a~e）全部拍板，§九留行业对比依据。待你指令"开始施工"后按 §八执行（仅后端 + 必要 Web 后台），微信小程序前端零改动；存量缺图由运营重传。全部决策零新表零迁移（`trashed_at` 已存在）。

---

## 十、Web 管理后台媒体治理看板/功能（本轮一次性全做）

> 决策：5 项功能全部一次性完成（不分期）。现状差距已连代码核实——后端 `MediaService` 多数能力已存在但**未暴露成路由、前端未使用**；本轮把"已有能力接出来 + 缺的接口补上 + 前端页面建好"，与级联删除方案配套落地。
> 归属：后端（路由暴露 + 少量新增接口）+ Web 管理后台前端（页面）。不碰小程序。

### 10.1 现状差距（连代码核实）

| 后端 MediaService 已有方法 | 路由暴露 | 前端已用 |
| --- | --- | --- |
| `getStorageOverview` 存储概览 | ❌ 未暴露 | ❌ |
| `getTrashList` 回收站列表 | ❌ 未暴露 | ❌ |
| `getDuplicates` 重复图检测 | ❌ 未暴露 | ❌ |
| `getOrphanedMedia` 孤儿图 | ❌ 未暴露 | ❌ |
| `cleanupOrphanedMedia` / `cleanup` 物理 GC | ❌ 未暴露 | ❌ |
| `upload`/`list`/`delete`/`attach`/`detach` | ✅ 已暴露 | ✅ 媒体库页（仅浏览/传/删） |

### 10.2 本轮一次性完成的 9 项功能

| # | 功能 | 后端 | 前端 | 是否本方案必备 |
| --- | --- | --- | --- | --- |
| 1 | **回收站管理**：列表（显示 `trashed_at`+剩余天数）、恢复、立即彻底删 | 暴露 `getTrashList`/`cleanup` + 新增"恢复"(`status:trashed→active`)、"立即彻底删单条" | 回收站页（列表+恢复+彻底删） | ✅ 软删方案硬配套 |
| 2 | **删除引用拦截提示**：删图被 RESTRICT 挡时，展示"被哪些商品/奖品/广告以何 role 引用" | 新增"查某图全部引用"接口（聚合 `media_attachments` + 4 表 `primary_media_id`） | 删除弹窗显示引用清单 + 指引"先换图/下架" | ✅ RESTRICT 方案硬配套 |
| 3 | **存储概览看板**：按 folder 统计文件数/占用空间/本周上传/孤儿数 | 暴露 `getStorageOverview` | 媒体库页顶部概览卡（`mediaStats` 字段已留位） | ✅ 本轮一次性做 |
| 4 | **悬空/受损媒体看板**：列"无引用孤儿图"+"DB有记录但对象存储缺原图"的受损图 | 暴露 `getOrphanedMedia` + 新增"缺原图核对"（连对象存储校验 object_key 是否存在） | 媒体治理页（两类清单 + 跳转重传/清理） | ✅ 本轮一次性做（直接防本次事故复发） |
| 5 | **重复图检测**：按 `content_hash` 列出重复图，引导合并/清理 | 暴露 `getDuplicates` | 媒体治理页（重复组列表） | ✅ 本轮一次性做 |
| 6 | **媒体操作审计日志（A）**：删图/恢复/彻底删/批量清理/换图等不可逆操作全留痕（谁、何时、删哪张、影响哪些商品） | `MediaService` 危险操作接入现有 `AuditLogService.logOperation`（新增 media 操作类型常量；零新框架） | 媒体审计查询页（复用现有审计日志列表组件，按 target_type=media 筛选） | ✅ 危险操作必备安全配套 |
| 7 | **删除影响预览（B）**：删图前预告"连带删 X 张衍生图、解除 Y 个关联、释放 Z 空间" | 新增"删除影响预览"方法（复用 `DataManagementService` 的 preview_token 模式：算衍生清单+引用数+字节数） | 删除弹窗二次确认展示影响 | ✅ 防误删配套 |
| 8 | **媒体引用率/使用情况（C）**：标注"从未被引用"（纯浪费）与"被引用次数"，辅助清理决策 | 复用功能2的"查引用"聚合 + 功能4孤儿检测，新增"按引用数统计"读方法 | 媒体库列表增加"引用数"列 + "未使用"筛选 | ✅ 本轮一次性做 |
| 9 | **存量图片压缩/格式批量优化（D）**：批量把存量原图重压缩并补齐 WebP 衍生（按 §6.1 档位） | 新增批量优化方法（复用 `uploadImageWithThumbnails` 的 sharp 处理 + 预生成逻辑，对存量 media 重跑） | 媒体治理页"批量优化"入口（显示进度/结果） | ✅ 本轮一次性做 |

> 功能 6~9 对应上一轮"扩展功能候选"的 A/B/C/D，本轮一并实现（不分期、全部一次性做掉）。6、7 是软删+级联删除危险操作的安全配套（留痕 + 预览确认）；8、9 为运营治理增强。全部复用现有模块（`AuditLogService`、`DataManagementService` preview 模式、`uploadImageWithThumbnails` 处理链），零新框架、零新表。

### 10.3 接口与页面落点（零新表）

- 后端新增/暴露路由统一挂在 `routes/v4/console/operations/media.js`（现有文件），通过 ServiceManager 调 `media` 服务；读操作直接调 `MediaService` 现成方法。需在 `MediaService` 现有类上**扩展方法**（不新建文件）的有：功能2"查引用"、功能4"缺原图核对"、功能7"删除影响预览"、功能8"按引用数统计"、功能9"批量优化"；功能6 审计接入现有 `AuditLogService`（新增 media 操作类型常量到 `constants/AuditOperationTypes.js`）。
- 前端：**回收站**、**媒体治理（孤儿/受损/重复/批量优化）** 作为媒体库页新 Tab 或独立页，复用现有 `data-table` + `media-library.js` composable 扩展；**存储概览**作顶部概览卡；**删除引用提示 + 删除影响预览**改造现有删除弹窗（二次确认）；**媒体审计**复用现有审计日志列表组件按 target_type 筛选；**引用率/未使用**作列表增列+筛选。统一 `request()` 封装、`*_ENDPOINTS` 常量、`npm run admin:build`。

### 10.4 一次性施工的质量门禁

ESLint(后端4插件)+Prettier、Jest+SuperTest（新接口）、Health Check、admin:build、连真实库验证（回收站恢复/彻底删、引用拦截、缺原图核对、删除影响预览、审计留痕、批量优化均连真实数据跑通）。

### 10.5 明确不做（YAGNI 边界，避免技术债）

媒体规模小（实测 26 个文件 / 3 个 folder），以下为**有意识地不做**，非遗漏：

| 不做项 | 理由 |
| --- | --- |
| CDN 接入 / 多区域分发 | 明确无 CDN、单 Sealos，规模极小，不需要 |
| 内容审核（鉴黄/鉴政） | 运营自传商品图，非 UGC，无审核诉求 |
| AI 标签 / 以图搜图 | 典型过度设计，无业务诉求 |
| 版本历史（每次换图存旧版链） | 软删 30 天回收站已提供后悔窗口，再做版本链是重复保护 |

> 本章 9 项功能**本轮一次性全部完成（不分期）**，与 §八 级联删除施工合并推进；功能 1/2/6/7 为软删+RESTRICT+级联删除危险操作的安全配套，4 直接预防本次"缺原图"事故复发，3/5/8/9 为治理增强。全部复用现有模块，零新框架、零新表；§10.5 列出有意识不做的项以守住 YAGNI 边界。

> ⚠️ **本章基于 §0.5 实测修正**：C1 已证明 3/5（存储概览/重复检测）后端路由 + 前端 composable **均已存在**；4（孤儿/受损看板）后端 `storage/orphans` 已暴露、前端 `loadOrphanFiles` 已对接。因此本章对 3/4/5 应理解为"**已建，仅做小修**"，真正缺口集中在 §11.2 的"回收站恢复/彻底删、引用拦截提示、缺原图核对"。

---

## 十一、以后端为唯一权威的接口 / 字段 / 查询 / 响应设计（前端适配后端，不做映射层）

> 你的硬要求：接口路径、DB 查询、响应格式、字段命名**全部以后端现有体系为准**；前端改为直读后端字段，不兼容旧接口。下面给出"后端权威契约"，并标注前端要怎么改。

### 11.1 后端既有体系（实测，必须沿用，不得另起一套）

| 维度 | 后端权威约定（实测） | 说明 |
| --- | --- | --- |
| 路由前缀/分层 | `/api/v4/console/{域}/{资源}`，媒体在 `console/media`，存储治理在 `console/storage`；经 `operations/index.js` 聚合 | 新增接口**挂到这两个现有文件**，不新建路由域 |
| 服务获取 | `req.app.locals.services.getService('media')`（ServiceManager 单例） | 路由不 `new Service`，统一走 ServiceManager |
| 响应封装 | `res.apiSuccess(data, message)` / `res.apiError(message, code, details, http)`；统一信封 `{success,code,message,data,timestamp,version,request_id}`，**HTTP 恒 200，靠 `success` 判定** | 新接口一律用这套，不得裸返 JSON |
| 分页 | 入参 `page` / `page_size`；出参 `pagination:{page,page_size,total,total_pages}` | 与 `listMedia`/`getTrashList` 现状一致 |
| 字段命名 | snake_case；主键 `media_id`、`attachment_id`；图字段 `object_key`/`thumbnail_keys`/`content_hash`；状态枚举 `active|archived|trashed`；软删时间 `trashed_at` | 前端**直接用这些名**，禁止再映射成 camelCase |
| URL 生成 | 一律 `ImageUrlHelper.getImageUrl(object_key, content_hash)` → `/api/v4/images/{key}?h=`；禁止存完整 URL | 任何新读接口返回图都走它 |
| 鉴权 | `authenticateToken` + `requireRoleLevel(100)` | 媒体管理类接口沿用 |
| 审计 | `AuditLogService.logOperation({operator_id, operation_type, target_type, target_id, action, before_data, after_data})`；类型常量在 `constants/AuditOperationTypes.js`（varchar，非 ENUM，零迁移） | 危险操作接这里 |
| 预览令牌 | `DataManagementService` 的 `preview_token`（Redis，5 分钟，`pv_<ts>_<rand>`）confirm 模式 | "删除影响预览/二次确认"复用此模式 |

### 11.2 后端要新增 / 改造的接口（权威契约，前端照此改）

> 全部挂在现有 `routes/v4/console/operations/{media,storage}.js`，方法加在现有 `MediaService` 类（不新建 service/文件）。

| # | 方法（后端权威路径） | 入参 | 响应 data（snake_case） | 复用/新增 |
| --- | --- | --- | --- | --- |
| N1 | `POST /console/media/:media_id/purge` 立即彻底删单条（回收站内） | path `media_id` | `{ media_id, deleted_objects:[key...], freed_bytes }` | 复用 `cleanup` 的删除内核，抽成 `purgeOne(mediaId)` |
| N2 | `GET /console/media/:media_id/references` 查某图全部引用 | path `media_id` | `{ media_id, attachments:[{attachable_type,attachable_id,role}], primary_refs:[{table,column,id}], total }` | **新增** `getReferences(mediaId)`：聚合 `media_attachments` + §C2 全 9 处外键列 |
| N3 | `GET /console/storage/damaged` 缺原图核对 | query `folder?`,`limit?` | `{ items:[{media_id,object_key,missing:true}], total }` | **新增** `getDamagedMedia()`：对 active 图 `headObject(object_key)` 校验存在性 |
| N4 | `POST /console/media/:media_id/delete-preview` 删除影响预览 | path `media_id` | `{ preview_token, derived_keys:[...], reference_count, attachments_to_cascade, freed_bytes_estimate, blocked_by_primary:bool }` | **新增** `previewDelete(mediaId)`：复用 `preview_token` 模式 |
| N5 | `GET /console/media/usage` 引用率/未使用 | query `page`,`page_size`,`unused_only?` | 列表项增 `reference_count`，`pagination` | **新增** `listMediaWithUsage()`：在 `listMedia` 上 LEFT JOIN 引用计数 |
| N6 | `POST /console/storage/optimize` 存量批量优化（补 WebP 衍生/重压） | body `{ folder?, media_ids?, dry_run? }` | `{ processed, succeeded, failed, details:[...] }` | **新增** `batchOptimize()`：复用 `uploadImageWithThumbnails` 处理链对存量重跑 |
| M1 | 改造 `DELETE /console/media/:media_id` | 同现状 | 当被 §C2 任一 `primary` 类外键引用时 → `apiError('图片被引用，请先在商品/奖品/广告换图或下架','MEDIA_IN_USE', {references}, 409)`；否则软删（attachments 关系连带按级联语义处理） | 改造 `moveToTrash` 前置 `getReferences` 校验 |

> **前端适配（Web 后台，直读后端字段，不映射）**：在 `admin/src/api/system/admin.js` 的 `SYSTEM_ADMIN_ENDPOINTS` 增 `MEDIA_PURGE/MEDIA_REFERENCES/MEDIA_DELETE_PREVIEW/MEDIA_USAGE/STORAGE_DAMAGED/STORAGE_OPTIMIZE` 常量；在现有 `storage.js`/`media-library.js` composable 加方法；删除弹窗读 `data.references`/`data.derived_keys` 原样渲染；回收站列表读 `data.items[].trashed_at` 直接算剩余天数。**不得新建 camelCase 映射对象**。

### 11.3 可复用 / 可扩展清单（基于后端现有技术栈，零新框架零新表）

| 能力 | 可复用现成件 | 可扩展点（本轮加在其上） |
| --- | --- | --- |
| 软删/回收站 | `media_files.status='trashed'`+`trashed_at`（字段已存在）、`moveToTrash`/`restore`/`getTrashList`/`cleanup` 全已有 | 加 `purgeOne`（单条彻底删）、把保留期参数集中到 §13 拍板值 |
| 衍生图处理 | `SealosStorageService.uploadImageWithThumbnails`（sharp 链）、`getOrCreateResizedImage`（裁剪+回写） | 预生成档位统一（§13-D），`batchOptimize` 对存量重跑同一链 |
| 删除物理清理 | `deleteImageWithThumbnails`（删原图 + thumbnail_keys 档） | **扩展为按"衍生清单"删**：把动态 `w{档}` key 也登记进 `thumbnail_keys` 后即可一并删净（治本 C5） |
| 引用约束 | DB 外键已部分 RESTRICT（exchange_items/skus=NO ACTION） | 迁移统一 §C2 全 9 处的 `ON DELETE`（§13-A 拍板规则） |
| 审计 | `AuditLogService.logOperation` + `AuditOperationTypes` 常量（varchar 零迁移） | 加 `MEDIA_DELETE/MEDIA_RESTORE/MEDIA_PURGE/MEDIA_OPTIMIZE` 常量 |
| 二次确认 | `DataManagementService` preview_token（Redis 5min） | `previewDelete` 直接套用同模式 |
| 前端 | `data-table`（`alpine/components/data-table.js`）、`request()`/`buildURL`/`buildQueryString`、`*_ENDPOINTS` 常量、`admin:build` | 媒体治理页/回收站页/删除弹窗均复用，无需引新前端库 |

---

## 十二、执行步骤与代码方案（待拍板后施工，给出落点与代码骨架）

> 顺序：先治本三件套（后端），再 Web 后台小适配，最后质量门禁。每步标"改哪个文件 + 怎么改"。

### 12.1 后端 - 治本 A：动态 WebP 纳入删除清单（根除"删不净"）

- 文件：`services/SealosStorageService.js`、`services/MediaService.js`、`routes/v4/images.js`
- ✅ 定稿走 **方案 A2（彻底，§13-D）**：上传时一次性预生成全部固定档(含宽度档)并登记进 `media_files.thumbnail_keys`，**废除运行时 `getOrCreateResizedImage` 按需生成 + 回写路径**；图片代理 `routes/v4/images.js` 去掉 `?width=` 走按需裁剪的分支，改为按预生成档 key 直取；`deleteImageWithThumbnails` 照 `thumbnail_keys` 全清。
- 同步落 §13-E：预生成档位改宽度档 `w375 / w750 / w1080`（废旧正方 `small/medium/large`），与 A2 同一次施工，存量只回填一次。
- 备忘（早期评估过的省事方案，已不采纳）：A1=保留按需生成但把 `w{档}` key 回写登记进 `thumbnail_keys.dynamic[]`，删除时遍历一并删。A1 仍留"运行时冒衍生物"的债土壤，按你取向放弃。
- 代码骨架（A2 删除内核，照清单全删）：

```javascript
// thumbnailKeys 形如 { w375, w750, w1080 }（A2 预生成全部档，无运行时动态档）
const keysToDelete = Object.values(thumbnailKeys || {}).filter(v => typeof v === 'string' && v)
await Promise.all(keysToDelete.map(key => this.deleteObject(key)))
```

### 12.2 后端 - 治本 B：孤儿判定 + 引用校验覆盖全 9 处外键（根除误删/悬空）

- 文件：`services/MediaService.js`
- 改 `getOrphanedMedia`：把"已引用集合"从"4 张 primary 表"扩到 §C2 **全 9 处引用列**（新增 categories/diy_templates×2/diy_works/exchange_item_skus）。建议抽成常量驱动：

```javascript
const MEDIA_REF_COLUMNS = [
  ['ExchangeItem', 'primary_media_id'], ['PrizeDefinition', 'primary_media_id'],
  ['ItemTemplate', 'primary_media_id'], ['AdCreative', 'primary_media_id'],
  ['Category', 'icon_media_id'], ['DiyTemplate', 'base_image_media_id'],
  ['DiyTemplate', 'preview_media_id'], ['DiyWork', 'preview_media_id'],
  ['ExchangeItemSku', 'image_id']
]
// 遍历查 IS NOT NULL 的值并入 usedMediaIds
```

- 新增 `getReferences(mediaId)`（N2）：同一份 `MEDIA_REF_COLUMNS` + `media_attachments` 聚合，返回引用清单。
- 改 `moveToTrash`（M1）：删前调 `getReferences`，若存在 `primary` 类引用 → 抛 `BusinessError('MEDIA_IN_USE', 409)`。

### 12.3 后端 - 治本 C：软删→回收站→GC 落地（保留期按 §13-B 定值）

- 文件：`jobs/daily-media-trash-cleanup.js`、`jobs/hourly-cleanup-unbound-media.js`、`scheduled_tasks.js`、`MediaService.cleanup`
- 改法：
  - 保留期改为拍板值（30 或 7），统一到一处（建议 `.env` 或 `MediaService` 常量）。
  - **决策5（废除孤儿自动物理删）若采纳**：`hourly-cleanup-unbound-media` 改为只把孤儿"软删进回收站"（`status='trashed'`），物理删只由 `daily-media-trash-cleanup` 对"过期回收站项"执行。→ 制度性根治"定时任务自作主张物理删在用图"。

### 12.4 后端 - 新增接口 N1~N6（挂现有路由 + 加 MediaService 方法）

- 文件：`routes/v4/console/operations/media.js`、`routes/v4/console/operations/storage.js`、`services/MediaService.js`、`constants/AuditOperationTypes.js`
- 每个接口：路由薄壳（取 service、调方法、`res.apiSuccess`）+ `MediaService` 方法实现 + 危险操作接 `AuditLogService.logOperation`。

### 12.5 Web 后台前端适配（直读后端字段）

- 文件：`admin/src/api/system/admin.js`（加端点常量）、`admin/src/modules/content/composables/{storage,media-library}.js`（加方法）、删除弹窗模板（读 references/derived_keys）。
- `npm run admin:build` 验证产物。

### 12.6 质量门禁（连真实库验证）

- 后端：`npm run lint`（ESLint+4 插件）、`npm test`（Jest+SuperTest 覆盖 N1~N6 + M1）、`npm run health:check`。
- 前端：`cd admin && npm run lint && npm run build`。
- 连真实库 E2E：删一张测试图 → 断言"原图 + 全 JPG/WebP 衍生 + attachments 关联全部消失，且在用主图删不掉返回 409"。

---

## 十三、拍板结论（2026-06-24 按"未上线 + 愿重投入 + 长期债最小"取向定稿）

> 原"待拍板"项已逐条定稿，依据见 §14 五类公司对比。取值已与 §六/§6.1 既有拍板对齐（D/E 正是让 §六决策3 + 参数a 真正落地，C5 指出代码从未改）。

| # | 项 | ✅ 定稿结论 | 与原推荐差异 |
| --- | --- | --- | --- |
| A | §C2 全 9 处外键 `ON DELETE` 统一规则 | ✅ **"实体引用图"列(`*.primary_media_id`/`categories.icon_media_id`/`diy_templates×2`/`diy_works.preview_media_id`/`exchange_item_skus.image_id`)全 RESTRICT + `MediaService` 删前 `getReferences` 应用层校验，双保险；`media_attachments.media_id` 保持 CASCADE** | 不变（单 MySQL 不分库，DB 外键完全可用，统一后无白名单漏列债） |
| B | 回收站保留期 | ✅ **30 天，并改代码对齐（现状 7 天）** | 不变（与原 §六决策4 一致） |
| C | 决策5"废除孤儿自动物理删" | ✅ **落地：`hourly-cleanup-unbound-media` 改为孤儿只软删进回收站；物理删只由 `daily-media-trash-cleanup` 清"过期 30 天回收站项"** | 不变（制度性根治本次事故） |
| D | 动态 WebP 治本 | ✅ **A2 彻底：上传时一次性预生成全部固定档(含宽度档)并登记进 `thumbnail_keys`，废除运行时 `getOrCreateResizedImage` 按需生成 + 回写路径** | **升级**（你愿重投入；无 CDN 项目只能靠预生成+登记治本，A1 仍留按需生成的债土壤） |
| E | 预生成档位 | ✅ **改成宽度档 `w375 / w750 / w1080`(覆盖 1/2/3 倍屏)，废除旧正方 `small(150)/medium(300)/large(800)`** | **升级**（与 D=A2 同一次施工绑定做，只回填一次存量；正好落地原 §六参数a） |
| F | 缺原图核对 N3 | ✅ **实时逐个 `headObject` 探测（当前仅 26 文件，零新表）；规模上千再转异步对账落库** | 不变（现在做异步是过度设计） |

> 全部基于现有技术栈：**零新框架、零新表**，仅需 ①一支外键规则统一迁移 ②存量回填脚本（`batchOptimize` 跑 26 张）③上传链 + 图片代理 + 删除逻辑改造。下一步按 §十二出完整代码 diff。

---

## 十四、A~F 各项的五类公司设计对比 + 最适合本项目的方案（决策依据）

> 你的取向（**未上线 / 愿一次性重投入 / 不兼容旧接口 / 长期维护成本最低、技术债最小 / 基于现有技术栈**）已写明。该取向会**反转**我在 §13 里基于"省成本"给的部分推荐——下面每项先列五类公司怎么做，再给"按你取向"的最终建议（已标注是否与 §13 不同）。
>
> 现有技术栈约束（实测，决定可行性）：**无 CDN**（`ImageUrlHelper` 注释明确不走 CDN，直连 Sealos 代理 `/api/v4/images`）、aws-sdk v2 操作 S3 兼容存储、sharp 0.34 本地裁剪、Sequelize 6 + MySQL、`media_files.thumbnail_keys` 为 JSON 字段（可塞清单）、`trashed_at` 已存在。

### 14.A 外键 9 处 `ON DELETE` 统一规则

| 公司类型 | 设计 | 特征 |
| --- | --- | --- |
| 大厂（阿里/腾讯/美团） | 应用层引用计数 + 软删，DB 层多不设硬外键（分库分表下外键不可用），靠服务保证一致性 | 应用层强校验，DB 弱约束 |
| 小公司/SaaS | 要么无外键裸删，要么 SET NULL 图省事 | 简单，但易悬空/无图占位 |
| 游戏公司 | 资源走 manifest 清单 + 版本化，删除=版本下线，引用随版本失效 | 版本约束代替行级外键 |
| 活动策划公司 | 按活动前缀整体存放，引用是"逻辑归属"而非外键 | 批次级，不做行级约束 |
| 虚拟物品/二手平台 | **DB 外键 RESTRICT（被引用禁删）+ 删前服务层校验双保险** | 行级强约束，杜绝悬空 |
| **本项目最适合** | **(a) "实体引用图"列全 RESTRICT（DB 层）+ `MediaService` 删前 `getReferences` 校验（应用层）双保险；`media_attachments` 维持 CASCADE（专属挂载随图清）** | 与 §13-A 推荐**一致**。你不分库分表、单 MySQL，DB 外键完全可用且最省心；9 处统一规则后逻辑唯一、无白名单漏列风险，长期债最低 |

> 落点：一支迁移把 `categories.icon_media_id`、`diy_templates×2`、`diy_works.preview_media_id`、`exchange_item_skus.image_id`、`*.primary_media_id` 的 `ON DELETE` 统一改 RESTRICT（现状是 SET NULL/NO ACTION 混用，C3）；`media_attachments.media_id` 保持 CASCADE。

### 14.B 回收站保留期

| 公司类型 | 保留期 |
| --- | --- |
| 大厂 | 7~30 天分级，交易/合规域 30~90 天 |
| 小公司 | 7 天或不做 |
| 游戏 | 版本资源长留，临时件 7 天 |
| 活动策划 | 活动结束后 30 天 |
| 二手/交易平台 | 30~90 天（纠纷举证窗口） |
| **本项目最适合** | **30 天，并改代码对齐（现状 7 天）** | 与 §13-B 推荐**一致**、与原 §六决策4**一致**。你是积分兑换交易平台，商品图带售后举证属性；30 天覆盖售后周期，规模仅 26 文件，占用无压力 |

### 14.C 物理 GC 触发方式（是否废除"孤儿自动物理删"）

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 软删即时 + 异步 GC 只清过期回收站，**从不自动判孤儿物理删** |
| 小公司 | 定时扫孤儿直接物理删（**本次踩雷模式**） |
| 游戏/活动 | 版本下线/活动结束触发 |
| 二手/交易平台 | 只有显式删进回收站；定时只清过期回收站项 |
| **本项目最适合** | **(a) 落地废除：孤儿只软删进回收站，物理删只清"过期 30 天的回收站项"** | 与 §13-C、原 §六决策5**一致**。本次事故根因正是"定时任务自作主张物理删在用图"，制度性根治；技术债最小 |

### 14.D 动态 WebP 衍生物治本（⚠️ 按你取向，建议从 §13 的 A1 改为 A2）

| 公司类型 | 设计 | 特征 |
| --- | --- | --- |
| 大厂（阿里/腾讯/美团） | 原图唯一真相源 + **按需裁剪 + CDN 缓存**，删原图发 CDN purge 兜一致性 | 按需，靠 CDN purge 删干净 |
| 小公司/SaaS | 上传预生成固定几档存库，删除照档清 | 预生成，简单可控 |
| 游戏公司 | 离线全预生成 + 打包分发 | 全预生成 |
| 活动策划 | 预生成 banner/缩略几档 | 预生成 |
| 虚拟物品/二手平台 | 上传预生成 + **DB 登记每档 key 清单**，删除照单清 | 预生成 + 登记，删得净 |
| **本项目最适合** | **A2 彻底：上传时一次性预生成全部固定档(含小程序用的宽度档)并登记进 `thumbnail_keys`，废除运行时 `getOrCreateResizedImage` 按需生成 + 回写路径** | **与 §13-D 推荐(A1)不同**——因为你明确"愿重投入 + 长期债最小"。A1(按需+登记)仍保留运行时裁剪这套"会冒出衍生物"的机制,本质是给技术债打补丁;**A2 直接铲掉"按需生成"这片土壤**,与大厂"按需"的关键区别是你**无 CDN purge 兜底**(实测),所以大厂模式不适用,只能选二手/游戏的"预生成+登记"。这是无 CDN 项目的标准答案,也是真正的治本 |

> A2 的成本(你已表示愿投入):①改 `uploadImageWithThumbnails` 多生成几档 WebP;②改图片代理 `routes/v4/images.js` 去掉 `?width=` 走 `getOrCreateResizedImage` 的分支,改为直接按预生成档 key 取;③回填存量 26 张(`batchOptimize` 跑一遍);④删除逻辑照 `thumbnail_keys` 全清。一次性做完后,**再无"运行时冒出来删不到"的衍生物**,长期零债。

### 14.E 预生成档位(⚠️ 按你取向,建议从 §13 的"不改"改为"改成宽度档")

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 不固定档,URL 带任意 width 实时裁 + CDN |
| 小公司/SaaS | 固定 2~3 档正方裁剪 |
| 游戏 | 按 UI 槽位固定几档 |
| 活动策划 | banner + 列表缩略 2 档 |
| 二手/电商 | **按前端真实展示位固定 3~4 档"宽度档"**(竖图商品按宽度而非正方) |
| **本项目最适合** | **改成宽度档 `w375 / w750 / w1080`(覆盖 1/2/3 倍屏),废除旧正方 `small(150)/medium(300)/large(800)`** | **与 §13-E 推荐(不改)不同**——你既然要 A2 一次性重做,顺带把档位一次性对齐到原 §六参数a 的拍板值(375/750/1080)最划算,避免"先沿用旧档、将来再迁"的二次成本。商品多为手机竖图,宽度档比正方裁剪更贴合,长期最不需要再动 |

> D 选 A2 + E 改宽度档 是**同一次施工**,绑定推进性价比最高(都要改上传链 + 回填存量,合并做只回填一次)。这也正好把原 §六决策3 + 参数a 的拍板真正落地(C5 指出代码从未改)。

### 14.F 缺原图核对(N3)实现方式

| 公司类型 | 设计 |
| --- | --- |
| 大厂 | 异步对账任务 + 落库标记,看板读标记 | 
| 小公司 | 用时实时探测 | 
| 游戏/活动 | 资源校验随版本构建做 | 
| 二手/电商 | 规模小实时探测,规模大转异步对账 | 
| **本项目最适合** | **实时逐个 `headObject` 探测(当前仅 26 文件)** | 与 §13-F 推荐**一致**。规模极小,实时最简、零新表;真长大了(上千张)再加异步对账落库标记。现在做异步是过度设计 |

### 14.7 最终拍板汇总（一次性投入版，已定稿）

| 项 | 早期推荐(省成本) | **✅ 定稿(长期债最小,你的取向)** | 是否升级 |
| --- | --- | --- | --- |
| A 外键统一 | 全 RESTRICT | **全 RESTRICT + 应用层双保险** | 不变 |
| B 保留期 | 30 天 | **30 天(改代码对齐)** | 不变 |
| C 废除孤儿物理删 | 落地(a) | **落地(a)** | 不变 |
| D 动态 WebP | A1 最小改动 | **A2 彻底(废按需生成)** | ✅ 升级 |
| E 档位 | 不改 | **改成 w375/w750/w1080** | ✅ 升级 |
| F 缺原图核对 | 实时 head | **实时 head** | 不变 |

> 定稿一句话:**A/B/C/F 维持,D 升级到彻底方案 A2、E 一并改宽度档**——这正好让原 §六/§6.1 已拍板的"废除按需生成 + 375/750/1080 档位"真正落地(C5 指出文档拍了、代码没动)。全部基于现有 sharp + Sealos + `thumbnail_keys` JSON + Sequelize 迁移,**零新框架、零新表**(仅一支外键规则迁移 + 存量回填脚本)。
>
> ✅ 已定稿,下一步按 §十二出可落地的完整代码 diff(待你说"开始施工")。**施工前不动代码**。

---





