// content/content-script.js
// Content script: listens for copy events on the page, extracts copied content and context information

// ============ Extension Context Check ============

// Check if extension context is still valid (not invalidated after reload)
function isExtensionContextValid() {
    try {
        return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

// ============ Sensitive Information Protection ============

// Sensitive domains - exact hostname match
const SENSITIVE_HOSTNAMES = [
    'accounts.google.com',
    'login.microsoftonline.com',
    'signin.aws.amazon.com',
    'auth0.com',
    'paypal.com',
    'www.paypal.com',
    'stripe.com',
    'dashboard.stripe.com',
    '1password.com',
    'my.1password.com',
    'lastpass.com',
    'vault.bitwarden.com',
    'app.dashlane.com'
];

// Sensitive hostname keywords - partial match on hostname only
const SENSITIVE_HOSTNAME_KEYWORDS = [
    'login',
    'signin',
    'signup',
    'auth',
    'bank',
    'banking'
];

// Sensitive content detection regex
const SENSITIVE_PATTERNS = [
    /\b\d{13,19}\b/,                                      // Credit card number
    /\b\d{3}-\d{2}-\d{4}\b/,                              // SSN
    /password["']?\s*[:=]\s*["']?[^"'\s]+/i,              // Password field
    /\bsecret\s*[:=]/i,                                   // Secret key
    /\bapi[_-]?key\s*[:=]/i,                              // API Key
    /\btoken\s*[:=]/i,                                    // Token
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/            // Private key
];

// Check if recording should be skipped
function shouldSkipRecording(text, url) {
    // Extract hostname from URL (only check hostname, not query params)
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        // Check exact hostname match
        if (SENSITIVE_HOSTNAMES.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
            return true;
        }

        // Check hostname keywords (only in hostname, not in query params)
        if (SENSITIVE_HOSTNAME_KEYWORDS.some(keyword => hostname.includes(keyword))) {
            return true;
        }
    } catch (e) {
        // URL parsing failed, continue with other checks
    }

    // Check if near password input field
    const activeElement = document.activeElement;
    if (activeElement?.type === 'password' ||
        activeElement?.closest('form')?.querySelector('input[type="password"]')) {
        return true;
    }

    // Check if text contains sensitive information
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(text))) {
        return true;
    }

    return false;
}

// ============ Copy Event Listener ============

// Get user settings
async function getUserSettings() {
    try {
        const result = await chrome.storage.local.get(['smartClipboardSettings']);
        return result.smartClipboardSettings || { incognitoMode: false, blacklist: [] };
    } catch (e) {
        return { incognitoMode: false, blacklist: [] };
    }
}

// Check if current site is in user blacklist
function isInUserBlacklist(url, blacklist) {
    if (!blacklist || blacklist.length === 0) return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return blacklist.some(domain => {
            const d = domain.toLowerCase();
            return hostname === d || hostname.endsWith('.' + d);
        });
    } catch (e) {
        return false;
    }
}

document.addEventListener('copy', async (event) => {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
        return; // Extension was reloaded, silently exit
    }

    const selection = window.getSelection();
    const copiedText = selection.toString().trim();

    if (!copiedText) return;

    // Get user settings
    const settings = await getUserSettings();

    // Check incognito mode
    if (settings.incognitoMode) {
        console.log('[ClipTrace] Incognito mode enabled, skipping record');
        return;
    }

    // Check user blacklist
    if (isInUserBlacklist(window.location.href, settings.blacklist)) {
        console.log('[ClipTrace] Current site is blacklisted, skipping record');
        return;
    }

    // Limit text length (max 10000 characters)
    const text = copiedText.length > 10000
        ? copiedText.substring(0, 10000) + '... (truncated)'
        : copiedText;

    // Security check (built-in sensitive site and content detection)
    if (shouldSkipRecording(text, window.location.href)) {
        console.log('[ClipTrace] Sensitive content detected, skipping record');
        return;
    }

    // Get context information
    const clipboardData = {
        text: text,
        url: window.location.href,
        pageTitle: document.title,
        timestamp: Date.now(),
        selectionInfo: getSelectionContext(selection)
    };

    // Send to background script
    chrome.runtime.sendMessage({
        type: 'COPY_DETECTED',
        data: clipboardData
    }).catch(err => {
        console.warn('[ClipTrace] Failed to send message:', err);
    });
});

