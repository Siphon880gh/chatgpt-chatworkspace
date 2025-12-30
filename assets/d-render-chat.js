let currentChatId = null;
let turns = [];
let scrollObserver = null; // For tracking which turn is in view
let hoverPreviewTimeout = null; // For hover preview delay
let typingInterval = null; // For typing animation
let appConfig = null; // Application configuration
let turnPositionIndicator = null; // For turn position indicator toast
let turnPositionTimeout = null; // For turn position indicator delay

/**
 * Load application configuration from config.json
 */
async function loadConfig() {
  try {
    const response = await fetch('config.json');
    if (!response.ok) {
      throw new Error('Config file not found');
    }
    appConfig = await response.json();
    console.log('Loaded config:', appConfig);
    
    // Apply CSS variables for hover preview
    if (appConfig.hoverPreview) {
      const root = document.documentElement;
      root.style.setProperty('--hover-preview-opacity', appConfig.hoverPreview.opacity);
      root.style.setProperty('--hover-preview-max-width', `${appConfig.hoverPreview.maxWidth}px`);
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
    // Set default config
    appConfig = {
      hoverPreview: {
        enabled: true,
        opacity: 0.85,
        typingSpeedMs: 24,
        maxWidth: 400
      }
    };
  }
}

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
    
    // Update URL to ?open={chatId}
    const newUrl = `${window.location.pathname}?open=${currentChatId}`;
    window.history.pushState({}, '', newUrl);
    
    // Save the chat HTML to localStorage for this chat
    const chatHtmlKey = `ChatWorkspace_${currentChatId}_html`;
    localStorage.setItem(chatHtmlKey, input);

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
    // Set z-index so later bubbles appear above earlier ones (for sticky buttons)
    turnDiv.style.zIndex = index + 1;

    // Collapse toggle button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'collapse-toggle';
    collapseBtn.innerHTML = '⋮⋮';
    collapseBtn.title = 'Collapse';
    collapseBtn.setAttribute('data-turn-index', index);
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleChatTurnCollapse(index);
    });

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-turn-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy text';
    copyBtn.setAttribute('data-turn-index', index);
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyChatTurnText(index, turn);
    });

    // Scroll to outline button
    const scrollToOutlineBtn = document.createElement('button');
    scrollToOutlineBtn.className = 'scroll-to-outline-btn';
    scrollToOutlineBtn.innerHTML = '⬇';
    scrollToOutlineBtn.title = 'Scroll to outline';
    scrollToOutlineBtn.setAttribute('data-turn-index', index);
    scrollToOutlineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollToOutlineItem(index);
    });

    const label = document.createElement('div');
    label.className = 'turn-label';
    label.textContent = turn.type === 'user' ? '👤 User' : '🤖 Assistant';

    const content = document.createElement('div');
    content.className = 'turn-content';
    
    // Try to extract and use ChatGPT's formatted HTML if available
    const formattedHTML = extractFormattedContent(turn.rawHtml);
    if (formattedHTML) {
      content.innerHTML = formattedHTML;
    } else {
      // Fallback to markdown parsing for plain text
      content.innerHTML = formatContentWithCode(turn.content, turn.rawHtml);
    }

    turnDiv.appendChild(collapseBtn);
    turnDiv.appendChild(copyBtn);
    turnDiv.appendChild(scrollToOutlineBtn);
    turnDiv.appendChild(label);
    turnDiv.appendChild(content);
    
    // Add hover event for turn position indicator
    turnDiv.addEventListener('mouseenter', () => {
      showTurnPositionIndicator(index, turn.type, 'chat');
    });
    turnDiv.addEventListener('mouseleave', () => {
      hideTurnPositionIndicator();
    });
    
    chatContent.appendChild(turnDiv);
  });
  
  // Set up scroll tracking to highlight outline items
  setupScrollTracking();
}

/**
 * Set up IntersectionObserver to track which chat turn is in view
 * and highlight the corresponding outline item
 */
function setupScrollTracking() {
  // Clean up existing observer if any
  if (scrollObserver) {
    scrollObserver.disconnect();
  }
  
  const chatContent = document.getElementById('chatContent');
  if (!chatContent) return;
  
  // Map to track which turns are currently visible
  const visibleTurns = new Map();
  
  // Create intersection observer
  scrollObserver = new IntersectionObserver((entries) => {
    // Update visibility map
    entries.forEach(entry => {
      const turnIndex = parseInt(entry.target.id.replace('turn-', ''));
      if (entry.isIntersecting) {
        visibleTurns.set(turnIndex, entry.intersectionRatio);
      } else {
        visibleTurns.delete(turnIndex);
      }
    });
    
    // Find the most visible turn (highest intersection ratio)
    let mostVisibleTurn = -1;
    let highestRatio = 0;
    
    visibleTurns.forEach((ratio, turnIndex) => {
      if (ratio > highestRatio) {
        highestRatio = ratio;
        mostVisibleTurn = turnIndex;
      }
    });
    
    // Update outline highlighting
    updateOutlineHighlight(mostVisibleTurn);
  }, {
    root: chatContent,
    threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    rootMargin: '-10% 0px -10% 0px' // Focus on center of viewport
  });
  
  // Observe all chat turns
  const turnElements = chatContent.querySelectorAll('.chat-turn');
  turnElements.forEach(turn => {
    scrollObserver.observe(turn);
  });
}

/**
 * Update outline highlighting based on the currently visible turn
 */
function updateOutlineHighlight(turnIndex) {
  const outlineItems = document.querySelectorAll('.outline-item');
  
  // Remove existing scroll-based highlight from all items
  outlineItems.forEach(item => {
    item.classList.remove('scroll-highlighted');
  });
  
  // Add highlight to the current turn's outline item (if valid)
  if (turnIndex >= 0 && turnIndex < outlineItems.length) {
    // Don't override the preview highlighting
    const outlineItem = outlineItems[turnIndex];
    if (!outlineItem.classList.contains('previewing')) {
      outlineItem.classList.add('scroll-highlighted');
    }
  }
}

/**
 * Extract formatted HTML content from ChatGPT's message structure
 */
