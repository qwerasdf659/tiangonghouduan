/**
 * 餐厅积分抽奖系统 v3.0 - 库存管理服务
 * 处理用户库存物品的管理和操作
 * 创建时间：2025年01月28日
 */

const { Op } = require('sequelize')
const { UserInventory, User, sequelize } = require('../models')
const moment = require('moment')
const crypto = require('crypto')

class InventoryService {
  constructor () {
    console.log('🏪 库存管理服务初始化完成')
  }

  /**
   * 获取用户库存列表
   */
  async getUserInventoryList (userId, options = {}) {
    try {
      const {
        page = 1,
        pageSize = 20,
        category = '',
        status = '',
        keyword = '',
        sortBy = 'newest'
      } = options

      // 构建查询条件
      const whereCondition = {
        user_id: userId
      }

      // 分类筛选
      if (category && category !== '') {
        whereCondition.type = category
      }

      // 状态筛选
      if (status && status !== '') {
        whereCondition.status = status
      }

      // 关键词搜索
      if (keyword) {
        whereCondition[Op.or] = [
          { name: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } }
        ]
      }

      // 排序配置
      let orderConfig = []
      switch (sortBy) {
      case 'newest':
        orderConfig = [['acquired_at', 'DESC']]
        break
      case 'oldest':
        orderConfig = [['acquired_at', 'ASC']]
        break
      case 'value_high':
        orderConfig = [['value', 'DESC']]
        break
      case 'value_low':
        orderConfig = [['value', 'ASC']]
        break
      case 'expire_soon':
        orderConfig = [
          [sequelize.literal('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END'), 'ASC'],
          ['expires_at', 'ASC']
        ]
        break
      default:
        orderConfig = [['acquired_at', 'DESC']]
      }

      // 分页查询
      const offset = (page - 1) * pageSize
      const { count, rows } = await UserInventory.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: User,
            as: 'transferTarget',
            attributes: ['user_id', 'mobile', 'nickname'],
            required: false
          }
        ],
        order: orderConfig,
        limit: pageSize,
        offset,
        distinct: true
      })

      // 处理数据格式，添加可执行操作
      const items = rows.map(item => {
        const actions = this.getAvailableActions(item)
        const remainingTime = this.formatTimeRemaining(item)

        return {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          value: item.value,
          status: item.status,
          acquiredAt: moment(item.acquired_at).format('YYYY-MM-DD HH:mm:ss'),
          expiresAt: item.expires_at ? moment(item.expires_at).format('YYYY-MM-DD HH:mm:ss') : null,
          sourceType: item.source_type,
          icon: item.icon || this.getDefaultIcon(item.type),
          verificationCode: item.verification_code,
          usedAt: item.used_at ? moment(item.used_at).format('YYYY-MM-DD HH:mm:ss') : null,
          actions,
          remainingTime,
          transferTarget: item.transferTarget
            ? {
              userId: item.transferTarget.user_id,
              mobile: item.transferTarget.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
              nickname: item.transferTarget.nickname
            }
            : null
        }
      })

      // 计算统计信息
      const totalValue = await this.calculateTotalValue(userId)
      const categoryStats = await this.getCategoryStats(userId)

      return {
        items,
        pagination: {
          currentPage: page,
          pageSize,
          totalItems: count,
          totalPages: Math.ceil(count / pageSize),
          hasNext: page < Math.ceil(count / pageSize),
          hasPrev: page > 1
        },
        totalValue,
        categoryStats
      }
    } catch (error) {
      console.error('❌ 获取用户库存列表失败:', error.message)
      throw new Error('获取库存列表失败')
    }
  }

  /**
   * 使用库存物品
   */
  async useInventoryItem (userId, itemId) {
    const transaction = await sequelize.transaction()

    try {
      // 查找库存物品
      const item = await UserInventory.findOne({
        where: {
          id: itemId,
          user_id: userId
        },
        transaction
      })

      if (!item) {
        throw new Error('库存物品不存在')
      }

      // 检查是否可使用
      if (item.status !== 'available') {
        throw new Error('物品状态不可用')
      }

      if (item.expires_at && new Date() > item.expires_at) {
        throw new Error('物品已过期')
      }

      // 更新物品状态
      await item.update(
        {
          status: 'used',
          used_at: new Date()
        },
        { transaction }
      )

      await transaction.commit()

      return {
        itemId,
        usedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
        effect: this.getUseEffect(item)
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 使用库存物品失败:', error.message)
      throw error
    }
  }

  /**
   * 转让库存物品
   */
  async transferInventoryItem (userId, itemId, targetUserId, message = '') {
    const transaction = await sequelize.transaction()

    try {
      // 查找库存物品
      const item = await UserInventory.findOne({
        where: {
          id: itemId,
          user_id: userId
        },
        transaction
      })

      if (!item) {
        throw new Error('库存物品不存在')
      }

      // 检查是否可转让
      if (item.status !== 'available') {
        throw new Error('物品状态不可转让')
      }

      if (item.expires_at && new Date() > item.expires_at) {
        throw new Error('物品已过期')
      }

      // 检查目标用户是否存在
      const targetUser = await User.findByPk(targetUserId, { transaction })
      if (!targetUser) {
        throw new Error('目标用户不存在')
      }

      // 创建新的库存记录给目标用户
      const transferId = crypto.randomUUID().replace(/-/g, '').substring(0, 12)
      await UserInventory.create(
        {
          id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user_id: targetUserId,
          name: item.name,
          description: item.description,
          type: item.type,
          value: item.value,
          status: 'available',
          source_type: '用户转让',
          source_id: item.id,
          acquired_at: new Date(),
          expires_at: item.expires_at,
          icon: item.icon,
          metadata: {
            ...item.metadata,
            transferFromUserId: userId,
            transferMessage: message,
            originalItemId: item.id
          }
        },
        { transaction }
      )

      // 更新原物品状态
      await item.update(
        {
          status: 'transferred',
          transfer_to_user_id: targetUserId,
          transfer_at: new Date(),
          transfer_message: message
        },
        { transaction }
      )

      await transaction.commit()

      return {
        transferId,
        itemId,
        targetUserId,
        transferAt: moment().format('YYYY-MM-DD HH:mm:ss')
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 转让库存物品失败:', error.message)
      throw error
    }
  }

  /**
   * 生成核销码
   */
  async generateVerificationCode (userId, itemId) {
    const transaction = await sequelize.transaction()

    try {
      // 查找库存物品
      const item = await UserInventory.findOne({
        where: {
          id: itemId,
          user_id: userId
        },
        transaction
      })

      if (!item) {
        throw new Error('库存物品不存在')
      }

      // 检查是否可生成核销码
      if (item.status !== 'available') {
        throw new Error('物品状态不支持生成核销码')
      }

      // 生成唯一核销码
      let verificationCode
      let isUnique = false
      while (!isUnique) {
        verificationCode = 'VX' + moment().format('YYMMDDHHmm')
        const existing = await UserInventory.findOne({
          where: { verification_code: verificationCode }
        })
        isUnique = !existing
        if (!isUnique) {
          verificationCode += Math.floor(Math.random() * 100)
        }
      }

      // 更新物品核销码
      const expiresAt = moment().add(24, 'hours').toDate()
      await item.update(
        {
          verification_code: verificationCode,
          verification_expires_at: expiresAt
        },
        { transaction }
      )

      await transaction.commit()

      return {
        verificationCode,
        expiresAt: moment(expiresAt).format('YYYY-MM-DD HH:mm:ss'),
        itemId
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 生成核销码失败:', error.message)
      throw error
    }
  }

  /**
   * 添加库存物品（系统内部使用）
   */
  async addInventoryItem (userId, itemData) {
    try {
      const itemId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const item = await UserInventory.create({
        id: itemId,
        user_id: userId,
        name: itemData.name,
        description: itemData.description,
        type: itemData.type,
        value: itemData.value,
        source_type: itemData.source_type,
        source_id: itemData.source_id,
        acquired_at: new Date(),
        expires_at: itemData.expires_at,
        icon: itemData.icon,
        metadata: itemData.metadata
      })

      return item
    } catch (error) {
      console.error('❌ 添加库存物品失败:', error.message)
      throw new Error('添加库存物品失败')
    }
  }

  /**
   * 获取可执行操作
   */
  getAvailableActions (item) {
    const actions = []

    if (item.status === 'available' && !item.isExpired()) {
      // 可使用
      actions.push('use')

      // 可转让（部分物品类型支持）
      if (['voucher', 'product'].includes(item.type)) {
        actions.push('transfer')
      }

      // 可生成核销码（针对优惠券类型）
      if (item.type === 'voucher' && !item.verification_code) {
        actions.push('generate_code')
      }
    }

    return actions
  }

  /**
   * 格式化剩余时间
   */
  formatTimeRemaining (item) {
    if (!item.expires_at) {
      return null
    }

    const now = moment()
    const expires = moment(item.expires_at)
    const diff = expires.diff(now)

    if (diff <= 0) {
      return '已过期'
    }

    const duration = moment.duration(diff)
    const days = Math.floor(duration.asDays())
    const hours = duration.hours()
    const minutes = duration.minutes()

    if (days > 0) {
      return `${days}天${hours}小时${minutes}分钟`
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  }

  /**
   * 获取默认图标
   */
  getDefaultIcon (type) {
    const iconMap = {
      voucher: '🎫',
      product: '🎁',
      service: '⚡'
    }
    return iconMap[type] || '📦'
  }

  /**
   * 获取使用效果描述
   */
  getUseEffect (item) {
    switch (item.type) {
    case 'voucher':
      return `使用了${item.name}优惠券`
    case 'product':
      return `领取了${item.name}`
    case 'service':
      return `激活了${item.name}服务`
    default:
      return `使用了${item.name}`
    }
  }

  /**
   * 计算库存总价值
   */
  async calculateTotalValue (userId) {
    try {
      const result = await UserInventory.sum('value', {
        where: {
          user_id: userId,
          status: 'available'
        }
      })
      return result || 0
    } catch (error) {
      console.error('❌ 计算库存总价值失败:', error.message)
      return 0
    }
  }

  /**
   * 获取分类统计
   */
  async getCategoryStats (userId) {
    try {
      const stats = await UserInventory.findAll({
        where: {
          user_id: userId,
          status: 'available'
        },
        attributes: ['type', [sequelize.fn('COUNT', '*'), 'count']],
        group: ['type']
      })

      const categoryStats = {
        total: 0,
        voucher: 0,
        product: 0,
        service: 0
      }

      stats.forEach(stat => {
        const count = parseInt(stat.dataValues.count)
        categoryStats[stat.type] = count
        categoryStats.total += count
      })

      return categoryStats
    } catch (error) {
      console.error('❌ 获取分类统计失败:', error.message)
      return {
        total: 0,
        voucher: 0,
        product: 0,
        service: 0
      }
    }
  }
}

module.exports = InventoryService
