# 自由定制饰品设计台（diy-lite）· 前端接口需求（给后端）

> 面向对象：后端数据库开发同学
> 提出方：微信小程序前端
> 目的：diy-lite（业务名「自由定制饰品」）已升级为**唯一生产设计台**（模板/珠子/作品/支付全部走 `/api/v4/diy/` 现有接口；旧版工作台 diy-design 入口已关闭、归档仅作参考）。本文档余下诉求为：请后端**补充展示/渲染字段与业务规则**，让生产页展示完整。
> 现状核对时间：2026-07-10（以本项目 `utils/api/diy.ts` 与 `typings/api.d.ts` 现有定义为准）

---

## 0. 背景与结论（先说要点）

- 前端已完成 diy-lite「自由定制饰品」设计台（选款式、串珠/镶嵌双模式、立体渲染、拖拽换位/删除、伪3D、尺码容量、拍照、保存草稿/完成设计、分享等），**功能完整**，为全站唯一设计台（旧版 diy-design 已归档）。
- 前端近期还补齐了一批交互/观感增强（惯性旋转、多层珠体阴影、异形珠轮廓剪影阴影、WebAudio 合成音效、DOM 飞入动画、转一圈展示、实时数量引导文案、四 Tab 使用指南、五行雷达图骨架），**均为纯前端实现，不新增后端依赖**；其中「五行雷达图」需后端下发五行字段才能出数据（见 2.3）。
- 前端近期又对齐了工作台（diy-design）的一批能力到 diy-lite：**撤销/重做 30 步历史栈、手串珠子多选批量删除、分享还原设计、登录鉴权、售罄禁购（stock===0）、素材类型 Tab（饰品/配饰/吊坠）**。**配饰/吊坠 Tab 当前显示空态**，素材需后端提供（见第 10 节）。
- **diy-lite 已完成生产化切换（2026-07-10）**：入口流程为「自由定制饰品 → 款式选择页（`GET /diy/templates` 按 category_id 分类展示）→ 选定款式带 templateId 进设计台」；按模板 `layout.shape` 自动切换**串珠/镶嵌双模式**；珠子走 `GET /diy/templates/:id/beads`；尺码/容量走 `sizing_rules`/`bead_rules`/`capacity_rules`；保存草稿与完成设计走 `POST /diy/works` → diy-result 结果页 → 支付三步状态机；分享带 `workId` 走 `GET /diy/works/:id` 还原。本地 storage 仅作"编辑现场保护"（与 diyStore 缓存同策略）。
- 前端提供**本地演示模式**（三类触达路径）：① 款式选择页的**串珠本地演示卡片**——「手串」`local=1`、「108佛珠」`local=7`（大围长档位：54颗×8mm/108颗×6mm/108颗×8mm，与五行雷达图玩法契合）；② 款式选择页的**五张镶嵌本地演示卡片**（2026-07-10 新增）——「托帕石项链」`local=2`、「主石戒指」`local=3`、「水滴吊坠」`local=4`、「一对耳钉」`local=5`（双槽位）、「手机链包挂」`local=6`（三珠位）：各带一张空托底图 + 3 颗可换宝石（共用），走与后端镶嵌模板完全相同的渲染链路，供业务方直观预览"图片到位后镶嵌模式的最终效果"（见 10.3）；③ 后端不可用时设计台自动兜底切换（toast 告知原因，重新进入页面即重试后端）。数据源为 `bead-data.ts`（27 颗珠子 + 演示模板/宝石）+ `assets/` 实拍与演示图。原页面顶部的"本地演示数据"横幅已按业务反馈移除（2026-07-10 UI 优化，纵向空间让给舞台）；**本地模式下保存/下单仍被禁用**（点击时弹窗明确告知是演示数据，不伪造业务提交），款式选择页的演示卡片也均带"本地演示 · 演示价不可下单"标注，数据来源对用户依然透明。演示数据中的寓意/能量/搭配文案与手围口径可供后端录入素材时参考（见第 2 节与第 5 节）。
- ⚠️ **请后端优先确认四件事（2026-07-10 真机实测发现）**：
  1. `GET /diy/templates` 返回中**没有 `layout.shape ≠ 'slots'` 的已发布串珠模板**（列表只有一个吊坠镶嵌款"项链12"），请发布至少一个串珠模板并挂上珠子素材；
  2. 镶嵌模板"项链12"下存在 **`price` 为 0 的珠子素材**（真机填槽后费用显示"0 星石"），请核对 `diy_materials` 表该素材价格是否漏录；
  3. 模板的 **`preview_media` 预览图未配置**（款式选择页缩略图空白），请为已发布模板上传预览图；
  4. 镶嵌模板"项链12"**缺 `base_image_media` 底图，其宝石素材（如"海蓝宝"）缺 `image_media` 图片**——真机上舞台渲染成"金色水滴 + 纯色圆"的几何占位图，观感远差于串珠模式。**只需普通 2D 图（无需 3D）**：一张"空托"底座图 + 每颗宝石一张顶视图，前端零改动即可达到商品实拍级效果（规格见 4.1，坐标语义与样例见 10.3）。
- 珠子的**寓意/克重/能量/搭配/材质档位/五行**等展示字段后端尚未下发，前端按"缺失即隐藏/空态"处理，等后端补字段后自动显示（无需改前端）。**【状态更新 2026-07-10：✅ 10 个展示字段已迁移落库并随接口下发，21 颗素材文案已种子，见 13.1-A/F】**
- **本需求不是从零建接口**，而是：① 复用现有接口（已接完）；② 请后端在 `DiyBead` 上**补充 6 个渲染/展示字段**（material_type/meaning/weight/energy/pairing/five_elements）；③ 补充异形珠几何元数据；④ 明确几项业务规则由后端下发。

> 约定：全部字段 `snake_case`；主键 `{table}_id`；金额/库存/规则等业务数据以后端为准，前端不做本地计算与默认值。

---

## 1. 复用的现有接口（无需改动，前端已对接）

| 用途          | 方法与路径                            | 说明                                                      |
| ------------- | ------------------------------------- | --------------------------------------------------------- |
| 珠子素材列表  | `GET /api/v4/diy/templates/:id/beads` | 支持 `group_code`/`diameter`/`keyword`/`slot_id` 查询参数 |
| 材料分组      | `GET /api/v4/diy/material-groups`     | 返回 `[{ group_code, count, sample_name }]`               |
| 模板详情      | `GET /api/v4/diy/templates/:id`       | 含 `bead_rules`/`sizing_rules`/`capacity_rules`           |
| 保存作品/草稿 | `POST /api/v4/diy/works`              | 正式版替换前端"本地草稿"（见第 9 节）                     |
| 作品详情/还原 | `GET /api/v4/diy/works/:id`           | 正式版替换前端"本地还原"、支撑分享还原（见第 9 节）       |

✅ 已完成：diy-lite 珠子列表已改为调用 `getDiyTemplateBeads()`。本地 `bead-data.ts` 仅作为「本地演示模式」数据源与后端录入素材的样例参考，**生产链路不依赖它**。

---

## 2. 需要后端在 `DiyBead` 上补充的字段（核心需求）

现有 `DiyBead`（见 `typings/api.d.ts` 第 2488 行）已有：`diy_material_id / material_code / display_name / material_name / group_code / diameter / shape / price / price_asset_code / stock / image_media / sort_order / is_enabled`。

diy-lite 的渲染与详情展示还需要以下字段，请后端补充下发：

| 需补充字段      | 类型        | 用途                                             | 缺失时前端影响                                   |
| --------------- | ----------- | ------------------------------------------------ | ------------------------------------------------ |
| `material_type` | string 枚举 | 珠子立体渲染的材质光影档位                       | 缺失则统一按水晶渲染，金属/玉石/哑光质感无法区分 |
| `meaning`       | string      | 珠子详情弹窗的寓意文案                           | 缺失则详情无寓意介绍                             |
| `weight`        | number      | 珠子参考克重（详情展示）                         | 缺失则详情不显示重量                             |
| `energy`        | string      | 珠子详情的「能量属性」文案（如"财富·活力"）      | 缺失则详情不显示能量属性                         |
| `pairing`       | string      | 珠子详情的「搭配建议」文案（如"搭配白水晶提亮"） | 缺失则详情不显示搭配建议                         |

> `energy` / `pairing` 是提升"选珠像了解一件宝贝"体验的软性运营文案，可按珠子或按分类维度提供。生产页对缺失字段按"隐藏该行"处理，不做前端兜底。
> 📦 **文案与口径样例**：离线演示时期的 27 颗珠子完整样例（寓意 `MEANING_MAP`、能量/搭配 `CATEGORY_ATTR`、材质档位 `MATERIAL_MAP`、克重估算 `estimateWeight`，水晶密度 2.65g/cm³ 球体积公式）已归档在 `packageDIY/diy-lite/bead-data.ts`，后端录入素材数据时可直接参考取用。

### 2.1 `material_type` 取值约定（请后端在此集合内取值）

用于前端 Canvas 立体高光参数选择：

| 值        | 含义             | 视觉表现                |
| --------- | ---------------- | ----------------------- |
| `crystal` | 通透水晶（默认） | 大而亮的高光 + 底部反光 |
| `stone`   | 玉石/奶体        | 柔和高光，温润          |
| `metal`   | 金属/刻面镜面    | 小而锐的高光            |
| `matte`   | 哑光/不透光      | 几乎无高光，漫反射      |

> 若后端暂不能提供，前端会按 `crystal` 兜底，但会丢失材质差异，建议纳入。

### 2.2 `weight` 单位与口径

- 单位：**克(g)**，保留 1 位小数。
- 口径：请明确是"单颗珠子净重"还是"含配件"。前端仅做展示，不参与计算。

### 2.3 五行属性字段 `five_elements`（用于「五行雷达图」玩法，可选但推荐）

前端已实现"五行分析"玩法（借鉴同类竞品）：底部工具栏「五行」按钮打开弹窗，统计整串珠子的金/木/水/火/土占比，用 **Canvas 手绘雷达图** 展示（前端已完成绘图逻辑，不依赖第三方图表库），作为水晶电商的运营卖点。该玩法**完全依赖后端下发每颗珠子的五行属性**，前端不做任何五行判定（属命理/业务数据，前端无权威依据，不能写死）。

| 需补充字段      | 类型        | 用途           | 缺失时前端影响                                       |
| --------------- | ----------- | -------------- | ---------------------------------------------------- |
| `five_elements` | string 枚举 | 珠子的五行属性 | 缺失则「五行雷达图」弹窗显示空态提示，无法呈现雷达图 |

`five_elements` 取值约定（请后端在此集合内取值，单值或用逗号分隔的多值）：

| 值      | 含义 |
| ------- | ---- |
| `metal` | 金   |
| `wood`  | 木   |
| `water` | 水   |
| `fire`  | 火   |
| `earth` | 土   |

> 说明：一颗珠子可对应一个或多个五行（如某些珠子兼具水火）。若多值，请用逗号分隔（如 `water,wood`）。前端仅按后端返回值统计占比与绘图，不自行推断珠子的五行归属。**此字段未下发前，前端「五行」弹窗显示空态文案「五行数据待后端提供」，绝不使用假数据填充**（前端已按此实现）。

---

## 3. 异形珠（管珠/药片等）渲染所需元数据（重要）

现有 `shape` 字段（circle/ellipse/oval/square/heart/teardrop）**不足以支撑异形珠的正确摆放**。前端渲染异形珠时需要知道它在手串上的真实几何与朝向，否则只能靠前端猜测（当前离线演示就是猜的）。

请后端为异形珠提供：

| 字段               | 类型        | 说明                                                                                        |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------- |
| `size_length_mm`   | number      | 实物长边（mm），如跑环 14.5                                                                 |
| `size_width_mm`    | number      | 实物短边（mm），如跑环 4.5                                                                  |
| `bore_orientation` | string 枚举 | 穿绳方向：`along_length`(绳穿长轴，如管珠) / `along_width`(绳穿短边，如药片) / `none`(圆珠) |
| `image_bbox_ratio` | number      | 实拍图去透明后"宽:高"比例（如药片 0.5、跑环 0.28），用于按真实比例绘制                      |

> 若这些拿不到，前端只能对异形珠做近似摆放（朝向可能不准），建议随实拍图一并录入。圆珠（shape=circle）不需要这些字段。

---

## 4. 图片要求（image_media）

- 现有 `image_media.public_url` 已满足加载。前端加载器**同时支持** `http(s)://` 与包内本地路径，可无缝切 CDN。
- 请确认珠子图为**带透明通道的 PNG/WebP、实物居中**（异形珠依赖透明区域计算真实边界）。
- 几百种珠子请走 **CDN**，前端已做超时兜底与失败降级。

### 4.1 镶嵌模板的底图与宝石图规格（2026-07-10 新增，⚠️ 镶嵌模式观感的决定性因素）

