/**
 * Normalize a single message to { type, content } with trimmed, collapsed whitespace.
 */
function normalizeMessage(m) {
	return {
	  type: String(m?.type || '').trim(),
	  content: String(m?.content || '').replace(/\s+/g, ' ').trim(),
	};
  }
  
  /**
   * Coerce various input shapes into an ordered array of {type, content}.
   * Supported:
   *  - Array of messages: [ {type, content}, ... ]
   *  - Object with { messages: [...] }
   *  - Single message object: { type, content }
   *  - Keyed object: { "0": {type,content}, "1": {...}, ... } (keys sorted)
   */
  function coerceToArray(input) {
	if (Array.isArray(input)) return input.map(normalizeMessage);
  
	if (input && typeof input === 'object') {
	  if (Array.isArray(input.messages)) {
		return input.messages.map(normalizeMessage);
	  }
	  // Single message object?
	  if ('type' in input || 'content' in input) {
		return [normalizeMessage(input)];
	  }
	  // Keyed dictionary -> sort keys for deterministic order
	  const keys = Object.keys(input).sort((a, b) => {
		// numeric-like keys come first numerically, then lexicographically
		const an = +a, bn = +b, anNum = String(an) === a, bnNum = String(bn) === b;
		if (anNum && bnNum) return an - bn;
		if (anNum) return -1;
		if (bnNum) return 1;
		return a.localeCompare(b);
	  });
	  return keys.map(k => normalizeMessage(input[k]));
	}
  
	return []; // fallback
  }
  
  /**
   * Canonical JSON string used for hashing.
   */
  function canonicalizeChat(input) {
	const msgs = coerceToArray(input);
	return JSON.stringify({ v: 1, count: msgs.length, messages: msgs });
  }
  
  /**
   * Browser/WebCrypto: SHA-256 → hex
   */
  async function sha256Hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
	return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Public: hash any supported input shape. Optional salt scopes the digest.
   */
  async function hashChat(input, salt = '') {
	const canonical = canonicalizeChat(input);
	return sha256Hex(salt + '|' + canonical);
  }
  
  // --- Node.js variant (if you need sync hashing) ---
  /*
  const crypto = require('crypto');
  function hashChatNode(input, salt = '') {
	const canonical = canonicalizeChat(input);
	return crypto.createHash('sha256').update(salt + '|' + canonical, 'utf8').digest('hex');
  }
  */
  
  // ===== Examples =====
  // 1) Array
  // const digest = await hashChat([{type:'user', content:'Hi'}, {type:'assistant', content:'Hello'}]);
  
  // 2) { messages: [...] }
  // const digest = await hashChat({ messages: [{type:'user', content:'Hi'}] });
  
  // 3) Single object
  // const digest = await hashChat({ type:'user', content:'Solo' });
  
  // 4) Keyed object (order will be 0,1,2,... then lex keys)
  // const digest = await hashChat({ "0": {type:'user', content:'A'}, "2": {type:'assistant', content:'B'} });
//   await hashChat({ messages: arr });