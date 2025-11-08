# ChatHTML Viewer - Context Documentation

> **Note:** File references use approximate location cues (e.g., "near the top," "middle of file") rather than exact line numbers to remain resilient to code changes.

## 📋 High-Level Overview

**ChatHTML Viewer** is a single-page web application that transforms ChatGPT conversation HTML into a navigable, annotatable experience. Users can paste ChatGPT conversation HTML, view it in a scrollable panel, customize outline summaries, add comments, and preview messages. All customizations persist across sessions using localStorage with chat-specific hashing.

**Purpose:**  
- Import ChatGPT conversations for better navigation and organization
- Add personal notes/comments to specific turns and overall chat context
- Customize outline summaries for easier reference
- Search/navigate long conversations efficiently
- Collapse/expand chat bubbles for better focus and space management
- Auto-highlight outline items based on scroll position

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

1. **Input Stage:** User pastes ChatGPT conversation HTML (or URL parameters auto-load)
2. **Parse Stage:** DOMParser extracts message turns from HTML
3. **Hash Stage:** SHA-256 generates unique chat ID from message content
4. **Storage Stage:** Check localStorage for existing customizations
5. **Render Stage:** Display chat panel + outline panel with saved preferences
6. **Interaction Stage:** User can zoom, resize, edit summaries, add comments, preview
7. **Share Stage:** User can generate shareable link that saves all data to server
8. **Open Stage:** URL parameters (`?shared=` or `?open=`) auto-load chats from server or localStorage

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
ChatWorkspace_{chatId}_indents   // { [turnIndex]: indentLevel }
ChatWorkspace_{chatId}_notes     // { notes: string, lastUpdated: ISO timestamp }
ChatWorkspace_{chatId}_html      // Original chat HTML (for URL ?open= parameter)
```

---

## 📁 File Structure & Purpose

```
/Users/wengffung/dev/web/xny/chat/
├── index.php                  (~100 lines) - Main UI structure (HTML input, notes textarea, panels)
├── share.php                  (~104 lines) - Backend API for sharing conversations
├── README.md                  (~196 lines) - User-facing documentation
├── context.md                 (~810 lines) - Developer documentation (this file)
├── shared/                    - Directory for shared conversation JSON files
│   └── {chatId}.json         - Shared conversation data
└── assets/
    ├── a-load-chat.js         (2 lines) - Console snippet to extract ChatGPT HTML
    ├── b-store-turns.js       (32 lines) - Standalone turn collector (not used in main flow)
    ├── c-hash-chat.js         (~90 lines) - SHA-256 hashing utilities
    ├── d-render-chat.js       (~1577 lines) - Core application logic
    └── styles.css             (~1331 lines) - All styling (gradients, panels, modals)
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

**Location:** Loaded in `index.php` before `d-render-chat.js`  
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

**Location:** Core ~1577-line file loaded in `index.php`  
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
- Adds collapse toggle button (⋮⋮) for each chat bubble
- Sets z-index incrementally for proper layering of sticky buttons
- Attempts to extract ChatGPT's native formatted HTML via `extractFormattedContent()`
- Falls back to `formatContentWithCode()` for plain text/markdown parsing
- Sets up scroll tracking via `setupScrollTracking()` to highlight outline items

**`toggleChatTurnCollapse(turnIndex)`**
- Toggles collapse state of a specific chat turn
- Hides/shows turn content while keeping label visible
- Updates button title between "Collapse" and "Expand"
- Persists state via CSS class (not localStorage)

**`setupScrollTracking()`**
- Creates IntersectionObserver to track visible chat turns
- Uses multiple thresholds (0 to 1.0 in 0.1 increments) for accurate detection
- Focuses on center of viewport with rootMargin configuration
- Calls `updateOutlineHighlight()` when visibility changes

