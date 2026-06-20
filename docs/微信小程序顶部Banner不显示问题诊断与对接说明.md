# 微信小程序「回馈页顶部 Banner 不显示」问题诊断与前端对接说明

> 出具方：后端数据库项目
> 日期：2026-06-21（北京时间）
> 诊断方式：Node.js 直连真实库 `restaurant_points_dev`（读 `.env`，非备份）+ 实调后端接口 + 实测图片代理 URL，未引用任何历史报告。
> 一句话结论：**后端数据与接口、图片代理、Web 管理端配置均正常；问题在微信小程序前端 `pages/lottery` 未接入 `ad-delivery` 接口（B6/B7 未实施），故顶部 Banner 取不到图、显示占位框。**

---

## 一、现象

- 微信小程序「回馈」首页（`pages/lottery`）顶部沉浸式大图区域**只显示占位框「顶部横幅图片位置」**，看不到运营已配置的 Banner 图。
- 同一份配置在 **Web 管理端「内容投放管理 → 运营推广」显示正常**：可见一条投放 `ID 349 / 首页 / 投放中 / 优先级 500 / 2026-06-20~2026-06-27`。
- 因此运营会困惑：「后台明明配好了，为什么小程序看不到？」

## 二、逐环真实验证（每一环都已实测）

> 验证时间 2026-06-21，数据来自真实库 `restaurant_points_dev` 与本地后端服务实调。

| 环节 | 验证内容 | 实测结果 | 判定 |
| --- | --- | --- | --- |
| ① 投放计划 | `ad_campaigns` 中 ID 349 | active / operational / 绑 `ad_slot_id=16` / priority 500 / billing_mode=free / 生效中 | ✅ 正常 |
| ② 绑定槽位 | 该计划绑定的 `ad_slots` | id 16 = `lottery_top_banner` / slot_type=top_banner / position=lottery / is_active=1 / is_carousel=0 | ✅ 正常 |
| ③ 创意素材 | `ad_creatives` 中 campaign 349 的创意 | id 335 / content_type=image / `primary_media_id=118` / review_status=**approved** / link_type=none | ✅ 正常 |
| ④ 媒体文件 | `media_files` 中 media 118 | object_key=`uploads/1781998734161_6733335505260f35.jpg` / status=active | ✅ 正常 |
| ⑤ 后端下发 | `AdBiddingService.selectWinners('lottery_top_banner')` | 返回 **1 条**，含 `ad_slot_id=16`、`ad_campaign_id=349`、`is_carousel=false`、完整 `media_object_key` | ✅ 正常 |
| ⑥ 图片代理 | `GET /api/v4/images/uploads/1781998734161_6733335505260f35.jpg` | **HTTP 200 / image/jpeg / 350074 字节** | ✅ 正常 |
| ⑦ 小程序取数 | `pages/lottery` 是否调用 `ad-delivery` 给 `topBannerUrl` 赋值 | **未调用**，`topBannerUrl` 始终为空 → 显示占位框 | ❌ 缺口在此 |

> 即：①~⑥ 后端 + Web 管理端这一整条链路**全部实测正常**，图片本身也能正常访问；唯独第 ⑦ 环——微信小程序前端没把接口数据接上去。

## 三、根因（纯文本数据流图）

```
运营在 Web 管理端配置的图（campaign 349）
        │
        ▼
┌──────────────────────────────────────────────┐
│ ① 真实库数据            ✅ 正常                 │
│    campaign 349: active / operational         │
│    绑定 slot 16 (lottery_top_banner)          │
│    创意 335: approved，有图 media 118          │
├──────────────────────────────────────────────┤
│ ② 后端 selectWinners    ✅ 正常                 │
│    lottery_top_banner 返回 1 条，含 image_url  │
├──────────────────────────────────────────────┤
│ ③ 图片代理 URL          ✅ 正常                 │
│    /api/v4/images/uploads/...jpg              │
│    HTTP 200 / image/jpeg / 350KB              │
├──────────────────────────────────────────────┤
│ ④ 微信小程序回馈页       ❌ 链路断在这里         │
│    pages/lottery 未调用 ad-delivery 接口、     │
│    topBannerUrl 未赋值 → 显示「顶部横幅图片位置」│
└──────────────────────────────────────────────┘
```

**结论：这是微信小程序前端项目的问题**，不是后端数据库项目、也不是 Web 管理端前端项目的问题。

- 这正是主需求文档第二章描述的**原始问题现状**：`pages/lottery` 的 `topBannerUrl` 从未被任何接口赋值，永远回退到占位/本地兜底。
- 后端已按主需求文档把能力做完（新增 `top_banner` 槽位 + 下发 + 图片代理），运营也把图配好了；**缺的就是微信小程序端「调接口取图并赋值」这段代码（B6/B7）**，该工作不在本仓库（后端 + Web 管理端）内。

