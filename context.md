# ChatHTML Viewer - Context Documentation

> **Note:** File references use approximate location cues (e.g., "near the top," "middle of file") rather than exact line numbers to remain resilient to code changes.

## 📋 High-Level Overview

**ChatHTML Viewer** is a single-page web application that transforms ChatGPT conversation HTML into a navigable, annotatable experience. Users can paste ChatGPT conversation HTML, view it in a scrollable panel, customize outline summaries, add comments, and preview messages. All customizations persist across sessions using localStorage with chat-specific hashing.

**Purpose:**  
- Import ChatGPT conversations for better navigation and organization
- Add personal notes/comments to specific turns
- Customize outline summaries for easier reference
- Search/navigate long conversations efficiently

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Storage:** localStorage (browser-native, no backend)
- **Hashing:** Web Crypto API (SHA-256)
- **Parsing:** DOMParser API
- **Build:** None (static HTML/JS/CSS)

---

## 🏗️ Architecture

### Application Flow

1. **Input Stage:** User pastes ChatGPT conversation HTML
2. **Parse Stage:** DOMParser extracts message turns from HTML
3. **Hash Stage:** SHA-256 generates unique chat ID from message content
4. **Storage Stage:** Check localStorage for existing customizations
5. **Render Stage:** Display chat panel + outline panel with saved preferences
6. **Interaction Stage:** User can zoom, resize, edit summaries, add comments, preview

### Data Model

```javascript
// Turn Structure
{
  msgId: string,      // data-message-id or generated 'idx-N'
  type: string,       // 'user' | 'assistant'
  content: string,    // normalized text content
  rawHtml: string     // original HTML for code block detection
}

// LocalStorage Keys (per chat)
ChatWorkspace_{chatId}           // { fontSize, chatPanelHeight }
ChatWorkspace_{chatId}_outline   // { [turnIndex]: customSummaryText }
ChatWorkspace_{chatId}_comments  // { [turnIndex]: { heading: string, turn: string } }
```

---

## 📁 File Structure & Purpose

```
/Users/wengffung/dev/web/xny/chat/
├── index.html                  (~90 lines) - Main UI structure
├── README.md                   (~191 lines) - User-facing documentation
├── context.md                  (this file) - Developer documentation
└── assets/
    ├── a-load-chat.js          (2 lines) - Console snippet to extract ChatGPT HTML
    ├── b-store-turns.js        (32 lines) - Standalone turn collector (not used in main flow)
    ├── c-hash-chat.js          (~90 lines) - SHA-256 hashing utilities
    ├── d-render-chat.js        (812 lines) - Core application logic
    └── styles.css              (812 lines) - All styling (gradients, panels, modals)
```

---

## 🔍 Code Flow Deep Dive

### 1. HTML Extraction (`a-load-chat.js`)

**Location:** Simple 1-liner script  
**Purpose:** Run in ChatGPT's browser console to extract conversation HTML

```javascript
document.querySelector("[data-turn-id]").parentElement.innerHTML
```

**How it works:**
- Finds first element with `data-turn-id` attribute
- Gets parent element (contains all turns)
- Returns `innerHTML` for user to copy

---

### 2. Turn Collection (`b-store-turns.js`)

**Location:** Standalone module (not loaded in main app)  
**Purpose:** Legacy/reference implementation for parsing turns

**Key Logic (near top):**
```javascript
(function collectTurns(root = document) {
  var turns = [];
  var nodes = root.querySelectorAll('[data-message-author-role]');
  // ... processes each node into {msgId, type, content}
})();
```

**Note:** Current app uses inline `collectTurns()` in `d-render-chat.js` instead.

---

### 3. Chat Hashing (`c-hash-chat.js`)

**Location:** Loaded in `index.html` before `d-render-chat.js`  
**Purpose:** Generate deterministic unique IDs for conversations

**Main Functions (throughout file):**

1. **`normalizeMessage(m)`** - Trims whitespace, ensures consistent format
2. **`coerceToArray(input)`** - Handles arrays, objects, keyed dictionaries
3. **`canonicalizeChat(input)`** - Creates JSON string: `{v:1, count:N, messages:[...]}`
4. **`sha256Hex(str)`** - Web Crypto API → hexadecimal digest
5. **`hashChat(input, salt='')`** - Public API: hash any supported input shape

