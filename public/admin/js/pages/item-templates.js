/**
 * 物品模板管理页面 Alpine.js 组件
 * 从 item-templates.html 内嵌脚本迁移
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('itemTemplatesPage', () => ({
    templates: [],
    filters: {
      type: '',
      rarity: '',
      status: '',
      search: '',
    },
    stats: {
      total: 0,
      types: 0,
      active: 0,
      rarities: 0,
    },
    form: {
      templateId: '',
      displayName: '',
      templateCode: '',
      itemType: 'voucher',
      rarityCode: 'common',
      isEnabled: true,
      imageUrl: '',
      referencePricePoints: 0,
      description: '',
      meta: '',
    },
    isSubmitting: false,
    typeIcons: {
      voucher: '🎫', coupon: '🎫', points: '💰',
      gift: '🎁', virtual: '✨', material: '📦'
    },
    rarityLabels: {
      common: '普通', uncommon: '优良', rare: '稀有',
      epic: '史诗', legendary: '传说'
    },

    init() {
      this.loadTemplates();
    },

    getTypeIcon(itemType) {
      return this.typeIcons[itemType] || '📦';
    },

    getRarityLabel(rarityCode, rarityObj) {
      if (rarityObj && rarityObj.display_name) {
        return rarityObj.display_name;
      }
      return this.rarityLabels[rarityCode] || '普通';
    },

    truncateText(text, maxLength) {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    },

    async loadTemplates() {
      showLoading();
      try {
        const params = new URLSearchParams();
        if (this.filters.type) params.append('item_type', this.filters.type);
        if (this.filters.rarity) params.append('rarity_code', this.filters.rarity);
        if (this.filters.status) params.append('is_enabled', this.filters.status === 'active' ? 'true' : 'false');
        if (this.filters.search) params.append('keyword', this.filters.search);

        const url = API_ENDPOINTS.ITEM_TEMPLATE.LIST + (params.toString() ? `?${params.toString()}` : '');
        const response = await apiRequest(url);

        if (response && response.success) {
          this.templates = response.data.list || [];
          this.updateStats(response.data.pagination || {});
        } else {
          this.showError('加载失败', response?.message || '获取物品模板失败');
        }
      } catch (error) {
        console.error('加载物品模板失败:', error);
        this.showError('加载失败', error.message);
      } finally {
        hideLoading();
      }
    },

    updateStats(pagination) {
      this.stats.total = pagination.total_count || this.templates.length;
      this.stats.types = new Set(this.templates.map(t => t.item_type)).size;
      this.stats.active = this.templates.filter(t => t.is_enabled).length;
      this.stats.rarities = new Set(this.templates.map(t => t.rarity_code).filter(Boolean)).size || '-';
    },

    openCreateModal() {
      this.form = {
        templateId: '', displayName: '', templateCode: '',
        itemType: 'voucher', rarityCode: 'common', isEnabled: true,
        imageUrl: '', referencePricePoints: 0, description: '', meta: ''
      };
      new bootstrap.Modal(this.$refs.templateModal).show();
    },

    async editTemplate(templateId) {
      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.ITEM_TEMPLATE.DETAIL, { id: templateId }));
        if (response && response.success) {
          const t = response.data;
          this.form = {
            templateId: t.item_template_id,
            displayName: t.display_name || '',
            templateCode: t.template_code || '',
            itemType: t.item_type || 'voucher',
            rarityCode: t.rarity_code || 'common',
            isEnabled: t.is_enabled,
            imageUrl: t.image_url || '',
            referencePricePoints: t.reference_price_points || 0,
            description: t.description || '',
            meta: t.meta ? JSON.stringify(t.meta, null, 2) : ''
          };
          new bootstrap.Modal(this.$refs.templateModal).show();
        } else {
          this.showError('加载失败', response?.message || '获取模板详情失败');
        }
      } catch (error) {
        console.error('加载模板详情失败:', error);
        this.showError('加载失败', error.message);
      } finally {
        hideLoading();
      }
    },

    async submitTemplate() {
      if (this.isSubmitting) return;

      let meta = null;
      try {
        if (this.form.meta && this.form.meta.trim()) {
          meta = JSON.parse(this.form.meta);
        }
      } catch (e) {
        alert('扩展属性JSON格式错误');
        return;
      }

      const data = {
        display_name: this.form.displayName,
        template_code: this.form.templateCode,
        item_type: this.form.itemType,
        rarity_code: this.form.rarityCode,
        is_enabled: this.form.isEnabled,
        image_url: this.form.imageUrl || null,
        reference_price_points: this.form.referencePricePoints || 0,
        description: this.form.description || null,
        meta: meta
      };

      if (!data.display_name || !data.template_code) {
        alert('请填写模板名称和编码');
        return;
      }

      this.isSubmitting = true;
      showLoading();
      try {
        const url = this.form.templateId
          ? API.buildURL(API_ENDPOINTS.ITEM_TEMPLATE.UPDATE, { id: this.form.templateId })
          : API_ENDPOINTS.ITEM_TEMPLATE.CREATE;
        const method = this.form.templateId ? 'PUT' : 'POST';

        const response = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.templateModal).hide();
          alert(`✅ ${this.form.templateId ? '更新' : '创建'}成功`);
          this.loadTemplates();
        } else {
          this.showError('保存失败', response?.message || '操作失败');
        }
      } catch (error) {
        console.error('保存模板失败:', error);
        this.showError('保存失败', error.message);
      } finally {
        this.isSubmitting = false;
        hideLoading();
      }
    },

    async deleteTemplate(templateId) {
      if (!confirm('确定要删除此物品模板吗？此操作不可恢复！')) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.ITEM_TEMPLATE.DELETE, { id: templateId }), {
          method: 'DELETE'
        });

        if (response && response.success) {
          alert('✅ 删除成功');
          this.loadTemplates();
        } else {
          this.showError('删除失败', response?.message || '操作失败');
        }
      } catch (error) {
        console.error('删除模板失败:', error);
        this.showError('删除失败', error.message);
      } finally {
        hideLoading();
      }
    },

    showError(title, message) {
      alert(`❌ ${title}\n${message}`);
    }
  }));
});