// ============ Selection Context Extraction ============

function getSelectionContext(selection) {
    if (!selection.rangeCount) return null;

    try {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const selectedText = selection.toString();

        // Get extended context for better matching
        const fullText = container.textContent || '';
        const textIndex = fullText.indexOf(selectedText);

        // Get parent element for additional context
        const parentElement = container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : container;

        return {
            xpath: getXPath(container),
            offset: range.startOffset,
            length: selectedText.length,
            surroundingText: getSurroundingText(container, 100),

            // Enhanced context anchors for multi-match disambiguation
            textBefore: textIndex > 0
                ? fullText.substring(Math.max(0, textIndex - 50), textIndex)
                : '',
            textAfter: textIndex !== -1
                ? fullText.substring(textIndex + selectedText.length, textIndex + selectedText.length + 50)
                : '',

            // Parent element features for fuzzy positioning
            parentTagName: parentElement?.tagName || '',
            parentClassName: parentElement?.className?.split(' ')[0] || ''
        };
    } catch (e) {
        console.warn('[ClipTrace] Failed to get selection context:', e);
        return null;
    }
}

// Generate XPath
function getXPath(node) {
    // Handle text nodes
    let element = node;
    if (node.nodeType === Node.TEXT_NODE) {
        element = node.parentNode;
    }

    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    // Prefer ID
    if (element.id) {
        return `//*[@id="${element.id}"]`;
    }

    if (element === document.body) {
        return '/html/body';
    }

    if (!element.parentNode) {
        return null;
    }

    const siblings = element.parentNode.children;
    let index = 1;

    for (let sibling of siblings) {
        if (sibling === element) {
            const parentPath = getXPath(element.parentNode);
            if (!parentPath) return null;
            return parentPath + '/' + element.tagName.toLowerCase() + '[' + index + ']';
        }
        if (sibling.tagName === element.tagName) {
            index++;
        }
    }

    return null;
}

// Get surrounding text for precise positioning
function getSurroundingText(element, length) {
    try {
        const text = element.textContent || '';
        return text.substring(0, length * 2);
    } catch (e) {
        return '';
    }
}

// ============ Highlight Feature ============

// Listen for highlight requests from sidebar (only if context is valid)
if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!isExtensionContextValid()) {
            return; // Extension was reloaded
        }
        if (message.type === 'HIGHLIGHT_TEXT') {
            highlightText(message.data);
            sendResponse({ success: true });
        }
        return true;
    });
}

