let currentChatId = null;
let turns = [];

/**
 * Parse pasted HTML and extract conversation turns
 */
function collectTurns(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const nodes = doc.querySelectorAll('[data-message-author-role]');
  
  const collectedTurns = [];
  
  nodes.forEach(function (el, idx) {
    const role = (el.getAttribute('data-message-author-role') || '').trim();
    const msgId = (el.getAttribute('data-message-id') || ('idx-' + idx)).trim();
    
    // Clone the element to manipulate it
    const clone = el.cloneNode(true);
    
    // Convert <br> tags to newlines
    clone.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });
    
    // Convert block elements to newlines (p, div, etc.)
    clone.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li').forEach(block => {
      if (block.nextSibling) {
        block.after('\n');
      }
    });
    
    // Get text content and normalize whitespace while preserving line breaks
    let content = (clone.textContent || '');
    // Convert literal \n strings to actual newlines
    content = content.replace(/\\n/g, '\n');
    // Replace multiple spaces/tabs with single space, but keep newlines
    content = content.replace(/[^\S\n]+/g, ' ').trim();
    // Remove excessive blank lines (more than 2 consecutive newlines)
    content = content.replace(/\n{3,}/g, '\n\n');

    if (role && content) {
      collectedTurns.push({
        msgId: msgId,
        type: role,
        content: content,
        rawHtml: el.innerHTML // Store raw HTML for code block detection
      });
    }
  });

  return collectedTurns;
}

/**
 * Main function to load and display chat
 */