function extractFormattedContent(rawHtml) {
  if (!rawHtml) return null;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    
    // Look for ChatGPT's markdown container
    let markdownDiv = doc.querySelector('.markdown');
    if (markdownDiv) {
      // Clone to avoid modifying original
      const clone = markdownDiv.cloneNode(true);
      
      // Process ALL text nodes to remove literal \n characters
      const walker = document.createTreeWalker(
        clone,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node);
      }
      
      textNodes.forEach(textNode => {
        // For code blocks: convert literal \n to actual newlines
        const isInCodeBlock = textNode.parentElement && textNode.parentElement.closest('code');
        if (isInCodeBlock) {
          if (textNode.textContent.includes('\\n')) {
            textNode.textContent = textNode.textContent.replace(/\\n/g, '\n');
          }
        } else {
          // For non-code blocks: remove literal \n completely
          if (textNode.textContent.includes('\\n')) {
            textNode.textContent = textNode.textContent.replace(/\\n/g, '');
          }
        }
      });
      
      let html = clone.innerHTML;
      return html;
    }
    
    // Look for whitespace-pre-wrap div (user messages)
    let preWrapDiv = doc.querySelector('.whitespace-pre-wrap');
    if (preWrapDiv) {
      // Escape HTML and convert newlines to br
      const text = preWrapDiv.textContent;
      return escapeAndFormat(text);
    }
    
    // If no special structure found, return null to use fallback
    return null;
  } catch (e) {
    console.warn('Failed to extract formatted content:', e);
    return null;
  }
}

/**
 * Escape HTML and format text
 */
function escapeAndFormat(text) {
  const div = document.createElement('div');
  div.textContent = text;
  let escaped = div.innerHTML;
  // Convert literal \n strings to actual newlines first
  escaped = escaped.replace(/\\n/g, '\n');
  // Convert newlines to br
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
}

/**
 * Format content with proper markdown styling (like ChatGPT)
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
  
  // Handle triple-backtick code blocks FIRST (before processing other markdown)
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    const blockId = `code-block-${Date.now()}-${codeBlockCounter++}`;
    const escapedCode = code.trim();
    return `<<<CODE_BLOCK:${blockId}:${language}:${btoa(escapedCode)}>>>`;
  });
  
  // Handle inline code with single backticks (protect from other markdown processing)
  const inlineCodeBlocks = [];
  formatted = formatted.replace(/`([^`\n]+)`/g, (match, code) => {
    const id = inlineCodeBlocks.length;
    inlineCodeBlocks.push(code);
    return `<<<INLINE_CODE:${id}>>>`;
  });
  
  // Split into paragraphs (double newlines create paragraph breaks)
  const paragraphs = formatted.split(/\n\n+/);
  
  formatted = paragraphs.map(paragraph => {
    // Skip if it's a code block placeholder
    if (paragraph.includes('<<<CODE_BLOCK:')) {
      return paragraph;
    }
    
    let lines = paragraph.split('\n');
    let processedLines = [];
    let inList = false;
    let listItems = [];
    let listType = null; // 'ul' or 'ol'
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Handle headers (# ## ### etc)
      if (/^(#{1,6})\s+(.+)$/.test(line)) {
        if (inList) {
          processedLines.push(listType === 'ol' ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        line = line.replace(/^(#{1,6})\s+(.+)$/, (match, hashes, content) => {
          const level = hashes.length;
          return `<h${level} class="md-h${level}">${content}</h${level}>`;
        });
        processedLines.push(line);
        continue;
      }
      
      // Handle blockquotes (> text)
      if (/^>\s+(.+)$/.test(line)) {
        if (inList) {
          processedLines.push(listType === 'ol' ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        line = line.replace(/^>\s+(.+)$/, '<blockquote class="md-blockquote">$1</blockquote>');
        processedLines.push(line);
        continue;
      }
      
      // Handle unordered lists (- or * at start)
      if (/^[\-\*]\s+(.+)$/.test(line)) {
        const content = line.replace(/^[\-\*]\s+(.+)$/, '$1');
        if (!inList || listType !== 'ul') {
          if (inList) {
            processedLines.push(`<ol>${listItems.join('')}</ol>`);
            listItems = [];
          }
          inList = true;
          listType = 'ul';
        }
        listItems.push(`<li>${content}</li>`);
        continue;
      }
      
      // Handle ordered lists (1. 2. etc)
      if (/^\d+\.\s+(.+)$/.test(line)) {
        const content = line.replace(/^\d+\.\s+(.+)$/, '$1');
        if (!inList || listType !== 'ol') {
          if (inList) {
            processedLines.push(`<ul>${listItems.join('')}</ul>`);
            listItems = [];
          }
          inList = true;
          listType = 'ol';
        }
        listItems.push(`<li>${content}</li>`);
        continue;
      }
      
      // Handle horizontal rules (--- or ***)
      if (/^[\-\*]{3,}$/.test(line.trim())) {
        if (inList) {
          processedLines.push(listType === 'ol' ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        processedLines.push('<hr class="md-hr">');
        continue;
      }
      
      // Close any open list if we hit a regular line
      if (inList && line.trim() !== '') {
        processedLines.push(listType === 'ol' ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
        listItems = [];
        inList = false;
      }
      
      // Regular line
      if (line.trim() !== '') {
        processedLines.push(line);
      }
    }
    
    // Close any remaining open list
    if (inList) {
      processedLines.push(listType === 'ol' ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
    }
    
    return processedLines.join('<br>');
  }).join('</p><p>');
  
  // Wrap in paragraph tags
  formatted = `<p>${formatted}</p>`;
  
  // Handle bold text (**text** or __text__)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Handle italic text (*text* or _text_) - be careful not to match * in lists
  formatted = formatted.replace(/(?<!\*)\*(?!\*)([^\*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  formatted = formatted.replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '<em>$1</em>');
  
  // Restore inline code blocks
  formatted = formatted.replace(/<<<INLINE_CODE:(\d+)>>>/g, (match, id) => {
    return `<code class="inline-code">${inlineCodeBlocks[parseInt(id)]}</code>`;
  });
  
  // Restore code blocks
  formatted = formatted.replace(/<<<CODE_BLOCK:([^:]+):([^:]+):([^>]+)>>>/g, (match, blockId, language, encodedCode) => {
    const code = atob(encodedCode);
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-language">${language}</span>
        <button class="copy-code-btn" onclick="copyCode('${blockId}')" title="Copy code">📋 Copy</button>
      </div>
      <pre class="code-block"><code id="${blockId}" class="language-${language}">${code}</code></pre>
    </div>`;
  });
  
  // Clean up empty paragraphs
  formatted = formatted.replace(/<p>\s*<\/p>/g, '');
  formatted = formatted.replace(/<p>(<br>)+<\/p>/g, '');
  
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

  // Group turns into pairs (user + assistant)
  let currentPairGroup = null;
  
  turns.forEach((turn, index) => {
    // Create a new pair group when we encounter a user message
    if (turn.type === 'user') {
      currentPairGroup = document.createElement('div');
      currentPairGroup.className = 'outline-pair-group';
      outlineContent.appendChild(currentPairGroup);
    }
    
    // If we don't have a group yet (conversation starts with assistant), create one
    if (!currentPairGroup) {
      currentPairGroup = document.createElement('div');
      currentPairGroup.className = 'outline-pair-group';
      outlineContent.appendChild(currentPairGroup);
    }
    
    const item = document.createElement('div');
    item.className = `outline-item ${turn.type}`;
    
    // Apply indentation
    const indentLevel = indentsData[index] || 0;
    if (indentLevel > 0) {
      item.style.marginLeft = `${indentLevel * 2}ch`;
    }

    const label = document.createElement('div');
    label.className = 'outline-label';
    
    // Create text span and up arrow icon for hover effect
    const labelText = document.createElement('span');
    labelText.className = 'outline-label-text';
    labelText.textContent = turn.type === 'user' ? 'User' : 'Assistant';
    
    const upArrow = document.createElement('span');
    upArrow.className = 'outline-label-arrow';
    upArrow.textContent = '⬆';
    upArrow.title = 'Jump to chat message';
    
    label.appendChild(labelText);
    label.appendChild(upArrow);
    
    // Add hover preview to label only
    setupHoverPreview(label, turn, index);

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
      commentDisplay.innerHTML = headingComment;
      
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
      commentDisplay.innerHTML = turnComment;
      
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

        // Then scroll the entire page to the top
        window.scrollTo({ top: document.getElementById("chatPanel").offsetTop - 150, behavior: 'smooth' });
      }
    });
    
    // Add hover event for turn position indicator
    item.addEventListener('mouseenter', () => {
      showTurnPositionIndicator(index, turn.type, 'outline');
    });
    item.addEventListener('mouseleave', () => {
      hideTurnPositionIndicator();
    });
    
    currentPairGroup.appendChild(item);
  });
}

let currentPreviewIndex = null;

/**
 * Setup hover preview with typing animation for an outline item
 */
