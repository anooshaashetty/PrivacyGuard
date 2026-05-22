// ============================================================
// PrivacyGuard - Background Service Worker
// Manages extension state, scan history, and messaging
// ============================================================

// Default state
const DEFAULT_STATE = {
  enabled: true,
  totalScans: 0,
  blockedCount: 0,
  editedCount: 0,
  sentAnywayCount: 0,
  privacyScore: 100,
  scanHistory: [],
  customRules: [],
  settings: {
    autoBlockCritical: false,
    showSafeIndicator: true,
    showFileWarnings: true,
    showPermissions: true,
  },
};

// Initialize state on install
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.get(null, (result) => {
    if (!result.privacyguard_initialized) {
      chrome.storage.local.set({
        privacyguard_initialized: true,
        privacyguard_enabled: true,
        privacyguard_totalScans: 0,
        privacyguard_blockedCount: 0,
        privacyguard_editedCount: 0,
        privacyguard_sentAnywayCount: 0,
        privacyguard_privacyScore: 100,
        privacyguard_scanHistory: [],
        privacyguard_customRules: [],
        privacyguard_settings: DEFAULT_STATE.settings,
      });
      console.log('[PrivacyGuard] Extension installed and initialized');
    }
  });

  // Open welcome page on install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/welcome.html') });
  }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCAN_RESULT':
      handleScanResult(message.result);
      sendResponse({ ok: true });
      break;

    case 'USER_ACTION':
      handleUserAction(message.action, message.riskLevel);
      sendResponse({ ok: true });
      break;

    case 'FILE_WARNING':
      handleFileWarning(message);
      sendResponse({ ok: true });
      break;

    case 'TOGGLE_ENABLED':
      chrome.storage.local.set({ privacyguard_enabled: message.enabled });
      updateBadge(message.enabled);
      sendResponse({ ok: true });
      break;

    case 'GET_STATS':
      getStats().then(stats => sendResponse(stats));
      return true; // async response

    case 'GET_HISTORY':
      chrome.storage.local.get(['privacyguard_scanHistory'], (result) => {
        sendResponse({ history: result.privacyguard_scanHistory || [] });
      });
      return true;

    case 'GET_RULES':
      chrome.storage.local.get(['privacyguard_customRules'], (result) => {
        sendResponse({ rules: result.privacyguard_customRules || [] });
      });
      return true;

    case 'SAVE_RULE':
      chrome.storage.local.get(['privacyguard_customRules'], (result) => {
        const rules = result.privacyguard_customRules || [];
        rules.push(message.rule);
        chrome.storage.local.set({ privacyguard_customRules: rules });
        sendResponse({ ok: true, rules });
      });
      return true;

    case 'DELETE_RULE':
      chrome.storage.local.get(['privacyguard_customRules'], (result) => {
        let rules = result.privacyguard_customRules || [];
        rules = rules.filter(r => r.id !== message.ruleId);
        chrome.storage.local.set({ privacyguard_customRules: rules });
        sendResponse({ ok: true, rules });
      });
      return true;

    case 'CLEAR_HISTORY':
      chrome.storage.local.set({
        privacyguard_scanHistory: [],
        privacyguard_totalScans: 0,
        privacyguard_blockedCount: 0,
        privacyguard_editedCount: 0,
        privacyguard_sentAnywayCount: 0,
        privacyguard_privacyScore: 100,
      });
      sendResponse({ ok: true });
      break;

    case 'GET_SETTINGS':
      chrome.storage.local.get(['privacyguard_enabled', 'privacyguard_settings'], (result) => {
        sendResponse({
          enabled: result.privacyguard_enabled !== false,
          settings: result.privacyguard_settings || DEFAULT_STATE.settings,
        });
      });
      return true;

    case 'UPDATE_SETTINGS':
      chrome.storage.local.set({ privacyguard_settings: message.settings });
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ============================================================
// HANDLERS
// ============================================================

function handleScanResult(result) {
  chrome.storage.local.get(['privacyguard_scanHistory', 'privacyguard_totalScans'], (storage) => {
    const history = storage.privacyguard_scanHistory || [];
    const totalScans = storage.privacyguard_totalScans || 0;

    // Add to history (keep last 200)
    history.unshift({
      id: Date.now().toString(),
      ...result,
    });
    if (history.length > 200) history.length = 200;

    chrome.storage.local.set({
      privacyguard_scanHistory: history,
      privacyguard_totalScans: totalScans + 1,
    });

    updateBadge(true);
  });
}

function handleUserAction(action, riskLevel) {
  let scoreChange = 0;
  let counterKey = '';

  switch (action) {
    case 'BLOCK_LEARN':
      scoreChange = 5;
      counterKey = 'privacyguard_blockedCount';
      break;
    case 'EDIT_RESEND':
      scoreChange = 2;
      counterKey = 'privacyguard_editedCount';
      break;
    case 'SEND_ANYWAY':
      scoreChange = -1;
      counterKey = 'privacyguard_sentAnywayCount';
      break;
  }

  chrome.storage.local.get(['privacyguard_privacyScore', counterKey], (storage) => {
    const currentScore = storage.privacyguard_privacyScore || 100;
    const currentCount = storage[counterKey] || 0;

    const updates = {
      privacyguard_privacyScore: Math.max(0, currentScore + scoreChange),
      [counterKey]: currentCount + 1,
    };

    chrome.storage.local.set(updates);
  });
}

function handleFileWarning(message) {
  // File warnings are just logged - no score change for warnings only
  console.log(`[PrivacyGuard] File warning: ${message.fileName} on ${message.site} (${message.riskLevel})`);
}

// ============================================================
// BADGE
// ============================================================

function updateBadge(enabled) {
  if (!enabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  }
}

// ============================================================
// STATS HELPER
// ============================================================

async function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'privacyguard_enabled',
      'privacyguard_totalScans',
      'privacyguard_blockedCount',
      'privacyguard_editedCount',
      'privacyguard_sentAnywayCount',
      'privacyguard_privacyScore',
      'privacyguard_scanHistory',
    ], (result) => {
      const history = result.privacyguard_scanHistory || [];

      // Calculate risk distribution from recent history
      const riskDist = { critical: 0, high: 0, medium: 0, low: 0 };
      const categoryCounts = {};
      history.slice(0, 50).forEach(scan => {
        const rl = (scan.riskLevel || 'low').toLowerCase();
        if (riskDist[rl] !== undefined) riskDist[rl]++;
        (scan.categories || []).forEach(cat => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      });

      resolve({
        enabled: result.privacyguard_enabled !== false,
        totalScans: result.privacyguard_totalScans || 0,
        blockedCount: result.privacyguard_blockedCount || 0,
        editedCount: result.privacyguard_editedCount || 0,
        sentAnywayCount: result.privacyguard_sentAnywayCount || 0,
        privacyScore: result.privacyguard_privacyScore || 100,
        riskDistribution: riskDist,
        categoryCounts,
        recentScans: history.slice(0, 20),
      });
    });
  });
}
