/**
 * 抽奖记录模型
 * 记录用户的抽奖活动历史和结果
 * 对应表: lottery_records (97条记录)
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const LotteryRecord = sequelize.define(
    'LotteryRecord',
    {
      // 抽奖ID（主键）
      draw_id: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        comment: '抽奖记录唯一ID'
      },

      // 用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '参与抽奖的用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 奖品ID
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '获得的奖品ID',
        references: {
          model: 'lottery_prizes',
          key: 'prize_id'
        }
      },

      // 奖品名称
      prize_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '奖品名称'
      },

      // 奖品类型
      prize_type: {
        type: DataTypes.ENUM('points', 'product', 'coupon', 'special'),
        allowNull: true,
        comment: '奖品类型：points=积分，product=实物，coupon=优惠券，special=特殊奖品'
      },

      // 奖品价值
      prize_value: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '奖品价值（积分数量或商品价值）'
      },

      // 抽奖类型
      draw_type: {
        type: DataTypes.ENUM('single', 'triple', 'five', 'ten'),
        allowNull: true,
        comment: '抽奖类型：single=单抽，triple=三连抽，five=五连抽，ten=十连抽'
      },

      // 抽奖序号
      draw_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '在批次中的抽奖序号'
      },

      // 是否保底
      is_pity: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否触发保底机制'
      },

      // 消耗积分
      cost_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '本次抽奖消耗的积分'
      },

      // 停止角度
      stop_angle: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '转盘停止角度（转盘抽奖使用）'
      },

      // 批次ID
      batch_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '批次抽奖的批次ID'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '抽奖时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '记录更新时间'
      },

      // 抽奖次数
      draw_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '本次抽奖包含的次数（连抽使用）'
      },

      // 奖品描述
      prize_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '奖品详细描述'
      },

      // 奖品图片
      prize_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '奖品图片URL'
      },

      /**
       * ✅ 是否中奖的业务标准字段（核心业务标准）
       *
       * 🎯 业务含义：
       * - true: 本次抽奖中获得有价值奖品（非空奖、非谢谢参与）
       * - false: 本次抽奖未中奖或获得无价值奖励
       *
       * 📋 业务逻辑：
       * - 直接Boolean字段，由抽奖引擎根据抽奖结果设置
       * - 中奖判断标准：获得的奖品具有实际价值（积分>0、实物商品、优惠券等）
       * - 保底机制触发时，通常设置为true
       *
       * 🔍 使用场景：
       * - 中奖统计：COUNT(*) WHERE is_winner = true
       * - 中奖率计算：AVG(is_winner) * 100%
       * - 保底机制触发条件：连续N次is_winner = false
       * - 前端显示抽奖结果："恭喜中奖" vs "谢谢参与"
       * - 奖品发放流程：只有is_winner = true才发放奖品
       *
       * 💡 业务理解：
       * - 与prize_value字段关联：通常prize_value > 0时is_winner = true
       * - 与prize_type字段关联：special类型奖品通常is_winner = true
       * - 保底机制：guarantee_triggered = true时通常is_winner = true
       *
       * 🔄 业务标准一致性：
       * - 这是所有业务成功标准的原型（is_winner模式）
       * - TradeRecord.is_successful: 扩展到交易场景
       * - ExchangeRecords.is_successful: 扩展到兑换场景
       * - 统一的true/false语义，表示业务操作的最终结果
       *
       * ⚠️ 重要说明：
       * - 这是直接存储字段，可以直接设置
       * - 抽奖引擎会自动设置此字段
       * - 不要手动修改，除非有明确的业务需求
       * - 影响用户的中奖统计和保底计算
       *
       * 📝 使用示例：
       * ```javascript
       * // 查询用户中奖记录
       * const winRecords = await LotteryRecord.findAll({
       *   where: { user_id: userId, is_winner: true }
       * })
       *
       * // 计算用户中奖率
       * const winRate = await LotteryRecord.findAll({
       *   where: { user_id: userId },
       *   attributes: [
       *     [sequelize.fn('AVG', sequelize.col('is_winner')), 'win_rate']
       *   ]
       * })
       *
       * // 检查是否需要触发保底
       * const recentLosses = await LotteryRecord.count({
       *   where: {
       *     user_id: userId,
       *     is_winner: false,
       *     created_at: { [Op.gte]: recentDate }
       *   }
       * })
       * ```
       */
      is_winner: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否中奖（获得有价值奖品）'
      },

      // 保底触发
      guarantee_triggered: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: '是否触发了保底'
      },

      // 剩余保底次数
      remaining_guarantee: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '抽奖后剩余的保底次数'
      },

      // 抽奖配置
      draw_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖时的配置参数（JSON格式）'
      },

      // 结果元数据
      result_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖结果的元数据（JSON格式）'
      },

      // IP地址
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: '用户IP地址'
      },

      // 用户代理
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '用户浏览器信息'
      },

      // 抽奖活动ID
      lottery_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
        comment: '关联的抽奖活动ID'
      }
    },
    {
      tableName: 'lottery_records',
      timestamps: false, // 手动管理created_at和updated_at
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
          name: 'idx_is_pity',
          fields: ['is_pity']
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
        }
      ]
    }
  )

  /**
   * 关联关系定义
   */
  LotteryRecord.associate = function (models) {
    // 属于某个用户
    LotteryRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '抽奖用户'
    })

    // 属于某个奖品（可能为空）
    LotteryRecord.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize',
      comment: '中奖奖品'
    })

    // 🔥 一个抽奖记录可以有多个奖品分发记录（支持批量分发）
    LotteryRecord.hasMany(models.PrizeDistribution, {
      foreignKey: 'draw_id',
      sourceKey: 'draw_id',
      as: 'prizeDistributions',
      comment: '关联的奖品分发记录'
    })

    // 属于某个抽奖活动（通过lottery_id关联）
    if (models.LotteryCampaign) {
      LotteryRecord.belongsTo(models.LotteryCampaign, {
        foreignKey: 'lottery_id',
        targetKey: 'campaign_id',
        as: 'campaign',
        comment: '关联的抽奖活动'
      })
    }
  }

  /**
   * 实例方法
   */
  LotteryRecord.prototype.toJSON = function () {
    const values = { ...this.get() }

    // 格式化时间显示
    if (values.created_at) {
      values.created_at_formatted = new Date(values.created_at).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai'
      })
    }

    // 添加类型显示文本
    const drawTypeMap = {
      single: '单次抽奖',
      triple: '三连抽',
      five: '五连抽',
      ten: '十连抽'
    }
    values.draw_type_text = drawTypeMap[values.draw_type] || values.draw_type

    const prizeTypeMap = {
      points: '积分奖励',
      product: '实物奖品',
      coupon: '优惠券',
      special: '特殊奖品'
    }
    values.prize_type_text = prizeTypeMap[values.prize_type] || values.prize_type

    // 解析JSON字段
    if (values.draw_config && typeof values.draw_config === 'string') {
      try {
        values.draw_config = JSON.parse(values.draw_config)
      } catch (e) {
        // JSON解析失败，保持原值
      }
    }

    if (values.result_metadata && typeof values.result_metadata === 'string') {
      try {
        values.result_metadata = JSON.parse(values.result_metadata)
      } catch (e) {
        // JSON解析失败，保持原值
      }
    }

    return values
  }

  /**
   * 静态方法
   */

  // 获取用户抽奖记录
  LotteryRecord.getUserRecords = async function (userId, options = {}) {
    const {
      _drawType = null,
      _prizeType = null,
      _is_winner = null,
      _limit = 20,
      _offset = 0,
      _startDate = null,
      _endDate = null
    } = options

    const where = { user_id: userId }

    if (_drawType) where.draw_type = _drawType
    if (_prizeType) where.prize_type = _prizeType
    if (_is_winner !== null) where.is_winner = _is_winner

    if (_startDate || _endDate) {
      where.created_at = {}
      if (_startDate) where.created_at[sequelize.Sequelize.Op.gte] = _startDate
      if (_endDate) where.created_at[sequelize.Sequelize.Op.lte] = _endDate
    }

    return await LotteryRecord.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: _limit,
      offset: _offset,
      include: [
        {
          model: sequelize.models.LotteryPrize,
          as: 'prize',
          required: false
        }
      ]
    })
  }

  // 获取用户抽奖统计
  LotteryRecord.getUserLotteryStats = async function (userId) {
    const [stats] = await sequelize.query(
      `
    SELECT 
      COUNT(*) as total_draws,
      COUNT(CASE WHEN is_winner = 1 THEN 1 END) as wins,
      COUNT(CASE WHEN is_pity = 1 THEN 1 END) as pity_wins,
      COALESCE(SUM(cost_points), 0) as total_cost,
      COALESCE(SUM(CASE WHEN prize_type = 'points' THEN prize_value ELSE 0 END), 0) as points_won
    FROM lottery_records 
    WHERE user_id = :userId
  `,
      {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT
      }
    )

    return {
      total_draws: stats.total_draws || 0,
      wins: stats.wins || 0,
      pity_wins: stats.pity_wins || 0,
      total_cost: stats.total_cost || 0,
      points_won: stats.points_won || 0,
      win_rate: stats.total_draws > 0 ? ((stats.wins / stats.total_draws) * 100).toFixed(2) : '0.00'
    }
  }

  // 创建抽奖记录
  LotteryRecord.createRecord = async function (recordData, transaction = null) {
    const options = transaction ? { transaction } : {}

    return await LotteryRecord.create(
      {
        draw_id: recordData.draw_id,
        user_id: recordData.user_id,
        prize_id: recordData.prize_id || null,
        prize_name: recordData.prize_name || null,
        prize_type: recordData.prize_type || null,
        prize_value: recordData.prize_value || null,
        draw_type: recordData.draw_type || null,
        draw_sequence: recordData.draw_sequence || null,
        is_pity: recordData.is_pity || false,
        cost_points: recordData.cost_points || null,
        stop_angle: recordData.stop_angle || null,
        batch_id: recordData.batch_id || null,
        draw_count: recordData.draw_count || null,
        prize_description: recordData.prize_description || null,
        prize_image: recordData.prize_image || null,
        is_winner: recordData.is_winner || false,
        guarantee_triggered: recordData.guarantee_triggered || false,
        remaining_guarantee: recordData.remaining_guarantee || null,
        draw_config: recordData.draw_config || null,
        result_metadata: recordData.result_metadata || null,
        ip_address: recordData.ip_address || null,
        user_agent: recordData.user_agent || null,
        lottery_id: recordData.lottery_id
      },
      options
    )
  }

  return LotteryRecord
}
