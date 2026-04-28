## 后端需求：宝石素材图片透明边距裁剪（trim）

### 状态：已完成 ✅

后端已实现并执行完毕，以下为实施记录和前端对接说明。

---

### 问题描述

当前后端存储的宝石素材图片（diy_materials 表的 image_media）包含大量透明边距（PNG 透明背景），
实际宝石内容只占图片中心约 50-60% 区域。

这导致小程序前端在镶嵌模式下，宝石图片按槽位大小绘制后，宝石内容无法填满标注区域，
产生明显留白（实测覆盖率仅 81.2%）。

### 已完成的后端修复

#### 1. 已有素材批量裁剪（已执行）

已对 diy_materials 表中所有 PNG/WebP 素材执行 `sharp.trim()` 裁剪：

| 素材 | 裁剪前 | 裁剪后 | 宽度减少 | 高度减少 |
|------|--------|--------|----------|----------|
| 海蓝宝(ID:17) | 1827x2268 | 773x1026 | 57.7% | 54.8% |

原图和缩略图均已重新上传覆盖，`media_files` 表的 `width/height` 已同步更新。

#### 2. 新上传自动裁剪（已接通）

Web 管理后台 DIY 材料管理页面上传素材图片时，已自动传递 `trim_transparent: true` 参数。
后端 `MediaService.upload()` 会在存储前自动执行 `sharp().trim()` 裁剪透明边距。

**后续新增的素材图片无需任何额外操作，上传即自动裁剪。**

---

### 微信小程序前端对接说明

#### 核心变更：素材图片已无透明边距

裁剪后的素材图片，宝石内容直接占满整张图片（四边透明边距 ≤ 2px）。

**前端渲染逻辑调整：**

1. **如果前端之前有"运行时像素扫描"兜底逻辑** — 可以保留（向后兼容），也可以移除（不再需要）
2. **宝石图片直接按槽位尺寸绘制即可** — 不再需要额外的缩放补偿

#### 槽位坐标系说明（重要）

`GET /api/v4/diy/templates/:id` 返回的 `layout.slot_definitions` 中：

| 字段 | 含义 | 坐标系 |
|------|------|--------|
| `x` | 槽位**中心点** X 坐标 | 归一化 (0~1)，相对于底图宽度 |
| `y` | 槽位**中心点** Y 坐标 | 归一化 (0~1)，相对于底图高度 |
| `width` | 槽位宽度 | 归一化 (0~1)，相对于底图宽度 |
| `height` | 槽位高度 | 归一化 (0~1)，相对于底图高度 |

**正确的渲染公式：**

```javascript
// 假设底图在小程序中的实际渲染尺寸为 imgWidth x imgHeight
const slotCenterX = slot.x * imgWidth    // 槽位中心 X（像素）
const slotCenterY = slot.y * imgHeight   // 槽位中心 Y（像素）
const slotW = slot.width * imgWidth      // 槽位宽度（像素）
const slotH = slot.height * imgHeight    // 槽位高度（像素）

// 宝石图片以槽位中心为基准，cover 模式绘制
// 宝石左上角坐标：
const gemLeft = slotCenterX - slotW / 2
const gemTop = slotCenterY - slotH / 2

// Canvas drawImage:
ctx.drawImage(gemImage, gemLeft, gemTop, slotW, slotH)
```

**注意：x, y 是中心点坐标，不是左上角坐标。**

#### 验证方法

裁剪后的素材图片 URL 不变（同一个 object_key），但内容已更新。
如果小程序有图片缓存，需要清除缓存后重新加载才能看到效果。

---

### 影响范围

- 表：`diy_materials`
- 字段：`image_media`（关联 media_files 表）
- API：`GET /api/v4/diy/templates/:id/beads` 返回的 `image_media.public_url` 和 `thumbnails`
- 图片 URL 不变，内容已更新（裁剪后的版本）