**Why hashing?**
- Same conversation always generates same ID
- Enables per-chat persistence in localStorage
- Prevents collisions between different conversations

**Example Usage (in d-render-chat.js, middle section):**
```javascript
currentChatId = await hashChat(turns);
localStorage.setItem(`ChatWorkspace_${currentChatId}`, JSON.stringify(userSettings));
```

---

### 4. Main Application Logic (`d-render-chat.js`)

**Location:** Core 812-line file loaded in `index.html`  
**Purpose:** All UI rendering, interactions, persistence

#### **Section A: Parsing & Loading (near top)**

**`collectTurns(htmlString)`**
- Uses `DOMParser` to parse pasted HTML
- Finds all `[data-message-author-role]` elements
- Converts `<br>` tags to newlines
- Preserves formatting while normalizing whitespace
- Returns array of turn objects

**`loadChat()`** - Main entry point
- Reads textarea input
- Calls `collectTurns()`
- Generates `currentChatId` via `hashChat()`
- Loads saved settings
- Renders chat and outline panels

#### **Section B: Chat Rendering (early-middle)**

**`renderChat(turns)`**
- Creates `.chat-turn` divs for each message
- Adds role labels (👤 User / 🤖 Assistant)
- Calls `formatContentWithCode()` for syntax highlighting

**`formatContentWithCode(text, rawHtml)`**
- Escapes HTML to prevent injection
- Detects triple-backtick code blocks: ` ```language\ncode\n``` `
- Wraps in `.code-block-wrapper` with copy button
- Handles inline code with single backticks
- Converts `\n` to `<br>` for display

**`copyCode(blockId)`**
- Uses Clipboard API
- Shows visual feedback (✅ Copied!)
- Timeout resets button after 2s

#### **Section C: Outline Rendering (middle)**

**`renderOutline(turns)`**
- Creates `.outline-item` divs
- Loads saved summaries from `localStorage`
- Loads comments data
- Renders two types of comments:
  - **Heading Comment:** Above label, highlighted callout box
  - **Turn Comment:** Below summary, italic, gray
- Adds hover icons (🗨️/💬 for comment, 👁 for preview)
- Attaches click handlers for navigation

**Editable Summaries:**
- `contentEditable="true"` on `.outline-summary`
- Saves on blur or Enter key
- Stores in `ChatWorkspace_{chatId}_outline` localStorage key

#### **Section D: Comments System (middle-late)**

**`loadCommentsData()` / `saveComment(turnIndex, headingComment, turnComment)`**
- Persists to `ChatWorkspace_{chatId}_comments`
- Stores two types of comments: heading and turn
- Empty comments are deleted from storage
- Triggers `renderOutline()` to update UI

**`showCommentEditor(turn, index)`**
- Creates modal overlay
- Shows two separate textareas:
  - **Heading Comment:** Displayed above role label
  - **Turn Comment:** Displayed below summary text
- Save/Delete All buttons
- Closes on Escape or backdrop click
- Handles legacy string format for backward compatibility

#### **Section E: Preview Panel (late-middle)**

**`showMessagePreview(turn, index)`**
- Creates fixed bottom panel (`.preview-panel`)
- Shows full message content
- Highlights corresponding outline item
- Prevents scroll-to-turn while open
- Adds margin to outline to prevent overlap

**`closePreviewPanel()`**
- Removes panel and highlight
- Restores outline margin
- Closes on Escape or X button

#### **Section F: Navigation & Interactions (late)**

**`scrollToTurn(index)`**
- Uses `scrollIntoView()` with smooth behavior
- Adds temporary highlight effect (box-shadow)

**Zoom Controls:**
- `zoomIn()` / `zoomOut()` - Adjusts font size 60-200%
- `updateFontSize()` - Applies change and saves to settings

**Resize Handle:**
- Drag to resize chat panel height
- Saves preference to `ChatWorkspace_{chatId}`

#### **Section G: Persistence (late)**

