    function formatTime(iso) {
      if (!iso) return 'Never';
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch { return 'Unknown'; }
    }

    function renderLogs(logs) {
      const root = document.getElementById('syncLogs');
      root.textContent = '';
      const items = (logs || []).slice(0, 5);
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'log-item';
        empty.textContent = 'No sync logs yet';
        root.appendChild(empty);
        return;
      }
      for (const log of items) {
        const row = document.createElement('div');
        row.className = `log-item ${log.level || 'info'}`;
        const message = document.createElement('span');
        message.textContent = log.message || 'Sync event';
        const time = document.createElement('span');
        time.textContent = formatTime(log.ts);
        row.append(message, time);
        root.appendChild(row);
      }
    }

    function sendSyncMessage(dryRun) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'sync_now', dryRun }, (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(response);
        });
      });
    }

    chrome.storage.local.get(['lk_quick', 'lk_auto_meta', 'lk_server', 'lk_sync_enabled', 'lk_last_sync', 'lk_sync_policy', 'lk_sync_logs'], (settings) => {
      const qt = document.getElementById('quickToggle');
      const mt = document.getElementById('metaToggle');
      const st = document.getElementById('syncToggle');
      const policy = document.getElementById('syncPolicy');
      document.getElementById('server').textContent = settings.lk_server || '—';
      document.getElementById('lastSync').textContent = formatTime(settings.lk_last_sync);
      renderLogs(settings.lk_sync_logs);

      qt.classList.toggle('on', !!settings.lk_quick);
      mt.classList.toggle('on', settings.lk_auto_meta !== false);
      st.classList.toggle('on', !!settings.lk_sync_enabled);
      policy.value = settings.lk_sync_policy || 'browser_wins';

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

      policy.addEventListener('change', () => {
        chrome.storage.local.set({ lk_sync_policy: policy.value });
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

      async function runManualSync(dryRun) {
        const btn = document.getElementById('syncNowBtn');
        const dryBtn = document.getElementById('dryRunBtn');
        const result = document.getElementById('syncResult');
        btn.disabled = true;
        dryBtn.disabled = true;
        btn.textContent = dryRun ? 'Checking...' : 'Syncing...';
        result.className = 'sync-result';
        result.textContent = '';

        try {
          const res = await sendSyncMessage(dryRun);

          if (res.ok) {
            const d = res.data;
            result.className = 'sync-result success';
            result.textContent = `${d.dryRun ? 'Dry run' : 'Synced'}: ${d.total} links (${d.created} new, ${d.updated} updated, ${d.removed} removed)`;
            if (!d.dryRun) document.getElementById('lastSync').textContent = formatTime(new Date().toISOString());
            // Refresh last sync from storage
            chrome.storage.local.get(['lk_last_sync', 'lk_sync_logs'], (s) => {
              document.getElementById('lastSync').textContent = formatTime(s.lk_last_sync);
              renderLogs(s.lk_sync_logs);
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
        dryBtn.disabled = false;
        btn.textContent = '🔄 Sync Now';
      }

      document.getElementById('syncNowBtn').addEventListener('click', () => runManualSync(false));
      document.getElementById('dryRunBtn').addEventListener('click', () => runManualSync(true));

      // Logout
      document.getElementById('logoutBtn').addEventListener('click', () => {
        chrome.storage.local.clear(() => window.close());
      });
    });
