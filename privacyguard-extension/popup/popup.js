// ============================================================
// PrivacyGuard - Popup Script
// Manages popup UI and communicates with background service worker
// ============================================================

// ============================================================
// TAB MANAGEMENT
// ============================================================

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ============================================================
// TOGGLE
// ============================================================

const mainToggle = document.getElementById('mainToggle');

mainToggle.addEventListener('click', () => {
  const isActive = mainToggle.classList.toggle('active');
  chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', enabled: isActive });
});

// ============================================================
// PERMISSIONS DATA
// ============================================================

const AI_PERMISSIONS = {
  chatgpt: {
    name: 'ChatGPT (OpenAI)',
    permissions: [
      { name: 'Chat History', status: 'active', risk: 'HIGH', description: 'OpenAI stores all conversations by default. Can be used for model training and human review.' },
      { name: 'Memory Feature', status: 'active', risk: 'HIGH', description: 'ChatGPT remembers details about you across conversations and builds a persistent profile.' },
      { name: 'File Upload & Analysis', status: 'active', risk: 'HIGH', description: 'Files (PDFs, images, docs) you upload are fully processed and may be stored indefinitely.' },
      { name: 'Image Generation Data', status: 'active', risk: 'LOW', description: 'Prompts and generated images may be stored and used for quality improvement.' },
      { name: 'Web Browsing Data', status: 'active', risk: 'MEDIUM', description: 'Search queries made via web browsing are visible to OpenAI and search providers.' },
      { name: 'Third-party Plugins', status: 'variable', risk: 'HIGH', description: 'Plugins can access your messages and send data to external services.' },
      { name: 'Canvas / Code Interpreter', status: 'active', risk: 'MEDIUM', description: 'Code and files uploaded to Code Interpreter are processed on OpenAI servers.' },
    ],
  },
  claude: {
    name: 'Claude (Anthropic)',
    permissions: [
      { name: 'Conversation Storage', status: 'active', risk: 'MEDIUM', description: 'Anthropic stores conversations temporarily for safety review and quality assurance.' },
      { name: 'File Analysis', status: 'active', risk: 'HIGH', description: 'Uploaded files are fully processed and may be retained for safety evaluation.' },
      { name: 'Projects Knowledge Base', status: 'active', risk: 'MEDIUM', description: 'Content in Claude Projects is accessible to Claude within that project.' },
      { name: 'Artifacts', status: 'active', risk: 'LOW', description: 'Code and content created in Artifacts may be stored temporarily.' },
      { name: 'Usage Analytics', status: 'active', risk: 'LOW', description: 'Anthropic collects usage patterns for safety and improvement.' },
    ],
  },
  gemini: {
    name: 'Gemini (Google)',
    permissions: [
      { name: 'Activity History', status: 'active', risk: 'HIGH', description: 'All Gemini conversations are stored in your Google account activity history.' },
      { name: 'Google Account Access', status: 'active', risk: 'CRITICAL', description: 'Gemini is deeply integrated with your Google account data (Gmail, Drive, Docs, Calendar).' },
      { name: 'File Upload', status: 'active', risk: 'HIGH', description: 'Files uploaded are processed by Google and may be linked to your account.' },
      { name: 'YouTube Integration', status: 'active', risk: 'MEDIUM', description: 'Gemini can access and summarize YouTube video content.' },
      { name: 'Google Flights/Maps', status: 'active', risk: 'MEDIUM', description: 'Search queries for travel/location are logged in your Google activity.' },
      { name: 'Gmail Integration', status: 'active', risk: 'CRITICAL', description: 'If connected, Gemini can read, summarize, and act on your emails.' },
      { name: 'Google Drive Integration', status: 'active', risk: 'CRITICAL', description: 'If connected, Gemini can access and process your stored documents.' },
    ],
  },
  copilot: {
    name: 'Copilot (Microsoft)',
    permissions: [
      { name: 'Microsoft Account Link', status: 'active', risk: 'MEDIUM', description: 'Copilot is tied to your Microsoft account identity.' },
      { name: 'Search History', status: 'active', risk: 'MEDIUM', description: 'All Copilot queries are logged in your Bing/Microsoft search history.' },
      { name: 'File Upload', status: 'active', risk: 'HIGH', description: 'Files uploaded are processed on Microsoft servers.' },
      { name: 'Microsoft 365 Integration', status: 'active', risk: 'HIGH', description: 'Copilot can access your Word, Excel, PowerPoint, and Outlook data if connected.' },
      { name: 'Edge Browser Data', status: 'active', risk: 'MEDIUM', description: 'Copilot in Edge can access your browsing context and history.' },
    ],
  },
};

