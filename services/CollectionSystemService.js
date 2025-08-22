// services/CollectionSystemService.js
const { Op } = require('sequelize')
const EventBusService = require('./EventBusService')
const PointsSystemService = require('./PointsSystemService')
const TransactionService = require('./TransactionService')

/**
 * 基础收集系统服务
 * 实现收集册和碎片收集机制
 * 包含套装管理、稀有度系统、兑换机制
 */
class CollectionSystemService {
  constructor () {
    this.models = require('../models')
    this.eventBus = EventBusService
    this.points = PointsSystemService
    this.transaction = TransactionService

    // 稀有度配置
    this.rarityConfigs = {
      common: {
        name: '普通',
        color: '#808080',
        fragmentsRequired: 10,
        baseValue: 10,
        exchangeRate: 1.0
      },
      rare: {
        name: '稀有',
        color: '#4CAF50',
        fragmentsRequired: 25,
        baseValue: 50,
        exchangeRate: 1.2
      },
      epic: {
        name: '史诗',
        color: '#9C27B0',
        fragmentsRequired: 50,
        baseValue: 200,
        exchangeRate: 1.5
      },
      legendary: {
        name: '传说',
        color: '#FF9800',
        fragmentsRequired: 100,
        baseValue: 500,
        exchangeRate: 2.0
      },
      mythical: {
        name: '神话',
        color: '#F44336',
        fragmentsRequired: 200,
        baseValue: 1000,
        exchangeRate: 3.0
      }
    }

    // 收集册类别配置
    this.collectionCategories = {
      food: {
        name: '美食收集册',
        description: '收集各种餐厅美食，完成美食家之路',
        icon: 'food',
        totalItems: 50,
        unlockLevel: 1
      },
      chef: {
        name: '大厨收集册',
        description: '收集知名大厨签名和作品',
        icon: 'chef',
        totalItems: 20,
        unlockLevel: 5
      },
      equipment: {
        name: '厨具收集册',
        description: '收集各种珍稀厨具和餐具',
        icon: 'equipment',
        totalItems: 30,
        unlockLevel: 10
      },
      special: {
        name: '特殊收集册',
        description: '收集限定版和节日特殊物品',
        icon: 'special',
        totalItems: 15,
        unlockLevel: 15
      }
    }
  }

  /**
   * 获取用户收集进度
   */
  async getUserCollectionProgress (userId, category = null) {
    try {
      const whereClause = { user_id: userId }
      if (category) {
        whereClause.category = category
      }

      const [collections, fragments] = await Promise.all([
        this.models.UserCollection.findAll({
          where: whereClause,
          include: [{
            model: this.models.CollectionItem,
            as: 'item'
          }]
        }),
        this.models.UserFragment.findAll({
          where: whereClause,
          include: [{
            model: this.models.CollectionItem,
            as: 'item'
          }]
        })
      ])

      // 按类别分组统计
      const progressByCategory = {}

      for (const categoryKey in this.collectionCategories) {
        const categoryConfig = this.collectionCategories[categoryKey]
        const categoryCollections = collections.filter(c => c.category === categoryKey)
        const categoryFragments = fragments.filter(f => f.category === categoryKey)

        // 计算完成度
        const completedItems = categoryCollections.length
        const totalItems = categoryConfig.totalItems
        const completionRate = (completedItems / totalItems * 100).toFixed(1)

        // 统计碎片
        const fragmentStats = {}
        categoryFragments.forEach(fragment => {
          const itemId = fragment.item_id
          if (!fragmentStats[itemId]) {
            fragmentStats[itemId] = {
              itemId,
              itemName: fragment.item?.name || '未知物品',
              currentFragments: 0,
              requiredFragments: this.rarityConfigs[fragment.item?.rarity || 'common'].fragmentsRequired,
              canCombine: false
            }
          }
          fragmentStats[itemId].currentFragments += fragment.quantity
          fragmentStats[itemId].canCombine = fragmentStats[itemId].currentFragments >= fragmentStats[itemId].requiredFragments
        })

        progressByCategory[categoryKey] = {
          categoryName: categoryConfig.name,
          categoryIcon: categoryConfig.icon,
          completedItems,
          totalItems,
          completionRate: parseFloat(completionRate),
          unlockedAt: categoryConfig.unlockLevel,
          collections: categoryCollections.map(c => ({
            id: c.id,
            itemId: c.item_id,
            itemName: c.item?.name,
            rarity: c.item?.rarity,
            collectedAt: c.collected_at,
            collectionMethod: c.collection_method
          })),
          fragments: Object.values(fragmentStats),
          categoryStats: {
            totalFragments: categoryFragments.reduce((sum, f) => sum + f.quantity, 0),
            combinableItems: Object.values(fragmentStats).filter(f => f.canCombine).length
          }
        }
      }

      // 计算总体统计
      const overallStats = {
        totalCollected: collections.length,
        totalFragments: fragments.reduce((sum, f) => sum + f.quantity, 0),
        completionRate: (collections.length / Object.values(this.collectionCategories).reduce((sum, cat) => sum + cat.totalItems, 0) * 100).toFixed(1),
        categoriesUnlocked: Object.keys(progressByCategory).filter(key => progressByCategory[key].unlockedAt <= this.getUserLevel(userId)).length
      }

      return {
        success: true,
        overallStats,
        progressByCategory,
        recentCollections: collections.slice(-5).map(c => ({
          itemName: c.item?.name,
          category: c.category,
          rarity: c.item?.rarity,
          collectedAt: c.collected_at
        }))
      }
    } catch (error) {
      console.error('获取收集进度失败:', error)
      throw error
    }
  }