function setupHoverPreview(item, turn, index) {
  // Check if hover preview is enabled in config
  if (!appConfig || !appConfig.hoverPreview || !appConfig.hoverPreview.enabled) {
    return;
  }
  
  let previewElement = null;
  let currentCharIndex = 0;
  let fullText = '';
  
  item.addEventListener('mouseenter', (e) => {
    // Clear any existing preview
    clearHoverPreview();
    
    // Get the original text, limited to 150 characters
    fullText = turn.content.slice(0, 150).replace(/\n/g, ' ');
    if (turn.content.length > 150) {
      fullText += '...';
    }
    
    // Start with a delay
    hoverPreviewTimeout = setTimeout(() => {
      // Create preview element
      previewElement = document.createElement('div');
      previewElement.className = 'outline-hover-preview';
      
      const textSpan = document.createElement('span');
      textSpan.className = 'outline-hover-preview-text';
      
      const cursor = document.createElement('span');
      cursor.className = 'outline-hover-preview-cursor';
      
      previewElement.appendChild(textSpan);
      previewElement.appendChild(cursor);
      document.body.appendChild(previewElement);
      
      // Position the preview below the item
      positionPreview(previewElement, item);
      
      // Start typing animation with speed from config
      currentCharIndex = 0;
      const typingSpeed = appConfig.hoverPreview.typingSpeedMs || 24;
      typingInterval = setInterval(() => {
        if (currentCharIndex < fullText.length) {
          textSpan.textContent = fullText.slice(0, currentCharIndex + 1);
          currentCharIndex++;
        } else {
          // Remove cursor when done typing
          if (cursor.parentElement) {
            cursor.remove();
          }
          clearInterval(typingInterval);
          typingInterval = null;
        }
      }, typingSpeed);
      
    }, 400); // 400ms delay before showing preview
  });
  
  item.addEventListener('mouseleave', () => {
    clearHoverPreview();
  });
  
  // Update position on scroll
  const outlineContent = document.getElementById('outlineContent');
  if (outlineContent) {
    const scrollHandler = () => {
      if (previewElement && previewElement.parentElement) {
        positionPreview(previewElement, item);
      }
    };
    outlineContent.addEventListener('scroll', scrollHandler);
  }
}

/**
 * Position the hover preview relative to the outline item
 */
function positionPreview(previewElement, item) {
  const itemRect = item.getBoundingClientRect();
  const previewRect = previewElement.getBoundingClientRect();
  
  // Position below the item
  let top = itemRect.bottom + 10;
  let left = itemRect.left;
  
  // Ensure preview doesn't go off-screen
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Adjust horizontal position if needed
  if (left + previewRect.width > viewportWidth - 20) {
    left = viewportWidth - previewRect.width - 20;
  }
  if (left < 20) {
    left = 20;
  }
  
  // If preview would go off bottom, show above instead
  if (top + previewRect.height > viewportHeight - 20) {
    top = itemRect.top - previewRect.height - 10;
  }
  
  previewElement.style.top = `${top}px`;
  previewElement.style.left = `${left}px`;
}

/**
 * Clear the hover preview and stop any animations
 */
function clearHoverPreview() {
  // Clear timeout
  if (hoverPreviewTimeout) {
    clearTimeout(hoverPreviewTimeout);
    hoverPreviewTimeout = null;
  }
  
  // Clear typing interval
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
  
  // Remove preview element
  const existingPreview = document.querySelector('.outline-hover-preview');
  if (existingPreview) {
    existingPreview.remove();
  }
}

/**
 * Create or get the turn position indicator element
 */
function getTurnPositionIndicator() {
  if (!turnPositionIndicator) {
    turnPositionIndicator = document.createElement('div');
    turnPositionIndicator.className = 'turn-position-indicator';
    document.body.appendChild(turnPositionIndicator);
  }
  return turnPositionIndicator;
}

/**
 * Show the turn position indicator
 * @param {number} index - Turn index (0-based)
 * @param {string} type - Turn type ('user' or 'assistant')
 * @param {string} source - Source of hover ('chat' or 'outline')
 */
function showTurnPositionIndicator(index, type, source) {
  // Clear any existing timeout
  if (turnPositionTimeout) {
    clearTimeout(turnPositionTimeout);
    turnPositionTimeout = null;
  }
  
  const indicator = getTurnPositionIndicator();
  const turnNumber = index + 1; // Convert to 1-based numbering
  const roleLabel = type === 'user' ? 'User' : 'Assistant';
  const sourceIcon = source === 'chat' ? '💬' : '🗒️';
  
  indicator.innerHTML = `
    <span class="turn-source-icon">${sourceIcon}</span>
    <span class="turn-number">#${turnNumber}</span>
    <span class="turn-separator">·</span>
    <span class="turn-role">${roleLabel}</span>
  `;
  
  // Small delay before showing to avoid flicker on quick mouse movements
  turnPositionTimeout = setTimeout(() => {
    indicator.classList.add('visible');
  }, 100);
}

/**
 * Hide the turn position indicator
 */
function hideTurnPositionIndicator() {
  // Clear any pending show timeout
  if (turnPositionTimeout) {
    clearTimeout(turnPositionTimeout);
    turnPositionTimeout = null;
  }
  
  if (turnPositionIndicator) {
    turnPositionIndicator.classList.remove('visible');
  }
}

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
 * Copy chat turn text to clipboard
 */
