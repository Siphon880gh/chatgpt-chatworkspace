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
