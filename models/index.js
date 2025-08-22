/**
 * 餐厅积分抽奖系统 V3.0 - 模型统一导出
 * 基于实际代码分析的模型管理
 */

const { Sequelize, DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

// 初始化模型对象
const models = {}

// 🔴 导入所有数据模型 - 基于现有项目结构
models.User = require('./User')(sequelize, DataTypes)
models.AdminUser = require('./AdminUser')(sequelize, DataTypes)
models.UserSession = require('./UserSession')(sequelize, DataTypes)
models.LoginLog = require('./LoginLog')(sequelize, DataTypes)

// 🔴 积分和账户系统模型
models.UserPointsAccount = require('./UserPointsAccount')(sequelize, DataTypes)
models.PointsTransaction = require('./PointsTransaction')(sequelize, DataTypes)

// 🔴 抽奖系统核心模型
models.LotteryCampaign = require('./LotteryCampaign')(sequelize, DataTypes)
models.LotteryPrize = require('./LotteryPrize')(sequelize, DataTypes)
models.LotteryDraw = require('./LotteryDraw')(sequelize, DataTypes)

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
models.PremiumSpaceAccess = require('./PremiumSpaceAccess')(sequelize, DataTypes)

// 🔴 社交抽奖系统模型 (新增 v3.0)
models.SocialLotteryCampaign = require('./SocialLotteryCampaign')(sequelize, DataTypes)
models.SocialLotteryTeam = require('./SocialLotteryTeam')(sequelize, DataTypes)
models.SocialLotteryMember = require('./SocialLotteryMember')(sequelize, DataTypes)

// 🔴 任务系统模型 (新增 v3.0)
models.TaskTemplate = require('./TaskTemplate')(sequelize, DataTypes)
models.UserTask = require('./UserTask')(sequelize, DataTypes)
models.TaskProgressLog = require('./TaskProgressLog')(sequelize, DataTypes)
models.ScheduledTask = require('./ScheduledTask')(sequelize, DataTypes)

// 🔴 VIP系统增强模型 (新增 v3.0)
models.VipBenefitUsage = require('./VipBenefitUsage')(sequelize, DataTypes)

// 🔴 多池系统增强模型 (新增 v3.0)
models.LotteryPoolConfig = require('./LotteryPoolConfig')(sequelize, DataTypes)
models.UserPoolAccess = require('./UserPoolAccess')(sequelize, DataTypes)

// 🔴 高级合成系统模型 (新增 v3.0)
models.SynthesisRecipe = require('./SynthesisRecipe')(sequelize, DataTypes)
models.SynthesisHistory = require('./SynthesisHistory')(sequelize, DataTypes)

// 🔴 设置模型关联关系
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models)
  }
})

// 🔴 导出sequelize实例和所有模型
models.sequelize = sequelize
models.Sequelize = Sequelize

console.log('✅ Models loaded:', Object.keys(models).filter(key => key !== 'sequelize' && key !== 'Sequelize').length, 'models')

module.exports = models
