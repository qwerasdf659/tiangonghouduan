/**
 * 系统设置管理路由模块
 *
 * @description 系统配置管理相关路由（基础设置、抽奖设置、积分设置、通知设置、安全设置）
 * @version 4.0.0
 * @date 2025-11-23 北京时间
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

/**
 * GET /settings/:category - 获取指定分类的所有设置
 *
 * @description 获取某个分类下的所有配置项（如基础设置、抽奖设置等）
 * @route GET /api/v4/admin/settings/basic
 * @route GET /api/v4/admin/settings/lottery
 * @route GET /api/v4/admin/settings/points
 * @route GET /api/v4/admin/settings/notification
 * @route GET /api/v4/admin/settings/security
 * @access Private (需要管理员权限)
 */
router.get(
  '/settings/:category',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { category } = req.params

      // 验证分类是否合法
      const validCategories = ['basic', 'lottery', 'points', 'notification', 'security']
      if (!validCategories.includes(category)) {
        return res.apiError(
          '无效的设置分类',
          'INVALID_CATEGORY',
          { valid_categories: validCategories },
          400
        )
      }

      // 查询该分类下的所有配置项
      const settings = await models.SystemSettings.findAll({
        where: {
          category,
          is_visible: true // 只返回可见的配置项
        },
        attributes: [
          'setting_id',
          'category',
          'setting_key',
          'setting_value',
          'value_type',
          'description',
          'is_readonly',
          'updated_by',
          'updated_at'
        ],
        order: [['setting_id', 'ASC']]
      })

      // 转换配置项数据（自动解析value_type）
      const parsedSettings = settings.map(setting => {
        const data = setting.toJSON()
        // 使用模型的getParsedValue方法自动解析值
        data.parsed_value = setting.getParsedValue()
        return data
      })

      sharedComponents.logger.info('管理员查询系统设置', {
        admin_id: req.user.user_id,
        category,
        count: settings.length
      })

      return res.apiSuccess(
        {
          category,
          count: settings.length,
          settings: parsedSettings
        },
        `${category}设置获取成功`
      )
    } catch (error) {
      sharedComponents.logger.error('获取系统设置失败', {
        error: error.message,
        category: req.params.category
      })
      return res.apiInternalError('获取系统设置失败', error.message, 'SETTINGS_GET_ERROR')
    }
  })
)

/**
 * PUT /settings/:category - 批量更新指定分类的设置
 *
 * @description 批量更新某个分类下的配置项
 * @route PUT /api/v4/admin/settings/basic
 * @route PUT /api/v4/admin/settings/lottery
 * @route PUT /api/v4/admin/settings/points
 * @route PUT /api/v4/admin/settings/notification
 * @route PUT /api/v4/admin/settings/security
 * @access Private (需要管理员权限)
 *
 * @body {Object} settings - 要更新的配置项键值对
 * @body.example { "system_name": "新系统名称", "customer_phone": "400-123-4567" }
 */
router.put(
  '/settings/:category',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { category } = req.params
      const { settings: settingsToUpdate } = req.body

      // 验证分类是否合法（删除lottery，抽奖算法配置在代码中管理）
      const validCategories = ['basic', 'points', 'notification', 'security']
      if (!validCategories.includes(category)) {
        return res.apiError(
          '无效的设置分类',
          'INVALID_CATEGORY',
          { valid_categories: validCategories },
          400
        )
      }

      // 验证更新数据
      if (
        !settingsToUpdate ||
        typeof settingsToUpdate !== 'object' ||
        Object.keys(settingsToUpdate).length === 0
      ) {
        return res.apiError('请提供要更新的设置项', 'INVALID_SETTINGS_DATA', null, 400)
      }

      const settingKeys = Object.keys(settingsToUpdate)
      const updateResults = []
      const errors = []

      // 使用事务保证数据一致性
      await models.sequelize.transaction(async transaction => {
        for (const settingKey of settingKeys) {
          try {
            // 查找配置项
            const setting = await models.SystemSettings.findOne({
              where: {
                category,
                setting_key: settingKey
              },
              transaction
            })

            if (!setting) {
              errors.push({
                setting_key: settingKey,
                error: '配置项不存在'
              })
              continue
            }

            // 检查是否为只读配置
            if (setting.is_readonly) {
              errors.push({
                setting_key: settingKey,
                error: '此配置项为只读，不可修改'
              })
              continue
            }

            // 更新配置值（使用模型的setValue方法自动类型转换）
            const newValue = settingsToUpdate[settingKey]
            setting.setValue(newValue)
            setting.updated_by = req.user.user_id
            setting.updated_at = BeijingTimeHelper.createBeijingTime()

            await setting.save({ transaction })

            updateResults.push({
              setting_key: settingKey,
              old_value: setting.setting_value,
              new_value: newValue,
              success: true
            })

            sharedComponents.logger.info('管理员更新系统设置', {
              admin_id: req.user.user_id,
              category,
              setting_key: settingKey,
              new_value: newValue
            })
          } catch (error) {
            errors.push({
              setting_key: settingKey,
              error: error.message
            })
          }
        }
      })

      // 返回更新结果
      const responseData = {
        category,
        total_requested: settingKeys.length,
        success_count: updateResults.length,
        error_count: errors.length,
        updates: updateResults,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }

      if (errors.length > 0) {
        responseData.errors = errors
      }

      if (errors.length === settingKeys.length) {
        return res.apiError('所有设置项更新失败', 'ALL_SETTINGS_UPDATE_FAILED', responseData, 400)
      }

      return res.apiSuccess(responseData, `${category}设置更新完成`)
    } catch (error) {
      sharedComponents.logger.error('更新系统设置失败', {
        error: error.message,
        category: req.params.category
      })
      return res.apiInternalError('更新系统设置失败', error.message, 'SETTINGS_UPDATE_ERROR')
    }
  })
)

