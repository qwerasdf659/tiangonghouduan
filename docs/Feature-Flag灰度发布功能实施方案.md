# Feature Flag 灰度发布功能实施方案

> **文档版本**：v1.0  
> **创建时间**：2026-01-20  
> **优先级**：P3（非必须优化项）  
> **预估工时**：后端 2-3 天，前端 1-2 天

---

## 一、需求背景

### 1.1 什么是 Feature Flag

Feature Flag（功能开关/特性标志）是一种软件开发技术，允许在**不修改代码、不重新部署**的情况下，动态控制某个功能的开启或关闭。

### 1.2 什么是灰度发布

灰度发布（Canary Release / Gray Release）是指新功能**逐步向部分用户开放**的策略，而不是一次性全量发布。

### 1.3 为什么需要

| 场景 | 传统方式 | Feature Flag 方式 |
|------|---------|------------------|
| 新功能上线 | 全量发布，风险高 | 逐步开放（5% → 20% → 50% → 100%） |
| 发现 Bug | 修改代码 → 测试 → 重新部署（耗时数小时） | 管理后台点击"关闭" → 立即生效 |
| A/B 测试 | 需要两套代码分支 | 同一代码，按用户分流 |
| 定时上线 | 需要运维配合发布 | 设置生效时间，自动开启 |

### 1.4 本项目应用场景