  /**
   * 添加碎片到用户库存
   */
  async addFragments (userId, itemId, quantity, source = 'lottery') {
    try {
      return await this.transaction.executeTransaction(async (transaction) => {
        // 验证物品存在
        const item = await this.models.CollectionItem.findByPk(itemId, { transaction })
        if (!item) {
          throw new Error('收集物品不存在')
        }

        // 检查用户是否已有该物品完整版本
        const existingCollection = await this.models.UserCollection.findOne({
          where: { user_id: userId, item_id: itemId },
          transaction
        })

        if (existingCollection) {
          // 已拥有完整物品，转换为积分奖励
          const rarityConfig = this.rarityConfigs[item.rarity]
          const pointsReward = Math.floor(quantity * rarityConfig.baseValue * 0.1)

          await this.points.addPoints(userId, pointsReward, {
            type: 'duplicate_fragment',
            description: `重复碎片转换 - ${item.name}`,
            related_id: itemId
          }, transaction)

          return {
            success: true,
            action: 'converted_to_points',
            item: {
              id: item.id,
              name: item.name,
              rarity: item.rarity
            },
            quantity,
            pointsAwarded: pointsReward,
            message: `已拥有${item.name}，${quantity}个碎片转换为${pointsReward}积分`
          }
        }

        // 查找或创建碎片记录
        let fragmentRecord = await this.models.UserFragment.findOne({
          where: { user_id: userId, item_id: itemId },
          transaction
        })

        if (fragmentRecord) {
          await fragmentRecord.update({
            quantity: fragmentRecord.quantity + quantity,
            last_obtained_at: new Date()
          }, { transaction })
        } else {
          fragmentRecord = await this.models.UserFragment.create({
            user_id: userId,
            item_id: itemId,
            category: item.category,
            quantity,
            obtained_source: source,
            last_obtained_at: new Date()
          }, { transaction })
        }

        // 检查是否可以合成完整物品
        const rarityConfig = this.rarityConfigs[item.rarity]
        const canCombine = fragmentRecord.quantity >= rarityConfig.fragmentsRequired

        // 记录碎片获取历史
        await this.models.FragmentObtainHistory.create({
          user_id: userId,
          item_id: itemId,
          quantity,
          source,
          obtained_at: new Date()
        }, { transaction })

        const result = {
          success: true,
          action: 'fragment_added',
          item: {
            id: item.id,
            name: item.name,
            rarity: item.rarity,
            category: item.category
          },
          currentFragments: fragmentRecord.quantity,
          requiredFragments: rarityConfig.fragmentsRequired,
          progress: (fragmentRecord.quantity / rarityConfig.fragmentsRequired * 100).toFixed(1),
          canCombine,
          message: `获得${item.name}碎片 x${quantity}`
        }

        // 如果可以合成，提供合成选项
        if (canCombine) {
          result.combineOptions = {
            available: true,
            excessFragments: fragmentRecord.quantity - rarityConfig.fragmentsRequired,
            message: `可以合成${item.name}！`
          }
        }

        return result
      })
    } catch (error) {
      console.error('添加碎片失败:', error)
      throw error
    }
  }

