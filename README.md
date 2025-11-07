# 🧠 ChatHTML Viewer

![Last Commit](https://img.shields.io/github/last-commit/Siphon880gh/chatgpt-viewer/main)
<a target="_blank" href="https://github.com/Siphon880gh" rel="nofollow"><img src="https://img.shields.io/badge/GitHub--blue?style=social&logo=GitHub" alt="Github" data-canonical-src="https://img.shields.io/badge/GitHub--blue?style=social&logo=GitHub" style="max-width:8.5ch;"></a>
<a target="_blank" href="https://www.linkedin.com/in/weng-fung/" rel="nofollow"><img src="https://img.shields.io/badge/LinkedIn-blue?style=flat&logo=linkedin&labelColor=blue" alt="Linked-In" data-canonical-src="https://img.shields.io/badge/LinkedIn-blue?style=flat&amp;logo=linkedin&amp;labelColor=blue" style="max-width:10ch;"></a>
<a target="_blank" href="https://www.youtube.com/@WayneTeachesCode/" rel="nofollow"><img src="https://img.shields.io/badge/Youtube-red?style=flat&logo=youtube&labelColor=red" alt="Youtube" data-canonical-src="https://img.shields.io/badge/Youtube-red?style=flat&amp;logo=youtube&amp;labelColor=red" style="max-width:10ch;"></a>

By Weng Fei Fung (Weng). A small app that lets you **turn your ChatGPT chat thread into a navigational experience**. You can easily outline your conversation, add comments to specific turns, and rename outline headings, making it simple to organize and jump between different parts of the same chat.

---

## 🚀 Overview

This app takes in the raw **ChatGPT conversation HTML**, parses it into structured memory, generates a **unique hash ID** for each chat, and saves it locally — so your **conversation settings persist** between sessions.

You can then view your chat in a **scrolling rendered panel** and navigate it using a **clickable outline panel**.

---

## 🧩 How It Works

### 1. Extract ChatGPT HTML

Run the following in your browser console on a ChatGPT conversation page:

```js
// a-load-chat.js
const chatHtml = document.querySelector("[data-turn-id]").parentElement.innerHTML;
```

Copy the output (`chatHtml`) and paste it into the app’s input field.

---

### 2. Store Turns in Memory

The app parses the pasted HTML and extracts each message using the data attribute
`data-message-author-role="user"` or `"assistant"`.

Example (in `b-store-turns.js` or inline code):

```js
// b-store-turns.js

(function collectTurns(root = document) {
  // Initialize the array
  var turns = [];

  // Select all message elements that have the data attribute
  var nodes = root.querySelectorAll('[data-message-author-role]');

  nodes.forEach(function (el, idx) {
    var role = (el.getAttribute('data-message-author-role') || '').trim(); // 'user' | 'assistant'
    var msgId = (el.getAttribute('data-message-id') || ('idx-' + idx)).trim();

    // Choose text or HTML:
    //   - textContent for plain text (default)
    //   - innerHTML if you want to preserve formatting
    var content = (el.textContent || '').replace(/\s+/g, ' ').trim();

    turns.push({
      msgId: msgId,
      type: role,
      content: content
    });
  });

  // Make available to other scripts
  window.turns = turns;

  // Debug
  console.log('turns:', turns);
  return turns;
})();
```

The resulting `turns` array is the internal “memory” of your chat.

---

### 3. Generate a Unique Chat ID

Every chat is hashed into a **stable SHA-256 ID** so your settings can be saved per conversation.

```js
// Hash conversation deterministically
async function hashChat(arr) {
  const text = JSON.stringify(arr);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

This hash is used as the key for localStorage, e.g.:

```js
localStorage.setItem(`settings_${chatId}`, JSON.stringify(userSettings));
```

---

### 4. Render Chat & Outline Panels

Once the HTML is loaded:

* The **top panel** displays the rendered chat (scrollable) with zoom controls.
* The **bottom panel** shows an **outline** of each turn — one line per message.

  * Each line displays the first 50 characters of that turn (`user` or `assistant`).
  * Clicking a line scrolls to that message in the rendered chat panel.

#### Outline Features

**Customizable Summaries**
- Click any outline summary to edit it inline
- Custom text is saved per chat and persists between sessions
- Press Enter or click away to save changes

**Comments**
- Add comments to any turn using the comment icon (🗨️/💬)
- Comments are saved in localStorage per chat
- Toggle between two view modes:
  - **De-emphasized** (default): Comments appear below the summary in subtle italic text
  - **Emphasized**: Comments appear above the role label in a highlighted callout box
- Click the 💬 button at the bottom to toggle between view modes

**Preview Panel**
- Click the eye icon (👁) to preview the full message in a docked bottom panel
- The preview panel shows the complete message text
- Selected outline item is highlighted while preview is open
- Clicking outline items while preview is open doesn't scroll the chat

**Reset**
- Click the reset icon (↺) to restore all outline summaries to defaults
- Reset also removes all comments for the current chat
- This only affects the current conversation

---

## 🗂️ File Structure

```
📁 chat/
├── assets/
│   ├── a-load-chat.js       // Extract chat HTML from ChatGPT
│   ├── b-store-turns.js     // Parse and store conversation turns
│   ├── c-hash-chat.js       // Generate unique hash IDs for chats
│   ├── d-render-chat.js     // Main rendering logic, outline, comments, preview
│   └── styles.css           // All application styling
├── index.html               // UI layout with panels
└── README.md                // (this file)
```

---

## 💾 LocalStorage Persistence

Each chat's customizations are saved in `localStorage` using the chat's unique hash as a key:

- **`settings_{chatId}`**: General settings (font size, panel height)
- **`outline_{chatId}`**: Custom outline summary text for each turn
- **`comments_{chatId}`**: Comments added to turns
- **`commentViewEmphasized`**: Global preference for comment view mode

All data persists between sessions and is specific to each conversation.

---

## ✨ Features

- ✅ **Chat Persistence**: Each conversation gets a unique hash ID for persistent storage
- ✅ **Customizable Outline**: Edit summary text for any turn
- ✅ **Comments**: Add notes to specific turns with toggle view modes
- ✅ **Preview Panel**: Quick view of full messages without scrolling
- ✅ **Zoom Controls**: Adjust chat text size
- ✅ **Resizable Panels**: Drag to resize chat/outline panels
- ✅ **Code Block Support**: Syntax highlighting with copy buttons
- ✅ **Color-coded Turns**: Visual distinction between user and assistant messages

## 🧠 Future Ideas

- Import multiple chats & switch between them
- Export/backup to JSON
- Search within chat or outline
- Filter turns by user/assistant
- Keyboard shortcuts for navigation

---
