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
    
    // Enable share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.disabled = false;
    
    // Load and save notes
    loadChatNotes(currentChatId);
    saveChatNotes();

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

  // Show or hide reset controls based on whether there are turns
  const resetControls = document.querySelector('.outline-reset-controls');
  if (resetControls) {
    if (turns.length > 0) {
      resetControls.classList.add('visible');
    } else {
      resetControls.classList.remove('visible');
    }
  }

  // Load saved outline data, comments, and indents
  const outlineData = loadOutlineData();
  const commentsData = loadCommentsData();
  const indentsData = loadIndentsData();

  turns.forEach((turn, index) => {
    const item = document.createElement('div');
    item.className = `outline-item ${turn.type}`;
    
    // Apply indentation
    const indentLevel = indentsData[index] || 0;
    if (indentLevel > 0) {
      item.style.marginLeft = `${indentLevel * 2}ch`;
    }

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

    // Indent button
    const indentBtn = document.createElement('button');
    indentBtn.className = 'indent-btn';
    indentBtn.innerHTML = '→';
    indentBtn.title = 'Indent';
    indentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentLevel = indentsData[index] || 0;
      saveIndent(index, currentLevel + 1);
    });

    // Unindent button
    const unindentBtn = document.createElement('button');
    unindentBtn.className = 'unindent-btn';
    unindentBtn.innerHTML = '←';
    unindentBtn.title = 'Unindent';
    unindentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentLevel = indentsData[index] || 0;
      if (currentLevel > 0) {
        saveIndent(index, currentLevel - 1);
      }
    });

    // Comment icon
    const commentIcon = document.createElement('button');
    commentIcon.className = 'comment-icon';
    const commentData = commentsData[index];
    let hasComment = false;
    
    // Check if there's any comment (handle both legacy string and new object format)
    if (commentData !== undefined && commentData !== null) {
      if (typeof commentData === 'string') {
        hasComment = commentData.trim() !== '';
      } else {
        hasComment = (commentData.heading && commentData.heading.trim() !== '') || 
                     (commentData.turn && commentData.turn.trim() !== '');
      }
    }
    
    commentIcon.innerHTML = hasComment ? '💬' : '🗨️';
    commentIcon.title = hasComment ? 'Edit comments' : 'Add comments';
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

    iconsContainer.appendChild(indentBtn);
    iconsContainer.appendChild(unindentBtn);
    iconsContainer.appendChild(commentIcon);
    iconsContainer.appendChild(previewIcon);

    // Get comments for this turn (handle legacy string format)
    let headingComment = '';
    let turnComment = '';
    if (hasComment) {
      const comments = commentsData[index];
      if (typeof comments === 'string') {
        // Legacy format - treat as turn comment
        turnComment = comments;
      } else {
        headingComment = comments.heading || '';
        turnComment = comments.turn || '';
      }
    }
    
    // Display heading comment if exists (above label, emphasized)
    if (headingComment) {
      const commentDisplay = document.createElement('div');
      commentDisplay.className = 'comment-display comment-emphasized';
      commentDisplay.textContent = headingComment;
      
      // Prevent click from bubbling to parent
      commentDisplay.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      
      item.appendChild(commentDisplay);
    }
    
    item.appendChild(label);
    item.appendChild(summary);
    item.appendChild(iconsContainer);

    // Display turn comment if exists (below summary, de-emphasized)
    if (turnComment) {
      const commentDisplay = document.createElement('div');
      commentDisplay.className = 'comment-display';
      commentDisplay.textContent = turnComment;
      
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
 * Load indents data for the current chat
 */
function loadIndentsData() {
  if (!currentChatId) return {};
  
  const indentsKey = `ChatWorkspace_${currentChatId}_indents`;
  const saved = localStorage.getItem(indentsKey);
  
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved indents data:', e);
      return {};
    }
  }
  
  return {};
}

/**
 * Save indent level for a specific turn
 */
function saveIndent(turnIndex, level) {
  if (!currentChatId) return;
  
  const indentsKey = `ChatWorkspace_${currentChatId}_indents`;
  const indentsData = loadIndentsData();
  
  if (level > 0) {
    indentsData[turnIndex] = level;
  } else {
    delete indentsData[turnIndex];
  }
  
  localStorage.setItem(indentsKey, JSON.stringify(indentsData));
  console.log(`Saved indent for turn ${turnIndex}: ${level}`);
  
  // Re-render outline to update display
  renderOutline(turns);
}

