/**
 * 抽奖业务逻辑服务
 * 🔴 前端对接说明：
 * - 提供抽奖核心算法和业务逻辑
 * - 确保抽奖公平性和数据一致性
 * - 处理复杂的概率计算和奖品分配
 * - 实现10次保底九八折券机制
 */

const { LotterySetting, PointsRecord, User, LotteryPity, sequelize } = require('../models');
const { Op } = require('sequelize');
const { BusinessLogicError } = require('../middleware/errorHandler');
const webSocketService = require('./websocket');

class LotteryService {
  
  /**
   * 🔴 获取前端抽奖配置
   * 返回格式化的抽奖转盘配置数据
   */
  static async getFrontendConfig() {
    try {
      const settings = await LotterySetting.findAll({
        where: { status: 'active' },
        order: [['angle', 'ASC']],
        attributes: [
          'prize_id',
          'prize_name', 
          'prize_type',
          'prize_value',
          'angle',
          'color',
          'probability',
          'is_activity',
          'cost_points'
        ]
      });
      
      if (settings.length === 0) {
        throw new BusinessLogicError('抽奖配置未初始化', 3001);
      }
      
      // 🔴 验证概率总和
      const totalProbability = settings.reduce((sum, item) => sum + parseFloat(item.probability), 0);
      if (Math.abs(totalProbability - 1.0) > 0.01) {
        console.warn(`⚠️ 抽奖概率总和异常: ${totalProbability}`);
      }
      
      // 🔴 格式化前端数据
      const prizes = settings.map(setting => ({
        id: setting.prize_id,
        name: setting.prize_name,
        type: setting.prize_type,
        value: setting.prize_value,
        angle: setting.angle,
        color: setting.color,
        probability: setting.probability,
        isActivity: setting.is_activity,
        costPoints: setting.cost_points
      }));
      
      return {
        prizes,
        costPerDraw: 100,
        totalPrizes: prizes.length,
        pitySystem: {
          enabled: true,
          pityLimit: 10,
          pityPrizeName: '九八折券'
        }
      };
      
    } catch (error) {
      console.error('❌ 获取抽奖配置失败:', error);
      throw error;
    }
  }
  