// Highlight specified text (with optimizations)
async function highlightText(selectionInfo) {
    try {
        // Wait for lazy-loaded content to fully render (faster timeout for better UX)
        await waitForPageStable();

        let highlighted = false;

        // Get original text for multiple search strategies
        const originalText = selectionInfo?.originalText || '';
        const surroundingText = selectionInfo?.surroundingText || '';

        // Method 1: XPath + offset precise positioning (most reliable)
        if (!highlighted && selectionInfo?.xpath) {
            highlighted = tryXPathHighlight(selectionInfo);
        }

        // Method 2: Exact text match with scoring (handles multi-match)
        if (!highlighted && originalText.length >= 5) {
            highlighted = highlightByExactMatchWithScoring(originalText, selectionInfo);
        }

        // Method 3: First-line anchor (handles cross-element selections)
        if (!highlighted && originalText.length >= 10) {
            highlighted = highlightByFirstLine(originalText);
        }

        // Method 4: Windowed aggregated search (cross-element fallback)
        if (!highlighted && originalText.length >= 15) {
            highlighted = highlightByWindowedSearch(originalText);
        }

        // Method 5: Fuzzy text match (handles minor differences)
        if (!highlighted && originalText.length >= 20) {
            highlighted = highlightByFuzzyMatch(originalText);
        }

        // Method 6: Surrounding text search
        if (!highlighted && surroundingText) {
            highlighted = highlightByTextSearch(surroundingText);
        }

        // Method 7: Partial match (first/last chunks)
        if (!highlighted && originalText.length >= 10) {
            highlighted = highlightByPartialMatch(originalText);
        }

        if (!highlighted) {
            console.warn('[ClipTrace] Cannot locate text, scrolling to top');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('[ClipTrace] Highlight failed:', error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Wait for page to stabilize (lazy loading complete)
// Optimized for faster UX: max 1.5s wait, faster checks
function waitForPageStable() {
    return new Promise(resolve => {
        let lastHeight = document.body.scrollHeight;
        let stableCount = 0;
        const maxWait = 1500;  // Reduced from 3000ms for better UX
        const startTime = Date.now();

        const checkStable = () => {
            const currentHeight = document.body.scrollHeight;
            if (currentHeight === lastHeight) {
                stableCount++;
            } else {
                stableCount = 0;
                lastHeight = currentHeight;
            }

            // Stable for 2 checks or timeout (reduced from 3)
            if (stableCount >= 2 || Date.now() - startTime > maxWait) {
                resolve();
            } else {
                setTimeout(checkStable, 150);  // Faster checks
            }
        };

        setTimeout(checkStable, 200);  // Start faster
    });
}

// Method 1: XPath positioning with strict text verification
function tryXPathHighlight(selectionInfo) {
    try {
        const element = getElementByXPath(selectionInfo.xpath);
        if (!element || selectionInfo.offset === undefined) return false;

        const textNode = findTextNode(element, selectionInfo.offset);
        if (!textNode) return false;

        const range = document.createRange();
        const actualOffset = Math.min(selectionInfo.offset, textNode.length);
        const endOffset = Math.min(actualOffset + selectionInfo.length, textNode.length);

        // Validate offset range is meaningful
        if (actualOffset >= endOffset || endOffset > textNode.length) {
            console.log('[ClipTrace] XPath: Invalid offset range, trying other methods');
            return false;
        }

        range.setStart(textNode, actualOffset);
        range.setEnd(textNode, endOffset);

        // Get the text that would be highlighted
        const foundText = range.toString();

        // Strict validation: ensure we actually found some text
        if (!foundText || foundText.trim().length === 0) {
            console.log('[ClipTrace] XPath: Empty text found, trying other methods');
            return false;
        }

        // Verify that the text at this location matches the original text
        // This prevents incorrect highlighting when multiple records share similar XPath
        const originalText = selectionInfo.originalText || '';
        if (originalText.length > 0) {
            const normalizedFound = normalizeText(foundText);
            const normalizedOriginal = normalizeText(originalText);

            // For multi-line text, check if the first part matches
            // (XPath may only capture part of cross-element selections)
            const minMatchLength = Math.min(normalizedFound.length, normalizedOriginal.length, 30);
            const foundPrefix = normalizedFound.substring(0, minMatchLength);
            const originalPrefix = normalizedOriginal.substring(0, minMatchLength);

            if (minMatchLength >= 5 && foundPrefix !== originalPrefix) {
                console.log('[ClipTrace] XPath text mismatch, trying other methods');
                console.log(`[ClipTrace] Expected: "${originalPrefix.substring(0, 50)}..."`);
                console.log(`[ClipTrace] Found: "${foundPrefix.substring(0, 50)}..."`);
                return false;
            }
        }

        const mark = createHighlightMark();
        range.surroundContents(mark);

        // Final validation: ensure the mark was actually added and is visible
        if (!mark.parentNode || !document.body.contains(mark)) {
            console.log('[ClipTrace] XPath: Mark element not in DOM, trying other methods');
            return false;
        }

        // Check if mark has actual visible content
        if (!mark.textContent || mark.textContent.trim().length === 0) {
            // Remove failed mark and try other methods
            if (mark.parentNode) {
                mark.parentNode.removeChild(mark);
            }
            console.log('[ClipTrace] XPath: Mark has no visible content, trying other methods');
            return false;
        }

        scrollToAndRemove(mark);
        console.log('[ClipTrace] Highlighted via XPath');
        return true;
    } catch (e) {
        console.log('[ClipTrace] XPath: Exception occurred, trying other methods:', e.message);
        return false;
    }
}

// ============ Multi-Match Scoring System ============

/**
 * Calculate context match score for disambiguation
 * @param {Node} node - Text node being evaluated
 * @param {number} matchIndex - Index of match within node
 * @param {object} selectionInfo - Original selection context
 * @returns {number} Score from 0-100
 */
function calculateContextScore(node, matchIndex, selectionInfo) {
    if (!selectionInfo) return 50;  // Default score when no context

    let score = 0;
    const nodeText = node.textContent || '';

    // 1. Text before match check (weight: 35 points)
    if (selectionInfo.textBefore) {
        const beforeText = nodeText.substring(0, matchIndex);
        const normalizedBefore = normalizeText(beforeText);
        const normalizedExpected = normalizeText(selectionInfo.textBefore);

        if (normalizedBefore.endsWith(normalizedExpected)) {
            score += 35;  // Perfect match
        } else if (normalizedExpected.length >= 10) {
            // Check last 20 chars
            const lastChunk = normalizedExpected.slice(-20);
            if (normalizedBefore.includes(lastChunk)) {
                score += 20;  // Partial match
            }
        }
    }

    // 2. Text after match check (weight: 35 points)
    if (selectionInfo.textAfter) {
        const afterText = nodeText.substring(matchIndex + selectionInfo.length);
        const normalizedAfter = normalizeText(afterText);
        const normalizedExpected = normalizeText(selectionInfo.textAfter);

        if (normalizedAfter.startsWith(normalizedExpected)) {
            score += 35;  // Perfect match
        } else if (normalizedExpected.length >= 10) {
            // Check first 20 chars
            const firstChunk = normalizedExpected.slice(0, 20);
            if (normalizedAfter.includes(firstChunk)) {
                score += 20;  // Partial match
            }
        }
    }

    // 3. Parent element check (weight: 20 points)
    const parent = node.parentElement;
    if (parent && selectionInfo.parentTagName) {
        if (parent.tagName === selectionInfo.parentTagName) {
            score += 12;
        }
        if (selectionInfo.parentClassName &&
            parent.className?.includes(selectionInfo.parentClassName)) {
            score += 8;
        }
    }

    // 4. Base score for any match (weight: 10 points)
    score += 10;

    return score;
}

/**
 * Find all text matches and return with scores
 */
function findAllMatchesWithScoring(searchText, selectionInfo) {
    const normalizedSearch = normalizeText(searchText);
    if (normalizedSearch.length < 3) return [];

    const matches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walker.nextNode()) {
        const normalizedNode = normalizeText(node.textContent);
        let searchStart = 0;

        // Find all occurrences in this node
        while (true) {
            const index = normalizedNode.indexOf(normalizedSearch, searchStart);
            if (index === -1) break;

            // Find actual index in original text
            const actualIndex = findActualIndex(node.textContent, normalizedSearch, index);
            if (actualIndex !== -1) {
                const score = calculateContextScore(node, actualIndex, selectionInfo);
                matches.push({ node, index: actualIndex, score, normalizedIndex: index });
            }

            searchStart = index + 1;
        }
    }

    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score);
}

/**
 * Method 2: Exact text match with scoring for multi-match disambiguation
 * Handles short text (>= 5 chars) with context verification
 */
function highlightByExactMatchWithScoring(originalText, selectionInfo) {
    const normalizedSearch = normalizeText(originalText);

    // Lower threshold: allow text >= 5 chars (was 10)
    if (normalizedSearch.length < 5) return false;

    // Find all matches with scores
    const matches = findAllMatchesWithScoring(originalText, selectionInfo);

    if (matches.length === 0) return false;

    // For short text (< 15 chars), require higher confidence
    const isShortText = normalizedSearch.length < 15;
    const minScore = isShortText ? 40 : 20;

    // Get best match
    const bestMatch = matches[0];

    // Log for debugging
    console.log(`[ClipTrace] Found ${matches.length} matches, best score: ${bestMatch.score}`);

    // Reject if confidence too low for short text
    if (bestMatch.score < minScore) {
        console.warn(`[ClipTrace] Match score ${bestMatch.score} below threshold ${minScore}`);
        return false;
    }

    try {
        const range = document.createRange();
        range.setStart(bestMatch.node, bestMatch.index);
        range.setEnd(bestMatch.node, Math.min(bestMatch.index + originalText.length, bestMatch.node.length));

        const mark = createHighlightMark();
        range.surroundContents(mark);
        scrollToAndRemove(mark);
        console.log(`[ClipTrace] Highlighted via scored match (score: ${bestMatch.score})`);
        return true;
    } catch (e) {
        // If best match fails, try second best
        if (matches.length > 1 && matches[1].score >= minScore) {
            try {
                const secondMatch = matches[1];
                const range = document.createRange();
                range.setStart(secondMatch.node, secondMatch.index);
                range.setEnd(secondMatch.node, Math.min(secondMatch.index + originalText.length, secondMatch.node.length));

                const mark = createHighlightMark();
                range.surroundContents(mark);
                scrollToAndRemove(mark);
                console.log(`[ClipTrace] Highlighted via second-best match (score: ${secondMatch.score})`);
                return true;
            } catch (e2) {
                return false;
            }
        }
        return false;
    }
}

// Method 2 (legacy): Exact text match with normalization
function highlightByExactMatch(originalText) {
    const normalizedSearch = normalizeText(originalText);
    if (normalizedSearch.length < 10) return false;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walker.nextNode()) {
        const normalizedNode = normalizeText(node.textContent);
        const index = normalizedNode.indexOf(normalizedSearch);

        if (index !== -1) {
            // Find actual position in original text
            const actualIndex = findActualIndex(node.textContent, normalizedSearch, index);
            if (actualIndex !== -1) {
                try {
                    const range = document.createRange();
                    range.setStart(node, actualIndex);
                    range.setEnd(node, Math.min(actualIndex + originalText.length, node.length));

                    const mark = createHighlightMark();
                    range.surroundContents(mark);
                    scrollToAndRemove(mark);
                    console.log('[ClipTrace] Highlighted via exact match');
                    return true;
                } catch (e) {
                    continue;
                }
            }
        }
    }
    return false;
}

// Method 3: Fuzzy text match (allows minor differences)
function highlightByFuzzyMatch(originalText) {
    // Use middle portion of text (more unique than start/end)
    const textLength = originalText.length;
    const searchStart = Math.floor(textLength * 0.2);
    const searchEnd = Math.min(searchStart + 40, textLength);
    const searchSnippet = normalizeText(originalText.substring(searchStart, searchEnd));

    if (searchSnippet.length < 15) return false;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let bestMatch = null;
    let bestScore = 0;

    while (node = walker.nextNode()) {
        const normalizedNode = normalizeText(node.textContent);
        if (normalizedNode.length < searchSnippet.length) continue;

        const score = calculateSimilarity(normalizedNode, searchSnippet);
        if (score > bestScore && score > 0.7) {
            bestScore = score;
            bestMatch = node;
        }
    }

    if (bestMatch) {
        try {
            const range = document.createRange();
            range.selectNodeContents(bestMatch);
            const mark = createHighlightMark();
            range.surroundContents(mark);
            scrollToAndRemove(mark);
            console.log('[ClipTrace] Highlighted via fuzzy match (score: ' + bestScore.toFixed(2) + ')');
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

// Method 4: Text search (original method, improved)
function highlightByTextSearch(searchText) {
    if (!searchText || searchText.length < 10) return false;

    const searchSnippet = normalizeText(searchText.substring(0, 60));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walker.nextNode()) {
        const normalizedNode = normalizeText(node.textContent);
        if (normalizedNode.includes(searchSnippet)) {
            try {
                const range = document.createRange();
                range.selectNodeContents(node);
                const mark = createHighlightMark();
                range.surroundContents(mark);
                scrollToAndRemove(mark);
                console.log('[ClipTrace] Highlighted via surrounding text');
                return true;
            } catch (e) {
                continue;
            }
        }
    }
    return false;
}

// Method 5: Partial match (try different portions)
function highlightByPartialMatch(originalText) {
    const portions = [
        originalText.substring(0, 20),                          // Start
        originalText.substring(originalText.length - 20),       // End
        originalText.substring(Math.floor(originalText.length / 2) - 10, Math.floor(originalText.length / 2) + 10) // Middle
    ];

    for (const portion of portions) {
        const normalizedPortion = normalizeText(portion);
        if (normalizedPortion.length < 8) continue;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while (node = walker.nextNode()) {
            if (normalizeText(node.textContent).includes(normalizedPortion)) {
                try {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    const mark = createHighlightMark();
                    range.surroundContents(mark);
                    scrollToAndRemove(mark);
                    console.log('[ClipTrace] Highlighted via partial match');
                    return true;
                } catch (e) {
                    continue;
                }
            }
        }
    }
    return false;
}

// ============ Cross-Element Matching Methods ============

/**
 * Method 6: First-Line Anchor Search with Progressive Fallback
 * Uses only the first line of copied text to locate position
 * Tries: 20 chars → 10 chars → 5 chars progressively
 */
function highlightByFirstLine(originalText) {
    // Extract first meaningful line
    const lines = originalText.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return false;

    const firstLine = lines[0].trim();

    // Progressive prefix lengths: try longer first, fallback to shorter
    const prefixLengths = [20, 10, 5];

    for (const prefixLen of prefixLengths) {
        if (firstLine.length < prefixLen) continue;

        const searchText = normalizeText(firstLine.substring(0, prefixLen));
        if (searchText.length < 3) continue;  // Minimum 3 chars to avoid too many false matches

        const result = tryPrefixMatch(searchText, firstLine.length);
        if (result) {
            console.log(`[ClipTrace] Highlighted via first-line anchor (prefix: ${prefixLen} chars)`);
            return true;
        }
    }

    return false;
}

/**
 * Helper: Try to find and highlight text by prefix
 */
function tryPrefixMatch(searchText, highlightLength) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walker.nextNode()) {
        const normalizedNode = normalizeText(node.textContent);
        const index = normalizedNode.indexOf(searchText);

        if (index !== -1) {
            try {
                // Find actual index in original text
                const actualIndex = findActualIndex(node.textContent, searchText, index);
                if (actualIndex !== -1) {
                    const range = document.createRange();
                    range.setStart(node, actualIndex);
                    range.setEnd(node, Math.min(actualIndex + highlightLength, node.length));

                    const mark = createHighlightMark();
                    range.surroundContents(mark);
                    scrollToAndRemove(mark);
                    return true;
                }
            } catch (e) {
                // Try highlighting whole node as fallback
                try {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    const mark = createHighlightMark();
                    range.surroundContents(mark);
                    scrollToAndRemove(mark);
                    return true;
                } catch (e2) {
                    continue;
                }
            }
        }
    }
    return false;
}

/**
 * Method 7: Windowed Aggregated Search
 * Aggregates text from consecutive DOM nodes using sliding window
 * Handles cross-element selections like text spanning <li>, <code>, etc.
 */
function highlightByWindowedSearch(originalText) {
    const searchText = normalizeText(originalText.substring(0, 20));
    if (searchText.length < 10) return false;

    const WINDOW_SIZE = 15;  // Number of consecutive nodes to aggregate

    // Collect all text nodes
    const allNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while (node = walker.nextNode()) {
        // Skip very short nodes (likely whitespace)
        if (node.textContent.trim().length > 0) {
            allNodes.push(node);
        }
    }

    if (allNodes.length === 0) return false;

    // Sliding window search
    for (let i = 0; i < allNodes.length; i++) {
        // Aggregate text from nodes[i] to nodes[i + WINDOW_SIZE]
        let windowText = '';
        const windowEnd = Math.min(i + WINDOW_SIZE, allNodes.length);

        for (let j = i; j < windowEnd; j++) {
            windowText += allNodes[j].textContent + ' ';
        }

        const normalizedWindow = normalizeText(windowText);

        if (normalizedWindow.includes(searchText)) {
            // Match found! Highlight the first node in the window
            try {
                const targetNode = allNodes[i];
                const range = document.createRange();
                range.selectNodeContents(targetNode);

                const mark = createHighlightMark();
                range.surroundContents(mark);
                scrollToAndRemove(mark);
                console.log('[ClipTrace] Highlighted via windowed search (window start: ' + i + ')');
                return true;
            } catch (e) {
                // Try next window position
                continue;
            }
        }
    }

    return false;
}

// Normalize text for comparison (remove extra whitespace, normalize characters)
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[\s\u3000]+/g, ' ')  // Normalize whitespace (including full-width)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width chars
        .trim();
}

