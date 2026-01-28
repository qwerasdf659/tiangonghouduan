# 抽奖运营后台 - 后端API开发需求文档（待规划）

> **文档版本**: v1.0.0  
> **创建日期**: 2026-01-29  
> **最后更新**: 2026-01-29  
> **文档类型**: 后端开发需求文档  
> **目标读者**: 后端开发工程师  
> **关联文档**: 《抽奖运营后台规划书-含行业对标.md》

---

## 目录

- [一、项目概述](#一项目概述)
- [二、技术栈与项目结构](#二技术栈与项目结构)
- [三、待开发API清单](#三待开发api清单)
- [四、API详细设计](#四api详细设计)
  - [4.1 B1: 实时告警列表](#41-b1-实时告警列表)
  - [4.2 B2: 单次抽奖Pipeline详情](#42-b2-单次抽奖pipeline详情)
  - [4.3 B3: 异常用户列表](#43-b3-异常用户列表)
  - [4.4 B4: 活动复盘报告](#44-b4-活动复盘报告)
  - [4.5 B5: 策略效果分析](#45-b5-策略效果分析)
- [五、数据库设计](#五数据库设计)
- [六、开发计划](#六开发计划)
- [七、测试要求](#七测试要求)

---

## 一、项目概述

### 1.1 背景

本文档定义了抽奖运营后台系统中**待规划的后端API**开发需求。这些API旨在为运营团队提供更深入的数据洞察和风险控制能力。

### 1.2 已完成的后端工作

以下核心API已于 2026-01-28 完成：

| 端点 | 功能 | 状态 |
|-----|------|------|
| `/api/v4/console/lottery-monitoring/stats` | 综合监控统计 | ✅ 已完成 |
| `/api/v4/console/lottery-monitoring/hourly-metrics` | 小时统计指标 | ✅ 已完成 |
| `/api/v4/console/lottery-monitoring/user-profile/:user_id` | 用户抽奖档案聚合 | ✅ 已完成 |
| `/api/v4/console/lottery-monitoring/campaign-roi/:campaign_id` | 活动ROI计算 | ✅ 已完成 |
| `/api/v4/console/lottery-analytics/daily-report` | 日报数据聚合 | ✅ 已完成 |

### 1.3 本文档范围

本文档涵盖以下 **5个待规划API** 的开发需求：

| 序号 | API | 功能 | 优先级 | 工作量 |
|-----|-----|------|-------|-------|
| B1 | realtime-alerts | 实时告警列表 | P0 | 3天 |
| B2 | draw-details | 单次抽奖Pipeline详情 | P1 | 2天 |
| B3 | abnormal-users | 异常用户列表 | P1 | 3天 |
| B4 | campaign-report | 活动复盘报告 | P2 | 4天 |
| B5 | strategy-effectiveness | 策略效果分析 | P2 | 3天 |

**总工作量**: 约 15 天

---

## 二、技术栈与项目结构

### 2.1 技术栈

| 层级 | 技术 | 版本 |
|-----|------|-----|
| 运行环境 | Node.js | 18.x |
| Web框架 | Express | 4.x |
| ORM | Sequelize | 6.x |
| 数据库 | MySQL | 8.x |
| 缓存 | Redis | 7.x |

### 2.2 项目目录结构

```
/home/devbox/project/
├── routes/v4/console/
│   └── lottery-monitoring.js      # 路由文件（扩展）
├── services/
│   ├── LotteryAnalyticsService.js # 分析服务（扩展）
│   ├── LotteryAlertService.js     # 告警服务（新建）
│   ├── LotteryRiskService.js      # 风控服务（新建）
│   └── LotteryReportService.js    # 报告服务（新建）
├── models/
│   └── lottery_alerts.js          # 告警表模型（新建）
└── middleware/
    └── authMiddleware.js          # 已有认证中间件
```

### 2.3 认证与权限

所有API需要：
- JWT Token 认证 (`authenticateToken` 中间件)
- 管理员角色权限 (`requireRoleLevel(100)` 中间件)

---

## 三、待开发API清单

### 3.1 API端点总览

| 序号 | 端点 | 方法 | 功能 | 优先级 |
|-----|------|-----|------|-------|
| B1 | `/api/v4/console/lottery-monitoring/realtime-alerts` | GET | 实时告警列表 | P0 |
| B2 | `/api/v4/console/lottery-monitoring/draw-details/:draw_id` | GET | 单次抽奖Pipeline详情 | P1 |
| B3 | `/api/v4/console/lottery-monitoring/abnormal-users` | GET | 异常用户列表 | P1 |
| B4 | `/api/v4/console/lottery-monitoring/campaign-report/:campaign_id` | GET | 活动复盘报告 | P2 |
| B5 | `/api/v4/console/lottery-monitoring/strategy-effectiveness` | GET | 策略效果分析 | P2 |

### 3.2 新建文件清单

| 文件类型 | 文件路径 | 说明 |
|---------|---------|------|
| 服务 | `services/LotteryAlertService.js` | 告警检测与管理服务 |
| 服务 | `services/LotteryRiskService.js` | 风控检测服务 |
| 服务 | `services/LotteryReportService.js` | 报告生成服务 |
| 模型 | `models/lottery_alerts.js` | 告警记录表模型 |
| 迁移 | `migrations/xxx-create-lottery-alerts.js` | 告警表迁移文件 |

### 3.3 扩展文件清单

| 文件路径 | 扩展内容 |
|---------|---------|
| `routes/v4/console/lottery-monitoring.js` | 新增5个路由端点 |
| `services/LotteryAnalyticsService.js` | 新增 draw-details 和 strategy-effectiveness 方法 |

---

## 四、API详细设计

### 4.1 B1: 实时告警列表

#### 基本信息

| 属性 | 值 |
|-----|-----|
| 端点 | `/api/v4/console/lottery-monitoring/realtime-alerts` |
| 方法 | GET |
| 优先级 | P0 |
| 工作量 | 3天 |
| 服务文件 | `services/LotteryAlertService.js`（新建）|

#### 功能说明

获取当前活跃的告警列表，支持按级别、类型筛选。告警基于规则引擎自动触发，帮助运营及时发现异常。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|------|
| level | string | 否 | 告警级别：info/warning/danger |
| type | string | 否 | 告警类型：win_rate/budget/inventory/user |
| status | string | 否 | 状态：active/acknowledged/resolved |
| campaign_id | number | 否 | 筛选指定活动的告警 |
| limit | number | 否 | 返回数量，默认50 |

#### 响应数据结构

```javascript
{
  success: true,
  code: "SUCCESS",
  message: "获取告警列表成功",
  data: {
    total: 5,
    active_count: 3,
    alerts: [
      {
        alert_id: 1001,
        type: "win_rate_abnormal",
        level: "warning",
        status: "active",
        title: "中奖率异常偏高",
        message: "最近1小时中奖率 32.5%，高于配置值 25% 的 30%",
        campaign_id: 101,
        campaign_name: "春节活动",
        triggered_at: "2026-01-29T10:30:00+08:00",
        threshold: { expected: 0.25, actual: 0.325, deviation: 0.30 },
        suggested_action: "检查概率配置或高档奖品库存"
      },
      {
        alert_id: 1002,
        type: "budget_warning",
        level: "danger",
        status: "active",
        title: "预算即将耗尽",
        message: "活动预算已消耗 92%，剩余 ¥800",
        campaign_id: 101,
        campaign_name: "春节活动",
        triggered_at: "2026-01-29T11:00:00+08:00",
        threshold: { total: 10000, used: 9200, percentage: 0.92 },
        suggested_action: "考虑追加预算或暂停活动"
      }
    ]
  },
  timestamp: "2026-01-29T12:00:00+08:00"
}
```

#### 告警规则配置

| 告警类型 | 规则ID | 触发条件 | 级别 |
|---------|-------|---------|------|
| win_rate_abnormal | RULE_001 | 最近1小时中奖率偏离配置值±20% | warning |
| high_tier_fast | RULE_002 | 高档奖品发放速度超过预算的1.5倍 | danger |
| budget_warning | RULE_003 | 预算消耗达到90% | warning |
| budget_exhausted | RULE_004 | 预算消耗达到100% | danger |
| inventory_low | RULE_005 | 任意奖品库存<10件 | danger |
| consecutive_empty | RULE_006 | 连续空奖≥10次的用户数占比超过5% | warning |

#### 数据库依赖

- **新建表**: `lottery_alerts`（见第五章）
- **读取表**: `lottery_campaigns`, `lottery_draws`, `lottery_prize_inventory`

#### 实现要点

1. 定时任务（建议每5分钟）检测告警规则
2. 告警去重：相同类型+活动+1小时内不重复触发
3. 告警自动解除：当条件恢复正常时标记为 resolved
4. WebSocket 推送（可选）：新告警实时推送到前端

---

### 4.2 B2: 单次抽奖Pipeline详情

#### 基本信息

| 属性 | 值 |
|-----|-----|
| 端点 | `/api/v4/console/lottery-monitoring/draw-details/:draw_id` |
| 方法 | GET |
| 优先级 | P1 |
| 工作量 | 2天 |
| 服务文件 | `services/LotteryAnalyticsService.js`（扩展）|

#### 功能说明

查看单次抽奖的完整决策过程，包括 Pipeline 11阶段执行链路、概率计算明细、降级路径等。

#### 应用场景

- 用户投诉"为什么这次抽奖是这个结果"时，运营需要解释决策过程
- 审计抽奖系统的公平性

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|------|
| draw_id | string | 是 | 抽奖记录ID（路径参数）|

#### 响应数据结构

```javascript
{
  success: true,
  code: "SUCCESS",
  message: "获取抽奖详情成功",
  data: {
    draw_id: "draw_20260129_abc123",
    user_id: 10086,
    campaign_id: 101,
    campaign_name: "春节活动",
    draw_time: "2026-01-29T10:30:15+08:00",
    
    // Pipeline 11阶段执行链路
    pipeline_stages: [
      { stage: 1, name: "LoadCampaign", duration_ms: 2, status: "success", result: "活动有效，ID=101" },
      { stage: 2, name: "CheckUserQuota", duration_ms: 3, status: "success", result: "今日已抽3次，剩余7次" },
      { stage: 3, name: "LoadUserState", duration_ms: 5, status: "success", result: "B3P2, 连空5次" },
      { stage: 4, name: "ComputeBaseProb", duration_ms: 1, status: "success", result: "基础概率已计算" },
      { stage: 5, name: "ApplyBxPxMatrix", duration_ms: 2, status: "success", result: "BxPx调整因子已应用" },
      { stage: 6, name: "ApplyPityBonus", duration_ms: 1, status: "success", result: "Pity加成 +5%" },
      { stage: 7, name: "CheckAntiEmpty", duration_ms: 1, status: "success", result: "反空奖未触发" },
      { stage: 8, name: "FinalizeProb", duration_ms: 1, status: "success", result: "最终概率已确定" },
      { stage: 9, name: "RandomDraw", duration_ms: 0, status: "success", result: "随机数=0.7234, 命中tier_4" },
      { stage: 10, name: "SelectPrize", duration_ms: 3, status: "success", result: "选中奖品ID=501" },
      { stage: 11, name: "RecordResult", duration_ms: 8, status: "success", result: "记录已保存" }
    ],
    total_duration_ms: 27,
    
    // 概率计算明细
    probability_breakdown: {
      base_probability: { tier_1: 0.01, tier_2: 0.05, tier_3: 0.20, tier_4: 0.74 },
      bxpx_multiplier: { tier_1: 0.8, tier_2: 0.9, tier_3: 1.0, tier_4: 1.0 },
      pity_bonus: { tier_3: 0.05 },
      final_probability: { tier_1: 0.008, tier_2: 0.045, tier_3: 0.25, tier_4: 0.697 }
    },
    
    // 抽奖结果
    random_seed: 0.7234,
    hit_tier: "tier_4",
    prize_id: 501,
    prize_name: "5积分",
    prize_value: 0.05,
    
    // 特殊情况信息
    downgrade_info: null,  // 如有降级：{ from_tier: "tier_2", to_tier: "tier_3", reason: "库存不足" }
    intervention_info: null,  // 如有干预：{ rule_id: "RULE_VIP", reason: "VIP保底" }
    
    // 用户当时状态
    user_state_snapshot: {
      behavior_tier: "B3",
      purchase_tier: "P2",
      consecutive_empty: 5,
      pity_counter: 12,
      total_draws_today: 3
    }
  },
  timestamp: "2026-01-29T12:00:00+08:00"
}
```

#### 数据库依赖

- **读取表**: `lottery_draws`, `lottery_probability_logs`（如存在）, `lottery_user_experience_state`

#### 实现要点

1. 从 `lottery_draws` 读取基础抽奖记录
2. 如果系统记录了详细的 pipeline 执行日志，从相关表读取
3. 如果没有详细日志，基于现有数据重建概率计算过程
4. 注意数据脱敏：隐藏具体随机数生成算法细节

---

### 4.3 B3: 异常用户列表

#### 基本信息

| 属性 | 值 |
|-----|-----|
| 端点 | `/api/v4/console/lottery-monitoring/abnormal-users` |
| 方法 | GET |
| 优先级 | P1 |
| 工作量 | 3天 |
| 服务文件 | `services/LotteryRiskService.js`（新建）|

#### 功能说明

检测高频抽奖用户、疑似脚本用户、同IP多账号等异常行为，为运营提供风控参考。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|------|
| risk_type | string | 否 | 风险类型：high_frequency/lucky_streak/multi_account |
| campaign_id | number | 否 | 筛选指定活动 |
| time_range | string | 否 | 时间范围：1h/6h/24h，默认24h |
| min_risk_score | number | 否 | 最低风险分数，0-100 |
| limit | number | 否 | 返回数量，默认50 |

#### 响应数据结构

```javascript
{
  success: true,
  code: "SUCCESS",
  message: "获取异常用户列表成功",
  data: {
    total: 12,
    users: [
      {
        user_id: 20001,
        username: "user_xxx",
        risk_score: 85,
        risk_level: "high",
        risk_types: ["high_frequency", "lucky_streak"],
        details: {
          draws_1h: 156,           // 最近1小时抽奖次数
          draws_24h: 890,          // 最近24小时抽奖次数
          high_tier_wins_1h: 8,    // 最近1小时高档中奖数
          avg_interval_seconds: 23, // 平均抽奖间隔（秒）
          ip_addresses: ["192.168.1.100", "192.168.1.101"],
          device_fingerprints: ["fp_abc", "fp_def"]
        },
        first_abnormal_at: "2026-01-29T08:00:00+08:00",
        last_activity_at: "2026-01-29T11:55:00+08:00",
        suggested_action: "建议人工审核，可能为脚本刷奖"
      },
      {
        user_id: 20002,
        username: "user_yyy",
        risk_score: 72,
        risk_level: "medium",
        risk_types: ["multi_account"],
        details: {
          draws_1h: 45,
          draws_24h: 200,
          high_tier_wins_1h: 2,
          related_accounts: [20003, 20004, 20005],  // 同IP关联账号
          shared_ip: "192.168.2.50"
        },
        first_abnormal_at: "2026-01-29T09:30:00+08:00",
        last_activity_at: "2026-01-29T11:30:00+08:00",
        suggested_action: "建议核实账号关联性"
      }
    ],
    summary: {
      high_risk_count: 3,
      medium_risk_count: 5,
      low_risk_count: 4
    }
  },
  timestamp: "2026-01-29T12:00:00+08:00"
}
```

#### 检测维度与阈值

| 维度 | 阈值 | 风险分数 | 说明 |
|-----|-----|---------|------|
| 高频抽奖 | 单用户1小时内>100次 | +40 | 疑似脚本 |
| 短时间大量中奖 | 单用户1小时内高档奖品>5件 | +30 | 疑似漏洞利用 |
| 同IP多账号 | 同一IP下5个以上账号参与抽奖 | +25 | 疑似刷单 |
| 抽奖间隔异常 | 平均间隔<5秒 | +20 | 疑似自动化 |
| 异常时段活跃 | 凌晨2-6点大量抽奖 | +15 | 可疑行为 |

#### 数据库依赖

- **读取表**: `lottery_draws`, `users`, `user_login_logs`（如有IP记录）

#### 实现要点

1. 使用窗口函数计算用户在时间窗口内的抽奖频率
2. 风险分数为各维度分数累加，上限100
3. 风险等级：high(≥70), medium(40-69), low(<40)
4. 考虑性能：对大表查询添加合适的索引和分页

---

### 4.4 B4: 活动复盘报告

#### 基本信息

| 属性 | 值 |
|-----|-----|
| 端点 | `/api/v4/console/lottery-monitoring/campaign-report/:campaign_id` |
| 方法 | GET |
| 优先级 | P2 |
| 工作量 | 4天 |
| 服务文件 | `services/LotteryReportService.js`（新建）|

#### 功能说明

生成活动结束后的完整数据报告，支持运营进行活动复盘和效果评估。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|------|
| campaign_id | number | 是 | 活动ID（路径参数）|
| compare_campaign_id | number | 否 | 对比活动ID |

#### 响应数据结构

```javascript
{
  success: true,
  code: "SUCCESS",
  message: "获取活动报告成功",
  data: {
    // 活动基础信息
    campaign: {
      campaign_id: 101,
      name: "春节活动",
      start_time: "2026-01-20T00:00:00+08:00",
      end_time: "2026-01-28T23:59:59+08:00",
      duration_days: 9,
      status: "completed"
    },
    
    // 参与数据
    participation: {
      total_draws: 125000,
      unique_users: 8500,
      avg_draws_per_user: 14.7,
      repeat_rate: 0.68,           // 复抽率：多次抽奖用户占比
      new_user_count: 2100,        // 新用户参与数
      returning_user_count: 6400   // 老用户参与数
    },
    
    // 奖品发放统计
    prize_distribution: {
      by_tier: [
        { tier: "tier_1", name: "一等奖", count: 125, value_total: 12500, percentage: 0.001 },
        { tier: "tier_2", name: "二等奖", count: 1250, value_total: 6250, percentage: 0.01 },
        { tier: "tier_3", name: "三等奖", count: 25000, value_total: 12500, percentage: 0.20 },
        { tier: "tier_4", name: "四等奖", count: 87500, value_total: 4375, percentage: 0.70 },
        { tier: "empty", name: "未中奖", count: 11125, value_total: 0, percentage: 0.089 }
      ],
      total_prizes_issued: 113875,
      total_value_issued: 35625,
      actual_win_rate: 0.911
    },
    
    // 预算执行情况
    budget: {
      total_budget: 40000,
      used_budget: 35625,
      remaining_budget: 4375,
      usage_percentage: 0.891,
      daily_burn_rate: 3958.33
    },
    
    // ROI分析
    roi: {
      total_cost: 35625,           // 奖品成本
      user_acquisition_cost: 4.19, // 单用户获取成本
      estimated_gmv_lift: 85000,   // 预估GMV提升（如有数据）
      roi_ratio: 2.39              // 投入产出比
    },
    
    // 时段分布
    hourly_distribution: [
      { hour: 0, draws: 2500, percentage: 0.02 },
      { hour: 1, draws: 1500, percentage: 0.012 },
      // ... 0-23小时
      { hour: 12, draws: 15000, percentage: 0.12 },  // 午高峰
      { hour: 20, draws: 18000, percentage: 0.144 }  // 晚高峰
    ],
    
    // 每日趋势
    daily_trend: [
      { date: "2026-01-20", draws: 12000, users: 3200, cost: 3500 },
      { date: "2026-01-21", draws: 14500, users: 3800, cost: 4100 },
      // ... 每日数据
    ],
    
    // 对比分析（如提供 compare_campaign_id）
    comparison: null  // 或 { ... 对比数据 }
  },
  timestamp: "2026-01-29T12:00:00+08:00"
}
```

#### 数据库依赖

- **读取表**: `lottery_campaigns`, `lottery_draws`, `lottery_prize_inventory`, `lottery_budget_consumption`, `users`

#### 实现要点

1. 大量聚合查询，考虑性能优化
2. 可缓存已结束活动的报告数据
3. ROI计算可能需要对接订单系统（如有）
4. 时段分布和每日趋势使用 GROUP BY 聚合

---

### 4.5 B5: 策略效果分析

#### 基本信息

| 属性 | 值 |
|-----|-----|
| 端点 | `/api/v4/console/lottery-monitoring/strategy-effectiveness` |
| 方法 | GET |
| 优先级 | P2 |
| 工作量 | 3天 |
| 服务文件 | `services/LotteryAnalyticsService.js`（扩展）|

#### 功能说明

分析 BxPx 矩阵、Pity 机制、反空奖机制的实际触发效果，帮助运营评估策略配置的合理性。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|-----|-----|-----|------|
| campaign_id | number | 否 | 筛选指定活动 |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

#### 响应数据结构

```javascript
{
  success: true,
  code: "SUCCESS",
  message: "获取策略效果分析成功",
  data: {
    time_range: {
      start: "2026-01-20T00:00:00+08:00",
      end: "2026-01-29T00:00:00+08:00"
    },
    total_draws_analyzed: 125000,
    
    // BxPx矩阵命中分布
    bxpx_matrix: {
      distribution: [
        { behavior: "B1", purchase: "P1", count: 5000, percentage: 0.04, avg_win_rate: 0.15 },
        { behavior: "B1", purchase: "P2", count: 8000, percentage: 0.064, avg_win_rate: 0.18 },
        { behavior: "B1", purchase: "P3", count: 3000, percentage: 0.024, avg_win_rate: 0.22 },
        { behavior: "B2", purchase: "P1", count: 12000, percentage: 0.096, avg_win_rate: 0.20 },
        { behavior: "B2", purchase: "P2", count: 25000, percentage: 0.20, avg_win_rate: 0.25 },
        { behavior: "B2", purchase: "P3", count: 15000, percentage: 0.12, avg_win_rate: 0.30 },
        { behavior: "B3", purchase: "P1", count: 18000, percentage: 0.144, avg_win_rate: 0.28 },
        { behavior: "B3", purchase: "P2", count: 28000, percentage: 0.224, avg_win_rate: 0.32 },
        { behavior: "B3", purchase: "P3", count: 11000, percentage: 0.088, avg_win_rate: 0.38 }
      ],
      most_common_cell: { behavior: "B3", purchase: "P2", count: 28000 },
      highest_win_rate_cell: { behavior: "B3", purchase: "P3", win_rate: 0.38 }
    },
    
    // Pity机制效果
    pity_mechanism: {
      total_pity_triggers: 8500,
      trigger_rate: 0.068,           // 触发率
      avg_consecutive_before_trigger: 8.2, // 平均连空次数触发
      tier_upgrade_distribution: {
        "tier_4_to_tier_3": 6800,    // 从T4升级到T3的次数
        "tier_3_to_tier_2": 1500,    // 从T3升级到T2的次数
        "tier_2_to_tier_1": 200      // 从T2升级到T1的次数
      }
    },
    
    // 反空奖机制效果
    anti_empty_mechanism: {
      total_anti_empty_triggers: 2500,
      trigger_rate: 0.02,
      avg_consecutive_empty_before_trigger: 9.5,
      saved_users: 2200  // 因此保底获得奖品的用户数
    },
    
    // 降级路径分布
    downgrade_paths: {
      total_downgrades: 1200,
      downgrade_rate: 0.0096,
      paths: [
        { from: "tier_1", to: "tier_2", count: 50, reason: "库存不足" },
        { from: "tier_2", to: "tier_3", count: 350, reason: "库存不足" },
        { from: "tier_1", to: "tier_2", count: 200, reason: "预算限制" },
        { from: "tier_2", to: "tier_3", count: 600, reason: "预算限制" }
      ]
    },
    
    // 干预规则命中
    intervention_rules: {
      total_interventions: 500,
      intervention_rate: 0.004,
      rules: [
        { rule_id: "VIP_GUARANTEE", name: "VIP保底", hit_count: 300 },
        { rule_id: "NEW_USER_BOOST", name: "新用户提升", hit_count: 150 },
        { rule_id: "LOSS_RECOVERY", name: "亏损补偿", hit_count: 50 }
      ]
    },
    
    // 策略建议
    recommendations: [
      "B1P1格子占比仅4%，建议增加新用户引导",
      "Pity机制触发率6.8%，处于正常范围",
      "库存降级占比0.96%，建议关注tier_2库存补充"
    ]
  },
  timestamp: "2026-01-29T12:00:00+08:00"
}
```

#### 数据库依赖

- **读取表**: `lottery_draws`, `lottery_user_experience_state`, `lottery_probability_logs`（如存在）

#### 分析维度说明

| 维度 | 指标 | 计算方式 |
|-----|-----|---------|
| BxPx矩阵命中分布 | 各格子(Bx,Px)被触发的频率 | GROUP BY behavior_tier, purchase_tier |
| Pity机制触发率 | pity_triggered_count / total_draws | 统计 pity_triggered 字段 |
| 反空奖机制触发率 | anti_empty_triggered_count / total_draws | 统计 anti_empty_triggered 字段 |
| 降级路径分布 | 各降级路径的发生次数 | 统计 downgrade_info 不为空的记录 |
| 干预规则命中率 | preset_hit_count / total_draws | 统计 intervention_rule_id 不为空的记录 |

---

## 五、数据库设计

### 5.1 新建表：lottery_alerts

```sql
CREATE TABLE `lottery_alerts` (
  `alert_id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '告警ID',
  `type` VARCHAR(50) NOT NULL COMMENT '告警类型：win_rate_abnormal/budget_warning/inventory_low等',
  `level` ENUM('info', 'warning', 'danger') NOT NULL DEFAULT 'warning' COMMENT '告警级别',
  `status` ENUM('active', 'acknowledged', 'resolved') NOT NULL DEFAULT 'active' COMMENT '状态',
  `title` VARCHAR(200) NOT NULL COMMENT '告警标题',
  `message` TEXT COMMENT '告警详细信息',
  `campaign_id` INT UNSIGNED DEFAULT NULL COMMENT '关联活动ID',
  `threshold_config` JSON COMMENT '阈值配置JSON',
  `actual_value` JSON COMMENT '实际值JSON',
  `suggested_action` TEXT COMMENT '建议操作',
  `triggered_at` DATETIME NOT NULL COMMENT '触发时间',
  `acknowledged_at` DATETIME DEFAULT NULL COMMENT '确认时间',
  `acknowledged_by` INT UNSIGNED DEFAULT NULL COMMENT '确认人',
  `resolved_at` DATETIME DEFAULT NULL COMMENT '解决时间',
  `resolved_by` INT UNSIGNED DEFAULT NULL COMMENT '解决人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`alert_id`),
  KEY `idx_type_status` (`type`, `status`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_triggered_at` (`triggered_at`),
  KEY `idx_level_status` (`level`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抽奖告警表';
```

### 5.2 现有表索引优化建议

```sql
-- lottery_draws 表：支持异常用户检测
CREATE INDEX idx_user_created ON lottery_draws(user_id, created_at);
CREATE INDEX idx_campaign_created ON lottery_draws(campaign_id, created_at);

-- lottery_user_experience_state 表：支持策略分析
CREATE INDEX idx_behavior_purchase ON lottery_user_experience_state(behavior_tier, purchase_tier);
```

---

## 六、开发计划

### 6.1 建议开发顺序

```
Week 1（5天）
├── B1: 实时告警列表（3天）
│   ├── Day 1: 数据库表设计 + 模型创建
│   ├── Day 2: 告警规则引擎实现
│   └── Day 3: API端点 + 测试
│
└── B2: 单次抽奖详情（2天）
    ├── Day 4: 服务方法实现
    └── Day 5: API端点 + 测试

Week 2（5天）
├── B3: 异常用户列表（3天）
│   ├── Day 1: 风险检测算法设计
│   ├── Day 2: 服务实现
│   └── Day 3: API端点 + 测试
│
└── B5: 策略效果分析（2天）
    ├── Day 4: 服务方法实现
    └── Day 5: API端点 + 测试

Week 3（4天）
└── B4: 活动复盘报告（4天）
    ├── Day 1-2: 聚合查询实现
    ├── Day 3: API端点实现
    └── Day 4: 性能优化 + 测试
```

### 6.2 里程碑

| 里程碑 | 完成内容 | 预计时间 |
|-------|---------|---------|
| M1 | B1 + B2 完成 | Week 1 结束 |
| M2 | B3 + B5 完成 | Week 2 结束 |
| M3 | B4 完成，全部API上线 | Week 3 结束 |

---

## 七、测试要求

### 7.1 单元测试

每个API需编写单元测试，覆盖：
- 正常请求
- 参数校验
- 权限验证
- 边界条件

### 7.2 测试文件位置

```
tests/
├── routes/v4/console/
│   └── lottery-monitoring-alerts.test.js
│   └── lottery-monitoring-draw-details.test.js
│   └── lottery-monitoring-abnormal-users.test.js
│   └── lottery-monitoring-campaign-report.test.js
│   └── lottery-monitoring-strategy.test.js
└── services/
    └── LotteryAlertService.test.js
    └── LotteryRiskService.test.js
    └── LotteryReportService.test.js
```

### 7.3 性能要求

| API | 响应时间要求 | 说明 |
|-----|------------|------|
| B1 realtime-alerts | <500ms | 高频查询 |
| B2 draw-details | <1s | 单条查询 |
| B3 abnormal-users | <3s | 聚合查询 |
| B4 campaign-report | <5s | 大量聚合 |
| B5 strategy-effectiveness | <3s | 聚合查询 |

---

## 附录

### A. 相关文档

- 《抽奖运营后台规划书-含行业对标.md》- 完整规划文档
- 《后端API开发需求文档》v1.3.1 - 已完成API文档

### B. 更新记录

| 版本 | 日期 | 更新内容 |
|-----|------|---------|
| v1.0.0 | 2026-01-29 | 初始版本，提取待规划后端API |

---

*文档维护: 技术团队*  
*最后更新: 2026-01-29*

