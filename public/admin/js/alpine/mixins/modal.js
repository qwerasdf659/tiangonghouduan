/**
 * Modal 管理 Mixin
 * 解决：重复的 Bootstrap Modal 实例管理（约 15 行/页面）
 * 
 * @file public/admin/js/alpine/mixins/modal.js
 * @description 提供统一的 Modal 实例管理、显示/隐藏控制
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * function myPage() {
 *   return {
 *     ...modalMixin(),
 *     openAddForm() {
 *       this.resetForm()
 *       this.showModal('addModal')
 *     },
 *     async saveForm() {
 *       // 保存逻辑...
 *       this.hideModal('addModal')
 *     }
 *   }
 * }
 * 
 * // HTML 中使用：
 * // <div class="modal" x-ref="addModal">...</div>
 * // <button @click="openAddForm()">新增</button>
 */
function modalMixin() {
  return {
    // ========== 私有状态 ==========
    
    /** Modal 实例缓存 */
    _modalInstances: {},
    
    // ========== 方法 ==========
    
    /**
     * 获取或创建 Modal 实例
     * 
     * @param {string} refName - $refs 中的引用名称
     * @returns {bootstrap.Modal|null} Modal 实例
     */
    getModal(refName) {
      // 检查缓存
      if (this._modalInstances[refName]) {
        return this._modalInstances[refName]
      }
      
      // 获取 DOM 元素
      const element = this.$refs[refName]
      if (!element) {
        console.warn(`[ModalMixin] 未找到 Modal 引用: ${refName}`)
        return null
      }
      
      // 检查 Bootstrap 是否可用
      if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
        console.error('[ModalMixin] Bootstrap Modal 未加载')
        return null
      }
      
      // 检查是否已有实例
      let instance = bootstrap.Modal.getInstance(element)
      
      // 如果没有实例，创建新的
      if (!instance) {
        instance = new bootstrap.Modal(element)
      }
      
      // 缓存实例
      this._modalInstances[refName] = instance
      
      return instance
    },
    
    /**
     * 显示模态框
     * 
     * @param {string} refName - $refs 中的引用名称
     * @returns {boolean} 是否成功显示
     */
    showModal(refName) {
      const modal = this.getModal(refName)
      if (modal) {
        modal.show()
        console.log(`[ModalMixin] 显示 Modal: ${refName}`)
        return true
      }
      return false
    },
    
    /**
     * 隐藏模态框
     * 
     * @param {string} refName - $refs 中的引用名称
     * @returns {boolean} 是否成功隐藏
     */
    hideModal(refName) {
      // 优先从缓存获取
      let modal = this._modalInstances[refName]
      
      // 如果缓存没有，尝试从 DOM 获取已存在的实例
      if (!modal && this.$refs[refName]) {
        modal = bootstrap.Modal?.getInstance(this.$refs[refName])
      }
      
      if (modal) {
        modal.hide()
        console.log(`[ModalMixin] 隐藏 Modal: ${refName}`)
        return true
      }
      
      return false
    },
    
    /**
     * 切换模态框显示状态
     * 
     * @param {string} refName - $refs 中的引用名称
     * @returns {boolean} 是否成功切换
     */
    toggleModal(refName) {
      const modal = this.getModal(refName)
      if (modal) {
        modal.toggle()
        console.log(`[ModalMixin] 切换 Modal: ${refName}`)
        return true
      }
      return false
    },
    
    /**
     * 检查模态框是否正在显示
     * 
     * @param {string} refName - $refs 中的引用名称
     * @returns {boolean} 是否正在显示
     */
    isModalShown(refName) {
      const element = this.$refs[refName]
      if (!element) return false
      
      return element.classList.contains('show')
    },
    
    /**
     * 销毁模态框实例
     * 用于页面卸载时清理资源
     * 
     * @param {string} refName - $refs 中的引用名称
     */
    destroyModal(refName) {
      const modal = this._modalInstances[refName]
      if (modal) {
        modal.dispose()
        delete this._modalInstances[refName]
        console.log(`[ModalMixin] 销毁 Modal: ${refName}`)
      }
    },
    
    /**
     * 销毁所有模态框实例
     * 用于页面卸载时清理所有资源
     */
    destroyAllModals() {
      Object.keys(this._modalInstances).forEach(refName => {
        this.destroyModal(refName)
      })
    },
    
    /**
     * 绑定模态框事件
     * 
     * @param {string} refName - $refs 中的引用名称
     * @param {string} eventName - 事件名称 (show.bs.modal, shown.bs.modal, hide.bs.modal, hidden.bs.modal)
     * @param {Function} callback - 回调函数
     */
    onModalEvent(refName, eventName, callback) {
      const element = this.$refs[refName]
      if (element) {
        element.addEventListener(eventName, callback)
      }
    },
    
    /**
     * 快捷方法：显示确认删除模态框
     * 
     * @param {Object} item - 要删除的项目数据
     * @param {string} [modalRef='deleteModal'] - Modal 引用名
     */
    showDeleteConfirm(item, modalRef = 'deleteModal') {
      this.itemToDelete = item
      this.showModal(modalRef)
    },
    
    /**
     * 快捷方法：显示编辑模态框
     * 
     * @param {Object} item - 要编辑的项目数据
     * @param {string} [modalRef='editModal'] - Modal 引用名
     */
    showEditModal(item, modalRef = 'editModal') {
      // 深拷贝避免直接修改原数据
      this.editForm = JSON.parse(JSON.stringify(item))
      this.editingId = item.id || item[Object.keys(item)[0]]
      this.showModal(modalRef)
    }
  }
}

// 导出到全局作用域
window.modalMixin = modalMixin

console.log('✅ Modal Mixin 已加载')

