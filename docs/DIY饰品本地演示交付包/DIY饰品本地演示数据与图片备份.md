# DIY 饰品「本地演示」数据与图片资源备份

> 版本：v1.0（2026-07-15） | 来源：微信小程序前端 `packageDIY/diy-lite/bead-data.ts` + `packageDIY/diy-lite/assets/`
> 用途：交付给后端数据库项目 / Web 管理后台前端项目，作为录入真实模板与素材的**参考样例**。
> 说明：本文件为「本地演示模式」的数据快照。演示数据仅前端写死用于离线体验（保存/下单禁用），
> 正式功能以后端为权威。字段命名全部对齐后端 snake_case，可直接照此录入。

---

## 一、总览

本地演示共分两类玩法、7 个演示模板、27 颗串珠素材 + 3 颗镶嵌宝石素材、35 张图片。

| 玩法 | 模板 | 品类 | 图片底图 |
|---|---|---|---|
| 串珠模式 | 手串（本地演示） | 手链/手串 | 无底图（沿圆形排珠） |
| 串珠模式 | 108 佛珠（本地演示） | 108佛珠 | `demo-mala-thumb.jpg`（列表缩略图） |
| 镶嵌模式 | 托帕石项链（本地演示） | 项链 | `demo-necklace-base.jpg` |
| 镶嵌模式 | 主石戒指（本地演示） | 戒指 | `demo-ring-base.jpg` |
| 镶嵌模式 | 水滴吊坠（本地演示） | 吊坠 | `demo-pendant-base.jpg` |
| 镶嵌模式 | 一对耳钉（本地演示） | 耳饰 | `demo-earrings-base.jpg` |
| 镶嵌模式 | 手机链包挂（本地演示） | 手机链包挂 | `demo-charm-base.jpg` |

> 串珠模板（手串/佛珠）共用同一套 27 颗水晶珠素材；镶嵌模板（项链/戒指/吊坠/耳饰/手机链）共用同一套 3 颗宝石素材。

---

## 二、串珠素材库（27 颗，对应 diy_materials 珠子）

> 字段口径：`material_code`=前端演示 id；`price` 为演示价（元），正式版由后端定价（星石/源晶）；
> `weight` 为按球体体积估算的演示克重（水晶密度 2.65 g/cm³）；`cord_occupy_mm` 为单颗沿绳占用毫米
> （圆珠=直径、药片=短边、跑环=长边），正式版由后端派生。`shape`：round 圆珠 / special 异形。

### 2.1 白水晶系（group_code=white）

| material_code | 名称 display_name | 直径mm | 尺寸文本 | 演示价 | shape | material_type | bore_orientation | size_length_mm | size_width_mm | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| white-jingti-12 | 净体白水晶 | 12 | 12mm | 15 | round | crystal | none | - | - | 12 | white-jingti-12.png |
| white-jingti-8 | 净体白水晶 | 8 | 8mm | 5 | round | crystal | none | - | - | 8 | white-jingti-8.png |
| white-naibai-12 | 奶白晶 | 12 | 12mm | 11 | round | stone | none | - | - | 12 | white-naibai-12.png |
| white-naibai-8 | 奶白晶 | 8 | 8mm | 4 | round | stone | none | - | - | 8 | white-naibai-8.png |
| white-hunsha-12 | 婚纱闪白阿塞 | 12 | 12mm | 8 | round | crystal | none | - | - | 12 | white-hunsha-12.png |
| white-hunsha-8 | 婚纱闪白阿塞 | 8 | 8mm | 3.5 | round | crystal | none | - | - | 8 | white-hunsha-8.png |
| white-fangtang-9 | 白水晶刻面方糖 | 9 | 9mm | 10 | round | metal | none | - | - | 9 | white-fangtang-9.png |
| white-yaopian | 白水晶药片珠 | 8.7 | 3.6mmx8.7mm | 5 | special | crystal | along_width | 8.7 | 3.6 | 3.6 | white-yaopian.png |
| white-paohuan | 白水晶跑环 | 14.5 | 4.5mmx14.5mm | 16 | special | crystal | along_length | 14.5 | 4.5 | 14.5 | white-paohuan.png |

### 2.2 粉水晶系（group_code=pink）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|
| pink-xingguang-12 | 星光粉晶 | 12 | 12mm | 28 | round | crystal | 12 | pink-xingguang-12.png |
| pink-xingguang-8 | 星光粉晶 | 8 | 8mm | 9 | round | crystal | 8 | pink-xingguang-8.png |
| pink-zifen-12 | 紫粉晶 | 12 | 12mm | 16 | round | crystal | 12 | pink-zifen-12.png |
| pink-zifen-8 | 紫粉晶 | 8 | 8mm | 6 | round | crystal | 8 | pink-zifen-8.png |
| pink-mitao-12 | 蜜桃粉晶 | 12 | 12mm | 13 | round | stone | 12 | pink-mitao-12.png |
| pink-mitao-8 | 蜜桃粉晶 | 8 | 8mm | 4 | round | stone | 8 | pink-mitao-8.png |

### 2.3 紫水晶系（group_code=purple）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | bore_orientation | size_length_mm | size_width_mm | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| purple-wulagui-12 | 乌拉圭紫水晶 | 12 | 12mm | 37 | round | crystal | none | - | - | 12 | purple-wulagui-12.png |
| purple-wulagui-8 | 乌拉圭紫水晶 | 8 | 8mm | 12 | round | crystal | none | - | - | 8 | purple-wulagui-8.png |
| purple-baxi-12 | 巴西紫水晶 | 12 | 12mm | 56 | round | crystal | none | - | - | 12 | purple-baxi-12.png |
| purple-baxi-8 | 巴西紫水晶 | 8 | 8mm | 18 | round | crystal | none | - | - | 8 | purple-baxi-8.png |
| purple-paohuan | 紫水晶跑环 | 14.5 | 4.2mmx14.5mm | 24 | special | crystal | along_length | 14.5 | 4.2 | 14.5 | purple-paohuan.png |
| purple-xunyicao-8 | 薰衣草紫水晶 | 8 | 8mm | 8 | round | matte | none | - | - | 8 | purple-xunyicao-8.png |

