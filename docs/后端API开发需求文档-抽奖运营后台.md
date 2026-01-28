# 后端 API 开发需求文档 - 抽奖运营后台

> **文档版本**: v1.2.0  
> **创建日期**: 2026-01-28  
> **更新日期**: 2026-01-28  
> **需求来源**: 抽奖运营后台规划书 v2.5.0  
> **目标读者**: 后端开发工程师  
> **预计工时**: 6 个工作日（优化后）

---

## 📋 v1.2.0 更新说明

> 基于行业对标分析和架构评审，本版本新增以下架构决策：
> 
> 1. **活动列表接口位置**: 确认使用管理端路由 `/api/v4/console/lottery-campaigns`
> 2. **日预算限制数据源**: 在 `LotteryCampaign` 表新增 `daily_budget_limit` 字段
> 3. **ROI/复购率缓存策略**: 采用 Redis 缓存，TTL 5分钟
> 4. **预警阈值配置化**: 硬编码实现 + 预留配置化入口

---

## 📋 v1.1.0 更新说明

> 基于对实际数据库结构和现有代码的分析，本版本修正了以下内容：
> 
> 1. **`is_winner` 字段已废弃**：V4.0 语义清理中已删除，统一使用 `reward_tier` 判断
> 2. **表结构字段校正**：修正了与实际数据库不一致的字段定义
> 3. **复用现有 Service 方法**：大幅减少新增代码量
> 4. **工时优化**：从 8 天缩减至 6 天

---

## 目录