function copyChatTurnText(turnIndex, turn) {
  if (!turn) return;
  
  const text = turn.content;
  navigator.clipboard.writeText(text).then(() => {
    // Find the button and show feedback
    const turnElement = document.getElementById(`turn-${turnIndex}`);
    const btn = turnElement?.querySelector('.copy-turn-btn');
    if (btn) {
      const originalContent = btn.innerHTML;
      btn.innerHTML = '✅';
      btn.style.background = '#10b981';
      
      setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.background = '';
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

/**
 * Toggle collapse state for a chat turn
 */
function toggleChatTurnCollapse(turnIndex) {
  const turnElement = document.getElementById(`turn-${turnIndex}`);
  if (!turnElement) return;
  
  const isCurrentlyCollapsed = turnElement.classList.contains('collapsed');
  const newCollapsedState = !isCurrentlyCollapsed;
  
  // Toggle the class
  if (newCollapsedState) {
    turnElement.classList.add('collapsed');
  } else {
    turnElement.classList.remove('collapsed');
  }
  
  // Update button title
  const collapseBtn = turnElement.querySelector('.collapse-toggle');
  if (collapseBtn) {
    collapseBtn.title = newCollapsedState ? 'Expand' : 'Collapse';
  }
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
 * Insert text at cursor position in textarea
 */
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  
  // Insert the text at cursor position
  textarea.value = value.substring(0, start) + text + value.substring(end);
  
  // Move cursor to end of inserted text
  const newPos = start + text.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  
  // Focus the textarea
  textarea.focus();
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
  
  const headingLabelRow = document.createElement('div');
  headingLabelRow.className = 'comment-label-row';
  
  const headingLabel = document.createElement('label');
  headingLabel.className = 'comment-label';
  headingLabel.textContent = '📌 Heading Comment';
  headingLabel.title = 'Displayed above the role label';
  
  // Heading toolbar
  const headingToolbar = document.createElement('div');
  headingToolbar.className = 'comment-toolbar';
  
  // Shared icon options for both heading and turn comments
  const commentIconOptions = [
    { icon: 'fi-rr-sparkles', title: 'Enrich data', color: '#a855f7', html: '<i class="fi fi-rr-sparkles" style="color: #a855f7;"></i> <b>Enrich data:</b> ' },
    { icon: 'fi-rr-share-square', title: 'Pluck out', color: '#a855f7', html: '<i class="fi fi-rr-share-square" style="color: #a855f7;"></i> <b>Pluck out:</b> ' },
    { icon: 'fi-rr-file-import', title: 'Pluck in', color: '#a855f7', html: '<i class="fi fi-rr-file-import" style="color: #a855f7;"></i> <b>Pluck in:</b> ' },
    { icon: 'fa-code-branch', title: 'Split', color: '#a855f7', html: '<i class="fa-solid fa-code-branch" style="color: #a855f7;"></i> <b>Branch off:</b> ' },
    { icon: 'fa-code-merge', title: 'Merge from/to', color: '#a855f7', html: '<i class="fa-solid fa-code-merge" style="color: #a855f7;"></i> <b>Merge from/to:</b> ' },{ icon: 'fa-code', title: 'Structure output', color: '#a855f7', html: '<i class="fa-solid fa-code" style="color: #a855f7;"></i> <b>Structure output:</b> ' },
    { icon: 'fa-ellipsis', title: 'Need to expand on', color: '#a855f7', html: '<i class="fa-solid fa-ellipsis" style="color: #a855f7;"></i> <b>Expand on:</b>' },
    { icon: 'fa-compress', title: 'Make more contracted/general', color: '#a855f7', html: '<i class="fa-solid fa-compress" style="color: #a855f7;"></i> <b>Make less/more detailed:</b> ' },
    { icon: 'fa-circle-check', title: 'Check', color: '#16a34a', html: '<i class="fa-solid fa-circle-check" style="color: #16a34a;"></i> ' },
    { icon: 'fa-bolt', title: 'Bolt', color: '#16a34a', html: '<i class="fa-solid fa-bolt" style="color: #16a34a;"></i> ' },
    { icon: 'fa-circle-arrow-right', title: 'Right Arrow', color: '#16a34a', html: '<i class="fa-solid fa-circle-arrow-right" style="color: #16a34a;"></i> ' },
    { icon: 'fa-circle-arrow-left', title: 'Left Arrow', color: '#16a34a', html: '<i class="fa-solid fa-circle-arrow-left" style="color: #16a34a;"></i> ' },
    { icon: 'fa-circle-question', title: 'Question', color: '#2563eb', html: '<i class="fa-solid fa-circle-question" style="color: #2563eb;"></i> ' },
    { icon: 'fa-circle-info', title: 'Info', color: '#2563eb', html: '<i class="fa-solid fa-circle-info" style="color: #2563eb;"></i> ' },
    { icon: 'fa-star', title: 'Star', color: '#f97316', html: '<i class="fa-solid fa-star" style="color: #f97316;"></i> ' },
    { icon: 'fa-heart', title: 'Heart', color: '#f97316', html: '<i class="fa-solid fa-heart" style="color: #f97316;"></i> ' },
    { icon: 'fa-bookmark', title: 'Bookmark', color: '#2563eb', html: '<i class="fa-solid fa-bookmark" style="color: #2563eb;"></i> ' },
    { icon: 'fa-flag', title: 'Flag', color: '#2563eb', html: '<i class="fa-solid fa-flag" style="color: #2563eb;"></i> ' },
    { icon: 'fa-lightbulb', title: 'Idea', color: '#f97316', html: '<i class="fa-solid fa-lightbulb" style="color: #f97316;"></i> ' },
    { icon: 'fa-fire', title: 'Fire', color: '#f97316', html: '<i class="fa-solid fa-fire" style="color: #f97316;"></i> ' },
    { icon: 'fa-circle-xmark', title: 'Error', color: '#dc2626', html: '<i class="fa-solid fa-circle-xmark" style="color: #dc2626;"></i> ' },
    { icon: 'fa-circle-exclamation', title: 'Exclamation', color: '#dc2626', html: '<i class="fa-solid fa-circle-exclamation" style="color: #dc2626;"></i> ' },
    { icon: 'fa-triangle-exclamation', title: 'Warning', color: '#dc2626', html: '<i class="fa-solid fa-triangle-exclamation" style="color: #dc2626;"></i> ' },
    { icon: 'fa-bell', title: 'Alert', color: '#dc2626', html: '<i class="fa-solid fa-bell" style="color: #dc2626;"></i> ' },
    // { icon: 'fa-plus', title: 'Add', color: '#a855f7', html: '<i class="fa-solid fa-plus" style="color: #a855f7;"></i>  <b>Add:</b>' },
    // { icon: 'fa-minus', title: 'Remove', color: '#a855f7', html: '<i class="fa-solid fa-minus" style="color: #a855f7;"></i>  <b>Remove:</b>' },
  ];
  
  // Check if labels should be shown (from localStorage)
  const showIconLabels = localStorage.getItem('ChatWorkspace_showIconLabels') === 'true';
  
  // Icon dropdown button for heading
  const headingIconDropdownContainer = document.createElement('div');
  headingIconDropdownContainer.className = 'toolbar-dropdown-container';
  
  const headingIconDropdownBtn = document.createElement('button');
  headingIconDropdownBtn.className = 'toolbar-btn toolbar-dropdown-btn';
  headingIconDropdownBtn.innerHTML = '🏷️';
  headingIconDropdownBtn.title = 'Insert icon at beginning';
  headingIconDropdownBtn.type = 'button';
  
  const headingIconDropdownMenu = document.createElement('div');
  headingIconDropdownMenu.className = 'toolbar-dropdown-menu' + (showIconLabels ? ' show-labels' : '');
  
  // Add toggle row inside heading dropdown
  const headingToggleRow = document.createElement('div');
  headingToggleRow.className = 'toolbar-dropdown-toggle-row';
  
  const headingToggleLabel = document.createElement('span');
  headingToggleLabel.textContent = 'Icon labels';
  
  const headingLabelsToggle = document.createElement('button');
  headingLabelsToggle.className = 'toolbar-labels-toggle' + (showIconLabels ? ' active' : '');
  headingLabelsToggle.textContent = showIconLabels ? 'Hide' : 'Show';
  headingLabelsToggle.type = 'button';
  
  headingToggleRow.appendChild(headingToggleLabel);
  headingToggleRow.appendChild(headingLabelsToggle);
  headingIconDropdownMenu.appendChild(headingToggleRow);
  
  const headingTextarea = document.createElement('textarea');
  headingTextarea.className = 'comment-textarea comment-textarea-heading';
  headingTextarea.placeholder = 'Add heading comment (appears above role label)...';
  headingTextarea.value = headingValue;
  
  commentIconOptions.forEach(option => {
    const iconBtn = document.createElement('button');
    iconBtn.className = 'toolbar-dropdown-item';
    // Handle both Font Awesome (fa-*) and Flaticon (fi-*) icons
    const iconClass = option.icon.startsWith('fi-') ? `fi ${option.icon}` : `fa-solid ${option.icon}`;
    iconBtn.innerHTML = `<i class="${iconClass}"${option.color ? ` style="color: ${option.color};"` : ''}></i><span class="toolbar-dropdown-item-label">${option.title}</span>`;
    iconBtn.title = option.title;
    iconBtn.type = 'button';
    iconBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Insert at the beginning of the textarea
      const currentValue = headingTextarea.value;
      headingTextarea.value = option.html + currentValue;
      headingTextarea.focus();
      // Close dropdown
      headingIconDropdownMenu.classList.remove('show');
    });
    headingIconDropdownMenu.appendChild(iconBtn);
  });
  
  headingIconDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    headingIconDropdownMenu.classList.toggle('show');
    // Close turn comment dropdown if open
    if (iconDropdownMenu) {
      iconDropdownMenu.classList.remove('show');
    }
  });
  
  headingIconDropdownContainer.appendChild(headingIconDropdownBtn);
  headingIconDropdownContainer.appendChild(headingIconDropdownMenu);
  
  headingToolbar.appendChild(headingIconDropdownContainer);
  
  headingLabelRow.appendChild(headingLabel);
  headingLabelRow.appendChild(headingToolbar);
  
  headingSection.appendChild(headingLabelRow);
  headingSection.appendChild(headingTextarea);
  
  // Turn comment section with toolbar
  const turnSection = document.createElement('div');
  turnSection.className = 'comment-section';
  
  const turnLabelRow = document.createElement('div');
  turnLabelRow.className = 'comment-label-row';
  
  const turnLabel = document.createElement('label');
  turnLabel.className = 'comment-label';
  turnLabel.textContent = '💭 Turn Comment';
  turnLabel.title = 'Displayed below the summary text';
  
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'comment-toolbar';
  
  // Collapsible button
  const collapsibleBtn = document.createElement('button');
  collapsibleBtn.className = 'toolbar-btn';
  collapsibleBtn.innerHTML = '‣';
  collapsibleBtn.title = 'Insert collapsible section';
  collapsibleBtn.type = 'button';
  
  // Two column button
  const twoColBtn = document.createElement('button');
  twoColBtn.className = 'toolbar-btn';
  // threeColBtn.innerHTML = '═'; // ATTN AI: Do not remove in case of future changes
  twoColBtn.innerHTML = '∥';
  twoColBtn.title = 'Insert two columns';
  twoColBtn.type = 'button';
  twoColBtn.style.fontWeight = 'normal';
  
  // Three column button
  const threeColBtn = document.createElement('button');
  threeColBtn.className = 'toolbar-btn';
  // threeColBtn.innerHTML = '≡'; // ATTN AI: Do not remove in case of future changes
  threeColBtn.innerHTML = '⫴';
  threeColBtn.title = 'Insert three columns';
  threeColBtn.type = 'button';
  threeColBtn.style.fontWeight = 'normal'
  
  // Icon dropdown button
  const iconDropdownContainer = document.createElement('div');
  iconDropdownContainer.className = 'toolbar-dropdown-container';
  
  const iconDropdownBtn = document.createElement('button');
  iconDropdownBtn.className = 'toolbar-btn toolbar-dropdown-btn';
  iconDropdownBtn.innerHTML = '🏷️';
  iconDropdownBtn.title = 'Insert icon at beginning';
  iconDropdownBtn.type = 'button';
  
  const iconDropdownMenu = document.createElement('div');
  iconDropdownMenu.className = 'toolbar-dropdown-menu' + (showIconLabels ? ' show-labels' : '');
  
  // Add toggle row inside turn dropdown
  const turnToggleRow = document.createElement('div');
  turnToggleRow.className = 'toolbar-dropdown-toggle-row';
  
  const turnToggleLabel = document.createElement('span');
  turnToggleLabel.textContent = 'Icon labels';
  
  const turnLabelsToggle = document.createElement('button');
  turnLabelsToggle.className = 'toolbar-labels-toggle' + (showIconLabels ? ' active' : '');
  turnLabelsToggle.textContent = showIconLabels ? 'Hide' : 'Show';
  turnLabelsToggle.type = 'button';
  
  turnToggleRow.appendChild(turnToggleLabel);
  turnToggleRow.appendChild(turnLabelsToggle);
  iconDropdownMenu.appendChild(turnToggleRow);
  
  commentIconOptions.forEach(option => {
    const iconBtn = document.createElement('button');
    iconBtn.className = 'toolbar-dropdown-item';
    // Handle both Font Awesome (fa-*) and Flaticon (fi-*) icons
    const iconClass = option.icon.startsWith('fi-') ? `fi ${option.icon}` : `fa-solid ${option.icon}`;
    iconBtn.innerHTML = `<i class="${iconClass}"${option.color ? ` style="color: ${option.color};"` : ''}></i><span class="toolbar-dropdown-item-label">${option.title}</span>`;
    iconBtn.title = option.title;
    iconBtn.type = 'button';
    iconBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Insert at the beginning of the textarea
      const currentValue = turnTextarea.value;
      turnTextarea.value = option.html + currentValue;
      turnTextarea.focus();
      // Close dropdown
      iconDropdownMenu.classList.remove('show');
    });
    iconDropdownMenu.appendChild(iconBtn);
  });
  
  iconDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    iconDropdownMenu.classList.toggle('show');
    // Close heading dropdown if open
    if (headingIconDropdownMenu) {
      headingIconDropdownMenu.classList.remove('show');
    }
  });
  
  iconDropdownContainer.appendChild(iconDropdownBtn);
  iconDropdownContainer.appendChild(iconDropdownMenu);
  
  // Shared toggle handler for both toggles
  const toggleLabels = () => {
    const currentState = localStorage.getItem('ChatWorkspace_showIconLabels') === 'true';
    const newState = !currentState;
    localStorage.setItem('ChatWorkspace_showIconLabels', newState.toString());
    
    // Update both dropdown menus
    headingIconDropdownMenu.classList.toggle('show-labels', newState);
    iconDropdownMenu.classList.toggle('show-labels', newState);
    
    // Update both toggle buttons
    headingLabelsToggle.classList.toggle('active', newState);
    turnLabelsToggle.classList.toggle('active', newState);
    
    // Update button text
    const newText = newState ? 'Hide' : 'Show';
    headingLabelsToggle.textContent = newText;
    turnLabelsToggle.textContent = newText;
  };
  
  headingLabelsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLabels();
  });
  
  turnLabelsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLabels();
  });
  
  toolbar.appendChild(collapsibleBtn);
  toolbar.appendChild(twoColBtn);
  toolbar.appendChild(threeColBtn);
  toolbar.appendChild(iconDropdownContainer);
  
  turnLabelRow.appendChild(turnLabel);
  turnLabelRow.appendChild(toolbar);
  
  const turnTextarea = document.createElement('textarea');
  turnTextarea.className = 'comment-textarea';
  turnTextarea.placeholder = 'Add turn comment (appears below summary text)...\n\nYou can use HTML for formatting.';
  turnTextarea.value = turnValue;
  
  // Toolbar button handlers
  collapsibleBtn.addEventListener('click', () => {
    insertAtCursor(turnTextarea, '<details>\n  <summary>Click to expand</summary>\n  <div>Content goes here...</div>\n</details>\n');
  });
  
  twoColBtn.addEventListener('click', () => {
    insertAtCursor(turnTextarea, '<div class="columns-2">\n  <div>Column 1</div>\n  <div>Column 2</div>\n</div>\n');
  });
  
  threeColBtn.addEventListener('click', () => {
    insertAtCursor(turnTextarea, '<div class="columns-3">\n  <div>Column 1</div>\n  <div>Column 2</div>\n  <div>Column 3</div>\n</div>\n');
  });
  
  turnSection.appendChild(turnLabelRow);
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
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!iconDropdownContainer.contains(e.target)) {
      iconDropdownMenu.classList.remove('show');
    }
    if (!headingIconDropdownContainer.contains(e.target)) {
      headingIconDropdownMenu.classList.remove('show');
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
      
      // Update detected links after loading notes
      if (typeof updateDetectedLinks === 'function') {
        updateDetectedLinks();
      }
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
  
  // Re-render chat to reset any collapsed states
  renderChat(turns);
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
  description.className = 'share-description';
  description.textContent = 'Generate a shareable link with all your customizations';
  
  const statusDiv = document.createElement('div');
  statusDiv.className = 'share-status';
  statusDiv.style.display = 'none';
  
  const shareButton = document.createElement('button');
  shareButton.className = 'share-modal-share-btn';
  shareButton.textContent = '🔗 Generate Share Link';
  shareButton.addEventListener('click', async () => {
    try {
      shareButton.disabled = true;
      shareButton.textContent = '⏳ Generating...';
      statusDiv.style.display = 'none';
      
      // Collect all data from localStorage and current state
      const payload = {};
      
      // Get the chat HTML
      const chatHtml = document.getElementById('htmlInput').value.trim();
      if (chatHtml) {
        payload.chatHtml = chatHtml;
      }
      
      // Get turns data (the parsed conversation)
      if (turns && turns.length > 0) {
        payload.turns = turns;
      }
      
      // Get outline data
      const outline = loadOutlineData();
      if (outline && Object.keys(outline).length > 0) {
        payload.outline = outline;
      }
      
      // Get comments data
      const comments = loadCommentsData();
      if (comments && Object.keys(comments).length > 0) {
        payload.comments = comments;
      }
      
      // Get indents data
      const indents = loadIndentsData();
      if (indents && Object.keys(indents).length > 0) {
        payload.indents = indents;
      }
      
      // Get notes data
      const notesKey = `ChatWorkspace_${currentChatId}_notes`;
      const savedNotes = localStorage.getItem(notesKey);
      if (savedNotes) {
        try {
          const notesData = JSON.parse(savedNotes);
          if (notesData && notesData.notes) {
            payload.notes = notesData;
          }
        } catch (e) {
          console.warn('Failed to parse notes:', e);
        }
      }
      
      // Send POST request to share.php
      const response = await fetch(`share.php?id=${currentChatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        // Construct share URL with ?shared= parameter
        const shareUrl = `${window.location.origin}${window.location.pathname}?shared=${result.conversationId}`;
        
        // Determine the title based on whether it's a new share or an update
        const successTitle = result.isNew ? 'Share Link Created!' : 'Share Content Updated!';
        const successText = result.isNew 
          ? 'Your chat is ready to share with all customizations'
          : 'Your shared chat has been updated with the latest customizations';
        
        // Hide the generate button and description
        shareButton.style.display = 'none';
        description.style.display = 'none';
        
        // Show success status
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `
          <div class="share-success-icon">✓</div>
          <h3 class="share-success-title">${successTitle}</h3>
          <p class="share-success-text">${successText}</p>
          <div class="share-link-container">
            <input type="text" class="share-link-input" value="${shareUrl}" readonly>
            <button class="share-copy-btn" onclick="event.stopPropagation();">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
          </div>
          <div class="share-copied-message">📋 Link copied to clipboard!</div>
        `;
        
        // Copy link to clipboard automatically
        await navigator.clipboard.writeText(shareUrl);
        
        // Add copy button functionality
        const copyBtn = statusDiv.querySelector('.share-copy-btn');
        const linkInput = statusDiv.querySelector('.share-link-input');
        const copiedMsg = statusDiv.querySelector('.share-copied-message');
        
        copyBtn.addEventListener('click', async () => {
          await navigator.clipboard.writeText(shareUrl);
          linkInput.select();
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          `;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            `;
          }, 2000);
        });
        
      } else {
        throw new Error(result.error || 'Failed to create share link');
      }
    } catch (error) {
      console.error('Share error:', error);
      
      // Hide the generate button and show error
      shareButton.style.display = 'none';
      description.style.display = 'none';
      
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = `
        <div class="share-error-icon">✕</div>
        <h3 class="share-error-title">Share Failed</h3>
        <p class="share-error-text">${error.message}</p>
        <button class="share-retry-btn">Try Again</button>
      `;
      
      // Add retry button functionality
      const retryBtn = statusDiv.querySelector('.share-retry-btn');
      retryBtn.addEventListener('click', () => {
        statusDiv.style.display = 'none';
        shareButton.style.display = 'block';
        description.style.display = 'block';
        shareButton.disabled = false;
        shareButton.textContent = '🔗 Generate Share Link';
      });
    }
  });
  
  modalBody.appendChild(description);
  modalBody.appendChild(shareButton);
  modalBody.appendChild(statusDiv);
  
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

/**
 * Detect links in text and return array of URLs
 */
function detectLinks(text) {
  if (!text) return [];
  
  // URL regex pattern that matches http(s) URLs
  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlPattern);
  
  if (!matches) return [];
  
  // Remove duplicates and clean URLs
  return [...new Set(matches)].map(url => {
    // Remove trailing punctuation that's not part of the URL
    return url.replace(/[.,;:!?)]$/, '');
  });
}

/**
 * Update the detected links display
 */
function updateDetectedLinks() {
  const notesInput = document.getElementById('notesInput');
  const detectedLinksContainer = document.getElementById('detectedLinks');
  
  if (!notesInput || !detectedLinksContainer) return;
  
  const links = detectLinks(notesInput.value);
  
  // Clear existing links
  detectedLinksContainer.innerHTML = '';
  
  if (links.length === 0) return;
  
  // Create link icons
  links.forEach(url => {
    const linkElement = document.createElement('a');
    linkElement.href = url;
    linkElement.target = '_blank';
    linkElement.rel = 'noopener noreferrer';
    linkElement.className = 'link-icon';
    linkElement.title = url;
    
    // Add globe icon
    const icon = document.createElement('i');
    icon.className = 'fas fa-globe';
    linkElement.appendChild(icon);
    
    // Add link text (domain)
    const linkText = document.createElement('span');
    linkText.className = 'link-text';
    try {
      const urlObj = new URL(url);
      linkText.textContent = urlObj.hostname;
    } catch (e) {
      linkText.textContent = url;
    }
    linkElement.appendChild(linkText);
    
    detectedLinksContainer.appendChild(linkElement);
  });
}

// Auto-save notes when typing (with debounce)
let notesDebounceTimer;
const notesInput = document.getElementById('notesInput');
if (notesInput) {
  notesInput.addEventListener('input', () => {
    clearTimeout(notesDebounceTimer);
    notesDebounceTimer = setTimeout(() => {
      saveChatNotes();
    }, 500); // Save after 500ms of no typing
    
    // Update detected links immediately
    updateDetectedLinks();
  });
  
  // Initial check for links on page load
  updateDetectedLinks();
}

/**
 * Scroll to the highlighted outline item
 */
function scrollToHighlighted() {
  const highlightedItem = document.querySelector('.scroll-highlighted');
  if (highlightedItem) {
    // Use scrollIntoView with the nearest scrollable ancestor (the outline content)
    highlightedItem.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'nearest'
    });
  }
}

/**
 * Scroll to a specific outline item by turn index
 */
function scrollToOutlineItem(index) {
  const outlineItems = document.querySelectorAll('.outline-item');
  if (index >= 0 && index < outlineItems.length) {
    const targetItem = outlineItems[index];
    
    // Scroll the outline item into view with smooth animation
    targetItem.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'nearest'
    });
    
    // Add a brief highlight effect
    targetItem.style.transition = 'box-shadow 0.3s, background-color 0.3s';
    targetItem.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.4)';
    targetItem.style.backgroundColor = 'rgba(102, 126, 234, 0.15)';
    
    setTimeout(() => {
      targetItem.style.boxShadow = '';
      targetItem.style.backgroundColor = '';
    }, 1500);
  }
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

/**
 * Handle URL parameters on page load
 */
async function handleUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Check for ?shared={chatId} first (takes priority)
  if (urlParams.has('shared')) {
    const chatId = urlParams.get('shared');
    console.log('Loading shared chat:', chatId);
    
    try {
      // Fetch the shared data
      const response = await fetch(`shared/${chatId}.json`);
      
      if (!response.ok) {
        throw new Error('Shared chat not found');
      }
      
      const sharedData = await response.json();
      
      // Save to localStorage
      if (sharedData.data) {
        // Save chat HTML to textarea and localStorage if it exists
        if (sharedData.data.chatHtml) {
          const htmlInput = document.getElementById('htmlInput');
          if (htmlInput) {
            htmlInput.value = sharedData.data.chatHtml;
          }
          // Save to localStorage for future ?open= access
          const chatHtmlKey = `ChatWorkspace_${chatId}_html`;
          localStorage.setItem(chatHtmlKey, sharedData.data.chatHtml);
        }
        
        // Save outline
        if (sharedData.data.outline) {
          const outlineKey = `ChatWorkspace_${chatId}_outline`;
          localStorage.setItem(outlineKey, JSON.stringify(sharedData.data.outline));
        }
        
        // Save comments
        if (sharedData.data.comments) {
          const commentsKey = `ChatWorkspace_${chatId}_comments`;
          localStorage.setItem(commentsKey, JSON.stringify(sharedData.data.comments));
        }
        
        // Save indents
        if (sharedData.data.indents) {
          const indentsKey = `ChatWorkspace_${chatId}_indents`;
          localStorage.setItem(indentsKey, JSON.stringify(sharedData.data.indents));
        }
        
        // Save notes
        if (sharedData.data.notes) {
          const notesKey = `ChatWorkspace_${chatId}_notes`;
          localStorage.setItem(notesKey, JSON.stringify(sharedData.data.notes));
        }
        
        console.log('Shared data saved to localStorage');
      }
      
      // Change URL to ?open={chatId}
      const newUrl = `${window.location.pathname}?open=${chatId}`;
      window.history.pushState({}, '', newUrl);
      
      // Automatically load the chat if we have the HTML
      if (sharedData.data && sharedData.data.chatHtml) {
        // Use a small delay to ensure DOM is ready
        setTimeout(() => {
          loadChat();
        }, 100);
      } else {
        // Show success message if no HTML was included
        alert('✅ Shared chat loaded! The customizations have been saved to your browser.');
      }
      
    } catch (error) {
      console.error('Error loading shared chat:', error);
      alert(`❌ Failed to load shared chat: ${error.message}`);
    }
    return; // Exit after handling shared link
  }
  
  // Check for ?open={chatId} (only if not handling ?shared)
  if (urlParams.has('open')) {
    const chatId = urlParams.get('open');
    console.log('Opening chat from localStorage:', chatId);
    
    // Try to load chat HTML from localStorage
    const chatHtmlKey = `ChatWorkspace_${chatId}_html`;
    const savedHtml = localStorage.getItem(chatHtmlKey);
    
    if (savedHtml) {
      // We have the chat HTML in localStorage - load it automatically
      console.log('Found saved chat HTML in localStorage');
      const htmlInput = document.getElementById('htmlInput');
      if (htmlInput) {
        htmlInput.value = savedHtml;
      }
      
      // Automatically load the chat
      setTimeout(() => {
        loadChat();
      }, 100);
    } else {
      // No localStorage data - try to load from shared
      console.log('No localStorage data found, trying shared link...');
      
      try {
        // Change URL to ?shared={chatId} and let the shared handler take over
        const sharedUrl = `${window.location.pathname}?shared=${chatId}`;
        window.location.href = sharedUrl;
      } catch (error) {
        console.error('Failed to redirect to shared link:', error);
        alert('❌ Missing: Chat not found in localStorage or shared files.');
      }
    }
  }
}

/**
 * Print the outline panel with all its content, formatting, and styles
 */
function printOutline() {
  if (!currentChatId || turns.length === 0) {
    alert('No chat loaded yet. Please load a chat first.');
    return;
  }

  // Get the outline content
  const outlineContent = document.getElementById('outlineContent');
  if (!outlineContent) {
    alert('Outline content not found.');
    return;
  }

  // Load notes for this chat
  const notesKey = `ChatWorkspace_${currentChatId}_notes`;
  const savedNotes = localStorage.getItem(notesKey);
  let notesHtml = '';
  
  if (savedNotes) {
    try {
      const notesData = JSON.parse(savedNotes);
      if (notesData.notes && notesData.notes.trim()) {
        // Escape HTML first
        let processedNotes = notesData.notes
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        
        // Convert URLs to clickable links
        const urlPattern = /(https?:\/\/[^\s]+)/gi;
        processedNotes = processedNotes.replace(urlPattern, function(url) {
          // Remove trailing punctuation that's not part of the URL
          const cleanUrl = url.replace(/[.,;:!?)]$/, '');
          const trailingPunct = url.length > cleanUrl.length ? url.slice(-1) : '';
          return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailingPunct}`;
        });
        
        // Convert newlines to <br>
        processedNotes = processedNotes.replace(/\n/g, '<br>');
        
        notesHtml = `
          <div class="notes-section">
            <h2>📝 Notes</h2>
            <div class="notes-content">${processedNotes}</div>
          </div>
        `;
      }
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
  }

  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Failed to open print window. Please check your popup blocker.');
    return;
  }

  // Clone the outline content
  const contentClone = outlineContent.cloneNode(true);

  // Build the print document
  const printDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat Outline - Print</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel='stylesheet' href='https://cdn-uicons.flaticon.com/2.6.0/uicons-regular-rounded/css/uicons-regular-rounded.css'>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 20px;
      background: white;
    }
    
    h1 {
      margin-bottom: 20px;
      color: #667eea;
      font-size: 24px;
    }
    
    /* Outline pair groups */
    .outline-pair-group {
      background: rgba(102, 126, 234, 0.03);
      border: 1px solid rgba(102, 126, 234, 0.1);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    /* Outline items */
    .outline-item {
      margin-bottom: 12px;
      padding: 8px;
      border-radius: 6px;
      page-break-inside: avoid;
    }
    
    .outline-item[data-indent-level] {
      margin-left: calc(var(--indent-level, 0) * 2ch);
    }
    
    .outline-label {
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .outline-label.user {
      color: #1976d2;
    }
    
    .outline-label.assistant {
      color: #7b1fa2;
    }
    
    .outline-summary {
      font-size: 0.95rem;
      color: #555;
      line-height: 1.5;
    }
    
    /* Comment styles */
    .outline-heading-comment {
      background: #fff8e1;
      border-left: 4px solid #ffc107;
      padding: 8px 12px;
      margin: 6px 0;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    
    .outline-turn-comment {
      color: #666;
      font-style: italic;
      font-size: 0.85rem;
      margin-top: 6px;
      padding: 6px 10px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    
    /* Icon styles */
    .comment-icon {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
    }
    
    /* Column layouts */
    .columns-2, .columns-3 {
      display: grid;
      gap: 12px;
      margin: 8px 0;
    }
    
    .columns-2 {
      grid-template-columns: 1fr 1fr;
    }
    
    .columns-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }
    
    /* Collapsible sections */
    details {
      margin: 8px 0;
      padding: 8px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    
    summary {
      cursor: pointer;
      font-weight: 600;
      padding: 4px;
      user-select: none;
    }
    
    /* Hide interactive elements for print */
    .outline-icons,
    .outline-item-preview,
    .outline-item-comment,
    .outline-item-indent,
    .outline-item-unindent {
      display: none !important;
    }
    
    /* Notes section styles */
    .notes-section {
      background: #f0f7ff;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    
    .notes-section h2 {
      color: #667eea;
      font-size: 18px;
      margin-bottom: 12px;
    }
    
    .notes-content {
      color: #333;
      font-size: 0.95rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .notes-content a {
      color: #667eea;
      text-decoration: underline;
      word-break: break-all;
    }
    
    .notes-content a:hover {
      color: #764ba2;
      text-decoration: underline;
    }
    
    /* Print-specific styles */
    @media print {
      body {
        padding: 10px;
      }
      
      .outline-pair-group {
        page-break-inside: avoid;
      }
      
      .outline-item {
        page-break-inside: avoid;
      }
      
      .notes-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <h1>📋 Chat Outline</h1>
  ${notesHtml}
  ${contentClone.innerHTML}
</body>
</html>
  `;

  // Write the document and trigger print
  printWindow.document.write(printDocument);
  printWindow.document.close();
  
  // Wait for resources to load before printing
  printWindow.onload = function() {
    printWindow.focus();
    printWindow.print();
  };
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    handleUrlParameters();
  });
} else {
  (async () => {
    await loadConfig();
    handleUrlParameters();
  })();
}