### 补充：截图里的「请登录」也要注意

截图小程序顶部显示「请登录」。`ad-delivery` 接口**需要登录态（带 Access Token）**。若用户未登录：
- 前端要么先完成登录拿到 Token 再请求 Banner；
- 要么对未登录态直接用本地兜底图。

这点同样由微信小程序前端处理（与后端无关）。

## 四、微信小程序前端修复方案（唯一待办，属前端职责）

在 `pages/lottery`（及其余 4 个 Tab 页 `user`/`diy`/`camera`/`exchange`）补一个 `loadTopBanner()`，进页面时调用：

步骤（纯文字描述）：
1. 确认已登录拿到 Access Token（未登录则用本地兜底图，不请求）。
2. 调 `GET /api/v4/system/ad-delivery?slot_type=top_banner&position=lottery`（请求头带 `Authorization: Bearer <token>`）。
3. 取 `response.data.items[0].image_url`，赋给页面数据 `topBannerUrl`。
4. 若 `items` 为空数组、或图片加载失败：回退本地兜底图，不报错、不留白。
5. 若 `data.is_carousel === true`：用 `items[].image_url` 走 swiper 轮播，间隔取 `data.slide_interval_ms`（毫秒）。
6. 点击跳转：`items[i].link_type !== 'none'` 时按 `link_url`/`link_type` 跳转。
7. 曝光/点击上报：用 `items[i].ad_slot_id` + `ad_campaign_id` 调 `POST /api/v4/system/ad-events/impression`（或 `/click`）。

> 各 Tab 页只需把 `position` 换成本页：`lottery` / `profile`（注意 `pages/user` 传 `profile`）/ `diy` / `camera` / `exchange`。
> 前端**直接用后端扁平字段名 `image_url`，不做任何映射**，不要期望 `primary_media.public_url` 这种嵌套结构。

## 五、接口契约（前端直接照此对接，零字段映射）

**接口**：`GET /api/v4/system/ad-delivery`
**鉴权**：需登录态，请求头带 `Authorization: Bearer <Access Token>`
**Query 参数**：
- `slot_type=top_banner`（固定）
- `position=lottery`（按页取：`lottery` / `profile` / `diy` / `camera` / `exchange`）

**真实响应示例（本次 lottery 实测下发，仅示意字段，URL 为真实可访问代理地址）**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "ad_slot_id": 16,
        "ad_campaign_id": 349,
        "campaign_category": "operational",
        "image_url": "https://omqktqrtntnn.sealosbja.site/api/v4/images/uploads/1781998734161_6733335505260f35.jpg",
        "link_url": null,
        "link_type": "none",
        "priority": 500
      }
    ],
    "slot_type": "top_banner",
    "position": "lottery",
    "is_carousel": false,
    "slide_interval_ms": 3000,
    "total": 1
  }
}
```

**字段说明**：
- `image_url`：后端已 JOIN `media_files` 拼好的**完整代理 URL**，前端直接用，不要自行拼接。
- `is_carousel`：该图片位是否轮播（false=单张取 `items[0]`，true=多张 swiper）。
- `slide_interval_ms`：轮播间隔（毫秒，仅 `is_carousel=true` 有意义）。
- `ad_slot_id` / `ad_campaign_id`：曝光/点击上报用。
- `link_url` / `link_type`：点击跳转用（none=纯展示）。
- `items` 为空数组 `[]`：表示该 position 暂无生效投放，前端回退本地兜底图。

## 六、责任归属与验收

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 后端数据库项目 | ✅ 无需改动 | 槽位/投放/创意/图片代理/下发接口均实测正常 |
| Web 管理端前端项目 | ✅ 无需改动 | 运营推广列表、槽位配置显示正常（截图已证实） |
| 微信小程序前端项目 | ❌ 待实施 | `pages/lottery` 等 5 页接入 `ad-delivery`，按第四/五节实现（B6/B7） |
| 运营 | ✅ 已配置 lottery | campaign 349 已配好图；其余 position（profile/diy/camera/exchange）如需上线，再各配一条 |

**验收标准（前端改完后自验）**：
1. 已登录用户进入回馈页，顶部显示运营配置的 Banner 图（即 campaign 349 的图），不再是占位框。
2. 运营在管理端换图后，小程序无需发版、重新进页面即可看到新图。
3. 未登录或该 position 无投放时，显示本地兜底图，不报错、不留白。

> 本文档基于 2026-06-21 直连真实库 + 实调接口 + 实测图片代理的真实结果出具，未引用历史报告。后端与 Web 管理端在本问题上无代码缺口，待办仅微信小程序前端一项。