// Find actual index after normalization
function findActualIndex(original, normalizedSearch, normalizedIndex) {
    let count = 0;
    let i = 0;
    while (i < original.length && count < normalizedIndex) {
        const char = original[i];
        const normalized = normalizeText(char);
        if (normalized.length > 0) count++;
        i++;
    }
    return i < original.length ? i : -1;
}

// Calculate similarity score between two strings
function calculateSimilarity(str1, str2) {
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length >= str2.length ? str1 : str2;

    if (longer.includes(shorter)) return 1.0;

    // Check for substring match with sliding window
    const windowSize = Math.min(shorter.length, 30);
    let maxMatch = 0;

    for (let i = 0; i <= longer.length - windowSize; i++) {
        const window = longer.substring(i, i + windowSize);
        let matches = 0;
        for (let j = 0; j < windowSize && j < shorter.length; j++) {
            if (window[j] === shorter[j]) matches++;
        }
        maxMatch = Math.max(maxMatch, matches / windowSize);
    }

    return maxMatch;
}

// Find text node at offset
function findTextNode(element, offset) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let currentOffset = 0;
    let node;

    while (node = walker.nextNode()) {
        if (currentOffset + node.length >= offset) {
            return node;
        }
        currentOffset += node.length;
    }

    return element.firstChild?.nodeType === Node.TEXT_NODE ? element.firstChild : null;
}

// Create highlight mark
function createHighlightMark() {
    const mark = document.createElement('mark');
    mark.className = 'smart-clipboard-highlight';
    mark.style.cssText = `
        background-color: #89b4d8;
        padding: 2px 4px;
        border-radius: 4px;
        box-shadow: 0 0 0 3px rgba(137, 180, 216, 0.3);
        transition: background-color 0.5s, box-shadow 0.5s;
    `;
    return mark;
}

// Scroll to highlight and remove after delay
function scrollToAndRemove(mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        mark.style.backgroundColor = 'transparent';
        mark.style.boxShadow = 'none';
        setTimeout(() => {
            const parent = mark.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(mark.textContent), mark);
                parent.normalize();
            }
        }, 500);
    }, 3000);
}

// Get element by XPath
function getElementByXPath(xpath) {
    try {
        return document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
    } catch (e) {
        return null;
    }
}

console.log('[ClipTrace] Content script loaded');