// ============================================================
// CURRENT SITE DETECTION
// ============================================================

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.url) {
    const url = new URL(tabs[0].url);
    const hostname = url.hostname;

    let siteKey = null;
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) siteKey = 'chatgpt';
    else if (hostname.includes('claude.ai')) siteKey = 'claude';
    else if (hostname.includes('gemini.google.com')) siteKey = 'gemini';
    else if (hostname.includes('copilot.microsoft.com')) siteKey = 'copilot';

    if (siteKey && AI_PERMISSIONS[siteKey]) {
      const siteInfo = AI_PERMISSIONS[siteKey];
      document.getElementById('currentSite').textContent = `Active on ${siteInfo.name}`;
      renderPermissions(siteKey);
    } else {
      document.getElementById('currentSite').textContent = `Open an AI chat site to monitor`;
      renderDefaultPermissions();
    }
  }

  loadStats();
});

// ============================================================
// RENDER PERMISSIONS
// ============================================================

function renderPermissions(siteKey) {
  const container = document.getElementById('permissionsList');
  const site = AI_PERMISSIONS[siteKey];
  if (!site) return;

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
      <span style="font-size: 16px;">${siteKey === 'chatgpt' ? '🤖' : siteKey === 'claude' ? '🧠' : siteKey === 'gemini' ? '💎' : '🔵'}</span>
      <div>
        <div style="font-weight: 700; font-size: 14px;">${site.name}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${site.permissions.length} detected permissions</div>
      </div>
    </div>
    ${site.permissions.map(perm => `
      <div class="perm-card">
        <div class="perm-header">
          <span class="perm-name">${perm.name}</span>
          <span class="risk-badge ${perm.risk.toLowerCase()}">${perm.risk}</span>
        </div>
        <div class="perm-desc">${perm.description}</div>
      </div>
    `).join('')}
  `;
}

function renderDefaultPermissions() {
  const container = document.getElementById('permissionsList');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔒</div>
      <div class="empty-state-text">Navigate to ChatGPT, Claude, Gemini, or Copilot to see their permission details and privacy risks.</div>
    </div>
    <div style="margin-top: 12px;">
      ${Object.entries(AI_PERMISSIONS).map(([key, site]) => `
        <div class="perm-card" style="cursor: pointer;">
          <div class="perm-header">
            <span class="perm-name">${site.name}</span>
            <span class="risk-badge ${site.permissions.some(p => p.risk === 'CRITICAL') ? 'critical' : 'high'}">
              ${site.permissions.filter(p => p.risk === 'CRITICAL' || p.risk === 'HIGH').length} high-risk
            </span>
          </div>
          <div class="perm-desc">${site.permissions.length} permissions detected</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// LOAD STATS
// ============================================================

function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
    if (!stats) return;

    // Update toggle state
    mainToggle.classList.toggle('active', stats.enabled);

    // Score
    const score = stats.privacyScore;
    document.getElementById('scoreValue').textContent = score;
    document.getElementById('scoreFill').style.width = `${Math.min(100, (score / 200) * 100)}%`;

    const level = getLevel(score);
    const levelEl = document.getElementById('scoreLevel');
    levelEl.textContent = level.name;
    levelEl.className = `risk-badge ${level.class}`;

    // Stats
    document.getElementById('totalScans').textContent = stats.totalScans;
    document.getElementById('blockedCount').textContent = stats.blockedCount;
    document.getElementById('editedCount').textContent = stats.editedCount;
    document.getElementById('sentCount').textContent = stats.sentAnywayCount;

    // Risk distribution
    const total = stats.totalScans || 1;
    const rd = stats.riskDistribution || { critical: 0, high: 0, medium: 0, low: 0 };

    document.getElementById('riskCritical').style.width = `${(rd.critical / total) * 100}%`;
    document.getElementById('riskCriticalCount').textContent = rd.critical;
    document.getElementById('riskHigh').style.width = `${(rd.high / total) * 100}%`;
    document.getElementById('riskHighCount').textContent = rd.high;
    document.getElementById('riskMedium').style.width = `${(rd.medium / total) * 100}%`;
    document.getElementById('riskMediumCount').textContent = rd.medium;
    document.getElementById('riskLow').style.width = `${(rd.low / total) * 100}%`;
    document.getElementById('riskLowCount').textContent = rd.low;

    // History
    renderHistory(stats.recentScans || []);

    // Rules
    loadRules();
  });
}