  /**
   * 合成完整收集品
   */
  async combineFragments (userId, itemId) {
    try {
      return await this.transaction.executeTransaction(async (transaction) => {
        // 验证物品和碎片
        const [item, fragmentRecord] = await Promise.all([
          this.models.CollectionItem.findByPk(itemId, { transaction }),
          this.models.UserFragment.findOne({
            where: { user_id: userId, item_id: itemId },
            transaction
          })
        ])

        if (!item) {
          throw new Error('收集物品不存在')
        }

        if (!fragmentRecord) {
          throw new Error('未拥有该物品的碎片')
        }

        const rarityConfig = this.rarityConfigs[item.rarity]

        if (fragmentRecord.quantity < rarityConfig.fragmentsRequired) {
          throw new Error(`碎片不足，需要${rarityConfig.fragmentsRequired}个，当前只有${fragmentRecord.quantity}个`)
        }

        // 检查是否已拥有完整物品
        const existingCollection = await this.models.UserCollection.findOne({
          where: { user_id: userId, item_id: itemId },
          transaction
        })

        if (existingCollection) {
          throw new Error('已拥有该收集品')
        }

        // 扣除碎片
        const remainingFragments = fragmentRecord.quantity - rarityConfig.fragmentsRequired
        if (remainingFragments > 0) {
          await fragmentRecord.update({
            quantity: remainingFragments
          }, { transaction })
        } else {
          await fragmentRecord.destroy({ transaction })
        }

        // 创建收集记录
        const collection = await this.models.UserCollection.create({
          user_id: userId,
          item_id: itemId,
          category: item.category,
          collection_method: 'fragment_combine',
          collected_at: new Date(),
          rarity: item.rarity
        }, { transaction })

        // 记录合成历史
        await this.models.CombineHistory.create({
          user_id: userId,
          item_id: itemId,
          fragments_used: rarityConfig.fragmentsRequired,
          remaining_fragments: remainingFragments,
          combined_at: new Date()
        }, { transaction })

        // 发放合成奖励
        const baseReward = rarityConfig.baseValue * rarityConfig.exchangeRate
        const bonusReward = Math.floor(baseReward * 0.5) // 50%奖励积分

        await this.points.addPoints(userId, bonusReward, {
          type: 'collection_combine',
          description: `合成收集品 - ${item.name}`,
          related_id: itemId
        }, transaction)

        // 检查是否完成套装
        const setBonus = await this.checkSetCompletion(userId, item.category, transaction)

        // 发送事件
        await this.eventBus.emit('collection_completed', {
          userId,
          itemId,
          itemName: item.name,
          rarity: item.rarity,
          category: item.category,
          method: 'fragment_combine',
          bonusReward,
          setBonus
        })

        return {
          success: true,
          collection: {
            id: collection.id,
            itemId: item.id,
            itemName: item.name,
            rarity: item.rarity,
            category: item.category
          },
          fragmentsUsed: rarityConfig.fragmentsRequired,
          remainingFragments,
          rewards: {
            points: bonusReward,
            setBonus
          },
          message: `成功合成${item.name}！获得${bonusReward}积分奖励`
        }
      })
    } catch (error) {
      console.error('合成收集品失败:', error)
      throw error
    }
  }

  /**
   * 直接添加收集品（从抽奖获得）
   */
  async addCollection (userId, itemId, method = 'lottery') {
    try {
      return await this.transaction.executeTransaction(async (transaction) => {
        const item = await this.models.CollectionItem.findByPk(itemId, { transaction })
        if (!item) {
          throw new Error('收集物品不存在')
        }

        // 检查是否已拥有
        const existing = await this.models.UserCollection.findOne({
          where: { user_id: userId, item_id: itemId },
          transaction
        })

        if (existing) {
          // 重复获得，转换为积分或碎片
          const rarityConfig = this.rarityConfigs[item.rarity]
          const pointsReward = Math.floor(rarityConfig.baseValue * 0.8)

          await this.points.addPoints(userId, pointsReward, {
            type: 'duplicate_collection',
            description: `重复收集品 - ${item.name}`,
            related_id: itemId
          }, transaction)

          return {
            success: true,
            action: 'duplicate_converted',
            item: {
              id: item.id,
              name: item.name,
              rarity: item.rarity
            },
            pointsAwarded: pointsReward,
            message: `已拥有${item.name}，转换为${pointsReward}积分`
          }
        }

        // 创建新收集记录
        const collection = await this.models.UserCollection.create({
          user_id: userId,
          item_id: itemId,
          category: item.category,
          collection_method: method,
          collected_at: new Date(),
          rarity: item.rarity
        }, { transaction })

        // 发放基础奖励
        const rarityConfig = this.rarityConfigs[item.rarity]
        const baseReward = Math.floor(rarityConfig.baseValue * 0.3)

        await this.points.addPoints(userId, baseReward, {
          type: 'new_collection',
          description: `新收集品 - ${item.name}`,
          related_id: itemId
        }, transaction)

        // 检查套装完成
        const setBonus = await this.checkSetCompletion(userId, item.category, transaction)

        // 发送事件
        await this.eventBus.emit('collection_completed', {
          userId,
          itemId,
          itemName: item.name,
          rarity: item.rarity,
          category: item.category,
          method,
          baseReward,
          setBonus
        })

        return {
          success: true,
          action: 'new_collection',
          collection: {
            id: collection.id,
            itemId: item.id,
            itemName: item.name,
            rarity: item.rarity,
            category: item.category
          },
          rewards: {
            points: baseReward,
            setBonus
          },
          message: `获得新收集品：${item.name}！`
        }
      })
    } catch (error) {
      console.error('添加收集品失败:', error)
      throw error
    }
  }