/**
 * Load comments data for the current chat
 */
function loadCommentsData() {
  if (!currentChatId) return {};
  
  const commentsKey = `ChatWorkspace_${currentChatId}_comments`;
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
 * Save comments for a specific turn (both heading and turn comments)
 */
function saveComment(turnIndex, headingComment, turnComment) {
  if (!currentChatId) return;
  
  const commentsKey = `ChatWorkspace_${currentChatId}_comments`;
  const commentsData = loadCommentsData();
  
  const hasHeading = headingComment !== null && headingComment !== undefined && headingComment.trim() !== '';
  const hasTurn = turnComment !== null && turnComment !== undefined && turnComment.trim() !== '';
  
  if (hasHeading || hasTurn) {
    // Save both comments
    commentsData[turnIndex] = {
      heading: hasHeading ? headingComment : '',
      turn: hasTurn ? turnComment : ''
    };
  } else {
    // Remove comment entry if both are empty
    delete commentsData[turnIndex];
  }
  
  localStorage.setItem(commentsKey, JSON.stringify(commentsData));
  console.log(`Saved comments for turn ${turnIndex}`);
  
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
  const currentComments = commentsData[index] || { heading: '', turn: '' };
  
  // Handle legacy data format (string instead of object)
  let headingValue = '';
  let turnValue = '';
  if (typeof currentComments === 'string') {
    turnValue = currentComments;
  } else {
    headingValue = currentComments.heading || '';
    turnValue = currentComments.turn || '';
  }

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
  editorTitle.textContent = `Comments - ${turn.type === 'user' ? '👤 User' : '🤖 Assistant'} Turn ${index + 1}`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'comment-editor-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => editor.remove());
  
  editorHeader.appendChild(editorTitle);
  editorHeader.appendChild(closeBtn);
  
  const editorBody = document.createElement('div');
  editorBody.className = 'comment-editor-body';
  
  // Heading comment section
  const headingSection = document.createElement('div');
  headingSection.className = 'comment-section';
  
  const headingLabel = document.createElement('label');
  headingLabel.className = 'comment-label';
  headingLabel.textContent = '📌 Heading Comment';
  headingLabel.title = 'Displayed above the role label';
  
  const headingTextarea = document.createElement('textarea');
  headingTextarea.className = 'comment-textarea comment-textarea-heading';
  headingTextarea.placeholder = 'Add heading comment (appears above role label)...';
  headingTextarea.value = headingValue;
  
  headingSection.appendChild(headingLabel);
  headingSection.appendChild(headingTextarea);
  
  // Turn comment section
  const turnSection = document.createElement('div');
  turnSection.className = 'comment-section';
  
  const turnLabel = document.createElement('label');
  turnLabel.className = 'comment-label';
  turnLabel.textContent = '💭 Turn Comment';
  turnLabel.title = 'Displayed below the summary text';
  
  const turnTextarea = document.createElement('textarea');
  turnTextarea.className = 'comment-textarea';
  turnTextarea.placeholder = 'Add turn comment (appears below summary text)...';
  turnTextarea.value = turnValue;
  
  turnSection.appendChild(turnLabel);
  turnSection.appendChild(turnTextarea);
  
  editorBody.appendChild(headingSection);
  editorBody.appendChild(turnSection);
  
  const editorFooter = document.createElement('div');
  editorFooter.className = 'comment-editor-footer';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'comment-save-btn';
  saveBtn.textContent = '💾 Save';
  saveBtn.addEventListener('click', () => {
    saveComment(index, headingTextarea.value, turnTextarea.value);
    editor.remove();
  });
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'comment-delete-btn';
  deleteBtn.textContent = '🗑️ Delete All';
  deleteBtn.addEventListener('click', () => {
    saveComment(index, '', '');
    editor.remove();
  });
  
  editorFooter.appendChild(deleteBtn);
  editorFooter.appendChild(saveBtn);
  
  modal.appendChild(editorHeader);
  modal.appendChild(editorBody);
  modal.appendChild(editorFooter);
  
  editor.appendChild(modal);
  document.body.appendChild(editor);
  
  // Focus first textarea
  headingTextarea.focus();
  
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
 * Load notes for the current chat
 */
function loadChatNotes(chatId) {
  if (!chatId) return;
  
  const notesKey = `ChatWorkspace_${chatId}_notes`;
  const saved = localStorage.getItem(notesKey);
  const notesInput = document.getElementById('notesInput');
  
  if (saved && notesInput) {
    try {
      const notesData = JSON.parse(saved);
      notesInput.value = notesData.notes || '';
    } catch (e) {
      console.warn('Failed to parse saved notes:', e);
    }
  }
}

/**
 * Save notes for the current chat
 */
function saveChatNotes() {
  if (!currentChatId) return;
  
  const notesInput = document.getElementById('notesInput');
  if (!notesInput) return;
  
  const notesKey = `ChatWorkspace_${currentChatId}_notes`;
  const notesData = {
    notes: notesInput.value,
    lastUpdated: new Date().toISOString()
  };
  
  localStorage.setItem(notesKey, JSON.stringify(notesData));
  console.log('Saved notes for chat:', currentChatId);
}

/**
 * Load saved settings for this chat from localStorage
 */
function loadChatSettings(chatId) {
  const settingsKey = `ChatWorkspace_${chatId}`;
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
  
  const settingsKey = `ChatWorkspace_${currentChatId}`;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  console.log('Saved settings for chat:', currentChatId);
}

/**
 * Load outline data for the current chat
 */
function loadOutlineData() {
  if (!currentChatId) return {};
  
  const outlineKey = `ChatWorkspace_${currentChatId}_outline`;
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
  
  const outlineKey = `ChatWorkspace_${currentChatId}_outline`;
  const outlineData = loadOutlineData();
  
  // Save the custom text for this turn
  outlineData[turnIndex] = text;
  
  localStorage.setItem(outlineKey, JSON.stringify(outlineData));
  console.log(`Saved outline for turn ${turnIndex}:`, text);
}

/**
 * Reset ALL outline items to default text and remove all comments and indents
 */
function resetAllOutlineItems() {
  if (!currentChatId || turns.length === 0) return;
  
  // Clear all outline customizations from localStorage
  const outlineKey = `ChatWorkspace_${currentChatId}_outline`;
  localStorage.removeItem(outlineKey);
  console.log('Reset all outline items to defaults');
  
  // Clear all comments from localStorage
  const commentsKey = `ChatWorkspace_${currentChatId}_comments`;
  localStorage.removeItem(commentsKey);
  console.log('Removed all comments');
  
  // Clear all indents from localStorage
  const indentsKey = `ChatWorkspace_${currentChatId}_indents`;
  localStorage.removeItem(indentsKey);
  console.log('Removed all indents');
  
  // Re-render the outline with defaults (using existing turns data)
  renderOutline(turns);
}

/**
 * Handle reset button click
 */
function handleResetClick() {
  resetAllOutlineItems();
}

/**
 * Handle share button click
 */
function handleShareClick() {
  if (turns.length === 0) return;
  showShareModal();
}

/**
 * Show share modal
 */
function showShareModal() {
  // Remove any existing modal
  const existingModal = document.querySelector('.share-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create backdrop
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  
  // Create modal container
  const modalContent = document.createElement('div');
  modalContent.className = 'share-modal-content';
  
  const modalHeader = document.createElement('div');
  modalHeader.className = 'share-modal-header';
  
  const modalTitle = document.createElement('div');
  modalTitle.className = 'share-modal-title';
  modalTitle.textContent = '🔗 Share Chat';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'share-modal-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => modal.remove());
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);
  
  const modalBody = document.createElement('div');
  modalBody.className = 'share-modal-body';
  
  const description = document.createElement('p');
  description.textContent = 'Share this chat with others';
  
  const shareButton = document.createElement('button');
  shareButton.className = 'share-modal-share-btn';
  shareButton.textContent = '🔗 Generate Share Link';
  shareButton.addEventListener('click', () => {
    // Placeholder for future functionality
    console.log('Share button clicked');
  });
  
  modalBody.appendChild(description);
  modalBody.appendChild(shareButton);
  
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Allow Enter key in textarea (no auto-submit)
document.getElementById('htmlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    loadChat();
  }
});

// Auto-save notes when typing (with debounce)
let notesDebounceTimer;
const notesInput = document.getElementById('notesInput');
if (notesInput) {
  notesInput.addEventListener('input', () => {
    clearTimeout(notesDebounceTimer);
    notesDebounceTimer = setTimeout(() => {
      saveChatNotes();
    }, 500); // Save after 500ms of no typing
  });
}

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
  
  const settingsKey = `ChatWorkspace_${chatId}`;
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