**`loadChatSettings(chatId)` / `saveChatSettings(settings)`**
- Stores `{ fontSize, chatPanelHeight }` in `ChatWorkspace_{chatId}`
- Loads on chat open
- Saves on zoom/resize actions

**`loadOutlineData()` / `saveOutlineItem(turnIndex, text)`**
- Per-turn custom summaries
- Keyed by turn index

**`resetAllOutlineItems()`**
- Clears `ChatWorkspace_{chatId}_outline`
- Clears `ChatWorkspace_{chatId}_comments`
- Re-renders with defaults

---

### 5. Styling (`styles.css`)

**Location:** 812 lines of comprehensive CSS  
**Key Sections:**

1. **Global Styles (top)** - Reset, body, header gradient
2. **Input Section (early)** - Textarea, load button
3. **Panel System (early-middle)** - `.panel`, `.panel-header`, `.panel-content`
4. **Chat Turns (middle)** - Color-coded user/assistant, code blocks
5. **Outline Items (middle)** - Hover effects, editable summaries, icons
6. **Comment System (middle-late)** - Display styles, editor modal
7. **Preview Panel (late)** - Fixed bottom, slide-up animation
8. **Controls (late)** - Zoom buttons, resize handle, reset button
9. **Responsive (end)** - Mobile breakpoints

**Design System:**
- Primary gradient: `#667eea → #764ba2`
- User messages: `#e3f2fd` (light blue)
- Assistant messages: `#f3e5f5` (light purple)
- Code blocks: Dark theme (`#1e1e1e` background)

---

## 🔑 Key Features Implementation

### Feature: Persistent Chat ID

**Files:** `c-hash-chat.js`, `d-render-chat.js`  
**How:** SHA-256 hash of canonical JSON representation  
**Why:** Same conversation always gets same ID → consistent localStorage keys

### Feature: Editable Outline Summaries

**File:** `d-render-chat.js` (renderOutline function, middle)  
**How:** `contentEditable` + blur/Enter event listeners  
**Storage:** `ChatWorkspace_{chatId}_outline` with turn index as key

### Feature: Comments (Two Types)

**File:** `d-render-chat.js` (comment functions, middle-late)  
**How:**
- Modal editor with two separate input fields
- **Heading Comment:** Always displayed above role label, highlighted
- **Turn Comment:** Always displayed below summary text, italic
- Both types can be used simultaneously or independently
- Legacy support for old string-based comments (treated as turn comments)

### Feature: Message Preview

**File:** `d-render-chat.js` (preview functions, late-middle)  
**How:**
- Fixed bottom panel with slide-up animation
- Disables scroll-to-turn while open
- Highlights current outline item

### Feature: Code Block Formatting

**File:** `d-render-chat.js` (formatContentWithCode, early-middle)  
**How:**
- Regex detects ` ```lang\ncode\n``` `
- Creates header with language tag + copy button
- Dark theme styling in CSS

### Feature: Zoom & Resize

**File:** `d-render-chat.js` (zoom/resize sections, late)  
**How:**
- Font size: 60-200% via CSS `font-size` property
- Panel height: Drag handle adjusts flexbox `flex: 0 0 {height}px`
- Both persist to `ChatWorkspace_{chatId}`

---

## 🔄 State Management

**Global Variables (top of d-render-chat.js):**
```javascript
let currentChatId = null;        // Active chat hash
let turns = [];                  // Parsed message array
let currentPreviewIndex = null;  // Currently previewed turn
let currentFontSize = 100;       // Zoom level percentage
let isResizing = false;          // Resize drag state
```

**LocalStorage Schema:**
```
ChatWorkspace_{chatId}           → { fontSize: number, chatPanelHeight: number }
ChatWorkspace_{chatId}_outline   → { [index: number]: string }
ChatWorkspace_{chatId}_comments  → { [index: number]: { heading: string, turn: string } }
```

---

## 🧪 Testing & Development

### Local Testing
```bash
# No build step required - open directly in browser
open index.html

# Or use a simple HTTP server
python3 -m http.server 8000
# Then visit http://localhost:8000
```

### Getting Test Data