function getLevel(score) {
  if (score >= 200) return { name: 'Guardian', class: 'low' };
  if (score >= 150) return { name: 'Expert', class: 'low' };
  if (score >= 120) return { name: 'Advanced', class: 'medium' };
  if (score >= 105) return { name: 'Intermediate', class: 'medium' };
  return { name: 'Beginner', class: 'high' };
}

// ============================================================
// RENDER HISTORY
// ============================================================

function renderHistory(scans) {
  const container = document.getElementById('historyList');

  if (scans.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">No scans yet. Start chatting on an AI site to see your privacy scan history here.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = scans.map(scan => {
    const icons = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
    const time = formatTime(scan.timestamp);
    return `
      <div class="scan-item">
        <div class="scan-icon">${icons[scan.riskLevel] || '⚪'}</div>
        <div style="flex: 1; min-width: 0;">
          <div class="scan-text">${escapeHtml(scan.originalText)}</div>
          <div class="scan-meta">
            <span class="scan-time">${time}</span>
            <span class="scan-site">${scan.site || 'unknown'}</span>
            <span class="risk-badge ${scan.riskLevel.toLowerCase()}">${scan.riskLevel}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// RULES MANAGEMENT
// ============================================================

function loadRules() {
  chrome.runtime.sendMessage({ type: 'GET_RULES' }, (response) => {
    const rules = response?.rules || [];
    renderRules(rules);
  });
}

function renderRules(rules) {
  const container = document.getElementById('rulesList');

  if (rules.length === 0) {
    container.innerHTML = `
      <div class="section-title">Your Custom Rules</div>
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">No custom rules yet. Add patterns above to detect specific sensitive information.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="section-title">Your Custom Rules (${rules.length})</div>
    ${rules.map(rule => `
      <div class="rule-item">
        <div class="rule-toggle ${rule.isActive ? 'active' : ''}" data-rule-id="${rule.id}"></div>
        <div class="rule-info">
          <div class="rule-name">${escapeHtml(rule.name)}</div>
          <div class="rule-pattern">${escapeHtml(rule.pattern)}</div>
        </div>
        <button class="rule-delete" data-rule-id="${rule.id}" title="Delete rule">✕</button>
      </div>
    `).join('')}
  `;

  // Toggle handlers
  container.querySelectorAll('.rule-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const ruleId = toggle.dataset.ruleId;
      chrome.runtime.sendMessage({ type: 'GET_RULES' }, (response) => {
        const rules = response?.rules || [];
        const rule = rules.find(r => r.id === ruleId);
        if (rule) {
          rule.isActive = !rule.isActive;
          chrome.storage.local.set({ privacyguard_customRules: rules });
          loadRules();
        }
      });
    });
  });

  // Delete handlers
  container.querySelectorAll('.rule-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const ruleId = btn.dataset.ruleId;
      chrome.runtime.sendMessage({ type: 'DELETE_RULE', ruleId }, () => {
        loadRules();
      });
    });
  });
}

// Add Rule
document.getElementById('addRuleBtn').addEventListener('click', () => {
  const name = document.getElementById('ruleName').value.trim();
  const pattern = document.getElementById('rulePattern').value.trim();
  const risk = document.getElementById('ruleRisk').value;

  if (!name || !pattern) return;

  // Validate regex
  try {
    new RegExp(pattern);
  } catch (e) {
    alert('Invalid regex pattern. Please check your pattern and try again.');
    return;
  }

  const rule = {
    id: Date.now().toString(),
    name,
    pattern,
    riskLevel: risk,
    category: 'PII',
    isActive: true,
  };

  chrome.runtime.sendMessage({ type: 'SAVE_RULE', rule }, () => {
    document.getElementById('ruleName').value = '';
    document.getElementById('rulePattern').value = '';
    loadRules();
  });
});

// Clear History
document.getElementById('clearHistory').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all scan history? This cannot be undone.')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      loadStats();
    });
  }
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// INITIAL LOAD
// ============================================================

// Refresh stats when popup is opened
chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
  if (stats) loadStats();
});
