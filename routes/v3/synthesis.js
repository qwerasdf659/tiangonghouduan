/**
 * 餐厅积分抽奖系统 v3.0 - 高级合成系统API路由
 * 提供道具合成、配方管理和历史查询功能
 * 创建时间：2025年08月22日
 */

const express = require('express')
const router = express.Router()
const AdvancedSynthesisService = require('../../services/AdvancedSynthesisService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/synthesis/profile
 * 获取用户合成信息
 */
router.get('/profile', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    const result = await AdvancedSynthesisService.getUserSynthesisProfile(userId)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取合成信息失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_SYNTHESIS_PROFILE_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/synthesis/recipes
 * 获取可用合成配方列表
 */
router.get('/recipes', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      category,
      min_level,
      max_level,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      limit = 50,
      offset = 0
    } = req.query

    const options = {
      category,
      minLevel: min_level ? parseInt(min_level) : null,
      maxLevel: max_level ? parseInt(max_level) : null,
      sortBy: sort_by,
      sortOrder: sort_order.toUpperCase(),
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: parseInt(offset) || 0
    }

    const result = await AdvancedSynthesisService.getAvailableRecipes(userId, options)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取配方列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_RECIPES_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/synthesis/recipes/:recipeId
 * 获取配方详细信息
 */
router.get('/recipes/:recipeId', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { recipeId } = req.params

    // 通过获取配方列表API来获取单个配方的详细信息
    const result = await AdvancedSynthesisService.getAvailableRecipes(userId, { limit: 1000 })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    const recipe = result.data.recipes.find(r => r.recipe_id === recipeId)

    if (!recipe) {
      return res.status(404).json({
        success: false,
        error: 'RECIPE_NOT_FOUND',
        message: '配方不存在或用户无权访问',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: recipe,
      message: '配方详情获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取配方详情失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_RECIPE_DETAIL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/synthesis/execute
 * 执行道具合成
 */
router.post('/execute',
  requireUser,
  validationMiddleware([
    { field: 'recipe_id', type: 'string', required: true, minLength: 10, maxLength: 50 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { recipe_id } = req.body

      // 收集设备信息
      const deviceInfo = {
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('User-Agent'),
        device_type: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop'
      }

      const options = {
        deviceInfo,
        metadata: {
          request_time: new Date().toISOString(),
          source: 'api_v3'
        }
      }

      const result = await AdvancedSynthesisService.executeSynthesis(userId, recipe_id, options)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.data,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('执行合成失败:', error)
      res.status(500).json({
        success: false,
        error: 'SYNTHESIS_EXECUTION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/synthesis/history
 * 获取用户合成历史
 */
router.get('/history', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      recipe_id,
      status,
      limit = 20,
      offset = 0,
      include_recipe = 'true'
    } = req.query

    const options = {
      recipeId: recipe_id,
      status,
      limit: Math.min(parseInt(limit) || 20, 100),
      offset: parseInt(offset) || 0,
      includeRecipe: include_recipe === 'true'
    }

    const result = await AdvancedSynthesisService.getSynthesisHistory(userId, options)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取合成历史失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_SYNTHESIS_HISTORY_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/synthesis/stats
 * 获取用户合成统计信息
 */
router.get('/stats', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    // 移除未使用的time_range变量
    // const { time_range = 30 } = req.query

    const profile = await AdvancedSynthesisService.getUserSynthesisProfile(userId)

    if (!profile.success) {
      return res.status(400).json({
        success: false,
        error: profile.error,
        message: profile.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        profile: profile.data,
        detailedStats: profile.data.statistics
      },
      message: '合成统计获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取合成统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_SYNTHESIS_STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/synthesis/categories
 * 获取配方分类列表
 */
router.get('/categories', requireUser, async (req, res) => {
  try {
    const categories = [
      {
        id: 'basic',
        name: '基础合成',
        description: '入门级的简单合成配方',
        icon: '🔧',
        required_level: 1
      },
      {
        id: 'advanced',
        name: '高级合成',
        description: '需要一定技能的复杂合成',
        icon: '⚗️',
        required_level: 5
      },
      {
        id: 'legendary',
        name: '传说合成',
        description: '产出珍稀物品的传说配方',
        icon: '🌟',
        required_level: 8
      },
      {
        id: 'mythical',
        name: '神话合成',
        description: '最高级的神话级合成配方',
        icon: '✨',
        required_level: 10
      },
      {
        id: 'event',
        name: '活动合成',
        description: '限时活动专用的特殊配方',
        icon: '🎁',
        required_level: 1
      }
    ]

    res.json({
      success: true,
      data: { categories },
      message: '配方分类获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取配方分类失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_CATEGORIES_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// ==================== 管理员接口 ====================

/**
 * POST /api/v3/synthesis/admin/recipes
 * 管理员创建配方
 */
router.post('/admin/recipes',
  requireAdmin,
  validationMiddleware([
    { field: 'name', type: 'string', required: true, minLength: 1, maxLength: 100 },
    { field: 'category', type: 'string', required: true, enum: ['basic', 'advanced', 'legendary', 'mythical', 'event'] },
    { field: 'required_level', type: 'number', required: true, min: 1, max: 10 },
    { field: 'materials', type: 'array', required: true, minLength: 1 },
    { field: 'output_items', type: 'array', required: true, minLength: 1 },
    { field: 'base_success_rate', type: 'number', required: true, min: 1, max: 100 }
  ]),
  async (req, res) => {
    try {
      const recipeData = req.body

      const result = await AdvancedSynthesisService.createRecipe(recipeData)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('创建配方失败:', error)
      res.status(500).json({
        success: false,
        error: 'CREATE_RECIPE_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/synthesis/admin/stats
 * 管理员获取系统统计
 */
router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const result = await AdvancedSynthesisService.getSystemStats()

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取系统统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_ADMIN_STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/synthesis/admin/recipes
 * 管理员获取所有配方（不受用户限制）
 */
router.get('/admin/recipes', requireAdmin, async (req, res) => {
  try {
    const {
      category,
      status,
      sort_by = 'created_at',
      sort_order = 'DESC',
      limit = 50,
      offset = 0
    } = req.query

    const models = require('../../models')

    const whereConditions = {}

    if (category) {
      whereConditions.category = category
    }

    if (status) {
      whereConditions.status = status
    }

    const recipes = await models.SynthesisRecipe.findAndCountAll({
      where: whereConditions,
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0
    })

    res.json({
      success: true,
      data: {
        recipes: recipes.rows,
        total: recipes.count,
        pagination: {
          limit: parseInt(limit) || 50,
          offset: parseInt(offset) || 0,
          total: recipes.count
        }
      },
      message: '管理员配方列表获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取管理员配方列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_ADMIN_RECIPES_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * PUT /api/v3/synthesis/admin/recipes/:recipeId
 * 管理员更新配方
 */
router.put('/admin/recipes/:recipeId',
  requireAdmin,
  validationMiddleware([
    { field: 'name', type: 'string', required: false, minLength: 1, maxLength: 100 },
    { field: 'status', type: 'string', required: false, enum: ['active', 'inactive', 'event_only', 'deprecated'] },
    { field: 'base_success_rate', type: 'number', required: false, min: 1, max: 100 }
  ]),
  async (req, res) => {
    try {
      const { recipeId } = req.params
      const updateData = req.body

      const models = require('../../models')

      const recipe = await models.SynthesisRecipe.findByPk(recipeId)

      if (!recipe) {
        return res.status(404).json({
          success: false,
          error: 'RECIPE_NOT_FOUND',
          message: '配方不存在',
          timestamp: new Date().toISOString()
        })
      }

      await recipe.update(updateData)

      res.json({
        success: true,
        data: recipe,
        message: '配方更新成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('更新配方失败:', error)
      res.status(500).json({
        success: false,
        error: 'UPDATE_RECIPE_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/synthesis/admin/history
 * 管理员获取所有合成历史
 */
router.get('/admin/history', requireAdmin, async (req, res) => {
  try {
    const {
      user_id,
      recipe_id,
      status,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = req.query

    const models = require('../../models')
    const { Op } = require('sequelize')

    const whereConditions = {}

    if (user_id) {
      whereConditions.user_id = parseInt(user_id)
    }

    if (recipe_id) {
      whereConditions.recipe_id = recipe_id
    }

    if (status) {
      whereConditions.result_status = status
    }

    if (start_date || end_date) {
      whereConditions.created_at = {}
      if (start_date) {
        whereConditions.created_at[Op.gte] = new Date(start_date)
      }
      if (end_date) {
        whereConditions.created_at[Op.lte] = new Date(end_date)
      }
    }

    const history = await models.SynthesisHistory.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'username', 'phone']
        },
        {
          model: models.SynthesisRecipe,
          as: 'recipe',
          attributes: ['recipe_id', 'name', 'category']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0
    })

    res.json({
      success: true,
      data: {
        history: history.rows,
        total: history.count,
        pagination: {
          limit: parseInt(limit) || 50,
          offset: parseInt(offset) || 0,
          total: history.count
        }
      },
      message: '管理员合成历史获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取管理员合成历史失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_ADMIN_HISTORY_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