- [一、需求背景](#一需求背景)
- [⚠️ 二、实际数据库与现有代码分析](#️-二实际数据库与现有代码分析)
- [🏗️ 三、架构决策记录（ADR）](#️-三架构决策记录adr)
- [四、技术约束](#四技术约束)
- [五、新增 API 需求清单](#五新增-api-需求清单)
- [六、P0 - 用户抽奖档案聚合 API](#六p0---用户抽奖档案聚合-api)
- [七、P1 - 活动 ROI 聚合 API](#七p1---活动-roi-聚合-api)
- [八、P1 - 现有 API 调整](#八p1---现有-api-调整)
- [九、P2 - 运营日报聚合 API](#九p2---运营日报聚合-api)
- [十、实施计划](#十实施计划)
- [十一、验收标准](#十一验收标准)
- [附录 A：相关数据表结构（校正版）](#附录-a相关数据表结构校正版)
- [附录 B：现有 API 和 Service 方法参考](#附录-b现有-api-和-service-方法参考)
- [附录 C：预警阈值配置](#附录-c预警阈值配置)

---

## 一、需求背景

### 1.1 业务目标

为抽奖运营后台前端提供数据聚合 API，支持以下运营场景：

| 场景 | 当前状态 | 目标状态 |
|-----|---------|---------|
| 查看用户抽奖档案 | 需跨 5 个页面手动拼凑 | 一个 API 返回完整档案 |
| 查看活动 ROI | 无法查看 | 实时计算并展示 |
| 生成运营日报 | 手动截图汇总 | 一键生成日报数据 |

### 1.2 前端需求方

- **前端框架**: Alpine.js + Tailwind CSS + ECharts
- **调用方式**: `fetch` API，通过 `admin/src/api/lottery.js` 封装
- **认证方式**: JWT Token（Header: `Authorization: Bearer <token>`）

---

## ⚠️ 二、实际数据库与现有代码分析

> **重要**：本章节基于 2026-01-28 对实际数据库和代码的分析，确保实现方案与项目现状一致。

### 2.1 关键差异：`is_winner` 字段已废弃

**V4.0 语义清理**：`lottery_draws` 表中的 `is_winner` 字段已在 V4.0 版本中删除，统一使用 `reward_tier` 字段判断中奖状态。

| 原方案（已废弃） | 正确方案 |
|----------------|---------|
| `is_winner = true` | `reward_tier IN ('high', 'mid', 'low')` |
| `is_winner = false` | `reward_tier = 'fallback'` |

**实际 `reward_tier` 分布**（截至 2026-01-28）：

| 档位 | 记录数 | 占比 |
|-----|-------|-----|
| high | 1,727 | 50.7% |
| mid | 88 | 2.6% |
| low | 2 | 0.1% |
| fallback | 1,592 | 46.7% |

**中奖判断逻辑**：
```javascript
// ✅ 正确：使用 reward_tier 判断
const isWinner = draw.reward_tier !== 'fallback'

// ❌ 错误：is_winner 字段不存在
const isWinner = draw.is_winner  // 运行时会得到 undefined
```

### 2.2 表结构差异对照

#### lottery_draws（抽奖记录）

| 需求文档字段 | 实际数据库字段 | 说明 |
|------------|--------------|------|
| `is_winner` | **不存在** | 已删除，使用 `reward_tier` 代替 |
| `reward_tier` | ✅ 存在 | ENUM('high','mid','low','fallback') |
| `prize_id` | ✅ 存在 | 中奖的奖品 ID |
| `cost_points` | ✅ 存在 | 消耗积分 |
| `prize_value_points` | ✅ 存在 | 奖品价值（积分） |
| `prize_name` | ✅ 存在 | 冗余字段，奖品名称 |

#### lottery_user_experience_state（用户体验状态）

| 需求文档字段 | 实际数据库字段 | 说明 |
|------------|--------------|------|
| `pity_counter` | **不存在** | 使用 `pity_trigger_count` 替代 |
| `anti_high_counter` | **不存在** | 使用 `recent_high_count` 替代 |
| `experience_phase` | **不存在** | 暂无此字段，不影响核心功能 |
| `empty_streak` | ✅ 存在 | 当前连续空奖次数 |
| `max_empty_streak` | ✅ 存在 | 历史最大连续空奖次数 |
| `total_draw_count` | ✅ 存在 | 活动内总抽奖次数 |
| `total_empty_count` | ✅ 存在 | 活动内总空奖次数 |

#### lottery_user_global_state（用户全局状态）

| 需求文档字段 | 实际数据库字段 | 说明 |
|------------|--------------|------|
| `luck_debt` | **不存在** | 使用 `luck_debt_level` + `luck_debt_multiplier` |
| `lifetime_draws` | **不存在** | 使用 `global_draw_count` 替代 |
| `lifetime_wins` | **不存在** | 使用 `global_high_count` + `global_mid_count` + `global_low_count` |
| `high_tier_count` | ✅ 存在 | 字段名为 `global_high_count` |
| `luck_debt_level` | ✅ 存在 | ENUM('none','low','medium','high') |
| `luck_debt_multiplier` | ✅ 存在 | DECIMAL(4,2) |

#### lottery_prizes（奖品配置）

| 需求文档字段 | 实际数据库字段 | 说明 |
|------------|--------------|------|
| `cost_value` | **不存在** | 使用 `prize_value_points` 替代 |
| `prize_name` | ✅ 存在 | VARCHAR(100) |
| `stock_quantity` | ✅ 存在 | 当前库存 |
| `total_win_count` | ✅ 存在 | 历史中奖次数 |
| `reward_tier` | ✅ 存在 | ENUM('high','mid','low') |

### 2.3 现有 Service 方法复用分析

**LotteryAnalyticsService** 已提供的方法（可直接复用）：

| 方法名 | 功能 | 复用场景 |
|-------|-----|---------|
| `getUserExperienceState(user_id, campaign_id)` | 获取用户体验状态 | P0 用户档案 |
| `getUserGlobalState(user_id)` | 获取用户全局状态 | P0 用户档案 |
| `getUserQuotas(options)` | 获取用户配额列表 | P0 用户档案 |
| `getHourlyMetrics(options)` | 获取小时统计指标 | P2 日报 |
| `getHourlyMetricsSummary(campaign_id, start, end)` | 获取活动汇总 | P1 ROI |
| `getMonitoringStats(options)` | 综合监控统计 | P1 /stats 增强 |
| `getRealtimeOverview(campaign_id)` | 实时概览 | P2 日报 |
| `getDailyTrend(campaign_id, options)` | 日报趋势 | P2 日报 |
| `getTierDistribution(campaign_id, options)` | 档位分布 | P1 ROI |
| `getBudgetConsumption(campaign_id, options)` | 预算消耗 | P1 ROI |

**需要新增的 Service 方法**：

| 方法名 | 功能 | 优先级 |
|-------|-----|-------|
| `getUserDrawRecords(user_id, options)` | 获取用户抽奖记录 | P0 |
| `getCampaignROI(campaign_id, options)` | 计算活动 ROI | P1 |
| `generateDailyReport(report_date, campaign_id)` | 生成日报数据 | P2 |

### 2.4 数据现状统计（2026-01-28）

| 表名 | 记录数 | 说明 |
|-----|-------|------|
| `lottery_draws` | 3,409 | 主要集中在 campaign_id=1 |
| `lottery_campaigns` | 4 | 1 个永久活动 + 3 个事件活动 |
| `lottery_prizes` | 30 | 各活动的奖品配置 |
| `lottery_hourly_metrics` | 有数据 | 小时聚合表可用 |
| `lottery_daily_metrics` | 空 | 日报聚合表暂无数据 |
| `lottery_user_experience_state` | 1 | 仅 1 条记录 |
| `lottery_user_global_state` | 1 | 仅 1 条记录 |

### 2.5 工时优化说明

由于大量 Service 方法已存在，实际工时可优化：

| 任务 | 原估计 | 优化后 | 说明 |
|-----|-------|-------|------|
| P0 用户档案 | 2 天 | 1.5 天 | 复用现有方法，仅需聚合 |
| P1 活动 ROI | 1 天 | 1 天 | 需新增计算逻辑 |
| P1 API 调整 | 1 天 | 0.5 天 | 基于现有 /stats 扩展 |
| P2 运营日报 | 3 天 | 2 天 | 复用聚合表数据 |
| 联调测试 | 1 天 | 1 天 | 不变 |
| **总计** | **8 天** | **6 天** | 节省 2 天 |

---

## 🏗️ 三、架构决策记录（ADR）

> 基于行业对标分析（参考美团、阿里、腾讯游戏、有赞、米哈游等公司实践），做出以下架构决策。

### ADR-001: 活动列表接口位置

| 项目 | 内容 |
|-----|------|
| **决策** | 使用管理端独立路由 `/api/v4/console/lottery-campaigns` |
| **状态** | ✅ 已确认 |
| **背景** | 需求文档提到的活动列表需增加 ROI、复购率、库存预警字段，需确认接口位置 |
| **备选方案** | A) 用户端 `/api/v4/lottery/campaigns`<br>B) 管理端 `/api/v4/console/lottery-campaigns` ✅<br>C) 其他路径 |
| **决策理由** | 1. ROI、复购率、库存预警属于**运营指标**，C端用户不需要<br>2. 符合项目现有 `/api/v4/console/` 管理端架构<br>3. 避免用户端接口返回敏感运营数据<br>4. 参考有赞、微盟等中型SaaS的"共享Service分离路由"模式 |
| **影响** | 需新建 `routes/v4/console/lottery-campaigns.js` 路由文件 |

### ADR-002: 日预算限制数据来源

| 项目 | 内容 |
|-----|------|
| **决策** | 在 `LotteryCampaign` 表新增 `daily_budget_limit` 字段 |
| **状态** | ✅ 已确认 |
| **背景** | `/stats` 接口需返回 `budget_progress.daily_limit`，需确定数据来源 |
| **备选方案** | A) `LotteryCampaign` 表新增字段 ✅<br>B) 从配置表读取<br>C) 前端传入（不持久化） |
| **决策理由** | 1. 符合现有架构（预算相关字段都在活动表：`pool_budget_total`、`pool_budget_remaining`）<br>2. 每个活动可独立配置日限额（运营灵活性）<br>3. 迁移成本低（仅加字段）<br>4. 参考米哈游、京东等"活动表字段"模式 |
| **影响** | 需创建数据库迁移文件，新增字段 |

**数据库迁移 SQL**:
```sql
ALTER TABLE lottery_campaigns 
ADD COLUMN daily_budget_limit BIGINT DEFAULT NULL 
COMMENT '每日预算限额（NULL表示不限制）';
```

### ADR-003: ROI/复购率缓存策略

| 项目 | 内容 |
|-----|------|
| **决策** | 采用 Redis 缓存，TTL 5分钟 |
| **状态** | ✅ 已确认 |
| **背景** | 活动列表中的 ROI、复购率计算较重，需考虑性能优化 |
| **备选方案** | A) Redis 缓存，TTL 5分钟 ✅<br>B) 每次请求实时计算<br>C) 异步任务定时计算存入数据库 |
| **决策理由** | 1. 平衡实时性和性能（运营后台对实时性要求非秒级）<br>2. 项目已集成 Redis（ioredis）<br>3. 未来可平滑升级到方案C<br>4. 参考美团、有赞等"Redis缓存 + 降级"模式 |
| **影响** | ROI/复购率查询需实现缓存逻辑 |

**缓存Key设计**:
```javascript
// 活动ROI缓存
const CACHE_KEY_CAMPAIGN_ROI = 'lottery:campaign:roi:{campaign_id}'
const CACHE_TTL_ROI = 300 // 5分钟

// 活动复购率缓存
const CACHE_KEY_CAMPAIGN_REPEAT = 'lottery:campaign:repeat:{campaign_id}'
const CACHE_TTL_REPEAT = 300 // 5分钟
```

**降级策略**:
```javascript
async function getCampaignROIWithCache(campaign_id, redisClient) {
  const cacheKey = `lottery:campaign:roi:${campaign_id}`
  
  try {
    const cached = await redisClient.get(cacheKey)
    if (cached) {
      logger.debug('ROI缓存命中', { campaign_id })
      return JSON.parse(cached)
    }
  } catch (e) {
    logger.warn('Redis缓存读取失败，降级实时计算', { error: e.message })
  }
  
  // 实时计算
  const roi = await calculateCampaignROI(campaign_id)
  
  // 异步写入缓存，不阻塞响应
  redisClient.setex(cacheKey, 300, JSON.stringify(roi))
    .catch(e => logger.warn('Redis缓存写入失败', { error: e.message }))
  
  return roi
}
```

### ADR-004: 预警阈值配置化

| 项目 | 内容 |
|-----|------|
| **决策** | 硬编码实现 + 预留配置化入口 |
| **状态** | ✅ 已确认 |
| **背景** | 日报中的预警规则阈值是否需要配置化 |
| **备选方案** | A) 硬编码在代码中 ✅ (快速实现)<br>B) 存入数据库/配置文件（灵活但复杂） |
| **决策理由** | 1. 快速实现上线<br>2. 阈值变更可通过代码Review确保安全<br>3. 预留扩展点，未来可改为配置化<br>4. 参考腾讯游戏、网易等"代码定义核心阈值"模式 |
| **影响** | 阈值变更需发布代码 |

**阈值配置位置**: `config/alert-thresholds.js`（详见附录C）

---

## 四、技术约束

### 4.1 必须遵循的项目规范

| 规范项 | 要求 | 示例 |
|-------|-----|------|
| **路由文件位置** | `routes/v4/console/lottery-monitoring.js` | — |
| **响应格式** | 使用 `res.apiSuccess()` / `res.apiError()` | 见下方示例 |
| **认证中间件** | `authenticateToken, requireRoleLevel(100)` | 管理员权限 |
| **Service 层调用** | 通过 `req.app.locals.services.getService()` | 不直连 Model |
| **日志规范** | 使用 `logger.info()` / `logger.error()` | 不用 console.log |
| **命名规范** | snake_case（字段名、URL 参数） | `user_id`, `campaign_id` |

### 4.2 响应格式规范

**成功响应**:
```javascript
res.apiSuccess(data, '操作成功')
// 返回:
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { ... }
}
```

**错误响应**:
```javascript
res.apiError('错误描述', 'ERROR_CODE', null, 500)
// 返回:
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "错误描述",
  "data": null
}
```

### 4.3 Service 层调用示例

```javascript
function getLotteryAnalyticsService(req) {
  return req.app.locals.services.getService('lottery_analytics')
}

// 在路由中使用
const analyticsService = getLotteryAnalyticsService(req)
const result = await analyticsService.someMethod(params)
```

---

## 五、新增 API 需求清单

| 优先级 | API 端点 | HTTP 方法 | 说明 | 工时 |
|-------|---------|----------|------|-----|
| **P0** | `/api/v4/console/lottery-monitoring/user-profile/:user_id` | GET | 用户抽奖档案聚合 | 2天 |
| **P1** | `/api/v4/console/lottery-monitoring/campaign-roi/:campaign_id` | GET | 活动 ROI 计算 | 1天 |
| **P1** | `/api/v4/console/lottery-monitoring/stats` | GET | 增加预算进度字段 | 0.5天 |
| **P1** | `/api/v4/console/lottery/campaigns` | GET | 列表增加 ROI 字段 | 0.5天 |
| **P2** | `/api/v4/console/lottery-analytics/daily-report` | GET | 运营日报聚合 | 3天 |

---

## 六、P0 - 用户抽奖档案聚合 API

### 6.1 接口概述

| 属性 | 值 |
|-----|---|
| **端点** | `GET /api/v4/console/lottery-monitoring/user-profile/:user_id` |
| **权限** | 管理员（role_level >= 100） |
| **优先级** | P0（必须优先完成） |
| **预计工时** | 2 天 |

### 6.2 业务需求

运营人员处理用户投诉时，需要快速了解用户的完整抽奖档案，包括：
- 用户基本抽奖统计（总次数、中奖次数、中奖率）
- 用户体验状态（连续未中奖次数、保底触发次数）
- 用户全局状态（运气债务值）
- 用户配额状态（剩余抽奖次数）
- 最近抽奖记录（便于追溯问题）

**当前痛点**: 需要跨 5 个页面手动查询，耗时 5-10 分钟

**目标**: 一个 API 返回所有数据，前端一屏展示

### 6.3 请求参数

| 参数名 | 位置 | 类型 | 必填 | 说明 |
|-------|-----|-----|-----|------|
| `user_id` | Path | integer | 是 | 用户 ID |

**请求示例**:
```
GET /api/v4/console/lottery-monitoring/user-profile/12345
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 6.4 响应结构

> ⚠️ **注意**：响应结构已根据实际数据库字段进行校正，移除了不存在的字段。

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取用户抽奖档案成功",
  "data": {
    "user_id": 12345,
    "stats": {
      "total_draws": 50,
      "total_wins": 40,
      "win_rate": "80.0",
      "tier_distribution": {
        "high": 2,
        "mid": 8,
        "low": 30,
        "fallback": 10
      },
      "first_draw_time": "2026-01-15T10:30:00.000+08:00",
      "last_draw_time": "2026-01-28T14:22:00.000+08:00"
    },
    "experience": {
      "state_id": 101,
      "user_id": 12345,
      "campaign_id": 1,
      "empty_streak": 3,
      "max_empty_streak": 8,
      "total_draw_count": 50,
      "total_empty_count": 10,
      "pity_trigger_count": 2,
      "recent_high_count": 1,
      "last_draw_at": "2026-01-28T14:22:00.000+08:00",
      "last_draw_tier": "mid",
      "updated_at": "2026-01-28T14:22:00.000+08:00"
    },
    "global_state": {
      "global_state_id": 201,
      "user_id": 12345,
      "global_draw_count": 120,
      "global_empty_count": 30,
      "historical_empty_rate": "0.2500",
      "luck_debt_level": "low",
      "luck_debt_multiplier": "1.10",
      "global_high_count": 5,
      "global_mid_count": 15,
      "global_low_count": 70,
      "participated_campaigns": 2,
      "last_draw_at": "2026-01-28T14:22:00.000+08:00",
      "updated_at": "2026-01-28T14:22:00.000+08:00"
    },
    "quotas": [
      {
        "quota_id": 301,
        "user_id": 12345,
        "campaign_id": 1,
        "quota_total": 100,
        "quota_used": 50,
        "quota_remaining": 50,
        "status": "active",
        "expires_at": "2026-02-28T23:59:59.000+08:00"
      }
    ],
    "recent_draws": [
      {
        "draw_id": 5001,
        "user_id": 12345,
        "campaign_id": 1,
        "reward_tier": "mid",
        "prize_id": 15,
        "prize_name": "10元优惠券",
        "prize_value_points": 1000,
        "cost_points": 100,
        "created_at": "2026-01-28T14:22:00.000+08:00"
      }
    ]
  }
}
```

### 6.5 字段说明

> ⚠️ **V1.1.0 校正**：字段说明已根据实际数据库结构校正，移除 `is_winner` 字段。

#### stats 对象

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `total_draws` | integer | 用户总抽奖次数（lottery_draws 记录数） |
| `total_wins` | integer | 用户中奖次数（reward_tier IN ('high','mid','low')） |
| `win_rate` | string | 中奖率（保留1位小数，如 "80.0"） |
| `tier_distribution` | object | 各档位中奖分布 |
| `first_draw_time` | string | 首次抽奖时间（北京时间 ISO8601+08:00） |
| `last_draw_time` | string | 最近抽奖时间（北京时间 ISO8601+08:00） |

#### tier_distribution 对象

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `high` | integer | 高价值奖品中奖次数（reward_tier='high'） |
| `mid` | integer | 中价值奖品中奖次数（reward_tier='mid'） |
| `low` | integer | 低价值奖品中奖次数（reward_tier='low'） |
| `fallback` | integer | 兜底奖品次数（reward_tier='fallback'，通常视为未中奖） |

**中奖判定逻辑（V4.0）**：
- `reward_tier = 'high'` → 高价值中奖
- `reward_tier = 'mid'` → 中等价值中奖
- `reward_tier = 'low'` → 低价值中奖
- `reward_tier = 'fallback'` → 保底奖品（通常视为未中奖）

### 6.6 实现逻辑

> ⚠️ **V1.1.0 校正**：中奖判定改为基于 `reward_tier` 字段，移除 `is_winner` 引用。

```javascript
/**
 * GET /user-profile/:user_id - 获取用户完整抽奖档案
 * 
 * 依赖的现有 Service 方法:
 * - getUserExperienceStates(filters) - 查询体验状态
 * - getUserGlobalStates(filters) - 查询全局状态
 * - getUserQuotas(filters) - 查询用户配额
 * 
 * 需要扩展的 Service 方法:
 * - getUserDrawRecords(userId, options) - 获取用户抽奖记录（可复用现有查询逻辑）
 */
router.get('/user-profile/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    
    if (!user_id || isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }
    
    const analyticsService = getLotteryAnalyticsService(req)
    
    // 并行查询所有数据（优化性能）
    const [draws, experienceStates, globalStates, quotas] = await Promise.all([
      analyticsService.getUserDrawRecords(user_id, { limit: 100 }),  // 需要扩展
      analyticsService.getUserExperienceStates({ user_id }),  // 现有方法
      analyticsService.getUserGlobalStates({ user_id }),      // 现有方法
      analyticsService.getUserQuotas({ user_id })             // 现有方法
    ])
    
    // 计算统计数据
    const totalDraws = draws.length
    
    // V4.0 中奖判定：reward_tier IN ('high', 'mid', 'low') 视为中奖
    const wins = draws.filter(d => ['high', 'mid', 'low'].includes(d.reward_tier))
    const totalWins = wins.length
    const winRate = totalDraws > 0 ? (totalWins / totalDraws * 100).toFixed(1) : '0.0'
    
    // 计算档位分布（统计所有记录的 reward_tier）
    const tierDistribution = { high: 0, mid: 0, low: 0, fallback: 0 }
    draws.forEach(d => {
      const tier = d.reward_tier || 'fallback'
      if (tierDistribution.hasOwnProperty(tier)) {
        tierDistribution[tier]++
      }
    })
    
    // 获取首次和最近抽奖时间
    const sortedDraws = [...draws].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const firstDrawTime = sortedDraws[0]?.created_at || null
    const lastDrawTime = sortedDraws[sortedDraws.length - 1]?.created_at || null
    
    // 组装响应数据
    const responseData = {
      user_id,
      stats: {
        total_draws: totalDraws,
        total_wins: totalWins,
        win_rate: winRate,
        tier_distribution: tierDistribution,
        first_draw_time: firstDrawTime,
        last_draw_time: lastDrawTime
      },
      experience: experienceStates[0] || null,  // 取第一条（通常只有一条）
      global_state: globalStates[0] || null,    // 取第一条
      quotas: quotas || [],
      recent_draws: draws.slice(0, 20)  // 只返回最近20条
    }
    
    logger.info('获取用户抽奖档案成功', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      total_draws: totalDraws,
      total_wins: totalWins
    })
    
    return res.apiSuccess(responseData, '获取用户抽奖档案成功')
    
  } catch (error) {
    logger.error('获取用户抽奖档案失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_USER_PROFILE_FAILED', null, 500)
  }
})
```

### 6.7 依赖的 Service 方法

> ⚠️ **V1.1.0 校正**：以下是基于实际代码分析确认的方法状态。

| 方法名 | 参数 | 返回值 | 状态 | 说明 |
|-------|-----|-------|-----|------|
| `getUserExperienceStates(filters)` | filters: {user_id, campaign_id, ...} | Array\<ExperienceState\> | ✅ 已存在 | 返回数组，取第一条 |
| `getUserGlobalStates(filters)` | filters: {user_id, ...} | Array\<GlobalState\> | ✅ 已存在 | 返回数组，取第一条 |
| `getUserQuotas(filters)` | filters: {user_id, campaign_id, ...} | Array\<Quota\> | ✅ 已存在 | |
| `getUserDrawRecords(user_id, options)` | user_id: number, options: {limit} | Array\<Draw\> | 🆕 需新增 | 需扩展，可基于现有查询逻辑 |

**现有方法复用说明**:
- `getUserExperienceStates`、`getUserGlobalStates`、`getUserQuotas` 已在 `LotteryAnalyticsService` 中存在，均返回数组格式
- `getUserDrawRecords` 需要新增，但可复用 `LotteryDraw` 模型的查询逻辑

### 6.8 错误码定义

| 错误码 | HTTP 状态码 | 说明 |
|-------|-----------|------|
| `INVALID_USER_ID` | 400 | 用户 ID 无效 |
| `USER_NOT_FOUND` | 404 | 用户不存在（可选实现） |
| `GET_USER_PROFILE_FAILED` | 500 | 服务器内部错误 |

---

## 七、P1 - 活动 ROI 聚合 API

### 7.1 接口概述

| 属性 | 值 |
|-----|---|
| **端点** | `GET /api/v4/console/lottery-monitoring/campaign-roi/:campaign_id` |
| **权限** | 管理员（role_level >= 100） |
| **优先级** | P1 |
| **预计工时** | 1 天 |

### 7.2 业务需求

运营需要评估每个活动的投入产出比：
- **ROI（投资回报率）**: 衡量活动盈利能力
- **复抽率**: 衡量用户粘性
- **独立用户数**: 衡量活动覆盖面

### 7.3 请求参数

| 参数名 | 位置 | 类型 | 必填 | 说明 |
|-------|-----|-----|-----|------|
| `campaign_id` | Path | integer | 是 | 活动 ID |
| `start_time` | Query | string | 否 | 统计开始时间（ISO8601） |
| `end_time` | Query | string | 否 | 统计结束时间（ISO8601） |

**请求示例**:
```
GET /api/v4/console/lottery-monitoring/campaign-roi/1?start_time=2026-01-01T00:00:00Z
```

### 7.4 响应结构

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取活动ROI成功",
  "data": {
    "campaign_id": 1,
    "campaign_name": "春节抽奖活动",
    "time_range": {
      "start_time": "2026-01-01T00:00:00.000Z",
      "end_time": "2026-01-28T23:59:59.999Z"
    },
    "roi": 35.5,
    "total_cost": 12500,
    "total_revenue": 19400,
    "profit": 6900,
    "unique_users": 156,
    "total_draws": 520,
    "avg_draws_per_user": 3.33,
    "repeat_users": 89,
    "repeat_rate": 57.1,
    "tier_cost_breakdown": {
      "high": 5000,
      "mid": 4500,
      "low": 2000,
      "fallback": 1000
    }
  }
}
```

### 7.5 字段说明

> ⚠️ **V1.1.0 校正**：`cost_value` 校正为 `cost_points`（lottery_prizes 表实际字段）。

| 字段 | 类型 | 说明 | 计算公式 |
|-----|-----|------|---------|
| `roi` | number | 投资回报率（%） | `(revenue - cost) / revenue * 100` |
| `total_cost` | number | 奖品总成本 | `SUM(prize.cost_points)`（从 lottery_prizes） |
| `total_revenue` | number | 用户消耗积分总额 | `SUM(draw.cost_points)`（从 lottery_draws） |
| `profit` | number | 利润 | `revenue - cost` |
| `unique_users` | number | 独立用户数 | `COUNT(DISTINCT user_id)` |
| `repeat_users` | number | 多次抽奖用户数 | 抽奖次数 > 1 的用户数 |
| `repeat_rate` | number | 复抽率（%） | `repeat_users / unique_users * 100` |
| `avg_draws_per_user` | number | 人均抽奖次数 | `total_draws / unique_users` |

### 7.6 实现逻辑

> ⚠️ **V1.1.0 校正**：中奖判定改为基于 `reward_tier` 字段，成本字段改为 `cost_points`。

```javascript
/**
 * GET /campaign-roi/:campaign_id - 获取活动ROI数据
 * 
 * 依赖的现有 Service 方法:
 * - LotteryCampaign.findByPk() - 获取活动信息
 * - LotteryPrize.findAll() - 获取奖品配置
 * 
 * 需要扩展的 Service 方法:
 * - getCampaignDraws(campaign_id, options) - 获取活动抽奖记录
 */
router.get('/campaign-roi/:campaign_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id)
    const { start_time, end_time } = req.query
    
    if (!campaign_id || isNaN(campaign_id)) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }
    
    const analyticsService = getLotteryAnalyticsService(req)
    
    // 获取活动信息（直接使用模型查询）
    const { LotteryCampaign, LotteryPrize, LotteryDraw } = require('../../../models')
    const campaign = await LotteryCampaign.findByPk(campaign_id)
    if (!campaign) {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }
    
    // 构建查询条件
    const whereClause = { campaign_id }
    if (start_time) whereClause.created_at = { [Op.gte]: new Date(start_time) }
    if (end_time) {
      whereClause.created_at = whereClause.created_at || {}
      whereClause.created_at[Op.lte] = new Date(end_time)
    }
    
    // 获取时间范围内的抽奖记录
    const draws = await LotteryDraw.findAll({
      where: whereClause,
      include: [{ model: LotteryPrize, as: 'prize', attributes: ['prize_id', 'prize_name', 'cost_points', 'reward_tier'] }]
    })
    
    // 计算总成本和各档位成本
    // V4.0 中奖判定：reward_tier IN ('high', 'mid', 'low') 视为中奖
    let totalCost = 0
    const tierCostBreakdown = { high: 0, mid: 0, low: 0, fallback: 0 }
    
    draws.filter(d => ['high', 'mid', 'low'].includes(d.reward_tier) && d.prize_id).forEach(d => {
      // 使用 cost_points 作为奖品成本（lottery_prizes 表实际字段）
      const costValue = d.prize?.cost_points || 0
      totalCost += costValue
      
      const tier = d.reward_tier || 'fallback'
      if (tierCostBreakdown.hasOwnProperty(tier)) {
        tierCostBreakdown[tier] += costValue
      }
    })
    
    // 计算总收入（用户消耗积分）
    const totalRevenue = draws.reduce((sum, d) => sum + (d.cost_points || 0), 0)
    
    // 计算ROI（收入 - 成本）/ 收入 * 100
    const roi = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
    const profit = totalRevenue - totalCost
    
    // 计算用户统计
    const userDrawCounts = {}
    draws.forEach(d => {
      userDrawCounts[d.user_id] = (userDrawCounts[d.user_id] || 0) + 1
    })
    
    const uniqueUsers = Object.keys(userDrawCounts).length
    const repeatUsers = Object.values(userDrawCounts).filter(c => c > 1).length
    const repeatRate = uniqueUsers > 0 ? (repeatUsers / uniqueUsers * 100) : 0
    const avgDrawsPerUser = uniqueUsers > 0 ? (draws.length / uniqueUsers) : 0
    
    const responseData = {
      campaign_id,
      campaign_name: campaign.campaign_name,
      time_range: {
        start_time: start_time || campaign.start_time,
        end_time: end_time || campaign.end_time || new Date().toISOString()
      },
      roi: parseFloat(roi.toFixed(1)),
      total_cost: totalCost,
      total_revenue: totalRevenue,
      profit: profit,
      unique_users: uniqueUsers,
      total_draws: draws.length,
      avg_draws_per_user: parseFloat(avgDrawsPerUser.toFixed(2)),
      repeat_users: repeatUsers,
      repeat_rate: parseFloat(repeatRate.toFixed(1)),
      tier_cost_breakdown: tierCostBreakdown
    }
    
    logger.info('获取活动ROI成功', {
      admin_id: req.user.user_id,
      campaign_id,
      roi: responseData.roi,
      unique_users: uniqueUsers
    })
    
    return res.apiSuccess(responseData, '获取活动ROI成功')
    
  } catch (error) {
    logger.error('获取活动ROI失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_ROI_FAILED', null, 500)
  }
})
```

### 7.7 依赖的 Service 方法

> ⚠️ **V1.1.0 校正**：直接使用 Sequelize 模型查询，减少 Service 层依赖。

| 方法/模型 | 参数 | 返回值 | 状态 | 说明 |
|-----------|-----|-------|-----|------|
| `LotteryCampaign.findByPk()` | campaign_id: number | Campaign Object | ✅ 已存在 | Sequelize 模型方法 |
| `LotteryDraw.findAll()` | where, include | Array\<Draw\> | ✅ 已存在 | Sequelize 模型方法 |
| `LotteryPrize` (关联查询) | - | - | ✅ 已存在 | 通过 include 关联查询 |

**实现说明**：
- 本接口直接使用 Sequelize 模型进行查询，避免创建额外的 Service 方法
- 通过 `include` 关联查询获取奖品信息（prize），减少查询次数
- 利用现有模型关联关系：`LotteryDraw.belongsTo(LotteryPrize, { as: 'prize' })`

---

## 八、P1 - 现有 API 调整

### 8.1 `/stats` 接口增加预算进度字段

> ⚠️ **V1.1.0 校正**：明确数据来源字段。

**当前返回**:
```json
{
  "summary": { ... },
  "trend": [ ... ],
  "prize_distribution": [ ... ]
}
```

**新增字段**:
```json
{
  "summary": { ... },
  "trend": [ ... ],
  "prize_distribution": [ ... ],
  "budget_progress": {
    "campaign_id": 1,
    "daily_limit": 10000,
    "daily_used": 3500,
    "daily_percentage": 35.0,
    "total_limit": 500000,
    "total_used": 125000,
    "total_percentage": 25.0
  }
}
```

**实现要点**:

> ⚠️ **ADR-002 决策**：日预算限制字段存储在 `lottery_campaigns` 表，需先执行数据库迁移。

**前置条件 - 数据库迁移**:
```sql
-- 迁移文件: migrations/YYYYMMDDHHMMSS-add-daily-budget-limit.js
ALTER TABLE lottery_campaigns 
ADD COLUMN daily_budget_limit BIGINT DEFAULT NULL 
COMMENT '每日预算限额（NULL表示不限制）';
```

**数据获取**:
- 从 `lottery_campaigns` 表获取：
  - `daily_budget_limit` → `daily_limit`（新增字段）
  - `pool_budget_total` → `total_limit`（现有字段）
- 从 `lottery_draws` 表统计消耗（基于 `cost_points` 字段）：
  - 当日已消耗：`SUM(cost_points) WHERE DATE(created_at) = CURDATE()`
  - 总消耗：`SUM(cost_points) WHERE campaign_id = ?`
- **备选方案**：从 `lottery_draw_decisions` 表获取 `budget_deducted` 字段进行统计

**边界情况**:
- `daily_budget_limit = NULL` 时，`daily_limit` 返回 `null`，`daily_percentage` 返回 `null`
- `pool_budget_total = 0` 时，`total_percentage` 返回 `100.0`（避免除零）

### 8.2 活动列表接口增加 ROI 字段

> ⚠️ **ADR-001 决策**：使用管理端独立路由，见架构决策记录章节。

**端点**: `GET /api/v4/console/lottery-campaigns`

> 新建路由文件：`routes/v4/console/lottery-campaigns.js`

**新增字段**（每个活动对象中）:
```json
{
  "campaign_id": 1,
  "campaign_name": "...",
  "status": "active",
  // 新增字段
  "roi": 35.5,
  "repeat_rate": 57.1,
  "stock_warning": false,
  "stock_warning_count": 0
}
```

**实现要点**:

> ⚠️ **ADR-003 决策**：ROI/复购率采用 Redis 缓存，TTL 5分钟。

**性能优化 - Redis 缓存**:
```javascript
// 缓存Key设计
const cacheKey = `lottery:campaign:roi:${campaign_id}`
const cacheTTL = 300 // 5分钟

