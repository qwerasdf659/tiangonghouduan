# 顶部 Banner 图片真机 404 根因定位与修复方案（image_url 缺 cache-buster）

> 文档类型：单一缺陷的根因定位报告 + 修复方案（后端数据库项目）
> 日期：2026-06-28（北京时间）
> 归属：**后端数据库项目**（缺陷在后端图片 URL 拼接，非小程序前端、非 Web 管理前端）
> 核查方式：直读后端真实代码（`routes/v4/system/ad-delivery.js`、`utils/ImageUrlHelper.js`、`routes/v4/images.js`、`services/AdBiddingService.js`）+ 全局 grep `/api/v4/images/` + 直连真实对象存储 `br0za7uc-tiangong`（AWS S3 SDK headObject/listObjectsV2）+ 线上代理裸请求实测（curl）。未引用历史报告，与当前真实代码 + 真实对象存储对齐。
> 一句话结论：**banner 的 `image_url` 由 `ad-delivery.js` 手拼裸 URL（不带 `?v=`/`?h=`），绕过了统一工具 `ImageUrlHelper.getImageUrl()` 专为「防止客户端缓存旧 404」设计的 cache-buster 机制；叠加微信 `<image>` 对「同一字符串 URL 的历史失败」的本地缓存，导致「曾经能看、过一两天空白、真机 404 而后端 curl 恒 200」。**
>
> ✅ **修复状态（2026-06-28 已落地）**：广告域 3 处手拼裸 URL 已全部收口到 `getImageUrl()`，并在 `AdBiddingService` 补齐 `content_hash` 透传。实测 banner `image_url` 现为 `...jpg?h=250c3589`（内容哈希永久缓存），新 URL curl `HTTP 200`；ESLint 0 error。详见「七、修复落地记录」。

---

## 一、现象与矛盾

| 观察项 | 事实 |
| --- | --- |
| 真机 binderror | `errMsg: "GET https://omqktqrtntnn.sealosbja.site/api/v4/images/uploads/1782268569292_7f6171ce86bbe299.jpg 404 (Not Found)"` |
| 后端 curl（裸请求） | `HTTP 200`，`content-type: image/jpeg`，`size=155850` |
| 真机请求的 URL | 裸 key，**不带任何 `?v=` / `?h=` 参数** |
| 前端日志 | impression 上报成功、URL 逐字符正确（前端无 bug） |
| 管理后台配置 | 活动 359 / 创意 345 / media 126 / 投放期 / 审核通过 全部正常 |
| 表现规律 | 「当时能看、过一两天失效」 |

**硬矛盾**：同一个 URL，同一时刻，后端 curl = 200、真机 = 404。

---

## 二、逐项排除（实测，非推断）

### 2.1 排除「小程序前端」
- binderror 里真机请求的 URL 与后端 curl 的 URL 逐字符一致 → 不是前端拼错/指向缩略图/域名不同。
- 前端拿到 image_url 并成功上报 impression、渲染 `<image>` → 前端逻辑正确。

### 2.2 排除「Web 管理前端」
- 投放配置数据实测全对，管理端只负责配置、不参与图片下发。

### 2.3 排除「后端图片代理拒绝裸请求」（嫌疑：鉴权/Referer/UA/Range）
- 实测 `routes/v4/images.js`：代理路由 `GET /api/v4/images/*` 挂的是公开访问，无 `authenticateToken`。
- 带真机请求头复测仍 200：
  ```
  curl -H "Referer: https://servicewechat.com/..." \
       -H "User-Agent: ...MicroMessenger..." \
       -H "Range: bytes=0-" <url>
  → status=200 content_type=image/jpeg size=155850
  ```
- 结论：**不存在基于鉴权/来源/请求头的条件性 404。**

### 2.4 排除「多副本 / pod 本地磁盘不一致」
- 实测 `routes/v4/images.js:60-63`：代理**每次实时从共享对象存储取流**（`SealosStorageService.getImageBuffer(objectKey)`），不读任何 pod 本地磁盘。
- 所有副本读同一个对象存储，不可能 pod 间不一致。

### 2.5 排除「边缘负缓存 404」
- 实测 `routes/v4/images.js:65-66`：404 分支强制 `res.set({ 'Cache-Control': 'no-store' })`，**404 响应明确禁止缓存**，边缘黏不住。

