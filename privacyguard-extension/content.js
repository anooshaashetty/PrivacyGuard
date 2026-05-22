// ============================================================
// PrivacyGuard - Content Script
// Injects into AI chat sites (ChatGPT, Claude, Gemini, etc.)
// Intercepts messages before they're sent and shows privacy warnings
// ============================================================

(function () {
  'use strict';

  // Prevent double injection
  if (window.__privacyGuardInjected) return;
  window.__privacyGuardInjected = true;

  // ============================================================
  // SITE CONFIGURATIONS
  // ============================================================

  const SITES = {
    chatgpt: {
      name: 'ChatGPT',
      match: ['chatgpt.com', 'chat.openai.com'],
      selectors: {
        textarea: 'textarea[id*="prompt"], textarea[placeholder*="Message"], textarea[data-id="root"], #prompt-textarea, textarea',
        sendButton: 'button[data-testid="send-button"], button[aria-label="Send prompt"], form button:last-of-type',
        inputContainer: 'form, div[class*="composer"]',
        stopButton: 'button[data-testid="stop-button"]',
      },
    },
    claude: {
      name: 'Claude',
      match: ['claude.ai'],
      selectors: {
        textarea: 'div[contenteditable="true"][role="textbox"], div[class*="ProseMirror"], div[contenteditable="true"]',
        sendButton: 'button[aria-label="Send message"], button[class*="send"], form button[type="submit"]',
        inputContainer: 'div[class*="composer"], div[class*="input"]',
        stopButton: 'button[class*="stop"]',
      },
    },
    gemini: {
      name: 'Gemini',
      match: ['gemini.google.com'],
      selectors: {
        textarea: 'div[contenteditable="true"][role="textbox"], div[class*="ql-editor"], rich-textarea div[contenteditable="true"]',
        sendButton: 'button[aria-label*="Send"], button[aria-label*="submit"], button.send-button',
        inputContainer: 'div[class*="input-area"], form',
        stopButton: 'button[aria-label*="Stop"]',
      },
    },
    copilot: {
      name: 'Copilot',
      match: ['copilot.microsoft.com'],
      selectors: {
        textarea: 'textarea[id*="searchbox"], textarea[placeholder*="Ask"], textarea',
        sendButton: 'button[type="submit"], button[aria-label="Submit"], form button:last-of-type',
        inputContainer: 'form, div[class*="search"]',
        stopButton: null,
      },
    },
    perplexity: {
      name: 'Perplexity',
      match: ['perplexity.ai'],
      selectors: {
        textarea: 'textarea[placeholder*="Ask"], textarea',
        sendButton: 'button[class*="submit"], button[type="submit"]',
        inputContainer: 'form, div[class*="search"], div[class*="input"]',
        stopButton: null,
      },
    },
    pi: {
      name: 'Pi',
      match: ['pi.ai'],
      selectors: {
        textarea: 'div[contenteditable="true"][class*="textarea"], div[class*="draft"]',
        sendButton: 'button[class*="submit"], button[class*="send"]',
        inputContainer: 'div[class*="compose"], div[class*="footer"]',
        stopButton: null,
      },
    },
  };

  // ============================================================
  // STATE
  // ============================================================

  let currentSite = null;
  let isEnabled = true;
  let scanOverlay = null;
  let originalSendClick = null;
  let sendButtonFound = false;
  let observationInterval = null;

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  function detectSite() {
    const hostname = window.location.hostname;
    for (const [key, site] of Object.entries(SITES)) {
      for (const domain of site.match) {
        if (hostname.includes(domain)) return { key, ...site };
      }
    }
    return null;
  }

  function findElement(selectors) {
    if (!selectors || typeof selectors === 'string') {
      return selectors ? document.querySelector(selectors) : null;
    }
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function getTextAreaContent(textarea) {
    if (!textarea) return '';
    if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
      return textarea.value;
    }
    if (textarea.contentEditable === 'true') {
      return textarea.innerText || textarea.textContent || '';
    }
    return '';
  }

  function log(msg) {
    console.log(`%c[PrivacyGuard]%c ${msg}`, 'color: #10b981; font-weight: bold;', 'color: inherit;');
  }

  // ============================================================
  // EXTENSION COMMUNICATION
  // ============================================================

  function sendMessageToExtension(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            // Extension context may be invalidated
          }
        });
      }
    } catch (e) {
      // Silent fail for extension messaging
    }
  }

  function getExtensionSettings(callback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['privacyguard_enabled', 'privacyguard_rules', 'privacyguard_settings'], (result) => {
          callback({
            enabled: result.privacyguard_enabled !== false,
            customRules: result.privacyguard_rules || [],
            settings: result.privacyguard_settings || {},
          });
        });
      } else {
        callback({ enabled: true, customRules: [], settings: {} });
      }
    } catch (e) {
      callback({ enabled: true, customRules: [], settings: {} });
    }
  }

  // ============================================================
  // FILE UPLOAD DETECTION
  // ============================================================

  function monitorFileUploads() {
    // Watch for file inputs and drag-drop events on the page
    const observer = new MutationObserver(() => {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      fileInputs.forEach(input => {
        if (!input.__pgFileWatched) {
          input.__pgFileWatched = true;
          input.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              Array.from(files).forEach(file => {
                showFileWarning(file);
              });
            }
          }, true);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also monitor drag-drop on text areas
    document.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        Array.from(files).forEach(file => {
          showFileWarning(file);
        });
      }
    }, true);
  }

  function showFileWarning(file) {
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf';
    const isDoc = file.type.includes('document') || file.type.includes('spreadsheet') || file.type.includes('presentation');
    const fileName = file.name.toLowerCase();

    let riskLevel = 'LOW';
    let warnings = [];

    if (isImage) {
      riskLevel = 'HIGH';
      warnings.push('Images may contain faces, locations, or identifying information');
      warnings.push('Photos can be used for facial recognition training');
      warnings.push('Once uploaded, you lose control over the image');
    }

    if (isPDF || isDoc) {
      riskLevel = 'HIGH';
      warnings.push('Documents may contain sensitive personal or financial data');
      warnings.push('PDF content is fully readable by AI services');
      warnings.push('Consider removing personal data before uploading');
    }

    if (fileName.match(/passport|license|id[_-]?card|ssn|tax|bank|statement|medical|health|invoice|receipt|contract|agreement/)) {
      riskLevel = 'CRITICAL';
      warnings.push('This filename suggests a sensitive document (ID, financial, or medical)');
      warnings.push('Uploading this could expose critical personal information');
    }

    if (fileName.match(/resume|cv|bio/)) {
      riskLevel = 'HIGH';
      warnings.push('Resume/CV contains extensive personal and professional information');
    }

    // Show a compact file warning toast
    showFileWarningToast(file.name, riskLevel, warnings, isImage, isPDF, isDoc);
  }

  function showFileWarningToast(fileName, riskLevel, warnings, isImage, isPDF, isDoc) {
    // Remove any existing file warning
    const existing = document.getElementById('pg-file-warning');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'pg-file-warning';

    const iconMap = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
    const bgMap = { LOW: '#065f46', MEDIUM: '#78350f', HIGH: '#7c2d12', CRITICAL: '#7f1d1d' };
    const borderMap = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };

    const typeIcon = isImage ? '🖼️' : isPDF ? '📄' : isDoc ? '📋' : '📎';

    toast.innerHTML = `
      <div style="
        position: fixed; bottom: 20px; right: 20px; z-index: 999999;
        max-width: 380px; width: 90vw;
        background: ${bgMap[riskLevel]};
        border: 1px solid ${borderMap[riskLevel]};
        border-radius: 12px; padding: 16px;
        color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        animation: pgSlideIn 0.3s ease-out;
      ">
        <style>
          @keyframes pgSlideIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes pgSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100px); opacity: 0; } }
        </style>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 18px;">${iconMap[riskLevel]}</span>
          <span style="font-size: 14px;">${typeIcon}</span>
          <span style="font-weight: 600; font-size: 14px; color: #fca5a5;">PrivacyGuard — File Upload Warning</span>
        </div>
        <div style="font-size: 12px; color: #fca5a5; margin-bottom: 6px; font-weight: 500; word-break: break-all;">
          ${riskLevel} risk: ${fileName}
        </div>
        <ul style="font-size: 11px; color: #d1d5db; margin: 0; padding-left: 16px; line-height: 1.6;">
          ${warnings.map(w => `<li>${w}</li>`).join('')}
        </ul>
        <button id="pg-file-dismiss-btn" style="
          margin-top: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2);
          color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px;
        ">I Understand</button>
      </div>
    `;

    document.body.appendChild(toast);
    document.getElementById('pg-file-dismiss-btn').addEventListener('click', function() {
      var el = document.getElementById('pg-file-warning');
      if (el) el.remove();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'pgSlideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, 8000);

    // Report to background
    sendMessageToExtension({
      type: 'FILE_WARNING',
      fileName,
      riskLevel,
      warnings,
      site: currentSite?.name || 'unknown',
    });
  }

  // ============================================================
  // MESSAGE SCAN & WARNING OVERLAY
  // ============================================================

  function scanAndShowWarning(messageText, sendCallback) {
    if (!messageText || !messageText.trim()) {
      sendCallback();
      return;
    }

    // Get custom rules from extension storage
    getExtensionSettings((settings) => {
      if (!settings.enabled) {
        sendCallback();
        return;
      }

      const result = scanMessage(messageText, settings.customRules);

      // Save scan to extension storage
      sendMessageToExtension({
        type: 'SCAN_RESULT',
        result: {
          originalText: messageText,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          categories: result.categories,
          itemCount: result.items.length,
          sanitizedText: result.sanitizedText,
          site: currentSite?.name || 'unknown',
          timestamp: Date.now(),
        },
      });

      // If safe, just let it through
      if (result.riskLevel === 'LOW' && result.items.length === 0) {
        // Show a brief green flash for safe messages
        showSafeIndicator();
        sendCallback();
        return;
      }

      // Show warning overlay
      showWarningOverlay(result, messageText, sendCallback);
    });
  }

  function showSafeIndicator() {
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 999998;
      background: #065f46; color: #6ee7b7; padding: 8px 16px;
      border-radius: 8px; font-size: 12px; font-family: -apple-system, sans-serif;
      display: flex; align-items: center; gap: 6px;
      animation: pgSlideIn 0.2s ease-out;
      border: 1px solid #10b981;
    `;
    indicator.innerHTML = '🛡️ <b>PrivacyGuard:</b> Message looks safe';
    document.body.appendChild(indicator);
    setTimeout(() => {
      indicator.style.animation = 'pgSlideOut 0.2s ease-in forwards';
      setTimeout(() => indicator.remove(), 200);
    }, 1500);
  }

  function showWarningOverlay(result, originalText, sendCallback) {
    // Remove existing overlay
    removeWarningOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'pg-warning-overlay';
    scanOverlay = overlay;

    const riskConfig = {
      LOW: { bg: '#064e3b', border: '#10b981', title: 'Caution Advised', icon: '🟡', titleColor: '#6ee7b7' },
      MEDIUM: { bg: '#78350f', border: '#f59e0b', title: 'Privacy Risks Detected', icon: '🟠', titleColor: '#fcd34d' },
      HIGH: { bg: '#7c2d12', border: '#f97316', title: 'Sensitive Data Detected', icon: '🔴', titleColor: '#fca5a5' },
      CRITICAL: { bg: '#7f1d1d', border: '#ef4444', title: 'Critical Privacy Risk!', icon: '🚨', titleColor: '#fecaca' },
    };

    const config = riskConfig[result.riskLevel];
    const categoryBadges = result.categories.map(c => {
      const colors = {
        PII: '#3b82f6', HEALTH: '#ef4444', EMOTION: '#a855f7', LOCATION: '#06b6d4',
        FINANCIAL: '#22c55e', RELATIONSHIP: '#ec4899', IMAGE: '#f59e0b', PERMISSION: '#ef4444', CREDENTIAL: '#f97316',
      };
      return `<span style="background: ${colors[c] || '#6b7280'}22; color: ${colors[c] || '#6b7280'}; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid ${colors[c] || '#6b7280'}44;">${c}</span>`;
    }).join(' ');

    const itemsHtml = result.items.slice(0, 5).map(item => `
      <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 10px; font-weight: 600; color: ${config.titleColor};">${item.riskLevel}</span>
          <span style="font-size: 10px; color: #9ca3af;">${item.category}</span>
        </div>
        <div style="font-size: 12px; color: #e5e7eb; font-family: monospace; background: rgba(0,0,0,0.3); padding: 6px 8px; border-radius: 4px; word-break: break-all;">
          "${item.text}"
        </div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${item.reason}</div>
        ${item.suggestion ? `<div style="font-size: 11px; color: #6ee7b7; margin-top: 2px;">💡 ${item.suggestion}</div>` : ''}
      </div>
    `).join('');

    const sanitizedHtml = result.sanitizedText !== originalText ? `
      <div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #6ee7b7; margin-bottom: 4px;">Safe Version:</div>
        <div style="font-size: 12px; color: #d1d5db;">${result.sanitizedText}</div>
        <button id="pg-copy-safe" style="
          margin-top: 6px; background: rgba(16,185,129,0.2); border: 1px solid #10b981;
          color: #6ee7b7; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
        ">Copy Safe Version</button>
      </div>
    ` : '';

    overlay.innerHTML = `
      <div style="
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        animation: pgFadeIn 0.2s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <style>
          @keyframes pgFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes pgSlideIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes pgSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100px); opacity: 0; } }
        </style>
        <div style="
          background: ${config.bg}; border: 1px solid ${config.border};
          border-radius: 16px; padding: 24px;
          max-width: 520px; width: 92vw; max-height: 85vh; overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          animation: pgSlideIn 0.3s ease-out;
        ">
          <!-- Header -->
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
            <span style="font-size: 28px;">${config.icon}</span>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: ${config.titleColor};">${config.title}</div>
              <div style="font-size: 11px; color: #9ca3af;">PrivacyGuard detected issues in your message</div>
            </div>
            <span style="margin-left: auto; background: ${config.border}; color: #fff; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700;">
              ${result.riskScore}/100
            </span>
          </div>

          <!-- Categories -->
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;">
            ${categoryBadges}
          </div>

          <!-- Explanation -->
          <div style="font-size: 12px; color: #d1d5db; line-height: 1.6; margin-bottom: 16px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            ${result.explanation}
          </div>

          <!-- Detected Items -->
          ${itemsHtml}

          ${result.items.length > 5 ? `<div style="font-size: 11px; color: #9ca3af; text-align: center;">...and ${result.items.length - 5} more item(s)</div>` : ''}

          <!-- Sanitized Version -->
          ${sanitizedHtml}

          <!-- Action Buttons -->
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button id="pg-block-btn" style="
              flex: 1; background: #dc2626; color: white; border: none;
              padding: 10px 16px; border-radius: 8px; cursor: pointer;
              font-size: 13px; font-weight: 600;
            ">🚫 Block & Learn (+5 pts)</button>
            <button id="pg-edit-btn" style="
              flex: 1; background: #2563eb; color: white; border: none;
              padding: 10px 16px; border-radius: 8px; cursor: pointer;
              font-size: 13px; font-weight: 600;
            ">✏️ Edit & Resend (+2 pts)</button>
            <button id="pg-send-btn" style="
              flex: 1; background: rgba(255,255,255,0.1); color: #d1d5db;
              border: 1px solid rgba(255,255,255,0.2);
              padding: 10px 16px; border-radius: 8px; cursor: pointer;
              font-size: 13px; font-weight: 600;
            ">Send Anyway (-1 pt)</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Button handlers
    document.getElementById('pg-block-btn').addEventListener('click', () => {
      sendMessageToExtension({ type: 'USER_ACTION', action: 'BLOCK_LEARN', riskLevel: result.riskLevel });
      removeWarningOverlay();
    });

    document.getElementById('pg-edit-btn').addEventListener('click', () => {
      sendMessageToExtension({ type: 'USER_ACTION', action: 'EDIT_RESEND', riskLevel: result.riskLevel });
      removeWarningOverlay();
      // Copy safe version to clipboard for easy pasting
      if (result.sanitizedText !== originalText) {
        navigator.clipboard.writeText(result.sanitizedText).catch(() => {});
      }
    });

    document.getElementById('pg-send-btn').addEventListener('click', () => {
      sendMessageToExtension({ type: 'USER_ACTION', action: 'SEND_ANYWAY', riskLevel: result.riskLevel });
      removeWarningOverlay();
      sendCallback();
    });

    // Copy safe version button
    const copyBtn = document.getElementById('pg-copy-safe');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(result.sanitizedText).catch(() => {});
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Safe Version'; }, 2000);
      });
    }

    // Click outside to close (but don't send)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.parentElement === overlay) {
        removeWarningOverlay();
      }
    });
  }

  function removeWarningOverlay() {
    const overlay = document.getElementById('pg-warning-overlay');
    if (overlay) {
      overlay.style.animation = 'pgFadeIn 0.15s ease-in reverse forwards';
      setTimeout(() => overlay.remove(), 150);
    }
    scanOverlay = null;
  }

  // ============================================================
  // SEND BUTTON INTERCEPTION
  // ============================================================

  function interceptSendButton() {
    if (!currentSite) return;

    const btn = findElement(currentSite.selectors.sendButton);
    if (!btn) return;

    if (btn.__pgIntercepted) return;
    btn.__pgIntercepted = true;
    sendButtonFound = true;

    // Store original event handlers by using event capture
    btn.addEventListener('click', function interceptHandler(e) {
      if (!isEnabled) return;

      const textarea = findElement(currentSite.selectors.textarea);
      const message = getTextAreaContent(textarea);

      if (message && message.trim().length > 0) {
        e.stopImmediatePropagation();
        e.preventDefault();
        scanAndShowWarning(message, () => {
          // User chose to send - dispatch the click again without interception
          btn.removeEventListener('click', interceptHandler, true);
          btn.click();
          setTimeout(() => {
            btn.addEventListener('click', interceptHandler, true);
          }, 100);
        });
      }
    }, true); // Use capture phase

    log(`Send button intercepted on ${currentSite.name}`);
  }

  // Also intercept keyboard Enter (common in AI chat interfaces)
  function interceptKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!isEnabled || !currentSite) return;

      // Check if Enter was pressed without Shift (most AI chats use Shift+Enter for new line)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const textarea = findElement(currentSite.selectors.textarea);
        if (!textarea || document.activeElement !== textarea) return;

        const message = getTextAreaContent(textarea);
        if (!message || !message.trim()) return;

        e.stopImmediatePropagation();
        e.preventDefault();
        scanAndShowWarning(message, () => {
          // User chose to send - create a synthetic Enter event
          const syntheticEvent = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true,
          });
          textarea.dispatchEvent(syntheticEvent);
        });
      }
    }, true); // Capture phase
  }

  // ============================================================
  // OBSERVATION LOOP (handles dynamic DOM changes)
  // ============================================================

  function startObservation() {
    // Initial check
    interceptSendButton();
    monitorFileUploads();

    // Periodic re-check for DOM changes (AI sites rebuild DOM frequently)
    observationInterval = setInterval(() => {
      if (!sendButtonFound) {
        interceptSendButton();
      }

      // Check if send button is gone (DOM rebuilt) and needs re-interception
      const btn = findElement(currentSite?.selectors?.sendButton);
      if (btn && !btn.__pgIntercepted) {
        sendButtonFound = false;
        interceptSendButton();
      }
    }, 2000);

    // MutationObserver for more responsive detection
    const observer = new MutationObserver((mutations) => {
      if (!sendButtonFound) {
        interceptSendButton();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ============================================================
  // STATUS BADGE (shows PrivacyGuard is active)
  // ============================================================

  function addStatusBadge() {
    if (document.getElementById('pg-status-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'pg-status-badge';
    badge.style.cssText = `
      position: fixed; bottom: 12px; left: 12px; z-index: 999997;
      background: #064e3b; border: 1px solid #10b981;
      color: #6ee7b7; padding: 6px 12px; border-radius: 8px;
      font-size: 11px; font-family: -apple-system, sans-serif;
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; opacity: 0.8; transition: opacity 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    badge.innerHTML = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pgPulse 2s infinite;"></span><style>@keyframes pgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }</style>PrivacyGuard Active`;

    badge.title = 'PrivacyGuard is protecting your messages on ' + (currentSite?.name || 'this site');

    badge.addEventListener('mouseenter', () => { badge.style.opacity = '1'; });
    badge.addEventListener('mouseleave', () => { badge.style.opacity = '0.8'; });

    badge.addEventListener('click', () => {
      // Toggle enabled state
      isEnabled = !isEnabled;
      badge.innerHTML = isEnabled
        ? `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pgPulse 2s infinite;"></span><style>@keyframes pgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }</style>PrivacyGuard Active`
        : `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444;"></span>PrivacyGuard Paused`;
      badge.style.background = isEnabled ? '#064e3b' : '#7f1d1d';
      badge.style.borderColor = isEnabled ? '#10b981' : '#ef4444';
      badge.style.color = isEnabled ? '#6ee7b7' : '#fca5a5';

      sendMessageToExtension({ type: 'TOGGLE_ENABLED', enabled: isEnabled });
      log(`Protection ${isEnabled ? 'enabled' : 'paused'}`);
    });

    document.body.appendChild(badge);
  }

  // ============================================================
  // PERMISSION DISPLAY
  // ============================================================

  function showPermissionsOnPage() {
    // Show what permissions the current AI site has
    const permissions = getSitePermissions(currentSite?.key);
    if (!permissions || permissions.length === 0) return;

    // Add a small info icon near the site's header
    const header = document.querySelector('header, nav, [class*="header"]');
    if (!header) return;

    // Don't inject into the header, just log it
    log(`Detected permissions for ${currentSite?.name}: ${permissions.map(p => p.name).join(', ')}`);
  }

  function getSitePermissions(siteKey) {
    // Default known permissions for each AI service
    const knownPermissions = {
      chatgpt: [
        { name: 'Chat History', status: 'active', risk: 'MEDIUM', description: 'OpenAI stores your chat history for training and review' },
        { name: 'Memory', status: 'active', risk: 'HIGH', description: 'ChatGPT can remember details about you across conversations' },
        { name: 'File Upload', status: 'active', risk: 'HIGH', description: 'Files you upload can be used for analysis and training' },
        { name: 'Image Generation', status: 'active', risk: 'LOW', description: 'Images you generate may be stored' },
        { name: 'Web Browsing', status: 'active', risk: 'MEDIUM', description: 'ChatGPT can browse the web, potentially exposing your search queries' },
      ],
      claude: [
        { name: 'Conversation Memory', status: 'limited', risk: 'MEDIUM', description: 'Claude has limited conversation memory within a session' },
        { name: 'File Analysis', status: 'active', risk: 'HIGH', description: 'Files uploaded are processed and may be retained temporarily' },
        { name: 'Artifacts', status: 'active', risk: 'LOW', description: 'Code and content in Artifacts may be stored' },
      ],
      gemini: [
        { name: 'Activity History', status: 'active', risk: 'MEDIUM', description: 'Google stores your Gemini activity in your account' },
        { name: 'Google Integration', status: 'active', risk: 'HIGH', description: 'Gemini has access to your Google account data' },
        { name: 'File Upload', status: 'active', risk: 'HIGH', description: 'Files uploaded to Gemini are processed by Google' },
        { name: 'YouTube Extension', status: 'active', risk: 'MEDIUM', description: 'Gemini can access YouTube video content' },
        { name: 'Gmail Integration', status: 'active', risk: 'CRITICAL', description: 'Gemini can read your emails if connected' },
      ],
      copilot: [
        { name: 'Microsoft Account', status: 'active', risk: 'MEDIUM', description: 'Copilot is linked to your Microsoft account' },
        { name: 'Search History', status: 'active', risk: 'MEDIUM', description: 'Copilot searches are stored in your Bing history' },
        { name: 'File Upload', status: 'active', risk: 'HIGH', description: 'Files you upload are processed by Microsoft' },
      ],
    };

    return knownPermissions[siteKey] || [];
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function init() {
    currentSite = detectSite();
    if (!currentSite) {
      log('Unknown site - PrivacyGuard monitoring mode');
      return;
    }

    log(`PrivacyGuard activated on ${currentSite.name}`);

    // Check if enabled
    getExtensionSettings((settings) => {
      isEnabled = settings.enabled;
      if (!isEnabled) {
        log('Protection is paused (disabled in settings)');
        return;
      }

      // Start all protection layers
      addStatusBadge();
      startObservation();
      interceptKeyboard();
      showPermissionsOnPage();

      log('All protection layers active: message interception, file monitoring, keyboard interception');
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

  // Cleanup on page unload
  window.addEventListener('unload', () => {
    if (observationInterval) clearInterval(observationInterval);
  });
})();
