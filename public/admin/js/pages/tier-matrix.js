/**
 * Tier Matrix Page - Alpine.js Components
 * 层级矩阵管理页面组件 (Mode A: Alpine.data() 标准模式)
 */

console.log('🔄 tier-matrix.js Alpine.js版本');

document.addEventListener('alpine:init', () => {
  Alpine.data('tierMatrixPage', () => ({
    budgetTiers: ['B0', 'B1', 'B2', 'B3'],
    pressureTiers: ['P0', 'P1', 'P2'],
    matrixConfig: {},
    configIdMap: {},
    originalConfig: {},
    editedCells: new Set(),
    editingCell: null,
    editForm: {
      cap: 1,
      empty: 1,
    },
    dataStatus: '数据加载中...',
    dataStatusClass: 'bg-warning',
    lastUpdate: '',

    init() {
      this.loadMatrixConfig();
    },

    getBudgetTierLabel(tier) {
      const labels = {
        'B0': '预算极低',
        'B1': '低预算',
        'B2': '中预算',
        'B3': '高预算'
      };
      return labels[tier] || tier;
    },

    async loadMatrixConfig() {
      showLoading();
      this.dataStatus = '加载中...';
      this.dataStatusClass = 'bg-warning';

      try {
        const response = await apiRequest(API_ENDPOINTS.MATRIX.LIST);

        if (response && response.success) {
          const list = response.data.list || response.data || [];
          
          console.log('后端返回的原始数据:', list);

          this.matrixConfig = {};
          this.configIdMap = {};

          for (const item of list) {
            const bt = item.budget_tier;
            const pt = item.pressure_tier;
            const configId = item.matrix_config_id || item.id || item.config_id;

            console.log(`加载配置 ${bt}-${pt}: ID=${configId}`, item);

            if (!this.matrixConfig[bt]) {
              this.matrixConfig[bt] = {};
            }

            this.matrixConfig[bt][pt] = {
              cap_multiplier: parseFloat(item.cap_multiplier) || 0,
              empty_weight_multiplier: parseFloat(item.empty_weight_multiplier) || 1
            };

            if (!this.configIdMap[bt]) this.configIdMap[bt] = {};
            this.configIdMap[bt][pt] = configId;
          }

          console.log('configIdMap 最终结果:', this.configIdMap);

          this.originalConfig = JSON.parse(JSON.stringify(this.matrixConfig));
          this.editedCells.clear();
          this.editingCell = null;

          this.dataStatus = `已加载 ${list.length} 条配置`;
          this.dataStatusClass = 'bg-success';
          this.lastUpdate = `更新时间: ${new Date().toLocaleString('zh-CN')}`;
        } else {
          this.showError('加载失败', response?.message || '无法获取矩阵配置');
          this.dataStatus = '加载失败';
          this.dataStatusClass = 'bg-danger';
        }
      } catch (error) {
        console.error('加载矩阵配置失败:', error);
        this.showError('加载失败', error.message);
        this.dataStatus = '加载失败';
        this.dataStatusClass = 'bg-danger';
      } finally {
        hideLoading();
      }
    },

    editCell(bTier, pTier, event) {
      if (this.editingCell === `${bTier}-${pTier}`) return;

      // Save previous cell if editing
      if (this.editingCell) {
        const [prevBt, prevPt] = this.editingCell.split('-');
        this.saveCell(prevBt, prevPt);
      }

      const config = this.matrixConfig[bTier]?.[pTier] || { cap_multiplier: 1, empty_weight_multiplier: 1 };
      this.editForm.cap = config.cap_multiplier;
      this.editForm.empty = config.empty_weight_multiplier;
      this.editingCell = `${bTier}-${pTier}`;

      // Focus the cap input after render
      this.$nextTick(() => {
        const cell = event.target.closest('.matrix-cell');
        if (cell) {
          const input = cell.querySelector('input');
          if (input) {
            input.focus();
            input.select();
          }
        }
      });
    },

    saveCell(bTier, pTier) {
      if (this.editingCell !== `${bTier}-${pTier}`) return;

      const cap = this.editForm.cap || 0;
      const empty = this.editForm.empty || 1;

      if (!this.matrixConfig[bTier]) this.matrixConfig[bTier] = {};
      this.matrixConfig[bTier][pTier] = {
        cap_multiplier: cap,
        empty_weight_multiplier: empty
      };

      this.editedCells.add(`${bTier}-${pTier}`);
      console.log(`saveCell: ${bTier}-${pTier} -> Cap:${cap}, Empty:${empty}`);

      this.editingCell = null;
    },

    async saveMatrixConfig() {
      // Save current editing cell if any
      if (this.editingCell) {
        const [bTier, pTier] = this.editingCell.split('-');
        this.saveCell(bTier, pTier);
      }

      if (this.editedCells.size === 0) {
        alert('没有需要保存的修改');
        return;
      }

      console.log('准备保存的单元格:', Array.from(this.editedCells));

      showLoading();
      try {
        let successCount = 0;
        let failCount = 0;

        for (const cellKey of this.editedCells) {
          const [bTier, pTier] = cellKey.split('-');
          const configId = this.configIdMap[bTier]?.[pTier];
          const config = this.matrixConfig[bTier]?.[pTier];

          console.log(`保存 ${cellKey}: configId=${configId}, config=`, config);

          if (configId && config) {
            try {
              const url = API.buildURL(API_ENDPOINTS.MATRIX.UPDATE, { id: configId });
              console.log(`发送更新请求: ${url}`, config);

              const response = await apiRequest(url, {
                method: 'PUT',
                body: JSON.stringify({
                  cap_multiplier: config.cap_multiplier,
                  empty_weight_multiplier: config.empty_weight_multiplier
                })
              });

              if (response && response.success) {
                successCount++;
                console.log(`✅ ${cellKey} 更新成功`);
              } else {
                failCount++;
                console.error(`❌ ${cellKey} 更新失败:`, response?.message);
              }
            } catch (error) {
              failCount++;
              console.error(`❌ ${cellKey} 更新错误:`, error);
            }
          } else {
            console.warn(`⚠️ ${cellKey} 缺少 configId 或 config`);
          }
        }

        if (failCount === 0 && successCount > 0) {
          this.originalConfig = JSON.parse(JSON.stringify(this.matrixConfig));
          this.editedCells.clear();
          alert(`✅ 保存成功，更新了 ${successCount} 条配置`);
        } else if (failCount > 0) {
          alert(`⚠️ 部分保存失败：成功 ${successCount} 条，失败 ${failCount} 条`);
        } else {
          alert('保存失败：没有找到有效的配置ID');
        }
      } catch (error) {
        console.error('保存矩阵配置失败:', error);
        this.showError('保存失败', error.message);
      } finally {
        hideLoading();
      }
    },

    showError(title, message) {
      alert(`❌ ${title}\n${message}`);
    }
  }));

  console.log('✅ [TierMatrix] Alpine 组件已注册');
});

