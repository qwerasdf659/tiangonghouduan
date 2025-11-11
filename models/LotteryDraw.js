/**
 * 抽奖记录模型（重构版）
 * 专注于数据定义、关联关系和基础实例方法
 * 业务逻辑已迁移至LotteryDrawService
 * 数据访问已迁移至LotteryDrawRepository
 * 数据格式化已迁移至LotteryDrawFormatter
 */

const { DataTypes, Model } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const LotteryDrawFormatter = require('../utils/formatters/LotteryDrawFormatter')

/**
 * 抽奖记录模型（重构版）
 * 职责：记录用户的每次抽奖行为和结果
 * 设计模式：数据模型分离 - 业务逻辑在Service层，数据定义在Model层
 * 业务含义：每次抽奖100%从奖品池选择一个奖品，只是价值不同
 */
class LotteryDraw extends Model {
  /**
   * 静态关联定义
   * 业务关系：抽奖记录关联用户、抽奖活动、奖品
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate (models) {
    // 关联到用户
    LotteryDraw.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '抽奖用户'
    })

    // 关联到抽奖活动
    LotteryDraw.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      comment: '关联的抽奖活动'
    })

    // 关联到奖品（可能为空）
    LotteryDraw.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize',
      comment: '中奖奖品'
    })

    /*
     * 🎯 注释掉分发记录关联 - 新的简化预设系统不需要此关联
     * 简化设计：抽奖记录就是最终结果，不需要额外的分发管理
     * LotteryDraw.hasMany(models.LotteryPreset, {
     *   foreignKey: 'draw_id',
     *   sourceKey: 'draw_id',
     *   as: 'presets',
     *   comment: '关联的预设记录（已简化，不再使用）'
     * })
     */
  }

  /**
   * 基础实例方法 - 保留简单的数据访问方法
   */

  /**
   * 获取抽奖结果显示文本
   * @returns {string} 抽奖结果文本（如"中奖"、"未中奖"）
   */
  getDrawResultName () {
    return LotteryDrawFormatter.getDrawResultText(this.is_winner)
  }

  /**
   * 获取奖品发放状态名称
   * @returns {string} 奖品发放状态文本（如"待发放"、"已发放"）
   */
  getPrizeStatusName () {
    return LotteryDrawFormatter.getPrizeStatusText(this.prize_status)
  }

  /**
   * 检查是否中奖
   * 业务含义：是否获得有价值的奖品（非空奖）
   * @returns {boolean} 是否中奖
   */
  isWinner () {
    return this.is_winner
  }

  /**
   * 检查奖品是否已发放
   * @returns {boolean} 奖品是否已发放
   */
  isPrizeDelivered () {
    return LotteryDrawFormatter.isPrizeDelivered(this.prize_status)
  }

  /**
   * 检查奖品是否可领取
   * @returns {boolean} 奖品是否可领取
   */
  isPrizeClaimable () {
    return LotteryDrawFormatter.isPrizeClaimable(this.is_winner, this.prize_status)
  }

  /**
   * 输出摘要格式（使用Formatter）
   * @returns {Object} 抽奖记录摘要对象
   */
  toSummary () {
    return LotteryDrawFormatter.formatToSummary(this)
  }

  /**
   * 重写toJSON方法（使用Formatter）
   * 业务场景：API响应数据格式化
   * @returns {Object} JSON格式的抽奖记录
   */
  toJSON () {
    return LotteryDrawFormatter.formatToJSON(this)
  }

  /**
   * 静态方法 - 保留基础验证方法
   */

  /**
   * 基础数据验证
   * 业务场景：创建抽奖记录前验证必需字段
   * @param {Object} data - 抽奖记录数据
   * @param {number} data.user_id - 用户ID
   * @param {number} data.campaign_id - 活动ID
   * @param {boolean} data.is_winner - 是否中奖
   * @returns {Array<string>} 错误信息数组（为空表示验证通过）
   */
  static validateBasicData (data) {
    const errors = []

    if (!data.user_id || data.user_id <= 0) {
      errors.push('用户ID无效')
    }

    if (!data.campaign_id || data.campaign_id <= 0) {
      errors.push('活动ID无效')
    }

    if (typeof data.is_winner !== 'boolean') {
      errors.push('中奖状态无效，必须是布尔值')
    }

    return errors
  }
}

