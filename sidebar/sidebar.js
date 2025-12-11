// sidebar/sidebar.js
// Sidebar main logic

let clipboardHistory = [];
let currentFilter = 'all';
let searchQuery = '';

// ============ Initialization ============

// Note: The DOMContentLoaded listener here is overridden by the unified initialization
// Actual initialization is at the end of the file after setupSettingsListeners

// Load history
async function loadHistory() {
    try {
        const result = await chrome.storage.local.get(['clipboardHistory']);
        clipboardHistory = result.clipboardHistory || [];
        renderList();
    } catch (error) {
        console.error('[ClipTrace] Failed to load history:', error);
        showToast('Failed to load', 'error');
    }
}

// ============ Event Listeners ============

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderList();
        }, 200);
    });

    // Panel toggle handlers
    const searchPanel = document.getElementById('searchPanel');
    const filterPanel = document.getElementById('filterPanel');
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const filterToggleBtn = document.getElementById('filterToggleBtn');
    const searchCloseBtn = document.getElementById('searchCloseBtn');

    // Toggle search panel
    searchToggleBtn.addEventListener('click', () => {
        const isVisible = searchPanel.style.display !== 'none';
        searchPanel.style.display = isVisible ? 'none' : 'block';
        searchToggleBtn.classList.toggle('active', !isVisible);
        if (!isVisible) {
            searchInput.focus();
        }
    });

    // Close search panel
    searchCloseBtn.addEventListener('click', () => {
        searchPanel.style.display = 'none';
        searchToggleBtn.classList.remove('active');
        searchInput.value = '';
        searchQuery = '';
        renderList();
    });

    // Toggle filter panel
    filterToggleBtn.addEventListener('click', () => {
        const isVisible = filterPanel.style.display !== 'none';
        filterPanel.style.display = isVisible ? 'none' : 'flex';
        filterToggleBtn.classList.toggle('active', !isVisible);
    });

    // Filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderList();
        });
    });

    // Clear all
    document.getElementById('clearAllBtn').addEventListener('click', async () => {
        if (clipboardHistory.length === 0) {
            showToast('Clipboard is empty', 'info');
            return;
        }

        if (confirm('Are you sure you want to clear all clipboard records? This action cannot be undone.')) {
            try {
                await chrome.storage.local.set({ clipboardHistory: [] });
                clipboardHistory = [];
                renderList();
                showToast('All records cleared', 'success');
            } catch (error) {
                showToast('Failed to clear', 'error');
            }
        }
    });

    // Listen for storage changes (single source of truth for updates)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.clipboardHistory) {
            const oldLength = clipboardHistory.length;
            clipboardHistory = changes.clipboardHistory.newValue || [];
            renderList();

            // Show toast only when new items are added
            if (clipboardHistory.length > oldLength) {
                showToast('New copy saved', 'success');
            }
        }
    });

    // Theme toggle
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        // Save preference
        chrome.storage.local.set({ darkMode: isDark });
        showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'success');
    });
}

// ============ Render List ============