  /**
   * 🔴 执行抽奖核心算法（含保底机制）
   * @param {number} userId - 用户ID
   * @param {string} drawType - 抽奖类型 (points|item)
   * @param {object} transaction - 数据库事务
   */
  static async performDraw(userId, drawType = 'points', transaction = null) {
    try {
      // 🔴 参数验证
      if (!userId) {
        throw new BusinessLogicError('用户ID不能为空', 1001);
      }
      
      if (!['points', 'item'].includes(drawType)) {
        throw new BusinessLogicError('抽奖类型无效', 1002);
      }
      
      // 🔴 获取用户信息
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        throw new BusinessLogicError('用户不存在', 4001);
      }
      
      // 🔴 检查用户积分是否足够
      const costPoints = parseInt(process.env.LOTTERY_COST_POINTS) || 100;
      if (user.total_points < costPoints) {
        throw new BusinessLogicError(`积分不足，需要 ${costPoints} 积分`, 3002);
      }
      
      // 🔴 检查今日抽奖次数限制
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayDrawCount = await PointsRecord.count({
        where: {
          user_id: userId,
          source: 'lottery',
          type: 'spend',
          created_at: {
            [Op.gte]: today
          }
        },
        transaction
      });
      
      const dailyLimit = parseInt(process.env.DAILY_LOTTERY_LIMIT) || 50;
      if (todayDrawCount >= dailyLimit) {
        throw new BusinessLogicError(`今日抽奖次数已达上限 ${dailyLimit} 次`, 3003);
      }
      
      // 🔴 获取用户保底信息
      const pityRecord = await LotteryPity.getOrCreateUserPity(userId);
      
      // 🔴 获取抽奖配置
      const lotteryConfig = await this.getFrontendConfig();
      const prizes = lotteryConfig.prizes;
      
      // 🔴 执行抽奖算法（含保底逻辑）
      let selectedPrize;
      let isPityTriggered = false;
      
      // 检查下一次抽奖是否会触发保底
      if (pityRecord.willTriggerPityOnNext()) {
        // 保底触发，直接给九八折券
        selectedPrize = prizes.find(p => p.id === 2); // 九八折券ID为2
        isPityTriggered = true;
        console.log(`🎯 用户 ${userId} 触发保底机制，获得九八折券`);
        
        // 重置保底计数
        await pityRecord.resetPity();
      } else {
        // 正常抽奖
        selectedPrize = this.calculateProbability(prizes);
        console.log(`🎰 用户 ${userId} 正常抽奖结果:`, selectedPrize.name);
        console.log(`🔍 调试 - selectedPrize:`, JSON.stringify(selectedPrize, null, 2));
        
        // 增加保底计数
        await pityRecord.incrementDraw();
        
        // 如果抽到九八折券，重置保底计数
        if (selectedPrize.id === 2) {
          await pityRecord.resetPity();
        }
      }
      
      console.log(`🔍 调试 - 最终 selectedPrize:`, JSON.stringify(selectedPrize, null, 2));
      
      // 🔴 扣除抽奖积分 - 先更新用户积分，再记录
      await User.decrement('total_points', {
        by: costPoints,
        where: { user_id: userId },
        transaction
      });
      
      // 获取更新后的用户积分
      const updatedUser = await User.findByPk(userId, { transaction });
      console.log(`🔍 调试 - updatedUser:`, updatedUser ? {
        user_id: updatedUser.user_id,
        total_points: updatedUser.total_points,
        type: typeof updatedUser.total_points
      } : 'null');
      
      const balanceAfterCost = updatedUser ? updatedUser.total_points : 0;
      console.log(`🔍 调试 - balanceAfterCost:`, balanceAfterCost, typeof balanceAfterCost);
      
      // 🔴 防护逻辑：确保balance_after不为null
      if (balanceAfterCost === null || balanceAfterCost === undefined) {
        console.error('❌ 用户积分为null，使用默认值0');
        throw new Error('用户积分计算错误');
      }

      await PointsRecord.createRecord({
        user_id: userId,
        points: -costPoints,
        description: `抽奖消费 - ${selectedPrize.name}${isPityTriggered ? ' (保底)' : ''}`,
        source: 'lottery',
        balance_after: balanceAfterCost,
        related_id: selectedPrize.id.toString()
      }, transaction);
      
      // 🔴 处理奖品发放
      let rewardPoints = 0;
      let rewardMessage = '';
      let finalBalance = balanceAfterCost;
      
      if (selectedPrize.type === 'points') {
        // 积分奖励直接发放
        rewardPoints = parseInt(selectedPrize.value);
        
        await User.increment('total_points', {
          by: rewardPoints,
          where: { user_id: userId },
          transaction
        });
        
        finalBalance = balanceAfterCost + rewardPoints;
        
        await PointsRecord.createRecord({
          user_id: userId,
          points: rewardPoints,
          description: `抽奖获得积分 - ${selectedPrize.name}`,
          source: 'lottery',
          balance_after: finalBalance,
          related_id: selectedPrize.id.toString()
        }, transaction);
        
        rewardMessage = `恭喜获得 ${rewardPoints} 积分！`;
        
      } else if (selectedPrize.type === 'coupon') {
        // 优惠券奖励
        rewardMessage = `恭喜获得${selectedPrize.name}！请到店使用`;
        if (isPityTriggered) {
          rewardMessage += ' (保底奖励)';
        }
        
      } else if (selectedPrize.type === 'physical') {
        // 实物奖励
        rewardMessage = `恭喜获得${selectedPrize.name}！请联系客服兑换`;
        
      } else if (selectedPrize.type === 'empty') {
        // 谢谢参与
        rewardMessage = '谢谢参与，下次再来哦！';
      }
      
      // 获取更新后的保底信息
      const updatedPityInfo = await LotteryPity.getUserPityInfo(userId);
      
      // 🔴 返回抽奖结果
      const drawResult = {
        success: true,
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          type: selectedPrize.type,
          value: selectedPrize.value,
          angle: selectedPrize.angle,
          color: selectedPrize.color
        },
        reward: {
          points: rewardPoints,
          message: rewardMessage
        },
        cost: {
          points: costPoints
        },
        user: {
          remainingPoints: finalBalance,
          todayDrawCount: todayDrawCount + 1,
          remainingDraws: dailyLimit - todayDrawCount - 1
        },
        pity: {
          isPityTriggered: isPityTriggered,
          currentCount: updatedPityInfo.current_count,
          remainingDraws: updatedPityInfo.remaining_draws,
          nextPityAt: updatedPityInfo.remaining_draws === 0 ? 0 : updatedPityInfo.remaining_draws
        },
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ 用户 ${userId} 抽奖完成:`, {
        prize: selectedPrize.name,
        costPoints,
        rewardPoints,
        remainingPoints: finalBalance,
        pityTriggered: isPityTriggered,
        pityRemaining: updatedPityInfo.remaining_draws
      });
      
      return drawResult;
      
    } catch (error) {
      console.error('❌ 抽奖执行失败:', error);
      throw error;
    }
  }
  
  /**
   * 🔴 抽奖概率计算核心算法
   * @param {Array} prizes - 奖品列表
   * @returns {Object} 选中的奖品
   */
  static calculateProbability(prizes) {
    try {
      // 🔴 构建概率区间
      let cumulativeProbability = 0;
      const probabilityRanges = prizes.map(prize => {
        const start = cumulativeProbability;
        cumulativeProbability += parseFloat(prize.probability);
        return {
          ...prize,
          start: start,
          end: cumulativeProbability
        };
      });
      
      // 🔴 生成随机数
      const random = Math.random();
      console.log(`🎲 随机数: ${random.toFixed(6)}`);
      
      // 🔴 查找命中的奖品
      for (const range of probabilityRanges) {
        if (random >= range.start && random < range.end) {
          console.log(`🎯 命中奖品: ${range.name} (概率区间: ${range.start.toFixed(6)} - ${range.end.toFixed(6)})`);
          return range;
        }
      }
      
      // 🔴 兜底处理：如果没有命中任何奖品，返回最后一个
      console.warn('⚠️ 抽奖算法兜底处理');
      return probabilityRanges[probabilityRanges.length - 1];
      
    } catch (error) {
      console.error('❌ 概率计算失败:', error);
      throw new BusinessLogicError('抽奖算法错误', 5003);
    }
  }
  
  /**
   * 🔴 获取用户抽奖统计
   * @param {number} userId - 用户ID
   * @param {number} days - 统计天数
   */
  static async getUserLotteryStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // 🔴 查询抽奖记录
      const drawRecords = await PointsRecord.findAll({
        where: {
          user_id: userId,
          source: 'lottery',
          type: 'spend',
          created_at: {
            [Op.gte]: startDate
          }
        },
        order: [['created_at', 'DESC']],
        limit: 100
      });
      
      // 🔴 查询奖励记录
      const rewardRecords = await PointsRecord.findAll({
        where: {
          user_id: userId,
          source: 'lottery',
          type: 'earn',
          created_at: {
            [Op.gte]: startDate
          }
        }
      });
      
      // 🔴 统计数据
      const totalDraws = drawRecords.length;
      const totalCost = drawRecords.reduce((sum, record) => sum + record.points, 0);
      const totalReward = rewardRecords.reduce((sum, record) => sum + record.points, 0);
      
      // 今日统计
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayDraws = drawRecords.filter(record => 
        new Date(record.created_at) >= today
      ).length;
      
      const dailyLimit = parseInt(process.env.DAILY_LOTTERY_LIMIT) || 10;
      
      return {
        period: `${days}天`,
        total: {
          draws: totalDraws,
          cost: totalCost,
          reward: totalReward,
          netGain: totalReward - totalCost
        },
        today: {
          draws: todayDraws,
          remaining: Math.max(0, dailyLimit - todayDraws)
        },
        average: {
          costPerDraw: totalDraws > 0 ? Math.round(totalCost / totalDraws) : 0,
          rewardPerDraw: totalDraws > 0 ? Math.round(totalReward / totalDraws) : 0
        },
        winRate: totalDraws > 0 ? ((rewardRecords.length / totalDraws) * 100).toFixed(1) : 0
      };
      
    } catch (error) {
      console.error('❌ 获取抽奖统计失败:', error);
      throw error;
    }
  }
  
  /**
   * 🔴 获取系统抽奖统计（管理员用）
   * @param {number} days - 统计天数
   */
  static async getSystemLotteryStats(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // 🔴 总体统计
      const [totalDraws, totalUsers, totalCost, totalReward] = await Promise.all([
        PointsRecord.count({
          where: {
            source: 'lottery',
            type: 'spend',
            created_at: { [Op.gte]: startDate }
          }
        }),
        
        PointsRecord.count({
          distinct: true,
          col: 'user_id',
          where: {
            source: 'lottery',
            type: 'spend',
            created_at: { [Op.gte]: startDate }
          }
        }),
        
        PointsRecord.sum('points', {
          where: {
            source: 'lottery',
            type: 'spend',
            created_at: { [Op.gte]: startDate }
          }
        }) || 0,
        
        PointsRecord.sum('points', {
          where: {
            source: 'lottery',
            type: 'earn',
            created_at: { [Op.gte]: startDate }
          }
        }) || 0
      ]);
      
      // 🔴 奖品分布统计
      const prizeDistribution = await sequelize.query(`
        SELECT 
          ls.prize_name,
          ls.prize_type,
          COUNT(pr.record_id) as draw_count,
          SUM(CASE WHEN pr.source = 'lottery' THEN pr.points ELSE 0 END) as total_reward
        FROM lottery_settings ls
        LEFT JOIN points_records pr ON pr.reference_id = ls.setting_id 
          AND pr.created_at >= :startDate
          AND pr.source IN ('lottery', 'lottery')
        WHERE ls.is_active = 1
        GROUP BY ls.setting_id, ls.prize_name, ls.prize_type
        ORDER BY draw_count DESC
      `, {
        replacements: { startDate },
        type: sequelize.QueryTypes.SELECT
      });
      
      return {
        period: `${days}天`,
        overview: {
          totalDraws,
          totalUsers,
          totalCost,
          totalReward,
          netPayout: totalReward - totalCost,
          avgDrawsPerUser: totalUsers > 0 ? Math.round(totalDraws / totalUsers) : 0,
          payoutRate: totalCost > 0 ? ((totalReward / totalCost) * 100).toFixed(1) : 0
        },
        prizeDistribution: prizeDistribution.map(item => ({
          prizeName: item.prize_name,
          prizeType: item.prize_type,
          drawCount: parseInt(item.draw_count) || 0,
          totalReward: parseInt(item.total_reward) || 0,
          avgReward: item.draw_count > 0 ? Math.round(item.total_reward / item.draw_count) : 0
        })),
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ 获取系统抽奖统计失败:', error);
      throw error;
    }
  }
  
  /**
   * 🔴 验证抽奖配置完整性
   */
  static async validateLotteryConfig() {
    try {
      const settings = await LotterySetting.findAll({
        where: { is_active: true }
      });
      
      const issues = [];
      
      // 检查是否有配置
      if (settings.length === 0) {
        issues.push('没有活跃的抽奖配置');
      }
      
      // 检查概率总和
      const totalProbability = settings.reduce((sum, item) => sum + parseFloat(item.probability), 0);
      if (Math.abs(totalProbability - 1.0) > 0.01) {
        issues.push(`概率总和异常: ${totalProbability}，应为1.0`);
      }
      
      // 检查角度重复
      const angles = settings.map(s => s.angle);
      const uniqueAngles = [...new Set(angles)];
      if (angles.length !== uniqueAngles.length) {
        issues.push('存在重复的角度设置');
      }
      
      return {
        isValid: issues.length === 0,
        issues,
        totalPrizes: settings.length,
        totalProbability
      };
      
    } catch (error) {
      console.error('❌ 验证抽奖配置失败:', error);
      throw error;
    }
  }
}

module.exports = LotteryService; 