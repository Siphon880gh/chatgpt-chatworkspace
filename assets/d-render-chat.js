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

  // Show or hide reset button based on whether there are turns
  const resetControls = document.querySelector('.outline-reset-controls');
  if (resetControls) {
    if (turns.length > 0) {
      resetControls.classList.add('visible');
    } else {
      resetControls.classList.remove('visible');
    }
  }

  // Load saved outline data and comments
  const outlineData = loadOutlineData();
  const commentsData = loadCommentsData();

  turns.forEach((turn, index) => {
    const item = document.createElement('div');
    item.className = `outline-item ${turn.type}`;

    const label = document.createElement('div');
    label.className = 'outline-label';
    label.textContent = turn.type === 'user' ? 'User' : 'Assistant';

    const summary = document.createElement('div');
    summary.className = 'outline-summary';
    summary.contentEditable = 'true';
    summary.setAttribute('data-turn-index', index);
    
    // Use saved custom text or default summary
    const defaultText = turn.content.slice(0, 50).replace(/\n/g, ' ') + (turn.content.length > 50 ? '...' : '');
    summary.textContent = outlineData[index] || defaultText;
    summary.setAttribute('data-default-text', defaultText);

    // Save on blur (when user clicks away)
    summary.addEventListener('blur', function() {
      saveOutlineItem(index, this.textContent.trim());
    });

    // Save on Enter key
    summary.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur(); // Trigger save
      }
    });

    // Prevent click from bubbling when editing
    summary.addEventListener('click', function(e) {
      e.stopPropagation();
    });

    // Icons container
    const iconsContainer = document.createElement('div');
    iconsContainer.className = 'outline-icons';

    // Comment icon
    const commentIcon = document.createElement('button');
    commentIcon.className = 'comment-icon';
    const hasComment = commentsData[index] !== undefined && commentsData[index] !== null;
    commentIcon.innerHTML = hasComment ? '💬' : '🗨️';
    commentIcon.title = hasComment ? 'Edit comment' : 'Add comment';
    if (hasComment) {
      commentIcon.classList.add('has-comment');
    }
    commentIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      showCommentEditor(turn, index);
    });

    // Preview icon
    const previewIcon = document.createElement('button');
    previewIcon.className = 'preview-icon';
    previewIcon.innerHTML = '👁';
    previewIcon.title = 'Preview message';
    previewIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      showMessagePreview(turn, index);
    });

    iconsContainer.appendChild(commentIcon);
    iconsContainer.appendChild(previewIcon);

    // Get comment view preference
    const commentViewEmphasized = getCommentViewPreference();
    
    // Display comment if exists and view is emphasized (above label)
    if (hasComment && commentViewEmphasized) {
      const commentDisplay = document.createElement('div');
      commentDisplay.className = 'comment-display comment-emphasized';
      commentDisplay.textContent = commentsData[index];
      
      // Prevent click from bubbling to parent
      commentDisplay.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      
      item.appendChild(commentDisplay);
    }
    
    item.appendChild(label);
    item.appendChild(summary);
    item.appendChild(iconsContainer);

    // Display comment if exists and view is de-emphasized (below)
    if (hasComment && !commentViewEmphasized) {
      const commentDisplay = document.createElement('div');
      commentDisplay.className = 'comment-display';
      commentDisplay.textContent = commentsData[index];
      
      // Prevent click from bubbling to parent
      commentDisplay.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      
      item.appendChild(commentDisplay);
    }

    // Click on the item (but not the summary) scrolls to turn only if preview panel is not open
    item.addEventListener('click', () => {
      const previewPanel = document.querySelector('.preview-panel');
      if (!previewPanel) {
        scrollToTurn(index);
      }
    });
    
    outlineContent.appendChild(item);
  });
}

let currentPreviewIndex = null;

/**
 * Get comment view preference (true = emphasized/above, false = de-emphasized/below)
 */