1. Open any ChatGPT conversation
2. Open browser console (F12)
3. Run: `document.querySelector('[data-turn-id]').parentElement.innerHTML`
4. Copy output
5. Paste into app textarea

### Common Development Tasks

**Add new localStorage key:**
- Use pattern: `ChatWorkspace_{currentChatId}_keyName` for separate data stores
- Or add property to main `ChatWorkspace_{currentChatId}` settings object
- Load in appropriate load function (e.g., `loadChatSettings()`)
- Save when data changes

**Add new panel:**
- Create `.panel` div in `index.html`
- Add panel-specific styles in `styles.css`
- Implement render function in `d-render-chat.js`

**Modify turn structure:**
- Update `collectTurns()` parsing logic
- Adjust `renderChat()` display logic
- Consider impact on `hashChat()` (may change chat IDs)

---

## 📊 Performance Considerations

**File Sizes:**
- `d-render-chat.js`: 812 lines (~30KB) - Consider code splitting for future features
- `styles.css`: 812 lines (~20KB) - All styles inline, no external dependencies

**LocalStorage Limits:**
- ~5-10MB per domain (browser-dependent)
- Each chat stores: settings (~100 bytes), outline (~2KB), comments (~5KB)
- All keys prefixed with `ChatWorkspace_{chatId}` for easy identification
- Estimated capacity: ~500-1000 chats before hitting limits

**Optimization Opportunities:**
- Lazy load chat content (virtualization for very long conversations)
- Debounce outline save on rapid edits
- Compress localStorage data with LZ-string

---

## 🐛 Known Edge Cases

1. **Duplicate Message IDs:** Falls back to `idx-{index}` if `data-message-id` missing
2. **Empty Content:** Filtered out during `collectTurns()` (line ~42)
3. **Nested Code Blocks:** Regex assumes no nested triple-backticks
4. **Large Conversations:** No pagination (may cause performance issues >500 turns)
5. **Quote Removal:** Input wrapped in quotes (`'` or `"`) is stripped (line ~62)

---

## 🔮 Future Enhancement Ideas

See `README.md` for user-facing roadmap. Developer considerations:

- **Multi-chat Management:** Add chat list sidebar, switch between loaded chats
- **Export/Import:** JSON download/upload for backup
- **Search:** Full-text search across turns
- **Syntax Highlighting:** Integrate Prism.js or Highlight.js
- **Markdown Rendering:** Full GFM support beyond code blocks
- **Diff View:** Compare conversation versions
- **Collaborative Features:** Share chats with others (requires backend)

---

## 📚 Dependencies

**Runtime:**
- None (vanilla JS + Web APIs)

**Browser APIs Used:**
- `DOMParser` - Parse HTML strings
- `crypto.subtle` - SHA-256 hashing
- `localStorage` - Persistent storage
- `Clipboard API` - Copy code blocks
- `IntersectionObserver` - (not currently used, but could optimize rendering)

**Browser Support:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- No IE11 support (uses modern JS syntax)

---

## 🎯 Quick Reference

**Where to find...**

- Chat parsing logic → `d-render-chat.js` (`collectTurns`, near top)
- Hashing implementation → `c-hash-chat.js` (`hashChat`, throughout)
- Comment system → `d-render-chat.js` (comment functions, middle-late)
- Preview panel → `d-render-chat.js` (`showMessagePreview`, late-middle)
- Styling rules → `styles.css` (organized by feature)
- localStorage keys → `d-render-chat.js` (persistence functions, late)
- Code block formatting → `d-render-chat.js` (`formatContentWithCode`, early-middle)

**Common code patterns:**

```javascript
// Load from localStorage
const key = `ChatWorkspace_${currentChatId}_dataType`;
const data = JSON.parse(localStorage.getItem(key) || '{}');

// Save to localStorage
localStorage.setItem(key, JSON.stringify(data));

// Create UI element
const el = document.createElement('div');
el.className = 'my-class';
el.textContent = 'content';
parent.appendChild(el);

// Event delegation
item.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent parent click
  // handle click
});
```

---

**Last Updated:** 2025-11-08  
**File Version:** 1.0  
**Project Status:** Active Development

