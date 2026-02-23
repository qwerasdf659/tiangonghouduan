/**
 * 客服工作台 - GM工具路由（诊断/补偿/消息模板）
 *
 * 业务范围：
 * - 补偿发放：资产/物品补偿（事务内原子操作）
 * - 消息模板：获取/更新回复模板（存储在 system_configs）
 *
 * 路径前缀：/api/v4/console/customer-service/gm-tools
 *
 * 架构规范：
 * - 写操作使用 TransactionManager.execute 包裹事务
 * - 补偿操作记录到 admin_operation_logs（操作审计）
 * - 补偿权限：admin role_level >= 100（预留阈值扩展位置）
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/* 补偿操作需要管理员权限（role_level >= 100） */
router.use(authenticateToken, requireRoleLevel(1))

/**
 * POST /gm-tools/compensate - 发放补偿
 *
 * @route POST /api/v4/console/customer-service/gm-tools/compensate
 * @body {number} user_id - 接受补偿的用户ID
 * @body {string} reason - 补偿原因
 * @body {number} [session_id] - 关联客服会话ID
 * @body {number} [issue_id] - 关联工单ID
 * @body {Array} items - 补偿项目列表
 * @body {string} items[].type - 'asset' 或 'item'
 * @body {string} [items[].asset_code] - 资产代码（type=asset）
 * @body {number} [items[].amount] - 资产数量（type=asset）
 * @body {string} [items[].item_type] - 物品类型（type=item）
 * @body {number} [items[].quantity] - 物品数量（type=item，默认1）
 */
router.post('/compensate', requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id, reason, session_id, issue_id, items } = req.body

    if (!user_id || !reason || !items || !Array.isArray(items) || items.length === 0) {
      return res.apiError('缺少必填参数：user_id, reason, items[]', 'BAD_REQUEST', null, 400)
    }

    /* 验证每个补偿项目的参数完整性 */
    for (const item of items) {
      if (item.type === 'asset') {
        if (!item.asset_code || !item.amount || item.amount <= 0) {
          return res.apiError('资产补偿项缺少 asset_code 或 amount', 'BAD_REQUEST', null, 400)
        }
      } else if (item.type === 'item') {
        if (!item.item_type) {
          return res.apiError('物品补偿项缺少 item_type', 'BAD_REQUEST', null, 400)
        }
      } else {
        return res.apiError(
          `不支持的补偿类型: ${item.type}，仅支持 asset/item`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    const models = req.app.locals.models
    const CompensateService = req.app.locals.services.getService('cs_compensate')

    const result = await TransactionManager.execute(
      async transaction => {
        return await CompensateService.compensate(
          models,
          {
            user_id: parseInt(user_id),
            operator_id: req.user.user_id,
            reason,
            session_id: session_id ? parseInt(session_id) : null,
            issue_id: issue_id ? parseInt(issue_id) : null,
            items
          },
          {
            transaction,
            ip_address: req.ip || req.connection.remoteAddress
          }
        )
      },
      { description: 'csCompensate' }
    )

    return res.apiSuccess(result, '补偿发放成功')
  } catch (error) {
    logger.error('补偿发放失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /gm-tools/templates - 获取消息模板库
 *
 * @route GET /api/v4/console/customer-service/gm-tools/templates
 * @description 从 system_configs 读取 cs_reply_templates 配置
 */
router.get('/templates', async (req, res) => {
  try {
    /** 通过 ServiceManager 获取 SystemConfigService（不直连 models.SystemConfig） */
    const SystemConfigService = req.app.locals.services.getService('system_config')

    /* 从 system_configs 表读取消息模板（config_key = 'cs_reply_templates'） */
    let templates = []
    try {
      const configValue = await SystemConfigService.getValue('cs_reply_templates')
      if (configValue) {
        templates = typeof configValue === 'string' ? JSON.parse(configValue) : configValue
      }
    } catch (_e) {
      templates = []
    }

    /* 如果数据库无模板，返回默认模板 */
    if (templates.length === 0) {
      templates = [
        {
          category: '通用',
          items: [
            { title: '问候语', content: '您好！感谢您的咨询，请问有什么可以帮您？' },
            { title: '请稍等', content: '收到您的问题，正在为您查询，请稍等片刻~' },
            { title: '感谢反馈', content: '感谢您的反馈！我们会持续改进，为您提供更好的服务。' },
            {
              title: '祝您愉快',
              content: '问题已处理完毕，祝您使用愉快！如有其他问题随时联系我们。'
            }
          ]
        },
        {
          category: '资产',
          items: [
            { title: '余额查询', content: '已为您查询到账户余额信息，请查看右侧面板的资产详情。' },
            {
              title: '冻结说明',
              content: '您的资产冻结是由于进行中的交易订单，交易完成后将自动解冻。'
            }
          ]
        },
        {
          category: '交易',
          items: [
            { title: '订单状态', content: '已查到您的交易订单状态，正在为您核实处理，请稍候。' },
            { title: '取消订单', content: '已为您取消该订单，冻结资产将即时退还到您的账户。' }
          ]
        },
        {
          category: '抽奖',
          items: [
            {
              title: '概率说明',
              content:
                '抽奖概率机制：每次抽奖100%获得奖品，奖品分为高中低三个档位，具体概率在活动页面公示。'
            },
            {
              title: '保底规则',
              content: '系统设有保底机制，连续多次未获得高档位奖品时会触发保底，确保公平性。'
            }
          ]
        }
      ]
    }

    return res.apiSuccess(templates, '获取消息模板成功')
  } catch (error) {
    logger.error('获取消息模板失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * PUT /gm-tools/templates - 更新消息模板库
 *
 * @route PUT /api/v4/console/customer-service/gm-tools/templates
 * @body {Array} templates - 模板数据（分类+条目）
 */
router.put('/templates', requireRoleLevel(100), async (req, res) => {
  try {
    const { templates } = req.body
    if (!templates || !Array.isArray(templates)) {
      return res.apiError('模板数据格式错误', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models

    if (models.SystemConfig) {
      await models.SystemConfig.upsert({
        config_key: 'cs_reply_templates',
        config_value: JSON.stringify(templates),
        config_type: 'json',
        description: '客服消息回复模板库'
      })
    }

    return res.apiSuccess(templates, '消息模板更新成功')
  } catch (error) {
    logger.error('更新消息模板失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