**`updateOutlineHighlight(turnIndex)`**
- Removes `scroll-highlighted` class from all outline items
- Adds highlight to outline item corresponding to most visible chat turn
- Respects preview highlighting (doesn't override `previewing` class)
- Provides visual feedback of current reading position

**`extractFormattedContent(rawHtml)`**
- Primary rendering method for ChatGPT HTML exports
- Looks for `.markdown` container (assistant messages with rich formatting)
- Looks for `.whitespace-pre-wrap` divs (user messages)
- Preserves ChatGPT's native HTML structure (p, ul, ol, li, strong, em, h1-h6, etc.)
- Processes all text nodes to handle literal `\n` characters robustly:
  - Uses TreeWalker to traverse all text nodes in the cloned content
  - For text nodes inside `<code>` elements: Replaces `\\n` with actual newline characters
  - For text nodes outside code blocks: Removes `\\n` completely
  - Ensures code blocks render with proper line breaks while cleaning up other content
- Returns null if no ChatGPT structure found (triggers fallback)

**`formatContentWithCode(text, rawHtml)` - Fallback**
- Used when ChatGPT structure not detected
- Escapes HTML to prevent injection
- Parses markdown syntax (bold, italic, headers, lists, blockquotes, etc.)
- Detects triple-backtick code blocks: ` ```language\ncode\n``` `
- Wraps in `.code-block-wrapper` with copy button
- Handles inline code with single backticks
- Creates proper paragraph and list structures

**`escapeAndFormat(text)`**
- Helper for escaping HTML entities
- Converts newlines to `<br>` tags

**`copyCode(blockId)`**
- Uses Clipboard API
- Shows visual feedback (✅ Copied!)
- Timeout resets button after 2s

#### **Section C: Outline Rendering (middle)**

**`renderOutline(turns)`**
- Creates `.outline-item` divs
- Loads saved summaries, comments, and indents from `localStorage`
- Applies indentation styling (2 character width per level)
- Renders two types of comments:
  - **Heading Comment:** Above label, highlighted callout box
  - **Turn Comment:** Below summary, italic, gray
- Adds hover icons (→ indent, ← unindent, 🗨️/💬 for comment, 👁 for preview)
- Attaches click handlers for navigation

**Editable Summaries:**
- `contentEditable="true"` on `.outline-summary`
- Saves on blur or Enter key
- Stores in `ChatWorkspace_{chatId}_outline` localStorage key

#### **Section D: Indentation System (middle)**

**`loadIndentsData()` / `saveIndent(turnIndex, level)`**
- Persists to `ChatWorkspace_{chatId}_indents`
- Stores indent level (0 = no indent, 1+ = indent levels)
- Level 0 entries are deleted from storage
- Triggers `renderOutline()` to update UI

**Indent Controls:**
- **→ button** - Increases indent level by 1
- **← button** - Decreases indent level by 1 (minimum 0)
- Visual indent: 2 character width per level

#### **Section E: Comments System (middle-late)**

**`loadCommentsData()` / `saveComment(turnIndex, headingComment, turnComment)`**
- Persists to `ChatWorkspace_{chatId}_comments`
- Stores two types of comments: heading and turn
- Empty comments are deleted from storage
- Triggers `renderOutline()` to update UI

**`showCommentEditor(turn, index)`**
- Creates modal overlay
- Shows two separate textareas:
  - **Heading Comment:** Displayed above role label
  - **Turn Comment:** Displayed below summary text with HTML toolbar
- Toolbar buttons for inserting HTML snippets:
  - **▼ Collapsible:** Inserts `<details>/<summary>` structure
  - **⫿ Two Columns:** Inserts `.columns-2` grid layout
  - **≡ Three Columns:** Inserts `.columns-3` grid layout
- Comments support HTML rendering (innerHTML) for rich formatting
- `insertAtCursor()` helper inserts HTML snippets at cursor position
- Save/Delete All buttons
- Closes on Escape or backdrop click
- Handles legacy string format for backward compatibility

#### **Section F: Preview Panel (late-middle)**

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

#### **Section G: Navigation & Interactions (late)**

**`scrollToTurn(index)`**
- Uses `scrollIntoView()` with smooth behavior
- Adds temporary highlight effect (box-shadow)

**Zoom Controls:**
- `zoomIn()` / `zoomOut()` - Adjusts font size 60-200%
- `updateFontSize()` - Applies change and saves to settings

**Resize Handle:**
- Drag to resize chat panel height
- Saves preference to `ChatWorkspace_{chatId}`

#### **Section H: Persistence (late)**

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
- Clears `ChatWorkspace_{chatId}_indents`
- Re-renders outline with defaults
- Re-renders chat to reset any collapsed states

#### **Section I: Notes System (late)**

**`loadChatNotes(chatId)` / `saveChatNotes()`**
- Persists to `ChatWorkspace_{chatId}_notes`
- Stores `{ notes: string, lastUpdated: ISO timestamp }`
- Auto-saves with 500ms debounce after user stops typing
- Loaded automatically when chat is loaded (line ~96 in `loadChat()`)
- Independent of outline/comments system

**UI Location:**
- Below HTML input textarea in main interface
- Labeled "📝 Notes (Optional)"
- Placeholder suggests use cases (URL, goals, context)
- Visible before and after loading chat

#### **Section J: Share & Open System (lines 888-1359)**

**`handleShareClick()` / `showShareModal()`**
- Triggered by Share button (🔗) in UI
- Creates modal overlay with generation button
- Collects all localStorage data for current chat
- Sends POST request to `share.php?id={chatId}`
- Displays shareable link on success with auto-copy
- Shows retry option on error

**`handleUrlParameters()` - Page Load Handler**
- Runs on DOMContentLoaded or immediately if already loaded
- Handles two URL parameter patterns:

**Pattern 1: `?shared={chatId}` (Priority)**
- Fetches `shared/{chatId}.json` from server
- Saves all data to localStorage (chatHtml, outline, comments, indents, notes)
- Populates HTML textarea if chatHtml exists
- Changes URL to `?open={chatId}` (via pushState)
- Auto-loads chat after 100ms delay
- Purpose: First-time access to shared link from another user

**Pattern 2: `?open={chatId}` (Fallback)**
- Checks localStorage for `ChatWorkspace_{chatId}_html`
- If found: Populates textarea and auto-loads chat
- If not found: Redirects to `?shared={chatId}` to fetch from server
- Purpose: Re-opening chats after refresh or localStorage exists

**URL Management:**
- `loadChat()` updates URL to `?open={chatId}` when loading (line 85)
- Uses `window.history.pushState()` to avoid page reload
- URL persists on refresh, allowing bookmarking of specific chats
- Falls back to server fetch if localStorage is cleared

---

### 5. Share Backend (`share.php`)

**Location:** PHP backend API (~104 lines)  
**Purpose:** Handle conversation sharing requests and persist data to server

**Main Flow (throughout file):**

1. **Request Validation (lines 7-27):**
   - Checks HTTP method is POST
   - Validates `id` query parameter exists
   - Validates ID format: `/^[a-zA-Z0-9]{32,128}$/`
   - Returns 400/405 errors for invalid requests

2. **Data Reception (lines 29-46):**
   - Reads raw POST body via `file_get_contents('php://input')`
   - Parses JSON with error handling
   - Extracts optional fields: `chatHtml`, `turns`, `outline`, `comments`, `indents`, `notes`

3. **Data Preparation (lines 47-72):**
   - Creates structured array with conversationId, timestamp, and data object
   - Only includes non-empty fields (reduces file size)
   - Adds ISO 8601 timestamp via `date('c')`

4. **File Storage (lines 74-92):**
   - Creates `shared/` directory if missing (mode 0755)
   - Writes to `shared/{conversationId}.json`
   - Uses `JSON_PRETTY_PRINT` for readability
   - Returns 500 error if write fails

5. **Success Response (lines 94-101):**
   - Returns JSON with `success: true`
   - Includes `shareUrl`: `/shared/{conversationId}.json`
   - Includes timestamp for client verification

**Security Features:**
- Regex validation prevents directory traversal (`../` attacks)
- CORS headers allow cross-origin requests (if needed)
- No database required (simple file-based storage)
- No authentication (public share links)

**Example Request:**
```bash
POST /share.php?id=abc123def456...
Content-Type: application/json

{
  "chatHtml": "<div>...</div>",
  "outline": {"0": "Custom summary"},
  "comments": {"1": {"heading": "Note", "turn": "Comment"}},
  "indents": {"2": 1},
  "notes": {"notes": "Context", "lastUpdated": "2025-11-08T12:00:00Z"}
}
```

**Example Response:**
```json
{
  "success": true,
  "conversationId": "abc123def456...",
  "shareUrl": "/shared/abc123def456....json",
  "timestamp": "2025-11-08T12:00:00+00:00"
}
```

---

### 6. Styling (`styles.css`)

**Location:** ~1331 lines of comprehensive CSS  
**Key Sections:**

1. **Global Styles (top)** - Reset, body, header gradient
2. **Input Section (early)** - Textarea, load button
3. **Panel System (early-middle)** - `.panel`, `.panel-header`, `.panel-content`
4. **Chat Turns (middle)** - Color-coded user/assistant, code blocks, markdown formatting
5. **Collapsible Chat Bubbles (middle)** - Toggle button (sticky position), collapsed state, rotation animations
6. **Markdown Styles (middle)** - Headers (h1-h6), lists (ul/ol/li), blockquotes, paragraphs, bold/italic
7. **ChatGPT Data Attributes (middle)** - Spacing for `[data-start]`, `[data-is-last-node]` attributes
8. **Outline Items (middle)** - Hover effects, editable summaries, icons, scroll-highlighting
9. **Comment System (middle-late)** - Display styles, editor modal, HTML element support (columns, collapsible)
10. **Comment Toolbar (middle-late)** - Toolbar buttons for inserting HTML snippets
11. **Preview Panel (late)** - Fixed bottom, slide-up animation
12. **Controls (late)** - Zoom buttons, resize handle, reset button
13. **Responsive (end)** - Mobile breakpoints, stacked columns

**Design System:**
- Primary gradient: `#667eea → #764ba2`
- User messages: `#e3f2fd` (light blue)
- Assistant messages: `#f3e5f5` (light purple)
- Code blocks: Dark theme (`#1e1e1e` background)
- Markdown: Proper spacing, list indentation, header hierarchy

**ChatGPT Fidelity:**
- Preserves native HTML structure from ChatGPT exports (`.markdown` container)
- Supports `data-start`, `data-end`, `data-is-last-node` attributes for accurate spacing
- Renders paragraphs, lists, headers, bold, italic, blockquotes with ChatGPT-like styling
- Native code block support with syntax highlighting:
  - Styles `code.whitespace-pre` elements with dark theme
  - Preserves ChatGPT's `hljs-*` syntax highlighting classes (section, bullet, strong, string, link, emphasis)
  - Uses `white-space: pre` to maintain exact formatting and line breaks

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

### Feature: Outline Indentation

**File:** `d-render-chat.js` (indentation functions, middle)  
**How:**
- Indent/unindent buttons (→/←) control nesting level
- Each level adds 2 character width of left margin
- Stored per-turn in localStorage
- Visual hierarchy for organizing conversation flow

**Storage:** `ChatWorkspace_{chatId}_indents` with turn index as key, value is indent level (0+)

### Feature: Comments (Two Types with HTML Support)

**Files:** `d-render-chat.js` (comment functions, middle-late), `styles.css` (comment display and toolbar styles)
**How:**
- Modal editor with two separate input fields
- **Heading Comment:** Always displayed above role label, highlighted
- **Turn Comment:** Always displayed below summary text with HTML toolbar
- Toolbar provides quick insertion of HTML elements:
  - **Collapsible sections:** `<details>/<summary>` for expandable content
  - **Two-column layout:** `.columns-2` CSS grid
  - **Three-column layout:** `.columns-3` CSS grid
- Comments render as HTML (innerHTML) instead of plain text
- `insertAtCursor()` function inserts HTML snippets at cursor position
- Both types can be used simultaneously or independently
- Legacy support for old string-based comments (treated as turn comments)
- Responsive: columns stack on mobile devices

### Feature: Collapsible Chat Bubbles

**Files:** `d-render-chat.js` (toggleChatTurnCollapse, renderChat), `styles.css` (collapse-toggle styles)
**How:**
- Toggle button (⋮⋮) appears on each chat bubble
- Button uses sticky positioning and floats left of content
- Rotates 90° when bubble is expanded, 0° when collapsed
- Clicking toggles the `.collapsed` class on the turn element
- Collapsed state hides content but keeps label visible
- Does not persist to localStorage (resets on page reload or chat reload)
- Reset button now also resets collapsed states
- Z-index increments per turn for proper button layering

**Storage:** CSS class-based (ephemeral, not persisted)

### Feature: Scroll-Based Outline Highlighting

**Files:** `d-render-chat.js` (setupScrollTracking, updateOutlineHighlight), `styles.css` (scroll-highlighted)
**How:**
- IntersectionObserver tracks which chat turns are visible
- Uses multiple thresholds (0-1.0 in 0.1 increments) for accurate detection
- Centers focus on viewport with rootMargin: '-10% 0px -10% 0px'
- Tracks intersection ratio to find most visible turn
- Highlights corresponding outline item with `.scroll-highlighted` class
- Different styling from preview highlighting (doesn't override `.previewing`)
- Provides real-time visual feedback of reading position
- Observer is recreated when chat is re-rendered

**Storage:** None (real-time UI state)

### Feature: Message Preview

**File:** `d-render-chat.js` (preview functions, late-middle)  
**How:**
- Fixed bottom panel with slide-up animation
- Disables scroll-to-turn while open
- Highlights current outline item

### Feature: ChatGPT-Fidelity Content Rendering

**Files:** `d-render-chat.js` (extractFormattedContent, renderChat), `styles.css` (markdown styles, code block styles)
**How:**
- **Primary Method:** Extracts and preserves ChatGPT's native HTML structure from exports
  - Detects `.markdown` container with full formatting (p, ul, ol, li, strong, em, h1-h6, etc.)
  - Processes code blocks to handle literal `\n` characters:
    - Uses TreeWalker to traverse all text nodes within `<code>` elements
    - Converts escaped newlines (`\\n`) to actual newline characters
    - Ensures proper line breaks in code snippets
  - Maintains all data attributes (`data-start`, `data-end`, etc.) for proper spacing
  - Preserves ChatGPT's syntax highlighting classes (`hljs-section`, `hljs-bullet`, `hljs-strong`, etc.)
- **Fallback Method:** Markdown parser for plain text
  - Parses markdown syntax (bold, italic, headers, lists, blockquotes)
  - Detects triple-backtick code blocks: ` ```lang\ncode\n``` `
  - Creates proper HTML structure from markdown
- **Code Blocks:** 
  - Native ChatGPT code blocks: Dark theme with syntax highlighting preserved
  - Fallback code blocks: Header with language tag + copy button, dark theme styling
  - Both use `white-space: pre` or `pre-wrap` to maintain exact formatting
- **Result:** Chat bubbles render with full fidelity matching ChatGPT's interface, including properly formatted code snippets

### Feature: Zoom & Resize

**File:** `d-render-chat.js` (zoom/resize sections, late)  
**How:**
- Font size: 60-200% via CSS `font-size` property
- Panel height: Drag handle adjusts flexbox `flex: 0 0 {height}px`
- Both persist to `ChatWorkspace_{chatId}`

### Feature: Chat Notes

**Files:** `index.php` (lines 26-33), `d-render-chat.js` (notes functions, middle-late)  
**How:**
- Optional textarea below chat HTML input for adding context/metadata
- Persists per chat using `ChatWorkspace_{chatId}_notes` key
- Auto-saves with 500ms debounce after typing stops
- Stored as JSON: `{ notes: string, lastUpdated: ISO timestamp }`
- Loaded automatically when chat is loaded
- Use cases: Original chat URL, goals, project context, tags, etc.

**Storage:** `ChatWorkspace_{chatId}_notes` with notes text and timestamp

### Feature: Share & Open (URL Parameters)

**Files:** `share.php`, `d-render-chat.js` (lines 888-1359), `index.php` (line 22)  
**How:**

**Share Functionality:**
1. **Trigger:** Share button (🔗) in UI, enabled after loading a chat
2. **Modal Display:** `showShareModal()` creates overlay with generation button
3. **Data Collection:** Gathers all localStorage data for current chat:
   - `chatHtml` - Original conversation HTML
   - `turns` - Parsed turn data (for verification)
   - `outline` - Custom summaries (if any)
   - `comments` - Heading & turn comments (if any)
   - `indents` - Outline indentation levels (if any)
   - `notes` - Chat notes (if any)
4. **Server Request:** POST to `share.php?id={currentChatId}` with JSON payload
5. **Server Processing:**
   - Validates conversation ID (alphanumeric, 32-128 chars)
   - Creates `shared/` directory if needed
   - Saves to `shared/{chatId}.json` with timestamp
   - Returns success with share URL
6. **UI Response:** 
   - Shows success message with shareable link
   - Auto-copies link to clipboard
   - Displays formatted URL: `?shared={chatId}`

**Open Functionality (URL Parameters):**

Two URL parameter patterns are supported:

1. **`?shared={chatId}` (Priority 1):**
   - Fetches `shared/{chatId}.json` from server
   - Saves all data to localStorage (outline, comments, indents, notes)
   - Populates HTML textarea if chatHtml exists
   - Changes URL to `?open={chatId}` (via pushState)
   - Auto-loads chat after 100ms delay
   - **Purpose:** First-time access to shared link

2. **`?open={chatId}` (Priority 2):**
   - Checks localStorage for `ChatWorkspace_{chatId}_html`
   - If found: Populates textarea and auto-loads chat
   - If not found: Redirects to `?shared={chatId}` to fetch from server
   - **Purpose:** Re-opening previously loaded chats (e.g., browser refresh)

**Workflow Example:**
```
User A shares → POST to share.php → saved to shared/{id}.json
User B visits ?shared={id} → fetches JSON → saves to localStorage → changes to ?open={id} → loads chat
User B refreshes → ?open={id} → loads from localStorage (no server fetch)
User B clears localStorage → ?open={id} → redirects to ?shared={id} → fetches from server again
```

**Implementation Details:**
- `handleUrlParameters()` runs on page load (DOMContentLoaded or immediate)
- Share button disabled by default, enabled in `loadChat()` (line 100)
- URL changes use `window.history.pushState()` to avoid page reload
- Automatic loading uses 100ms `setTimeout()` to ensure DOM is ready
- Server file validation prevents directory traversal attacks

**Storage:**
- Server-side: `shared/{chatId}.json` files
- Client-side: All standard `ChatWorkspace_{chatId}_*` keys
- Additional: `ChatWorkspace_{chatId}_html` for original HTML persistence

---

## 🔄 State Management

**Global Variables (top of d-render-chat.js):**
```javascript
let currentChatId = null;        // Active chat hash
let turns = [];                  // Parsed message array
let scrollObserver = null;       // IntersectionObserver for scroll tracking
let currentPreviewIndex = null;  // Currently previewed turn
let currentFontSize = 100;       // Zoom level percentage
let isResizing = false;          // Resize drag state
```

**LocalStorage Schema:**
```
ChatWorkspace_{chatId}           → { fontSize: number, chatPanelHeight: number }
ChatWorkspace_{chatId}_outline   → { [index: number]: string }
ChatWorkspace_{chatId}_comments  → { [index: number]: { heading: string, turn: string } }
ChatWorkspace_{chatId}_indents   → { [index: number]: number }  // indent level, 0 = no indent
ChatWorkspace_{chatId}_notes     → { notes: string, lastUpdated: string }  // ISO timestamp
ChatWorkspace_{chatId}_html      → string  // Original chat HTML for ?open= URL parameter
```

---

## 🧪 Testing & Development

### Local Testing
```bash
# PHP server required for share functionality
php -S localhost:8000

# Then visit http://localhost:8000
# Share feature requires write access to ./shared/ directory
```

### Getting Test Data

1. Open any ChatGPT conversation
2. Open browser console (F12)
3. Run: `document.querySelector('[data-turn-id]').parentElement.innerHTML`
4. Copy output
5. Paste into app textarea

### Testing Share/Open Functionality

**Test Share:**
1. Load a chat and add customizations (outline edits, comments, notes)
2. Click "🔗 Share" button
3. Verify modal appears with "Generate Share Link" button
4. Click generate and verify success message
5. Check that `shared/{chatId}.json` file was created
6. Verify link is copied to clipboard

**Test ?shared= URL:**
1. Copy the shared link from step 6 above
2. Open in new incognito window (to ensure fresh localStorage)
3. Verify chat loads automatically with all customizations
4. Verify URL changes from `?shared={id}` to `?open={id}`
5. Check localStorage has all keys populated

**Test ?open= URL:**
1. In same browser session, refresh the page
2. Verify chat loads from localStorage (no server fetch)
3. Clear localStorage and refresh
4. Verify it falls back to `?shared={id}` and fetches from server

### Common Development Tasks

**Add new localStorage key:**
- Use pattern: `ChatWorkspace_{currentChatId}_keyName` for separate data stores
- Or add property to main `ChatWorkspace_{currentChatId}` settings object
- Load in appropriate load function (e.g., `loadChatSettings()`)
- Save when data changes

**Add new panel:**
- Create `.panel` div in `index.php`
- Add panel-specific styles in `styles.css`
- Implement render function in `d-render-chat.js`

**Modify turn structure:**
- Update `collectTurns()` parsing logic
- Adjust `renderChat()` display logic
- Consider impact on `hashChat()` (may change chat IDs)

---

## 📊 Performance Considerations

**File Sizes:**
- `d-render-chat.js`: ~1577 lines (~55KB) - Core application logic with chat rendering, outline, comments, preview, share features
- `styles.css`: ~1331 lines (~35KB) - All styles inline, no external dependencies

**LocalStorage Limits:**
- ~5-10MB per domain (browser-dependent)
- Each chat stores: settings (~100 bytes), outline (~2KB), comments (~5KB), notes (~1-5KB)
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
- **Export/Import:** JSON download/upload for backup (local alternative to share)
- **Search:** Full-text search across turns
- **Syntax Highlighting:** Integrate Prism.js or Highlight.js
- **Markdown Rendering:** Full GFM support beyond code blocks
- **Diff View:** Compare conversation versions
- **Share Enhancements:** 
  - Password protection for shared links
  - Expiration dates for shared files
  - Share analytics (view count)
  - Private shares (authentication required)
  - Edit permissions (allow others to modify customizations)

---

## 📚 Dependencies

**Runtime:**
- None (vanilla JS + Web APIs) for core functionality
- PHP 7.0+ for share feature (backend API)

**Browser APIs Used:**
- `DOMParser` - Parse HTML strings
- `crypto.subtle` - SHA-256 hashing
- `localStorage` - Persistent storage
- `Clipboard API` - Copy code blocks and share links
- `Fetch API` - Share/open server communication
- `History API` - URL parameter management (pushState)
- `IntersectionObserver` - Scroll tracking to highlight outline items based on visible chat turns
- `TreeWalker` - Traverse text nodes for newline character processing

**Server Requirements (for share feature):**
- PHP 7.0+ with write permissions to `shared/` directory
- No database required (file-based storage)
- No external PHP dependencies

**Browser Support:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- No IE11 support (uses modern JS syntax)

---

## 🎯 Quick Reference

**Where to find...**

- Chat parsing logic → `d-render-chat.js` (`collectTurns`, near top)
- Chat rendering logic → `d-render-chat.js` (`renderChat`, `extractFormattedContent`, early)
- Collapsible chat bubbles → `d-render-chat.js` (`toggleChatTurnCollapse`, middle)
- Scroll tracking → `d-render-chat.js` (`setupScrollTracking`, `updateOutlineHighlight`, early-middle)
- Hashing implementation → `c-hash-chat.js` (`hashChat`, throughout)
- Comment system → `d-render-chat.js` (comment functions, `showCommentEditor`, `insertAtCursor`, middle-late)
- Preview panel → `d-render-chat.js` (`showMessagePreview`, late-middle)
- Notes system → `d-render-chat.js` (`loadChatNotes`, `saveChatNotes`, late) + `index.php` (lines 26-33)
- Share/Open system → `d-render-chat.js` (`handleShareClick`, `showShareModal`, `handleUrlParameters`, lines 888-1359) + `share.php`
- URL parameter handling → `d-render-chat.js` (`handleUrlParameters`, lines 1237-1359)
- Styling rules → `styles.css` (organized by feature)
- localStorage keys → `d-render-chat.js` (persistence functions, late)
- ChatGPT HTML extraction → `d-render-chat.js` (`extractFormattedContent`, early)
- Markdown parsing (fallback) → `d-render-chat.js` (`formatContentWithCode`, early-middle)

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
**File Version:** 1.4  
**Project Status:** Active Development  
**Recent Updates:** 
- **Collapsible Chat Bubbles:** Added toggle button (⋮⋮) to collapse/expand individual chat turns for better focus and space management
- **Scroll-Based Outline Highlighting:** IntersectionObserver tracks visible chat turns and highlights corresponding outline items in real-time
- **HTML Support in Comments:** Turn comments now support HTML rendering with toolbar for inserting collapsible sections, two-column and three-column layouts
- **Improved Newline Handling:** Enhanced `\n` processing to handle all text nodes - converts to newlines in code blocks and removes from other content
- **Better Collapse UX:** Changed toggle button from absolute to sticky positioning with float for better interaction
- ChatGPT-fidelity rendering - extracts and preserves native HTML structure from ChatGPT exports for accurate formatting (headers, lists, bold/italic, blockquotes, code blocks, etc.)
- Enhanced code block rendering with proper line break handling - converts literal `\n` text to actual newlines using TreeWalker
- Added syntax highlighting support for ChatGPT's native code blocks with `hljs-*` classes

