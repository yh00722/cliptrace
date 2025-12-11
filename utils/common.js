// utils/common.js
// Common utility functions

/**
 * Generate unique ID
 * @returns {string} Unique identifier
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * HTML escape to prevent XSS attacks
 * @param {string} text - Original text
 * @returns {string} Escaped HTML-safe text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncate text
 * @param {string} text - Original text
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 200) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Format time as relative time
 * @param {number} timestamp - Timestamp
 * @returns {string} Formatted time string
 */
export function formatTime(timestamp) {
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

/**
 * Format date as group header
 * @param {string} dateString - Date string
 * @returns {string} Formatted date header
 */
export function formatDateHeader(dateString) {
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

/**
 * Tag type mapping
 */
export const TAG_LABELS = {
    code: 'Code',
    link: 'Link',
    email: 'Email',
    numbers: 'Numbers'
};

/**
 * Get tag display name
 * @param {string} tag - Tag identifier
 * @returns {string} Tag display name
 */
export function getTagLabel(tag) {
    return TAG_LABELS[tag] || tag;
}

/**
 * Default favicon icon (Base64 SVG)
 */
export const DEFAULT_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5OTkiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDJhMTAgMTAgMCAxIDAgMTAgMTBBMTAgMTAgMCAwIDAgMTIgMnoiLz48L3N2Zz4=';

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay time (milliseconds)
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 200) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Deep clone object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