### 2.4 黄水晶系（group_code=yellow）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|
| yellow-baoli-10 | 暴力黄黄水晶 | 10 | 10mm | 67 | round | crystal | 10 | yellow-baoli-10.png |
| yellow-baoli-8 | 暴力黄黄水晶 | 8 | 8mm | 32 | round | crystal | 8 | yellow-baoli-8.png |
| yellow-ningmeng-12 | 透体柠檬黄水晶 | 12 | 12mm | 19 | round | crystal | 12 | yellow-ningmeng-12.png |
| yellow-ningmeng-8 | 透体柠檬黄水晶 | 8 | 8mm | 6 | round | crystal | 8 | yellow-ningmeng-8.png |
| yellow-huangta-12 | 黄塔晶 | 12 | 12mm | 20 | round | crystal | 12 | yellow-huangta-12.png |
| yellow-huangta-8 | 黄塔晶 | 8 | 8mm | 6.5 | round | crystal | 8 | yellow-huangta-8.png |

### 2.5 文案映射（寓意 meaning / 能量 energy / 搭配 pairing）

**寓意（按名称，同名不同尺寸共用）：**

| 名称 | meaning 寓意文案 |
|---|---|
| 净体白水晶 | 净化气场，提升专注与灵性，被誉为「水晶之王」。 |
| 奶白晶 | 温润柔和，助眠安神，适合日常佩戴。 |
| 婚纱闪白阿塞 | 通透闪耀，象征纯洁与新的开始。 |
| 白水晶刻面方糖 | 多切面折射光泽，招财纳福。 |
| 白水晶药片珠 | 小巧点缀，平衡整串比例。 |
| 白水晶跑环 | 管珠造型，串联点睛，增添层次。 |
| 星光粉晶 | 招桃花、旺人缘，柔化人际关系。 |
| 紫粉晶 | 兼具粉晶与紫晶能量，安抚情绪。 |
| 蜜桃粉晶 | 甜美温柔，提升亲和力与自信。 |
| 乌拉圭紫水晶 | 开智增慧，助眠安神，色泽浓郁。 |
| 巴西紫水晶 | 经典紫调，象征智慧与高贵。 |
| 紫水晶跑环 | 管珠造型，串联提亮整串气质。 |
| 薰衣草紫水晶 | 淡雅浪漫，舒缓压力，助放松。 |
| 暴力黄黄水晶 | 招正财、聚财气，色泽饱满明亮。 |
| 透体柠檬黄水晶 | 清透明黄，带来活力与好心情。 |
| 黄塔晶 | 能量聚焦，增强行动力与决断。 |

**能量 + 搭配（按 group_code）：**

| group_code | energy 能量 | pairing 搭配 |
|---|---|---|
| white | 净化 · 清明 | 百搭主珠，与紫/粉水晶皆宜 |
| pink | 爱情 · 人缘 | 搭配白水晶提亮，或紫水晶添柔 |
| purple | 智慧 · 安神 | 搭配白水晶点缀，气质沉静 |
| yellow | 财富 · 活力 | 搭配白水晶或作点睛主珠 |

> 说明：`five_elements`（五行）本地演示未写死（前端无权威依据），正式版由后端下发。

---

## 三、串珠模板配置（sizing_rules / bead_rules / capacity_rules）

### 3.1 手串模板（category=手链 191）

- `layout`: `{ shape: 'circle' }`
- `bead_rules`: `{ margin: 0, default_diameter: 8, allowed_diameters: [] }`（空=不限直径）
- `capacity_rules`: `{ min_beads: 1, max_beads: 0 }`（0=不限颗数上限）
- `sizing_rules.elastic_margin_mm`: 15（弹力/工艺余量 mm）
- `sizing_rules.default_size`: "15"
- `sizing_rules.size_options`（手围毫米字段口径：目标周长 = 手围 + 15mm 余量）：

| label | display | wrist_size_mm | target_length_mm | bead_count(兜底) |
|---|---|---|---|---|
| 12 | 手围 12cm（约 16 颗） | 120 | 135 | 16 |
| 13 | 手围 13cm（约 18 颗） | 130 | 145 | 18 |
| 14 | 手围 14cm（约 19 颗） | 140 | 155 | 19 |
| 15 | 手围 15cm（约 20 颗） | 150 | 165 | 20 |
| 16 | 手围 16cm（约 21 颗） | 160 | 175 | 21 |
| 17 | 手围 17cm（约 23 颗） | 170 | 185 | 23 |
| 18 | 手围 18cm（约 24 颗） | 180 | 195 | 24 |
| 15x2 | 手围 15cm 双圈（约 41 颗） | 150 | 330 | 41 |
| 15x3 | 手围 15cm 三圈（约 61 颗） | 150 | 495 | 61 |

### 3.2 108 佛珠模板（category=108佛珠 293）

- `layout`: `{ shape: 'circle' }`
- `bead_rules`: `{ margin: 0, default_diameter: 8, allowed_diameters: [] }`
- `capacity_rules`: `{ min_beads: 1, max_beads: 0 }`
- `sizing_rules.default_size`: "108x8"
- `sizing_rules.size_options`（佛珠按颗数制，无手围毫米）：

| label | display | bead_count |
|---|---|---|
| 54x8 | 54颗 · 8mm珠 | 54 |
| 108x6 | 108颗 · 6mm珠 | 108 |
| 108x8 | 108颗 · 8mm珠 | 108 |

---

## 四、镶嵌模板配置（layout.slot_definitions）

> 底图统一 640×960（2:3 竖幅）；槽位坐标为归一化中心点（0~1），字段完全对齐后端
> `slot_definitions`：`slot_id / label / x / y / width / height / required / allowed_diameters / allowed_shapes / allowed_group_codes`。
> 高度按底图宽高比折算保证正圆：`height = round(width × 640/960 × 1000)/1000`。

