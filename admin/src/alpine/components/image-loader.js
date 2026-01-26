/**
 * 图片加载组件（懒加载 + 模糊渐进加载）
 *
 * @file src/alpine/components/image-loader.js
 * @description 使用 IntersectionObserver 实现图片懒加载和模糊渐进效果
 * @version 1.0.0
 * @date 2026-01-27
 *
 * @example
 * // 基础懒加载
 * <img x-data="imageLoader" x-init="observe($el)" data-src="/path/to/image.jpg" alt="图片">
 *
 * // 模糊渐进加载
 * <div x-data="blurLoader" class="img-blur-load">
 *   <img data-src="/path/to/hd.jpg" data-placeholder="/path/to/tiny.jpg">
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 图片懒加载组件
 * @returns {Object} Alpine 组件数据
 */
export function imageLoader() {
  return {
    loaded: false,
    error: false,
    observer: null,

    /**
     * 初始化 IntersectionObserver
     */
    init() {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.loadImage(entry.target)
              this.observer.unobserve(entry.target)
            }
          })
        },
        {
          rootMargin: '50px 0px', // 提前 50px 开始加载
          threshold: 0.1
        }
      )
    },

    /**
     * 观察图片元素
     * @param {HTMLImageElement} el - 图片元素
     */
    observe(el) {
      if (!this.observer) this.init()

      const src = el.dataset.src
      if (!src) {
        logger.warn('[ImageLoader] 元素缺少 data-src 属性')
        return
      }

      // 添加懒加载类
      el.classList.add('img-lazy')
      this.observer.observe(el)
    },

    /**
     * 加载图片
     * @param {HTMLImageElement} el - 图片元素
     */
    loadImage(el) {
      const src = el.dataset.src
      if (!src) return

      // 创建临时图片预加载
      const img = new Image()
      img.onload = () => {
        el.src = src
        el.classList.add('loaded')
        this.loaded = true
        logger.debug('[ImageLoader] 图片加载完成:', src)
      }
      img.onerror = () => {
        el.classList.add('error')
        this.error = true
        logger.error('[ImageLoader] 图片加载失败:', src)
      }
      img.src = src
    },

    /**
     * 销毁组件
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect()
      }
    }
  }
}

/**
 * 模糊渐进加载组件
 * @returns {Object} Alpine 组件数据
 */
export function blurLoader() {
  return {
    loaded: false,

    /**
     * 初始化组件
     */
    init() {
      this.$nextTick(() => {
        const container = this.$el
        const img = container.querySelector('img')
        if (!img) return

        const hdSrc = img.dataset.src
        const placeholderSrc = img.dataset.placeholder

        // 先加载占位图
        if (placeholderSrc) {
          img.src = placeholderSrc
        }

        // 使用 IntersectionObserver 懒加载高清图
        const observer = new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting && hdSrc) {
                this.loadHDImage(img, hdSrc)
                observer.unobserve(container)
              }
            })
          },
          { rootMargin: '100px 0px', threshold: 0.1 }
        )

        observer.observe(container)
      })
    },

    /**
     * 加载高清图片
     * @param {HTMLImageElement} img - 图片元素
     * @param {string} src - 图片 URL
     */
    loadHDImage(img, src) {
      const hdImage = new Image()
      hdImage.onload = () => {
        img.src = src
        img.classList.add('loaded')
        this.loaded = true
        logger.debug('[BlurLoader] 高清图片加载完成:', src)
      }
      hdImage.onerror = () => {
        logger.error('[BlurLoader] 高清图片加载失败:', src)
      }
      hdImage.src = src
    }
  }
}

/**
 * 批量图片懒加载指令
 * @description 用于初始化页面上所有 data-src 图片的懒加载
 */
export function initLazyImages() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target
          const src = img.dataset.src
          if (src) {
            const hdImage = new Image()
            hdImage.onload = () => {
              img.src = src
              img.classList.add('loaded')
            }
            hdImage.src = src
          }
          observer.unobserve(img)
        }
      })
    },
    { rootMargin: '50px 0px', threshold: 0.1 }
  )

  // 观察所有 data-src 图片
  document.querySelectorAll('img[data-src]').forEach(img => {
    img.classList.add('img-lazy')
    observer.observe(img)
  })

  return observer
}

export default { imageLoader, blurLoader, initLazyImages }

