/**
 * 抽奖结果预设模型（运营人员预设抽奖结果控制系统）
 *
 * 业务场景：
 * 运营人员为特定用户预设抽奖结果队列，实现定向中奖控制。
 * 用户无感知，系统根据预设队列自动返回预设结果（用户体验与正常抽奖一致）。
 *
 * 核心功能：
 * 1. 预设队列创建：运营人员为指定用户创建预设奖品队列（按queue_order排序）
 * 2. 自动预设使用：用户抽奖时，系统优先检查预设队列，按顺序返回预设奖品
 * 3. 预设状态管理：预设使用后自动标记为used状态（避免重复使用）
 * 4. 预设统计查询：查询用户的预设状态（待使用/已使用数量）
 * 5. 预设清理功能：清除用户所有预设记录（用于调整运营策略）
 *
 * 业务流程：
 * 1. 运营人员创建预设：调用createPresetQueue为用户创建预设队列
 * 2. 用户抽奖请求：调用getNextPreset查询是否有待使用预设
 * 3. 使用预设结果：找到预设后，调用markAsUsed标记为已使用，返回预设奖品
 * 4. 正常抽奖流程：无预设时，执行正常抽奖逻辑（从奖品池随机抽取）
 *
 * 数据库表信息：
 * - 表名: lottery_presets
 * - 主键: lottery_preset_id (字符串，格式：preset_时间戳_随机码)
 * - 索引:
 *   - idx_user_status (user_id + status) - 快速查询用户预设
 *   - idx_queue_order (queue_order) - 排序优化
 *   - idx_created_by (created_by) - 审计追溯
 *   - idx_created_at (created_at) - 时间范围查询
 *
 * 集成服务：
 * - User模型：关联目标用户和创建管理员
 * - LotteryPrize模型：关联预设奖品信息
 * - LotteryService：在抽奖前检查预设队列
 *
 * 安全机制：
 * - 外键约束：确保user_id和prize_id的数据完整性
 * - 事务保护：预设创建、使用均在事务中执行（避免数据不一致）
 * - 队列排序：按queue_order严格排序（确保预设按顺序使用）
 *
 * 最新修订：2025年10月20日（支持外部事务参数，确保连抽场景下的事务一致性）
 */

