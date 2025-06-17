/**
 * 抽奖业务逻辑服务
 * 🔴 前端对接说明：
 * - 提供抽奖核心算法和业务逻辑
 * - 确保抽奖公平性和数据一致性
 * - 处理复杂的概率计算和奖品分配
 */

const { LotterySetting, PointsRecord, User, sequelize } = require('../models');
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
        where: { is_active: true },
        order: [['angle', 'ASC']],
        attributes: [
          'setting_id',
          'prize_name', 
          'prize_type',
          'prize_value',
          'angle',
          'color',
          'probability',
          'is_activity',
          'cost_points',
          'description'
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
        id: setting.setting_id,
        name: setting.prize_name,
        type: setting.prize_type,
        value: setting.prize_value,
        angle: setting.angle,
        color: setting.color,
        probability: setting.probability,
        isActivity: setting.is_activity,
        costPoints: setting.cost_points,
        description: setting.description
      }));
      
      // 🔴 系统配置
      const systemConfig = {
        costPoints: parseInt(process.env.LOTTERY_COST_POINTS) || 100,
        dailyLimit: parseInt(process.env.DAILY_LOTTERY_LIMIT) || 10,
        isEnabled: true
      };
      
      return {
        prizes,
        config: systemConfig,
        totalPrizes: prizes.length,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ 获取抽奖配置失败:', error);
      throw error;
    }
  }
  
  /**
   * 🔴 执行抽奖核心算法
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
          source: 'lottery_draw',
          change_type: 'spend',
          created_at: {
            [sequelize.Op.gte]: today
          }
        },
        transaction
      });
      
      const dailyLimit = parseInt(process.env.DAILY_LOTTERY_LIMIT) || 10;
      if (todayDrawCount >= dailyLimit) {
        throw new BusinessLogicError(`今日抽奖次数已达上限 ${dailyLimit} 次`, 3003);
      }
      
      // 🔴 获取抽奖配置
      const lotteryConfig = await this.getFrontendConfig();
      const prizes = lotteryConfig.prizes;
      
      // 🔴 执行抽奖算法
      const selectedPrize = this.calculateProbability(prizes);
      console.log(`🎰 用户 ${userId} 抽奖结果:`, selectedPrize.name);
      
      // 🔴 扣除抽奖积分
      await PointsRecord.create({
        user_id: userId,
        points: costPoints,
        change_type: 'spend',
        source: 'lottery_draw',
        description: `抽奖消费 - ${selectedPrize.name}`,
        reference_id: selectedPrize.id,
        created_at: new Date()
      }, { transaction });
      
      // 更新用户积分
      await User.decrement('total_points', {
        by: costPoints,
        where: { user_id: userId },
        transaction
      });
      
      await User.increment('used_points', {
        by: costPoints,
        where: { user_id: userId },
        transaction
      });
      
      // 🔴 处理奖品发放
      let rewardPoints = 0;
      let rewardMessage = '';
      
      if (selectedPrize.type === 'points') {
        // 积分奖励直接发放
        rewardPoints = selectedPrize.value;
        
        await PointsRecord.create({
          user_id: userId,
          points: rewardPoints,
          change_type: 'earn',
          source: 'lottery_reward',
          description: `抽奖获得积分 - ${selectedPrize.name}`,
          reference_id: selectedPrize.id,
          created_at: new Date()
        }, { transaction });
        
        await User.increment('total_points', {
          by: rewardPoints,
          where: { user_id: userId },
          transaction
        });
        
        rewardMessage = `恭喜获得 ${rewardPoints} 积分！`;
        
      } else if (selectedPrize.type === 'coupon') {
        // 优惠券奖励（这里可以扩展优惠券系统）
        rewardMessage = `恭喜获得${selectedPrize.name}！请到店使用`;
        
      } else if (selectedPrize.type === 'physical') {
        // 实物奖励（需要后续兑换流程）
        rewardMessage = `恭喜获得${selectedPrize.name}！请联系客服兑换`;
        
      } else if (selectedPrize.type === 'empty') {
        // 谢谢参与
        rewardMessage = '谢谢参与，下次再来哦！';
      }
      
      // 🔴 返回抽奖结果
      const drawResult = {
        success: true,
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          type: selectedPrize.type,
          value: selectedPrize.value,
          angle: selectedPrize.angle,
          color: selectedPrize.color,
          description: selectedPrize.description
        },
        reward: {
          points: rewardPoints,
          message: rewardMessage
        },
        cost: {
          points: costPoints
        },
        user: {
          remainingPoints: user.total_points - costPoints + rewardPoints,
          todayDrawCount: todayDrawCount + 1,
          remainingDraws: dailyLimit - todayDrawCount - 1
        },
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ 用户 ${userId} 抽奖完成:`, {
        prize: selectedPrize.name,
        costPoints,
        rewardPoints,
        remainingPoints: drawResult.user.remainingPoints
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
          source: 'lottery_draw',
          change_type: 'spend',
          created_at: {
            [sequelize.Op.gte]: startDate
          }
        },
        order: [['created_at', 'DESC']],
        limit: 100
      });
      
      // 🔴 查询奖励记录
      const rewardRecords = await PointsRecord.findAll({
        where: {
          user_id: userId,
          source: 'lottery_reward',
          change_type: 'earn',
          created_at: {
            [sequelize.Op.gte]: startDate
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
            source: 'lottery_draw',
            change_type: 'spend',
            created_at: { [sequelize.Op.gte]: startDate }
          }
        }),
        
        PointsRecord.count({
          distinct: true,
          col: 'user_id',
          where: {
            source: 'lottery_draw',
            change_type: 'spend',
            created_at: { [sequelize.Op.gte]: startDate }
          }
        }),
        
        PointsRecord.sum('points', {
          where: {
            source: 'lottery_draw',
            change_type: 'spend',
            created_at: { [sequelize.Op.gte]: startDate }
          }
        }) || 0,
        
        PointsRecord.sum('points', {
          where: {
            source: 'lottery_reward',
            change_type: 'earn',
            created_at: { [sequelize.Op.gte]: startDate }
          }
        }) || 0
      ]);
      
      // 🔴 奖品分布统计
      const prizeDistribution = await sequelize.query(`
        SELECT 
          ls.prize_name,
          ls.prize_type,
          COUNT(pr.record_id) as draw_count,
          SUM(CASE WHEN pr.source = 'lottery_reward' THEN pr.points ELSE 0 END) as total_reward
        FROM lottery_settings ls
        LEFT JOIN points_records pr ON pr.reference_id = ls.setting_id 
          AND pr.created_at >= :startDate
          AND pr.source IN ('lottery_draw', 'lottery_reward')
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