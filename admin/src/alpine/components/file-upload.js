/**
 * 文件上传拖拽组件
 *
 * @file src/alpine/components/file-upload.js
 * @description 支持拖放上传、多文件、预览等功能
 * @version 1.0.0
 * @date 2026-01-27
 *
 * @example
 * <div x-data="fileUpload({ accept: 'image/*', multiple: true, maxSize: 5 * 1024 * 1024 })">
 *   <div class="drop-zone" @dragover.prevent="dragover = true" @dragleave="dragover = false"
 *        @drop.prevent="handleDrop($event)" :class="{ 'drag-over': dragover }">
 *     <input type="file" x-ref="input" @change="handleSelect($event)" :accept="accept" :multiple="multiple" class="hidden">
 *     <div class="text-center py-8">
 *       <p>拖拽文件到此处，或 <button @click="$refs.input.click()" class="text-blue-500">点击选择</button></p>
 *     </div>
 *   </div>
 *   <template x-for="file in files" :key="file.id">
 *     <div class="flex items-center p-2 border rounded mt-2">
 *       <img x-show="file.preview" :src="file.preview" class="w-10 h-10 object-cover rounded mr-2">
 *       <span x-text="file.name" class="flex-1"></span>
 *       <button @click="removeFile(file.id)" class="text-red-500">×</button>
 *     </div>
 *   </template>
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 文件上传组件
 * @param {Object} config - 配置选项
 * @param {string} config.accept - 接受的文件类型
 * @param {boolean} config.multiple - 是否多文件
 * @param {number} config.maxSize - 最大文件大小（字节）
 * @param {number} config.maxFiles - 最大文件数量
 * @param {Function} config.onUpload - 上传处理函数
 * @param {Function} config.onError - 错误处理函数
 * @returns {Object} Alpine 组件数据
 */
export function fileUpload(config = {}) {
  return {
    files: [],
    dragover: false,
    uploading: false,
    progress: 0,
    accept: config.accept || '*/*',
    multiple: config.multiple || false,
    maxSize: config.maxSize || 10 * 1024 * 1024, // 默认 10MB
    maxFiles: config.maxFiles || 10,
    _onUpload: config.onUpload || null,
    _onError: config.onError || null,

    /**
     * 处理拖放
     * @param {DragEvent} event - 拖放事件
     */
    handleDrop(event) {
      this.dragover = false
      const files = event.dataTransfer.files
      this.processFiles(files)
    },

    /**
     * 处理文件选择
     * @param {Event} event - change 事件
     */
    handleSelect(event) {
      const files = event.target.files
      this.processFiles(files)
      // 重置 input 以允许选择相同文件
      event.target.value = ''
    },

    /**
     * 处理文件列表
     * @param {FileList} fileList - 文件列表
     */
    processFiles(fileList) {
      const newFiles = Array.from(fileList)

      // 检查文件数量限制
      if (!this.multiple && newFiles.length > 1) {
        this.showError('只能上传一个文件')
        return
      }

      if (this.files.length + newFiles.length > this.maxFiles) {
        this.showError(`最多只能上传 ${this.maxFiles} 个文件`)
        return
      }

      // 验证并添加文件
      newFiles.forEach(file => {
        // 检查文件大小
        if (file.size > this.maxSize) {
          this.showError(`文件 ${file.name} 超过大小限制 (${this.formatSize(this.maxSize)})`)
          return
        }

        // 检查文件类型
        if (this.accept !== '*/*' && !this.isValidType(file, this.accept)) {
          this.showError(`文件 ${file.name} 类型不被接受`)
          return
        }

        // 创建文件对象
        const fileObj = {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file: file,
          name: file.name,
          size: file.size,
          type: file.type,
          preview: null,
          progress: 0,
          status: 'pending' // pending, uploading, success, error
        }

        // 生成预览（图片）
        if (file.type.startsWith('image/')) {
          this.generatePreview(fileObj)
        }

        this.files.push(fileObj)
        logger.debug('[FileUpload] 添加文件:', file.name)
      })
    },

    /**
     * 生成图片预览
     * @param {Object} fileObj - 文件对象
     */
    generatePreview(fileObj) {
      const reader = new FileReader()
      reader.onload = e => {
        fileObj.preview = e.target.result
      }
      reader.readAsDataURL(fileObj.file)
    },

    /**
     * 验证文件类型
     * @param {File} file - 文件
     * @param {string} accept - 接受的类型
     * @returns {boolean} 是否有效
     */
    isValidType(file, accept) {
      const acceptTypes = accept.split(',').map(t => t.trim())
      return acceptTypes.some(type => {
        if (type.startsWith('.')) {
          // 扩展名匹配
          return file.name.toLowerCase().endsWith(type.toLowerCase())
        } else if (type.endsWith('/*')) {
          // MIME 类型前缀匹配
          return file.type.startsWith(type.replace('/*', '/'))
        } else {
          // 精确 MIME 类型匹配
          return file.type === type
        }
      })
    },

    /**
     * 移除文件
     * @param {string} fileId - 文件 ID
     */
    removeFile(fileId) {
      const index = this.files.findIndex(f => f.id === fileId)
      if (index > -1) {
        this.files.splice(index, 1)
      }
    },

    /**
     * 清空所有文件
     */
    clearFiles() {
      this.files = []
    },

    /**
     * 上传所有文件
     */
    async uploadAll() {
      if (this.files.length === 0) return

      this.uploading = true

      for (const fileObj of this.files) {
        if (fileObj.status !== 'pending') continue

        try {
          fileObj.status = 'uploading'

          if (this._onUpload) {
            await this._onUpload(fileObj.file, progress => {
              fileObj.progress = progress
            })
          }

          fileObj.status = 'success'
          fileObj.progress = 100
        } catch (error) {
          fileObj.status = 'error'
          logger.error('[FileUpload] 上传失败:', error)
        }
      }

      this.uploading = false
    },

    /**
     * 显示错误
     * @param {string} message - 错误信息
     */
    showError(message) {
      if (this._onError) {
        this._onError(message)
      } else {
        // 尝试使用 toast store
        const toast = Alpine.store('toast')
        if (toast) {
          toast.error(message)
        } else {
          alert(message)
        }
      }
    },

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    },

    /**
     * 获取文件图标
     * @param {Object} fileObj - 文件对象
     * @returns {string} 图标 emoji
     */
    getFileIcon(fileObj) {
      const type = fileObj.type
      if (type.startsWith('image/')) return '🖼️'
      if (type.startsWith('video/')) return '🎬'
      if (type.startsWith('audio/')) return '🎵'
      if (type.includes('pdf')) return '📄'
      if (type.includes('word') || type.includes('document')) return '📝'
      if (type.includes('excel') || type.includes('spreadsheet')) return '📊'
      if (type.includes('zip') || type.includes('rar')) return '📦'
      return '📎'
    }
  }
}

export default { fileUpload }