function renderList() {
    const filtered = filterHistory();
    const grouped = groupByDate(filtered);

    const listContainer = document.getElementById('clipboardList');
    listContainer.innerHTML = '';

    // Update stats
    document.getElementById('statsCount').textContent = `${filtered.length} records`;

    if (filtered.length === 0) {
        listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>${searchQuery ? 'No matching records found' : 'No clipboard records'}</p>
        <p class="empty-hint">${searchQuery ? 'Try different keywords' : 'Copy text on any webpage to auto-save'}</p>
      </div>
    `;
        return;
    }

    Object.entries(grouped).forEach(([date, items]) => {
        // Date group header
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = formatDateHeader(date);
        listContainer.appendChild(dateHeader);

        // Item list
        items.forEach(item => {
            const itemElement = createClipboardItem(item);
            listContainer.appendChild(itemElement);
        });
    });
}

// Filter history
function filterHistory() {
    let filtered = clipboardHistory;

    // Filter by time
    const now = Date.now();
    switch (currentFilter) {
        case 'today':
            const todayStart = new Date().setHours(0, 0, 0, 0);
            filtered = filtered.filter(item => item.timestamp >= todayStart);
            break;
        case 'week':
            filtered = filtered.filter(item => now - item.timestamp < 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            filtered = filtered.filter(item => now - item.timestamp < 30 * 24 * 60 * 60 * 1000);
            break;
    }

    // Filter by search term
    if (searchQuery) {
        filtered = filtered.filter(item =>
            item.text.toLowerCase().includes(searchQuery) ||
            (item.pageTitle && item.pageTitle.toLowerCase().includes(searchQuery)) ||
            (item.url && item.url.toLowerCase().includes(searchQuery))
        );
    }

    return filtered;
}

// Group by date
function groupByDate(items) {
    const grouped = {};

    items.forEach(item => {
        const date = new Date(item.timestamp).toDateString();
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(item);
    });

    return grouped;
}

// ============ Create Item Element ============

function createClipboardItem(item) {
    const div = document.createElement('div');
    div.className = 'clipboard-item';
    div.dataset.id = item.id;

    // Build tags HTML
    const tagsHtml = item.tags && item.tags.length > 0
        ? `<div class="item-tags">${item.tags.map(tag => `<span class="tag ${tag}">${getTagLabel(tag)}</span>`).join('')}</div>`
        : '';

    // Build content - collapse if more than 5 lines
    const lines = item.text.split('\n');
    const lineCount = lines.length;
    const isLongContent = lineCount > 8;
    const displayText = escapeHtml(isLongContent ? lines.slice(0, 5).join('\n') + '...' : item.text);

    div.innerHTML = `
    <div class="item-header">
      <img src="${item.favicon || getDefaultFavicon()}" class="favicon">
      <div class="item-meta">
        <div class="page-title" title="${escapeHtml(item.pageTitle || 'Unknown page')}">${escapeHtml(item.pageTitle || 'Unknown page')}</div>
        <div class="timestamp">${formatTime(item.timestamp)}</div>
      </div>
      <button class="delete-btn" title="Delete">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"></path>
          <path d="m6 6 12 12"></path>
        </svg>
      </button>
    </div>
    ${tagsHtml}
    <div class="item-content ${isLongContent ? '' : 'expanded'}">${displayText}</div>
    <div class="item-actions">
      <button class="action-btn" data-action="open">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        Open
      </button>
      <button class="action-btn" data-action="edit">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          <path d="m15 5 4 4"></path>
        </svg>
        Edit
      </button>
      <button class="action-btn" data-action="copy">
        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
        </svg>
        Copy
      </button>
    </div>
  `;

    // Handle favicon error - use addEventListener instead of inline onerror (CSP compliance)
    const faviconImg = div.querySelector('.favicon');
    faviconImg.addEventListener('error', () => {
        faviconImg.src = getDefaultFavicon();
    });

    // Bind events
    div.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id, div);
    });

    div.querySelector('[data-action="open"]').addEventListener('click', () => openAndHighlight(item));
    div.querySelector('[data-action="edit"]').addEventListener('click', () => editItem(item, div));
    div.querySelector('[data-action="copy"]').addEventListener('click', () => copyToClipboard(item.text));

    // Click page title to open link
    div.querySelector('.page-title').addEventListener('click', () => {
        chrome.tabs.create({ url: item.url });
    });

    // Click content to expand/collapse
    if (isLongContent) {
        const contentEl = div.querySelector('.item-content');
        contentEl.style.cursor = 'pointer';
        contentEl.addEventListener('click', () => {
            contentEl.classList.toggle('expanded');
            contentEl.innerHTML = contentEl.classList.contains('expanded')
                ? escapeHtml(item.text)
                : displayText;
        });
    }

    return div;
}

// ============ Action Functions ============

// Delete item
async function deleteItem(id, element) {
    try {
        // Add delete animation
        element.style.opacity = '0';
        element.style.transform = 'translateX(-20px)';
        element.style.transition = 'all 0.3s ease';

        setTimeout(async () => {
            clipboardHistory = clipboardHistory.filter(item => item.id !== id);
            await chrome.storage.local.set({ clipboardHistory });
            renderList();
            showToast('Deleted', 'success');
        }, 300);
    } catch (error) {
        showToast('Failed to delete', 'error');
    }
}

// Edit item
function editItem(item, element) {
    const contentEl = element.querySelector('.item-content');
    const actionsEl = element.querySelector('.item-actions');

    // Store original content for cancel
    const originalText = item.text;

    // Replace content with textarea
    contentEl.innerHTML = '';
    contentEl.classList.add('editing');
    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = originalText;
    textarea.rows = Math.min(Math.max(originalText.split('\n').length, 3), 10);
    contentEl.appendChild(textarea);

    // Replace action buttons with save/cancel
    actionsEl.innerHTML = `
        <button class="action-btn primary" data-action="save">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"></path>
            </svg>
            Save
        </button>
        <button class="action-btn" data-action="cancel">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
            </svg>
            Cancel
        </button>
    `;

    // Focus textarea
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Save button
    actionsEl.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText) {
            showToast('Content cannot be empty', 'error');
            return;
        }

        try {
            // Update item in history
            const index = clipboardHistory.findIndex(i => i.id === item.id);
            if (index !== -1) {
                clipboardHistory[index].text = newText;
                // Re-extract tags for edited content
                clipboardHistory[index].tags = extractTags(newText);
                await chrome.storage.local.set({ clipboardHistory });
                renderList();
                showToast('Saved', 'success');
            }
        } catch (error) {
            showToast('Failed to save', 'error');
        }
    });

    // Cancel button
    actionsEl.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        renderList(); // Just re-render to restore original state
    });
}

// Extract tags from text (for edited content)
function extractTags(text) {
    const tags = [];

    // Code detection
    if (/\b(function|const|let|var|class|def|import|export|return|=>)\b/.test(text)) {
        tags.push('code');
    }

    // Link detection
    if (/https?:\/\//.test(text)) {
        tags.push('link');
    }

    // Email detection
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
        tags.push('email');
    }

    // Numbers detection
    if (/\b\d{4,}\b/.test(text)) {
        tags.push('numbers');
    }

    return tags;
}

// Open and highlight
async function openAndHighlight(item) {
    try {
        // Find already open tabs
        const tabs = await chrome.tabs.query({});
        let existingTab = tabs.find(tab => tab.url === item.url);

        let tab;
        if (existingTab) {
            // Switch to existing tab
            tab = existingTab;
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
        } else {
            // Create new tab
            tab = await chrome.tabs.create({ url: item.url });

            // Wait for page to load
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Page load timeout')), 15000);

                const listener = (tabId, info) => {
                    if (tabId === tab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        clearTimeout(timeout);
                        // Extra wait to ensure DOM is fully loaded
                        setTimeout(resolve, 500);
                    }
                };

                chrome.tabs.onUpdated.addListener(listener);
            });
        }

        // Send highlight message (include original text as fallback search)
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'HIGHLIGHT_TEXT',
                data: {
                    ...item.selectionInfo,
                    originalText: item.text  // Add original text for fallback search
                }
            });
        } catch (e) {
            console.warn('[ClipTrace] Failed to send highlight message:', e);
        }

        showToast('Navigated to original page', 'success');
    } catch (error) {
        console.error('[ClipTrace] Failed to open:', error);
        showToast('Failed to open: ' + error.message, 'error');
    }
}

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'success');
    } catch (error) {
        // Fallback method
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard', 'success');
    }
}

// ============ Utility Functions ============

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateHeader(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    if (dateString === today.toDateString()) return 'Today';
    if (dateString === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getTagLabel(tag) {
    const labels = {
        code: 'Code',
        link: 'Link',
        email: 'Email',
        numbers: 'Numbers'
    };
    return labels[tag] || tag;
}

function getDefaultFavicon() {
    // Return a simple data URI as default icon
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5OTkiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDJhMTAgMTAgMCAxIDAgMTAgMTBBMTAgMTAgMCAwIDAgMTIgMnoiLz48L3N2Zz4=';
}

// Toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Show animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ============ Settings Panel Functions ============

// Settings storage key
const SETTINGS_KEY = 'smartClipboardSettings';

// Default settings
const DEFAULT_SETTINGS = {
    incognitoMode: false,
    blacklist: [],
    autoCleanup: false,
    cleanupDays: 30
};

// Current settings
let currentSettings = { ...DEFAULT_SETTINGS };

// Initialize settings
async function initSettings() {
    try {
        const result = await chrome.storage.local.get([SETTINGS_KEY]);
        currentSettings = { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
        updateSettingsUI();
    } catch (error) {
        console.error('[ClipTrace] Failed to load settings:', error);
    }
}

// Save settings
async function saveSettings() {
    try {
        await chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
    } catch (error) {
        console.error('[ClipTrace] Failed to save settings:', error);
    }
}

// Update settings UI
function updateSettingsUI() {
    // Update incognito mode toggle
    const incognitoToggle = document.getElementById('incognitoToggle');
    if (incognitoToggle) {
        incognitoToggle.checked = currentSettings.incognitoMode;
    }

    // Update auto cleanup toggle
    const autoCleanupToggle = document.getElementById('autoCleanupToggle');
    const cleanupDaysWrapper = document.getElementById('cleanupDaysWrapper');
    const cleanupDaysSelect = document.getElementById('cleanupDays');
    if (autoCleanupToggle) {
        autoCleanupToggle.checked = currentSettings.autoCleanup;
        if (cleanupDaysWrapper) {
            cleanupDaysWrapper.style.display = currentSettings.autoCleanup ? 'flex' : 'none';
        }
    }
    if (cleanupDaysSelect) {
        cleanupDaysSelect.value = currentSettings.cleanupDays || 30;
    }

    // Update blacklist
    renderBlacklist();

    // Update storage info
    updateStorageInfo();
}

// Render blacklist
function renderBlacklist() {
    const list = document.getElementById('blacklistList');
    if (!list) return;

    if (currentSettings.blacklist.length === 0) {
        list.innerHTML = '<li class="blacklist-empty">No blacklisted sites</li>';
        return;
    }

    list.innerHTML = currentSettings.blacklist.map(domain => `
        <li>
            <span>${escapeHtml(domain)}</span>
            <button class="remove-btn" data-domain="${escapeHtml(domain)}" title="Remove">×</button>
        </li>
    `).join('');

    // Bind remove events
    list.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const domain = e.target.dataset.domain;
            removeFromBlacklist(domain);
        });
    });
}

// Add to blacklist
function addToBlacklist(domain) {
    domain = domain.trim().toLowerCase();
    if (!domain) {
        showToast('Please enter a domain', 'error');
        return;
    }

    // Simple domain validation
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) {
        showToast('Please enter a valid domain', 'error');
        return;
    }

    if (currentSettings.blacklist.includes(domain)) {
        showToast('Domain already in blacklist', 'info');
        return;
    }

    currentSettings.blacklist.push(domain);
    saveSettings();
    renderBlacklist();
    showToast('Added to blacklist', 'success');
}

// Remove from blacklist
function removeFromBlacklist(domain) {
    currentSettings.blacklist = currentSettings.blacklist.filter(d => d !== domain);
    saveSettings();
    renderBlacklist();
    showToast('Removed from blacklist', 'success');
}

// Update storage usage info
// Uses actual browser quota (QUOTA_BYTES) without artificial limits
async function updateStorageInfo() {
    const storageInfoEl = document.getElementById('storageInfo');
    if (!storageInfoEl) return;

    try {
        const bytesInUse = await chrome.storage.local.getBytesInUse(null);
        // Use actual browser quota (typically 10MB for chrome.storage.local)
        const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // Fallback to 10MB
        const available = quota - bytesInUse;
        const percentage = (bytesInUse / quota * 100);

        // Format bytes to human readable
        const formatBytes = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(2) + ' MB';
        };

        // Check if storage is nearly full (>90%) or full (>95%)
        let warningHtml = '';
        if (percentage > 95) {
            warningHtml = '<div class="storage-warning storage-full">Storage full. Auto-save disabled.</div>';
        } else if (percentage > 90) {
            warningHtml = '<div class="storage-warning">Storage almost full. Consider exporting data.</div>';
        }

        storageInfoEl.innerHTML = `
            <div class="storage-stats">
                <span>Used: ${formatBytes(bytesInUse)}</span>
                <span>Available: ${formatBytes(available)}</span>
            </div>
            <div class="storage-bar">
                <div class="storage-bar-fill${percentage > 90 ? ' storage-bar-warning' : ''}" style="width: ${Math.min(percentage, 100)}%"></div>
            </div>
            ${warningHtml}
        `;
    } catch (error) {
        storageInfoEl.textContent = 'Unable to get storage info';
    }
}

// Listen for STORAGE_FULL message from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STORAGE_FULL') {
        showToast('Storage full. Auto-save disabled.', 'error');
        updateStorageInfo();
    }
});

// Export data
async function exportData() {
    try {
        const result = await chrome.storage.local.get(['clipboardHistory']);
        const history = result.clipboardHistory || [];

        const exportData = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            itemCount: history.length,
            data: history
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-clipboard-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Exported ${history.length} records`, 'success');
    } catch (error) {
        showToast('Export failed: ' + error.message, 'error');
    }
}

