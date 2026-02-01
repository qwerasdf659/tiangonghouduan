/**
 * Alpine.js 测试辅助工具
 *
 * @file admin/tests/e2e/utils/alpine-helpers.js
 * @description 用于 Playwright E2E 测试的 Alpine.js 组件查找和操作工具
 * @date 2026-02-02
 *
 * 解决问题：
 * - 页面可能有多个嵌套的 Alpine 组件（如 financeNavigation + financePageContent）
 * - 简单的 querySelector('[x-data]') 只会获取第一个组件
 * - 需要智能查找包含目标方法的组件
 */

/**
 * 在页面中查找包含指定方法的 Alpine 组件
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {string} methodName - 要查找的方法名
 * @returns {Promise<{found: boolean, componentName?: string, error?: string, debug?: object}>}
 *
 * @example
 * const result = await findAlpineComponentWithMethod(page, 'approveConsumption')
 * if (result.found) {
 *   console.log(`Found in component: ${result.componentName}`)
 * }
 */
async function findAlpineComponentWithMethod(page, methodName) {
  return await page.evaluate((method) => {
    if (!window.Alpine) {
      return { found: false, error: 'Alpine.js not loaded' }
    }

    const alpineElements = document.querySelectorAll('[x-data]')
    if (alpineElements.length === 0) {
      return { found: false, error: 'No Alpine components found on page' }
    }

    for (const el of alpineElements) {
      const data = window.Alpine.$data(el)
      if (data && typeof data[method] === 'function') {
        return {
          found: true,
          componentName: el.getAttribute('x-data'),
          hasData: !!data
        }
      }
    }

    // 未找到，返回调试信息
    const debugInfo = []
    for (const el of alpineElements) {
      const data = window.Alpine.$data(el)
      const componentName = el.getAttribute('x-data')
      const methods = data ? Object.keys(data).filter((k) => typeof data[k] === 'function') : []
      debugInfo.push({
        component: componentName,
        methodCount: methods.length,
        sampleMethods: methods.slice(0, 5)
      })
    }

    return {
      found: false,
      error: `Method '${method}' not found in any Alpine component`,
      debug: { components: debugInfo, totalComponents: alpineElements.length }
    }
  }, methodName)
}

/**
 * 在指定的 Alpine 组件上调用方法
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {string} methodName - 要调用的方法名
 * @param {any[]} args - 方法参数
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 *
 * @example
 * const record = { record_id: 123, status: 'pending' }
 * const result = await callAlpineMethod(page, 'approveConsumption', [record])
 */
async function callAlpineMethod(page, methodName, args = []) {
  return await page.evaluate(
    async ({ method, methodArgs }) => {
      if (!window.Alpine) {
        return { success: false, error: 'Alpine.js not loaded' }
      }

      // 遍历所有组件找到包含目标方法的组件
      const alpineElements = document.querySelectorAll('[x-data]')

      for (const el of alpineElements) {
        const data = window.Alpine.$data(el)
        if (data && typeof data[method] === 'function') {
          try {
            const result = await data[method](...methodArgs)
            return { success: true, result, component: el.getAttribute('x-data') }
          } catch (e) {
            return { success: false, error: e.message, component: el.getAttribute('x-data') }
          }
        }
      }

      return { success: false, error: `Method '${method}' not found in any Alpine component` }
    },
    { method: methodName, methodArgs: args }
  )
}

/**
 * 获取 Alpine 组件的数据属性值
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {string} propertyName - 属性名（如 'consumptions', 'selectedIds'）
 * @returns {Promise<{found: boolean, value?: any, componentName?: string, error?: string}>}
 *
 * @example
 * const result = await getAlpineData(page, 'consumptions')
 * if (result.found) {
 *   console.log(`Found ${result.value.length} consumptions`)
 * }
 */
async function getAlpineData(page, propertyName) {
  return await page.evaluate((prop) => {
    if (!window.Alpine) {
      return { found: false, error: 'Alpine.js not loaded' }
    }

    const alpineElements = document.querySelectorAll('[x-data]')

    for (const el of alpineElements) {
      const data = window.Alpine.$data(el)
      if (data && prop in data) {
        return {
          found: true,
          value: data[prop],
          componentName: el.getAttribute('x-data')
        }
      }
    }

    return { found: false, error: `Property '${prop}' not found in any Alpine component` }
  }, propertyName)
}

/**
 * 列出页面上所有 Alpine 组件及其方法（用于调试）
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<Array<{name: string, methods: string[], properties: string[]}>>}
 */
async function listAlpineComponents(page) {
  return await page.evaluate(() => {
    if (!window.Alpine) {
      return []
    }

    const alpineElements = document.querySelectorAll('[x-data]')
    const components = []

    for (const el of alpineElements) {
      const data = window.Alpine.$data(el)
      if (data) {
        const keys = Object.keys(data)
        components.push({
          name: el.getAttribute('x-data'),
          methods: keys.filter((k) => typeof data[k] === 'function'),
          properties: keys.filter((k) => typeof data[k] !== 'function')
        })
      }
    }

    return components
  })
}

module.exports = {
  findAlpineComponentWithMethod,
  callAlpineMethod,
  getAlpineData,
  listAlpineComponents
}

