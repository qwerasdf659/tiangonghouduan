/**
 * 餐厅积分抽奖系统 v2.0 - 商品兑换路由
 * 实现商品兑换系统的核心API接口
 */

const express = require('express')
const ExchangeService = require('../../services/ExchangeService')
const { authenticateToken } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化兑换服务
const exchangeService = new ExchangeService()

/**
 * @route GET /api/v2/exchange
 * @desc 获取兑换系统API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success(
      {
        module: 'exchange',
        description: '商品兑换系统API',
        version: '2.0.0',
        endpoints: {
          'GET /products': '获取商品列表（支持双空间）',
          'GET /premium-status': '获取臻选空间解锁状态',
          'POST /unlock-premium': '解锁臻选空间',
          'POST /redeem': '执行商品兑换'
        }
      },
      '兑换系统API信息'
    )
  )
})

/**
 * @route GET /api/v2/exchange/products
 * @desc 获取商品列表（支持双空间）
 * @access 需要认证
 */
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { space = 'lucky', page = 1, pageSize = 20 } = req.query

    // 修复：将所有参数合并到一个options对象中
    const result = await exchangeService.getProducts({
      space,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    })

    res.json(ApiResponse.success(result, '获取商品列表成功'))
  } catch (error) {
    console.error('❌ 获取商品列表失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取商品列表失败', 'GET_PRODUCTS_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/exchange/premium-status
 * @desc 获取用户臻选空间解锁状态
 * @access 需要认证
 */
router.get('/premium-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const status = await exchangeService.getPremiumSpaceStatus(userId)

    res.json(ApiResponse.success(status, '获取臻选空间状态成功'))
  } catch (error) {
    console.error('❌ 获取臻选空间状态失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取臻选空间状态失败', 'GET_PREMIUM_STATUS_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/exchange/unlock-premium
 * @desc 解锁臻选空间
 * @access 需要认证
 */
router.post('/unlock-premium', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const result = await exchangeService.unlockPremiumSpace(userId)

    res.json(ApiResponse.success(result, '臻选空间解锁成功'))
  } catch (error) {
    console.error('❌ 臻选空间解锁失败:', error.message)
    let errorCode = 'UNLOCK_PREMIUM_FAILED'
    if (error.message.includes('积分不足')) {
      errorCode = 'INSUFFICIENT_POINTS'
    } else if (error.message.includes('已解锁')) {
      errorCode = 'ALREADY_UNLOCKED'
    }
    res.status(400).json(ApiResponse.error(error.message, errorCode))
  }
})

/**
 * @route POST /api/v2/exchange/redeem
 * @desc 执行商品兑换
 * @access 需要认证
 */
router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { product_id, quantity = 1 } = req.body

    if (!product_id) {
      return res.status(400).json(ApiResponse.error('缺少商品ID', 'MISSING_PRODUCT_ID'))
    }

    const result = await exchangeService.redeemProduct(userId, product_id, quantity)

    res.json(ApiResponse.success(result, '商品兑换成功'))
  } catch (error) {
    console.error('❌ 商品兑换失败:', error.message)
    let errorCode = 'REDEEM_FAILED'
    if (error.message.includes('积分不足')) {
      errorCode = 'INSUFFICIENT_POINTS'
    } else if (error.message.includes('库存不足')) {
      errorCode = 'INSUFFICIENT_STOCK'
    } else if (error.message.includes('商品不存在')) {
      errorCode = 'PRODUCT_NOT_FOUND'
    }
    res.status(400).json(ApiResponse.error(error.message, errorCode))
  }
})

module.exports = router
