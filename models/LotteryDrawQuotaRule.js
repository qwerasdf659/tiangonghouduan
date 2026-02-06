/**
 * 抽奖次数配额规则模型（LotteryDrawQuotaRule）
 *
 * 业务场景：
 * - 管理员在Web管理后台配置抽奖次数上限规则
 * - 支持四维度覆盖：全局（global）、活动（campaign）、角色（role）、用户（user）
 * - 实现规则优先级链：user > role > campaign > global
 *
 * 核心功能：
 * - 规则优先级管理（同层级多条命中时取priority最大的）
 * - 规则生效期管理（effective_from/effective_to）
 * - 规则状态管理（active/inactive）
 * - 审计追溯（created_by/updated_by/reason）
 *
 * 优先级链（写死，不可配置）：
 * 1. user级规则（最高优先级）
 * 2. role级规则
 * 3. campaign级规则
 * 4. global级规则（最低优先级）
 *
 * 数据库表名：lottery_draw_quota_rules
 * 主键：lottery_draw_quota_rule_id（BIGINT，自增）
 *
 * 创建时间：2025-12-23
 */

const { DataTypes, Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 LotteryDrawQuotaRule 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} LotteryDrawQuotaRule 模型
 */
module.exports = sequelize => {
  const LotteryDrawQuotaRule = sequelize.define(
    'LotteryDrawQuotaRule',
    {
      // 规则主键ID
      lottery_draw_quota_rule_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '规则主键ID'
      },

      // 作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级
      scope_type: {
        type: DataTypes.ENUM('global', 'campaign', 'role', 'user'),
        allowNull: false,
        validate: {
          notNull: { msg: '作用域类型不能为空' },
          isIn: {
            args: [['global', 'campaign', 'role', 'user']],
            msg: '作用域类型必须是 global/campaign/role/user 之一'
          }
        },
        comment: '作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级'
      },

      // 作用域ID：global固定为"global"，campaign存lottery_campaign_id，role存role_uuid，user存user_id
      scope_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: '作用域ID不能为空' }
        },
        comment:
          '作用域ID：global固定为"global"，campaign存lottery_campaign_id，role存role_uuid，user存user_id'
      },

      // 统计窗口类型：daily-每日重置, campaign_total-活动期间累计
      window_type: {
        type: DataTypes.ENUM('daily', 'campaign_total'),
        allowNull: false,
        defaultValue: 'daily',
        comment: '统计窗口类型：daily-每日重置, campaign_total-活动期间累计'
      },

      // 配额上限值：>=0，0代表不限制（仅对global允许0）
      limit_value: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 50,
        validate: {
          min: { args: [0], msg: '配额上限值不能为负数' }
        },
        comment: '配额上限值：>=0，0代表不限制（仅对global允许0）'
      },

      // 时区：默认北京时间+08:00
      timezone: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: '+08:00',
        comment: '时区：默认北京时间+08:00'
      },

      // 生效开始时间：允许null表示立即生效
      effective_from: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间：null表示立即生效'
      },

      // 生效结束时间：允许null表示永久有效
      effective_to: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间：null表示永久有效'
      },

      // 优先级：同层级多条命中时决定优先级，数字越大优先级越高
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级：同层级多条命中时决定优先级，数字越大优先级越高'
      },

      // 规则状态：active-启用, inactive-停用
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '规则状态：active-启用, inactive-停用'
      },

      // 规则说明/备注：审计用
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '规则说明/备注：记录为什么这么配置，便于审计'
      },

      // 创建人ID
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID（管理员user_id）'
      },

      // 更新人ID
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID（管理员user_id）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      tableName: 'lottery_draw_quota_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '抽奖次数配额规则表：四维度（全局/活动/角色/用户）配额规则管理',
      indexes: [
        {
          name: 'idx_scope_status_effective',
          fields: ['scope_type', 'scope_id', 'status', 'effective_from', 'effective_to']
        },
        {
          name: 'idx_window_status',
          fields: ['window_type', 'status']
        }
      ]
    }
  )

  /*
   * ============================================================
   * 模型作用域（Scopes）：常用查询快捷方式
   * ============================================================
   */

  /**
   * 查询作用域：仅启用状态的规则
   */
  LotteryDrawQuotaRule.addScope('active', {
    where: { status: 'active' }
  })

  /**
   * 查询作用域：当前生效的规则（在生效期内）
   */
  LotteryDrawQuotaRule.addScope('effective', () => {
    const now = BeijingTimeHelper.now()
    return {
      where: {
        status: 'active',
        [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }],
        [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: now } }]
      }
    }
  })

  /**
   * 查询作用域：每日配额规则
   */
  LotteryDrawQuotaRule.addScope('daily', {
    where: { window_type: 'daily' }
  })

  /**
   * 查询作用域：全局规则
   */
  LotteryDrawQuotaRule.addScope('global', {
    where: { scope_type: 'global', scope_id: 'global' }
  })

  /*
   * ============================================================
   * 静态方法（Static Methods）：业务逻辑封装
   * ============================================================
   */

  /**
   * 获取用户在指定活动的生效每日配额上限
   *
   * 业务逻辑：
   * 1. 按优先级顺序查找命中规则：user > role > campaign > global
   * 2. 同层级多条命中时取priority最大的
   * 3. 返回最终生效的limit_value
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 抽奖活动ID
   * @param {Array<string>} [params.role_uuids] - 用户角色UUID列表（可选）
   * @returns {Promise<Object>} { limit_value, matched_rule, priority, debug }
   */
  LotteryDrawQuotaRule.getEffectiveDailyLimit = async function ({
    user_id,
    lottery_campaign_id,
    role_uuids = []
  }) {
    const now = BeijingTimeHelper.now()

    // 构建生效期条件
    const effectiveCondition = {
      status: 'active',
      window_type: 'daily',
      [Op.and]: [
        {
          [Op.or]: [{ effective_from: null }, { effective_from: { [Op.lte]: now } }]
        },
        {
          [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: now } }]
        }
      ]
    }

    // 定义优先级权重：user(1000) > role(100) > campaign(10) > global(1)
    const scopePriority = { user: 1000, role: 100, campaign: 10, global: 1 }

    // 查询所有可能命中的规则
    const rules = await this.findAll({
      where: {
        ...effectiveCondition,
        [Op.or]: [
          // 用户级规则
          { scope_type: 'user', scope_id: String(user_id) },
          // 角色级规则
          ...(role_uuids.length > 0
            ? [{ scope_type: 'role', scope_id: { [Op.in]: role_uuids } }]
            : []),
          // 活动级规则
          { scope_type: 'campaign', scope_id: String(lottery_campaign_id) },
          // 全局规则
          { scope_type: 'global', scope_id: 'global' }
        ]
      },
      order: [['priority', 'DESC']],
      raw: true
    })

    if (rules.length === 0) {
      /**
       * 无任何规则，从数据库读取兜底默认值（2025-12-30 配置管理三层分离方案）
       *
       * 读取优先级：
       * 1. DB system_settings.daily_lottery_limit（全局配置）
       * 2. 代码默认值 50（兜底降级）
       *
       * 🔧 循环依赖修复（2026-01-31）：
       * 使用延迟加载模式，避免 models/index.js -> LotteryDrawQuotaRule -> AdminSystemService -> models 循环依赖
       *
       * @see docs/配置管理三层分离与校验统一方案.md
       */
      const AdminSystemService = require('../services/AdminSystemService')
      let fallbackLimit = 50 // 代码兜底默认值
      try {
        fallbackLimit = await AdminSystemService.getSettingValue(
          'points',
          'daily_lottery_limit',
          50
        )
      } catch (error) {
        // 服务初始化阶段可能无法获取，使用代码默认值
        console.warn('⚠️ 获取系统配置失败，使用代码默认值:', error.message)
      }

      return {
        limit_value: fallbackLimit,
        matched_rule: null,
        priority: 0,
        debug: { no_rules_found: true, fallback_limit: fallbackLimit, source: 'db_system_settings' }
      }
    }

    // 按优先级权重排序：先按scope类型权重，再按priority字段
    rules.sort((a, b) => {
      const aPriority = scopePriority[a.scope_type] * 10000 + a.priority
      const bPriority = scopePriority[b.scope_type] * 10000 + b.priority
      return bPriority - aPriority
    })

    const matchedRule = rules[0]

    return {
      limit_value: matchedRule.limit_value,
      matched_rule: {
        lottery_draw_quota_rule_id: matchedRule.lottery_draw_quota_rule_id,
        scope_type: matchedRule.scope_type,
        scope_id: matchedRule.scope_id,
        reason: matchedRule.reason
      },
      priority: scopePriority[matchedRule.scope_type] * 10000 + matchedRule.priority,
      debug: {
        total_rules_found: rules.length,
        all_rules: rules.map(r => ({
          lottery_draw_quota_rule_id: r.lottery_draw_quota_rule_id,
          scope_type: r.scope_type,
          scope_id: r.scope_id,
          limit_value: r.limit_value,
          priority: r.priority
        }))
      }
    }
  }

  /**
   * 创建或更新规则
   *
   * @param {Object} ruleData - 规则数据
   * @param {Object} options - 选项 { transaction, admin_id }
   * @returns {Promise<Object>} 创建或更新后的规则
   */
  LotteryDrawQuotaRule.upsertRule = async function (ruleData, options = {}) {
    const { transaction, admin_id } = options

    // 查找是否已存在相同scope的规则
    const existingRule = await this.findOne({
      where: {
        scope_type: ruleData.scope_type,
        scope_id: ruleData.scope_id,
        window_type: ruleData.window_type || 'daily'
      },
      transaction
    })

    if (existingRule) {
      // 更新现有规则
      await existingRule.update(
        {
          ...ruleData,
          updated_by: admin_id
        },
        { transaction }
      )
      return existingRule
    } else {
      // 创建新规则
      return this.create(
        {
          ...ruleData,
          created_by: admin_id,
          updated_by: admin_id
        },
        { transaction }
      )
    }
  }

  return LotteryDrawQuotaRule
}