function getCommentViewPreference() {
  const saved = localStorage.getItem('commentViewEmphasized');
  return saved === 'true'; // Default to false (de-emphasized)
}

/**
 * Set comment view preference
 */
function setCommentViewPreference(emphasized) {
  localStorage.setItem('commentViewEmphasized', emphasized ? 'true' : 'false');
}

/**
 * Toggle comment view
 */
function toggleCommentView() {
  const current = getCommentViewPreference();
  setCommentViewPreference(!current);
  
  // Re-render outline to apply new view
  if (turns.length > 0) {
    renderOutline(turns);
  }
}

/**
 * Load comments data for the current chat
 */
function loadCommentsData() {
  if (!currentChatId) return {};
  
  const commentsKey = `comments_${currentChatId}`;
  const saved = localStorage.getItem(commentsKey);
  
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved comments data:', e);
      return {};
    }
  }
  
  return {};
}

/**
 * Save comment for a specific turn
 */
function saveComment(turnIndex, comment) {
  if (!currentChatId) return;
  
  const commentsKey = `comments_${currentChatId}`;
  const commentsData = loadCommentsData();
  
  if (comment !== null && comment !== undefined && comment !== '') {
    // Save comment as-is, preserving blank lines and whitespace
    commentsData[turnIndex] = comment;
  } else {
    // Remove comment if truly empty
    delete commentsData[turnIndex];
  }
  
  localStorage.setItem(commentsKey, JSON.stringify(commentsData));
  console.log(`Saved comment for turn ${turnIndex}`);
  
  // Re-render outline to update comment icon
  renderOutline(turns);
}

/**
 * Show comment editor for a turn
 */
function showCommentEditor(turn, index) {
  // Remove any existing editor
  const existingEditor = document.querySelector('.comment-editor');
  if (existingEditor) {
    existingEditor.remove();
  }

  const commentsData = loadCommentsData();
  const currentComment = commentsData[index] || '';

  // Create backdrop
  const editor = document.createElement('div');
  editor.className = 'comment-editor';
  
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'comment-editor-modal';
  
  const editorHeader = document.createElement('div');
  editorHeader.className = 'comment-editor-header';
  
  const editorTitle = document.createElement('div');
  editorTitle.className = 'comment-editor-title';
  editorTitle.textContent = `Comment - ${turn.type === 'user' ? '👤 User' : '🤖 Assistant'} Turn ${index + 1}`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'comment-editor-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => editor.remove());
  
  editorHeader.appendChild(editorTitle);
  editorHeader.appendChild(closeBtn);
  
  const editorBody = document.createElement('div');
  editorBody.className = 'comment-editor-body';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'comment-textarea';
  textarea.placeholder = 'Add your comment here...';
  textarea.value = currentComment;
  
  editorBody.appendChild(textarea);
  
  const editorFooter = document.createElement('div');
  editorFooter.className = 'comment-editor-footer';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'comment-save-btn';
  saveBtn.textContent = '💾 Save';
  saveBtn.addEventListener('click', () => {
    saveComment(index, textarea.value);
    editor.remove();
  });
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'comment-delete-btn';
  deleteBtn.textContent = '🗑️ Delete';
  deleteBtn.addEventListener('click', () => {
    saveComment(index, '');
    editor.remove();
  });
  
  editorFooter.appendChild(deleteBtn);
  editorFooter.appendChild(saveBtn);
  
  modal.appendChild(editorHeader);
  modal.appendChild(editorBody);
  modal.appendChild(editorFooter);
  
  editor.appendChild(modal);
  document.body.appendChild(editor);
  
  // Focus textarea
  textarea.focus();
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      editor.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
  
  // Close on backdrop click
  editor.addEventListener('click', (e) => {
    if (e.target === editor) {
      editor.remove();
    }
  });
}

/**
 * Show message preview in a docked bottom panel
 */
