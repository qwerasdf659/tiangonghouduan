# 方案B（万级并发优化）前端对接说明

> 适用对象：**微信小程序前端开发**（主）、Web 管理后台前端（参考）
> 生成时间：2026-05-30
> 配套文档：`docs/万级并发优化方案.md`（后端完整方案与施工报告）
> 一句话：**本次是纯后端的并发能力升级（PM2 cluster 多进程），不改任何 API 契约；小程序需确认 2 点，无需改业务代码。**

---

## 一、对前端最重要的结论

| 项目 | 是否需要改代码 | 说明 |
|------|:---:|------|
| **API 路径** | ❌ 不变 | `/api/v4/{resource}` 全部不变 |
| **请求/响应字段名** | ❌ 不变 | 全部 snake_case，字段名、结构不变 |
| **响应格式** | ❌ 不变 | 仍是 `{ success, code, message, data, timestamp, version, request_id }` |
| **JWT 认证** | ❌ 不变 | 无状态 JWT，多进程天然支持，登录/鉴权流程不变 |
| **WebSocket 事件名/数据格式** | ❌ 不变 | `new_message`/`new_notification`/`bid_*`/`auction_*`/`exchange_*` 等事件名与 payload 不变 |

> 后端从「单进程」升级为「PM2 cluster 4 进程」，对前端**完全透明**。下面 2 个确认项不是 bug，是健壮性确认。

---

## 二、微信小程序需确认的 2 个点（重点）

### 确认项 1：WebSocket 必须走纯 WebSocket（不要 polling）

**背景**：后端 cluster 多进程下，Socket.IO 已强制 `transports: ['websocket']`（禁用 HTTP 长轮询 polling）。原因是 polling 握手由多个 HTTP 请求组成，多进程负载均衡会把它们打到不同 worker，导致握手失败、反复重连。

**小程序侧确认**：
- 微信小程序用 `wx.connectSocket` 本身就是**纯 WebSocket**，默认即满足，一般无需改动。
- 若使用 `socket.io-client` 的小程序适配版，请确认连接配置为 `transports: ['websocket']`（不要带 `'polling'`）。

```javascript
// 若用 socket.io-client（小程序适配版），连接配置示例
const socket = io(WS_BASE_URL, {
  path: '/socket.io',
  transports: ['websocket'], // ✅ 必须纯 websocket，不要 polling
  auth: { token: accessToken } // JWT，握手阶段鉴权（后端强制）
})
```

- WebSocket 握手鉴权：token 放在 `auth.token`（后端在握手阶段校验 JWT + 会话有效性），缺 token 或会话失效会被拒绝连接。

### 确认项 2：写接口都带幂等键 Idempotency-Key

**背景**：cluster 放大吞吐后，网络抖动重试更易产生重复写。后端写操作已用幂等表保护，但需要前端传幂等键才能生效。

**小程序侧确认**：
- 抽奖接口已强制幂等（必须带 `Idempotency-Key`）。
- 其余写接口（兑换、交易、出价、DIY 提交等）建议统一在请求头带 `Idempotency-Key`（同一笔业务操作用同一个 UUID，重试时复用同一个键）。

```javascript
// 写请求示例（同一笔操作重试时复用同一个 requestId）
wx.request({
  url: `${API_BASE}/api/v4/lottery/draw`,
  method: 'POST',
  header: {
    Authorization: `Bearer ${accessToken}`,
    'Idempotency-Key': requestId // 同一笔抽奖重试复用，防止重复扣分/发奖
  },
  data: { campaign_code, draw_count }
})
```

---

## 三、前端需感知的后端行为变化（无需改契约，但建议处理好）

### 1. 限流上线后会返回 429（防刷闸门）

上线后后端会打开限流（开发期暂关）。命中限流时返回 **HTTP 429**，响应体：

```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "抽奖过于频繁，请稍后再试",
  "data": { "limit": 20, "window_seconds": 60, "retry_after": 12, "current": 20 },
  "timestamp": "2026-05-30T07:00:00.000+08:00",
  "request_id": "req_xxx"
}
```

各接口限流额度（每分钟/用户或IP）：通用 100、抽奖 20、登录 10（按IP）、聊天 10。

**前端建议**：
- 收到 429 时给用户友好提示（用 `message` 字段，已是中文），不要立即重试。
- 可读 `data.retry_after`（秒）做退避：提示"X 秒后再试"，或禁用按钮 X 秒。
- 不要在 429 后做激进自动重试（会持续被限流）。

> 极端情况：若后端 Redis 短暂不可用，限流会降级为「每进程内存粗粒度限流」（仍可能 429），不会因 Redis 故障而完全失效。前端处理方式不变。

### 2. WebSocket 断线重连要健全

cluster 滚动重启（`pm2 reload`）或网络抖动时，连接会断开并重连到另一个 worker。后端已用 Redis Adapter 保证跨 worker 消息送达，前端只需：
- 开启自动重连（`reconnection: true`，指数退避）。
- 重连成功后重新 `register`（带 token）并按需拉取离线消息（聊天有 `reconnect_session` 事件补偿离线消息）。
- 关键业务结果（中奖、交易、出价结果）以 **API 查询为准**，WebSocket 推送仅作实时提醒（推送可能因离线丢失，但数据已落库，进页面可查）。

### 3. 全链路北京时间

所有时间字段为北京时间（`+08:00` 的 ISO8601，如 `2026-05-30T07:00:00.000+08:00`），前端按北京时间展示，无需时区转换。

---

## 四、Web 管理后台前端（本仓库内，已由后端同学处理）

- 已将 5 处 socket 客户端 `transports` 改为 `['websocket']` 对齐后端 R11，并已 `npm run build` 重建 dist（部署生效）。
- 429 处理：统一 `request()` 封装会抛出后端"过于频繁"消息供页面提示展示，确认满足；无激进自动重试。
- 其余无契约改动，cluster 化对管理后台透明。

---

## 五、给小程序团队的行动清单（Checklist）

- [ ] 确认 WebSocket 连接为纯 `websocket`（`wx.connectSocket` 默认满足；socket.io-client 版需设 `transports: ['websocket']`）。
- [ ] 确认 WebSocket 握手 token 放 `auth.token`，并实现断线自动重连 + 重连后重新注册。
- [ ] 确认所有写接口（抽奖必须、其余建议）带 `Idempotency-Key` 头，重试复用同一键。
- [ ] 实现 429（`RATE_LIMIT_EXCEEDED`）友好提示 + 退避（读 `data.retry_after`），不做激进重试。
- [ ] 关键业务结果以 API 查询为准，WebSocket 推送仅作实时提醒。

> 如发现任何接口字段/路径与现状不符，以**后端数据库项目当前实际接口为准**（后端为权威），前端适配后端，不做字段映射。需要后端补接口或有疑问，请联系后端同学。