### 4.1 托帕石项链（category=项链 192，底图 demo-necklace-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.51 | 0.672 | 0.15 | 0.100 | true |

### 4.2 主石戒指（category=戒指 193，底图 demo-ring-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.505 | 0.285 | 0.17 | 0.113 | true |

### 4.3 水滴吊坠（category=吊坠 194，底图 demo-pendant-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.49 | 0.605 | 0.28 | 0.187 | true |

### 4.4 一对耳钉（category=耳饰 291，底图 demo-earrings-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| left | 左耳 | 0.295 | 0.565 | 0.24 | 0.160 | true |
| right | 右耳 | 0.705 | 0.565 | 0.24 | 0.160 | true |

### 4.5 手机链包挂（category=手机链包挂 292，底图 demo-charm-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| top | 上珠 | 0.502 | 0.362 | 0.145 | 0.097 | true |
| middle | 中珠 | 0.499 | 0.521 | 0.145 | 0.097 | true |
| bottom | 下珠 | 0.502 | 0.666 | 0.145 | 0.097 | true |

> 所有槽位的 `allowed_diameters / allowed_shapes / allowed_group_codes` 均为空数组（不限制），`rotation` 未设置（0）。

---

## 五、镶嵌宝石素材（3 颗，对应 diy_materials 宝石，供 5 个镶嵌模板共用）

> 演示价单位为"元"，正式版由后端定价（星石/源晶）。图片为白底顶视圆形切工宝石图。

| material_code | display_name | group_code | 直径mm | shape | 演示价 | meaning 寓意 | 图片 |
|---|---|---|---|---|---|---|---|
| demo-gem-blue | 托帕石·冰湖蓝 | blue | 8 | round | 30 | 十一月生辰石，象征真挚与好运，蓝调清澈如冰湖。 | demo-gem-blue.jpg |
| demo-gem-pink | 粉蓝宝·蔷薇粉 | red | 8 | round | 45 | 温柔而炽烈的蔷薇色调，寓意浪漫与忠贞。 | demo-gem-pink.jpg |
| demo-gem-green | 沙弗莱·翠绿 | green | 8 | round | 58 | 浓郁翠绿如初夏森林，象征生机与富足。 | demo-gem-green.jpg |

---

## 六、图片资源清单（35 张，路径 packageDIY/diy-lite/assets/）

### 6.1 镶嵌底图 + 宝石 + 缩略图（9 张 jpg）

| 文件名 | 大小(字节) | 用途 |
|---|---|---|
| demo-necklace-base.jpg | 38562 | 项链空托底图（640×960） |
| demo-ring-base.jpg | 39845 | 戒指空托底图 |
| demo-pendant-base.jpg | 50880 | 吊坠空托底图 |
| demo-earrings-base.jpg | 22737 | 耳钉空托底图（左右双槽） |
| demo-charm-base.jpg | 21312 | 手机链包挂底图（三珠位） |
| demo-gem-blue.jpg | 19347 | 托帕石·冰湖蓝 宝石图 |
| demo-gem-pink.jpg | 16618 | 粉蓝宝·蔷薇粉 宝石图 |
| demo-gem-green.jpg | 18850 | 沙弗莱·翠绿 宝石图 |
| demo-mala-thumb.jpg | 12546 | 108佛珠列表缩略图 |

### 6.2 串珠水晶素材图（26 张 png，透明通道，实物居中）

| 文件名 | 大小(字节) | 对应素材 |
|---|---|---|
| white-jingti-12.png | 54403 | 净体白水晶 12mm |
| white-jingti-8.png | 54403 | 净体白水晶 8mm |
| white-naibai-12.png | 37118 | 奶白晶 12mm |
| white-naibai-8.png | 37118 | 奶白晶 8mm |
| white-hunsha-12.png | 51515 | 婚纱闪白阿塞 12mm |
| white-hunsha-8.png | 51515 | 婚纱闪白阿塞 8mm |
| white-fangtang-9.png | 52883 | 白水晶刻面方糖 9mm |
| white-yaopian.png | 23449 | 白水晶药片珠（异形） |
| white-paohuan.png | 23269 | 白水晶跑环（异形管珠） |
| pink-xingguang-12.png | 38062 | 星光粉晶 12mm |
| pink-xingguang-8.png | 38062 | 星光粉晶 8mm |
| pink-zifen-12.png | 47710 | 紫粉晶 12mm |
| pink-zifen-8.png | 47710 | 紫粉晶 8mm |
| pink-mitao-12.png | 40316 | 蜜桃粉晶 12mm |
| pink-mitao-8.png | 40316 | 蜜桃粉晶 8mm |
| purple-wulagui-12.png | 53648 | 乌拉圭紫水晶 12mm |
| purple-wulagui-8.png | 53648 | 乌拉圭紫水晶 8mm |
| purple-baxi-12.png | 57163 | 巴西紫水晶 12mm |
| purple-baxi-8.png | 57163 | 巴西紫水晶 8mm |
| purple-paohuan.png | 27677 | 紫水晶跑环（异形管珠） |
| purple-xunyicao-8.png | 62808 | 薰衣草紫水晶 8mm |
| yellow-baoli-10.png | 57424 | 暴力黄黄水晶 10mm |
| yellow-baoli-8.png | 57424 | 暴力黄黄水晶 8mm |
| yellow-ningmeng-12.png | 51955 | 透体柠檬黄水晶 12mm |
| yellow-ningmeng-8.png | 51955 | 透体柠檬黄水晶 8mm |
| yellow-huangta-12.png | 67212 | 黄塔晶 12mm |
| yellow-huangta-8.png | 67212 | 黄塔晶 8mm |

> 交付图片时，直接拷贝 `packageDIY/diy-lite/assets/` 整个目录即可（共 35 个文件）。

---

## 七、字段口径备注（交付给后端/管理端时对齐）

