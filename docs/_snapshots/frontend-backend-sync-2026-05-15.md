# 前端对接反馈：后端仍需修改的接口

**日期**: 2026-05-15  
**状态**: ✅ 后端已全部修改完成，可以联调

---

## 问题现象

未登录状态下：
- 抽奖页面显示"网络异常，请重试"
- 商城页面弹出"登录已失效 缺少认证Token"

## 根本原因

前端已将以下接口设置为 `needAuth: false`（不带 Token 发请求），但后端仍然使用 `authenticateToken` 中间件，返回 HTTP 401 + `{ success: false, code: "MISSING_TOKEN" }`。

---

## 后端需要改为 optionalAuth 的接口

| # | 路由 | 当前状态 | 需要改为 |
|---|------|----------|----------|
| 1 | `GET /api/v4/lottery/campaigns/:campaign_code/config` | ✅ 已改为 optionalAuth | — |
| 2 | `GET /api/v4/lottery/campaigns/:campaign_code/prizes` | ✅ 已改为 optionalAuth | — |
| 3 | `GET /api/v4/exchange/space-stats` | ✅ 已改为 optionalAuth | — |
| 4 | `GET /api/v4/marketplace/listings` | ✅ 已确认 optionalAuth | — |
| 5 | `GET /api/v4/marketplace/listings/:id` | ✅ 已确认 optionalAuth | — |
| 6 | `GET /api/v4/marketplace/settlement-currencies` | ✅ 已改为 optionalAuth | — |需确认 | **optionalAuth** |

---

## 前端已完成的适配（无需后端配合）

| 改动 | 文件 | 说明 |
|------|------|------|
| apiClient 401 防护 | `utils/api/client.ts` | `needAuth: false` 的请求收到 401 时不弹"登录已失效"弹窗，不清 Token |
| 活动列表 | `utils/api/lottery.ts` | `getActiveCampaigns` → needAuth: false ✅ |
| 活动配置 | `utils/api/lottery.ts` | `getLotteryConfig` → needAuth: false ✅ |
| 活动奖品 | `utils/api/lottery.ts` | `getLotteryPrizes` → needAuth: false ✅ |
| 商品列表 | `utils/api/backpack.ts` | `getExchangeItems` → needAuth: false ✅ |
| 商品详情 | `utils/api/backpack.ts` | `getExchangeItemDetail` → needAuth: false ✅ |
| 空间统计 | `utils/api/backpack.ts` | `getExchangeSpaceStats` → needAuth: false ✅ |
| 市场挂单 | `utils/api/market.ts` | `getMarketplaceListings` → needAuth: false ✅ |
| 市场详情 | `utils/api/market.ts` | `getMarketProductDetail` → needAuth: false ✅ |
| 市场筛选 | `utils/api/market.ts` | `getMarketFacets` → needAuth: false ✅ |
| DIY 模板 | `utils/api/diy.ts` | 全部读接口 → needAuth: false ✅ |

---

## 前端逻辑修复（已完成）

| 页面/组件 | 修复内容 |
|-----------|----------|
| `lottery.ts` initializePage | 未登录时也调用 `_loadCampaigns()` |
| `lottery-activity.ts` initActivity | 去掉 `checkAuth` 前置判断 |
| `exchange-shelf` checkPremiumUnlockStatus | 未登录时跳过（需认证） |
| `exchange-market` loadProducts | 去掉 Token 手动检查和弹窗拦截 |
| `exchange-market` loadMyListingStatus | 未登录时跳过 |
| `exchange-market` onConfirmPurchase | 购买时检查登录，未登录触发 needlogin 事件 |

---

## 验证方法

后端修改完成后，前端验证步骤：

```
1. 清除小程序本地存储（模拟未登录）
2. 进入抽奖 Tab → 应显示活动和奖品列表
3. 进入商城 Tab → 商品兑换应显示商品卡片
4. 切换到交易市场 → 应显示挂单列表
5. 点击任何操作按钮（抽奖/兑换/购买）→ 弹出登录半框
```

---

## 时间线

- 前端适配完成时间: 2026-05-15 03:10
- 后端修改完成时间: 2026-05-15 03:15
- 状态: ✅ 可以联调
