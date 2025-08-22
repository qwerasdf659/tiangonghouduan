/**
 * 餐厅积分抽奖系统 v3.0 - 高级合成系统服务
 * 实现复杂的道具合成逻辑和游戏化增强功能
 * 创建时间：2025年08月22日
 */

const { Op } = require('sequelize')
const { sequelize } = require('../models')
const EventBusService = require('./EventBusService')
const PointsSystemService = require('./PointsSystemService')
const VIPSystemService = require('./VIPSystemService')
const InventoryService = require('./InventoryService')
const { v4: uuidv4 } = require('uuid')
const crypto = require('crypto')

/**
 * 高级合成系统核心服务
 * 提供道具合成、配方管理、经验系统等功能
 */
class AdvancedSynthesisService {
  constructor () {
    this.models = require('../models')
    this.eventBus = EventBusService
    this.pointsService = PointsSystemService
    this.vipService = VIPSystemService
    this.inventoryService = InventoryService

    // 合成经验配置
    this.experienceConfig = {
      baseExperience: 10,
      successMultiplier: 1.0,
      failureMultiplier: 0.3,
      criticalMultiplier: 2.0,
      levelRequirement: [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500],
      maxLevel: 10
    }

    // 合成加成配置
    this.bonusConfig = {
      vipBonus: {
        1: 0.05,
        2: 0.10,
        3: 0.15
      },
      levelBonus: 0.01, // 每级1%
      eventBonus: 0.20, // 活动期间20%
      criticalChance: {
        base: 5,
        vipBonus: 2,
        levelBonus: 0.5
      }
    }

    console.log('✅ 高级合成系统Service初始化完成')
  }