// Import data
async function importData(file) {
    try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        let dataToImport = [];

        // Support two formats: direct array or object with data field
        if (Array.isArray(importedData)) {
            dataToImport = importedData;
        } else if (importedData.data && Array.isArray(importedData.data)) {
            dataToImport = importedData.data;
        } else {
            throw new Error('Invalid data format');
        }

        // Validate data format
        if (!dataToImport.every(item => item.id && item.text && item.timestamp)) {
            throw new Error('Incorrect data format');
        }

        // Merge with existing data
        const result = await chrome.storage.local.get(['clipboardHistory']);
        const existingHistory = result.clipboardHistory || [];

        // Merge by timestamp and deduplicate
        const existingIds = new Set(existingHistory.map(item => item.id));
        const newItems = dataToImport.filter(item => !existingIds.has(item.id));

        const mergedHistory = [...newItems, ...existingHistory]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 1000);

        await chrome.storage.local.set({ clipboardHistory: mergedHistory });

        clipboardHistory = mergedHistory;
        renderList();
        updateStorageInfo();

        showToast(`Imported ${newItems.length} new records`, 'success');
    } catch (error) {
        showToast('Import failed: ' + error.message, 'error');
    }
}

// Settings panel event listeners
function setupSettingsListeners() {
    // Open settings
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'flex';
        updateStorageInfo();
    });

    // Close settings
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').style.display = 'none';
    });

    // Click overlay to close
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            e.target.style.display = 'none';
        }
    });

    // Incognito mode toggle
    document.getElementById('incognitoToggle').addEventListener('change', (e) => {
        currentSettings.incognitoMode = e.target.checked;
        saveSettings();
        showToast(e.target.checked ? 'Incognito mode enabled' : 'Incognito mode disabled', 'success');
    });

    // Add to blacklist
    document.getElementById('addBlacklistBtn').addEventListener('click', () => {
        const input = document.getElementById('blacklistInput');
        addToBlacklist(input.value);
        input.value = '';
    });

    // Enter key to add blacklist
    document.getElementById('blacklistInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('blacklistInput');
            addToBlacklist(input.value);
            input.value = '';
        }
    });

    // Export data
    document.getElementById('exportDataBtn').addEventListener('click', exportData);

    // Import data
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importData(e.target.files[0]);
            e.target.value = ''; // Reset to allow re-selecting same file
        }
    });

    // Auto cleanup toggle
    document.getElementById('autoCleanupToggle').addEventListener('change', (e) => {
        currentSettings.autoCleanup = e.target.checked;
        saveSettings();

        const cleanupDaysWrapper = document.getElementById('cleanupDaysWrapper');
        if (cleanupDaysWrapper) {
            cleanupDaysWrapper.style.display = e.target.checked ? 'flex' : 'none';
        }

        showToast(e.target.checked ? 'Auto cleanup enabled' : 'Auto cleanup disabled', 'success');
    });

    // Cleanup days change
    document.getElementById('cleanupDays').addEventListener('change', (e) => {
        currentSettings.cleanupDays = parseInt(e.target.value, 10);
        saveSettings();
    });

    // Clean now button
    document.getElementById('cleanupNowBtn').addEventListener('click', () => {
        cleanupExpiredData();
    });
}

