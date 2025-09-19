/**
 * 统一决策引擎结果生成器
 * @description 根据决策结果生成最终的抽奖结果，包括中奖奖品、用户反馈等
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const Logger = require('../utils/Logger')
const CacheManager = require('../utils/CacheManager')

class ResultGenerator {
  constructor () {
    this.logger = new Logger('ResultGenerator')
    this.cache = new CacheManager()
    this.models = require('../../../models')
  }

  /**
   * 生成抽奖结果
   * @param {Object} decisionData - 决策数据
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 生成的结果
   */
  async generateResult (decisionData, context) {
    const startTime = Date.now()

    try {
      // 🔧 修复：参数验证 - 优雅处理缺失的上下文信息
      if (!context || typeof context !== 'object') {
        return {
          success: false,
          is_winner: false,
          message: '上下文信息缺失或无效',
          error: 'INVALID_CONTEXT',
          data: {},
          metadata: {
            error: true,
            processingTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        }
      }

      // 验证必要的上下文字段
      if (!context.userId || !context.campaignId) {
        return {
          success: false,
          is_winner: false,
          message: '缺少必要的用户或活动信息',
          error: 'MISSING_REQUIRED_CONTEXT',
          data: { missingFields: [] },
          metadata: {
            error: true,
            processingTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        }
      }

      this.logger.info('开始生成抽奖结果', {
        userId: context.userId,
        campaignId: context.campaignId,
        decisionResult: decisionData.is_winner ? 'win' : 'lose'
      })

      // ✅ 修复：完全使用is_winner业务标准字段
      if (decisionData.is_winner === true) {
        return await this._generateWinResult(decisionData, context)
      } else {
        return await this._generateLoseResult(decisionData, context)
      }
    } catch (error) {
      this.logger.error('生成抽奖结果失败', {
        error: error.message,
        userId: context?.userId || 'unknown', // 🔧 修复：安全访问context
        campaignId: context?.campaignId || 'unknown' // 🔧 修复：安全访问context
      })

      // 返回失败结果 - 使用统一业务标准
      return {
        success: false,
        is_winner: false, // ✅ 统一使用业务标准字段
        message: '系统繁忙，请稍后再试',
        error: error.message
      }
    } finally {
      const executionTime = Date.now() - startTime
      this.logger.debug('结果生成完成', {
        executionTime,
        userId: context?.userId || 'unknown' // 🔧 修复：安全访问context
      })
    }
  }

  /**
   * 生成中奖结果
   * @private
   * @param {Object} decisionData - 决策数据
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 中奖结果
   */
  async _generateWinResult (decisionData, context) {
    const { Prize, UserPrize, LotteryCampaign } = this.models
    const transaction = await this.models.sequelize.transaction()

    try {
      // 获取中奖奖品信息
      const selectedPrize = await Prize.findByPk(decisionData.prizeId, { transaction })
      if (!selectedPrize) {
        throw new Error(`奖品不存在: ${decisionData.prizeId}`)
      }

      // 检查奖品库存
      if (selectedPrize.remaining_stock <= 0) {
        this.logger.warn('奖品库存不足，自动转为未中奖', {
          prizeId: decisionData.prizeId,
          stock: selectedPrize.remaining_stock
        })

        await transaction.rollback()
        return await this._generateLoseResult(decisionData, context)
      }

      // 创建中奖记录
      const userPrize = await UserPrize.create(
        {
          user_id: context.userId,
          campaign_id: context.campaignId,
          prize_id: decisionData.prizeId,
          prize_name: selectedPrize.name,
          prize_value: selectedPrize.value,
          prize_type: selectedPrize.type,
          win_time: new Date(),
          claim_status: 'unclaimed',
          win_probability: decisionData.finalProbability,
          guarantee_triggered: decisionData.guaranteeTriggered || false,
          pool_used: decisionData.poolSelected || 'default',
          decision_id: decisionData.decisionId
        },
        { transaction }
      )

      // 更新奖品库存
      await selectedPrize.update(
        {
          remaining_stock: selectedPrize.remaining_stock - 1,
          total_won: selectedPrize.total_won + 1
        },
        { transaction }
      )

      // 更新活动统计
      await LotteryCampaign.increment('total_participants', {
        by: 1,
        where: { campaign_id: context.campaignId },
        transaction
      })

      await LotteryCampaign.increment('total_winners', {
        by: 1,
        where: { campaign_id: context.campaignId },
        transaction
      })

      // 提交事务
      await transaction.commit()

      this.logger.info('用户中奖', {
        userId: context.userId,
        prizeId: decisionData.prizeId,
        prizeName: selectedPrize.name,
        userPrizeId: userPrize.user_prize_id
      })

      return {
        success: true,
        is_winner: true, // ✅ 统一使用业务标准字段
        message: `🎉 恭喜您中得「${selectedPrize.name}」！`,
        prize: {
          id: selectedPrize.prize_id,
          name: selectedPrize.name,
          description: selectedPrize.description,
          value: selectedPrize.value,
          type: selectedPrize.type,
          image: selectedPrize.image_url
        },
        userPrize: {
          id: userPrize.user_prize_id,
          winTime: userPrize.win_time,
          claimStatus: 'unclaimed',
          claimInstructions: this._generateClaimInstructions(selectedPrize)
        },
        statistics: {
          probability: decisionData.finalProbability,
          guaranteeTriggered: decisionData.guaranteeTriggered || false,
          poolUsed: decisionData.poolSelected || 'default'
        }
      }
    } catch (error) {
      await transaction.rollback()
      this.logger.error('生成中奖结果失败', {
        error: error.message,
        userId: context.userId,
        prizeId: decisionData.prizeId
      })

      // 出错时返回未中奖结果
      return await this._generateLoseResult(decisionData, context)
    }
  }

  /**
   * 生成未中奖结果
   * @private
   * @param {Object} decisionData - 决策数据
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 未中奖结果
   */
  async _generateLoseResult (decisionData, context) {
    const { User, LotteryCampaign } = this.models
    const transaction = await this.models.sequelize.transaction()

    try {
      // 更新用户连续未中奖次数
      const user = await User.findByPk(context.userId, { transaction })
      if (user) {
        await user.increment('consecutive_losses', { by: 1, transaction })
      }

      // 更新活动参与统计
      await LotteryCampaign.increment('total_participants', {
        by: 1,
        where: { campaign_id: context.campaignId },
        transaction
      })

      await transaction.commit()

      // 生成鼓励消息
      const encourageMessage = this._generateEncourageMessage(
        user?.consecutive_losses || 0,
        decisionData.guaranteeTriggered
      )

      this.logger.info('用户未中奖', {
        userId: context.userId,
        campaignId: context.campaignId,
        consecutiveLosses: user?.consecutive_losses || 0
      })

      return {
        success: true,
        is_winner: false, // ✅ 统一使用业务标准字段
        message: encourageMessage,
        consolation: {
          points: this._calculateConsolationPoints(user?.consecutive_losses || 0),
          message: '获得安慰积分，继续努力！'
        },
        statistics: {
          probability: decisionData.finalProbability,
          consecutiveLosses: user?.consecutive_losses || 0,
          guaranteeProgress: this._calculateGuaranteeProgress(user?.consecutive_losses || 0)
        },
        nextDrawInfo: {
          betterChance: decisionData.guaranteeTriggered
            ? '下次中奖概率将显著提升！'
            : '继续参与，好运即将到来！',
          tips: this._generateDrawTips(context)
        }
      }
    } catch (error) {
      await transaction.rollback()
      this.logger.error('生成未中奖结果失败', {
        error: error.message,
        userId: context.userId
      })

      return {
        success: false,
        is_winner: false, // ✅ 统一使用业务标准字段
        message: '系统繁忙，请稍后再试',
        error: error.message
      }
    }
  }

  /**
   * 生成领取说明
   * @private
   * @param {Object} prize - 奖品信息
   * @returns {string} 领取说明
   */
  _generateClaimInstructions (prize) {
    switch (prize.type) {
    case 'physical':
      return '请在7天内到店领取实物奖品，逾期视为自动放弃。'
    case 'digital':
      return '数字奖品已自动发放到您的账户。'
    case 'voucher':
      return '优惠券已添加到您的卡包，请在有效期内使用。'
    case 'points':
      return '积分已自动添加到您的积分账户。'
    default:
      return '请联系客服了解奖品领取方式。'
    }
  }

  /**
   * 生成鼓励消息
   * @private
   * @param {number} consecutiveLosses - 连续未中奖次数
   * @param {boolean} guaranteeTriggered - 是否触发保底
   * @returns {string} 鼓励消息
   */
  _generateEncourageMessage (consecutiveLosses, guaranteeTriggered) {
    if (guaranteeTriggered) {
      return '系统检测到您的运气需要调整，下次抽奖将有特别加成！'
    }

    const messages = [
      '很遗憾，这次没有中奖。不要灰心，好运就在下一次！',
      '运气正在积累中，继续努力，大奖等着您！',
      '每一次尝试都是成功的积累，坚持就是胜利！',
      '虽然这次没中，但您离大奖又近了一步！',
      '今天的遗憾是明天惊喜的铺垫，继续加油！'
    ]

    if (consecutiveLosses >= 5) {
      return '您已经很努力了！系统正在为您准备特别的惊喜，请继续关注！'
    }

    return messages[Math.floor(Math.random() * messages.length)]
  }

  /**
   * 计算安慰积分
   * @private
   * @param {number} consecutiveLosses - 连续未中奖次数
   * @returns {number} 安慰积分
   */
  _calculateConsolationPoints (consecutiveLosses) {
    const basePoints = 5
    const bonusPoints = Math.min(consecutiveLosses * 2, 20) // 最多额外20积分
    return basePoints + bonusPoints
  }

  /**
   * 计算保底进度
   * @private
   * @param {number} consecutiveLosses - 连续未中奖次数
   * @returns {number} 保底进度百分比
   */
  _calculateGuaranteeProgress (consecutiveLosses) {
    const guaranteeThreshold = 10 // 10次未中奖触发保底
    return Math.min((consecutiveLosses / guaranteeThreshold) * 100, 100)
  }

  /**
   * 生成抽奖提示
   * @private
   * @param {Object} context - 上下文信息
   * @returns {string} 抽奖提示
   */
  _generateDrawTips (_context) {
    const tips = [
      '最佳抽奖时间：下午2-4点，中奖率更高哦！',
      '连续参与活动可提升中奖概率，不要放弃！',
      '邀请好友一起参与，共同分享好运！',
      '关注活动公告，掌握最新中奖技巧！',
      '保持积极心态，好运自然来！'
    ]

    return tips[Math.floor(Math.random() * tips.length)]
  }

  /**
   * 生成结果摘要
   * @param {Object} result - 结果对象
   * @returns {string} 结果摘要
   */
  generateResultSummary (result) {
    if (result.is_winner) {
      return `🎉 用户中奖：${result.prize.name}（价值：${result.prize.value}）`
    } else {
      return `😔 用户未中奖，获得${result.consolation?.points || 0}安慰积分`
    }
  }

  /**
   * 验证结果数据完整性
   * @param {Object} result - 结果对象
   * @returns {boolean} 是否有效
   */
  validateResult (result) {
    if (!result || typeof result !== 'object') {
      return false
    }

    // 检查必需字段
    const requiredFields = ['success', 'is_winner', 'message']
    for (const field of requiredFields) {
      if (!(field in result)) {
        return false
      }
    }

    // 检查结果类型
    if (![true, false].includes(result.is_winner)) {
      return false
    }

    // 如果是中奖结果，检查奖品信息
    if (result.is_winner && !result.prize) {
      return false
    }

    return true
  }
}

module.exports = ResultGenerator
