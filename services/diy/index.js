/**
 * DIY 饰品设计引擎 — 服务统一入口
 *
 * 从 DIYService.js（1646行）拆分为 4 个子模块：
 * - TemplateService: 款式模板 CRUD（管理端 + 用户端查询）
 * - WorkService: 用户作品 CRUD + 状态流转（确认/完成/取消设计）
 * - MaterialService: 珠子/素材 CRUD（管理端 + 用户端查询）
 * - AdminQueryService: 管理端作品列表/详情/统计查询
 *
 * DiyServiceFacade 作为路由层的统一入口，委托到对应子服务
 * 路由通过 getService('diy') 获取 Facade，无需感知内部拆分
 *
 * @module services/diy
 */

'use strict'

const DiyTemplateService = require('./TemplateService')
const DiyWorkService = require('./WorkService')
const DiyMaterialService = require('./MaterialService')
const DiyAdminQueryService = require('./AdminQueryService')

/**
 * DIY 服务门面 — 路由层统一入口
 * 将方法调用委托到对应的子服务，保持路由层 API 不变
 */
/* eslint-disable require-jsdoc */
class DiyServiceFacade {
  // ── 模板域（委托 TemplateService）──
  static getTemplateList(...args) {
    return DiyTemplateService.getTemplateList(...args)
  }

  static getTemplateDetail(...args) {
    return DiyTemplateService.getTemplateDetail(...args)
  }

  static createTemplate(...args) {
    return DiyTemplateService.createTemplate(...args)
  }

  static updateTemplate(...args) {
    return DiyTemplateService.updateTemplate(...args)
  }

  static updateTemplateStatus(...args) {
    return DiyTemplateService.updateTemplateStatus(...args)
  }

  static deleteTemplate(...args) {
    return DiyTemplateService.deleteTemplate(...args)
  }

  static getUserTemplates(...args) {
    return DiyTemplateService.getUserTemplates(...args)
  }

  // ── 作品域（委托 WorkService）──
  static getWorkList(...args) {
    return DiyWorkService.getWorkList(...args)
  }

  static getWorkDetail(...args) {
    return DiyWorkService.getWorkDetail(...args)
  }

  static saveWork(...args) {
    return DiyWorkService.saveWork(...args)
  }

  static deleteWork(...args) {
    return DiyWorkService.deleteWork(...args)
  }

  static confirmDesign(...args) {
    return DiyWorkService.confirmDesign(...args)
  }

  static completeDesign(...args) {
    return DiyWorkService.completeDesign(...args)
  }

  static cancelDesign(...args) {
    return DiyWorkService.cancelDesign(...args)
  }

  static getPaymentAssets(...args) {
    return DiyWorkService.getPaymentAssets(...args)
  }

  static getAccountIdByUserId(...args) {
    return DiyWorkService.getAccountIdByUserId(...args)
  }

  static updateWorkAddress(...args) {
    return DiyWorkService.updateWorkAddress(...args)
  }

  // ── 素材域（委托 MaterialService）──
  static getAdminMaterialList(...args) {
    return DiyMaterialService.getAdminMaterialList(...args)
  }

  static getAdminMaterialDetail(...args) {
    return DiyMaterialService.getAdminMaterialDetail(...args)
  }

  static createMaterial(...args) {
    return DiyMaterialService.createMaterial(...args)
  }

  static updateMaterial(...args) {
    return DiyMaterialService.updateMaterial(...args)
  }

  static deleteMaterial(...args) {
    return DiyMaterialService.deleteMaterial(...args)
  }

  static getUserMaterials(...args) {
    return DiyMaterialService.getUserMaterials(...args)
  }

  static getMaterialGroups(...args) {
    return DiyMaterialService.getMaterialGroups(...args)
  }

  // ── 管理端查询域（委托 AdminQueryService）──
  static getAdminWorkList(...args) {
    return DiyAdminQueryService.getAdminWorkList(...args)
  }

  static getAdminWorkDetail(...args) {
    return DiyAdminQueryService.getAdminWorkDetail(...args)
  }

  static getAdminStats(...args) {
    return DiyAdminQueryService.getAdminStats(...args)
  }

  static getWorkExchangeRecord(...args) {
    return DiyAdminQueryService.getWorkExchangeRecord(...args)
  }
}

module.exports = {
  DiyServiceFacade,
  DiyTemplateService,
  DiyWorkService,
  DiyMaterialService,
  DiyAdminQueryService
}
