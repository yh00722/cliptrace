// utils/storage.js
// Storage utility functions

const STORAGE_KEY = 'clipboardHistory';
const MAX_ITEMS = 1000;

/**
 * Get all clipboard history
 */
export async function getHistory() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
}

/**
 * Save clipboard history
 */
export async function saveHistory(history) {
    await chrome.storage.local.set({ [STORAGE_KEY]: history });
}

/**
 * Add new item
 */
export async function addItem(item) {
    const history = await getHistory();
    history.unshift(item);

    // Limit quantity
    if (history.length > MAX_ITEMS) {
        history.pop();
    }

    await saveHistory(history);
    return item;
}

/**
 * Delete item
 */
export async function deleteItem(id) {
    const history = await getHistory();
    const filtered = history.filter(item => item.id !== id);
    await saveHistory(filtered);
    return filtered;
}

/**
 * Clear all
 */
export async function clearAll() {
    await saveHistory([]);
}

/**
 * Search history
 */
export async function searchHistory(query) {
    const history = await getHistory();
    const lowerQuery = query.toLowerCase();

    return history.filter(item =>
        item.text.toLowerCase().includes(lowerQuery) ||
        (item.pageTitle && item.pageTitle.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Get storage usage information
 * Returns used, available, and total quota bytes
 */
export async function getStorageUsage() {
    const bytesInUse = await chrome.storage.local.getBytesInUse([STORAGE_KEY]);
    // Use actual browser quota (typically 10MB for chrome.storage.local)
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760;
    const available = quota - bytesInUse;

    return {
        used: bytesInUse,
        available: available,
        quota: quota,
        percentage: (bytesInUse / quota * 100).toFixed(2)
    };
}

/**
 * Export data as JSON
 */
export async function exportData() {
    const history = await getHistory();
    return JSON.stringify(history, null, 2);
}

/**
 * Import data from JSON
 */
export async function importData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!Array.isArray(data)) {
            throw new Error('Invalid data format');
        }
        await saveHistory(data);
        return data.length;
    } catch (error) {
        throw new Error('Import failed: ' + error.message);
    }
}
