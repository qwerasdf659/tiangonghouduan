# 微信小程序前端对接文档：奖品图片显示

**日期**: 2026-05-20  
**问题**: 抽奖页面奖品区域图片不显示（空白方框）  
**状态**: 后端已修复，等待前端适配

---

## 问题现象

抽奖页面底部奖品列表中，"星石 ×30"、"星石 ×10" 等奖品显示为空白方框，没有图标。

## 根本原因

后端已在 `image.url` 字段返回了完整的图片 URL，但小程序前端未正确使用该字段渲染图片。

---

## 后端返回的数据结构

**接口**: `GET /api/v4/lottery/campaigns/CAMP20250901001/prizes`  
**认证**: 无需 Token（optionalAuth）

**单条奖品数据示例**:

```json
{
  "lottery_prize_id": 198,
  "prize_name": "星石 ×500",
  "prize_type": "virtual",
  "rarity_code": "legendary",
  "material_asset_code": "star_stone",
  "material_amount": "500",
  "material_display_name": "星石",
  "image": {
    "url": "https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/star-stone.png",
    "thumbnail_url": "https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/star-stone.png",
    "source": "material_icon"
  }
}
```

**关键字段说明**:

| 字段 | 说明 |
|------|------|
| `image.url` | 奖品图片完整 URL，直接用于 `<image src="">` |
| `image.thumbnail_url` | 缩略图 URL（当前与 url 相同） |
| `image.source` | 图片来源标识：`material_icon`=资产图标 / `media`=自定义上传 / `placeholder`=占位图 |
| `prize_name` | 奖品显示名称（已包含数量，如"星石 ×500"） |
| `material_asset_code` | 资产代码（`star_stone` / `red_core_shard` / `points`） |

---

## 完整奖品列表及图片 URL

| 奖品名称 | 图片文件 | 完整 URL |
|----------|----------|----------|
| 星石 ×500 | star-stone.png | https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/star-stone.png |
| 星石 ×200 | star-stone.png | 同上 |
| 星石 ×80 | star-stone.png | 同上 |
| 星石 ×50 | star-stone.png | 同上 |
| 星石 ×30 | star-stone.png | 同上 |
| 星石 ×10 | star-stone.png | 同上 |
| 红源晶碎片 ×50 | red-core-shard.png | https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/red-core-shard.png |
| 红源晶碎片 ×25 | red-core-shard.png | 同上 |
| 红源晶碎片 ×12 | red-core-shard.png | 同上 |
| 红源晶碎片 ×8 | red-core-shard.png | 同上 |
| 红源晶碎片 ×3 | red-core-shard.png | 同上 |
| 积分 ×10 | points.png | https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/points.png |

---

## 前端需要做的事

### 1. 配置合法域名

微信公众平台 → 开发管理 → 开发设置 → 服务器域名：

- **downloadFile 合法域名** 中添加：`https://omqktqrtntnn.sealosbja.site`

（如果已添加过 request 合法域名，downloadFile 也需要单独添加）

### 2. 使用 image.url 渲染图片

```html
<!-- 奖品列表项 -->
<image 
  src="{{prize.image.url}}" 
  mode="aspectFit"
  class="prize-icon"
/>
<text>{{prize.prize_name}}</text>
```

### 3. 不要做本地图标映射

后端已经根据 `material_asset_code` 自动返回了对应的图标 URL，前端直接使用 `image.url` 即可，不需要在小程序本地存放图标文件，也不需要做 asset_code → 图片的映射逻辑。

运营后续如果要换图标，直接在后端替换文件即可，前端无需改动。

---

## 验证方法

```bash
# 1. 验证接口返回（无需 Token）
curl https://omqktqrtntnn.sealosbja.site/api/v4/lottery/campaigns/CAMP20250901001/prizes

# 2. 验证图片可访问
curl -I https://omqktqrtntnn.sealosbja.site/admin/assets/icons/materials/star-stone.png
# 应返回 HTTP 200, content-type: image/png

# 3. 在小程序开发者工具中
# 打开 Network 面板，查看图片请求是否发出、是否被域名白名单拦截
```

---

## 注意事项

- 开发阶段可在小程序开发者工具中勾选"不校验合法域名"临时绕过
- 正式发布前必须在微信公众平台配置好合法域名
- 图片尺寸约 35-47KB，建议 `<image>` 组件设置固定宽高避免布局抖动