async function loadChat() {
  let input = document.getElementById('htmlInput').value.trim();
  
  // If input is enclosed in single quotes or double quotes, remove them
  input = input.replace(/^['"]|['"]$/g, '');

  if (!input) {
    alert('Please paste some HTML first!');
    return;
  }

  try {
    // Parse the HTML
    turns = collectTurns(input);

    if (turns.length === 0) {
      alert('No messages found in the HTML. Make sure you copied the correct HTML from ChatGPT.');
      return;
    }

    console.log('Parsed turns:', turns);

    // Generate unique hash for this chat
    currentChatId = await hashChat(turns);
    console.log('Chat ID:', currentChatId);

    // Load any saved settings for this chat
    loadChatSettings(currentChatId);

    // Render the chat
    renderChat(turns);
    renderOutline(turns);

  } catch (error) {
    console.error('Error loading chat:', error);
    alert('Failed to parse the HTML. Please check the console for details.');
  }
}

/**
 * Render the chat messages
 */
function renderChat(turns) {
  const chatContent = document.getElementById('chatContent');
  chatContent.innerHTML = '';

  turns.forEach((turn, index) => {
    const turnDiv = document.createElement('div');
    turnDiv.className = `chat-turn ${turn.type}`;
    turnDiv.id = `turn-${index}`;

    const label = document.createElement('div');
    label.className = 'turn-label';
    label.textContent = turn.type === 'user' ? '👤 User' : '🤖 Assistant';

    const content = document.createElement('div');
    content.className = 'turn-content';
    
    // Render content with code blocks
    content.innerHTML = formatContentWithCode(turn.content, turn.rawHtml);

    turnDiv.appendChild(label);
    turnDiv.appendChild(content);
    chatContent.appendChild(turnDiv);
  });
}

/**
 * Format content with proper code block styling
 */
function formatContentWithCode(text, rawHtml) {
  // Escape HTML to prevent injection
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // Detect markdown-style code blocks (```language\ncode\n```)
  let formatted = escapeHtml(text);
  
  // Counter for unique IDs
  let codeBlockCounter = 0;
  
  // Handle triple-backtick code blocks
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    const blockId = `code-block-${Date.now()}-${codeBlockCounter++}`;
    const escapedCode = code.trim();
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-language">${language}</span>
        <button class="copy-code-btn" onclick="copyCode('${blockId}')" title="Copy code">📋 Copy</button>
      </div>
      <pre class="code-block"><code id="${blockId}" class="language-${language}">${escapedCode}</code></pre>
    </div>`;
  });
  
  // Handle inline code with single backticks
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Convert newlines to <br> for proper display
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

/**
 * Copy code block to clipboard
 */
function copyCode(blockId) {
  const codeElement = document.getElementById(blockId);
  if (!codeElement) return;
  
  const text = codeElement.textContent;
  navigator.clipboard.writeText(text).then(() => {
    // Find the button and show feedback
    const wrapper = codeElement.closest('.code-block-wrapper');
    const btn = wrapper.querySelector('.copy-code-btn');
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    btn.style.background = '#10b981';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

/**
 * Render the outline panel with clickable navigation
 */
function renderOutline(turns) {
  const outlineContent = document.getElementById('outlineContent');
  outlineContent.innerHTML = '';

  turns.forEach((turn, index) => {
    const item = document.createElement('div');
    item.className = `outline-item ${turn.type}`;

    const label = document.createElement('div');
    label.className = 'outline-label';
    label.textContent = turn.type === 'user' ? 'User' : 'Assistant';

    const summary = document.createElement('div');
    summary.className = 'outline-summary';
    const summaryText = turn.content.slice(0, 50).replace(/\n/g, ' ');
    summary.textContent = summaryText + (turn.content.length > 50 ? '...' : '');

    item.appendChild(label);
    item.appendChild(summary);

    item.addEventListener('click', () => scrollToTurn(index));
    
    outlineContent.appendChild(item);
  });
}

/**
 * Scroll to a specific turn in the chat panel
 */
function scrollToTurn(index) {
  const turnElement = document.getElementById(`turn-${index}`);
  if (turnElement) {
    turnElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Add a brief highlight effect
    turnElement.style.transition = 'box-shadow 0.3s';
    turnElement.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.3)';
    setTimeout(() => {
      turnElement.style.boxShadow = '';
    }, 1000);
  }
}

/**
 * Load saved settings for this chat from localStorage
 */
function loadChatSettings(chatId) {
  const settingsKey = `settings_${chatId}`;
  const saved = localStorage.getItem(settingsKey);
  
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      console.log('Loaded settings:', settings);
      // Here you could restore scroll position, filters, etc.
    } catch (e) {
      console.warn('Failed to parse saved settings:', e);
    }
  }
}

/**
 * Save settings for the current chat
 */
function saveChatSettings(settings) {
  if (!currentChatId) return;
  
  const settingsKey = `settings_${currentChatId}`;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  console.log('Saved settings for chat:', currentChatId);
}

// Allow Enter key in textarea (no auto-submit)
document.getElementById('htmlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    loadChat();
  }
});

/**
 * Zoom functionality for chat content
 */
let currentFontSize = 100; // percentage

function zoomIn() {
  if (currentFontSize < 200) {
    currentFontSize += 10;
    updateFontSize();
  }
}

function zoomOut() {
  if (currentFontSize > 60) {
    currentFontSize -= 10;
    updateFontSize();
  }
}

function updateFontSize() {
  const chatContent = document.getElementById('chatContent');
  chatContent.style.fontSize = currentFontSize + '%';
  
  // Save preference
  if (currentChatId) {
    saveChatSettings({ fontSize: currentFontSize });
  }
}

// Load font size when chat settings are loaded
const originalLoadChatSettings = loadChatSettings;
loadChatSettings = function(chatId) {
  originalLoadChatSettings(chatId);
  
  const settingsKey = `settings_${chatId}`;
  const saved = localStorage.getItem(settingsKey);
  
  if (saved) {
    try {
      const settings = JSON.parse(saved);
      if (settings.fontSize) {
        currentFontSize = settings.fontSize;
        updateFontSize();
      }
      if (settings.chatPanelHeight) {
        const chatPanel = document.getElementById('chatPanel');
        chatPanel.style.flex = `0 0 ${settings.chatPanelHeight}px`;
      }
    } catch (e) {
      // Already handled in original function
    }
  }
};

/**
 * Resize functionality for chat panel
 */
const resizeHandle = document.getElementById('resizeHandle');
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const container = document.querySelector('.main-container');
  const chatPanel = document.getElementById('chatPanel');
  const containerRect = container.getBoundingClientRect();
  const relativeY = e.clientY - containerRect.top;
  
  // Set minimum and maximum heights
  const minHeight = 100;
  const maxHeight = containerRect.height - 100;
  const newHeight = Math.max(minHeight, Math.min(maxHeight, relativeY));
  
  chatPanel.style.flex = `0 0 ${newHeight}px`;
  
  // Save preference
  if (currentChatId) {
    saveChatSettings({ fontSize: currentFontSize, chatPanelHeight: newHeight });
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