镶嵌模式的渲染链路是「后端底图铺满画布 + 宝石图按槽位坐标裁剪贴上」，**全部为普通 2D 图，不需要 3D 建模/渲染**（串珠模式好看也只是因为 27 张珠子实拍 PNG 自带光影）。请为每个镶嵌模板提供两类图：

| 图类型                                | 存放字段                        | 规格要求                                                                                                                             |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 底座图（吊坠托/戒指托/项链空托）      | 模板 `base_image_media`         | 商品实拍或渲染图均可；**宝石槽位必须留空**（空爪/空凹槽，不能带任何宝石，否则换浅色宝石会透出底色）；尺寸与 `layout.background_width/height` 一致 |
| 宝石图（每颗可换宝石一张）            | 素材 `image_media`              | **顶视图**（正对台面拍/渲染）；**透明底 PNG/WebP 优先**（圆形宝石可接受白底，前端圆形裁剪可去白角；心形/椭圆等异形必须透明底，否则露白）；实物居中占满画幅 |

- 加载降级链（前端已实现）：底图 `thumbnails.large → public_url`；宝石图 `thumbnails.medium → public_url`；均缺失时才落到几何占位画法（前端已把占位画法精致化，但仍明显不如真图）。
  ⚠️ **后端核对更正（2026-07-10，见第 11.7 节）**：后端 `media_files` 的衍生图档位是 **`w375 / w750 / w1080`**（宽度档 WebP），且用户端接口当前只下发 `public_url`（虚拟字段）与 `thumbnail_keys`（对象存储 key，非 URL），**不存在 `thumbnails.large / thumbnails.medium`**。前端降级链需改为 `thumbnails.w750 → public_url`（待后端按 11.5-D 切换 `toSafeJSON` 输出后生效），当前先直接用 `public_url`。
- 前端已用 AI 生成**五套空托底图（项链/戒指/吊坠/耳钉对/手机链）+ 3 颗宝石**验证过整条链路（见 10.3 本地镶嵌演示），换宝石效果达到商品图水准，可证明**图片到位 = 效果到位，前端零改动**。验证图在 `packageDIY/diy-lite/assets/`：底图 `demo-necklace-base.jpg` / `demo-ring-base.jpg` / `demo-pendant-base.jpg` / `demo-earrings-base.jpg` / `demo-charm-base.jpg`，宝石 `demo-gem-blue/pink/green.jpg`，后端可直接取用作为镶嵌模板的测试素材。多槽位（耳钉 2 槽、手机链 3 槽）同样已验证，填完一槽自动跳下一空槽。

---

## 5. 手围/戴法/容量规则（业务需求，请后端通过 sizing_rules 体系下发）

> ✅ **已裁决（2026-07-10，见 11.8-①）：容量口径采用后端现有颗数制**（`size_options[].bead_count` + `capacity_rules.min_beads/max_beads`），不引入 `circumference_mm`、手围滑块与圈数模型。本节的手围/圈数/毫米容量口径**作废**，仅作本地演示模式与后端未来设计 `display` 文案（如"约17cm"）的参考。前端适配见 11.7-3。

**现状（2026-07-10 生产化后）**：前端已改用模板的 `sizing_rules.size_options` 尺码模型（容量 = `circumference_mm - bead_rules.margin`，缺 `circumference_mm` 时降级 `bead_count × default_diameter`）。原离线演示的「手围滑块 + 戴法圈数」模型已从生产链路移除，其业务口径保留在 `packageDIY/diy-lite/bead-data.ts` 的 `LOCAL_TEMPLATE`（本地演示模式的尺码选项即按此口径生成，含 27 颗样例珠子数据与 assets/ 27 张实拍图）。

**离线演示时期验证过的业务口径（供后端设计 sizing_rules 时参考）**：

- 可选手围范围：**10~22cm**（滑块步进 1cm）
- 戴法圈数：**单圈×1 / 双圈×2 / 三圈×3**（绳长倍率）
- 容量公式：**容量(mm) = 手围(cm) × 10 × 圈数**（珠子沿绳尺寸累加 ≤ 容量）
- **108 佛珠/念珠围长档位**（2026-07-10 本地演示已验证，见 `bead-data.ts` 的 `LOCAL_MALA_TEMPLATE`）：按"颗数 × 珠径"给档——54颗×8mm=432mm / 108颗×6mm=648mm / 108颗×8mm=864mm，同一 `circumference_mm - margin` 容量公式即可复用，串珠渲染引擎对大围长无需改动

请后端确认以下规则如何在 `sizing_rules` / `capacity_rules` 中表达：

| 规则                  | 期望来源                                     | 说明                                                                                                                                                              |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可选手围范围（cm）    | 后端下发                                     | 参考口径 10~22cm；建议映射为 size_options 尺码档位或提供连续范围                                                                                                  |
| 戴法圈数              | 后端下发                                     | 单/双/三圈及对应绳长倍率（参考口径 ×1/×2/×3）；若业务保留多圈玩法请在 sizing_rules 中表达                                                                         |
| 绳长容量算法          | 后端明确                                     | 参考口径 `手围×10×圈数(mm)`；当前前端按 `circumference_mm - margin` 实现，请确认权威公式                                                                          |
| 弹性余量              | `bead_rules.margin`（已有）                  | 行业标准约 10mm                                                                                                                                                   |
| 最少/最多珠数         | `capacity_rules.min_beads/max_beads`（已有） | 前端据此限制加珠与提交                                                                                                                                            |
| 圆珠/异形沿绳占位比例 | 后端下发（可选）                             | 参考同类实现：圆珠与异形（管珠/药片）占用绳长的换算比例可不同（如圆珠按直径、异形按穿绳方向的边）。若后端有权威比例请下发，否则前端按 `bore_orientation` 自行取边 |

> 前端诉求：给出"容量如何由尺码/手围换算"的权威口径，前端严格按此实现，不再自行估算。

---

## 6. 前端不需要、请勿下发的（避免泄密）

按数据最小化与防抓包原则，以下**不要**下发到前端：

- 珠子**成本价、进货价、利润**等内部定价数据（前端只需展示售价 `price`）。
- 库存的**精确数量**（若涉及商业机密）；前端只需"是否有货"即可，可用 `stock: -1` 表无限、`0` 表无货、正数表有货，无需真实库存量。
- 供应商、内部编码等后台字段。

> 如果某字段可能涉及商业机密，请在对接时告知，由业务方决定是否下发。

---

## 7. 字段对应关系（供后端理解前端如何用；✅ 切换已完成）

页面已直接消费后端字段（左列为归档演示数据中的同义字段，供后端对照理解语义与录入参考）：

| 归档演示数据字段（bead-data.ts，仅参考） | 生产页实际使用的后端字段                                    | 后端现状                           |
| ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `price`                                  | `DiyBead.price` + `price_asset_code`                        | ✅ 已有，已接入                    |
| `diameter`                               | `DiyBead.diameter`                                          | ✅ 已有，已接入                    |
| `material`(4档)                          | `DiyBead.material_type`                                     | ❌ 待补（见 2.1）                  |
| `meaning`                                | `DiyBead.meaning`                                           | ❌ 待补（见第 2 节）               |
| `weight`                                 | `DiyBead.weight`                                            | ❌ 待补（见 2.2）                  |
| `energy`                                 | `DiyBead.energy`                                            | ❌ 待补（见第 2 节）               |
| `pairing`                                | `DiyBead.pairing`                                           | ❌ 待补（见第 2 节）               |
| `five_elements`(暂空)                    | `DiyBead.five_elements`（五行雷达图用）                     | ❌ 待补（见 2.3）                  |
| 手围/圈数/容量模型                       | `sizing_rules` / `bead_rules` / `capacity_rules` + 容量公式 | ⚠️ 已接入，公式待确认（见第 5 节） |
| 本地 assets 图片                         | `image_media.public_url`（CDN）                             | ✅ 已有，已接入                    |

---

## 8. 需要后端确认/回复的问题清单

1. `DiyBead` 能否补充 `material_type` / `meaning` / `weight` / `energy` / `pairing` 五个字段？各自数据来源与录入方式（按珠子还是按分类）？
2. `DiyBead` 能否补充 `five_elements`（五行）字段？数据来源与录入方式（按珠子还是按分类）？枚举取值是否采用 `metal/wood/water/fire/earth`、多值逗号分隔？
3. 异形珠的 `size_length_mm` / `size_width_mm` / `bore_orientation` / `image_bbox_ratio` 能否随素材录入并下发？
4. 珠子图片是否为"带透明通道、实物居中"的规范图？CDN 地址与命名规范？
5. 绳长容量的权威换算公式是什么？以 `sizing_rules`/`capacity_rules` 下发还是新增字段？
6. 库存对前端的暴露口径（是否可只给"有货/无货"而非精确数量）？
7. 是否有字段涉及商业机密、需要脱敏或不下发？
8. 草稿保存/还原与分享还原，是否直接用现有 `POST /diy/works` + `GET /diy/works/:id`？作品数据结构 `design_data` 的字段约定？（见第 9 节）
9. 素材大类 `item_type`（珠子/配饰/吊坠）能否提供？与材质档位 `material_type` 为两个独立字段（见 10.1）。
10. 购物车/报价/支付的下单闭环接口口径（见 10.2）；镶嵌模板 `slot_definitions` 是否可下发、坐标语义是否按 10.3.1 口径录入（见 10.3）。
11. 数据核对四件事（第 0 节 ⚠️）：发布串珠模板；核对"项链12"下 `price=0` 的素材；为已发布模板补 `preview_media` 预览图；**为镶嵌模板补 `base_image_media` 空托底图与宝石 `image_media`（规格见 4.1，样例图前端已备好可直接取用）**。
12. **品类扩展建议（前端已具备渲染能力并有本地演示可真机预览）**：是否规划新增分类——耳饰（镶嵌 2 槽位，演示暂用 category_id 195）、手机链/包挂（镶嵌 3 珠位，暂用 196；量产版也可走串珠 `line` 形状排珠，渲染引擎已支持）、108 佛珠/念珠（串珠大围长档位，暂用 197，与五行/寓意玩法高度契合）？若立项，仅需后端建分类 + 录模板/素材，前端零改动。
13. 镶嵌模板的槽位坐标由谁标注、如何录入（标注口径与校验方法见 10.3.3）？模板量大后是否在后端管理台做"点图标注"小工具（上传底图点选槽位自动算归一化坐标）？

---

## 9. 草稿保存 / 作品还原 / 分享（✅ 已接后端作品体系）

| 功能     | 前端现状（已上线实现）                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| 保存草稿 | 「保存草稿」按钮 → `POST /api/v4/diy/works`（登录鉴权 + 幂等键）                                    |
| 完成设计 | 「完成设计」按钮 → `POST /api/v4/diy/works` → 跳 diy-result 结果页（费用明细）→ 支付三步状态机      |
| 进入还原 | 链接带 `?workId=xxx` 时 `GET /api/v4/diy/works/:id` 拉取 `design_data` 还原（串珠/镶嵌双模式均在 diy-lite 内还原，镶嵌按 `fillings` 逐槽回填） |
| 分享好友 | 已保存过作品分享路径带 `?workId=xxx`；未保存过分享落地页                                            |
| 现场保护 | 本地 storage 存 material_code + 尺码（按模板隔离、7 天过期），防误退丢失，提交成功后清除            |

`design_data` 字段沿用与 diy-design 相同的约定，按模式二选一：

- 串珠：`{ mode:'beading', selected_size, beads:[{ slot_index, material_code, diameter }] }`
- 镶嵌：`{ mode:'slots', fillings: { [slot_id]: { material_code } } }`（还原时按 `material_code` 匹配素材库逐槽回填）

仍需后端确认：

- `GET /diy/works/:id` 对**非作者**是否可读（分享还原场景需要）。
- 作品预览图：分享卡片若要显示手串缩略图，需要作品的 `preview_media`，前端可在保存时用 Canvas 导出图上传，请确认上传通道。
- `size_options` 是否提供 `circumference_mm`（周长mm）字段：前端容量公式为 `circumference_mm - bead_rules.margin`，缺失时降级为 `bead_count × default_diameter` 估算（与 diyStore.maxDiameter 同口径），建议补齐避免估算误差。
  ✅ **已裁决（11.8-①）：不提供 `circumference_mm`**，容量权威口径 = 当前尺码 `bead_count`（颗数制），前端删除毫米换算逻辑（见 11.7-3）。
- `GET /diy/works/:id` 非作者可读性：✅ **已裁决（11.8-②）：放开非作者只读脱敏版**（仅 frozen/completed，见 11.5-E）。
- 作品预览图上传通道：✅ 已确认存在——`POST /api/v4/user/images/upload`（multipart `image` 字段，2MB 上限，登录即可用），保存作品时把返回的 `media_id` 传入 `preview_media_id` 即可，后端无需新开通道。

---

## 10. 素材类型 Tab 与下单闭环（新增需求）