1. **material_code**：本备份用的是前端演示 id（如 `white-jingti-8`）。正式录入后端由后端生成 `DM+日期+序列` 格式编码，前端会改用后端下发的 `material_code`，此处 id 仅作素材对应关系参考。
2. **price**：演示价为"元"，仅体验用。正式版按星石（`star_stone`）/源晶体系整数定价，由后端配置。
3. **cord_occupy_mm**：本备份已列出每颗的沿绳占用（圆珠=直径、药片=短边、跑环=长边），正式版由后端按 `bore_orientation + 物理尺寸` 派生下发，管理端只需录入 `diameter / size_length_mm / size_width_mm / bore_orientation`。
4. **weight**：演示克重为按球体体积估算，正式版由后端/运营录入真实克重。
5. **five_elements（五行）**：本地演示未提供，需运营补充。
6. **图片**：正式版由管理端上传到对象存储，前端改用后端下发的 `image_media.public_url`。

---

## 八、请【后端数据库项目】按本地演示落地的事

> 小程序前端已按接口契约完成全部对接代码（模板列表/详情/素材/手围估算/保存/确认/完成/小程序码），
> 渲染链路与本地演示一致。**前端无需再改**，只等后端有真实已发布模板 + 素材数据即可自动展示。
> 接口契约详见《DIY饰品定制-微信小程序前端对接文档.md》。

### 8.1 配置分类（categories）

确认 DIY 饰品下 7 个二级分类均存在且启用：手链 / 项链 / 戒指 / 吊坠 / 耳饰 / 手机链包挂 / 108佛珠。
若耳饰、手机链、佛珠尚未落库请补齐（前端本地演示分类 ID 为 291/292/293）。

### 8.2 录入素材库（diy_materials）

- 串珠水晶 27 颗：字段见第二节；异形珠（药片/跑环）务必录 `bore_orientation + size_length_mm + size_width_mm`，后端据此派生 `cord_occupy_mm`。
- 镶嵌宝石 3 颗：见第五节。
- 定价按星石 / 源晶体系整数定价（演示价"元"仅参考）；`five_elements` 需运营补充。

### 8.3 发布模板（diy_templates，status=published）

- 7 个模板的 `layout` / `bead_rules` / `sizing_rules` / `capacity_rules` 见第三、四节，可直接照录。
- ⚠️ 后端 `/templates` 只返回 `status='published'` 且 `is_enabled=true` 的模板——**必须发布，否则小程序列表看不到**。

### 8.4 接口

按《DIY饰品定制-微信小程序前端对接文档.md》13 个用户端端点；若均已实现并联通，本项无需额外开发。

---

## 九、请【Web 管理后台前端项目】做的事

1. **素材录入页**：支持第二节全部字段，尤其异形珠物理尺寸（diameter / size_length_mm / size_width_mm / bore_orientation）。
2. **镶嵌模板"位置标注"页**：用底图 + 可视化标注器（如 Konva）标注每个镶口的归一化坐标（x/y 中心、width/height 占比、rotation、required、allowed_* 约束），保存写回 `layout.slot_definitions`。坐标口径须与小程序一致（0~1 归一化、contain 缩放还原）；本地演示 5 个镶嵌模板实测坐标见第四节，可作标注校验参考。
3. **图片上传**：把 `packageDIY/diy-lite/assets/` 的 35 张图上传到对象存储，关联到模板底图（base_image_media）/素材图（image_media）。

---

## 十、请后端/运营确认的问题（前端等回复）

1. **7 个分类的真实落库 category_id** 是否为 191~194 + 291~293？若不同请给出实际 ID（前端按后端返回的 category_id 展示，不写死）。
2. **耳饰(291) / 手机链(292) / 108佛珠(293)** 三类是否会正式配置并发布模板？
3. **定价方案**：27 颗水晶珠 + 3 颗宝石的星石/源晶正式价格由谁定？
4. **五行（five_elements）** 是否录入？由谁提供各素材五行属性？
5. **图片**：35 张演示图直接用作正式图，还是运营替换为更高质量商品图？

---

## 十一、验收标准（落地后小程序即可自动生效）

- [ ] 7 个分类在小程序款式页 Tab 齐全
- [ ] 每个分类下至少 1 个 `published` 模板（串珠配手围档位，镶嵌配槽位+底图）
- [ ] 素材库录入完整（含异形珠物理尺寸、宝石），`/beads` 能按模板返回可用素材
- [ ] 串珠模板 `/estimate` 手围算珠返回正常
- [ ] 镶嵌模板槽位坐标与底图镶口位置吻合（小程序渲染不错位）
- [ ] 下单闭环可走通：保存草稿 → confirm 冻结 → complete 铸造物品

> 全部就绪后，小程序前端**无需改代码**，本地演示同款饰品即以真实数据形态自动上架。
> 交付物：本文档 + `packageDIY/diy-lite/assets/` 目录 35 张图片（整目录拷贝）。

---

# 附录 A：后端与管理端支持度审查（2026-07-15，直连真实库核对）

> 本附录由后端侧审查填写，回答"后端数据库项目 + Web 管理后台是否已支持本文档需求、还差什么"。
> **核对方式**：Node.js + mysql2 直连真实库 `restaurant_points_dev`（读 `.env`，非备份文件）+ 通读当前 worktree 实际代码（`routes/v4/diy.js`、`routes/v4/console/diy/*`、`services/diy/*`、`models/DiyTemplate.js`/`DiyWork.js`/`DiyMaterial.js`、`admin/src/modules/diy/*`）。不引用任何历史报告。
> **权威原则**：接口路径 / 字段名 / 响应格式 / 数据库查询以**后端数据库项目为唯一权威**；不兼容旧前端约定，前端直接改用后端字段名、不做映射层。

## A.0 一句话结论

**功能层面后端与管理端已 100% 支持本文档全部需求，无需新增任何接口或模型**；缺的只是**运营数据尚未录入/发布**（素材禁用无图、模板未发布无底图、图片未上传）。即：这是一个**"配置与数据落地"任务，不是"功能开发"任务**。本文档少量字段口径需按后端为准修正（见 A.4）。