  /**
   * 获取用户合成信息
   * @param {number} userId - 用户ID
   * @returns {Object} 用户合成信息
   */
  async getUserSynthesisProfile (userId) {
    try {
      // 获取用户基础信息
      const user = await this.models.User.findByPk(userId)
      if (!user) {
        return {
          success: false,
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        }
      }

      // 获取VIP信息
      const vipStatus = await this.vipService.getUserVIPStatus(userId)

      // 计算合成等级和经验
      const synthesisTotalExp = user.synthesis_experience || 0
      const synthesisLevel = this.calculateLevel(synthesisTotalExp)
      const levelProgress = this.calculateLevelProgress(synthesisTotalExp, synthesisLevel)

      // 获取合成统计
      const stats = await this.models.SynthesisHistory.getUserSynthesisStats(userId, 30)

      // 获取可用配方
      const availableRecipes = await this.getAvailableRecipes(userId)

      return {
        success: true,
        data: {
          userId,
          synthesisLevel,
          totalExperience: synthesisTotalExp,
          levelProgress,
          vipLevel: vipStatus.success ? vipStatus.data.level : 0,
          statistics: stats,
          availableRecipes: availableRecipes.length,
          totalRecipes: await this.models.SynthesisRecipe.count({ where: { status: 'active' } })
        },
        message: '用户合成信息获取成功'
      }
    } catch (error) {
      console.error('获取用户合成信息失败:', error)
      return {
        success: false,
        error: 'GET_PROFILE_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 获取可用合成配方列表
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 配方列表
   */
  async getAvailableRecipes (userId, options = {}) {
    try {
      const {
        category = null,
        minLevel = null,
        maxLevel = null,
        sortBy = 'sort_order',
        sortOrder = 'ASC',
        limit = 50,
        offset = 0
      } = options

      // 获取用户信息
      const userProfile = await this.getUserSynthesisProfile(userId)
      if (!userProfile.success) {
        return userProfile
      }

      const userSynthesisLevel = userProfile.data.synthesisLevel
      const userVipLevel = userProfile.data.vipLevel

      // 构建查询条件
      const whereConditions = {
        status: 'active',
        required_level: {
          [Op.lte]: userSynthesisLevel
        }
      }

      if (category) {
        whereConditions.category = category
      }

      if (minLevel !== null) {
        whereConditions.required_level[Op.gte] = minLevel
      }

      if (maxLevel !== null) {
        whereConditions.required_level[Op.lte] = maxLevel
      }

      // 查询配方
      const recipes = await this.models.SynthesisRecipe.findAndCountAll({
        where: whereConditions,
        order: [[sortBy, sortOrder], ['recipe_id', 'ASC']],
        limit,
        offset
      })

      // 过滤解锁状态并添加额外信息
      const enrichedRecipes = []
      for (const recipe of recipes.rows) {
        const recipeData = recipe.toJSON()

        // 检查解锁状态
        const isUnlocked = recipe.isUnlocked({ vip_level: userVipLevel, level: userSynthesisLevel })
        if (!isUnlocked) continue

        // 计算成功率
        const successRate = recipe.calculateSuccessRate(userSynthesisLevel, {
          vip_level: userVipLevel,
          synthesis_bonus: this.bonusConfig.levelBonus * userSynthesisLevel
        })

        // 获取合成历史（检查冷却等）
        const history = await this.models.SynthesisHistory.findAll({
          where: { user_id: userId, recipe_id: recipe.recipe_id },
          order: [['created_at', 'DESC']],
          limit: 10
        })

        const canSynthesize = recipe.canSynthesize({ synthesis_level: userSynthesisLevel }, history)

        enrichedRecipes.push({
          ...recipeData,
          calculated_success_rate: successRate,
          can_synthesize: canSynthesize.can,
          synthesis_restriction_reason: canSynthesize.reason || null,
          user_usage_count: history.length,
          last_synthesis_at: history[0] ? history[0].created_at : null
        })
      }

      return {
        success: true,
        data: {
          recipes: enrichedRecipes,
          total: enrichedRecipes.length,
          pagination: {
            limit,
            offset,
            total: recipes.count
          }
        },
        message: '配方列表获取成功'
      }
    } catch (error) {
      console.error('获取配方列表失败:', error)
      return {
        success: false,
        error: 'GET_RECIPES_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 执行道具合成
   * @param {number} userId - 用户ID
   * @param {string} recipeId - 配方ID
   * @param {Object} options - 合成选项
   * @returns {Object} 合成结果
   */
  async executeSynthesis (userId, recipeId, options = {}) {
    const transaction = await sequelize.transaction()
    const startTime = Date.now()

    try {
      // 生成随机种子
      const randomSeed = crypto.randomBytes(16).toString('hex')

      // 获取配方信息
      const recipe = await this.models.SynthesisRecipe.findByPk(recipeId, { transaction })
      if (!recipe) {
        await transaction.rollback()
        return {
          success: false,
          error: 'RECIPE_NOT_FOUND',
          message: '合成配方不存在'
        }
      }

      // 获取用户信息
      const userProfile = await this.getUserSynthesisProfile(userId)
      if (!userProfile.success) {
        await transaction.rollback()
        return userProfile
      }

      const userData = userProfile.data

      // 检查合成权限
      const history = await this.models.SynthesisHistory.findAll({
        where: { user_id: userId, recipe_id: recipeId },
        order: [['created_at', 'DESC']],
        limit: 10,
        transaction
      })

      const canSynthesize = recipe.canSynthesize({ synthesis_level: userData.synthesisLevel }, history)
      if (!canSynthesize.can) {
        await transaction.rollback()
        return {
          success: false,
          error: 'SYNTHESIS_RESTRICTED',
          message: canSynthesize.reason
        }
      }

      // 验证材料和扣除
      const materialsResult = await this.validateAndConsumeMaterials(userId, recipe.materials, transaction)
      if (!materialsResult.success) {
        await transaction.rollback()
        return materialsResult
      }

      // 计算和扣除积分成本
      const costResult = await this.calculateAndDeductCost(userId, recipe, userData.vipLevel, transaction)
      if (!costResult.success) {
        await transaction.rollback()
        return costResult
      }

      // 计算合成成功率
      const successRate = recipe.calculateSuccessRate(userData.synthesisLevel, {
        vip_level: userData.vipLevel,
        synthesis_bonus: this.bonusConfig.levelBonus * userData.synthesisLevel
      })

      // 执行合成判定
      const synthesisResult = this.performSynthesisRoll(successRate, randomSeed, userData)

      // 处理合成结果
      let outputItems = []
      if (synthesisResult.success) {
        outputItems = await this.generateOutputItems(recipe.output_items, synthesisResult.isCritical, transaction)
        await this.addItemsToInventory(userId, outputItems, transaction)
      }

      // 计算经验奖励
      const experienceGained = this.calculateExperience(recipe, synthesisResult)
      await this.addSynthesisExperience(userId, experienceGained, transaction)

      // 创建合成历史记录
      const historyId = `syn_${Date.now()}_${uuidv4().substr(0, 8)}`
      const historyRecord = await this.models.SynthesisHistory.create({
        history_id: historyId,
        user_id: userId,
        recipe_id: recipeId,
        materials_used: materialsResult.data.consumedMaterials,
        result_status: synthesisResult.status,
        success_rate_used: successRate,
        output_items: outputItems,
        special_effects_triggered: synthesisResult.specialEffects,
        cost_details: costResult.data,
        experience_gained: experienceGained,
        user_synthesis_level_before: userData.synthesisLevel,
        user_synthesis_level_after: this.calculateLevel((userData.totalExperience || 0) + experienceGained),
        random_seed: randomSeed,
        device_info: options.deviceInfo || {},
        execution_duration_ms: Date.now() - startTime,
        failure_reason: synthesisResult.failureReason,
        bonus_applied: synthesisResult.bonusApplied,
        event_id: options.eventId || null,
        verification_hash: '', // 将在下面设置
        metadata: options.metadata || {}
      }, { transaction })

      // 生成验证哈希
      historyRecord.verification_hash = historyRecord.generateVerificationHash()
      await historyRecord.save({ transaction })

      // 更新配方统计
      await recipe.increment({
        total_synthesis_count: 1,
        total_success_count: synthesisResult.success ? 1 : 0
      }, { transaction })

      await transaction.commit()

      // 发送事件通知
      await this.eventBus.emit('synthesis:completed', {
        userId,
        recipeId,
        historyId,
        success: synthesisResult.success,
        isCritical: synthesisResult.isCritical,
        outputItems,
        experienceGained
      })

      return {
        success: true,
        data: {
          historyId,
          synthesisResult: synthesisResult.status,
          success: synthesisResult.success,
          isCritical: synthesisResult.isCritical,
          outputItems,
          experienceGained,
          newLevel: this.calculateLevel((userData.totalExperience || 0) + experienceGained),
          levelUp: this.calculateLevel((userData.totalExperience || 0) + experienceGained) > userData.synthesisLevel,
          costPaid: costResult.data.total_cost,
          executionTime: Date.now() - startTime
        },
        message: synthesisResult.success ? '合成成功！' : '合成失败'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('执行合成失败:', error)
      return {
        success: false,
        error: 'SYNTHESIS_EXECUTION_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 验证并消费合成材料
   * @param {number} userId - 用户ID
   * @param {Array} requiredMaterials - 所需材料列表
   * @param {Transaction} transaction - 数据库事务
   * @returns {Object} 验证结果
   */
  async validateAndConsumeMaterials (userId, requiredMaterials, transaction) {
    try {
      const consumedMaterials = []

      for (const material of requiredMaterials) {
        const { item_type, item_id, quantity } = material

        // 检查用户库存
        const inventoryItems = await this.models.UserInventory.findAll({
          where: {
            user_id: userId,
            type: item_type,
            status: 'available'
          },
          order: [['acquired_at', 'ASC']],
          transaction
        })

        // 计算可用数量
        let availableQuantity = 0
        const itemsToConsume = []

        for (const item of inventoryItems) {
          if (item_id && item.id !== item_id) continue

          availableQuantity += 1
          itemsToConsume.push(item)

          if (availableQuantity >= quantity) break
        }

        if (availableQuantity < quantity) {
          return {
            success: false,
            error: 'INSUFFICIENT_MATERIALS',
            message: `材料不足: ${item_type} 需要${quantity}个，只有${availableQuantity}个`
          }
        }

        // 消费材料
        const itemsToConsumeSlice = itemsToConsume.slice(0, quantity)
        for (const item of itemsToConsumeSlice) {
          await item.update({
            status: 'used',
            used_at: new Date()
          }, { transaction })

          consumedMaterials.push({
            item_type: item.type,
            item_id: item.id,
            quantity: 1,
            consumed_from_inventory: item.id
          })
        }
      }

      return {
        success: true,
        data: {
          consumedMaterials
        },
        message: '材料验证和消费成功'
      }
    } catch (error) {
      console.error('材料验证失败:', error)
      return {
        success: false,
        error: 'MATERIAL_VALIDATION_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 计算并扣除合成成本
   * @param {number} userId - 用户ID
   * @param {Object} recipe - 合成配方
   * @param {number} vipLevel - VIP等级
   * @param {Transaction} transaction - 数据库事务
   * @returns {Object} 成本计算结果
   */
  async calculateAndDeductCost (userId, recipe, vipLevel, transaction) {
    try {
      const baseCost = recipe.synthesis_cost?.points || 0
      if (baseCost <= 0) {
        return {
          success: true,
          data: {
            points_spent: 0,
            vip_discount_applied: 0,
            total_cost: 0
          }
        }
      }

      // 计算VIP折扣
      const vipDiscount = recipe.synthesis_cost?.vip_discount || 1.0
      const vipBonusDiscount = this.bonusConfig.vipBonus[vipLevel] || 0
      const finalDiscountRate = Math.min(vipDiscount * (1 - vipBonusDiscount), 1.0)

      const finalCost = Math.ceil(baseCost * finalDiscountRate)
      const discountAmount = baseCost - finalCost

      // 检查用户积分余额
      const pointsResult = await this.pointsService.getUserPointsBalance(userId)
      if (!pointsResult.success || pointsResult.data.available < finalCost) {
        return {
          success: false,
          error: 'INSUFFICIENT_POINTS',
          message: `积分不足，需要${finalCost}积分`
        }
      }

      // 扣除积分
      const deductResult = await this.pointsService.deductPoints(userId, finalCost, {
        reason: 'synthesis_cost',
        description: `合成配方: ${recipe.name}`,
        metadata: { recipe_id: recipe.recipe_id }
      }, transaction)

      if (!deductResult.success) {
        return deductResult
      }

      return {
        success: true,
        data: {
          points_spent: finalCost,
          vip_discount_applied: discountAmount,
          total_cost: finalCost
        }
      }
    } catch (error) {
      console.error('计算合成成本失败:', error)
      return {
        success: false,
        error: 'COST_CALCULATION_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 执行合成判定
   * @param {number} successRate - 成功率
   * @param {string} randomSeed - 随机种子
   * @param {Object} userData - 用户数据
   * @returns {Object} 合成结果
   */
  performSynthesisRoll (successRate, randomSeed, userData) {
    // 使用随机种子生成伪随机数
    const hash = crypto.createHash('sha256').update(randomSeed + userData.userId).digest('hex')
    const random = parseInt(hash.substr(0, 8), 16) / 0xffffffff * 100

    // 计算暴击概率
    const baseCriticalChance = this.bonusConfig.criticalChance.base
    const vipCriticalBonus = this.bonusConfig.criticalChance.vipBonus * userData.vipLevel
    const levelCriticalBonus = this.bonusConfig.criticalChance.levelBonus * userData.synthesisLevel
    const totalCriticalChance = baseCriticalChance + vipCriticalBonus + levelCriticalBonus

    // 判定结果
    let status = 'failure'
    let success = false
    let isCritical = false
    const specialEffects = []
    let failureReason = null

    if (random <= successRate) {
      success = true

      // 暴击判定
      const criticalRandom = parseInt(hash.substr(8, 8), 16) / 0xffffffff * 100
      if (criticalRandom <= totalCriticalChance) {
        status = 'critical_success'
        isCritical = true
        specialEffects.push({
          effect_type: 'critical_success',
          effect_value: 1,
          description: '暴击成功！产出物品数量翻倍'
        })
      } else {
        status = 'success'
      }
    } else {
      failureReason = `合成失败 (成功率: ${successRate.toFixed(1)}%, 随机值: ${random.toFixed(1)}%)`
    }

    return {
      status,
      success,
      isCritical,
      specialEffects,
      failureReason,
      bonusApplied: {
        vip_level: userData.vipLevel,
        synthesis_level: userData.synthesisLevel,
        success_rate_bonus: successRate - 80, // 相对于基础成功率的加成
        critical_chance: totalCriticalChance
      }
    }
  }

  /**
   * 生成产出物品
   * @param {Array} outputConfig - 产出配置
   * @param {boolean} isCritical - 是否暴击
   * @param {Transaction} _transaction - 数据库事务（暂未使用）
   * @returns {Array} 产出物品列表
   */
  async generateOutputItems (outputConfig, isCritical, _transaction) {
    const outputItems = []

    for (const config of outputConfig) {
      const { item_type, item_id, quantity, probability = 100, rarity } = config

      // 概率判定
      const random = Math.random() * 100
      if (random > probability) continue

      // 计算数量（暴击翻倍）
      let finalQuantity = quantity
      if (isCritical) {
        finalQuantity *= 2
      }

      outputItems.push({
        item_type,
        item_id: item_id || null,
        quantity: finalQuantity,
        rarity: rarity || 'common',
        added_to_inventory: true,
        value: this.calculateItemValue(item_type, rarity, finalQuantity)
      })
    }

    return outputItems
  }

  /**
   * 将物品添加到用户库存
   * @param {number} userId - 用户ID
   * @param {Array} items - 物品列表
   * @param {Transaction} transaction - 数据库事务
   */
  async addItemsToInventory (userId, items, transaction) {
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const inventoryId = `syn_${Date.now()}_${uuidv4().substr(0, 8)}`

        await this.models.UserInventory.create({
          id: inventoryId,
          user_id: userId,
          name: `合成产出-${item.item_type}`,
          description: `通过高级合成系统获得的${item.rarity}物品`,
          type: item.item_type,
          value: item.value || 0,
          status: 'available',
          source_type: 'synthesis',
          source_id: inventoryId,
          acquired_at: new Date(),
          metadata: {
            synthesis_generated: true,
            rarity: item.rarity,
            generation_method: 'synthesis'
          }
        }, { transaction })
      }
    }
  }

  /**
   * 计算合成经验值
   * @param {Object} recipe - 合成配方
   * @param {Object} result - 合成结果
   * @returns {number} 经验值
   */
  calculateExperience (recipe, result) {
    let baseExp = this.experienceConfig.baseExperience + (recipe.required_level * 5)

    if (result.success) {
      if (result.isCritical) {
        baseExp *= this.experienceConfig.criticalMultiplier
      } else {
        baseExp *= this.experienceConfig.successMultiplier
      }
    } else {
      baseExp *= this.experienceConfig.failureMultiplier
    }

    return Math.floor(baseExp)
  }

  /**
   * 添加合成经验值
   * @param {number} userId - 用户ID
   * @param {number} experience - 经验值
   * @param {Transaction} transaction - 数据库事务
   */
  async addSynthesisExperience (userId, experience, transaction) {
    const user = await this.models.User.findByPk(userId, { transaction })
    const currentExp = user.synthesis_experience || 0
    const newExp = currentExp + experience

    await user.update({
      synthesis_experience: newExp
    }, { transaction })
  }

  /**
   * 根据经验值计算等级
   * @param {number} experience - 经验值
   * @returns {number} 等级
   */
  calculateLevel (experience) {
    for (let level = this.experienceConfig.maxLevel; level >= 1; level--) {
      if (experience >= this.experienceConfig.levelRequirement[level - 1]) {
        return level
      }
    }
    return 1
  }

  /**
   * 计算等级进度
   * @param {number} experience - 当前经验值
   * @param {number} currentLevel - 当前等级
   * @returns {Object} 等级进度信息
   */
  calculateLevelProgress (experience, currentLevel) {
    if (currentLevel >= this.experienceConfig.maxLevel) {
      return {
        currentLevelExp: experience,
        nextLevelExp: null,
        progress: 100,
        isMaxLevel: true
      }
    }

    const currentLevelReq = this.experienceConfig.levelRequirement[currentLevel - 1]
    const nextLevelReq = this.experienceConfig.levelRequirement[currentLevel]
    const levelExp = experience - currentLevelReq
    const neededExp = nextLevelReq - currentLevelReq

    return {
      currentLevelExp: levelExp,
      nextLevelExp: neededExp,
      progress: Math.floor((levelExp / neededExp) * 100),
      isMaxLevel: false
    }
  }

  /**
   * 计算物品价值
   * @param {string} itemType - 物品类型
   * @param {string} rarity - 稀有度
   * @param {number} quantity - 数量
   * @returns {number} 物品价值
   */
  calculateItemValue (itemType, rarity, quantity) {
    const baseValues = {
      common: 10,
      rare: 50,
      epic: 200,
      legendary: 500,
      mythical: 1000
    }

    const typeMultipliers = {
      voucher: 1.0,
      product: 1.2,
      service: 0.8
    }

    const baseValue = baseValues[rarity] || baseValues.common
    const typeMultiplier = typeMultipliers[itemType] || 1.0

    return Math.floor(baseValue * typeMultiplier * quantity)
  }

  /**
   * 获取合成历史
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 合成历史
   */
  async getSynthesisHistory (userId, options = {}) {
    try {
      const {
        recipeId = null,
        status = null,
        limit = 20,
        offset = 0,
        includeRecipe = true
      } = options

      const whereConditions = { user_id: userId }

      if (recipeId) {
        whereConditions.recipe_id = recipeId
      }

      if (status) {
        whereConditions.result_status = status
      }

      const includeOptions = []
      if (includeRecipe) {
        includeOptions.push({
          model: this.models.SynthesisRecipe,
          as: 'recipe',
          attributes: ['recipe_id', 'name', 'category', 'required_level']
        })
      }

      const history = await this.models.SynthesisHistory.findAndCountAll({
        where: whereConditions,
        include: includeOptions,
        order: [['created_at', 'DESC']],
        limit,
        offset
      })

      return {
        success: true,
        data: {
          history: history.rows,
          total: history.count,
          pagination: {
            limit,
            offset,
            total: history.count
          }
        },
        message: '合成历史获取成功'
      }
    } catch (error) {
      console.error('获取合成历史失败:', error)
      return {
        success: false,
        error: 'GET_HISTORY_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 管理员创建配方
   * @param {Object} recipeData - 配方数据
   * @returns {Object} 创建结果
   */
  async createRecipe (recipeData) {
    try {
      const recipeId = `recipe_${Date.now()}_${uuidv4().substr(0, 8)}`

      const recipe = await this.models.SynthesisRecipe.create({
        recipe_id: recipeId,
        ...recipeData
      })

      await this.eventBus.emit('synthesis:recipe_created', {
        recipeId,
        recipeName: recipe.name,
        category: recipe.category
      })

      return {
        success: true,
        data: recipe,
        message: '合成配方创建成功'
      }
    } catch (error) {
      console.error('创建合成配方失败:', error)
      return {
        success: false,
        error: 'CREATE_RECIPE_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 获取系统统计信息
   * @returns {Object} 统计信息
   */
  async getSystemStats () {
    try {
      const totalRecipes = await this.models.SynthesisRecipe.count()
      const activeRecipes = await this.models.SynthesisRecipe.count({ where: { status: 'active' } })
      const totalSynthesis = await this.models.SynthesisHistory.count()
      const successfulSynthesis = await this.models.SynthesisHistory.count({
        where: {
          result_status: {
            [Op.in]: ['success', 'critical_success', 'partial_success']
          }
        }
      })

      const topRecipes = await this.models.SynthesisRecipe.findAll({
        order: [['total_synthesis_count', 'DESC']],
        limit: 10,
        attributes: ['recipe_id', 'name', 'total_synthesis_count', 'total_success_count']
      })

      return {
        success: true,
        data: {
          totalRecipes,
          activeRecipes,
          totalSynthesis,
          successfulSynthesis,
          overallSuccessRate: totalSynthesis > 0 ? (successfulSynthesis / totalSynthesis * 100).toFixed(2) : 0,
          topRecipes
        },
        message: '系统统计获取成功'
      }
    } catch (error) {
      console.error('获取系统统计失败:', error)
      return {
        success: false,
        error: 'GET_STATS_FAILED',
        message: error.message
      }
    }
  }
}

module.exports = new AdvancedSynthesisService()