### 10.1 配饰 / 吊坠素材（素材类型 Tab 依赖）

前端已按工作台（diy-design）的信息架构在 diy-lite 增加「饰品 / 配饰 / 吊坠」三个素材类型 Tab。当前仅「饰品（珠子）」有素材，**配饰与吊坠 Tab 显示空态提示「素材待后端提供」**（前端绝不用假素材填充）。请后端确认：

1. `DiyBead`（或独立素材表）能否增加 **`item_type`** 字段区分素材大类：`beads`（珠子）/ `accessories`（配饰，如隔片/佛头/流苏）/ `pendants`（吊坠）？
   ⚠️ 命名说明：**`item_type`（素材大类）与第 2.1 节的 `material_type`（材质光影档位 crystal/stone/metal/matte）是两个不同的业务概念**，请勿共用一个字段，避免语义混淆。
2. 配饰/吊坠是否走同一个 `GET /api/v4/diy/templates/:id/beads` 接口（加 `item_type` 查询参数），还是单独接口？
3. 配饰/吊坠的几何字段（沿绳占位、穿绳方向）与第 3 节异形珠元数据是否同一套？

### 10.2 下单闭环（✅ 已走「保存作品→结算」模式）

diy-lite 已移除演示购物车，改为与工作台一致的生产闭环：**完成设计 → `POST /diy/works` → diy-result 结果页（按 `price_asset_code` 分组的费用明细）→ confirm 冻结 → complete 铸造**。费用展示用后端下发的珠子 `price`/`price_asset_code` 前端汇总，**权威计价仍以 confirm 时服务端计算为准**（现有后端逻辑已覆盖）。若业务后续需要独立"购物车"（多串暂存），请后端评估是否新增购物车接口。

### 10.3 镶嵌/槽位模式（✅ 已在 diy-lite 实现，2026-07-10）

diy-lite 已支持「镶嵌模式」：模板 `layout.shape === 'slots'` 时自动切换到底图+槽位渲染（复用 shape-renderer 组件与 diyStore 槽位状态机），支持填槽（`allowed_diameters/allowed_shapes/allowed_group_codes` 三重约束校验 + 不匹配珠子置灰）、清空、替换、槽位交换、撤销/重做、草稿缓存、workId 分享还原、提交 `design_data:{mode:'slots', fillings}`。**依赖后端**：镶嵌模板需带 `slot_definitions`（槽位归一化坐标/尺寸/约束）与 `base_image_media` 底图（图片规格见 4.1）；缺底图时前端画几何占位。

#### 10.3.1 `slot_definitions` 坐标语义（⚠️ 后端录入槽位时请严格按此口径）

前端渲染换算（`shape-renderer._drawSlotOverlay`）已固定为以下语义，请录入数据时对齐：

| 字段                  | 语义                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `x` / `y`             | 槽位**中心点**坐标，**归一化 0~1**（相对底图原始宽/高，不是像素、不是左上角）                                    |
| `width`               | 槽位宽，**相对底图宽**的归一化值                                                                                  |
| `height`              | 槽位高，**相对底图高**的归一化值。⚠️ 宽高分母不同：竖幅底图上的**圆形槽两值不相等**（如 2:3 底图上 0.15 宽 ≙ 0.10 高） |
| `slot_shape`          | `circle` / `oval` / `square` / `rectangle`（空槽位轮廓与宝石裁剪形状）                                            |
| `layout.background_width/height` | 底图原始像素尺寸（前端据此保持宽高比铺满画布）                                                          |

#### 10.3.2 可直接套用的模板样例（前端已本地验证跑通）

前端已在款式选择页提供五个镶嵌本地演示入口（`diy-lite?local=2/3/4/5/6`，项链/戒指/吊坠/耳钉对/手机链），用下面这份结构 + 4.1 提到的演示图完整跑通了"底图 + 换宝石"链路（数据定义在 `packageDIY/diy-lite/bead-data.ts` 的 `LOCAL_SLOT_TEMPLATES` / `LOCAL_SLOT_GEMS`，可作为后端录入镶嵌模板的直接参考）。各模板槽位坐标（`height` 均为 `width × 2/3`，因底图为 640×960 竖幅）：

| 演示模板       | 槽位坐标（x, y, width）                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| 项链（1 槽）   | main `(0.51, 0.672, 0.15)`                                                                   |
| 戒指（1 槽）   | main `(0.505, 0.285, 0.17)`                                                                  |
| 吊坠（1 槽）   | main `(0.49, 0.605, 0.28)`                                                                   |
| 耳钉对（2 槽） | left `(0.295, 0.565, 0.24)`，right `(0.705, 0.565, 0.24)`                                    |
| 手机链（3 槽） | top `(0.502, 0.362, 0.145)`，middle `(0.499, 0.521, 0.145)`，bottom `(0.502, 0.666, 0.145)` |

以项链为例的完整 layout 结构：

```json
{
  "display_name": "托帕石项链",
  "category_id": 192,
  "layout": {
    "shape": "slots",
    "background_width": 640,
    "background_height": 960,
    "slot_definitions": [
      {
        "slot_id": "main",
        "label": "主石",
        "slot_shape": "circle",
        "x": 0.51,
        "y": 0.672,
        "width": 0.15,
        "height": 0.1,
        "required": true,
        "allowed_diameters": [],
        "allowed_shapes": [],
        "allowed_group_codes": []
      }
    ]
  }
}
```

> 该演示证明：后端只要把**空托底图**（`base_image_media`）与**宝石顶视图**（`image_media`）按 4.1 规格录入，镶嵌模式即达到商品图级观感，**前端零改动**。本地演示模式下保存/下单仍被禁用，不影响生产链路。

#### 10.3.3 槽位坐标的标注方法（录入模板时的一次性人工动作）

**分工约定：底图和槽位坐标是一对，都由后端数据库下发；前端是纯执行者（只做比例换算和贴图），自己不猜位置。** 标注每张底图只需做一次，之后不管上多少颗新宝石素材都自动落位。

**手工标注口径**（用任何看图工具量出像素值，除以图片宽高即归一化值）：

```text
x      = 槽中心像素X ÷ 底图宽     例: 326 ÷ 640 = 0.51
y      = 槽中心像素Y ÷ 底图高     例: 645 ÷ 960 = 0.672
width  = 槽直径像素 ÷ 底图宽      例:  96 ÷ 640 = 0.15
height = 槽直径像素 ÷ 底图高      例:  96 ÷ 960 = 0.10   ← 圆形槽宽高分母不同，两值不相等
```

**校验方法**（前端做本地演示时即按此流程收敛坐标，通常一两轮即可严丝合缝）：先按估值录入 → 在设计台填入一颗宝石看落点 → 偏了微调数值再看。前端也可提供"合成脚本"协助批量校验（本次演示的 8 个槽位均按此法校准）。

**建议（后续模板多了再做）**：后端管理台可加一个"点图标注"小工具——上传底图后在图上点击槽位中心、拖拽圈定大小，自动换算归一化值存库，替代手工除像素。是否立项请后端评估（见第 8 节问题 13）。

### 10.4 页面路径约定变更（⚠️ 请后端同步）

DIY 全部入口已统一到 `packageDIY/diy-lite/diy-lite`（旧工作台 diy-design 保留但不再作为入口）。**后端生成作品小程序码（`GET /diy/works/:id/qrcode`）时，扫码路径请使用：`/packageDIY/diy-lite/diy-lite?workId={diy_work_id}`**（原约定的 diy-design 路径作废）。

---

## 11. 后端审查结论与执行方案（2026-07-10，后端数据库项目回复 · 权威）

> 审查方法：直读后端当前代码（`models/DiyMaterial.js`、`models/DiyTemplate.js`、`models/DiyWork.js`、`services/diy/*`、`routes/v4/diy.js`、`routes/v4/console/diy/*`）+ 用 Node.js（mysql2 + `.env`）直连真实数据库 `restaurant_points_dev` 核对 `diy_templates` / `diy_materials` / `diy_works` / `categories` / `media_files` / `asset_group_defs` / `material_asset_types` 实际数据。不引用任何历史报告。
> 本节为权威裁决：**接口路径、响应格式、字段命名、业务规则一律以本节为准，前端（小程序 + web 管理后台）修改自身代码适配，不做映射层。**

### 11.1 后端技术框架事实（前端适配的基础）

- 技术栈：Node.js 20 + Express + Sequelize(MySQL) + Redis，路由体系 `/api/v4/diy/*`（用户端）与 `/api/v4/console/diy/*`（管理端），服务层 `services/diy/`（Template/Work/Material/AdminQuery/QRCode 五个子服务 + Facade）。
- 响应格式权威：所有接口经 `res.apiSuccess` 包装为 `{ success, code, message, data, request_id }`；`data` 为 Sequelize `toJSON()` 结果。`GET /diy/templates/:id/beads` 返回**数组、无分页、上限 200 条**。
- 图片体系权威：`media_files` 表 + Sealos 对象存储。对外字段为 `public_url`（虚拟字段，自动带 content_hash）与衍生图档位 **`w375 / w750 / w1080`**（宽度档 WebP）。**不存在 `thumbnails.large / thumbnails.medium`**——前端第 4.1 节的降级链写法基于猜测，须按 11.7 修改。
- 支付体系权威：定价货币仅限 `star_stone` 与源晶体系（`material_asset_types`，禁 `points`/`budget_points`，后端已强制校验）；**价格强制整数**（模型 + 服务层 + 管理台三层校验）。
- 分组体系权威：`group_code` 关联 `asset_group_defs`（现有 yellow/red/orange/green/blue/purple 等 10 组）。
- 状态机权威：模板 draft→published→archived（发布强制校验 `base_image_media_id` + `preview_media_id`）；作品 draft→frozen→completed/cancelled（confirm 服务端计价冻结、complete 铸造 items + 写 exchange_records 履约、cancel 解冻）。

### 11.2 真实数据库现状（第 0 节"四件事"核实结果）

| 前端反馈 | 数据库核实（2026-07-10 实测） | 定性 |
| --- | --- | --- |
| 没有已发布串珠模板 | ✅ 属实。全库 4 个模板：#1 经典串珠手链(circle)、#2 锁骨项链(ellipse) 均为 **draft**；#40 吊坠01(slots, draft)；仅 #65 项链12(slots) published | 运营数据问题（非代码问题） |
| "项链12"下有 price=0 素材 | ✅ 属实。`diy_material_id=27`「绿宝石01」price=0.00 且 is_enabled=1 | 运营数据问题 |
| 模板 preview_media 未配置 | ✅ 属实。4 个模板 `preview_media_id` 全部 NULL（#65 是在发布强校验上线前发布的存量数据） | 运营数据问题 |
| 镶嵌模板缺底图、宝石缺图 | ✅ 属实且更严重：#65 `base_image_media_id` NULL；**全库 21 颗素材 `image_media_id` 全部 NULL**（含已启用的 #12 绿幽灵、#17 海蓝宝、#27） | 运营数据问题 |

补充事实：素材 21 颗中仅 3 颗启用；`meta` 全为 NULL；`diy_works` 空表；DIY 分类现有 190(DIY_JEWELRY)/191手链/192项链/193戒指/194吊坠，**前端演示用的 195耳饰/196手机链/197佛珠 不存在**；#65 的 layout 槽位里混入了管理台编辑器写入的 `_previewMaterial` 脏数据（见 11.6）。

**结论：镶嵌链路"观感差"的根因 100% 是素材/图片数据没录，不是三端任何一端的代码缺陷。** 处理路径：管理台已具备全部录入能力（素材管理 `diy-material-management.html` 强制传图 + 自动裁透明边、模板管理 `diy-template-management.html` 发布强制校验双图、槽位标注器 `diy-slot-editor.html`），由运营在管理台补录即可，前端提供的演示图可直接取用。

### 11.3 第 8 节问题清单逐条裁决