## A.1 后端数据库项目支持度（技术栈：Express + Sequelize/MySQL8 + ServiceManager 三层架构）

功能已全部具备，逐项核对：

| 本文档需求 | 后端现状 | 结论 |
|---|---|---|
| 串珠 + 镶嵌两种模式 | `DiyTemplate.layout.shape` 已支持 circle/ellipse/arc/line/slots | ✅ 已支持 |
| 槽位位置标注（slot_definitions） | `layout.slot_definitions` JSON 字段完整（slot_id/x/y/width/height/rotation/allowed_*/required） | ✅ 已支持 |
| 手围算珠 | `GET /templates/:id/estimate`（TemplateService.estimateBeadCount，后端权威换算） | ✅ 已支持 |
| 异形珠物理尺寸 | `DiyMaterial` 有 `bore_orientation`/`size_length_mm`/`size_width_mm`，`deriveCordOccupyMm` 派生 `cord_occupy_mm` | ✅ 已支持 |
| 素材大类/材质档位/五行/寓意 | `item_type`/`material_type`/`five_elements`/`meaning`/`energy`/`pairing` 字段齐全 | ✅ 已支持 |
| 星石/源晶定价、整数定价、0 价禁用护栏 | `price`/`price_asset_code` + 整数校验 + `assertPriceGuard` | ✅ 已支持 |
| 用户端接口 | `routes/v4/diy.js` 13 端点全在（模板/素材/估算/作品/确认/完成/取消/小程序码） | ✅ 已支持 |
| 管理端接口 | `routes/v4/console/diy/{templates,materials,works,stats}.js`（模板 6 + 素材 5 + 作品 + 统计），role_level≥60 | ✅ 已支持 |
| 发布护栏 | 底图/预览图必填 + 串珠尺寸档位毫米数据 + 素材物理数据完整才可 published | ✅ 已支持 |
| 下单闭环 | confirm 冻结 → complete 扣减+铸造 items+写 exchange_records 发货 | ✅ 已支持 |

**后端需要新增的功能：无。** 现有模型、服务、路由、发布护栏完全覆盖本文档全部玩法。

### A.1.1 真实库现状（数据未就绪，非功能缺失）

直连 `restaurant_points_dev` 实测：

- **分类**：7 个 DIY 二级分类**全部已存在且启用**——手链191/项链192/戒指193/吊坠194/耳饰291/手机链包挂292/108佛珠293，父级均为 `category_id=190`（DIY饰品），字段用 `parent_category_id`。**本文档第十节问题 1（分类 ID 191~194+291~293）已确认全部正确落库，无需再问。**
- **素材**：库内 21 颗（本文档目标 30 颗），且 **20 颗 `is_enabled=0` 禁用、全部 `image_media_id=null` 无图**；分组码为 blue/green/orange/red/purple/yellow。
- **模板**：4 个，仅 1 个 published（id=65「项链12」，slots 模式但挂在吊坠194 分类且 `base_image_media_id=null`）。
- **作品**：0。

> 结论：功能通，但小程序现在拉不到可用数据（启用素材几乎为 0、无图、唯一发布模板无底图）。这是**录数据**的事，不是**改后端**的事。

## A.2 Web 管理后台前端支持度（技术栈：Vite + Alpine.js + Tailwind 多页应用）

功能页面均已存在，逐项核对：

| 本文档需求（第九节） | admin 现状 | 结论 |
|---|---|---|
| 素材录入页（全字段 + 异形珠几何 + 图片上传） | `admin/diy-material-management.html` + `diy-material-management.js`：display_name/material_name/group_code/diameter/shape/item_type/material_type/five_elements(多选)/weight/meaning/energy/pairing/size_length_mm/size_width_mm/bore_orientation/price/price_asset_code/stock/image 上传 全覆盖 | ✅ 已支持 |
| 镶嵌模板"位置标注"页（Konva 可视化） | `admin/diy-slot-editor.html` + `diy-slot-editor.js`：底图加载 + 拖拽/缩放/旋转标注椭圆槽位 + 0~1 归一化坐标 + 保存写回 `layout.slot_definitions` | ✅ 已支持 |
| 图片上传对象存储 | `admin/src/alpine/mixins/image-upload.js` 复用 SealosStorage，素材/模板图上传后回填 media_id | ✅ 已支持 |
| 模板管理（CRUD + 发布 + 进入标注器） | `diy-template-management.html` 有槽位编辑器入口 | ✅ 已支持 |
| 数据完备度看板 | 缺图/缺文案/0价启用/缺物理数据 快捷筛选（missing_image/missing_copy/zero_price_enabled/missing_physical） | ✅ 已支持（超出本文档要求） |

**管理端需要新增的功能：无。** 素材录入页、位置标注页、图片上传、模板发布全部就绪，且坐标口径（0~1 归一化 + contain 缩放还原）与小程序渲染公式一致。

### A.2.1 管理端字段口径与后端一致性（技术路线符合性）

- admin 的 `diy-material-management.js` 顶部注释已声明消费后端 `GET /api/v4/console/diy/materials` 的原始字段名（snake_case），**直接用后端字段、无映射层**——符合本项目"前端直接用后端字段名 + `check-frontend-mappings.cjs` 黑名单门禁"的既定技术路线。
- admin 分组下拉当前为 yellow/red/orange/green/blue/purple 六组（`GROUP_LABELS`），与真实库一致，与本文档演示的 white/pink 命名不同（见 A.4 口径冲突）。

## A.3 三方问题归属（谁的问题谁改）

**A. 后端数据库项目的问题：无功能缺陷。** 唯一"问题"是运营数据未就绪（不是代码问题）：素材禁用无图、模板未发布无底图。属数据录入范畴，由运营/管理员在 admin 操作，不需要改后端代码。

**B. Web 管理后台前端的问题：无功能缺陷。** 页面与能力齐全。唯一待确认：分组下拉标签是否要随最终分组命名口径微调（见 A.4，属配置不是缺陷）。