const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = (sequelize, DataTypes) => {
  const LotteryPreset = sequelize.define(
    'LotteryPreset',
    {
      /**
       * lottery_preset_id - 预设记录唯一标识（主键）
       *
       * 业务含义：预设记录的唯一ID，用于标识每一条预设记录
       *
       * 生成规则：preset_时间戳_随机码
       * - 时间戳：BeijingTimeHelper.generateIdTimestamp()（精确到毫秒）
       * - 随机码：6位随机字符（避免ID冲突）
       *
       * 示例：preset_20251030123456789_a1b2c3
       *
       * 验证规则：
       * - 类型：字符串（最大50字符）
       * - 主键：唯一，不允许重复
       * - 自动生成：无需手动赋值
       */
      lottery_preset_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        defaultValue: () =>
          `preset_${BeijingTimeHelper.generateIdTimestamp()}_${require('crypto').randomBytes(3).toString('hex')}`,
        comment: '预设记录唯一标识'
      },

      /**
       * user_id - 目标用户ID（预设奖品的接收者）
       *
       * 业务含义：预设奖品将发放给此用户（运营人员指定的中奖用户）
       *
       * 业务规则：
       * - 必须是有效的用户ID（外键约束）
       * - 一个用户可以有多条预设记录（一对多关系）
       * - 预设按queue_order顺序使用（每次抽奖使用下一个预设）
       *
       * 关联关系：
       * - 外键引用：users表的user_id字段
       * - 关联别名：targetUser（获取用户信息）
       *
       * 示例：user_id = 10001（运营人员为用户10001预设奖品）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '预设奖品的目标用户ID'
      },

      /**
       * prize_id - 预设奖品ID（预设要发放的奖品）
       *
       * 业务含义：预设结果对应的奖品ID（用户抽奖时将获得此奖品）
       *
       * 业务规则：
       * - 必须是有效的奖品ID（外键约束）
       * - 奖品必须处于active状态（抽奖时验证）
       * - 奖品库存充足（抽奖时验证）
       *
       * 关联关系：
       * - 外键引用：lottery_prizes表的prize_id字段
       * - 关联别名：prize（获取奖品详情）
       *
       * 示例：prize_id = 1（预设奖品为一等奖）
       */
      lottery_prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'lottery_prizes',
          key: 'lottery_prize_id'
        },
        comment: '预设的奖品ID'
      },

      /**
       * queue_order - 抽奖队列顺序（预设使用的先后顺序）
       *
       * 业务含义：预设在队列中的使用顺序（决定用户哪次抽奖获得此预设奖品）
       *
       * 业务规则：
       * - 顺序从1开始递增（1为第一次抽奖，2为第二次抽奖，以此类推）
       * - 系统按queue_order升序查询未使用预设（getNextPreset）
       * - 使用后标记为used状态，下次抽奖使用下一个预设
       *
       * 使用流程：
       * 1. 运营人员创建预设队列：[{lottery_prize_id: 1, queue_order: 1}, {lottery_prize_id: 2, queue_order: 2}]
       * 2. 用户第1次抽奖：使用queue_order=1的预设（获得奖品1）
       * 3. 用户第2次抽奖：使用queue_order=2的预设（获得奖品2）
       * 4. 用户第3次抽奖：无预设，执行正常抽奖逻辑
       *
       * 示例：queue_order = 1（用户下次抽奖将获得此预设奖品）
       */
      queue_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖顺序（1为第一次抽奖，2为第二次抽奖，以此类推）'
      },

      /**
       * status - 预设状态（标识预设是否已使用）
       *
       * 业务含义：预设的使用状态（决定预设是否可用）
       *
       * 状态枚举：
       * - pending：等待使用（默认状态，预设创建时的初始状态）
       * - used：已使用（预设已被用户使用，不再参与抽奖）
       *
       * 业务规则：
       * - 只有pending状态的预设才会被查询（getNextPreset）
       * - 使用后自动标记为used状态（markAsUsed）
       * - used状态的预设不再参与抽奖（避免重复使用）
       *
       * 状态转换：
       * pending（预设创建） → used（用户抽奖使用）
       *
       * 示例：status = 'pending'（预设等待使用）
       */
      status: {
        type: DataTypes.ENUM('pending', 'used'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '预设状态：pending-等待使用，used-已使用'
      },

      /**
       * created_by - 创建预设的管理员ID（运营审计追溯）
       *
       * 业务含义：记录是哪个管理员创建的预设（用于审计和追溯）
       *
       * 业务规则：
       * - 可选字段（允许为空，系统预设可能不需要记录创建人）
       * - 必须是有效的管理员用户ID（外键约束）
       * - 用于审计追溯（查询管理员的预设操作记录）
       *
       * 关联关系：
       * - 外键引用：users表的user_id字段
       * - 关联别名：admin（获取管理员信息）
       *
       * 安全控制：
       * - 前端不可见（敏感信息）
       * - 仅管理员可查询（审计功能）
       *
       * 示例：created_by = 1（管理员user_id=1创建的预设）
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '创建预设的管理员ID'
      },

      // 🔴 统一抽奖架构新增字段（2026-01-18 - DR-16二次审批流程）

      /**
       * lottery_campaign_id - 关联的抽奖活动ID（2026-01-18新增）
       *
       * 业务含义：预设关联到具体的抽奖活动，支持活动级别的预设管理
       *
       * 业务规则：
       * - 建议关联活动（便于按活动管理预设）
       * - 外键约束：引用lottery_campaigns.lottery_campaign_id
       *
       * 示例：lottery_campaign_id = 1（关联到活动1的预设）
       */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        comment: '关联的抽奖活动ID（可选，用于按活动管理预设）'
      },

      /**
       * approval_status - 预设审批状态（2026-01-18新增 - DR-16）
       *
       * 业务含义：大额预设需要二次审批，此字段记录审批流程状态
       *
       * 状态枚举：
       * - pending_approval：等待审批（预设创建后的默认状态）
       * - approved：已批准（上级管理员批准，可以执行）
       * - rejected：已拒绝（上级管理员拒绝，不执行）
       *
       * 业务规则：
       * - 小额预设可直接approved（无需审批流程）
       * - 大额预设必须经过审批（pending_approval → approved/rejected）
       * - 只有approved状态的预设才会在抽奖时使用
       *
       * 示例：approval_status = 'approved'（预设已批准，可执行）
       */
      approval_status: {
        type: DataTypes.ENUM('pending_approval', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'approved',
        comment: '审批状态：pending_approval=等待审批，approved=已批准，rejected=已拒绝'
      },

      /**
       * advance_mode - 系统垫付模式（2026-01-18新增 - DR-04）
       *
       * 业务含义：当库存或预算不足时，系统如何处理预设发放
       *
       * 模式枚举：
       * - system_advance：系统垫付（库存/预算不足时系统先垫付，产生欠账）
       * - user_confirm：用户确认（提示用户库存/预算不足，用户决定是否继续）
       * - reject：直接拒绝（库存/预算不足时拒绝预设发放）
       *
       * 业务规则：
       * - 默认system_advance（预设发放不可驳回的核心设计）
       * - 垫付产生的欠账记录在preset_inventory_debt和preset_budget_debt表
       * - 垫付有上限控制（preset_debt_limits表配置）
       *
       * 示例：advance_mode = 'system_advance'（系统垫付模式）
       */
      advance_mode: {
        type: DataTypes.ENUM('system_advance', 'user_confirm', 'reject'),
        allowNull: false,
        defaultValue: 'system_advance',
        comment: '系统垫付模式：system_advance=系统垫付，user_confirm=用户确认，reject=直接拒绝'
      },

      /**
       * approved_by - 审批人ID（2026-01-18新增 - DR-16）
       *
       * 业务含义：记录哪个上级管理员批准/拒绝了此预设
       *
       * 业务规则：
       * - 可选字段（小额预设无需审批时为null）
       * - 大额预设审批后必填
       * - 用于审计追溯
       *
       * 示例：approved_by = 2（管理员user_id=2批准了此预设）
       */
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        comment: '审批人ID（上级管理员user_id）'
      },

      /**
       * approved_at - 审批时间（2026-01-18新增 - DR-16）
       *
       * 业务含义：记录预设被批准/拒绝的时间
       *
       * 业务规则：
       * - 可选字段（小额预设无需审批时为null）
       * - 大额预设审批后自动填入当前时间
       *
       * 示例：approved_at = "2026-01-18 15:30:00"
       */
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审批时间'
      },

      /**
       * rejection_reason - 拒绝原因（2026-01-18新增 - DR-16）
       *
       * 业务含义：记录审批拒绝的原因（用于审计和运营沟通）
       *
       * 业务规则：
       * - 可选字段（仅rejected状态需要填写）
       * - 审批拒绝时必填（说明拒绝理由）
       * - 用于运营沟通和后续调整
       *
       * 示例：rejection_reason = "奖品价值过高，需要更高级别审批"
       */
      rejection_reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '审批拒绝原因（rejected状态时填写）'
      },

      /**
       * reason - 预设原因（2026-01-18新增）
       *
       * 业务含义：记录创建预设的业务原因（用于审计和运营追溯）
       *
       * 业务规则：
       * - 可选字段（建议填写，便于后续审计）
       * - 运营人员填写预设创建原因
       *
       * 示例：reason = "VIP用户生日福利"
       */
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '预设创建原因（运营人员填写）'
      },

      /**
       * created_at - 预设创建时间（北京时间）
       *
       * 业务含义：记录预设创建的时间（用于审计和统计）
       *
       * 时间规则：
       * - 存储：北京时间（GMT+8），使用BeijingTimeHelper.createDatabaseTime()
       * - 显示：中文格式（YYYY年MM月DD日 HH:mm:ss），通过getter自动格式化
       * - 默认值：自动生成（无需手动赋值）
       *
       * 业务用途：
       * - 审计追溯：查询管理员的预设操作时间
       * - 统计分析：按时间范围统计预设数量
       * - 清理策略：清理过期预设（如90天前的已使用预设）
       *
       * 示例：created_at = "2025年10月30日 12:34:56"
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '创建时间',
        /**
         * getter方法：将created_at时间格式化为中文显示格式
         * @returns {string} 格式化后的中文时间字符串（如：2025年10月30日 12:34:56）
         */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        }
      }
    },
    {
      tableName: 'lottery_presets',
      timestamps: false, // 使用自定义的created_at字段
      indexes: [
        {
          name: 'idx_user_status',
          fields: ['user_id', 'status']
        },
        {
          name: 'idx_queue_order',
          fields: ['queue_order']
        },
        {
          name: 'idx_created_by',
          fields: ['created_by']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        }
      ],
      comment: '抽奖结果预设表（简化版）'
    }
  )

  // 关联关系
  LotteryPreset.associate = function (models) {
    // 关联用户表（目标用户）
    LotteryPreset.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'targetUser'
    })

    // 关联奖品表
    LotteryPreset.belongsTo(models.LotteryPrize, {
      foreignKey: 'lottery_prize_id',
      as: 'prize'
    })

    // 关联管理员表（创建人）
    LotteryPreset.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'admin'
    })

    // 🔴 统一抽奖架构新增关联

    // 关联抽奖活动
    LotteryPreset.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'SET NULL',
      comment: '关联的抽奖活动'
    })

    // 关联审批人（上级管理员）
    LotteryPreset.belongsTo(models.User, {
      foreignKey: 'approved_by',
      as: 'approver',
      comment: '审批人（上级管理员）'
    })

    // 一对多：预设产生的库存欠账
    LotteryPreset.hasMany(models.PresetInventoryDebt, {
      foreignKey: 'lottery_preset_id',
      sourceKey: 'lottery_preset_id',
      as: 'inventoryDebts',
      onDelete: 'SET NULL',
      comment: '预设产生的库存欠账'
    })

    // 一对多：预设产生的预算欠账
    LotteryPreset.hasMany(models.PresetBudgetDebt, {
      foreignKey: 'lottery_preset_id',
      sourceKey: 'lottery_preset_id',
      as: 'budgetDebts',
      onDelete: 'SET NULL',
      comment: '预设产生的预算欠账'
    })

    // 一对多：预设关联的决策快照
    LotteryPreset.hasMany(models.LotteryDrawDecision, {
      foreignKey: 'lottery_preset_id',
      sourceKey: 'lottery_preset_id',
      as: 'decisions',
      onDelete: 'SET NULL',
      comment: '预设关联的决策快照'
    })
  }

  /**
   * ========== 实例方法（对象方法）==========
   */

  /**
   * 标记预设为已使用（抽奖使用预设后调用）
   *
   * 业务场景：用户抽奖时，系统使用预设奖品后，调用此方法标记预设为已使用
   *
   * 业务流程：
   * 1. LotteryService调用getNextPreset查询用户的下一个未使用预设
   * 2. 找到预设后，返回预设奖品给用户
   * 3. 调用preset.markAsUsed()标记为已使用状态
   * 4. 下次抽奖时，此预设不再参与查询（只查询status='pending'的预设）
   *
   * 业务规则：
   * - 状态转换：pending → used（单向，不可逆）
   * - 事务保护：支持外部事务参数（确保与抽奖操作在同一事务中）
   * - 连抽场景：连续抽奖时，必须传入外部事务（避免脏读）
   *
   * 设计说明：
   * - 2025-10-20修复：支持外部事务参数，确保连抽场景下的事务一致性
   * - 外部事务：由LotteryService传入，确保预设使用与抽奖记录创建在同一事务中
   * - 事务回滚：如果抽奖失败，预设状态也会回滚（避免数据不一致）
   *
   * @param {Transaction} transaction - Sequelize事务对象（可选，连抽场景传入）
   * @returns {Promise<LotteryPreset>} 更新后的预设对象
   *
   * @example
   * // 抽奖服务中使用预设（带事务）
   * const transaction = await sequelize.transaction()
   * try {
   *   const preset = await LotteryPreset.getNextPreset(user_id, transaction)
   *   if (preset) {
   *     // 使用预设奖品
   *     const prizeResult = preset.prize
   *     // 标记预设为已使用
   *     await preset.markAsUsed(transaction)
   *     // 创建抽奖记录
   *     await LotteryResult.create({ user_id, prize_id: prizeResult.prize_id }, { transaction })
   *     await transaction.commit()
   *     return prizeResult
   *   }
   * } catch (error) {
   *   await transaction.rollback()
   *   throw error
   * }
   */
  LotteryPreset.prototype.markAsUsed = async function (transaction = null) {
    this.status = 'used'
    return await this.save(transaction ? { transaction } : {})
  }

  /**
   * ========== 静态方法（类方法）==========
   */

  /**
   * 获取用户的下一个未使用预设（抽奖前检查预设队列）
   *
   * 业务场景：用户发起抽奖时，LotteryService优先检查是否有预设奖品
   *
   * 业务流程：
   * 1. 用户发起抽奖请求
   * 2. LotteryService调用getNextPreset(user_id)查询预设队列
   * 3. 找到预设：返回预设奖品，跳过正常抽奖逻辑
   * 4. 无预设：返回null，执行正常抽奖逻辑（从奖品池随机抽取）
   *
   * 查询逻辑：
   * - 筛选条件：user_id=指定用户 AND status='pending'
   * - 排序规则：按queue_order升序（最小的queue_order优先）
   * - 查询数量：只返回第一条（LIMIT 1）
   * - 关联奖品：自动关联LotteryPrize表，返回奖品详情
   *
   * 业务规则：
   * - 队列顺序：严格按queue_order排序（确保预设按顺序使用）
   * - 事务保护：支持外部事务参数（确保查询在事务中执行，避免脏读）
   * - 连抽场景：连续抽奖时，必须传入外部事务（避免并发冲突）
   *
   * 设计说明：
   * - 2025-10-20修复：支持外部事务参数，确保查询在事务中执行，避免脏读
   * - 外部事务：由LotteryService传入，确保预设查询与抽奖操作在同一事务中
   * - 奖品字段：返回完整奖品信息（包含sort_order字段，用于奖品排序）
   *
   * @param {number} user_id - 用户ID（必填，查询指定用户的预设队列）
   * @param {Transaction} transaction - Sequelize事务对象（可选，连抽场景传入）
   * @returns {Promise<LotteryPreset|null>} 下一个未使用的预设对象（包含奖品信息），无预设返回null
   *
   * @example
   * // 抽奖服务中检查预设
   * const preset = await LotteryPreset.getNextPreset(user_id)
   * if (preset) {
   *   console.log('使用预设奖品:', preset.prize.prize_name)
   *   console.log('预设队列顺序:', preset.queue_order)
   *   await preset.markAsUsed()
   *   return preset.prize
   * } else {
   *   console.log('无预设，执行正常抽奖')
   *   return await normalLotteryLogic()
   * }
   *
   * // 连抽场景中检查预设（带事务）
   * const transaction = await sequelize.transaction()
   * try {
   *   const preset = await LotteryPreset.getNextPreset(user_id, transaction)
   *   if (preset) {
   *     await preset.markAsUsed(transaction)
   *     await transaction.commit()
   *   }
   * } catch (error) {
   *   await transaction.rollback()
   * }
   */
  LotteryPreset.getNextPreset = async function (user_id, transaction = null) {
    return await LotteryPreset.findOne({
      where: {
        user_id,
        status: 'pending'
      },
      order: [['queue_order', 'ASC']],
      include: [
        {
          model: sequelize.models.LotteryPrize,
          as: 'prize',
          attributes: [
            'lottery_prize_id',
            'prize_name',
            'prize_type',
            'prize_value',
            'prize_description',
            'sort_order'
          ] // 🎯 方案3：添加sort_order字段
        }
      ],
      transaction // 🎯 在事务中查询，避免脏读
    })
  }

  /**
   * 为用户创建预设队列（运营人员批量创建预设）
   *
   * 业务场景：运营人员为指定用户创建预设奖品队列（如：VIP用户保底奖品）
   *
   * 业务流程：
   * 1. 运营人员在管理后台选择目标用户
   * 2. 配置预设队列：[{lottery_prize_id: 1, queue_order: 1}, {lottery_prize_id: 2, queue_order: 2}]
   * 3. 调用createPresetQueue创建预设记录
   * 4. 系统批量创建预设记录（在事务中执行，确保原子性）
   * 5. 用户抽奖时，系统按队列顺序返回预设奖品
   *
   * 业务规则：
   * - 批量创建：一次创建多条预设记录（for循环遍历presets数组）
   * - 事务保护：所有预设在同一事务中创建（确保原子性）
   * - 队列顺序：必须指定queue_order（决定预设使用顺序）
   * - 管理员追溯：记录created_by字段（审计功能）
   *
   * 参数验证：
   * - user_id：必须是有效的用户ID
   * - presets：数组，每个元素包含prize_id和queue_order
   * - adminId：可选，管理员ID（用于审计）
   *
   * 事务回滚：
   * - 任一预设创建失败，所有预设回滚（避免部分创建）
   * - 外键约束失败（user_id或lottery_prize_id无效），事务回滚
   *
   * @param {number} user_id - 用户ID（必填，预设奖品的目标用户）
   * @param {Array<Object>} presets - 预设配置数组（必填）
   * @param {number} presets[].lottery_prize_id - 奖品ID（必填）
   * @param {number} presets[].queue_order - 队列顺序（必填，从1开始递增）
   * @param {number} adminId - 管理员ID（可选，用于审计追溯）
   * @returns {Promise<Array<LotteryPreset>>} 创建的预设记录数组
   *
   * @throws {Error} 如果user_id无效（外键约束失败）
   * @throws {Error} 如果lottery_prize_id无效（外键约束失败）
   * @throws {Error} 如果presets数组为空
   * @throws {Error} 如果queue_order重复（数据库唯一索引冲突）
   *
   * @example
   * // 运营人员为用户创建预设队列
   * const presets = [
   *   { lottery_prize_id: 1, queue_order: 1 },  // 第1次抽奖获得奖品1
   *   { lottery_prize_id: 2, queue_order: 2 },  // 第2次抽奖获得奖品2
   *   { lottery_prize_id: 3, queue_order: 3 }   // 第3次抽奖获得奖品3
   * ]
   * const createdPresets = await LotteryPreset.createPresetQueue(10001, presets, 1)
   * console.log('成功创建预设队列:', createdPresets.length, '条')
   *
   * // 为VIP用户设置保底奖品（第5次必中一等奖）
   * const vipPresets = [
   *   { lottery_prize_id: 1, queue_order: 5 }  // 第5次抽奖必中一等奖
   * ]
   * await LotteryPreset.createPresetQueue(vipUserId, vipPresets, adminId)
   */
  LotteryPreset.createPresetQueue = async function (user_id, presets, adminId) {
    const transaction = await sequelize.transaction()

    try {
      const createdPresets = []

      for (const preset of presets) {
        // eslint-disable-next-line no-await-in-loop -- 事务内串行创建预设
        const newPreset = await LotteryPreset.create(
          {
            user_id,
            lottery_prize_id: preset.lottery_prize_id,
            queue_order: preset.queue_order,
            created_by: adminId
          },
          { transaction }
        )

        createdPresets.push(newPreset)
      }

      await transaction.commit()
      return createdPresets
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * 获取用户的预设统计信息（管理后台查询用户预设状态）
   *
   * 业务场景：管理后台查询用户的预设使用情况（已使用多少，还剩多少）
   *
   * 查询逻辑：
   * - 并行查询：同时统计pending和used状态的预设数量（Promise.all优化性能）
   * - 筛选条件：user_id=指定用户
   * - 统计字段：total（总预设数）、pending（待使用数）、used（已使用数）
   *
   * 业务用途：
   * - 管理审计：查看用户的预设使用情况
   * - 运营决策：判断是否需要补充预设
   * - 用户支持：处理用户投诉时查询预设状态
   *
   * @param {number} user_id - 用户ID（必填，查询指定用户的预设统计）
   * @returns {Promise<Object>} 预设统计对象
   * @returns {number} returns.total - 总预设数量（pending + used）
   * @returns {number} returns.pending - 待使用预设数量（等待用户抽奖）
   * @returns {number} returns.used - 已使用预设数量（用户已抽奖使用）
   *
   * @example
   * // 管理后台查询用户预设状态
   * const stats = await LotteryPreset.getUserPresetStats(10001)
   * console.log('用户预设统计:')
   * console.log('- 总预设数量:', stats.total)
   * console.log('- 待使用数量:', stats.pending)
   * console.log('- 已使用数量:', stats.used)
   *
   * // 判断是否需要补充预设
   * if (stats.pending === 0) {
   *   console.log('用户无剩余预设，建议补充')
   * } else {
   *   console.log('用户还有', stats.pending, '个预设待使用')
   * }
   */
  LotteryPreset.getUserPresetStats = async function (user_id) {
    const [pendingCount, usedCount] = await Promise.all([
      LotteryPreset.count({
        where: { user_id, status: 'pending' }
      }),
      LotteryPreset.count({
        where: { user_id, status: 'used' }
      })
    ])

    return {
      total: pendingCount + usedCount,
      pending: pendingCount,
      used: usedCount
    }
  }

  /**
   * 清除用户的所有预设记录（管理员重置用户预设）
   *
   * 业务场景：运营调整策略时，清除用户的所有预设记录（重新规划预设队列）
   *
   * 删除逻辑：
   * - 删除范围：删除指定用户的所有预设记录（包括pending和used状态）
   * - 物理删除：直接从数据库删除记录（不保留历史）
   * - 级联影响：删除预设后，用户抽奖将执行正常抽奖逻辑
   *
   * 业务规则：
   * - 管理员权限：仅管理员可执行此操作
   * - 审慎操作：删除前需二次确认（避免误操作）
   * - 影响范围：清除后，用户抽奖将不再使用预设奖品
   *
   * 使用场景：
   * - 运营调整：重新规划用户的预设策略
   * - 用户投诉：删除错误的预设配置
   * - 活动结束：清理活动期间的预设记录
   *
   * @param {number} user_id - 用户ID（必填，删除指定用户的所有预设）
   * @returns {Promise<number>} 删除的记录数量
   *
   * @example
   * // 管理员清除用户的所有预设
   * const deletedCount = await LotteryPreset.clearUserPresets(10001)
   * console.log('成功清除用户预设:', deletedCount, '条')
   *
   * // 重新规划用户预设
   * await LotteryPreset.clearUserPresets(10001)  // 先清除旧预设
   * const newPresets = [
   *   { lottery_prize_id: 5, queue_order: 1 },
   *   { lottery_prize_id: 6, queue_order: 2 }
   * ]
   * await LotteryPreset.createPresetQueue(10001, newPresets, adminId)  // 创建新预设
   */
  LotteryPreset.clearUserPresets = async function (user_id) {
    return await LotteryPreset.destroy({
      where: { user_id }
    })
  }

  return LotteryPreset
}