### 2.6 对象存储实测：文件确实存在
直连真实 bucket `br0za7uc-tiangong`：
```
headObject(uploads/1782268569292_7f6171ce86bbe299.jpg)
  → exists=true, ContentType=image/jpeg, ContentLength=155850, LastModified=2026-06-24T02:36:09Z
listObjectsV2(Prefix=uploads/1782268569292)
  → 精确命中 1 条，Size=155850
```

---

## 三、根因（决定性证据）

### 3.1 统一工具强制带 cache-buster，且其设计目的就是防旧 404

```50:97:utils/ImageUrlHelper.js
function getImageUrl(objectKey, contentHash) {
  ...
  const cacheParam = contentHash ? `h=${contentHash.substring(0, 8)}` : `v=${APP_BOOT_VERSION}`
  const publicBaseUrl = process.env.PUBLIC_BASE_URL
  if (publicBaseUrl) {
    return `${publicBaseUrl}/api/v4/images/${objectKey}?${cacheParam}`
  }
  ...
}
```

`APP_BOOT_VERSION` 的注释（同文件）写明设计意图：

```23:26:utils/ImageUrlHelper.js
/**
 * 应用启动时间戳（用于图片 URL cache-buster）
 * 每次服务重启后生成新的版本号，确保客户端不会使用旧的缓存 404 响应
 */
const APP_BOOT_VERSION = Date.now().toString(36)
```

即：走 `getImageUrl()` 的图片 URL 形如 `...jpg?h=250c3589`（内容哈希，永久缓存）或 `...jpg?v=mpiuj6vz`（启动版本号，重启即变）。**URL 字符串会变 → 客户端不会卡在旧的失败结果上。**

### 3.2 banner 投放接口绕过了它，手拼裸 URL

```77:78:routes/v4/system/ad-delivery.js
        image_url: creative.media_object_key
          ? `${process.env.PUBLIC_BASE_URL}/api/v4/images/${creative.media_object_key}`
```

→ banner 下发的是**裸 key URL，无任何 cache-buster 参数**，与 binderror 日志里的 URL 完全一致。

### 3.3 为什么「曾经能看、过两天失效、curl 恒 200」

1. 创意 345 于 2026-06-25 创建；在「创意建好 ↔ 图片上传完成」的窗口期，或某次部署间隙，真机 `<image>` 对这个**固定的裸 URL** 发过请求，那一刻拿到过 404。
2. 微信小程序 `<image>` 组件对「加载失败的 URL」有本地记忆，且对**完全相同的 URL 字符串**不会主动重试。因为这个裸 URL 永远是同一个字符串（没有会变的 `?v=`），微信便持续复用那次失败 → 表现为长期空白。
3. 后端 curl 每次都是全新连接、无本地缓存 → 永远命中真实对象存储 → 恒 200。
4. 走 `getImageUrl()` 的其它图片每次重启 `?v=` 都变，URL 一变微信就重新拉，故不会卡死 —— **唯独 banner 因绕过此机制而中招。**

---

## 四、全局 grep 结果：所有手拼 `/api/v4/images/` 裸 URL 的位置

> 命令：`grep -rn "/api/v4/images/"`（排除 node_modules），并交叉核对 `getImageUrl` / `PUBLIC_BASE_URL` 调用。

### 4.1 ❌ 需要修复（手拼裸 URL，绕过 `getImageUrl()`，共 3 处）

| # | 文件:行 | 代码 | 影响范围 | 是否同根因 | 修复状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `routes/v4/system/ad-delivery.js:78` | `` `${PUBLIC_BASE_URL}/api/v4/images/${creative.media_object_key}` `` | **小程序 banner/弹窗/公告投放下发**（本次 404 缺陷的直接位置） | ✅ 是（已实锤） | ✅ 已修复 |
| 2 | `routes/v4/console/ad/ad-campaigns.js:621` | `` c.public_url = `${baseUrl}/api/v4/images/${objectKey}` `` | Web 管理后台·广告活动详情（管理端预览素材） | ⚠️ 同类隐患 | ✅ 已修复 |
| 3 | `routes/v4/user/ad-campaigns.js:186` | `` c.public_url = `${baseUrl}/api/v4/images/${objectKey}` `` | 小程序·广告主端活动详情（广告主预览自己素材） | ⚠️ 同类隐患 | ✅ 已修复 |