**C. 微信小程序前端的问题（需前端适配后端，不兼容旧写法）：**
1. **分组码命名**：小程序本地演示用 `white/pink/purple/yellow`，后端权威分组是 `blue/green/orange/red/purple/yellow`（真实库 + admin 一致）。**以后端为准**：小程序删除 white/pink 硬编码，改用后端 `/material-groups` 与 `/beads` 返回的 `group_code`，Tab 动态渲染，不写死分组。
2. **material_code**：本地演示用 `white-jingti-8` 之类自造 id，后端权威格式是 `DM+日期+序列`（如 `DM26033100000191`）。**以后端为准**：小程序改用后端下发的 `material_code`，删除本地演示 id 映射。
3. **price 单位**：本地演示按"元"，后端按星石/源晶整数定价。**以后端为准**：小程序改用后端 `price`+`price_asset_code`，删"元"文案。
4. **cord_occupy_mm**：本地演示前端自算，后端已派生下发。**以后端为准**：小程序直接累加后端 `cord_occupy_mm`，删除前端按形状分支的自算逻辑。
5. **图片**：本地演示读 `packageDIY/diy-lite/assets/` 本地图，正式改用后端 `image_media.public_url`。**以后端为准**：小程序改读后端媒体 URL，本地图仅作离线演示回退。

> 以上第 1~5 项均为"小程序删除本地写死数据、改用后端字段"的适配，符合"不兼容旧内容、前端适配后端、直接用后端字段名不做映射层"的原则。小程序接口契约本身已对齐（见《DIY饰品定制-微信小程序前端对接文档.md》），无需改接口调用，只需改数据来源。

## A.4 字段口径冲突（录入前必须先统一，否则三端错位）

| 冲突项 | 本地演示（小程序） | 后端权威（真实库+admin） | 定案方向 |
|---|---|---|---|
| 分组码 group_code | white/pink/purple/yellow | blue/green/orange/red/purple/yellow | 以后端六组为准；白/粉水晶归入现有 group（如白→单列或并入既有色系，需拍板 1） |
| material_code | white-jingti-8 | DM+日期+序列 | 以后端为准，小程序改用后端下发值 |
| price 单位 | 元 | 星石/源晶整数 | 以后端为准（需拍板 2 定正式价） |
| 五行 five_elements | 未提供 | 字段已就绪，库内为空 | 运营补录（需拍板 3） |

## A.5 需要你拍板的事项

| # | 决策点 | 说明 | 建议 |
|---|---|---|---|
| 1 | **分组码最终命名** | 后端权威六组 blue/green/orange/red/purple/yellow 里没有 white(白水晶)/pink(粉晶)。白水晶系 9 颗、粉晶系要归到哪个 group？是新增 white/pink 两个 group_code，还是并入现有色系？ | 新增 white/pink 两组（水晶按色系分类最直观，group_code 是自由字符串，后端无枚举约束，零成本） |
| 2 | **正式定价** | 27 珠+3 宝石的星石/源晶正式价由谁定？演示价（元）仅参考 | 运营出价，整数，按 star_stone |
| 3 | **五行属性** | five_elements 字段就绪但库内全空，谁提供各素材五行？ | 运营补录，缺失不影响下单（仅雷达图玩法） |
| 4 | **现存 21 颗禁用素材处置** | 库里 20 颗禁用+全无图。是启用补图复用，还是废弃按交付包 30 颗重录？ | 废弃重录（现存分组/命名与交付包不一致，重录更干净，符合"不兼容旧数据、降低技术债"原则） |
| 5 | **是否清掉 4 个旧模板** | 现存 4 模板（含挂错分类无底图的 id=65）与交付包 7 模板对不上 | 归档/删除旧的，按交付包 7 模板重建 |
| 6 | **图片是否直接用演示图** | 35 张演示图直接作正式图，还是运营替换高质量商品图？ | 先用演示图跑通，后续替换（image_media 可随时换） |

## A.6 执行步骤（数据落地，非开发；一次性投入、不留旧数据）

> 前提：功能零开发。以下全是 admin 后台操作 + 数据录入，走已有的 console/diy 接口，不写迁移、不改代码。

1. **拍板前置**：先定 A.5 的 6 项（尤其 1/4/5 决定录入口径）。
2. **图片上传**（管理端）：把 `assets/` 35 张图经 admin 图片上传（SealosStorage）传入对象存储，得到各自 media_id。
3. **清理旧数据**（管理端，拍板 4/5 通过后）：归档/删除现存 4 模板与 21 颗禁用素材（走 DELETE console/diy 接口；有作品的模板不可删，当前作品数为 0，可清）。
4. **录素材**（管理端）：按本文档二/五节录 30 颗（27 珠+3 宝石），异形珠必填 bore_orientation+size_length_mm+size_width_mm，关联 image_media，star_stone 整数定价，`is_enabled=true`。分组按拍板 1 命名。
5. **录模板 + 标注**（管理端）：按三/四节建 7 模板，串珠模板配 sizing_rules 手围档位，镶嵌模板进"位置标注"页（diy-slot-editor）按第四节坐标标注槽位、关联底图。
6. **发布**（管理端）：逐个模板走 PUT `/status` 置 `published`（发布护栏会校验底图/尺寸/素材物理数据，缺则报错补齐）。
7. **小程序适配**（前端）：按 A.3 第 1~5 项删除本地写死数据、改用后端字段（分组/编码/价格/长度/图片）。
8. **验收**：按第十一节清单 + 小程序拉真实数据渲染不错位、下单闭环走通。

## A.7 可复用 / 可扩展盘点（基于后端现有技术栈，不引入新框架）

**可复用（零新增）：**
- 后端 DiyServiceFacade（getService('diy') 保键）+ TemplateService/WorkService/MaterialService/QRCodeService 四子服务，本次全部复用
- 发布护栏 `_assertPublishable`、沿绳占用派生 `deriveCordOccupyMm`、手围换算 `estimateBeadCount`——运营数据一录即生效
- admin 的 image-upload mixin、diy-slot-editor（Konva 标注器）、素材完备度看板
- 分类体系（190 DIY饰品 + 7 二级分类已就位）

