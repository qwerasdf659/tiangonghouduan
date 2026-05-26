/**
 * 奖品目录管理 composable
 *
 * @module modules/prize-definition/composables/prize-definitions
 * @description 奖品目录 CRUD、分页查询、表单管理
 */

import { logger } from '../../../utils/logger.js'
import { PrizeDefinitionAPI } from '../../../api/lottery/prize-definitions.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

/**
 * 奖品目录页面状态
 */
export function usePrizeDefinitionState() {
  return {
    ...createPageMixin({
      pagination: true,
      asyncData: true,
      modal: true,
      formValidation: true,
      authGuard: true
    }),

    // 列表数据
    prize_definitions: [],
    total: 0,

    // 筛选条件
    filters: {
      prize_type: '',
      rarity_code: '',
      reward_tier: '',
      keyword: '',
      is_enabled: ''
    },

    // 表单数据
    form: {
      prize_code: '',
      display_name: '',
      prize_type: 'material',
      material_asset_code: '',
      material_amount: null,
      item_template_id: null,
      rarity_code: 'common',
      primary_media_id: null,
      reward_tier: 'low',
      is_enabled: true,
      description: ''
    },

    // 编辑状态
    editing_id: null,
    form_visible: false,
    detail_visible: false,
    current_detail: null,

    // 选项数据
    rarity_options: [
      { value: 'common', label: '普通', color: '#9E9E9E' },
      { value: 'uncommon', label: '稀有', color: '#4CAF50' },
      { value: 'rare', label: '精良', color: '#2196F3' },
      { value: 'epic', label: '史诗', color: '#9C27B0' },
      { value: 'legendary', label: '传说', color: '#FF9800' }
    ],

    tier_options: [
      { value: 'high', label: '高档位' },
      { value: 'mid', label: '中档位' },
      { value: 'low', label: '低档位' }
    ],

    type_options: [
      { value: 'material', label: '材料资产' },
      { value: 'item', label: '物品' },
      { value: 'coupon', label: '优惠券' },
      { value: 'points', label: '积分' }
    ]
  }
}

/**
 * 奖品目录页面方法
 */
export function usePrizeDefinitionMethods() {
  return {
    async init() {
      logger.info('[PrizeDefinition] 页面初始化')
      await this.loadList()
    },

    /** 加载奖品目录列表 */
    async loadList() {
      try {
        this.loading = true
        const params = {
          page: this.current_page,
          page_size: this.page_size,
          ...this.getActiveFilters()
        }

        const res = await PrizeDefinitionAPI.list(params)
        if (res && res.success) {
          this.prize_definitions = res.data?.items || res.data?.list || []
          this.total = res.data?.total || 0
          this.total_records = this.total
        }
      } catch (error) {
        logger.error('[PrizeDefinition] 加载列表失败', error)
        Alpine.store('notification').show('加载奖品目录失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /** 获取有效的筛选条件（过滤空值） */
    getActiveFilters() {
      const active = {}
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          active[key] = value
        }
      })
      return active
    },

    /** 搜索（重置到第一页） */
    async handleSearch() {
      this.current_page = 1
      await this.loadList()
    },

    /** 重置筛选条件 */
    async resetFilters() {
      this.filters = {
        prize_type: '',
        rarity_code: '',
        reward_tier: '',
        keyword: '',
        is_enabled: ''
      }
      this.current_page = 1
      await this.loadList()
    },

    /** 翻页 */
    async handlePageChange(page) {
      this.current_page = page
      await this.loadList()
    },

    /** 打开创建表单 */
    openCreateForm() {
      this.editing_id = null
      this.resetForm()
      this.form_visible = true
    },

    /** 打开编辑表单 */
    openEditForm(item) {
      this.editing_id = item.prize_definition_id
      this.form = {
        prize_code: item.prize_code,
        display_name: item.display_name,
        prize_type: item.prize_type,
        material_asset_code: item.material_asset_code || '',
        material_amount: item.material_amount,
        item_template_id: item.item_template_id,
        rarity_code: item.rarity_code,
        primary_media_id: item.primary_media_id,
        reward_tier: item.reward_tier,
        is_enabled: item.is_enabled ? true : false,
        description: item.description || ''
      }
      this.form_visible = true
    },

    /** 重置表单 */
    resetForm() {
      this.form = {
        prize_code: '',
        display_name: '',
        prize_type: 'material',
        material_asset_code: '',
        material_amount: null,
        item_template_id: null,
        rarity_code: 'common',
        primary_media_id: null,
        reward_tier: 'low',
        is_enabled: true,
        description: ''
      }
    },

    /** 提交表单（创建或更新） */
    async submitForm() {
      try {
        this.loading = true
        const data = { ...this.form }
        if (data.is_enabled === true) data.is_enabled = 1
        if (data.is_enabled === false) data.is_enabled = 0

        let res
        if (this.editing_id) {
          res = await PrizeDefinitionAPI.update(this.editing_id, data)
        } else {
          res = await PrizeDefinitionAPI.create(data)
        }

        if (res && res.success) {
          Alpine.store('notification').show(
            this.editing_id ? '奖品定义更新成功' : '奖品定义创建成功',
            'success'
          )
          this.form_visible = false
          await this.loadList()
        } else {
          Alpine.store('notification').show(res?.message || '操作失败', 'error')
        }
      } catch (error) {
        logger.error('[PrizeDefinition] 提交表单失败', error)
        Alpine.store('notification').show('操作失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /** 删除奖品定义 */
    async deleteItem(item) {
      if (!confirm(`确定要删除奖品「${item.display_name}」吗？`)) return

      try {
        this.loading = true
        const res = await PrizeDefinitionAPI.delete(item.prize_definition_id)
        if (res && res.success) {
          Alpine.store('notification').show('奖品定义删除成功', 'success')
          await this.loadList()
        } else {
          Alpine.store('notification').show(res?.message || '删除失败', 'error')
        }
      } catch (error) {
        logger.error('[PrizeDefinition] 删除失败', error)
        Alpine.store('notification').show('删除失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /** 查看详情 */
    async viewDetail(item) {
      try {
        const res = await PrizeDefinitionAPI.getDetail(item.prize_definition_id)
        if (res && res.success) {
          this.current_detail = res.data
          this.detail_visible = true
        }
      } catch (error) {
        logger.error('[PrizeDefinition] 获取详情失败', error)
        Alpine.store('notification').show('获取详情失败: ' + error.message, 'error')
      }
    },

    /** 关闭详情 */
    closeDetail() {
      this.detail_visible = false
      this.current_detail = null
    },

    /** 获取稀有度标签样式 */
    getRarityStyle(rarity_code) {
      const option = this.rarity_options.find(o => o.value === rarity_code)
      return option ? `color: ${option.color}; font-weight: 600;` : ''
    },

    /** 获取稀有度中文名 */
    getRarityLabel(rarity_code) {
      const option = this.rarity_options.find(o => o.value === rarity_code)
      return option ? option.label : rarity_code
    },

    /** 获取档位中文名 */
    getTierLabel(reward_tier) {
      const option = this.tier_options.find(o => o.value === reward_tier)
      return option ? option.label : reward_tier
    },

    /** 获取类型中文名 */
    getTypeLabel(prize_type) {
      const option = this.type_options.find(o => o.value === prize_type)
      return option ? option.label : prize_type
    }
  }
}