```
┌─────────────────────────────────────────────────────────────┐
│  抽奖策略引擎功能开关示例                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🎯 Pity 软保底机制                                           │
│     ├── 第1周: 仅对 5% 用户开放（验证效果）                     │
│     ├── 第2周: 扩大到 20% 用户                                │
│     ├── 第3周: 扩大到 50% 用户                                │
│     └── 第4周: 全量 100% 开放                                 │
│                                                              │
│  🎲 运气债务机制                                              │
│     ├── 仅对 VIP 用户开放（用户分群）                          │
│     └── 或按用户 ID 尾号分流                                  │
│                                                              │
│  🔄 BxPx 矩阵调权                                             │
│     └── 可随时关闭，回退到旧逻辑                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、数据库设计

### 2.1 功能开关表 `feature_flags`

```sql
CREATE TABLE feature_flags (
  -- 主键
  flag_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '功能开关ID',
  
  -- 基础信息
  flag_key VARCHAR(100) NOT NULL COMMENT '功能键名（唯一标识）',
  flag_name VARCHAR(200) NOT NULL COMMENT '功能名称（显示用）',
  description TEXT COMMENT '功能描述',
  
  -- 开关状态
  is_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用（总开关）',
  
  -- 灰度策略
  rollout_strategy ENUM('all', 'percentage', 'user_list', 'user_segment', 'schedule') 
    NOT NULL DEFAULT 'all' COMMENT '发布策略',
  rollout_percentage DECIMAL(5,2) DEFAULT 100.00 COMMENT '开放百分比（0.00-100.00）',
  
  -- 用户名单（JSON数组）
  whitelist_user_ids JSON COMMENT '白名单用户ID列表（优先开放）',
  blacklist_user_ids JSON COMMENT '黑名单用户ID列表（强制关闭）',
  
  -- 用户分群
  target_segments JSON COMMENT '目标用户分群（如 ["vip", "new_user"]）',
  
  -- 定时发布
  effective_start DATETIME COMMENT '生效开始时间',
  effective_end DATETIME COMMENT '生效结束时间',
  
  -- 关联配置
  related_config_group VARCHAR(50) COMMENT '关联的 lottery_strategy_config.config_group',
  fallback_behavior ENUM('disabled', 'default_value', 'old_logic') 
    DEFAULT 'disabled' COMMENT '降级行为',
  
  -- 审计字段
  created_by INT COMMENT '创建人ID',
  updated_by INT COMMENT '更新人ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 索引
  UNIQUE KEY uk_flag_key (flag_key),
  INDEX idx_enabled (is_enabled),
  INDEX idx_effective (effective_start, effective_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='功能开关表（Feature Flag）';
```

### 2.2 开关变更日志表 `feature_flag_change_logs`

```sql
CREATE TABLE feature_flag_change_logs (
  -- 主键
  log_id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '日志ID',
  
  -- 关联
  flag_id INT NOT NULL COMMENT '功能开关ID',
  flag_key VARCHAR(100) NOT NULL COMMENT '功能键名',
  
  -- 变更内容
  change_type ENUM('create', 'enable', 'disable', 'update_percentage', 'update_config', 'delete') 
    NOT NULL COMMENT '变更类型',
  old_value JSON COMMENT '变更前的值',
  new_value JSON COMMENT '变更后的值',
  change_reason VARCHAR(500) COMMENT '变更原因',
  
  -- 操作人
  operator_id INT NOT NULL COMMENT '操作人ID',
  operator_name VARCHAR(100) COMMENT '操作人姓名',
  operator_ip VARCHAR(45) COMMENT '操作人IP',
  
  -- 时间
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_flag_id (flag_id),
  INDEX idx_flag_key (flag_key),
  INDEX idx_created_at (created_at),
  INDEX idx_operator (operator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='功能开关变更日志表';
```

### 2.3 初始数据

```sql
-- 插入抽奖策略引擎相关的功能开关
INSERT INTO feature_flags (flag_key, flag_name, description, is_enabled, rollout_strategy, rollout_percentage, related_config_group) VALUES
('lottery_pity_system', 'Pity 软保底机制', '连续空奖时逐步提升非空奖概率（类似游戏保底）', 1, 'all', 100.00, 'pity'),
('lottery_luck_debt', '运气债务机制', '基于用户历史空奖率的长期平衡调整', 1, 'all', 100.00, 'luck_debt'),
('lottery_anti_empty_streak', '防连续空奖机制', '连续K次空奖后强制发放非空奖', 1, 'all', 100.00, 'anti_empty'),
('lottery_anti_high_streak', '防连续高价值机制', '防止短时间内连续获得高价值奖品', 1, 'all', 100.00, 'anti_high'),
('lottery_bxpx_matrix', 'BxPx 矩阵调权', '根据预算分层和活动压力动态调整权重', 1, 'all', 100.00, NULL),
('lottery_budget_tier', '预算分层控制', 'B0-B3 四层预算分层机制', 1, 'all', 100.00, 'budget_tier'),
('lottery_pressure_tier', '活动压力分层', 'P0-P2 三层活动压力控制', 1, 'all', 100.00, 'pressure_tier');
```

---

## 三、后端 API 设计

### 3.1 API 端点清单

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v4/admin/feature-flags` | 获取功能开关列表 | 管理员 |
| GET | `/api/v4/admin/feature-flags/:flag_key` | 获取单个开关详情 | 管理员 |
| PUT | `/api/v4/admin/feature-flags/:flag_key` | 更新功能开关 | 管理员 |
| PUT | `/api/v4/admin/feature-flags/:flag_key/toggle` | 快速切换开关状态 | 管理员 |
| PUT | `/api/v4/admin/feature-flags/:flag_key/percentage` | 调整灰度百分比 | 管理员 |
| GET | `/api/v4/admin/feature-flags/:flag_key/logs` | 获取变更日志 | 管理员 |
| GET | `/api/v4/feature-flags/check/:flag_key` | 检查功能是否对当前用户开放 | 登录用户 |

### 3.2 API 请求/响应格式

#### 3.2.1 获取功能开关列表

**请求**：`GET /api/v4/admin/feature-flags`

**响应**：
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取成功",
  "data": {
    "items": [
      {
        "flag_id": 1,
        "flag_key": "lottery_pity_system",
        "flag_name": "Pity 软保底机制",
        "description": "连续空奖时逐步提升非空奖概率",
        "is_enabled": true,
        "rollout_strategy": "percentage",
        "rollout_percentage": 50.00,
        "effective_start": null,
        "effective_end": null,
        "related_config_group": "pity",
        "updated_at": "2026-01-20T10:30:00+08:00"
      }
    ],
    "total": 7
  },
  "timestamp": "2026-01-20T10:30:00+08:00"
}
```

#### 3.2.2 更新功能开关

**请求**：`PUT /api/v4/admin/feature-flags/:flag_key`

```json
{
  "is_enabled": true,
  "rollout_strategy": "percentage",
  "rollout_percentage": 20.00,
  "whitelist_user_ids": [31, 100, 200],
  "change_reason": "第一阶段灰度测试，仅开放 20% 用户"
}
```

**响应**：
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "功能开关更新成功",
  "data": {
    "flag_key": "lottery_pity_system",
    "is_enabled": true,
    "rollout_percentage": 20.00,
    "affected_users_estimate": "约 20% 用户"
  }
}
```

#### 3.2.3 检查功能是否开放（内部调用）

**请求**：`GET /api/v4/feature-flags/check/lottery_pity_system`

**响应**：
```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "flag_key": "lottery_pity_system",
    "is_enabled_for_user": true,
    "reason": "user_in_percentage_range"
  }
}
```

---

## 四、后端服务实现

### 4.1 FeatureFlagService 服务类

```javascript
// services/FeatureFlagService.js

'use strict'

/**
 * FeatureFlagService - 功能开关服务
 * 
 * 职责：
 * 1. 管理功能开关的 CRUD 操作
 * 2. 判断功能是否对指定用户开放
 * 3. 记录开关变更日志
 * 4. 提供缓存机制提升性能
 * 
 * @module services/FeatureFlagService
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-20
 */

const { FeatureFlag, FeatureFlagChangeLog, User } = require('../models')
const { logger } = require('../utils/logger')

class FeatureFlagService {
  /**
   * 缓存配置
   * 使用内存缓存 + Redis 双层缓存
   */
  static _memoryCache = new Map()
  static _cacheExpiry = 60 * 1000 // 1 分钟内存缓存

  /**
   * 检查功能是否对指定用户开放
   * 
   * 这是最核心的方法，策略引擎会频繁调用
   * 
   * @param {string} flag_key - 功能键名
   * @param {number} user_id - 用户ID
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} { enabled: boolean, reason: string }
   */
  static async isEnabledForUser(flag_key, user_id, options = {}) {
    try {
      // 1. 尝试从缓存获取
      const cached = this._getFromCache(flag_key)
      const flag = cached || await this._fetchFlag(flag_key)
      
      if (!flag) {
        return { enabled: false, reason: 'flag_not_found' }
      }

      // 2. 总开关检查
      if (!flag.is_enabled) {
        return { enabled: false, reason: 'flag_disabled' }
      }

      // 3. 时间窗口检查
      const now = new Date()
      if (flag.effective_start && now < new Date(flag.effective_start)) {
        return { enabled: false, reason: 'not_started' }
      }
      if (flag.effective_end && now > new Date(flag.effective_end)) {
        return { enabled: false, reason: 'expired' }
      }

      // 4. 黑名单检查（优先级最高）
      if (flag.blacklist_user_ids?.includes(user_id)) {
        return { enabled: false, reason: 'user_in_blacklist' }
      }

      // 5. 白名单检查（优先级次之）
      if (flag.whitelist_user_ids?.includes(user_id)) {
        return { enabled: true, reason: 'user_in_whitelist' }
      }

      // 6. 根据发布策略判断
      switch (flag.rollout_strategy) {
        case 'all':
          return { enabled: true, reason: 'strategy_all' }
        
        case 'percentage':
          // 使用用户 ID 做哈希，确保同一用户每次结果一致
          const hash = this._hashUserId(user_id, flag_key)
          const inRange = hash < flag.rollout_percentage
          return { 
            enabled: inRange, 
            reason: inRange ? 'user_in_percentage_range' : 'user_out_of_percentage_range'
          }
        
        case 'user_list':
          // 仅限白名单用户（已在上面处理）
          return { enabled: false, reason: 'user_not_in_list' }
        
        case 'user_segment':
          // 需要查询用户分群
          const userSegment = await this._getUserSegment(user_id)
          const inSegment = flag.target_segments?.includes(userSegment)
          return {
            enabled: inSegment,
            reason: inSegment ? 'user_in_target_segment' : 'user_not_in_target_segment'
          }
        
        case 'schedule':
          // 仅按时间控制（已在上面处理）
          return { enabled: true, reason: 'within_schedule' }
        
        default:
          return { enabled: false, reason: 'unknown_strategy' }
      }
    } catch (error) {
      logger.error('[FeatureFlagService] isEnabledForUser 失败', {
        flag_key,
        user_id,
        error: error.message
      })
      // 降级策略：出错时返回 false（保守策略）
      return { enabled: false, reason: 'error_fallback' }
    }
  }

  /**
   * 使用用户 ID 计算哈希值（0-100）
   * 确保同一用户对同一功能的结果一致
   * 
   * @param {number} user_id - 用户ID
   * @param {string} flag_key - 功能键名
   * @returns {number} 0-100 的哈希值
   */
  static _hashUserId(user_id, flag_key) {
    const seed = `${flag_key}_${user_id}`
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为 32 位整数
    }
    return Math.abs(hash) % 100
  }

  /**
   * 获取功能开关详情
   */
  static async getFlag(flag_key) {
    return await FeatureFlag.findOne({
      where: { flag_key }
    })
  }

  /**
   * 获取所有功能开关列表
   */
  static async getAllFlags() {
    return await FeatureFlag.findAll({
      order: [['flag_key', 'ASC']]
    })
  }

  /**
   * 更新功能开关
   */
  static async updateFlag(flag_key, updates, operator) {
    const flag = await this.getFlag(flag_key)
    if (!flag) {
      throw new Error(`功能开关不存在: ${flag_key}`)
    }

    const old_value = flag.toJSON()

    // 更新
    await flag.update(updates)

    // 记录变更日志
    await FeatureFlagChangeLog.create({
      flag_id: flag.flag_id,
      flag_key: flag_key,
      change_type: updates.is_enabled !== undefined 
        ? (updates.is_enabled ? 'enable' : 'disable')
        : 'update_config',
      old_value: old_value,
      new_value: flag.toJSON(),
      change_reason: updates.change_reason || null,
      operator_id: operator.user_id,
      operator_name: operator.username || operator.mobile,
      operator_ip: operator.ip
    })

    // 清除缓存
    this._clearCache(flag_key)

    logger.info('[FeatureFlagService] 功能开关已更新', {
      flag_key,
      operator_id: operator.user_id,
      changes: updates
    })

    return flag
  }

  /**
   * 快速切换开关状态
   */
  static async toggleFlag(flag_key, operator) {
    const flag = await this.getFlag(flag_key)
    if (!flag) {
      throw new Error(`功能开关不存在: ${flag_key}`)
    }

    return await this.updateFlag(flag_key, {
      is_enabled: !flag.is_enabled,
      change_reason: flag.is_enabled ? '手动关闭' : '手动开启'
    }, operator)
  }

  /**
   * 调整灰度百分比
   */
  static async updatePercentage(flag_key, percentage, operator) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('百分比必须在 0-100 之间')
    }

    return await this.updateFlag(flag_key, {
      rollout_strategy: 'percentage',
      rollout_percentage: percentage,
      change_reason: `调整灰度百分比至 ${percentage}%`
    }, operator)
  }

  /**
   * 获取变更日志
   */
  static async getChangeLogs(flag_key, options = {}) {
    const { page = 1, page_size = 20 } = options
    
    const { count, rows } = await FeatureFlagChangeLog.findAndCountAll({
      where: { flag_key },
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      items: rows,
      total: count,
      page,
      page_size
    }
  }

  // ========== 缓存相关私有方法 ==========

  static _getFromCache(flag_key) {
    const cached = this._memoryCache.get(flag_key)
    if (cached && Date.now() < cached.expiry) {
      return cached.data
    }
    return null
  }

  static async _fetchFlag(flag_key) {
    const flag = await FeatureFlag.findOne({
      where: { flag_key },
      raw: true
    })
    
    if (flag) {
      // 解析 JSON 字段
      flag.whitelist_user_ids = flag.whitelist_user_ids 
        ? (typeof flag.whitelist_user_ids === 'string' 
          ? JSON.parse(flag.whitelist_user_ids) 
          : flag.whitelist_user_ids)
        : []
      flag.blacklist_user_ids = flag.blacklist_user_ids
        ? (typeof flag.blacklist_user_ids === 'string'
          ? JSON.parse(flag.blacklist_user_ids)
          : flag.blacklist_user_ids)
        : []
      flag.target_segments = flag.target_segments
        ? (typeof flag.target_segments === 'string'
          ? JSON.parse(flag.target_segments)
          : flag.target_segments)
        : []

      // 存入缓存
      this._memoryCache.set(flag_key, {
        data: flag,
        expiry: Date.now() + this._cacheExpiry
      })
    }
    
    return flag
  }

  static _clearCache(flag_key) {
    this._memoryCache.delete(flag_key)
  }

  static async _getUserSegment(user_id) {
    // 简化实现：根据用户属性判断分群
    const user = await User.findByPk(user_id, {
      attributes: ['user_id', 'is_vip', 'created_at']
    })
    
    if (!user) return 'unknown'
    if (user.is_vip) return 'vip'
    
    // 注册 30 天内为新用户
    const daysSinceRegister = (Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
    if (daysSinceRegister < 30) return 'new_user'
    
    return 'normal'
  }
}

module.exports = FeatureFlagService
```

### 4.2 策略引擎集成示例

```javascript
// services/UnifiedLotteryEngine/strategy/StrategyEngine.js 中的集成

const FeatureFlagService = require('../../FeatureFlagService')

class StrategyEngine {
  /**
   * 应用体验平滑机制（集成 Feature Flag）
   */
  async applyExperienceSmoothing(context) {
    const { user_id } = context
    const results = {}

    // 检查 Pity 系统开关
    const pityFlag = await FeatureFlagService.isEnabledForUser(
      'lottery_pity_system', 
      user_id
    )
    
    if (pityFlag.enabled) {
      results.pity = await this.pityCalc.calculate(context)
    } else {
      results.pity = { enabled: false, reason: pityFlag.reason }
    }

    // 检查运气债务开关
    const luckDebtFlag = await FeatureFlagService.isEnabledForUser(
      'lottery_luck_debt',
      user_id
    )
    
    if (luckDebtFlag.enabled) {
      results.luck_debt = await this.luckDebtCalc.calculate(context)
    } else {
      results.luck_debt = { enabled: false, reason: luckDebtFlag.reason }
    }

    return results
  }
}
```

---

## 五、前端需求说明（给前端开发人员）

### 5.1 功能开关管理页面

**页面路径**：`/admin/feature-flags`

**页面功能**：
1. 显示所有功能开关列表（表格形式）
2. 快速切换开关状态（开/关按钮）
3. 编辑开关详情（弹窗或抽屉）
4. 查看变更日志

**UI 参考**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 功能开关管理                                              [+ 新增开关]  │
├─────────────────────────────────────────────────────────────────────────┤
│ 搜索: [____________]  状态: [全部 ▼]  策略: [全部 ▼]      [搜索]       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌────────────┬────────────────┬─────────┬──────────┬──────────┬───────┐│
│ │ 功能键名    │ 功能名称        │ 状态    │ 发布策略  │ 开放比例  │ 操作  ││
│ ├────────────┼────────────────┼─────────┼──────────┼──────────┼───────┤│
│ │ lottery_   │ Pity 软保底    │ ● 开启  │ percentage│ 50%     │ [编辑]││
│ │ pity_system│ 机制           │         │          │          │ [日志]││
│ ├────────────┼────────────────┼─────────┼──────────┼──────────┼───────┤│
│ │ lottery_   │ 运气债务机制    │ ○ 关闭  │ all      │ 100%    │ [编辑]││
│ │ luck_debt  │                │         │          │          │ [日志]││
│ └────────────┴────────────────┴─────────┴──────────┴──────────┴───────┘│
│                                                                          │
│ 共 7 条记录                                        [上一页] 1 [下一页]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 编辑开关弹窗

```
┌─────────────────────────────────────────────────────────────┐
│ 编辑功能开关: Pity 软保底机制                        [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 功能键名: lottery_pity_system （不可修改）                   │
│                                                              │
│ 功能名称: [Pity 软保底机制_______________]                   │
│                                                              │
│ 功能描述:                                                    │
│ [连续空奖时逐步提升非空奖概率（类似游戏保底）    ]           │
│                                                              │
│ 启用状态: [●] 开启  [ ] 关闭                                │
│                                                              │
│ 发布策略: [百分比灰度 ▼]                                    │
│   - 全量发布 (all)                                           │
│   - 百分比灰度 (percentage)                                  │
│   - 指定用户 (user_list)                                     │
│   - 用户分群 (user_segment)                                  │
│   - 定时发布 (schedule)                                      │
│                                                              │
│ 开放比例: [==========○==========] 50%                       │
│          0%                    100%                          │
│                                                              │
│ 白名单用户ID（逗号分隔）:                                    │
│ [31, 100, 200_______________________________]               │
│                                                              │
│ 黑名单用户ID（逗号分隔）:                                    │
│ [________________________________________]                   │
│                                                              │
│ 变更原因: [第一阶段灰度测试，仅开放 50% 用户_]               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                    [取消]  [保存]            │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 调用的后端 API

| 功能 | API | 方法 |
|------|-----|------|
| 获取列表 | `/api/v4/admin/feature-flags` | GET |
| 获取详情 | `/api/v4/admin/feature-flags/:flag_key` | GET |
| 更新开关 | `/api/v4/admin/feature-flags/:flag_key` | PUT |
| 快速切换 | `/api/v4/admin/feature-flags/:flag_key/toggle` | PUT |
| 调整百分比 | `/api/v4/admin/feature-flags/:flag_key/percentage` | PUT |
| 获取日志 | `/api/v4/admin/feature-flags/:flag_key/logs` | GET |

### 5.4 前端交互要求

1. **状态切换**：点击开关按钮后需要二次确认
2. **百分比调整**：使用滑动条，实时显示百分比数值
3. **变更原因**：切换状态或修改配置时必填
4. **操作反馈**：成功/失败都要有 Toast 提示
5. **列表刷新**：操作成功后自动刷新列表

---

## 六、实施计划

### 6.1 后端开发（2-3 天）

| 序号 | 任务 | 预估工时 | 优先级 |
|------|------|---------|--------|
| 1 | 数据库迁移（创建表 + 初始数据） | 0.5d | P0 |
| 2 | FeatureFlag 模型定义 | 0.5d | P0 |
| 3 | FeatureFlagService 服务实现 | 1d | P0 |
| 4 | Admin API 路由实现 | 0.5d | P0 |
| 5 | 策略引擎集成 | 0.5d | P1 |
| 6 | 单元测试 | 0.5d | P1 |

### 6.2 前端开发（1-2 天）

| 序号 | 任务 | 预估工时 | 优先级 |
|------|------|---------|--------|
| 1 | 功能开关列表页 | 0.5d | P0 |
| 2 | 编辑开关弹窗 | 0.5d | P0 |
| 3 | 变更日志查看 | 0.5d | P1 |
| 4 | 百分比滑动条组件 | 0.5d | P1 |

---

## 七、风险与注意事项

### 7.1 性能考虑

- **缓存**：Feature Flag 会被频繁调用，必须使用缓存（内存 + Redis）
- **缓存失效**：开关变更后需要立即清除缓存
- **降级策略**：缓存/数据库异常时默认返回 `false`（保守策略）

### 7.2 一致性考虑

- **哈希算法**：同一用户对同一功能的结果必须一致（使用 user_id + flag_key 做哈希）
- **分布式环境**：多实例部署时需要使用 Redis 缓存同步

### 7.3 安全考虑

- **权限控制**：仅管理员可操作功能开关
- **操作审计**：所有变更都需要记录日志
- **变更原因**：必填字段，便于追溯

---

## 附录：相关文件清单

### 后端文件

| 文件路径 | 说明 |
|----------|------|
| `migrations/YYYYMMDD-create-feature-flags-table.js` | 数据库迁移 |
| `models/FeatureFlag.js` | 功能开关模型 |
| `models/FeatureFlagChangeLog.js` | 变更日志模型 |
| `services/FeatureFlagService.js` | 功能开关服务 |
| `routes/admin/feature_flags.js` | 管理员 API 路由 |
| `tests/unit/services/FeatureFlagService.test.js` | 单元测试 |

### 前端文件（参考）

| 文件路径 | 说明 |
|----------|------|
| `public/admin/pages/feature-flags/index.html` | 列表页 |
| `public/admin/js/feature-flags.js` | 页面逻辑 |
| `public/admin/css/feature-flags.css` | 页面样式 |

---

**文档结束**

> **最后更新**：2026-01-20  
> **文档状态**：待实施（P3 优先级）