**可扩展（字段已预留，无需改表）：**
- `group_code` 是自由字符串，新增 white/pink 分组零成本（无枚举约束）
- `meta` JSON 字段（模板/素材都有）可承接未来扩展（如折扣规则）
- `item_type`（beads/accessories/pendants）支持未来加隔片/佛头/流苏配饰
- `five_elements` 雷达图玩法数据源已就绪，运营补录即启用
- FeatureFlag 机制可用于 DIY 玩法灰度

**符合性总结**：本方案完全在后端现有 Express+Sequelize+ServiceManager 三层架构、admin 现有 Vite+Alpine+Tailwind 多页架构内完成，不引入任何新技术、不新增接口/模型/表，仅录数据 + 小程序改数据来源，是长期维护成本最低的路径。

---

# 附录 B：拍板项行业对照与选型建议（2026-07-15）

> 针对 A.5 的 6 个拍板项，给出大厂（美团/腾讯/阿里）、小公司、游戏公司、活动策划公司、游戏虚拟物品/小众二手平台、奢侈品/快消品公司各自怎么做，差异在哪，以及**基于本项目现有技术栈（Express+Sequelize+MySQL8+ServiceManager 三层、admin Vite+Alpine）、未上线可一次性投入、不兼容旧数据、长期维护成本最低**的选型建议。
> 结论先行：本项目 DIY 本质是**「配置驱动的轻定制商品」**，不是重交易/重供应链系统，应走**大厂的"字典/配置化 + 素材库"轻量做法**，避免游戏公司式的重引擎和小公司式的写死。

## B.0 六个拍板项一览

| # | 拍板项 | 一句话建议 |
|---|---|---|
| 1 | 分组码命名 | 新增 white/pink 两组，group_code 保持自由字符串 |
| 2 | 正式定价 | 运营在 admin 配置，星石整数定价，不硬编码 |
| 3 | 五行属性 | 运营补录，作为可选展示维度，缺失不阻断 |
| 4 | 21 颗禁用素材 | 废弃重录（不兼容旧数据，最干净） |
| 5 | 4 个旧模板 | 归档/删除重建 |
| 6 | 图片 | 先用演示图跑通，后续替换 |

## B.1 拍板项 1：素材分组（group_code）设计

**问题**：后端权威六组无 white/pink，白/粉水晶归哪？新增分组还是并入现有？

| 阵营 | 做法 |
|---|---|
| 阿里/京东（大厂电商） | 商品属性走「属性字典 + 属性值」（SPU attribute），颜色是一个可枚举扩展的字典维度，加值只是插一行字典，从不改表结构 |
| 美团（到店/商品） | 后台配置化标签体系，标签自由增删，前端动态渲染筛选项，绝不前端写死 |
| 小公司 | 前端 hardcode 一个颜色数组，加颜色要改前端发版——本文档小程序演示的 white/pink 写死正是此模式 |
| 游戏公司 | 道具走「稀有度/品质/元素」等强枚举（DB ENUM 或配置表），因为要参与掉率/合成等强逻辑计算 |
| 奢侈品/快消 | 商品分类走标准类目树（GPC/内部类目），颜色是 SKU 规格维度不是分类 |

**差异**：核心分歧是"分组是强枚举还是自由字典"。游戏公司因为分组参与数值逻辑必须强枚举；电商/到店因为分组只用于展示筛选，一律做成自由字典可动态扩展。

**本项目现状**：`DiyMaterial.group_code` 是 `STRING(50)` **自由字符串、无 ENUM 约束**（已核实模型），且 admin 分组下拉是前端常量 `GROUP_LABELS`。这天然就是"大厂字典化"的底子——加一个 group_code 零改表、零迁移。

**建议（选大厂字典化做法）**：新增 `white`(白水晶系) / `pink`(粉晶系) 两个 group_code，共八组。理由：① 后端 group_code 本就是自由字符串，加值零成本，完全符合现有技术栈；② 水晶按色系分组对用户最直观；③ 唯一需同步的是 admin 的 `GROUP_LABELS`/`ALL_GROUP_OPTIONS` 加两行常量（前端适配后端，不做映射）。**不建议**把白/粉硬塞进现有色系（语义错乱），更**不建议**为此上属性字典表（DIY 分组维度单一，上字典表是过度设计、增加技术债）。

> 长期维护视角：小程序应删掉本地 white/pink 硬编码，改从后端 `/material-groups` 动态拉分组渲染 Tab——这样以后运营再加"绿幽灵""钛晶"等分组，三端零改代码。这是本项目从"小公司写死"升级到"大厂字典化"的关键一步。

## B.2 拍板项 2：定价体系（price / price_asset_code）

| 阵营 | 做法 |
|---|---|
| 大厂电商 | 价格是运营/商家在后台配置的数据，含定价中心、改价审计，绝不进代码 |
| 游戏公司 | 虚拟货币计价（钻石/点券），价格配置在后台数值表，支持活动折扣倍率 |
| 活动策划公司 | 积分/权益计价，按活动配置，强调可运营调整 |
| 小公司 | 前端/代码写死价格，改价发版 |
| 奢侈品 | 一口价 + 强管控，价格由总部统一下发 |

**本项目现状**：`DiyMaterial.price`(DECIMAL, 强制整数校验) + `price_asset_code`(星石/源晶，禁 points)，confirm 时**服务端权威计价**（不信任前端），已是大厂/游戏标准形态。

**建议**：运营在 admin 素材录入页按 `star_stone` 整数定价，价格是**数据不是代码**。演示价（元）仅参考，落地由运营出正式星石价。本项目已具备服务端权威定价 + 整数护栏 + 0 价禁用护栏，无需任何改动，只等运营填数。若未来要做活动折扣，用素材/模板的 `meta` JSON 承接折扣规则即可，不改表。

## B.3 拍板项 3：五行属性（five_elements）

