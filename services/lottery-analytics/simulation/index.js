'use strict'

const SimulationCoreService = require('./CoreService')
const SimulationApplyService = require('./ApplyService')
const SimulationMonitorService = require('./MonitorService')
const SimulationRecordService = require('./RecordService')

/**
 * StrategySimulationFacade - 策略模拟服务门面
 *
 * 委托所有公开方法到对应子服务，保持对外接口不变。
 * 替代原 StrategySimulationService (2317行)。
 */
/* eslint-disable require-jsdoc */
class StrategySimulationFacade {
  constructor(models) {
    this._core = new SimulationCoreService(models)
    this._apply = new SimulationApplyService(models)
    this._monitor = new SimulationMonitorService(models)
    this._record = new SimulationRecordService(models)
  }

  // Core
  loadBaseline(...args) {
    return this._core.loadBaseline(...args)
  }

  runSimulation(...args) {
    return this._core.runSimulation(...args)
  }

  simulateUserJourney(...args) {
    return this._core.simulateUserJourney(...args)
  }

  runSensitivityAnalysis(...args) {
    return this._core.runSensitivityAnalysis(...args)
  }

  recommendConfig(...args) {
    return this._core.recommendConfig(...args)
  }

  // Apply / Rollback
  applySimulation(...args) {
    return this._apply.applySimulation(...args)
  }

  scheduleConfigActivation(...args) {
    return this._apply.scheduleConfigActivation(...args)
  }

  executeScheduledActivations(...args) {
    return this._apply.executeScheduledActivations(...args)
  }

  getConfigVersionHistory(...args) {
    return this._apply.getConfigVersionHistory(...args)
  }

  rollbackConfig(...args) {
    return this._apply.rollbackConfig(...args)
  }

  // Monitor
  getBudgetPacingForecast(...args) {
    return this._monitor.getBudgetPacingForecast(...args)
  }

  createCircuitBreakerRules(...args) {
    return this._monitor.createCircuitBreakerRules(...args)
  }

  checkCircuitBreakerStatus(...args) {
    return this._monitor.checkCircuitBreakerStatus(...args)
  }

  calculateDrift(...args) {
    return this._monitor.calculateDrift(...args)
  }

  // Record
  saveSimulationRecord(...args) {
    return this._record.saveSimulationRecord(...args)
  }

  getSimulationHistory(...args) {
    return this._record.getSimulationHistory(...args)
  }

  getSimulationRecord(...args) {
    return this._record.getSimulationRecord(...args)
  }
}

module.exports = StrategySimulationFacade