| # | 问题 | 裁决 |
| --- | --- | --- |
| 1 | 补 `material_type/meaning/weight/energy/pairing` | ✅ 同意，在 `diy_materials` 加真实列（命名照采前端提议，符合项目 snake_case 规范，无需映射）。按珠子维度录入，管理台加表单项。见 11.5-A |
| 2 | 补 `five_elements` | ✅ 同意。`VARCHAR(50)`，取值 `metal/wood/water/fire/earth` 逗号分隔多值。按珠子录入。见 11.5-A |
| 3 | 异形珠几何字段 | ⚠️ 部分同意：加 `size_length_mm/size_width_mm/bore_orientation` 三列；**`image_bbox_ratio` 不加**——管理台上传素材图已带 `trim_transparent: true` 自动裁透明边，且 `media_files` 存有 `width/height`，前端直接用 `image_media.width / image_media.height` 计算，避免冗余字段失同步 |
| 4 | 图片规范/CDN | ✅ 已满足：Sealos 对象存储 + `public_url`（带 content_hash 缓存参数）+ w375/w750/w1080 衍生图；管理台上传即裁透明边。命名无需前端关心 |
| 5 | 容量权威公式 | ✅ **已决议（11.8-①）：颗数制为权威**——`sizing_rules.size_options[].bead_count`（S/M/L 各档固定颗数）+ `capacity_rules.min_beads/max_beads`。**不引入 `circumference_mm`、手围滑块、圈数概念**，前端删换算公式（11.7-3） |
| 6 | 库存暴露口径 | ✅ **已决议（11.8-③）：掩码**——用户端保持 -1 无限/0 售罄语义，正数一律压成 1（11.5-D 实现） |
| 7 | 商业机密字段 | `diy_materials` 表本就无成本/供应商字段。但 beads 接口当前把 MediaFile 整条下发（含 `object_key/uploaded_by`），将按 11.5-D 收敛为 `toSafeJSON` |
| 8 | 草稿/还原/分享接口 | ✅ 就用 `POST /diy/works` + `GET /diy/works/:id`。`design_data` 权威约定：串珠 `{mode:'beading', beads:[{material_code, diameter, ...}]}`、镶嵌 `{mode:'slots', fillings:{[slot_id]:{material_code}}}`（后端只消费 `material_code`，`slot_index/selected_size` 等前端自用字段随存随取）。⚠️ 非作者读取当前 403 → ✅ **已决议（11.8-②）：放开非作者只读脱敏版**，按 11.5-E 实现 |
| 9 | `item_type` 素材大类 | ✅ 同意加列（`beads/accessories/pendants`），与 `material_type` 分列。配饰/吊坠**走同一个** `GET /diy/templates/:id/beads` 接口加 `item_type` 查询参数，不另开接口；几何字段与异形珠同一套（问题 3 的三列） |
| 10 | 下单闭环/槽位下发 | ✅ 均已实现：作品四状态机 + `payment-assets` 钱包接口 + confirm 服务端计价（不信任前端）；`layout.slot_definitions` 已随模板详情下发，坐标语义与 10.3.1 一致（中心点归一化、宽高分母分别为底图宽/高）。⚠️ 槽位还有 `rotation`（度数）和 `render_diameter` 字段，前端文档未覆盖，须支持或容忍（见 11.7）。独立购物车不做（用草稿列表即可，`GET /diy/works?status=draft`） |
| 11 | 数据四件事 | 全部属实（11.2），归运营录入，管理台能力已具备 |
| 12 | 品类扩展 | ✅ **已决议（11.8-④）：三个分类直接建**（seeder，11.5-F），空分类前台不显示零风险；录入排期归运营 |
| 13 | 槽位标注工具 | ✅ **已存在，无需立项**：`admin/diy-slot-editor.html`（Konva.js 底图点选/拖拽/缩放/旋转，自动换算归一化中心坐标存库），语义与 10.3.3 手工口径完全一致。但有一个写库污染 bug 待修（11.6） |

### 11.4 责任归属清单

**后端数据库项目的问题（代码改动，见 11.5）**
1. `diy_materials` 缺 10 个展示/几何/大类字段（11.5-A）。
2. `GET /works/:id/qrcode`：`services/diy/QRCodeService.js` 是**占位实现（直接 throw）**，第 10.4 节的小程序码路径约定后端目前根本无法满足 → 需实现（11.5-C）。
3. beads/模板接口把 MediaFile 原始字段（`object_key/uploaded_by/thumbnail_keys`）整条下发，且不输出衍生图 URL → 收敛为 `toSafeJSON`（11.5-D）。
4. 潜在 bug：`MaterialService.createMaterial` 默认 `shape: 'round'` 不在 ENUM（circle/…/teardrop）内，不传 shape 会写库失败 → 改默认 `'circle'`。
5. 分享还原非作者只读（已拍板通过，按 11.5-E 实现）。
6. 价格护栏：`price=0` 的素材禁止启用（已拍板，11.5-B）。
7. 新品类分类 seeder（已拍板，11.5-F）。

**web 管理后台前端项目的问题（见 11.6）**
1. 素材表单缺新字段录入项（material_type/item_type/five_elements/weight/meaning/energy/pairing/几何三列）。
2. 槽位编辑器 bug：珠子预览功能把 `_previewMaterial`（含价格、图片 URL）写进 `layout.slot_definitions` 并随保存入库、经公开模板接口下发（#65 已中招）→ `saveSlots` 时必须剥离 `_previewMaterial`，并出一次数据清洗。
3. 素材/模板 Tab 无 `item_type` 筛选（依赖后端加字段后补）。

**微信小程序前端项目的问题（见 11.7）**
1. 图片降级链字段名写错（`thumbnails.large/medium` 不存在，改 `w750/w375` 或 `public_url`）。
2. 容量公式 `circumference_mm - margin` 基于不存在的字段；后端权威口径是 `size_options[].bead_count` 按颗数（拍板 ① 已确认颗数制）。
3. 槽位渲染未声明支持 `rotation`/`render_diameter`（后端标注器会产出）。
4. 本地演示的 `category_id 195/196/197`、`local=N` 模板结构不得当作真实数据口径；`slot_definitions` 权威结构以 11.3-10 为准。
5. `stock` 目前是真实整数，前端"售罄禁购 stock===0"逻辑正确可保留。

**运营/数据问题（管理台操作，无代码）**：发布串珠模板 #1/#2 前先补预览图；为 21 颗素材补图并启用；修正 #27 价格；为 #65 补底图+预览图；宝石素材图用前端 `packageDIY/diy-lite/assets/` 演示图即可起步。

### 11.5 后端执行方案（按本项目现有技术体系）

**A. migration + model：`diy_materials` 加列**（复用现有 Sequelize migration 规范，文件名如 `20260710XXXXXX-alter-table-diy-materials-display-fields.js`）：

```js
// up() 核心内容（骨架，与 models/DiyMaterial.js 同步补字段定义）
await queryInterface.addColumn('diy_materials', 'item_type', {
  type: Sequelize.ENUM('beads', 'accessories', 'pendants'),
  allowNull: false, defaultValue: 'beads', comment: '素材大类：珠子/配饰/吊坠'
})
await queryInterface.addColumn('diy_materials', 'material_type', {
  type: Sequelize.ENUM('crystal', 'stone', 'metal', 'matte'),
  allowNull: false, defaultValue: 'crystal', comment: '材质光影档位（前端渲染高光参数）'
})
await queryInterface.addColumn('diy_materials', 'five_elements', {
  type: Sequelize.STRING(50), allowNull: true,
  comment: '五行属性，逗号分隔多值：metal/wood/water/fire/earth'
})
await queryInterface.addColumn('diy_materials', 'weight', {
  type: Sequelize.DECIMAL(6, 1), allowNull: true, comment: '单颗净重(g)，1位小数'
})
await queryInterface.addColumn('diy_materials', 'meaning', {
  type: Sequelize.STRING(500), allowNull: true, comment: '寓意文案'
})
await queryInterface.addColumn('diy_materials', 'energy', {
  type: Sequelize.STRING(200), allowNull: true, comment: '能量属性文案'
})
await queryInterface.addColumn('diy_materials', 'pairing', {
  type: Sequelize.STRING(500), allowNull: true, comment: '搭配建议文案'
})
await queryInterface.addColumn('diy_materials', 'size_length_mm', {
  type: Sequelize.DECIMAL(5, 1), allowNull: true, comment: '异形珠实物长边(mm)，圆珠为空'
})
await queryInterface.addColumn('diy_materials', 'size_width_mm', {
  type: Sequelize.DECIMAL(5, 1), allowNull: true, comment: '异形珠实物短边(mm)，圆珠为空'
})
await queryInterface.addColumn('diy_materials', 'bore_orientation', {
  type: Sequelize.ENUM('along_length', 'along_width', 'none'),
  allowNull: false, defaultValue: 'none', comment: '穿绳方向：管珠沿长轴/药片沿短边/圆珠none'
})
await queryInterface.addIndex('diy_materials', ['item_type'])
```

字段命名照采前端第 2/3/10 节提议（本就符合项目 snake_case 规范），**前端零映射**。`five_elements` 用 VARCHAR 而非 JSON：多值极少、逗号分隔与前端约定一致、可 LIKE 查询，成本最低。

**B. 服务层小改（`services/diy/MaterialService.js`）**
- `createMaterial`：默认 shape 改 `'circle'`（修 bug）；新字段进白名单。
- `updateMaterial`：`allowedFields` 增加 10 个新字段。
- `getUserMaterials`：支持 `params.item_type` 过滤（`where.item_type = params.item_type`），默认不传返回全部——配饰/吊坠 Tab 由此打通，**不新增接口**。
- 价格护栏（拍板 ⑥）：`createMaterial`/`updateMaterial` 中校验 `price === 0 && is_enabled === true` 时拒绝并报错「0 价素材禁止启用，请先定价」，杜绝 #27 类事故复发。

**C. 小程序码（第 10.4 节依赖，拍板 ⑦：绑定小程序首次提审实现）**
- 实现 `QRCodeService.generateQRCode`：微信 `wxacode.getUnlimited`（scene=`diy_work_id={id}`，page 用新约定 `packageDIY/diy-lite/diy-lite`）→ 上传 Sealos 确定性路径 `diy-qrcodes/work_{id}.png` → 回填缓存。页面路径写入 `config` 常量而非硬编码。依赖小程序正式 appid 与已发布页面路径，实现前小程序端隐藏二维码入口。
- ⚠️ 实现时须对齐签名：`routes/v4/diy.js` 的 qrcode 路由当前按 `generateQRCode(workId, userId, serviceManager)` 三参调用，而 `QRCodeService.generateQRCode(diyWorkId, options)` 是双参签名（占位 throw 掩盖了不一致）。实现时以路由的三参为准重写服务签名（需要 userId 做作者校验、serviceManager 取存储服务），或改路由——二选一，勿带着不一致上线。
- `.env` 已配置 `WX_APPID`，微信凭据侧无额外准备工作，仅剩提审时间点（11.8-⑦ 遗留项）。

**D. 用户端接口数据最小化（第 6 节诉求 + 图片 URL 修正 + 拍板 ③ 库存掩码）**
- `getUserMaterials` / `getUserTemplates` / `getTemplateDetail` 返回前，将 `image_media/preview_media/base_image_media` 用 `MediaFile.toSafeJSON()` 输出：`{ media_id, width, height, public_url, thumbnails: { w375, w750, w1080 } }`，隐藏 `object_key/uploaded_by/thumbnail_keys`。
- 同一序列化收敛处实现库存掩码：`stock` 为正数时统一输出 `1`，`-1`/`0` 原样（拍板 ③）。
- 该改动同时给前端补齐衍生图 URL（`thumbnails.w750` 等），解决 11.7-1。
- 管理端接口不变（仍要完整字段与真实库存）。

**E. 分享还原（拍板 ② 已通过）**
- `GET /diy/works/:id` 放行非作者**只读**：仅 `status IN ('frozen','completed')` 的作品可被非作者读取（草稿仍 403），返回脱敏版（去 `total_cost.price_snapshot`、`idempotency_key`、`account_id`，保留 `design_data/template/preview_media/work_name`），仍要求登录。作者返回完整数据。改动点仅 `WorkService.getWorkDetail` 的 403 分支。

**F. 新品类与文案种子数据（拍板 ④⑤ 已通过）**
- seeder 建 3 个分类（`parent_category_id=190`，沿用现有编码风格）：`DIY_EARRING` 耳饰 / `DIY_CHARM` 手机链包挂 / `DIY_MALA` 108佛珠。⚠️ 分类 ID 以 seeder 实际落库为准，**前端演示用的 195/196/197 不作数**。
- 文案种子：以前端 `packageDIY/diy-lite/bead-data.ts` 27 颗样例为底稿生成 `diy_materials` 新字段的 seeder/批量更新脚本，录入前按广告法审措辞（"寓意/象征"类表述，禁功效性动词），运营在管理台逐颗确认修订。

**执行顺序**：A（migration+model）→ B → D → E → F → 管理台 11.6 → 运营录数 → C（随小程序首次提审）。全部为存量表加列、序列化收敛与单分支改动，项目未上线无兼容包袱，一次到位。

### 11.6 web 管理后台执行方案（符合其 Vite + Alpine.js + Tailwind 现有体系）

1. `admin/src/modules/diy/pages/diy-material-management.js` + `diy-material-management.html`：表单增加新字段——`item_type`（下拉：珠子/配饰/吊坠）、`material_type`（下拉四档）、`five_elements`（多选五行 → 逗号串）、`weight`（数字，0.1 步进）、`meaning/energy/pairing`（文本）、异形珠折叠区（`size_length_mm/size_width_mm/bore_orientation`，shape=circle 时隐藏）。列表加 item_type 筛选 Tab。API 层 `admin/src/api/diy.js` 零改动（透传 body）。
2. `diy-slot-editor.js` 修 bug：`saveSlots()` 里 `slot_definitions: state.slots.map(({ _previewMaterial, ...s }) => s)`，防止预览脏数据入库；并对 #65 做一次清洗（去掉已入库的 `_previewMaterial`）。
3. 首批文案录入：直接取前端归档的 `packageDIY/diy-lite/bead-data.ts`（27 颗的 MEANING_MAP/CATEGORY_ATTR/MATERIAL_MAP/克重公式）作为录入底稿，运营在管理台逐颗确认。