| 阵营 | 做法 |
|---|---|
| 大厂 | 非核心的"内容标签"走可选字段，缺失不阻断主流程（渐进式补全） |
| 游戏公司 | 若参与数值（如五行相生加成）则强制必填并参与计算；纯展示则可选 |
| 活动策划/内容电商 | 玄学/内容属性作运营软标签，用于种草文案与筛选，非必填 |
| 小公司 | 要么不做，要么写死在前端 |

**本项目现状**：`five_elements` STRING(50) 可空，逗号分隔多值，注释标明是"五行雷达图玩法数据源"，admin 已有多选录入。

**建议**：作为**可选展示维度**，运营渐进补录，**缺失不阻断下单**（后端已 allowNull）。当前作"种草/详情展示 + 未来雷达图玩法"用途，不参与计价/校验逻辑。谁提供：运营按素材属性补录。这符合大厂"非核心属性渐进补全"做法，也匹配本项目玄学饰品的商业模式。

## B.4 拍板项 4 & 5：旧数据处置（21 颗禁用素材 + 4 个旧模板）

这两项本质是同一个问题：**未上线阶段，脏的存量数据是清掉重录还是修修补补复用？**

| 阵营 | 做法 |
|---|---|
| 大厂 | 上线前有专门的"数据初始化/灰度数据清理"，测试脏数据一律 wipe，不带进生产 |
| 游戏公司 | 内测数据（角色/道具）删档是标配，正式开服从干净数据起步 |
| 小公司 | 常把测试数据留到生产，日后成为脏数据源头（技术债起点） |
| 奢侈品/快消 | 商品主数据（MDM）有严格准入，不合规数据不进主库 |

**差异**：大厂/游戏公司在未上线窗口一律选"清干净重来"；小公司图省事复用脏数据，埋下长期维护成本。

**本项目现状**：21 颗素材分组命名与交付包不一致、20 颗禁用、全无图；4 个模板与交付包 7 个对不上，且 id=65 挂错分类无底图。作品数为 0（无外键阻塞，可安全删）。

**建议（选大厂/游戏"删档重来"）**：**废弃重录**。理由完全契合你的三个前提——① 未上线：删数据零业务影响；② 愿一次性投入：重录 30 素材+7 模板成本可控；③ 不兼容旧数据/降低技术债：现存数据分组命名、字段完整度都与目标不一致，修补反而留下两套口径混用的隐患。清理走已有的 DELETE console/diy 接口即可（作品 0 无阻塞），不需要写迁移脚本。**不建议**在禁用素材上逐个改分组/补图复用——命名体系都不同，修补等于制造技术债。

## B.5 拍板项 6：图片素材

| 阵营 | 做法 |
|---|---|
| 大厂电商 | 商品图有拍摄规范 + CDN + 多规格衍生图，图与商品数据解耦（换图不动数据） |
| 游戏公司 | 美术资源版本化管理，可热更 |
| 小公司 | 图片和代码/本地耦合，换图麻烦 |
| 奢侈品 | 极高图片规范，专业拍摄 |

**本项目现状**：`image_media_id` 外键关联 `media_files`，走 SealosStorage 对象存储 + 衍生图（w375/w750/w1080），图与素材数据解耦。

**建议**：**先用 35 张演示图跑通全链路，后续运营随时替换高质量商品图**（换 image_media 不动素材数据，符合大厂"图数据解耦"）。这是成本最低的路径：不阻塞联调，上线前再由运营替换正式商品图。

## B.6 DIY 定制商品的商业模式定位（决定整体选型）

一个更高层的判断：**你的 DIY 属于哪类系统，决定了别过度设计**。

| 参照系 | 是否适合本项目 | 原因 |
|---|---|---|
| 大厂电商「配置化商品 + 素材库 + 后台字典」 | ✅ **最适合** | DIY 本质是"模板+素材配置驱动的轻定制商品"，与后端现有三层+字典化底子天然契合 |
| 游戏公司「装备合成引擎 + 强枚举数值」 | ❌ 过重 | DIY 无掉率/合成/数值平衡，上强引擎是过度设计、制造技术债 |
| 虚拟物品/二手交易平台「C2C 撮合 + 寄售」 | ❌ 不适用 | DIY 是 B2C 定制履约，非用户间交易（项目 C2C 已下线） |
| 奢侈品「MDM 主数据 + 强管控 + 一口价」 | ⚠️ 部分借鉴 | 借鉴"素材主数据准入、图片规范"，但不需要那套重管控 |
| 小公司「前端写死」 | ❌ 反面教材 | 正是要摆脱的模式（本地演示的 white/pink 硬编码） |

**最终结论**：本项目 DIY 走**大厂电商的"配置化 + 素材库 + 后台字典化"轻量做法**最合适，且后端现有技术栈（Sequelize 模型 + group_code 自由字符串 + meta JSON 扩展位 + 服务端权威计价 + 发布护栏 + 对象存储解耦）**已经就是这个形态**——不需要新建任何东西，只需：① 运营录干净数据；② 小程序从"写死"改为"读后端字典"。这就是长期维护成本最低、技术债最少的路径。

## B.7 拍板汇总（请逐项确认）

| # | 决策点 | 推荐方案（行业对照后） | 你的决定 |
|---|---|---|---|
| 1 | 分组命名 | 新增 white/pink 两组（大厂字典化）；小程序改读后端分组不写死 | ☐ |
| 2 | 定价 | 运营在 admin 按星石整数定价，价格是数据 | ☐ |
| 3 | 五行 | 可选展示维度，运营渐进补录，不阻断下单 | ☐ |
| 4 | 21 颗旧素材 | 废弃重录（未上线删档重来） | ☐ |
| 5 | 4 个旧模板 | 归档/删除，按 7 模板重建 | ☐ |
| 6 | 图片 | 先用演示图跑通，后续运营替换 | ☐ |
| 7 | 整体路线 | 大厂电商"配置化+素材库+字典化"轻量做法，不上游戏引擎/不过度设计 | ☐ |
