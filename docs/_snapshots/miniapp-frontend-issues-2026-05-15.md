# 微信小程序前端问题清单（2026-05-15）

**背景**：后端已完成所有浏览类接口的公开化改造，未登录状态下后端正常返回数据，但小程序前端仍显示空白/弹登录。

---

## 问题 1：抽奖页面"暂无进行中的活动"

**现象**：抽奖 Tab 页面显示"暂无进行中的活动 下拉刷新试试"

**后端实际返回**：
```
GET /api/v4/lottery/campaigns/active（无需 Token）
→ HTTP 200
→ 返回 1 条活动：{ campaign_code: "CAMP20250901001", campaign_name: "餐厅积分抽奖", status: "active" }
```

**排查方向**：
- 前端是否在请求前判断了登录态，未登录就不发请求？
- 前端请求时是否带了一个过期/无效的 Token？（optionalAuth 不会返回 401，但前端拦截器可能自己处理了）
- 前端请求的 URL 路径是否正确？

---

## 问题 2：商品兑换页"暂无可兑换商品"

**现象**：商城 Tab → 商品兑换 → 显示"暂无可兑换商品"

**后端实际返回**：
```
GET /api/v4/exchange/items?page=1&page_size=20（无需 Token）
→ HTTP 200
→ 返回 20 条商品，pagination.total = 20
```

**排查方向**：
- 同问题 1，检查前端是否在未登录时跳过了请求
- 检查前端是否对响应做了额外的登录态判断

---

## 问题 3：交易市场弹"未登录"弹窗

**现象**：商城 Tab → 交易市场 → 弹出"未登录，请先登录后再查看交易市场"

**后端状态**：已修复（2026-05-15），现在未登录可正常访问
```
GET /api/v4/marketplace/listings?page=1&page_size=20（无需 Token）
→ HTTP 200
→ 返回 21 条商品

GET /api/v4/marketplace/listings/facets（无需 Token）
→ HTTP 200
→ 返回筛选维度数据

GET /api/v4/marketplace/listings/:market_listing_id（无需 Token）
→ HTTP 200
→ 返回商品详情
```

**前端需要修改**：
- 去掉交易市场页面进入时的登录态判断/拦截弹窗
- 改为：浏览列表不需要登录，点击"购买"或"我的挂单"或"去上架"时才弹登录

---

## 统一修复方案

**核心原则**：所有浏览类请求不判断登录态，直接发请求。只在写操作按钮点击时判断登录态。

**前端需要做的事**：

1. **请求层**：浏览类 API 调用时不带 `Authorization` 头（或允许为空）
2. **页面层**：去掉页面 `onLoad`/`onShow` 中的登录态前置判断
3. **交互层**：只在以下操作时弹登录弹窗：
   - 点击"抽奖"按钮
   - 点击"兑换"按钮
   - 点击"购买"按钮
   - 点击"上架"/"我的挂单"
   - 点击"保存设计"/"完成设计"
   - 查看"我的订单"/"我的积分"

---

## 后端已公开的完整接口清单（无需 Token）

| 接口 | 说明 |
|------|------|
| `GET /api/v4/lottery/campaigns/active` | 活动列表 |
| `GET /api/v4/exchange/items` | 兑换商品列表 |
| `GET /api/v4/exchange/items/:exchange_item_id` | 商品详情 |
| `GET /api/v4/marketplace/listings` | 交易市场列表 |
| `GET /api/v4/marketplace/listings/facets` | 市场筛选面板 |
| `GET /api/v4/marketplace/listings/:market_listing_id` | 市场商品详情 |
| `GET /api/v4/diy/templates` | DIY 模板列表 |
| `GET /api/v4/diy/templates/:id` | DIY 模板详情 |
| `GET /api/v4/diy/templates/:id/beads` | 模板珠子素材 |
| `GET /api/v4/diy/material-groups` | 材料分组 |
| `GET /api/v4/system/config/placement` | 活动位置配置 |
| `GET /api/v4/system/config/product-filter` | 商品筛选配置 |
| `GET /api/v4/system/config/feedback` | 反馈表单配置 |
| `GET /api/v4/system/config/settings` | 公开系统配置 |
| `GET /api/v4/system/dictionaries/types` | 字典类型 |
| `GET /api/v4/system/dictionaries/type/:dictType` | 字典数据 |

## 仍需登录的接口（写操作/用户隐私数据）

| 接口 | 说明 |
|------|------|
| `POST /api/v4/lottery/draw` | 抽奖 |
| `POST /api/v4/exchange` | 兑换商品 |
| `GET /api/v4/exchange/orders` | 我的订单 |
| `POST /api/v4/marketplace/sell` | 上架商品 |
| `POST /api/v4/marketplace/buy/:id` | 购买商品 |
| `GET /api/v4/marketplace/my-listings` | 我的挂单 |
| `POST /api/v4/diy/works` | 保存作品 |
| `GET /api/v4/diy/works` | 我的作品列表 |
| `GET /api/v4/assets/balances` | 资产余额 |