4. **数据看板与配套功能（2026-07-10 增补，✅ 业务方已确认全做：P0/P1/P2 + 独立大屏 + S3 交叉需求）**

   现状事实（实测）：后端已有 `GET /api/v4/console/diy/stats`（`AdminQueryService.getAdminStats`：模板总数/已发布数、作品状态分布、模板使用 Top10、近 7 天新增趋势），`diy-work-management.js` 已消费；admin 已装 ECharts ^6.0.0，analytics/lottery 模块有现成图表用法可复用。

   两条已确认的设计原则：
   - **建独立"DIY 数据大屏"页面（业务方拍板 2026-07-10）**：新增 `admin/diy-dashboard.html` + `admin/src/modules/diy/pages/diy-dashboard.js`，聚合展示 P0 完备度 + P1 经营漏斗/GMV/履约 + P2 素材热度全量指标。接入方式与现有 4 个 DIY 页面完全一致（Vite 自动扫描根目录 `.html` 为多页入口，实测确认）：仅需在 `vite.config.js` 页面标题映射表加一行（如 `'diy-dashboard': { title: 'DIY数据看板', pageIcon: '📈' }`）+ 侧边栏导航 `sidebar-nav.js` 注册入口，零框架改动。图表复用 analytics 模块的 ECharts 用法（`dashboard.js`/`dashboard-overview.js` 现成范式），数据全部来自扩展后的 `stats.js` 接口，**大屏不建独立数据源**。
   - **每个数字可点击、点了能干活**——大屏与页内卡片的每个指标一律带动作（点击跳转对应管理页并带筛选参数，如缺图数 → 素材页缺图过滤、待发货数 → 作品页待发货过滤），做成运营的工作清单而非只读报表。

   页内卡片与独立大屏的分工：素材/模板/作品三个管理页顶部保留各自域内的 P0/P1 快捷卡片（干活入口，就近原则）；独立大屏做全局总览（跨域聚合 + 趋势图表），两者消费同一套 `stats.js` 接口，无重复后端开发。

   按数据可用时点分三级（P0 最紧迫：当前瓶颈不是"经营数据看不到"——`diy_works` 空表无经营数据可看——而是 21 颗素材全部缺图、4 个模板全部缺预览图，P0 就是把"运营录数"从口头催办变成可量化收尾的机制）：

   **P0 · 数据完备度看板（上线前就有价值，直接服务当前运营录数瓶颈）**
   - 位置：`diy-material-management` 与 `diy-template-management` 列表顶部卡片区。
   - 指标（全部是 `diy_materials`/`diy_templates` 单表聚合，无新表）：缺图素材数（`image_media_id IS NULL`）、缺文案素材数（11.5-A 落库后统计 meaning/five_elements/material_type 为空）、0 价且启用素材数、未启用素材数；模板侧：缺预览图/底图数、draft 未发布数、published 但无可用素材的模板数。
   - 配套功能：列表加「缺图 / 缺文案 / 0价」快捷筛选，点完备度卡片即带筛选过滤——**把看板做成运营的工作清单**，而不是只读报表。
   - 后端：扩展 `getAdminStats` 返回 `completeness` 字段或在 stats.js 加 `GET /completeness`，纯 COUNT 聚合。

   **P1 · 经营看板（接口随 P0 一起建，上线后有数据即生效）**
   - 转化漏斗：draft → frozen → completed / cancelled 的数量与转化率（`diy_works.status` + `frozen_at`/`completed_at` 时间戳均已存在）。
   - GMV：completed 作品 `total_cost.payments` 按 `asset_code` 汇总（日/周维度），与 `exchange_records(source='diy').pay_amount` 交叉校验；ECharts 折线图，用法照抄 analytics 模块。
   - 履约：`exchange_records(source='diy')` 待发货数、缺收货地址数（地址补录入口 `updateWorkAddress` 已有，看板给入口计数）。
   - 位置：`diy-work-management` 现有 stats 区扩展（域内干活入口）+ 独立大屏 `diy-dashboard` 展示漏斗/GMV 趋势图表（全局总览），同一套接口。

   **P2 · 素材热度排行（数据积累后）**
   - 从 frozen/completed 作品的 `total_cost.price_snapshot` 聚合 `material_code` 使用次数与金额贡献（快照字段已存在，无需解析 design_data JSON），Top20 排行。
   - 位置：独立大屏 `diy-dashboard` 排行榜区块；用途：反哺 S1 采购决策（哪些珠子该进货/补货），S1 施工完成后可在采购页联动展示。
   - `five_elements` 落库后可加素材库五行分布饼图（运营配货平衡参考，可选）。

   **随 S3 施工（非 DIY 排期）**：寄卖审核队列页（S3 #31/#37 人工审核）审核 `diy_product` 时，须展示 `diy_works.total_cost.payments` 冻结快照作为核价上限依据（12.2-1 口径），该功能归 S3 管理页范围，此处仅记录交叉需求。**【状态更新 2026-07-11：✅ 已落地——寄卖详情接口返回 `max_list_price`（DIY 品读 `total_cost.payments` 汇总），寄卖管理页详情弹窗展示，超限创建/上架均被拒，见 14.2 #30】**

### 11.7 小程序前端强制适配点（改前端，不改后端）

1. 图片降级链：底图/宝石图统一改为 `image_media.thumbnails.w750 → image_media.public_url`（11.5-D 上线前先只用 `public_url`）；珠子小图可用 `w375`。删除 `thumbnails.large/medium` 写法。
2. 异形珠绘制比例：用 `image_media.width / image_media.height` 计算（图已裁透明边），不等待 `image_bbox_ratio` 字段。
3. 容量/尺码（拍板 ① 已定颗数制）：容量上限 = 当前尺码 `size_options[].bead_count`，删除 `circumference_mm - margin` 公式与手围换算兜底；第 5 节的手围/圈数/毫米容量模型**整体作废**，仅保留在本地演示。
4. 镶嵌槽位：支持 `slot_definitions[].rotation`（度，绕中心）与 `render_diameter`（非空时用于宝石渲染直径）；`slot_shape` 字段后端不存在（标注器输出为椭圆语义 + `allowed_shapes` 约束），前端按 `width/height` 比例画椭圆/圆即可，删除对 `slot_shape` 的依赖。
5. 素材 Tab：`GET /diy/templates/:id/beads?item_type=accessories|pendants`（11.5-B 上线后生效）。
6. 分享还原（拍板 ② 已通过）：待后端实现 11.5-E 后联调；注意仅 `frozen/completed` 状态可还原，草稿分享仍会 403，前端落地页兜底保留。
7. 库存（拍板 ③ 已定掩码）：`stock` 只会收到 `-1/0/1` 三值，"售罄禁购 stock===0"逻辑不变，勿依赖精确数量。
8. 小程序码（拍板 ⑦）：`GET /works/:id/qrcode` 实现前隐藏二维码入口。

### 11.8 拍板决议（2026-07-10 业务方已确认，为最终口径）

> 决策依据：对比了电商大厂（阿里/京东 SKU 档位制、后台/前台类目分离、库存三态掩码）、游戏公司（槽位制镶嵌、配装码分享、表格驱动文案）、协作产品（腾讯文档 token 权限模型）与小公司常见做法后，按"项目未上线、不兼容旧接口、长期维护成本最低"原则选定。均落在现有技术栈最小改动路径上：JSON 规则字段不动、序列化收敛一处做完、状态机不改；不为假设性需求建体系（token 分享、精确库存营销、毫米制校验等真需求出现再说）。

| # | 事项 | ✅ 决议 | 理由与行业参照 |
| --- | --- | --- | --- |
| ① | 串珠容量口径 | **颗数制为权威**：`sizing_rules.size_options[].bead_count` + `capacity_rules.min_beads/max_beads`，不引入 `circumference_mm`/手围滑块/圈数模型 | 大厂定制电商即 SKU 档位制（S/M/L 有限选项，"约17cm"只是 `display` 文案）；毫米制的真实成本在服务端"总长≤周长"校验要求每颗珠子沿绳尺寸录准，运营成本与客诉风险高；108 佛珠天然颗数制（54/108颗） |
| ② | 分享还原 | **放开非作者只读（脱敏版）**，且仅 `frozen/completed` 状态可被非作者读，草稿不可读，仍要求登录（11.5-E） | 淘宝清单/网易云歌单式"分享即公开只读快照"；炉石配装码方案因小程序码 scene 32 字符上限不可行；腾讯文档式 token 体系等出现"私密作品"需求再上。作品公开只读是"作品广场"运营位的长期方向 |
| ③ | 库存暴露 | **掩码**：用户端 `stock` 保持 `-1`（无限）/`0`（售罄）语义，正数一律压成 `1`（11.5-D 同处实现） | 电商大厂从不下发精确库存（竞对可轮询库存变化反推销量）；"仅剩N件"饥饿营销字段等有需求再加运营阈值配置 |
| ④ | 新品类 | **三个分类（耳饰/手机链包挂/108佛珠）直接建**（seeder，11.5-F），录入顺序由运营排期决定 | 淘宝"后台类目建全、前台按有货动态显示"模式；`getUserTemplates` 只返回 published 模板，空分类小程序端不显示，提前建零风险。⏳ 待运营补充：三品类拍图/录素材的优先级 |
| ⑤ | 文案数据源 | **前端 `bead-data.ts` 27 颗样例起步**（seeder 底稿），运营在管理台修订 | 内容冷启动通用范式"种子数据 + CMS 可改"。⚠️ 合规要求：录入前统一按广告法审一遍措辞——用"寓意/传统文化中象征"，禁用"改善/增强/招来"等功效性表述。⏳ 待指定：措辞审核责任人 |
| ⑥ | price=0「绿宝石01」 | **后端加价格护栏**：`price=0` 的素材禁止 `is_enabled=1`（11.5-B），从机制上杜绝复发 | 电商价格护栏（异常价自动下架+告警）惯例。⏳ 待运营补充：#27 的定价数字，或确认测试数据直接禁用 |
| ⑦ | 小程序码 | **绑定小程序首次提审一起实现**（11.5-C），此前前端隐藏二维码入口 | 方案无分歧（`wxacode.getUnlimited` + 短 scene + 对象存储缓存即微信生态标准做法），只是排期问题。⏳ 待补充：提审时间点 |

**遗留的四个运营输入（非技术决策，不阻塞开发）**：④ 三品类录入优先级；⑤ 文案审核责任人；⑥ #27 定价数字；⑦ 提审时间点。补齐即可，11.5-A/B/D/E/F 与 11.6 可立即开工。

### 11.9 复核记录（2026-07-10 二次实测，直读代码 + Node.js/mysql2 实连真实库逐项复验）

> 复核方法与 11 节首次审查相同：直读 `models/DiyMaterial.js`、`models/DiyTemplate.js`、`models/MediaFile.js`、`services/diy/*`、`routes/v4/diy.js`、`routes/v4/console/diy/*`、`admin/src/modules/diy/pages/*`、`admin/src/api/diy.js`，并用 mysql2 + `.env` 直连 `restaurant_points_dev` 复验全部数据断言。不引用任何历史报告。

**结论：第 11 节全部事实断言与裁决经二次实测无一处需要推翻，可按 11.5/11.6/11.7 直接开工。** 逐项复验结果：

