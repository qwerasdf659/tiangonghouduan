/**
 * 活动投放位置配置模块
 *
 * @file admin/src/modules/lottery/composables/placement.js
 * @description 管理活动在小程序中的展示位置、尺寸、优先级配置
 * @version 1.0.0
 * @date 2026-02-15
 *
 * 后端接口：
 * - GET  /api/v4/console/system/placement  — 获取当前位置配置
 * - PUT  /api/v4/console/system/placement  — 更新位置配置（保存后即时生效）
 *
 * 业务规则：
 * - 每页（page）最多 1 个 main 位置
 * - priority 范围 0-1000，数值越大越优先
 * - 保存后前端下次打开页面自动获取最新配置，无需版本号管理
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'

/**
 * 位置配置枚举常量（与后端 PLACEMENT_ENUMS 一致）
 */
const PLACEMENT_ENUMS = {
  /** 展示页面 */
  pages: [
    { value: 'lottery', label: '抽奖页' },
    { value: 'discover', label: '发现页' },
    { value: 'user', label: '个人中心' }
  ],
  /** 页面位置 */
  positions: [
    { value: 'main', label: '主位置' },
    { value: 'secondary', label: '次要位置' },
    { value: 'floating', label: '悬浮入口' },
    { value: 'top', label: '顶部' },
    { value: 'bottom', label: '底部' }
  ],
  /** 组件尺寸 */
  sizes: [
    { value: 'full', label: '全宽' },
    { value: 'medium', label: '中等' },
    { value: 'small', label: '小号' },
    { value: 'mini', label: '迷你' }
  ],
  /** 优先级范围 */
  priority: { min: 0, max: 1000 }
}

/**
 * 活动投放位置配置状态
 * @returns {Object} 状态对象
 */
export function usePlacementState() {
  return {
    /** @type {Array} 位置配置列表 */
    placements: [],
    /** @type {boolean} 是否正在保存位置配置 */
    savingPlacement: false,
    /** @type {Object} 位置配置枚举（与后端一致） */
    placementEnums: PLACEMENT_ENUMS,
    /** @type {Array} 位置配置校验错误 */
    placementErrors: []
  }
}

/**
 * 活动投放位置配置方法
 * @returns {Object} 方法对象
 */
export function usePlacementMethods() {
  return {
    /**
     * 加载当前位置配置
     */
    async loadPlacements() {
      try {
        logger.debug('📍 [Placement] 加载位置配置...')
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.PLACEMENT_GET,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response

        if (data) {
          this.placements = data.placements || []
          logger.debug('✅ [Placement] 加载完成, 共', this.placements.length, '条配置')
        }
      } catch (error) {
        logger.error('❌ [Placement] 加载失败:', error)
        this.placements = []
      }
    },

    /**
     * 添加一条位置配置
     */
    addPlacement() {
      this.placements.push({
        campaign_code: '',
        placement: {
          page: 'lottery',
          position: 'main',
          size: 'full',
          priority: 0
        }
      })
    },

    /**
     * 移除一条位置配置
     * @param {number} index - 索引
     */
    removePlacement(index) {
      this.placements.splice(index, 1)
    },

    /**
     * 校验位置配置（前端前置校验，与后端逻辑一致）
     * @returns {boolean} 校验是否通过
     */
    validatePlacements() {
      const errors = []
      const mainCountByPage = {}

      this.placements.forEach((item, index) => {
        const prefix = `配置#${index + 1}`

        if (!item.campaign_code || !item.campaign_code.trim()) {
          errors.push(`${prefix}: 活动代码不能为空`)
        }

        const p = item.placement
        if (!p) {
          errors.push(`${prefix}: 缺少位置信息`)
          return
        }

        const validPages = PLACEMENT_ENUMS.pages.map(o => o.value)
        if (!validPages.includes(p.page)) {
          errors.push(`${prefix}: 页面值无效（${p.page}）`)
        }

        const validPositions = PLACEMENT_ENUMS.positions.map(o => o.value)
        if (!validPositions.includes(p.position)) {
          errors.push(`${prefix}: 位置值无效（${p.position}）`)
        }

        const validSizes = PLACEMENT_ENUMS.sizes.map(o => o.value)
        if (!validSizes.includes(p.size)) {
          errors.push(`${prefix}: 尺寸值无效（${p.size}）`)
        }

        const priority = Number(p.priority)
        if (
          isNaN(priority) ||
          priority < PLACEMENT_ENUMS.priority.min ||
          priority > PLACEMENT_ENUMS.priority.max
        ) {
          errors.push(
            `${prefix}: 优先级超出范围（${p.priority}），允许 ${PLACEMENT_ENUMS.priority.min}-${PLACEMENT_ENUMS.priority.max}`
          )
        }

        // 每页最多 1 个 main
        if (p.position === 'main' && p.page) {
          mainCountByPage[p.page] = (mainCountByPage[p.page] || 0) + 1
          if (mainCountByPage[p.page] > 1) {
            const pageLabel = PLACEMENT_ENUMS.pages.find(o => o.value === p.page)?.label || p.page
            errors.push(
              `${prefix}: ${pageLabel}最多 1 个主位置，当前已有 ${mainCountByPage[p.page]} 个`
            )
          }
        }
      })

      this.placementErrors = errors
      return errors.length === 0
    },

    /**
     * 保存位置配置
     */
    async savePlacements() {
      // 前端校验
      if (!this.validatePlacements()) {
        this.showError('位置配置校验失败，请检查错误提示')
        return
      }

      try {
        this.savingPlacement = true
        logger.debug('📍 [Placement] 保存位置配置, 共', this.placements.length, '条')

        await this.apiCall(LOTTERY_ENDPOINTS.PLACEMENT_UPDATE, {
          method: 'PUT',
          data: { placements: this.placements }
        })

        this.showSuccess('位置配置保存成功（前端下次打开页面自动生效）')
        this.placementErrors = []
      } catch (error) {
        logger.error('❌ [Placement] 保存失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.savingPlacement = false
      }
    },

    /**
     * 获取活动代码选项列表（从已加载的活动列表生成）
     * @returns {Array} 活动代码选项
     */
    getCampaignCodeOptions() {
      return (this.campaigns || []).map(c => ({
        value: c.campaign_code,
        label: `${c.campaign_name} (${c.campaign_code})`
      }))
    },

    /**
     * 获取页面中文名
     * @param {string} page - 页面值
     * @returns {string} 中文名
     */
    getPageLabel(page) {
      return PLACEMENT_ENUMS.pages.find(o => o.value === page)?.label || page
    },

    /**
     * 获取位置中文名
     * @param {string} position - 位置值
     * @returns {string} 中文名
     */
    getPositionLabel(position) {
      return PLACEMENT_ENUMS.positions.find(o => o.value === position)?.label || position
    },

    /**
     * 获取尺寸中文名
     * @param {string} size - 尺寸值
     * @returns {string} 中文名
     */
    getSizeLabel(size) {
      return PLACEMENT_ENUMS.sizes.find(o => o.value === size)?.label || size
    }
  }
}

export default { usePlacementState, usePlacementMethods }