function showMessagePreview(turn, index) {
  // Remove existing highlight
  document.querySelectorAll('.outline-item.previewing').forEach(item => {
    item.classList.remove('previewing');
  });

  // If clicking the same item, close the preview
  const existingPanel = document.querySelector('.preview-panel');
  if (currentPreviewIndex === index && existingPanel) {
    closePreviewPanel();
    return;
  }

  currentPreviewIndex = index;

  // Highlight the current outline item
  const outlineItems = document.querySelectorAll('.outline-item');
  if (outlineItems[index]) {
    outlineItems[index].classList.add('previewing');
  }

  // Remove any existing panel
  if (existingPanel) {
    existingPanel.remove();
  }

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'preview-panel';
  
  const panelHeader = document.createElement('div');
  panelHeader.className = 'preview-panel-header';
  
  const panelTitle = document.createElement('div');
  panelTitle.className = 'preview-panel-title';
  panelTitle.textContent = `${turn.type === 'user' ? '👤 User' : '🤖 Assistant'} - Turn ${index + 1}`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-panel-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', closePreviewPanel);
  
  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeBtn);
  
  const panelContent = document.createElement('div');
  panelContent.className = 'preview-panel-content';
  panelContent.textContent = turn.content;
  
  panel.appendChild(panelHeader);
  panel.appendChild(panelContent);
  
  document.body.appendChild(panel);
  
  // Add margin to outline panel to prevent content being covered
  setTimeout(() => {
    const panelHeight = panel.offsetHeight;
    const outlineContent = document.getElementById('outlineContent');
    if (outlineContent) {
      outlineContent.style.marginBottom = `${panelHeight}px`;
    }
  }, 50); // Small delay to ensure panel is rendered
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closePreviewPanel();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

/**
 * Close the preview panel
 */
function closePreviewPanel() {
  const panel = document.querySelector('.preview-panel');
  if (panel) {
    panel.remove();
  }
  
  // Remove highlight
  document.querySelectorAll('.outline-item.previewing').forEach(item => {
    item.classList.remove('previewing');
  });
  
  // Remove margin from outline content
  const outlineContent = document.getElementById('outlineContent');
  if (outlineContent) {
    outlineContent.style.marginBottom = '0';
  }
  
  currentPreviewIndex = null;
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
  } else {
    // First time loading this chat - save it
    saveChatSettings({});
    console.log('New chat saved to localStorage:', chatId);
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

/**
 * Load outline data for the current chat
 */
function loadOutlineData() {
  if (!currentChatId) return {};
  
  const outlineKey = `outline_${currentChatId}`;
  const saved = localStorage.getItem(outlineKey);
  
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved outline data:', e);
      return {};
    }
  }
  
  return {};
}

/**
 * Save outline data for a specific turn
 */
function saveOutlineItem(turnIndex, text) {
  if (!currentChatId) return;
  
  const outlineKey = `outline_${currentChatId}`;
  const outlineData = loadOutlineData();
  
  // Save the custom text for this turn
  outlineData[turnIndex] = text;
  
  localStorage.setItem(outlineKey, JSON.stringify(outlineData));
  console.log(`Saved outline for turn ${turnIndex}:`, text);
}

/**
 * Reset ALL outline items to default text and remove all comments
 */
function resetAllOutlineItems() {
  if (!currentChatId || turns.length === 0) return;
  
  // Clear all outline customizations from localStorage
  const outlineKey = `outline_${currentChatId}`;
  localStorage.removeItem(outlineKey);
  console.log('Reset all outline items to defaults');
  
  // Clear all comments from localStorage
  const commentsKey = `comments_${currentChatId}`;
  localStorage.removeItem(commentsKey);
  console.log('Removed all comments');
  
  // Re-render the outline with defaults (using existing turns data)
  renderOutline(turns);
}

/**
 * Handle reset button click
 */
function handleResetClick() {
  resetAllOutlineItems();
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