// Cleanup expired data
async function cleanupExpiredData() {
    try {
        const days = currentSettings.cleanupDays || 30;
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

        const result = await chrome.storage.local.get(['clipboardHistory']);
        const history = result.clipboardHistory || [];

        const filtered = history.filter(item => item.timestamp >= cutoffTime);
        const removedCount = history.length - filtered.length;

        if (removedCount > 0) {
            await chrome.storage.local.set({ clipboardHistory: filtered });
            clipboardHistory = filtered;
            renderList();
            updateStorageInfo();
            showToast(`Cleaned ${removedCount} expired records`, 'success');
        } else {
            showToast('No expired records to clean', 'success');
        }
    } catch (error) {
        console.error('[ClipTrace] Failed to clean expired data:', error);
        showToast('Cleanup failed', 'error');
    }
}

// ============ Initialization Entry ============
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved theme preference (default: light mode)
    const { darkMode } = await chrome.storage.local.get(['darkMode']);
    if (darkMode) {
        document.body.classList.add('dark-mode');
    }

    await loadHistory();
    setupEventListeners();
    await initSettings();
    setupSettingsListeners();

    // If auto cleanup is enabled, run when sidebar opens
    if (currentSettings.autoCleanup) {
        cleanupExpiredData();
    }
});

console.log('[ClipTrace] Sidebar loaded');

