/**
 * 🔥 收集系统API接口 v3 - 收集品和碎片管理
 * 创建时间：2025年01月21日 UTC
 * 特点：收集品管理 + 碎片合成 + 套装系统 + 进度跟踪
 * 路径：/api/v3/collection
 * 基于：CollectionSystemService (21KB, 722行) - 企业级实现
 */

'use strict'

const express = require('express')
const router = express.Router()
const CollectionSystemService = require('../../services/CollectionSystemService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/collection/user/:userId/progress
 * 获取用户收集进度
 */
router.get('/user/:userId/progress', requireUser, async (req, res) => {
  try {
    const { userId } = req.params
    const { category } = req.query

    // 权限验证：用户只能查看自己的收集进度，或管理员可以查看任何用户
    if (req.user.user_id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '只能查看自己的收集进度',
        timestamp: new Date().toISOString()
      })
    }

    console.log(`📋 收集进度查询: 用户=${userId}, 分类=${category || '全部'}`)

    // 调用现有Service方法获取收集进度
    const collectionProgress = await CollectionSystemService.getUserCollectionProgress(
      parseInt(userId),
      category
    )

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        category: category || 'all',
        progress: collectionProgress,
        summary: {
          totalItems: collectionProgress.totalItems,
          collectedItems: collectionProgress.collectedItems,
          completionRate: collectionProgress.completionRate,
          level: collectionProgress.userLevel
        }
      },
      message: '收集进度获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 收集进度查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'COLLECTION_PROGRESS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/collection/fragments/add
 * 添加收集品碎片（内部接口，通常由抽奖系统调用）
 */
router.post('/fragments/add',
  requireUser,
  validationMiddleware([
    { field: 'itemId', type: 'number', required: true },
    { field: 'quantity', type: 'number', required: true, min: 1 },
    { field: 'source', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { itemId, quantity, source = 'lottery' } = req.body

      console.log(`✨ 添加碎片: 用户=${userId}, 物品=${itemId}, 数量=${quantity}, 来源=${source}`)

      // 调用现有Service方法添加碎片
      const addResult = await CollectionSystemService.addFragments(userId, itemId, quantity, source)

      if (addResult.success) {
        res.json({
          success: true,
          data: {
            userId,
            itemId,
            addedQuantity: quantity,
            totalFragments: addResult.totalFragments,
            requiredFragments: addResult.requiredFragments,
            canCombine: addResult.canCombine,
            source
          },
          message: `获得${quantity}个碎片`,
          timestamp: new Date().toISOString()
        })
      } else {
        res.status(400).json({
          success: false,
          error: addResult.error,
          message: addResult.message,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('❌ 添加碎片失败:', error)
      res.status(500).json({
        success: false,
        error: 'ADD_FRAGMENTS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/collection/fragments/combine
 * 合成收集品
 */
router.post('/fragments/combine',
  requireUser,
  validationMiddleware([
    { field: 'itemId', type: 'number', required: true }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { itemId } = req.body

      console.log(`🔧 合成收集品: 用户=${userId}, 物品=${itemId}`)

      // 调用现有Service方法合成碎片
      const combineResult = await CollectionSystemService.combineFragments(userId, itemId)

      if (combineResult.success) {
        res.json({
          success: true,
          data: {
            userId,
            itemId,
            itemName: combineResult.itemName,
            combinedAt: combineResult.combinedAt,
            remainingFragments: combineResult.remainingFragments,
            rewards: combineResult.rewards
          },
          message: `成功合成${combineResult.itemName}`,
          timestamp: new Date().toISOString()
        })
      } else {
        res.status(400).json({
          success: false,
          error: combineResult.error,
          message: combineResult.message,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('❌ 合成收集品失败:', error)
      res.status(500).json({
        success: false,
        error: 'COMBINE_FRAGMENTS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/collection/items/:itemId/details
 * 获取收集品详细信息
 */
router.get('/items/:itemId/details', requireUser, async (req, res) => {
  try {
    const { itemId } = req.params
    const userId = req.user.user_id

    console.log(`🔍 收集品详情: 物品=${itemId}, 用户=${userId}`)

    // 调用现有Service方法获取收集品详情
    const itemDetails = await CollectionSystemService.getCollectionItemDetails(
      parseInt(itemId),
      userId
    )

    res.json({
      success: true,
      data: {
        itemId: parseInt(itemId),
        itemDetails,
        userStatus: itemDetails.userStatus || null
      },
      message: '收集品详情获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 收集品详情获取失败:', error)
    res.status(500).json({
      success: false,
      error: 'ITEM_DETAILS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/collection/sets
 * 获取收集套装信息
 */
router.get('/sets', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`📦 收集套装查询: 用户=${userId}`)

    // 调用现有Service方法获取收集套装
    const collectionSets = await CollectionSystemService.getCollectionSets(userId)

    res.json({
      success: true,
      data: {
        userId,
        sets: collectionSets,
        totalSets: collectionSets.length,
        completedSets: collectionSets.filter(set => set.isCompleted).length
      },
      message: '收集套装信息获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 收集套装查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'COLLECTION_SETS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/collection/catalog
 * 获取收集品图鉴（所有收集品）
 */
router.get('/catalog', requireUser, async (req, res) => {
  try {
    const { category, rarity } = req.query

    console.log(`📚 收集品图鉴: 分类=${category || '全部'}, 稀有度=${rarity || '全部'}`)

    // 获取收集套装作为图鉴基础
    const collectionSets = await CollectionSystemService.getCollectionSets()

    // 根据查询参数过滤
    const filteredItems = []
    collectionSets.forEach(set => {
      set.items.forEach(item => {
        if (category && item.category !== category) return
        if (rarity && item.rarity !== rarity) return
        filteredItems.push({
          ...item,
          setName: set.name,
          setCategory: set.category
        })
      })
    })

    res.json({
      success: true,
      data: {
        catalog: filteredItems,
        filters: {
          category: category || null,
          rarity: rarity || null
        },
        totalItems: filteredItems.length,
        categories: [...new Set(filteredItems.map(item => item.category))],
        rarities: [...new Set(filteredItems.map(item => item.rarity))]
      },
      message: '收集品图鉴获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 收集品图鉴获取失败:', error)
    res.status(500).json({
      success: false,
      error: 'COLLECTION_CATALOG_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/collection/user/:userId/level
 * 获取用户收集等级
 */
router.get('/user/:userId/level', requireUser, async (req, res) => {
  try {
    const { userId } = req.params

    // 权限验证
    if (req.user.user_id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '只能查看自己的收集等级',
        timestamp: new Date().toISOString()
      })
    }

    console.log(`⭐ 收集等级查询: 用户=${userId}`)

    // 调用现有Service方法获取用户等级
    const userLevel = await CollectionSystemService.getUserLevel(parseInt(userId))

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        level: userLevel.level,
        experience: userLevel.experience,
        nextLevelExp: userLevel.nextLevelExp,
        progress: userLevel.progress,
        benefits: userLevel.benefits
      },
      message: '收集等级获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 收集等级查询失败:', error)
    res.status(500).json({
      success: false,
      error: 'COLLECTION_LEVEL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/collection/admin/add-item
 * 管理员直接添加收集品
 */
router.post('/admin/add-item',
  requireAdmin,
  validationMiddleware([
    { field: 'userId', type: 'number', required: true },
    { field: 'itemId', type: 'number', required: true },
    { field: 'method', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const { userId, itemId, method = 'admin_grant' } = req.body

      console.log(`👑 管理员添加收集品: 用户=${userId}, 物品=${itemId}, 方式=${method}`)

      // 调用现有Service方法添加收集品
      const addResult = await CollectionSystemService.addCollection(userId, itemId, method)

      if (addResult.success) {
        res.json({
          success: true,
          data: {
            userId,
            itemId,
            itemName: addResult.itemName,
            method,
            addedAt: addResult.addedAt,
            rewards: addResult.rewards
          },
          message: `成功为用户${userId}添加收集品：${addResult.itemName}`,
          timestamp: new Date().toISOString()
        })
      } else {
        res.status(400).json({
          success: false,
          error: addResult.error,
          message: addResult.message,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('❌ 管理员添加收集品失败:', error)
      res.status(500).json({
        success: false,
        error: 'ADMIN_ADD_ITEM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

module.exports = router