  /**
   * 获取收集品详情
   */
  async getCollectionItemDetails (itemId, userId = null) {
    try {
      const item = await this.models.CollectionItem.findByPk(itemId, {
        include: [{
          model: this.models.CollectionSet,
          as: 'set'
        }]
      })

      if (!item) {
        throw new Error('收集物品不存在')
      }

      const rarityConfig = this.rarityConfigs[item.rarity]
      let userStatus = null

      if (userId) {
        const [collection, fragments] = await Promise.all([
          this.models.UserCollection.findOne({
            where: { user_id: userId, item_id: itemId }
          }),
          this.models.UserFragment.findOne({
            where: { user_id: userId, item_id: itemId }
          })
        ])

        userStatus = {
          owned: !!collection,
          ownedAt: collection?.collected_at,
          fragments: fragments?.quantity || 0,
          requiredFragments: rarityConfig.fragmentsRequired,
          canCombine: fragments ? fragments.quantity >= rarityConfig.fragmentsRequired : false,
          progress: fragments ? (fragments.quantity / rarityConfig.fragmentsRequired * 100).toFixed(1) : 0
        }
      }

      return {
        success: true,
        item: {
          id: item.id,
          name: item.name,
          description: item.description,
          rarity: item.rarity,
          rarityConfig,
          category: item.category,
          imageUrl: item.image_url,
          setId: item.set_id,
          setName: item.set?.name,
          obtainMethods: item.obtain_methods,
          releaseDate: item.release_date,
          isLimited: item.is_limited
        },
        userStatus
      }
    } catch (error) {
      console.error('获取收集品详情失败:', error)
      throw error
    }
  }

  /**
   * 获取套装信息
   */
  async getCollectionSets (userId = null) {
    try {
      const sets = await this.models.CollectionSet.findAll({
        include: [{
          model: this.models.CollectionItem,
          as: 'items'
        }]
      })

      const setsWithProgress = await Promise.all(sets.map(async (set) => {
        let userProgress = null

        if (userId) {
          const userCollections = await this.models.UserCollection.findAll({
            where: {
              user_id: userId,
              item_id: { [Op.in]: set.items.map(item => item.id) }
            }
          })

          const completedItems = userCollections.length
          const totalItems = set.items.length
          const isCompleted = completedItems === totalItems

          userProgress = {
            completedItems,
            totalItems,
            completionRate: (completedItems / totalItems * 100).toFixed(1),
            isCompleted,
            completedAt: isCompleted ? Math.max(...userCollections.map(c => new Date(c.collected_at).getTime())) : null
          }
        }

        return {
          id: set.id,
          name: set.name,
          description: set.description,
          category: set.category,
          totalItems: set.items.length,
          bonusReward: set.bonus_reward,
          items: set.items.map(item => ({
            id: item.id,
            name: item.name,
            rarity: item.rarity,
            imageUrl: item.image_url
          })),
          userProgress
        }
      }))

      return {
        success: true,
        sets: setsWithProgress
      }
    } catch (error) {
      console.error('获取套装信息失败:', error)
      throw error
    }
  }

  // 私有辅助方法
  async checkSetCompletion (userId, category, transaction) {
    try {
      const sets = await this.models.CollectionSet.findAll({
        where: { category },
        include: [{
          model: this.models.CollectionItem,
          as: 'items'
        }],
        transaction
      })

      const completedSets = []

      for (const set of sets) {
        const userCollections = await this.models.UserCollection.findAll({
          where: {
            user_id: userId,
            item_id: { [Op.in]: set.items.map(item => item.id) }
          },
          transaction
        })

        if (userCollections.length === set.items.length) {
          // 检查是否已发放过套装奖励
          const existingBonus = await this.models.SetCompletionBonus.findOne({
            where: { user_id: userId, set_id: set.id },
            transaction
          })

          if (!existingBonus) {
            // 发放套装奖励
            await this.points.addPoints(userId, set.bonus_reward, {
              type: 'set_completion_bonus',
              description: `完成套装 - ${set.name}`,
              related_id: set.id
            }, transaction)

            await this.models.SetCompletionBonus.create({
              user_id: userId,
              set_id: set.id,
              bonus_points: set.bonus_reward,
              completed_at: new Date()
            }, { transaction })

            completedSets.push({
              setId: set.id,
              setName: set.name,
              bonusReward: set.bonus_reward
            })
          }
        }
      }

      return completedSets
    } catch (error) {
      console.error('检查套装完成失败:', error)
      return []
    }
  }

  async getUserLevel (userId) {
    // 简化的用户等级获取，实际应该从用户表或等级系统获取
    try {
      const user = await this.models.User.findByPk(userId)
      return user?.level || 1
    } catch (error) {
      return 1
    }
  }
}

module.exports = new CollectionSystemService()
