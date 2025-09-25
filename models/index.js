/**
 * 餐厅积分抽奖系统 V4.0 - 模型统一导出（V14.1合并优化版）
 * 清理了无效的模型引用，只保留实际存在的模型
 * V14.1更新：ImageResources和UploadReview合并为统一资源管理模型
 */

const { Sequelize, DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 初始化模型对象
const models = {}

// 🔴 导入所有实际存在的数据模型
models.User = require('./User')(sequelize, DataTypes)
// V4.1优化：AdminUser模型已删除，权限管理简化到User.is_admin字段
models.UserSession = require('./UserSession')(sequelize, DataTypes)
// ✅ LoginLog模型已删除 - 过度设计，改用User.last_login字段统计活跃用户 - 2025年09月22日

// 🔴 积分和账户系统模型
models.UserPointsAccount = require('./UserPointsAccount')(sequelize, DataTypes)
models.PointsTransaction = require('./PointsTransaction')(sequelize, DataTypes)
// ⚠️ PointsRecord.js 已被 PointsTransaction.js 替代并删除

// 🔴 抽奖系统核心模型
models.LotteryCampaign = require('./LotteryCampaign')(sequelize, DataTypes)
models.LotteryPrize = require('./LotteryPrize')(sequelize, DataTypes)
models.LotteryDraw = require('./LotteryDraw')(sequelize, DataTypes)
// 🔥 LotteryRecord 已完全合并到 LotteryDraw，不保留向后兼容性 - 2025年01月21日
models.LotteryPity = require('./LotteryPity')(sequelize, DataTypes)
models.LotteryPreset = require('./LotteryPreset')(sequelize, DataTypes)
// 🗑️ UserSpecificPrizeQueue模型已删除 - 功能过于复杂，实际业务中未使用 - 2025年09月22日

// 🔴 业务功能模型
// 🗑️ models.BusinessEvent模型已删除 - 过度设计，使用现有业务记录模型替代 - 2025年01月21日
// 🗑️ models.BusinessConfigs模型已删除 - 使用硬编码10%概率替代 - 2025年01月21日
models.Product = require('./Product')(sequelize, DataTypes)
models.UserInventory = require('./UserInventory')(sequelize, DataTypes)
models.TradeRecord = require('./TradeRecord')(sequelize, DataTypes)

// 🔴 管理和客服系统
models.CustomerSession = require('./CustomerSession')(sequelize, DataTypes)
models.ChatMessage = require('./ChatMessage')(sequelize, DataTypes)

// 🔴 图片和存储系统
models.ImageResources = require('./ImageResources')(sequelize, DataTypes)
// 🔥 V14.1合并优化：UploadReview模型已合并到ImageResources统一资源管理模型

// 🔴 任务系统模型已移除 - 与抽奖系统无关
// 已删除：TaskTemplate, UserTask, TaskProgressLog, ScheduledTask

// 🔴 多池系统模型 - 已删除
// 多池配置模型已删除 - 使用简化三策略系统
// UserPoolAccess模型已删除 - 功能合并到User表的pool_access_level字段 (2025年09月22日)

// 🔴 兑换记录系统模型
models.ExchangeRecords = require('./ExchangeRecords')(sequelize, DataTypes)

// 🔴 统一决策引擎V4.0模型
// 🗑️ models.DecisionRecord模型已删除 - 过度设计，餐厅抽奖系统不需要决策过程分析 - 2025年01月21日
// ⚠️ 临时禁用 ProbabilityLog 模型 - 2025年01月21日
// models.ProbabilityLog = require('./unified/ProbabilityLog')(sequelize, DataTypes)
// ⚠️ 删除 SystemMetrics 模型 - 过度设计，不符合业务需求 - 2025年01月21日
// models.SystemMetrics = require('./unified/SystemMetrics')(sequelize, DataTypes)

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
  '✅ V14.1 Models loaded:',
  Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length,
  'models (ImageResources+UploadReview合并优化后)'
)

module.exports = models
