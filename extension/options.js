    function formatTime(iso) {
      if (!iso) return 'Never';
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch { return 'Unknown'; }
    }

    chrome.storage.local.get(['lk_quick', 'lk_auto_meta', 'lk_server', 'lk_sync_enabled', 'lk_last_sync'], (settings) => {
      const qt = document.getElementById('quickToggle');
      const mt = document.getElementById('metaToggle');
      const st = document.getElementById('syncToggle');
      document.getElementById('server').textContent = settings.lk_server || '—';
      document.getElementById('lastSync').textContent = formatTime(settings.lk_last_sync);

      qt.classList.toggle('on', !!settings.lk_quick);
      mt.classList.toggle('on', settings.lk_auto_meta !== false);
      st.classList.toggle('on', !!settings.lk_sync_enabled);

      // Quick save toggle
      qt.addEventListener('click', () => {
        const newVal = !qt.classList.contains('on');
        qt.classList.toggle('on', newVal);
        chrome.storage.local.set({ lk_quick: newVal });
      });

      // Auto metadata toggle
      mt.addEventListener('click', () => {
        const newVal = !mt.classList.contains('on');
        mt.classList.toggle('on', newVal);
        chrome.storage.local.set({ lk_auto_meta: newVal });
      });

      // Sync toggle
      st.addEventListener('click', async () => {
        const newVal = !st.classList.contains('on');
        st.classList.toggle('on', newVal);
        chrome.storage.local.set({ lk_sync_enabled: newVal }, () => {
          // Trigger initial sync when enabling
          if (newVal) {
            document.getElementById('syncNowBtn').click();
          }
        });
      });

      // Sync now button
      document.getElementById('syncNowBtn').addEventListener('click', async () => {
        const btn = document.getElementById('syncNowBtn');
        const result = document.getElementById('syncResult');
        btn.disabled = true;
        btn.textContent = '⏳ Syncing...';
        result.className = 'sync-result';
        result.textContent = '';

        try {
          const res = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'sync_now' }, (response) => {
              if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
              resolve(response);
            });
          });

          if (res.ok) {
            const d = res.data;
            result.className = 'sync-result success';
            result.textContent = `✓ Synced! ${d.total} links (${d.created} new, ${d.updated} updated, ${d.removed} removed)`;
            document.getElementById('lastSync').textContent = formatTime(new Date().toISOString());
            // Refresh last sync from storage
            chrome.storage.local.get(['lk_last_sync'], (s) => {
              document.getElementById('lastSync').textContent = formatTime(s.lk_last_sync);
            });
          } else {
            result.className = 'sync-result error';
            result.textContent = `✗ ${res.data?.detail || 'Sync failed'}`;
          }
        } catch (e) {
          result.className = 'sync-result error';
          result.textContent = `✗ ${e.message}`;
        }

        btn.disabled = false;
        btn.textContent = '🔄 Sync Now';
      });

      // Logout
      document.getElementById('logoutBtn').addEventListener('click', () => {
        chrome.storage.local.clear(() => window.close());
      });
    });