| 复验项 | 结果 |
| --- | --- |
| 数据库 `diy_materials` 现有 16 列，无 11.5-A 的 10 个新字段 | ✅ 属实（SHOW COLUMNS 实测） |
| 素材 21 颗、仅 3 颗启用（#12/#17/#27）、`image_media_id` 全 NULL、`meta` 全 NULL、#27 price=0 且启用 | ✅ 属实 |
| 模板 4 个、仅 #65 published、4 个 `preview_media_id`/`base_image_media_id` 全 NULL、#65 layout 含 `_previewMaterial` 脏数据（#1/#2/#40 无污染） | ✅ 属实 |
| `diy_works` 空表；DIY 分类仅 190–194（195/196/197 不存在）；`asset_group_defs` 10 组 | ✅ 属实 |
| `MaterialService.createMaterial` 默认 `shape: 'round'` 不在 ENUM 内（写库必败 bug） | ✅ 属实 |
| `QRCodeService.generateQRCode` 占位 throw | ✅ 属实（另发现路由/服务签名不一致，已补进 11.5-C） |
| beads/模板接口整条下发 MediaFile（含 `object_key/uploaded_by/thumbnail_keys`） | ✅ 属实（`getUserMaterials`/`getUserTemplates`/`getTemplateDetail` 均 include 原始 MediaFile） |
| `MediaFile.toSafeJSON()` 已存在且输出 `{ media_id, width, height, public_url, thumbnails: {w375,w750,w1080} }` | ✅ 属实——**11.5-D 无需新写序列化方法，纯接线工作**，比首次审查预估更省 |
| `getWorkDetail` 非作者一律 403（无状态区分） | ✅ 属实，11.5-E 改动点确认为该方法单分支 |
| `getUserMaterials` 无 `item_type` 过滤；`stock` 原样下发 | ✅ 属实 |
| 管理台 `saveSlots()` 直接保存 `state.slots`，未剥离 `_previewMaterial`（`diy-slot-editor.js` 写入点与保存点均确认） | ✅ bug 属实，11.6-2 修法可行 |
| 槽位编辑器输出字段为 `x/y/width/height/rotation/render_diameter/allowed_*/required`，无 `slot_shape` | ✅ 属实，11.7-4 前端适配口径正确 |
| 管理台素材表单确无 material_type/item_type/five_elements 等新字段录入项；`admin/src/api/diy.js` 透传 body 零改动 | ✅ 属实 |
| 管理台技术栈 Vite + Alpine.js + Tailwind + Konva | ✅ 属实（package.json 实测），11.6 方案与其兼容 |
| 上传通道 `POST /api/v4/user/images/upload` 存在；管理端媒体上传 `trim_transparent` 裁透明边存在（`MediaService` + console media 路由） | ✅ 属实 |
| `.env` 已有 `WX_APPID` | ✅ 属实（11.5-C 补充） |
| 现有 `tests/services/DIYService.test.js` 覆盖 DIY 服务 | ✅ 存在——11.5-A/B/D/E 改动完成后须同步扩这份测试（加列字段白名单、价格护栏、库存掩码、非作者只读四类用例） |

**复核后无新增待拍板项**：11.8 七项决议维持不变，遗留的仍是那四个运营输入（三品类录入优先级、文案审核责任人、#27 定价、提审时间点）。

---

## 12. 与 S1–S5 商品体系施工的衔接（2026-07-10 增补，业务方确认五场景全做）

> 背景：S1 采购 / S2 批次 / S3 二手寄卖 / S4 组合商品 / S5 分销映射已全部拍板并**一次性连续施工**（拍板清单 40 项见本文档下方「S1–S5 业务场景拍板决策清单」章节，2026-07-09 定稿；落地记录见 §14）。本节裁决 DIY 模块与五场景的边界与交叉点，避免两套库存/两套编码打架——原则与 S1 #3（收货不自动铸造实物）一脉相承：**一个业务对象只归一套体系管**。

### 12.1 逐场景衔接裁决

| 场景 | 与 DIY 的关系 | 裁决 |
| --- | --- | --- |
| S1 采购 | 珠子素材（`diy_materials`）是独立素材表，**不在** exchange_items SPU/SKU 体系内 | **首版 DIY 素材不进 S1 采购单体系**。珠子实物进货线下管理，线上库存继续用 `diy_materials.stock`（-1/0/正数）人工维护。未来要做珠子进货成本/供应商追溯，独立立项（给 `diy_materials` 挂 supplier/batch 外键），与 S1"首版不做项独立立项"同一范围控制原则 |
| S2 批次 | DIY 成品是**一物一码**（`items.tracking_code`，铸造时自动生成），非"一批一码" | DIY 作品实物**无批次归属**（`batch_id` 留空），不适用批次召回；珠子素材同 S1 裁决暂不进批次体系 |
| S3 二手寄卖/转赠 | **唯一的实质交叉点**。DIY `completeDesign` 走 `ItemService.mintItem` 铸造 `item_type='diy_product'` 实物：`tracking_code` 自动生成回填 + `item_ledger` 双录 + `exchange_records` 履约记录 | ✅ **DIY 作品可寄卖、可转赠**，天然满足 S3 #36 来源门槛（平台发出、带 tracking_code 的正品实物）。两条适配口径见 12.2 |
| S4 组合商品 | S4 #20 已定"子项只能是普通 SPU/SKU" | DIY 模板/作品**不可作为组合子项**（个性化定制品无法预先组包），无交叉、无开发 |
| S5 分销映射 | 分销映射对象是我方 SPU ↔ 外部平台商品 ID | DIY 定制品是个性化商品，**不进分销范围**（淘宝/抖音无法挂"由买家现场设计"的 SKU），无交叉、无开发 |

### 12.2 S3 对 `diy_product` 的两条适配口径（✅ 已随 S3 施工落地 2026-07-11，见 14.2）

1. **寄卖核价上限**：S3 #30 要求反向资产流"等价或向下"。DIY 作品的"原兑换价值"权威来源 = `diy_works.total_cost.payments`（confirm 时服务端计算的冻结金额快照，star_stone 口径与 S3 #32 的寄卖计价资产一致）；`exchange_records.pay_amount` 为同一数值的冗余记录，可用于交叉校验。寄卖审核核价 ≤ 该值。
2. **二手上架形态**：S3 #34"复用原 SPU 上架为二手"**不适用**于 DIY 作品（个性化定制无 SPU）。`diy_product` 寄卖按 `items` 个体上架，展示用 `diy_works.preview_media` 预览图 + 作品名，挂"二手"标签混现有空间（与 S3 #38 一致），**不为 DIY 二手新建 SPU**。

### 12.3 施工并行性

DIY 第 11.5 节执行项（A/B/D/E/F）与 S1–S5 施工**表域不相交、可完全并行**：DIY 动的是 `diy_materials`（加列）/`diy_works`（读逻辑）/`categories`（seeder）；S1–S5 动的是采购/批次/组合/分销/寄卖 10 张新表。唯一的运行时交叉是 S3 读取 `items`/`item_ledger`——这两张表现状已支撑 DIY 铸造，无需 DIY 侧任何改动。**S3 上线后 `diy_product` 自动获得寄卖/转赠能力（含转赠每日 5 次限额等 S3 通用规则），DIY 模块零开发。****【状态更新 2026-07-11：✅ 已兑现——S3 寄卖 + 用户转赠（`POST /backpack/items/:item_id/transfer`，每日限额配置化默认 5 次）均已上线，`diy_product` 实测零改动获得两项能力，见 14.2 #35】**

---

**说明**：本文档仅描述前端对后端数据的需求，不含前端实现细节。字段命名遵循项目 `snake_case` 约定，接口沿用现有 `/api/v4/diy/` 体系，前端不做字段映射、按后端返回格式直接使用。**第 11 节为后端权威裁决与执行方案、第 12 节为与 S1–S5 商品体系的衔接裁决、第 13 节为 DIY 落地完成记录、第 14 节为 S1–S5 落地完成记录，与正文冲突处以第 11–14 节为准。**

---

## 13. 后端 + web 管理台落地完成记录（2026-07-10，实测通过 · 权威）

> 本节记录 11.5（后端）与 11.6（web 管理台）执行方案的**实际落地状态**，供微信小程序前端对接。所有改动均在真实库 `restaurant_points_dev` 迁移落库 + 24 个 Jest 用例全绿 + ESLint/Prettier 通过 + admin 构建通过 + PM2 健康检查正常。**前端按本节确认的字段与接口直接对接，不做映射。**

### 13.1 后端已完成（11.5 A/B/C/D/E/F 全部落地）

**A. `diy_materials` 加 10 列（已迁移落库）**
迁移文件 `migrations/20260710070000-add-column-diy-materials-display-fields.js`，`models/DiyMaterial.js` 同步补字段（DECIMAL 字段带 getter 转数字）。新增列：
`item_type`(beads/accessories/pendants) / `material_type`(crystal/stone/metal/matte) / `five_elements`(VARCHAR逗号分隔) / `weight`(DECIMAL) / `meaning` / `energy` / `pairing` / `size_length_mm` / `size_width_mm` / `bore_orientation`(along_length/along_width/none)。索引 `idx_diy_materials_item_type` 已建。

**B. `MaterialService` 服务层（已改）**
- 修复历史 bug：`createMaterial` 默认 `shape` 由不合法的 `'round'` 改为 `'circle'`（实测：不传 shape 落库 `circle`）。
- 新字段全部进 create/update 白名单。
- `getUserMaterials` / `getAdminMaterialList` 支持 `item_type` 过滤（配饰/吊坠 Tab 由此打通，未另开接口）。
- 价格护栏（拍板 ⑥）：`price=0 && is_enabled=true` 在 create/update 均被拒绝（实测返回「0 价素材禁止启用」）。

**C. 小程序码 `QRCodeService`（已实现，等提审）**
`services/diy/QRCodeService.js` 已实现 `generateQRCode(workId, userId, serviceManager)` 三参签名（与路由一致）：作者校验 → Sealos 确定性路径 `diy-qrcodes/work_{id}.png` 缓存命中检查 → 未命中调 `wxacode.getUnlimited`（scene=`diy_work_id={id}`，page=`packageDIY/diy-lite/diy-lite`，来自 `config/business.config.js` 的 `diy.qrcode` 常量）→ 上传 Sealos 回 URL。仅 `frozen/completed` 作品可生成。**⏳ 依赖小程序提审发布页面路径后可用（拍板 ⑦），提审前前端隐藏二维码入口。**

**D. 用户端数据最小化 + 库存掩码（已生效，实测）**
- `GET /diy/templates/:id/beads`：媒体走 `MediaFile.toSafeJSON()`（隐藏 `object_key/uploaded_by/thumbnail_keys`，输出 `public_url` + `thumbnails.{w375,w750,w1080}`）；`stock` 掩码为 `-1/0/1` 三值（实测 #65 素材 stock 均为 -1）；下发 10 个新展示字段。
- `GET /diy/templates`、`GET /diy/templates/:id`（用户端）：`preview_media`/`base_image_media` 同样 `toSafeJSON()` 收敛。用户端模板详情走新增的 `getUserTemplateDetail`，管理端 `getTemplateDetail` 保持完整字段不变。
- **【状态更新 2026-07-11：`toSafeJSON()` 已收敛为最小字段集（审计闭环）】** 此前实现除隐藏敏感字段外还多下发 `original_name/file_size/mime_type/folder/tags/status/created_at/updated_at` 八个上传管理属性，未达 11.5-D 数据最小化口径。现已收敛为权威最小集，**小程序端拿到的媒体对象只有这 5 个字段，请勿依赖其它字段**：

```json
{ "media_id": 1, "width": 640, "height": 960, "public_url": "https://...", "thumbnails": { "w375": "...", "w750": "...", "w1080": "..." } }
```

  适用范围：beads 列表 `image_media`、模板列表/详情 `preview_media`/`base_image_media`、非作者作品详情 `preview_media`（管理端接口不受影响，仍返回完整 MediaFile 含 `object_key`）。已用 Jest 用例锁定字段集（键名精确断言，多发/漏发字段测试即失败）。

**E. 分享还原非作者只读脱敏（已实现）**
`GET /diy/works/:id`：作者返回完整数据；非作者仅 `frozen/completed` 可读（`draft/cancelled` 返回 403），脱敏去除 `account_id`/`idempotency_key`/`total_cost.price_snapshot`（仅保留 `payments` 汇总），媒体字段 `toSafeJSON()`。
**【状态更新 2026-07-11：权限与脱敏口径已补 Jest 用例锁定（11.9 复核要求）】** 双账号实测：非作者读草稿 403、读 frozen 返回脱敏版（无 `account_id`/`idempotency_key`/`price_snapshot`，保留 `payments`/`design_data`/`work_name`/`template`）、作者读回完整数据（含 `price_snapshot`）。同批补齐 update 路径价格护栏用例（0 价改价被拒、0 价+停用合法、0 价单独启用被拒），`tests/services/DIYService.test.js` 现 30 用例全绿——11.9 要求的「字段白名单、价格护栏、库存掩码、非作者只读」四类用例全部覆盖。

**F. 新分类 + 文案种子（已落库，⚠️ 实际分类 ID 见下）**
- 三个新分类实际落库 ID（**前端演示用的 195/196/197 作废，以此为准**）：
  - `DIY_EARRING` 耳饰 → **category_id = 291**
  - `DIY_CHARM` 手机链包挂 → **category_id = 292**
  - `DIY_MALA` 108佛珠 → **category_id = 293**
- 文案种子：21 颗素材已按材质名批量写入 `meaning/energy/pairing/five_elements/material_type`，圆珠 `weight` 按球体积估算（实测覆盖率 寓意 21/21、五行 21/21、克重 21/21）。措辞已按广告法审（用「寓意/象征」）。⏳ 待运营在管理台逐颗复核修订。

**数据清洗**：`migrations/20260710070100` 已剥离 #65 模板 layout 中的 `_previewMaterial` 脏数据（实测全库 0 残留）。

### 13.2 web 管理台已完成（11.6 全部落地，已构建）

