<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🧠 ChatGPT ChatWorkspace</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel='stylesheet' href='https://cdn-uicons.flaticon.com/2.6.0/uicons-regular-rounded/css/uicons-regular-rounded.css'>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <header>
    <a href="./" style="text-decoration:none; color:unset;"><h1>🧠 ChatGPT ChatWorkspace</h1></a>
    <p>Import, store, and navigate ChatGPT conversations</p>
  </header>

  <div class="input-section">
    <textarea 
      id="htmlInput" 
      placeholder="Paste ChatGPT conversation HTML here...&#10;&#10;Tip: Run this in browser console on ChatGPT:&#10;document.querySelector('[data-turn-id]').parentElement.innerHTML"
    ></textarea>
    <div class="button-group">
      <button id="loadBtn" onclick="loadChat()">Load Chat</button>
      <button id="shareBtn" class="share-btn" onclick="handleShareClick()" disabled>🔗 Share</button>
    </div>
  </div>

  <div class="notes-section">
    <label for="notesInput" class="notes-label">📝 Notes (Optional)</label>
    <textarea 
      id="notesInput"
      class="notes-textarea"
      placeholder="Add notes about this chat...&#10;e.g., Original URL, goals, context, or any other relevant information"
    ></textarea>
    <div id="detectedLinks" class="detected-links"></div>
  </div>

  <div class="main-container">
    <div id="chatPanel" class="panel">
      <div class="panel-header">💬 Chat View</div>
      <div id="chatContent" class="panel-content">
        <div class="empty-state">
          <!-- <div class="empty-state-icon">📭</div> -->
          <p>No chat loaded yet</p>
          <br>
          <div class="info-box">
            <strong>How to use:</strong>
            <span>1. Open a ChatGPT conversation</span><br>
			<span>2. Run this in the browser console:</span><br/>
			<div class="console-instruction">
				<code id="consoleCommand">document.querySelector('[data-turn-id]').parentElement.innerHTML</code>
				<button class="copy-inline-btn" onclick="copyConsoleCommand()" title="Copy command">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
					</button>
			</div>
			  <br>
            3. Copy the output and paste it above<br>
            4. Click "Load Chat"
          </div>
        </div>
      </div>
      <div class="zoom-controls">
        <button class="zoom-btn" onclick="zoomOut()" title="Zoom Out">🔍−</button>
        <button class="zoom-btn" onclick="zoomIn()" title="Zoom In">🔍+</button>
        <button class="zoom-btn" onclick="scrollToHighlighted()" title="Scroll to highlighted">⬇</button>
      </div>
    </div>

    <div class="resize-handle" id="resizeHandle"></div>

    <div id="outlinePanel" class="panel">
      <div class="panel-header">
        <span>📋 Outline</span>
        <button class="print-outline-btn" onclick="printOutline()" title="Print Outline">🖨️ Print</button>
      </div>
      <div id="outlineContent" class="panel-content">
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p>Chat outline will appear here</p>
        </div>
      </div>
      <div class="outline-reset-controls">
        <button class="reset-btn" onclick="handleResetClick()" title="Reset to default">↺</button>
      </div>
    </div>
  </div>

  <script src="assets/c-hash-chat.js"></script>
  <script src="assets/d-render-chat.js"></script>
  <script>
    function copyConsoleCommand() {
      const command = document.getElementById('consoleCommand').textContent;
      navigator.clipboard.writeText(command).then(() => {
        const btn = event.target.closest('.copy-inline-btn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 1500);
      });
    }
  </script>
</body>
</html>