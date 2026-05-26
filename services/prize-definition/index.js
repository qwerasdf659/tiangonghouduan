'use strict'

const PrizeDefinitionCrudService = require('./CrudService')
const PrizeDefinitionQueryService = require('./QueryService')

/**
 * 奖品目录服务门面（Facade）
 *
 * 职责：统一对外暴露奖品目录的所有操作
 * 设计模式：委托模式（同 prize-pool/index.js）
 * 注册键名：prize_definition（ServiceManager snake_case 规范）
 */
class PrizeDefinitionFacade {
  // ── CRUD 操作 ──

  /** @returns {Promise} 创建奖品定义 */
  static create(...args) {
    return PrizeDefinitionCrudService.create(...args)
  }

  /** @returns {Promise} 更新奖品定义 */
  static update(...args) {
    return PrizeDefinitionCrudService.update(...args)
  }

  /** @returns {Promise} 删除奖品定义（软删除） */
  static delete(...args) {
    return PrizeDefinitionCrudService.delete(...args)
  }

  /** @returns {Promise} 获取单个奖品定义 */
  static getById(...args) {
    return PrizeDefinitionCrudService.getById(...args)
  }

  // ── 查询操作 ──

  /** @returns {Promise} 分页查询奖品目录 */
  static list(...args) {
    return PrizeDefinitionQueryService.list(...args)
  }

  /** @returns {Promise} 获取下拉选项列表 */
  static getOptions(...args) {
    return PrizeDefinitionQueryService.getOptions(...args)
  }

  /** @returns {Promise} 获取奖品定义详情（含统计） */
  static getDetail(...args) {
    return PrizeDefinitionQueryService.getDetail(...args)
  }

  /** @returns {Promise} 按活动查询已关联奖品 */
  static getByCampaign(...args) {
    return PrizeDefinitionQueryService.getByCampaign(...args)
  }

  /** @returns {Promise} 按活动查询奖品并按档位分组 */
  static getByCampaignGrouped(...args) {
    return PrizeDefinitionQueryService.getByCampaignGrouped(...args)
  }
}

module.exports = PrizeDefinitionFacade