- **素材管理页**（`diy-material-management`）：表单新增素材大类/材质档位下拉、五行多选、克重、寓意/能量/搭配文本、异形珠几何折叠区（shape≠circle 时显示）；列表加素材大类 Tab（全部/珠子/配饰/吊坠）与 P0 完备度卡片（缺图/缺文案/0价，点击带筛选，支持 URL `?filter=` 跳转）；前端价格护栏与后端同规则。
- **模板管理页**（`diy-template-management`）**【状态更新 2026-07-11：P0 完备度卡片区已补齐（11.6-4 P0 首次落地时遗漏的"模板页那半"）】**：列表顶部新增缺预览图/缺底图/草稿未发布/已发布但无可用素材四张完备度卡片，前三张点击带筛选（缺图两张走列表接口已有的 `missing_preview`/`missing_base_image` 参数，草稿走 `status=draft`，二次点击取消），支持 URL `?filter=missing_preview|missing_base_image|draft` 跳转直达；保存/删除模板后完备度计数与列表同步刷新。后端零改动（列表筛选参数与 `completeness.templates` 字段此前已实现）。
- **槽位编辑器**（`diy-slot-editor`）：`saveSlots` 保存前 `map` 剥离 `_previewMaterial`，杜绝预览脏数据再次入库。
- **DIY 数据大屏**（新增 `diy-dashboard.html` + `diy-dashboard.js`）：P0 完备度 + P1 转化漏斗/GMV 趋势/履约 + P2 素材热度 Top20（后端 `_getMaterialHeatStats` 已服务端截断 20 条）/五行分布饼图，全部来自扩展后的 `GET /console/diy/stats`（新增 `completeness/funnel/gmv/fulfillment/material_ranking/five_elements_distribution` 字段）；已在 `vite.config.js` 与 `sidebar-nav.js` 注册。
  **【状态更新 2026-07-11：「每个数字可点击、点了能干活」补齐】** 模板缺预览图/缺底图/草稿未发布三个指标现跳转模板页带 `?filter=` 筛选；缺收货地址、GMV 分币种指标现跳转作品管理页带 `?status=` 筛选；作品管理页（`diy-work-management`）已支持解析 URL `?status=` 参数（此前大屏「待发货」卡片带参跳转但目标页不消费，点了等于没筛）。

### 13.3 前端仍需自行适配（改前端，见 11.7，后端不再改）

1. 图片降级链改 `image_media.thumbnails.w750 → public_url`（后端已下发 `thumbnails.{w375,w750,w1080}`）。⚠️ **媒体对象自 2026-07-11 起只含 5 个字段 `{ media_id, width, height, public_url, thumbnails }`**（13.1-D 状态更新），前端勿依赖 `mime_type/file_size/original_name` 等已移除字段；异形珠比例继续用 `width / height` 计算（字段保留）。
2. 容量口径颗数制（`size_options[].bead_count`），删除 `circumference_mm - margin` 公式。
3. 槽位支持 `rotation`/`render_diameter`，删除对 `slot_shape` 依赖。
4. 分类 ID 用真实值（耳饰 291 / 手机链 292 / 佛珠 293），本地演示 `local=N` 结构不作真实口径。
5. 库存只会收到 `-1/0/1`，「售罄禁购 stock===0」逻辑不变。
6. 小程序码接口 `GET /works/:id/qrcode` 提审前隐藏入口。

### 13.4 遗留运营输入（非技术阻塞，不影响前端对接）

- 三品类（耳饰/手机链/佛珠）录素材优先级；素材文案审核责任人；#27「绿宝石01」定价数字（当前 0 价被护栏拦截无法启用）；小程序提审时间点。
- 运营录数：21 颗素材补图并启用、4 个模板补预览图、#65 补底图（管理台能力已就绪，前端演示图可直接取用）。

---

## 14. S1–S5 业务逻辑落地完成记录（2026-07-11，实测通过 · 权威）

> 本节记录下方 40 项拍板清单的**实际落地状态**。全部改动在真实库 `restaurant_points_dev` 迁移落库 + Jest 用例全绿（`tests/services/S1S5ExchangeService.test.js`，2026-07-11 补齐拒绝/退款回补用例后为 **26 个**）+ 回归（ExchangeService 25 / DIY 30）全绿 + ESLint / `check:api-contract` / `validate:routes` / admin 构建通过 + PM2 健康。

### 14.1 五场景后端全量落地（Service / 路由 / 幂等 / 管理页）

| 场景 | Service | 路由（`/api/v4/console/exchange/`） | 管理页 | 单号/编码 |
|---|---|---|---|---|
| S1 采购单 | `services/exchange/PurchaseOrderService.js` | `purchase-orders`（列表/详情/创建/更新/submit/receive/cancel） | `admin/purchase-order-management.html` | `PO+YYYYMMDD+序号`（`utils/BusinessSeqCodeGenerator.js`） |
| S2 批次 | `services/exchange/ProductBatchService.js` | `product-batches`（列表/详情/创建/更新/recall） | `admin/product-batch-management.html` | `BC+YYYYMMDD+序号` |
| S4 组合 | `services/exchange/ProductBundleService.js` | `product-bundles`（列表/详情/创建/更新） | `admin/product-bundle-management.html`（独立页，见 14.3 修订#40） | 组合自身 SPU 标准 `SP` 码 |
| S5 分销 | `services/exchange/ExternalChannelMappingService.js` | `channel-mappings`（列表/详情/创建/更新/删除 + `channel-dict` 字典下拉） | `admin/channel-mapping-management.html` | — |
| S3 寄卖 | `services/exchange/ConsignmentService.js` | `consignments`（列表/详情/创建/list/sold/withdraw/reject） | `admin/consignment-management.html` | `CS+YYYYMMDD+序号` |

- 服务注册：`services/index.js`（`purchase_order_service` / `product_batch_service` / `product_bundle_service` / `channel_mapping_service` / `consignment_service`）。
- 幂等：全部写路径已登记 `CANONICAL_OPERATION_MAP`（含 submit/cancel/recall 与寄卖四个状态动作）。**【口径澄清 2026-07-11】** `DELETE /channel-mappings/:id` 与 PUT 共用同一路径键 `ADMIN_CHANNEL_MAPPING_UPDATE`（映射表按路径而非方法为键，与 suppliers/items 的 `:id` 约定一致；请求指纹含 HTTP 方法，PUT/DELETE 复用同一幂等键会被 409 拒绝，无漏保护），已在映射表补注释。
- 权限：统一 `requireRoleLevel(100)`（#39）；侧栏入口在「资产交易→兑换市场」下（`sidebar-nav.js` + `vite.config.js` 已注册）。

### 14.2 关键拍板项的落地口径（护栏实测）

| 拍板 | 落地 |
|---|---|
| #3 收货不铸实物 | ✅ 收货只加 SKU 库存（`adjustStock` + `syncSpuSummary`），不动 `items` |
| #5 回写最近进货价 | ✅ 收货时 `exchange_item_suppliers.purchase_price` findOrCreate+update |
| #9 received 锁定 | ✅ received 为终态：行不可改、**也不可 cancel**（修订见 14.3） |
| #12 批次成本从 S1 带入 | ✅ 收货**默认自动建批次**（成本=进货价/数量/供应商同单头），`create_batch:false` 可跳过 |
| #20 禁嵌套 | ✅ BOM 子项（含 SKU 反查归属）命中组合表即拒 `PRODUCT_BUNDLE_NESTED_FORBIDDEN` |
| #18/#19/#22 组合下单 | ✅ 见 14.4 |
| #23 子项失效组合停售 | ✅ 下单时强校验（子项非 active / 库存不足即拒单），替代事件联动（修订见 14.3） |
| #24 渠道字典 | ✅ `system_dictionaries` 新增 `distribution_channel` 类型（淘宝/抖音启用，京东/拼多多预置停用）；创建/更新映射校验渠道必须在启用字典中；管理页下拉读 `GET /channel-mappings/channel-dict`，**加渠道零发版** |
| #26 渠道价 | ✅ `external_channel_mappings.channel_price DECIMAL(10,2) NULL`（迁移 `20260711011000`），NULL=默认取我方价；一对一约束下映射行即渠道 listing，零新表 |
| #28 一对一 | ✅ 同商品同渠道二次映射被拒 `CHANNEL_MAPPING_ITEM_ALREADY_MAPPED`（create/update 双端） |
| #30 反向资产流护栏 | ✅ 寄卖核价上限 `max_list_price`（DIY 品读 `diy_works.total_cost.payments`，其他读 `exchange_records.pay_amount`），超限拒 `CONSIGNMENT_PRICE_EXCEEDS_MAX` |
| #32 计价资产 | ✅ 默认 `star_stone`；`points/budget_points` 拒 `CONSIGNMENT_FORBIDDEN_ASSET_CODE`（与 DIY 白名单同口径） |
| #33 佣金率预留 | ✅ 配置项 `exchange/consignment_commission_rate`（default 0，上限 0.5，启用改配置不改代码） |
| #35 转赠 | ✅ 用户端 `POST /api/v4/backpack/items/:item_id/transfer`（复用 `ItemService.transferItem`，`business_type='gift_transfer'` 双录+幂等）；每日限额配置 `exchange/gift_transfer_daily_limit`（default 5，0=关闭），按当天账本转出流水计数（账本即真相，无独立计数器）；仅 available 可转、禁转自己、非持有人 404、接收方支持 user_id / 手机号（盲索引） |
| #36 来源限制 | ✅ 无 `tracking_code` 拒寄卖 |
| #37 审核角色 | ✅ 上架/驳回等动作 `requireRoleLevel(100)`；上架时物品转入 `SYSTEM_ESCROW` 托管（`item_ledger` 双录） |

### 14.3 补充拍板（2026-07-11 拍板执行，修订三项 + 推迟两项）

1. **#9 语义修订**：`received` 维持终态，不允许 cancel（避免"收货库存已售出→回滚负库存"深坑；与 #8"不做采购退货"一致；ERP 正统为红字冲销，将来需要独立立项）。错误收货纠正走现有 SKU 库存调整接口 + 单据备注。
2. **#14 语义修订**：批次召回=批次标 `inactive` + `items.batch_id` 追溯查询，**不联动冻结实物**——因 #3 收货不铸实物，批次下不存在平台持有的待售个体；已售出个体属用户资产不可系统冻结（召回的合规动作是通知+退货退款）。未来若做"收货铸实物"再用 `item_holds` 冻结（独立立项）。
3. **#40 修订**：S4 保留**独立管理页**（不并入兑换市场 Tab）——`exchange-market` 已是全站最大页面，独立页与 S1/S2/S5/S3 形态统一，且组件复用收益（mixin/API 封装）已通过独立页拿到。
4. **推迟：S3 售出后回流上架 + C 端二手标签（#34/#38）**——当前无 C 端消费方，随小程序寄卖购买入口一起立项，届时按「个体挂牌」模型评审（复用 Bid 个体交易范式，展示挂原 SPU + 二手标签）。`relist_item_id` 字段锚点已留。
5. **推迟：渠道 API 对接（拉单/推库存）**——按 #25 独立立项，本次只做映射主数据 + 渠道价。

### 14.4 S4 组合下单链路（拍板 #18/#19/#22，已接入兑换核心）

- **模型**：单订单 + BOM 展开扣减（不拆单、不做价格分摊——#22 整单发货无子项级售后，砍掉分摊复杂度）。
- **下单**（`CoreService.exchangeItem`）：命中组合 SPU → `ProductBundleService.resolveBundleForOrder`（子项 active 校验 #23 + SKU 解析 + 库存预检）→ 扣子项 SKU（行锁，赠品同扣不另计价 #19）→ 组合自身 SKU 只计 `sold_count` 不扣 stock（组合不备货 #18）→ BOM 扣减清单写入 `exchange_records.item_snapshot.bundle`（发货员整单拣货依据 #22）。
- **逆向**：退款/取消/拒绝按**订单快照**回补子项（防 BOM 事后被改导致回补错账），组合自身 SKU 回退销量。
- **组合 SPU 默认 `mint_instance=false`**（虚拟组合不铸实例，不要求挂物品模板）。
- ⚠️ 组合可售前提：运营需为组合 SPU 配置渠道定价（组合独立定价 #17，走现有 SKU 定价流程）。

### 14.5 修复记录（2026-07-11）