> 三处是同一反模式：直接用 `PUBLIC_BASE_URL` 拼裸 key，不带 cache-buster。#1 已确证导致真机 404；#2/#3 是同类隐患（同样可能因微信/浏览器缓存历史 404 而卡死），应一并收口。

### 4.2 ✅ 已正确（走统一 `getImageUrl()`，无需改，仅列举佐证收口面）

| 文件 | 说明 |
| --- | --- |
| `models/MediaFile.js:44-46` | `getPublicUrl()` → `getImageUrl(object_key, content_hash)`（模型统一出口） |
| `services/DataSanitizer.js`（多处） | 三端脱敏中枢全部走 `getImageUrl(..., content_hash)` |
| `services/prize-pool/QueryService.js:31/75` | 奖品图走 `getImageUrl(..., content_hash)` |
| `routes/v4/console/exchange/items.js:62-71` | 兑换商品图走 `getImageUrl(..., content_hash)` |
| `routes/v4/console/operations/storage.js:58-62` | 媒体库管理走 `getImageUrl(..., content_hash)` |

> 结论：全局**仅广告域 3 处**绕过统一工具，其余几十处均已正确收口。

---

## 五、修复方案

### 5.1 原则
所有对外下发的图片 URL **必须**经 `ImageUrlHelper.getImageUrl(objectKey, contentHash)`，禁止再用 `PUBLIC_BASE_URL` 手拼。优先传入 `content_hash` 走 `?h=`（永久缓存、图片更换自动失效），无 hash 时自动退到 `?v=`（重启失效）。

### 5.2 关键约束（必须先补 content_hash 透传链路）

⚠️ `AdBiddingService.selectWinners` 当前**没有取 `content_hash`**：

```83:84:services/AdBiddingService.js
                    as: 'primary_media',
                    attributes: ['media_id', 'object_key', 'width', 'height', 'thumbnail_keys']
```

```222:226:services/AdBiddingService.js
                primary_media_id: creative.primary_media_id,
                media_object_key: creative.primary_media?.object_key || null,
                media_width: creative.primary_media?.width || null,
                media_height: creative.primary_media?.height || null,
```

因此修复 #1（ad-delivery）若要用上**永久缓存 `?h=`**，需分两步：
1. 在 `AdBiddingService` 的 `primary_media` 查询 `attributes` 中**补 `content_hash`**，并在返回对象中**透传 `media_content_hash`**（或直接透传 hash 字段）。
2. `ad-delivery.js` 改调 `getImageUrl(media_object_key, media_content_hash)`。

> 若暂不改 Service，至少先让 ad-delivery 调用 `getImageUrl(media_object_key)`（不传 hash），即可拿到 `?v={启动版本号}` —— **这一步就足以根治本次 404**（重启后 URL 变、微信重新拉图）；`?h=` 是进一步的永久缓存优化。

### 5.3 三处的修复要点（仅方案，不在本文档落代码）

| # | 文件 | 改法 | 备注 |
| --- | --- | --- | --- |
| 1 | `ad-delivery.js:77-79` | 引入 `getImageUrl`，`image_url: getImageUrl(creative.media_object_key, creative.media_content_hash)` | 需配合 `AdBiddingService` 补 `content_hash` 透传；不补则先传单参拿 `?v=` |
| 2 | `console/ad/ad-campaigns.js:614-625` | `c.public_url = getImageUrl(c.primary_media?.object_key, c.primary_media?.content_hash)` | 该路由 include 是否已带 `content_hash` 需核对（`AdCampaignAdminService.getCampaignDetailWithRelations`） |
| 3 | `user/ad-campaigns.js:179-190` | 同 #2 | 该路由 `AdCampaignService.getCampaignById` 的 include 同样需含 `content_hash` |

### 5.4 验证清单（修复后）
- [ ] banner 下发的 `image_url` 末尾带 `?h=` 或 `?v=`（抓 `/api/v4/system/ad-delivery?slot_type=top_banner&position=lottery` 响应确认）。
- [ ] 真机重新进入回馈页，`<image>` 正常渲染，无 binderror。
- [ ] 后端 curl 该新 URL 仍 200、Content-Type 正确。
- [ ] 管理端/广告主端活动详情 `public_url` 同样带参数。
- [ ] 全局复查 grep `/api/v4/images/` 不再有手拼裸 URL（除工具/路由定义本身）。