/**
 * GET /settings - 获取所有分类的设置概览
 *
 * @description 获取所有分类的配置项数量和基本信息
 * @route GET /api/v4/admin/settings
 * @access Private (需要管理员权限)
 */
router.get(
  '/settings',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // 查询所有分类的配置数量
      const categoryCounts = await models.SystemSettings.findAll({
        attributes: [
          'category',
          [models.sequelize.fn('COUNT', models.sequelize.col('setting_id')), 'count']
        ],
        where: {
          is_visible: true
        },
        group: ['category']
      })

      const summary = {
        total_settings: 0,
        categories: {}
      }

      categoryCounts.forEach(item => {
        const data = item.toJSON()
        summary.categories[data.category] = parseInt(data.count)
        summary.total_settings += parseInt(data.count)
      })

      return res.apiSuccess(summary, '系统设置概览获取成功')
    } catch (error) {
      sharedComponents.logger.error('获取系统设置概览失败', { error: error.message })
      return res.apiInternalError('获取系统设置概览失败', error.message, 'SETTINGS_SUMMARY_ERROR')
    }
  })
)

/**
 * POST /cache/clear - 清除系统缓存
 *
 * @description 清除Redis缓存（支持清除所有缓存或指定模式的缓存）
 * @route POST /api/v4/admin/cache/clear
 * @access Private (需要管理员权限)
 *
 * @body {string} pattern - 缓存key模式（可选，如"rate_limit:*"，不提供则清除所有）
 * @body {boolean} confirm - 确认清除（必须为true）
 */
router.post(
  '/cache/clear',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { pattern, confirm } = req.body

      // 安全确认机制
      if (confirm !== true) {
        return res.apiError(
          '清除缓存需要确认，请设置confirm=true',
          'CACHE_CLEAR_NOT_CONFIRMED',
          null,
          400
        )
      }

      const { getRawClient } = require('../../../../utils/UnifiedRedisClient')
      const rawClient = getRawClient()

      let clearedCount = 0
      const cachePattern = pattern || '*' // 默认清除所有

      // 使用SCAN命令安全地获取匹配的keys（避免KEYS命令阻塞）
      const keys = await rawClient.keys(cachePattern)

      if (keys && keys.length > 0) {
        // 批量删除keys
        if (keys.length === 1) {
          clearedCount = await rawClient.del(keys[0])
        } else {
          clearedCount = await rawClient.del(...keys)
        }

        sharedComponents.logger.warn('管理员清除系统缓存', {
          admin_id: req.user.user_id,
          pattern: cachePattern,
          cleared_count: clearedCount,
          total_keys: keys.length
        })
      }

      return res.apiSuccess(
        {
          pattern: cachePattern,
          cleared_count: clearedCount,
          matched_keys: keys ? keys.length : 0,
          timestamp: BeijingTimeHelper.apiTimestamp()
        },
        '缓存清除成功'
      )
    } catch (error) {
      sharedComponents.logger.error('清除缓存失败', { error: error.message })
      return res.apiInternalError('清除缓存失败', error.message, 'CACHE_CLEAR_ERROR')
    }
  })
)

module.exports = router