1. **兑换订单逆向库存回补补全**：修复前仅「管理员退款」回补库存，「用户取消 / 管理员拒绝」只退材料资产不回补——pending 单取消/被拒后库存永久丢失。现三条逆向路径统一走 `CoreService._restoreOrderStock`（普通商品回补 SKU stock/sold_count + 同步 SPU 汇总；组合单按快照回补子项），并写库存变动操作日志。
2. **早期护栏补齐**（复查发现并修复）：#20 嵌套、#28 一对一、#32 计价资产白名单、S1 收货默认建批次（#12 联动主路径）、幂等映射补 submit/cancel/recall 三条。
3. Jest 套件重写：不再依赖库中现存供应商（自建临时数据+清理+库存回滚，真实库零残留），杜绝此前"缺数据即静默跳过"的空跑问题。
4. **【状态更新 2026-07-11：逆向回补三路径测试补齐】** 此前 §14.5-1 的修复只有「用户取消」有回补用例，「管理员拒绝 / 管理员退款」仅代码级保障。现三条逆向路径共用同一事务内夹具（扣库存直造订单 → 执行逆向 → 断言库存/销量恢复 → 强制回滚零残留）逐条断言，`tests/services/S1S5ExchangeService.test.js` 现 26 用例全绿。

### 14.6 配置项与运营前置

- 新增系统配置（`config/system-settings-whitelist.js`）：`exchange/consignment_commission_rate`（寄卖佣金率，default 0）、`exchange/gift_transfer_daily_limit`（转赠每日限额，default 5）。
- 运营前置：S1 使用前需先在「供应商管理」建档（当前 `suppliers` 空表）；组合上架前需配置组合 SPU 渠道定价；新增分销渠道走管理台字典页（`distribution_channel` 类型）。

# S1–S5 业务场景拍板决策清单（已全部定稿）

> 版本：v2.0　|　拍板日期：2026-07-09（北京时间）
> 配套文档：`docs/商品编码体系设计方案.md` §13/§14/§17；DIY 拍板决议见本文档 §11.8（2026-07-10 定稿），DIY 与 S1–S5 的衔接裁决见本文档 §12，落地记录见本文档 §13（DIY）/§14（S1–S5）
> 现状：10 张表 + 外键 + 索引 + 模型已建好（实连真实库确认），本清单 40 项已全部拍板，可直接施工。
>
> **总拍板（2026-07-09）：S1–S5 五个场景不分五期，一次性连续施工**（项目未上线、无兼容负担、可一次性投入）。
> **注意区分**：「一次性施工」指五个场景一次做完；各条决策里的**范围裁剪**（不做审批/部分收货/抽佣等）仍然生效——裁剪的是单场景内的复杂度，目的是长期维护成本低、技术债最小，与分期无关。凡标"首版不做"的项，后续要做时独立立项，不影响本次交付。
> 决策依据：真实库 `restaurant_points_dev` 实连核对（资产码、角色权限、现有生成器/账本模式），全部方案落在现有技术栈（Express + Sequelize + TransactionManager + item_ledger 双录 + 幂等键）内。

---

## 一、S1 采购单 / 进货管理

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 1 | 采购单号 `order_no` 怎么来 | 系统自动生成 `PO+日期+序号`（如 `PO20260706001`），复用现网 `TrackingCodeGenerator` 范式，不手填 | ✅ 按建议 |
| 2 | 是否要审批环节 | 不做审批，草稿→下单→到货直接走 | ✅ 按建议（首版不做，要做时独立立项） |
| 3 | ⚠️ 收货是否自动生成实物 `items` | 收货只记采购数量、**不自动铸造** `items` 实物（实物仍走现有商品/发货链路），避免两套库存打架 | ✅ 按建议 |
| 4 | 进货价 `purchase_price` 单位 | DECIMAL(10,2) 按「元」存（如 12.50） | ✅ 按建议 |
| 5 | 进货价回写 `exchange_item_suppliers.purchase_price` 规则 | 回写「最近一次进货价」，不做加权平均成本 | ✅ 按建议 |
| 6 | 供货质量评分 `quality_score`（0.0~10.0）谁打、何时打 | 先留空不启用，S1 稳定后再做人工评分入口 | ✅ 按建议（字段留空） |
| 7 | 是否支持部分收货（一单多次到货） | 不支持，一次性全收 | ✅ 按建议（首版不做） |
| 8 | 采购退货/退单 | 不做，只做正向进货 | ✅ 按建议（首版不做） |
| 9 | `received`（已收货）后单据锁定程度 | 收货后行不可改，只能整单作废（cancelled） | ✅ 按建议 |

---

## 二、S2 批次管理 / 一批一码

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 10 | 批次码 `batch_code` 怎么来 | 系统自动 `BC+日期+序号`，运营可读，非随机码；不允许手填 | ✅ 按建议 |
| 11 | ⚠️ 批次挂 SPU 还是 SKU | 允许两级：整款进货挂 SPU、分规格进货挂 SKU（表字段两者都可空） | ✅ 按建议 |
| 12 | 批次成本 `batch_cost` 来源 | 从采购单自动带入（S1 同批施工，直接联动）；无采购单时手填 | ✅ 按建议（一次性施工后 S1 联动为主路径） |
| 13 | 一个实物 `items` 只属一个批次（`batch_id` 单值） | 单值够用，无需一物多批 | ✅ 按建议 |
| 14 | ⚠️ 批次召回是什么动作 | 召回=把该批次实物标记状态（可追溯/暂停流通），不物理删除 | ✅ 按建议 |
| 15 | 防伪连号 `anti_fake_code` 做不做 | 不做（§3.7 预留字段留空），验真是独立子系统 | ✅ 按建议（首版不做） |
| 16 | 批次 `status`（active/inactive）业务含义 | active=在流通、inactive=已售罄/停用 | ✅ 按建议 |

---

## 三、S4 组合商品 / 套装 / 赠品

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 17 | ⚠️ 组合品定价 | 组合品独立定价（运营给套装单独定价），不自动汇总子项 | ✅ 按建议 |
| 18 | ⚠️ 下单时库存怎么扣 | 按 BOM 拆解扣子项库存，组合本身不备货 | ✅ 按建议 |
| 19 | 赠品 `is_gift` 价格如何计 | 赠品计价为 0，只占库存不计价 | ✅ 按建议 |
| 20 | 子项能否是另一个组合（嵌套） | 不允许嵌套，子项只能是普通 SPU/SKU（避免循环依赖） | ✅ 按建议 |
| 21 | 组合类型 `bundle_type`（suit 套装 / gift 赠品搭售）够不够 | 两种够用 | ✅ 定稿两种；后续加类型走字典扩展 |
| 22 | 履约方式 | 组合整单一起发货，不支持子项分开发 | ✅ 按建议 |
| 23 | 子项下架/删除时组合怎么办 | 外键 SET NULL；子项失效则组合自动置为不可售并提示运营 | ✅ 按建议 |

---

## 四、S5 第三方平台分销（淘宝/抖音）

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 24 | ⚠️ 支持哪些渠道 `channel` | 先 `taobao`/`douyin` 两个，做成字典可扩展 | ✅ 按建议（字典表，加渠道零 DDL——与 DIY 拍板⑤"开放集合不用 ENUM"同一设计原则） |
| 25 | ⚠️ 本次做到哪一步 | 只做「外部ID↔我方商品映射主数据管理」，真实 API 拉单/推库存另立项 | ✅ 按建议（API 对接独立立项，不进本次范围） |
| 26 | 价格策略 | 各渠道可独立加价（存渠道价），默认取我方价 | ✅ 按建议 |
| 27 | 库存策略 | 共享我方库存，不做渠道配额 | ✅ 按建议 |
| 28 | 一个我方商品能否映射同一渠道的多个外部ID | 不允许（一对一，防混乱），DB 唯一索引兜底 | ✅ 按建议 |
| 29 | 外部订单如何回流 | 不涉及（属对接子系统） | ✅ 按建议（随 #25 独立立项） |

---

## 五、S3 二手回流 / 寄卖 / 转赠

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 30 | ⚠️ 风控/合规规则 | 硬前置：反向资产流（用户→平台）需方向等价/向下 + 真实销毁校验 | ✅ 定稿默认标准：①反向资产流只允许**等价或向下**（寄卖成交回款 ≤ 该实物原兑换价值，超出部分不予受理）；②实物回流必须校验 `items` 状态机 + `item_ledger` 双录销毁/转移，禁止凭空生成；③寄卖上架必须人工审核（见 #37）。后续调整走系统配置，不改代码 |
| 31 | 寄卖定价 `list_price` 谁定 | 寄卖人自报价 + 平台审核核价 | ✅ 按建议 |
| 32 | ⚠️ 寄卖计价资产 `list_asset_code` 用什么 | 需指定真实资产码 | ✅ 定稿 **`star_stone`**（真实库 `material_asset_types` 核对：星石，form=currency，全站主货币，与 DIY/兑换同体系）；`points/budget_points` 禁用（与 DIY 支付白名单同口径） |
| 33 | 平台是否抽佣、比例 | 先不抽佣 | ✅ 按建议（首版不抽；佣金率做成系统配置项预留，启用时改配置不改表） |
| 34 | 回流后再上架 `relist_item_id` | 复用原 SPU 上架为二手（同款），不新建二手专属 SPU | ✅ 按建议 |
| 35 | 转赠是否需审核、有无次数/额度限制 | 走现有 `item_ledger` 流转 + 幂等键 | ✅ 定稿：转赠**免审核**，限额**每用户每日 5 次**（做成系统配置项可调），全程 `item_ledger` 双录 + 幂等键 |
| 36 | 寄卖物来源限制 | 只能是平台发出的、带 `tracking_code` 的正品实物 | ✅ 按建议（杜绝外部来路不明物） |
| 37 | 寄卖状态机 pending→listed 谁审核 | 需指定审核角色 | ✅ 定稿：`requireRoleLevel(100)` 管理员审核（与 #39 统一，不新增角色） |
| 38 | 二手商品是否给 C 端单独标识/空间展示 | 打「二手」标签，混在现有空间，不建独立专区 | ✅ 按建议 |

---

## 六、跨场景通用决策

| # | 决策点 | 建议 | 定稿 |
|---|---|---|---|
| 39 | 权限粒度 | 5 个管理功能统一 `requireRoleLevel(100)` 管理员可用（沿用现网），不拆采购员/仓管细分角色 | ✅ 按建议 |
| 40 | 前端页面形态 | S1/S2/S5/S3 各建独立管理页（仿供应商页），S4 组合并入兑换市场页的 Tab | ✅ 按建议（Alpine.js + Vite 现有模式） |

---

## 七、硬阻断项汇总 → **已全部解除**

| 场景 | 原硬阻断决策 | 解除依据 |
|---|---|---|
| S1 | #3 收货是否动实物库存 | ✅ 不自动铸造，实物走现有链路 |
| S2 | #11 批次粒度、#14 召回动作 | ✅ SPU/SKU 两级可空；召回=状态标记 |
| S4 | #17 定价、#18 扣库存 | ✅ 独立定价；BOM 拆解扣子项 |
| S5 | #24 渠道、#25 范围 | ✅ taobao/douyin 字典；只做映射主数据 |
| S3 | #30 风控标准、#32 计价资产 | ✅ 默认风控三条已定；`star_stone` 已定 |

---

## 八、施工方式（2026-07-09 改定：一次性连续施工，不分五期）

原五期分期计划作废，改为**单一项目连续施工**，但场景间的**依赖顺序保留为合并顺序**（依赖关系是客观的，与分期无关）：

```
S1 采购 → S2 批次（成本从 S1 带入）→ S4 组合 → S5 分销映射 → S3 二手寄卖（依赖 items/item_ledger 链路最深）
```

- 每个场景完成即补 Jest 测试（沿用 `tests/services/` 现有体系）并合并，**整体一次发布**；上线前空表零成本的特性不变。
- 所有"首版不做"项（审批、部分收货、采购退货、防伪码、渠道 API、抽佣、质量评分）不进本次范围，各自要做时独立立项——这是范围控制，不是分期。
- 可调业务参数（转赠限额、佣金率、风控阈值）一律做成系统配置项，调整不改代码不跑迁移。

> 本清单已定稿，直接回到 `docs/商品编码体系设计方案.md` §17 按上述顺序连续施工。

---

## 九、执行状态（2026-07-11 施工完成）

**40 项已全部落地或按修订裁决处理**，逐项落地口径、护栏实测、三项语义修订（#9/#14/#40）与两项推迟（#34/#38 回流上架、#25 渠道 API）见上文 **§14「S1–S5 业务逻辑落地完成记录」**。落地物清单：

- 5 个 Service + 5 组路由 + 5 个管理页 + 幂等全登记 + `BusinessSeqCodeGenerator` 单号生成器；
- S4 下单 BOM 拆解已接入兑换核心（`CoreService`），S3 转赠已上用户端（`/backpack/items/:id/transfer`）；
- 2 个新系统配置项（佣金率预留、转赠日限额）+ 1 次迁移（渠道价列 + 渠道字典种子）；
- 兑换订单「取消/拒绝不回补库存」历史缺陷已随本次施工修复（§14.5）。

验收：Jest 全绿（S1S5 26 / 兑换回归 25 / DIY 30，2026-07-11 审计闭环后计数）+ 质量门禁（ESLint / Prettier / api-contract / routes / admin build）全过 + PM2 健康 + `/health` 数据库与 Redis connected，真实库测试数据零残留。
