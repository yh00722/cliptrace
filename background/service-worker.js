// background/service-worker.js
// Background service script: receives messages from content scripts, manages storage, handles sidebar interactions

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPY_DETECTED') {
    saveClipboardItem(message.data, sender.tab);
    sendResponse({ success: true });
  }
  return true; // Keep message channel open
});

// Save clipboard item
async function saveClipboardItem(data, tab) {
  try {
    // Check storage quota before saving
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB
    const usagePercent = (bytesInUse / quota) * 100;

    // If storage is nearly full (>95%), skip saving and notify
    if (usagePercent > 95) {
      console.warn('[ClipTrace] Storage limit reached. Cannot auto-save.');
      // Notify sidebar about storage full
      chrome.runtime.sendMessage({
        type: 'STORAGE_FULL',
        message: 'Storage limit reached'
      }).catch(() => { });
      return;
    }

    // Get existing data from storage
    const result = await chrome.storage.local.get(['clipboardHistory']);
    const history = result.clipboardHistory || [];

    // Check for same-day duplicates (same URL and same text within the same day)
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const isDuplicateToday = history.some(item =>
      item.text === data.text &&
      item.url === data.url &&
      item.timestamp >= todayStart
    );

    if (isDuplicateToday) {
      console.log('[ClipTrace] Skipping same-day duplicate from same page');
      return;
    }

    // Create new item
    const item = {
      id: generateId(),
      text: data.text,
      url: data.url,
      pageTitle: data.pageTitle,
      favicon: tab?.favIconUrl || '',
      timestamp: data.timestamp,
      selectionInfo: data.selectionInfo,
      tags: extractTags(data.text)
    };

    // Add to history (limit to 1000 items)
    history.unshift(item);
    if (history.length > 1000) {
      history.pop();
    }

    // Save to storage with error handling
    try {
      await chrome.storage.local.set({ clipboardHistory: history });
    } catch (saveError) {
      // Handle quota exceeded error
      if (saveError.message?.includes('QUOTA') || saveError.name === 'QuotaExceededError') {
        console.error('[ClipTrace] Storage quota exceeded. Cannot save.');
        chrome.runtime.sendMessage({
          type: 'STORAGE_FULL',
          message: 'Storage quota exceeded'
        }).catch(() => { });
        return;
      }
      throw saveError;
    }

    // Notify sidebar of update (ignore errors when sidebar is not open)
    chrome.runtime.sendMessage({
      type: 'HISTORY_UPDATED',
      data: item
    }).catch(() => {
      // Silently ignore when sidebar is not open
    });

    console.log('[ClipTrace] Saved:', item.text.substring(0, 50) + '...');

  } catch (error) {
    console.error('[ClipTrace] Failed to save:', error);
  }
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Auto-extract tags
function extractTags(text) {
  const tags = [];

  // Detect code
  if (/function\s|const\s|let\s|var\s|class\s|def\s|import\s|=>/.test(text)) {
    tags.push('code');
  }

  // Detect URL
  if (/https?:\/\/[^\s]+/.test(text)) {
    tags.push('link');
  }

  // Detect email
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
    tags.push('email');
  }

  // Detect numbers/data
  if (/\d{4,}/.test(text)) {
    tags.push('numbers');
  }

  return tags;
}

// Listen for extension icon click (open sidebar)
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('[ClipTrace] Failed to open sidebar:', error);
  }
});

// Set sidebar options
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });

// Listen for requests from sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_HISTORY') {
    chrome.storage.local.get(['clipboardHistory']).then(result => {
      sendResponse({ history: result.clipboardHistory || [] });
    });
    return true;
  }

  if (message.type === 'DELETE_ITEM') {
    deleteItem(message.id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CLEAR_ALL') {
    chrome.storage.local.set({ clipboardHistory: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Delete single item
async function deleteItem(id) {
  const result = await chrome.storage.local.get(['clipboardHistory']);
  const history = result.clipboardHistory || [];
  const filtered = history.filter(item => item.id !== id);
  await chrome.storage.local.set({ clipboardHistory: filtered });
}

console.log('[ClipTrace] Background service started');