module.exports = sequelize => {
  LotteryDraw.init(
    {
      // 记录标识
      draw_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        comment: '抽奖记录唯一ID'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '参与抽奖的用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
        comment: '关联的抽奖活动ID'
      },
      lottery_id: {
        type: DataTypes.CHAR(36),
        allowNull: true,
        comment: '抽奖标识ID'
      },

      // 奖品信息
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '获得的奖品ID',
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        }
      },
      prize_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '奖品名称'
      },
      prize_type: {
        type: DataTypes.ENUM('points', 'product', 'coupon', 'special'),
        allowNull: true,
        comment: '奖品类型'
      },
      prize_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '奖品价值'
      },
      prize_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品详细描述'
      },
      prize_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '奖品图片URL'
      },

      // 抽奖行为
      draw_type: {
        type: DataTypes.ENUM('single', 'triple', 'five', 'ten'),
        allowNull: true,
        comment: '抽奖类型'
      },
      draw_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖序号'
      },
      draw_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '本次抽奖包含的次数'
      },
      batch_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '批次ID'
      },
      /**
       * 批次抽奖ID（连抽功能专用）
       *
       * 业务含义：
       * - 用于关联同一批次（10连抽）的多条抽奖记录
       * - 格式：batch_<timestamp>_<user_id>
       * - 示例：batch_l8k9j2_123
       *
       * 使用场景：
       * - 查询"我的10连抽历史"
       * - 统计"本批次中奖情况"
       * - 支持批次级别的业务分析
       *
       * 技术特征：
       * - 允许NULL（单次抽奖没有批次ID）
       * - 有索引支持（快速查询）
       * - 不是外键（避免额外约束）
       */
      batch_draw_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '批次抽奖ID（连抽时使用，用于关联同一批次的多次抽奖）'
      },

      // 核心业务字段
      /**
       * 是否中奖的业务标准字段（核心业务标准）
       *
       * 业务含义：
       * - true: 本次抽奖中获得有价值奖品（非空奖、非谢谢参与）
       * - false: 本次抽奖未中奖或获得无价值奖励
       *
       * 业务逻辑：
       * - 直接Boolean字段，由抽奖引擎根据抽奖结果设置
       * - 中奖判断标准：获得的奖品具有实际价值（积分>0、实物商品、优惠券等）
       * - 保底机制触发时，通常设置为true
       *
       * 使用场景：
       * - 中奖统计：COUNT(*) WHERE is_winner = true
       * - 中奖率计算：AVG(is_winner) * 100%
       * - 保底机制触发条件：连续N次is_winner = false
       * - 前端显示抽奖结果："恭喜中奖" vs "谢谢参与"
       * - 奖品发放流程：只有is_winner = true才发放奖品
       */
      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否中奖（获得有价值奖品）'
      },
      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否触发保底'
      },
      remaining_guarantee: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '抽奖后剩余的保底次数'
      },

      // 成本和技术数据
      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '消耗积分'
      },
      stop_angle: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '转盘停止角度'
      },
      draw_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖配置参数'
      },
      result_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖结果元数据'
      },

      // 审计信息
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '用户IP地址'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '抽奖时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '记录更新时间'
      }
    },
    {
      sequelize,
      modelName: 'LotteryDraw',
      tableName: 'lottery_draws', // 表名和模型名保持一致
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '抽奖记录表（重构版 - 仅数据定义）',
      indexes: [
        {
          name: 'idx_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_prize_id',
          fields: ['prize_id']
        },
        {
          name: 'idx_prize_type',
          fields: ['prize_type']
        },
        {
          name: 'idx_draw_type',
          fields: ['draw_type']
        },
        {
          name: 'idx_batch_id',
          fields: ['batch_id']
        },
        {
          name: 'idx_created_at',
          fields: ['created_at']
        },
        {
          name: 'idx_user_created',
          fields: ['user_id', 'created_at']
        },
        {
          name: 'idx_campaign_result',
          fields: ['campaign_id', 'is_winner']
        },
        {
          name: 'idx_result_time',
          fields: ['is_winner', 'created_at']
        }
      ]
    }
  )

  return LotteryDraw
}
