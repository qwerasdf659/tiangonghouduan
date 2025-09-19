/**
 * 餐厅积分抽奖系统 V4.0 - 模型统一导出（清理版）
 * 清理了无效的模型引用，只保留实际存在的模型
 */

const { Sequelize, DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 初始化模型对象
const models = {}

// 🔴 导入所有实际存在的数据模型
models.User = require('./User')(sequelize, DataTypes)
models.AdminUser = require('./AdminUser')(sequelize, DataTypes)
models.UserSession = require('./UserSession')(sequelize, DataTypes)
models.LoginLog = require('./LoginLog')(sequelize, DataTypes)

// 🔴 积分和账户系统模型
models.UserPointsAccount = require('./UserPointsAccount')(sequelize, DataTypes)
models.PointsTransaction = require('./PointsTransaction')(sequelize, DataTypes)
// ⚠️ PointsRecord.js 已被 PointsTransaction.js 替代并删除

// 🔴 抽奖系统核心模型
models.LotteryCampaign = require('./LotteryCampaign')(sequelize, DataTypes)
models.LotteryPrize = require('./LotteryPrize')(sequelize, DataTypes)
models.LotteryDraw = require('./LotteryDraw')(sequelize, DataTypes)
models.LotteryRecord = require('./LotteryRecord')(sequelize, DataTypes)
models.LotteryPity = require('./LotteryPity')(sequelize, DataTypes)
models.PrizeDistribution = require('./PrizeDistribution')(sequelize, DataTypes)
// 🎯 用户特定奖品队列模型（支持管理员预设奖品）
models.UserSpecificPrizeQueue = require('./UserSpecificPrizeQueue')(sequelize, DataTypes)

// 🔴 业务功能模型
models.BusinessEvent = require('./BusinessEvent')(sequelize, DataTypes)
models.BusinessConfigs = require('./BusinessConfigs')(sequelize, DataTypes)
models.Product = require('./Product')(sequelize, DataTypes)
models.UserInventory = require('./UserInventory')(sequelize, DataTypes)
models.TradeRecord = require('./TradeRecord')(sequelize, DataTypes)

// 🔴 管理和客服系统
models.AdminStatus = require('./AdminStatus')(sequelize, DataTypes)
models.CustomerSession = require('./CustomerSession')(sequelize, DataTypes)
models.ChatMessage = require('./ChatMessage')(sequelize, DataTypes)
models.QuickReply = require('./QuickReply')(sequelize, DataTypes)

// 🔴 图片和存储系统
models.ImageResources = require('./ImageResources')(sequelize, DataTypes)
models.UploadReview = require('./UploadReview')(sequelize, DataTypes)

// 🔴 任务系统模型
models.TaskTemplate = require('./TaskTemplate')(sequelize, DataTypes)
models.UserTask = require('./UserTask')(sequelize, DataTypes)
models.TaskProgressLog = require('./TaskProgressLog')(sequelize, DataTypes)
models.ScheduledTask = require('./ScheduledTask')(sequelize, DataTypes)

// 🔴 多池系统模型
// 多池配置模型已删除 - 使用简化三策略系统
models.UserPoolAccess = require('./UserPoolAccess')(sequelize, DataTypes)

// 🔴 兑换记录系统模型
models.ExchangeRecords = require('./ExchangeRecords')(sequelize, DataTypes)

// 🔴 统一决策引擎V4.0模型
models.DecisionRecord = require('./unified/DecisionRecord')(sequelize, DataTypes)
models.ProbabilityLog = require('./unified/ProbabilityLog')(sequelize, DataTypes)
models.SystemMetrics = require('./unified/SystemMetrics')(sequelize, DataTypes)

// 🔴 设置模型关联关系
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models)
  }
})

// 🔴 导出sequelize实例和所有模型
models.sequelize = sequelize
models.Sequelize = Sequelize

console.log(
  '✅ V4 Models loaded:',
  Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length,
  'models (清理后)'
)

module.exports = models
