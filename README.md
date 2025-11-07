# 🧠 ChatHTML Viewer

A small JavaScript app that lets you **import, store, and navigate ChatGPT conversations** directly from exported HTML snippets.

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

* The **top panel** displays the rendered chat (scrollable).
* The **bottom panel** shows an **outline** of each turn — one line per message.

  * Each line displays the first 30 characters of that turn (`user` or `assistant`).
  * Clicking a line scrolls to that message in the rendered chat panel.

Example logic:

```js
// Create outline
turns.forEach((turn, i) => {
  const summary = turn.content.slice(0, 30).replace(/\n/g, ' ');
  const item = document.createElement('div');
  item.textContent = `${turn.type}: ${summary}`;
  item.addEventListener('click', () => scrollToTurn(i));
  outlinePanel.appendChild(item);
});
```

---

## 🗂️ File Structure

```
📁 chat-viewer/
├── a-load-chat.js        // Extract chat HTML from ChatGPT
├── b-store-turns.js      // Parse and store conversation turns
├── c-hash-chat.js        // Generate unique hash IDs
├── d-render-chat.js      // Render scrolling chat panel
├── e-outline-panel.js    // Build clickable outline view
├── index.html            // UI layout
└── README.md             // (this file)
```

---

## 🧠 Future Ideas

* Import multiple chats & switch between them
* Export/backup to JSON
* Color-coded turns for user/assistant
* Search within chat or outline

---

Would you like me to extend this README with example HTML/CSS layout and how the two panels are styled (scrollable viewer + outline sidebar)?