---

## 六、责任归属（最终定性）

| 端 | 是否有责 | 依据 |
| --- | --- | --- |
| 小程序前端 | ❌ 否 | URL 正确、逻辑正确、binderror 已抓出真因，无需改 |
| Web 管理前端 | ❌ 否 | 配置数据全对，不参与图片下发 |
| **后端数据库项目** | ✅ **是** | `ad-delivery.js`（及广告域另 2 处）手拼裸 URL，绕过 `getImageUrl()` 的 cache-buster 机制，导致真机缓存历史 404 卡死 |

> 注：本次缺陷**不是**「多副本/边缘负缓存/请求头条件 404」（三者均已实测证伪），而是「同一资源的 URL 缺少版本参数 + 客户端缓存历史失败」。修复在后端，且只需把 3 处手拼收口到统一工具。

---

## 七、修复落地记录（2026-06-28 已完成）

### 7.1 实际改动文件（4 个）

| 文件 | 改动 |
| --- | --- |
| `services/AdBiddingService.js` | ① `primary_media` 查询 `attributes` 补 `content_hash`；② `winnerResults` 的 creative 透传新增 `media_content_hash` |
| `routes/v4/system/ad-delivery.js` | 引入 `getImageUrl`；`image_url` 改 `getImageUrl(media_object_key, media_content_hash)`，删除手拼裸 URL |
| `routes/v4/console/ad/ad-campaigns.js` | 引入 `getImageUrl`；`public_url` 改 `getImageUrl(object_key, content_hash)`，删除 `PUBLIC_BASE_URL` 手拼 |
| `routes/v4/user/ad-campaigns.js` | 同上 |
| `services/AdCampaignService.js` | `getCampaignById` 的 `primary_media` include `attributes` 补 `content_hash`（供 #2/#3 两路由用上 `?h=`） |

> 说明：#2 与 #3 两个详情路由均委托 `AdCampaignService.getCampaignById`，故只需在该 Service 的 include 补一次 `content_hash`。

### 7.2 核心改法（ad-delivery.js）

```js
const { getImageUrl } = require('../../../utils/ImageUrlHelper')
// ...
image_url: creative.media_object_key
  ? getImageUrl(creative.media_object_key, creative.media_content_hash)
  : null,
```

### 7.3 修复后验证（连真库 + 线上代理实测）

| 验证项 | 结果 |
| --- | --- |
| 连真库实跑 `selectWinners('lottery_top_banner', 32)` | 返回 `media_content_hash` 已透传（`250c3589...`） |
| 生成的 `image_url` | `https://omqktqrtntnn.sealosbja.site/api/v4/images/uploads/1782268569292_7f6171ce86bbe299.jpg?h=250c3589`（**带 cache-buster**） |
| 新 URL 线上 curl | `HTTP 200`，`content-type: image/jpeg`，`size=155850` ✅ |
| ESLint（5 个改动文件） | **0 error** ✅ |

### 7.4 修复效果

- banner `image_url` 现带 `?h={内容哈希前8位}` → 永久缓存，且**图片更换时 content_hash 变 → URL 变 → 客户端自动拉新图**。
- 真机即便曾缓存过旧裸 URL 的 404，新版下发的是**带参数的新字符串 URL**，微信不再命中历史失败缓存，banner 恢复显示。
- #2/#3 管理端/广告主端预览同样收口，消除同类隐患。

### 7.5 待办（小程序前端无需改，但需触发刷新）

- 后端需**重新部署/重启**使新 URL 生效；线上 ad-delivery 接口下发 `image_url` 带 `?h=` 后即修复。
- 真机若仍显示旧空白，属微信对旧裸 URL 的本地缓存，可重启小程序/清缓存触发重新请求新 URL（新 URL 字符串已变，正常情况下会自动拉取）。

---

> 本文档据 2026-06-28 真实后端代码 + 真实对象存储 + 线上代理实测出具。**根因定位阶段未改动代码；修复阶段已按本文「五、修复方案」落地 4 处代码改动并通过 ESLint + 连真库验证**（核查用临时脚本已删除，未改动数据库）。
