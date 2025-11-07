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
    const content = (el.textContent || '').replace(/\s+/g, ' ').trim();

    if (role && content) {
      collectedTurns.push({
        msgId: msgId,
        type: role,
        content: content
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
    content.textContent = turn.content;

    turnDiv.appendChild(label);
    turnDiv.appendChild(content);
    chatContent.appendChild(turnDiv);
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