// 带降级的缓存策略（Redis不可用时降级实时计算）
async function getCampaignROIWithCache(campaign_id, redisClient) {
  try {
    const cached = await redisClient.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch (e) {
    logger.warn('Redis缓存读取失败，降级实时计算')
  }
  
  const roi = await calculateCampaignROI(campaign_id)
  
  // 异步写入缓存
  redisClient.setex(cacheKey, 300, JSON.stringify(roi)).catch(() => {})
  return roi
}
```

**ROI 计算逻辑**:
- 活动列表查询时，批量计算各活动的 ROI
- ROI = (总收入 - 总成本) / 总收入 × 100%
- 总收入 = `SUM(cost_points)` from `lottery_draws`
- 总成本 = `SUM(prize.cost_points)` for winning draws

**复购率计算逻辑**:
- 复购率 = 多次抽奖用户数 / 独立用户数 × 100%
- 多次抽奖用户：`COUNT(*) > 1 GROUP BY user_id`

**库存预警逻辑**（基于 `lottery_prizes` 表）:
- 计算剩余库存：`stock_quantity - total_win_count`
- 当任一奖品剩余库存 < 10% 初始库存时，`stock_warning = true`
- `stock_warning_count` = 低库存奖品数量

---

## 九、P2 - 运营日报聚合 API

### 9.1 接口概述

| 属性 | 值 |
|-----|---|
| **端点** | `GET /api/v4/console/lottery-analytics/daily-report` |
| **权限** | 管理员（role_level >= 100） |
| **优先级** | P2 |
| **预计工时** | 2 天（优化后） |

### 9.2 业务需求

运营每日需要向上级汇报抽奖运营数据，当前需要：
1. 手动查看多个页面
2. 截图并汇总到 Excel
3. 计算同比/环比数据

**目标**: 一个 API 返回完整日报数据，前端可一键导出 PDF

### 9.3 数据来源（V1.1.0 补充）

> 基于实际数据库分析，本接口数据主要来自以下表：

| 数据类型 | 数据来源表 | 说明 |
|---------|-----------|------|
| 实时抽奖数据 | `lottery_draws` | 当日/近期的抽奖明细 |
| 小时统计数据 | `lottery_hourly_metrics` | 按小时聚合的统计数据 |
| 每日统计数据 | `lottery_daily_metrics` | 按天聚合的统计数据（适合历史对比） |
| 奖品统计 | `lottery_prizes` | 奖品发放情况（`total_win_count`、`stock_quantity`） |
| 活动配置 | `lottery_campaigns` | 活动基础信息和预算配置 |

**双轨查询策略**：
- **当日数据**：从 `lottery_draws` 实时查询
- **历史对比数据**：从 `lottery_daily_metrics` 查询（性能更优）

### 9.4 请求参数

| 参数名 | 位置 | 类型 | 必填 | 说明 |
|-------|-----|-----|-----|------|
| `report_date` | Query | string | 否 | 报表日期（YYYY-MM-DD），默认昨日 |
| `campaign_id` | Query | integer | 否 | 指定活动，不传则汇总所有活动 |

**请求示例**:
```
GET /api/v4/console/lottery-analytics/daily-report?report_date=2026-01-27
```

### 9.5 响应结构

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "生成运营日报成功",
  "data": {
    "report_date": "2026-01-27",
    "generated_at": "2026-01-28T09:00:00.000+08:00",
    "summary": {
      "total_draws": 1250,
      "total_wins": 875,
      "win_rate": 70.0,
      "total_cost": 35000,
      "total_revenue": 48000,
      "profit": 13000,
      "roi": 27.1,
      "active_users": 320,
      "new_users": 45
    },
    "vs_yesterday": {
      "draws_change": 12.5,
      "wins_change": 8.3,
      "cost_change": 15.2,
      "revenue_change": 18.7,
      "users_change": 5.6
    },
    "vs_last_week": {
      "draws_change": 25.0,
      "wins_change": 22.1,
      "cost_change": 28.5,
      "revenue_change": 32.1,
      "users_change": 18.9
    },
    "alerts": [
      {
        "level": "warning",
        "type": "HIGH_TIER_RATIO",
        "message": "高价值奖品发放比例偏高 (8.5%)",
        "threshold": 5.0,
        "actual": 8.5
      },
      {
        "level": "info",
        "type": "STOCK_LOW",
        "message": "奖品「AirPods」库存不足 (剩余 3 件)",
        "prize_id": 15,
        "remaining": 3
      }
    ],
    "hourly_breakdown": [
      { "hour": 0, "draws": 25, "wins": 18, "cost": 800 },
      { "hour": 1, "draws": 12, "wins": 8, "cost": 350 },
      // ... 24 小时
    ],
    "tier_breakdown": {
      "high": { "count": 35, "cost": 15000, "percentage": 4.0 },
      "mid": { "count": 180, "cost": 12000, "percentage": 20.6 },
      "low": { "count": 420, "cost": 6000, "percentage": 48.0 },
      "fallback": { "count": 240, "cost": 2000, "percentage": 27.4 }
    },
    "top_prizes": [
      { "prize_id": 15, "prize_name": "AirPods", "count": 3, "cost": 4500 },
      { "prize_id": 22, "prize_name": "50元优惠券", "count": 45, "cost": 2250 }
    ],
    "campaigns_breakdown": [
      {
        "campaign_id": 1,
        "campaign_name": "春节活动",
        "draws": 800,
        "cost": 22000,
        "roi": 30.5
      },
      {
        "campaign_id": 2,
        "campaign_name": "会员专享",
        "draws": 450,
        "cost": 13000,
        "roi": 21.8
      }
    ]
  }
}
```

### 9.6 告警规则

> ⚠️ **ADR-004 决策**：预警阈值采用硬编码实现 + 预留配置化入口，详见附录C。

| 告警类型 | 级别 | 触发条件 |
|---------|-----|---------|
| `HIGH_TIER_RATIO` | warning | 高价值奖品发放比例 > 5% |
| `LOW_WIN_RATE` | warning | 中奖率 < 50% |
| `HIGH_COST` | danger | 单日成本超过预算 80% |
| `STOCK_LOW` | info | 任一奖品库存 < 10 件（`stock_quantity - total_win_count`） |
| `NEGATIVE_ROI` | danger | ROI < 0（亏损） |

### 9.7 实现要点

> ⚠️ **V1.1.0 补充**：明确数据来源和性能优化策略。

1. **数据聚合策略**:
   - **当日数据**: 从 `lottery_draws` 实时查询
   - **历史对比数据**: 从 `lottery_daily_metrics` 查询（已预聚合）
   - **小时分布**: 优先使用 `lottery_hourly_metrics`（如存在当日数据）

2. **同比计算**:
   - **昨日对比**: 查询 `lottery_daily_metrics WHERE report_date = DATE_SUB(?, 1 DAY)`
   - **上周同日**: 查询 `lottery_daily_metrics WHERE report_date = DATE_SUB(?, 7 DAY)`

3. **告警生成**: 在聚合完成后，根据规则生成告警列表

4. **性能优化**:
   - 日报数据可缓存到 Redis，有效期 24 小时
   - 历史数据优先使用 `lottery_daily_metrics` 避免大表扫描
   - 可复用现有的 `LotteryAnalyticsService.getDailyTrend()` 方法

---

## 十、实施计划

> ⚠️ **V1.1.0 更新**：基于实际代码分析，优化工时估算。

### 10.1 分阶段实施（优化后）

```
Week 1 (6个工作日)
├── Day 1: P0 用户抽奖档案 API
│   ├── 扩展 getUserDrawRecords Service 方法
│   ├── 实现路由逻辑（复用现有 Service 方法）
│   └── 单元测试
├── Day 2: P1 活动 ROI API
│   ├── 实现路由逻辑（直接使用 Sequelize 模型）
│   └── 单元测试
├── Day 3: P1 现有 API 调整
│   ├── /stats 增加预算进度
│   └── /campaigns 增加 ROI + 库存预警字段
├── Day 4-5: P2 运营日报 API
│   ├── 实现聚合逻辑（复用 getDailyTrend 方法）
│   ├── 实现告警规则
│   └── 单元测试
└── Day 6: 联调测试 + Bug 修复 + 文档更新
```

### 10.2 工时汇总（优化后）

| 优先级 | 任务 | 原工时 | 优化后 | 说明 |
|-------|-----|-------|--------|------|
| P0 | 用户抽奖档案 API | 2天 | 1天 | 复用现有 Service 方法 |
| P1 | 活动 ROI API | 1天 | 1天 | 直接使用 Sequelize 模型 |
| P1 | 现有 API 调整 | 1天 | 1天 | — |
| P2 | 运营日报 API | 3天 | 2天 | 复用 getDailyTrend 方法 |
| — | 联调测试 + 文档 | 1天 | 1天 | — |
| **总计** | — | **8天** | **6天** | 节省 2 天 |

**优化原因**：
- P0 API 可直接复用 `getUserExperienceStates`、`getUserGlobalStates`、`getUserQuotas` 现有方法
- P1 ROI API 可直接使用 Sequelize 模型查询，无需创建额外 Service 方法
- P2 运营日报可复用 `getDailyTrend`、`getHourlyTrend`、`getTierDistribution` 现有方法

---

## 十一、验收标准

### 11.1 功能验收

| API | 验收条件 |
|-----|---------|
| 用户抽奖档案 | ① 返回完整的 stats/experience/global_state/quotas/recent_draws ② 响应时间 < 500ms ③ 中奖统计基于 `reward_tier` 字段 |
| 活动 ROI | ① ROI 计算准确（与手工计算一致） ② 支持时间范围筛选 ③ 成本计算基于 `cost_points` 字段 |
| 运营日报 | ① 包含同比/环比数据 ② 告警规则正确触发 ③ 24小时分布完整 |

### 11.2 非功能验收

| 指标 | 要求 |
|-----|-----|
| 响应时间 | P95 < 1s |
| 错误处理 | 所有异常返回标准错误格式（success/code/message/data） |
| 日志 | 关键操作有日志记录（使用 `logger.info/error`） |
| 权限 | 仅管理员可访问（role_level >= 100） |
| 时区 | 所有时间返回北京时间（ISO8601+08:00） |

### 11.3 测试覆盖

- [ ] 单元测试覆盖率 > 80%
- [ ] 包含异常场景测试（无数据、无效参数、用户不存在）
- [ ] 包含性能测试（大数据量场景）
- [ ] 验证 `reward_tier` 中奖判定逻辑正确

---

## 附录 A：相关数据表结构（V1.1.0 校正）

> ⚠️ **重要说明**：以下结构已根据实际数据库 `DESCRIBE` 命令校正。

### lottery_draws（抽奖记录）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `draw_id` | INT | 主键 |
| `user_id` | INT | 用户 ID |
| `campaign_id` | INT | 活动 ID |
| `reward_tier` | VARCHAR(20) | 奖品档位 (high/mid/low/fallback) |
| `prize_id` | INT | 中奖的奖品 ID |
| `cost_points` | INT | 消耗积分 |
| `prize_value_points` | INT | 奖品价值点数 |
| `created_at` | DATETIME | 抽奖时间 |
| `idempotency_key` | VARCHAR(100) | 幂等键 |
| `business_id` | VARCHAR(100) | 业务唯一 ID |

> ⚠️ **V4.0 变更**：`is_winner` 字段已移除，中奖判定改为基于 `reward_tier` 字段：
> - `reward_tier IN ('high', 'mid', 'low')` → 中奖
> - `reward_tier = 'fallback'` → 保底/未中奖

### lottery_user_experience_state（用户活动体验状态）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `state_id` | INT | 主键 |
| `user_id` | INT | 用户 ID |
| `campaign_id` | INT | 活动 ID |
| `empty_streak` | INT | 当前连续未中奖次数 |
| `max_empty_streak` | INT | 历史最大连续未中奖 |
| `total_draw_count` | INT | 活动内总抽奖次数 |
| `total_empty_count` | INT | 活动内总未中次数 |
| `pity_trigger_count` | INT | 保底触发次数 |
| `recent_high_count` | INT | 近期高价值奖品次数 |
| `last_draw_at` | DATETIME | 最后抽奖时间 |
| `last_draw_tier` | VARCHAR(20) | 最后抽奖奖品等级 |
| `updated_at` | DATETIME | 最后更新时间 |

### lottery_user_global_state（用户全局状态）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `global_state_id` | INT | 主键 |
| `user_id` | INT | 用户 ID |
| `global_draw_count` | INT | 全局总抽奖次数 |
| `global_empty_count` | INT | 全局总未中次数 |
| `historical_empty_rate` | DECIMAL(5,4) | 历史空奖率 |
| `luck_debt_level` | VARCHAR(20) | 运气债务等级 (none/low/medium/high) |
| `luck_debt_multiplier` | DECIMAL(3,2) | 运气债务乘数 |
| `global_high_count` | INT | 全局高价值奖品次数 |
| `global_mid_count` | INT | 全局中等价值奖品次数 |
| `global_low_count` | INT | 全局低价值奖品次数 |
| `participated_campaigns` | INT | 参与的活动数量 |
| `last_draw_at` | DATETIME | 最后抽奖时间 |
| `last_campaign_id` | INT | 最后参与的活动 ID |

### lottery_prizes（奖品配置）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `prize_id` | INT | 主键 |
| `campaign_id` | INT | 活动 ID |
| `prize_name` | VARCHAR(100) | 奖品名称 |
| `reward_tier` | VARCHAR(20) | 奖品档位 (high/mid/low/fallback) |
| `cost_points` | INT | 奖品成本点数 |
| `stock_quantity` | INT | 库存数量 |
| `total_win_count` | INT | 累计中奖次数 |

### lottery_campaign_user_quota（用户配额）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `quota_id` | INT | 主键 |
| `user_id` | INT | 用户 ID |
| `campaign_id` | INT | 活动 ID |
| `quota_total` | INT | 配额总量 |
| `quota_used` | INT | 已使用配额 |
| `quota_remaining` | INT | 剩余配额 |
| `status` | VARCHAR(20) | 配额状态 (active/expired/exhausted) |
| `expires_at` | DATETIME | 配额过期时间 |

### lottery_hourly_metrics（小时统计指标）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `metric_id` | INT | 主键 |
| `campaign_id` | INT | 活动 ID |
| `hour_start` | DATETIME | 小时开始时间 |
| `total_draws` | INT | 总抽奖次数 |
| `unique_users` | INT | 独立用户数 |
| `high_count` | INT | 高价值奖品次数 |
| `mid_count` | INT | 中等价值奖品次数 |
| `low_count` | INT | 低价值奖品次数 |
| `fallback_count` | INT | 保底奖品次数 |

### lottery_daily_metrics（每日统计指标）

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `metric_id` | INT | 主键 |
| `campaign_id` | INT | 活动 ID |
| `report_date` | DATE | 报表日期 |
| `total_draws` | INT | 总抽奖次数 |
| `unique_users` | INT | 独立用户数 |
| `total_cost` | INT | 总成本 |
| `total_revenue` | INT | 总收入 |

---

## 附录 B：现有 API 和 Service 方法参考（V1.1.0 补充）

### 已实现的监控 API

| 端点 | 方法 | 说明 |
|-----|-----|------|
| `/api/v4/console/lottery-monitoring/stats` | GET | 综合监控统计 |
| `/api/v4/console/lottery-monitoring/hourly-metrics` | GET | 小时统计指标 |
| `/api/v4/console/lottery-monitoring/user-experience-states` | GET | 用户体验状态列表 |
| `/api/v4/console/lottery-monitoring/user-global-states` | GET | 用户全局状态列表 |
| `/api/v4/console/lottery-monitoring/user-quotas` | GET | 用户配额列表 |

### LotteryAnalyticsService 现有方法（可复用）

基于 `services/LotteryAnalyticsService.js` 代码分析：

| 方法名 | 功能 | 可复用性 |
|-------|------|---------|
| `getHourlyMetrics(filters)` | 获取小时统计指标 | ✅ P2 日报可复用 |
| `getUserExperienceStates(filters)` | 查询用户活动体验状态 | ✅ P0 直接复用 |
| `getUserGlobalStates(filters)` | 查询用户全局状态 | ✅ P0 直接复用 |
| `getQuotaGrants(filters)` | 获取配额发放记录 | — |
| `getUserQuotas(filters)` | 获取用户配额 | ✅ P0 直接复用 |
| `getMonitoringStats(campaign_id, options)` | 获取综合监控统计 | ✅ P2 部分复用 |
| `getRealtimeOverview(campaign_id)` | 获取实时概览 | — |
| `getHourlyTrend(campaign_id, hours)` | 获取小时趋势（默认24小时） | ✅ P2 日报可复用 |
| `getDailyTrend(campaign_id, days)` | 获取每日趋势（默认7天） | ✅ P2 日报可复用 |
| `getTierDistribution(campaign_id, options)` | 获取档位分布统计 | ✅ P2 日报可复用 |
| `getExperienceTriggers(campaign_id, options)` | 获取体验触发统计 | — |
| `getBudgetConsumption(campaign_id)` | 获取预算消耗情况 | ✅ P1 /stats 可复用 |

### Service 层调用示例

```javascript
// 获取 Service 实例（推荐方式）
function getLotteryAnalyticsService(req) {
  return req.app.locals.services.getService('lottery_analytics')
}

// 使用示例
const analyticsService = getLotteryAnalyticsService(req)
const experienceStates = await analyticsService.getUserExperienceStates({ user_id: 12345 })
const globalStates = await analyticsService.getUserGlobalStates({ user_id: 12345 })
const quotas = await analyticsService.getUserQuotas({ user_id: 12345 })
```

### 数据查询双轨策略

`LotteryAnalyticsService` 实现了双轨查询策略：

```javascript
// 实时数据（近期）：从 lottery_draws 实时查询
if (isRecentPeriod(hours)) {
  return await queryFromLotteryDraws(campaignId, hours)
}

// 历史数据（较长周期）：从 lottery_hourly_metrics 预聚合表查询
return await queryFromHourlyMetrics(campaignId, hours)
```

**应用建议**：
- **P0 用户抽奖档案**：直接使用现有 Service 方法
- **P1 活动 ROI**：直接使用 Sequelize 模型查询（数据量较小）
- **P2 运营日报**：复用 `getDailyTrend`、`getHourlyTrend`、`getTierDistribution` 方法

---

## 附录 C：预警阈值配置

> ⚠️ **ADR-004 决策**：预警阈值采用硬编码实现 + 预留配置化入口

### C.1 阈值配置文件

**文件路径**: `config/alert-thresholds.js`

```javascript
/**
 * 抽奖运营预警阈值配置
 * 
 * 当前采用硬编码实现（ADR-004），未来可改为从数据库/配置中心读取
 * 
 * @version 1.0.0
 * @since 2026-01-28
 */

const LOTTERY_ALERT_THRESHOLDS = {
  /**
   * 高价值奖品发放比例预警
   * 当高价值奖品(reward_tier='high')占比超过阈值时触发
   */
  HIGH_TIER_RATIO: {
    threshold: 0.30,         // 30%
    operator: '>',
    severity: 'warning',
    description: '高价值奖品发放比例偏高',
    action: '建议检查奖品权重配置或开启防高价值机制'
  },

  /**
   * 空奖率过高预警（低中奖率）
   * 当空奖(reward_tier='fallback')占比超过阈值时触发
   */
  LOW_WIN_RATE: {
    threshold: 0.50,         // 50%
    operator: '>',
    severity: 'warning',
    description: '空奖率过高，用户体验可能受影响',
    action: '建议检查奖品配置或开启保底机制'
  },

  /**
   * 成本超支预警
   * 当实际成本超过预算的指定倍数时触发
   */
  HIGH_COST: {
    threshold: 1.20,         // 120% (超出预算20%)
    operator: '>',
    severity: 'critical',
    description: '成本超出预算',
    action: '建议暂停活动或调整奖品配置'
  },

  /**
   * 库存不足预警
   * 当任一奖品剩余库存低于阈值时触发
   */
  STOCK_LOW: {
    threshold: 0.10,         // 10% (剩余库存低于初始的10%)
    operator: '<',
    severity: 'critical',
    description: '奖品库存不足',
    action: '建议及时补充库存或调整奖品权重'
  },

  /**
   * ROI 为负预警
   * 当活动 ROI 为负数时触发（亏损状态）
   */
  NEGATIVE_ROI: {
    threshold: 0,
    operator: '<',
    severity: 'warning',
    description: 'ROI为负，活动处于亏损状态',
    action: '建议检查奖品成本配置和用户消耗设置'
  }
}

/**
 * 获取预警阈值配置
 * 
 * 预留配置化入口：未来可从数据库/配置中心读取
 * 
 * @param {string} alertType - 预警类型
 * @returns {object} 阈值配置
 */
function getAlertThreshold(alertType) {
  // 未来可改为：return await getThresholdFromDB(alertType)
  return LOTTERY_ALERT_THRESHOLDS[alertType] || null
}

/**
 * 获取所有预警阈值配置
 * 
 * @returns {object} 所有阈值配置
 */
function getAllAlertThresholds() {
  // 未来可改为：return await getAllThresholdsFromDB()
  return { ...LOTTERY_ALERT_THRESHOLDS }
}

module.exports = {
  LOTTERY_ALERT_THRESHOLDS,
  getAlertThreshold,
  getAllAlertThresholds
}
```

### C.2 阈值配置说明

| 预警类型 | 阈值 | 运算符 | 级别 | 说明 |
|---------|-----|--------|-----|------|
| `HIGH_TIER_RATIO` | 30% | > | warning | 高价值奖品发放比例超过30% |
| `LOW_WIN_RATE` | 50% | > | warning | 空奖率超过50% |
| `HIGH_COST` | 120% | > | critical | 成本超出预算的120% |
| `STOCK_LOW` | 10% | < | critical | 奖品剩余库存低于初始的10% |
| `NEGATIVE_ROI` | 0 | < | warning | ROI为负数（亏损） |

### C.3 预警级别定义

| 级别 | 含义 | 处理建议 |
|-----|------|---------|
| `critical` | 严重告警 | 需立即处理，可能影响业务正常运行 |
| `warning` | 普通警告 | 需关注，可能影响用户体验或成本 |
| `info` | 信息提示 | 仅供参考，无需立即处理 |

### C.4 使用示例

```javascript
const { LOTTERY_ALERT_THRESHOLDS, getAlertThreshold } = require('../config/alert-thresholds')

// 检查高价值奖品比例
function checkHighTierRatio(highTierCount, totalDraws) {
  const config = getAlertThreshold('HIGH_TIER_RATIO')
  const ratio = totalDraws > 0 ? highTierCount / totalDraws : 0
  
  if (ratio > config.threshold) {
    return {
      triggered: true,
      level: config.severity,
      type: 'HIGH_TIER_RATIO',
      message: config.description,
      threshold: config.threshold,
      actual: ratio,
      action: config.action
    }
  }
  
  return { triggered: false }
}

// 检查库存预警
function checkStockLow(remainingStock, initialStock) {
  const config = getAlertThreshold('STOCK_LOW')
  const ratio = initialStock > 0 ? remainingStock / initialStock : 1
  
  if (ratio < config.threshold) {
    return {
      triggered: true,
      level: config.severity,
      type: 'STOCK_LOW',
      message: config.description,
      threshold: config.threshold,
      actual: ratio,
      remaining: remainingStock,
      action: config.action
    }
  }
  
  return { triggered: false }
}
```

### C.5 未来配置化扩展方案

当需要将阈值改为可配置时，只需修改 `getAlertThreshold` 和 `getAllAlertThresholds` 函数的实现：

```javascript
// 方案A：从数据库读取
async function getAlertThreshold(alertType) {
  const config = await LotteryAlertConfig.findOne({
    where: { alert_type: alertType, is_active: true }
  })
  return config ? config.toJSON() : LOTTERY_ALERT_THRESHOLDS[alertType]
}

// 方案B：从配置中心读取（如 Apollo/Nacos）
async function getAlertThreshold(alertType) {
  const configClient = getConfigClient()
  const remoteConfig = await configClient.get(`lottery.alert.${alertType}`)
  return remoteConfig || LOTTERY_ALERT_THRESHOLDS[alertType]
}
```

---

*文档维护: 后端开发团队*  
*最后更新: 2026-01-28*  
*版本: v1.2.0*

