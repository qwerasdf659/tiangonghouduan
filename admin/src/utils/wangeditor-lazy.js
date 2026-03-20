/**
 * WangEditor 富文本编辑器懒加载封装
 *
 * @description 按需加载 WangEditor，仅在需要富文本编辑的页面导入。
 *              提供创建和销毁编辑器的统一方法。
 *
 * @usage
 *   import { createRichEditor, destroyRichEditor } from '@/utils/wangeditor-lazy.js'
 *
 *   // 创建编辑器
 *   const editor = await createRichEditor('#editor-container', {
 *     initialHtml: '<p>初始内容</p>',
 *     onChange: (html) => { this.itemForm.description = html }
 *   })
 *
 *   // 销毁编辑器（组件卸载时调用）
 *   destroyRichEditor(editor)
 *
 * @module utils/wangeditor-lazy
 * @version 1.0.0
 */

import { logger } from './logger.js'

/** @type {boolean} CSS 是否已加载 */
let _cssLoaded = false

/** @type {Object|null} 缓存的 WangEditor 模块 */
let _wangEditorModule = null

/**
 * 懒加载 WangEditor 模块
 * @returns {Promise<Object>} WangEditor 模块（含 createEditor/createToolbar）
 */
async function loadWangEditor() {
  if (_wangEditorModule) return _wangEditorModule
  try {
    if (!_cssLoaded) {
      await import('@wangeditor/editor/dist/css/style.css')
      _cssLoaded = true
    }
    _wangEditorModule = await import('@wangeditor/editor')
    logger.debug('[WangEditor] 模块加载完成')
    return _wangEditorModule
  } catch (error) {
    logger.error('[WangEditor] 模块加载失败:', error)
    return null
  }
}

/**
 * 创建富文本编辑器实例
 *
 * @param {string} editorSelector - 编辑器容器 CSS 选择器
 * @param {Object} options - 配置选项
 * @param {string} [options.toolbarSelector] - 工具栏容器选择器（默认在编辑器上方自动创建）
 * @param {string} [options.initialHtml=''] - 初始 HTML 内容
 * @param {Function} [options.onChange] - 内容变化回调 (html) => void
 * @param {string} [options.placeholder='请输入商品描述...'] - 占位文本
 * @param {number} [options.maxLength=10000] - 最大字符数
 * @returns {Promise<{editor: Object, toolbar: Object}|null>} 编辑器和工具栏实例
 */
export async function createRichEditor(editorSelector, options = {}) {
  const wangEditor = await loadWangEditor()
  if (!wangEditor) return null

  const editorContainer = document.querySelector(editorSelector)
  if (!editorContainer) {
    logger.error('[WangEditor] 编辑器容器不存在:', editorSelector)
    return null
  }

  // 自动创建工具栏容器（如果未指定）
  let toolbarContainer
  if (options.toolbarSelector) {
    toolbarContainer = document.querySelector(options.toolbarSelector)
  } else {
    toolbarContainer = document.createElement('div')
    toolbarContainer.style.borderBottom = '1px solid #e5e7eb'
    editorContainer.parentNode.insertBefore(toolbarContainer, editorContainer)
  }

  const editorConfig = {
    placeholder: options.placeholder || '请输入商品描述...',
    maxLength: options.maxLength || 10000,
    onChange(editor) {
      if (options.onChange) {
        options.onChange(editor.getHtml())
      }
    }
  }

  // 精简工具栏配置（适合商品描述场景）
  const toolbarConfig = {
    excludeKeys: [
      'group-video',
      'insertVideo',
      'fullScreen',
      'codeBlock',
      'code',
      'todo',
      'emotion'
    ]
  }

  try {
    const editor = wangEditor.createEditor({
      selector: editorSelector,
      html: options.initialHtml || '',
      config: editorConfig,
      mode: 'simple'
    })

    const toolbar = wangEditor.createToolbar({
      editor,
      selector: toolbarContainer,
      config: toolbarConfig,
      mode: 'simple'
    })

    logger.debug('[WangEditor] 编辑器创建成功')
    return { editor, toolbar }
  } catch (error) {
    logger.error('[WangEditor] 编辑器创建失败:', error)
    return null
  }
}

/**
 * 销毁富文本编辑器实例
 * @param {{editor: Object, toolbar: Object}|null} instance - createRichEditor 返回的实例
 */
export function destroyRichEditor(instance) {
  if (!instance?.editor) return
  try {
    instance.editor.destroy()
    logger.debug('[WangEditor] 编辑器已销毁')
  } catch (error) {
    logger.warn('[WangEditor] 编辑器销毁失败:', error)
  }
}
