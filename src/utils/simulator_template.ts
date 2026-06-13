export const getSimulatorHTML = (): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgriLink — SMS Simulator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f17;
      --panel-bg: #111827;
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #10b981;
      --primary-hover: #059669;
      --primary-glow: rgba(16, 185, 129, 0.1);
      --bubble-in: #1f2937;
      --bubble-out: #064e3b;
      --input-bg: rgba(0, 0, 0, 0.2);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    header h1 {
      font-size: 1.25rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .logo-badge {
      background: var(--primary-glow);
      color: var(--primary);
      border: 1px solid var(--primary);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      color: #34d399;
    }

    .connection-status.error {
      color: #f87171;
    }

    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .container {
      flex: 1;
      display: flex;
      flex-direction: row;
      height: calc(100vh - 60px);
    }

    /* Left Sidebar: Controls */
    .sidebar {
      width: 360px;
      background: var(--panel-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      gap: 1.5rem;
      overflow-y: auto;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    select, input[type="text"] {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem;
      color: #fff;
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
    }

    select:focus, input[type="text"]:focus {
      border-color: var(--primary);
    }

    .stats-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-label {
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    .stat-value {
      font-weight: 600;
      color: #fff;
      font-size: 1.1rem;
    }

    .cheat-sheet {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .cmd-btn {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.65rem;
      color: #fff;
      text-align: left;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s;
    }

    .cmd-btn:hover {
      background: var(--primary-glow);
      border-color: var(--primary);
    }

    .cmd-name {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--primary);
      margin-bottom: 0.15rem;
    }

    .cmd-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Right Side: Phone Mockup Area */
    .phone-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      background: var(--bg);
      padding: 2rem;
    }

    .phone-mockup {
      width: 320px;
      height: 640px;
      background: #000;
      border: 6px solid #2a2d36;
      border-radius: 36px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      position: relative;
    }

    .camera-hole {
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      width: 18px;
      height: 18px;
      background: #0a0a0a;
      border-radius: 50%;
      z-index: 10;
      box-shadow: inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 1px rgba(0,0,0,0.5);
    }

    .phone-screen {
      background: var(--bg);
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      border-radius: 34px;
      overflow: hidden;
    }

    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-header {
      padding: 2rem 1.25rem 1rem;
      border-bottom: 1px solid var(--border);
      background: var(--panel-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chat-header-info {
      display: flex;
      flex-direction: column;
    }

    .active-farmer-name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #fff;
    }

    .active-farmer-phone {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    .refresh-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1.1rem;
    }

    .refresh-btn:hover {
      background: var(--primary-glow);
      color: var(--primary);
      border-color: var(--primary);
    }

    .messages-container {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .message {
      max-width: 70%;
      display: flex;
      flex-direction: column;
    }

    .message.inbound {
      align-self: flex-end;
    }

    .message.outbound {
      align-self: flex-start;
    }

    .bubble {
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.4;
      word-break: break-word;
    }

    .message.inbound .bubble {
      background: var(--bubble-out);
      color: #fff;
      border-bottom-right-radius: 2px;
      border-bottom-left-radius: 12px;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .message.outbound .bubble {
      background: var(--bubble-in);
      color: #e5e7eb;
      border-bottom-left-radius: 2px;
      border-bottom-right-radius: 12px;
      border: none;
    }

    .time {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      font-family: 'JetBrains Mono', monospace;
    }
    
    .message.inbound .time {
      align-self: flex-end;
    }

    .message.outbound .time {
      align-self: flex-start;
    }

    .input-bar {
      padding: 0.5rem 0.75rem;
      background: var(--panel-bg);
      border-top: 1px solid var(--border);
      display: flex;
      gap: 0.5rem;
    }

    .input-bar input[type="text"] {
      flex: 1;
      border-radius: 20px;
      padding: 0.6rem 1rem;
      font-size: 0.9rem;
    }

    .input-bar button {
      background: var(--primary);
      border: none;
      border-radius: 20px;
      padding: 0 1rem;
      color: #000;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.2s;
    }

    .input-bar button:hover {
      background: var(--primary-hover);
    }

    .input-bar button:disabled {
      background: var(--border);
      cursor: not-allowed;
      color: var(--text-muted);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      text-align: center;
      padding: 2rem;
    }

    .empty-state p {
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }

    /* Typing indicators */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 0.6rem 0.8rem;
      background: var(--bubble-in);
      border-radius: 12px;
      align-self: flex-start;
      margin-bottom: 0.5rem;
      display: none;
    }

    .dot {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: bounce 1s infinite alternate;
    }

    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0% { transform: translateY(0); opacity: 0.4; }
      100% { transform: translateY(-4px); opacity: 1; }
    }

    /* RESPONSIVE DESIGN */
    @media (max-width: 768px) {
      .container {
        flex-direction: column;
      }

      .sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--border);
        height: auto;
        max-height: 35vh; /* Keep the controls compact on real phones */
        padding: 1rem;
      }

      .phone-container {
        flex: 1;
        padding: 0;
        min-height: 0; /* Required to allow the flex child to scroll */
      }

      .phone-mockup {
        width: 100%;
        height: 100%;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }

      .phone-screen {
        height: 100%;
        margin: 0;
        border: none;
        border-radius: 0;
      }

      .camera-hole {
        display: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>AgriLink <span class="logo-badge">SMS Simulator</span></h1>
    <div class="connection-status" id="connection-status">
      <div class="connection-dot"></div>
      <span id="connection-text">Connected</span>
    </div>
  </header>

  <div class="container">
    <!-- Sidebar: Controls -->
    <div class="sidebar">
      <div class="form-group">
        <label for="farmer-select">Select Active Farmer</label>
        <select id="farmer-select">
          <option value="">-- Choose a Farmer --</option>
        </select>
      </div>

      <div class="stats-card" id="farmer-stats" style="display: none;">
        <label>Live Balance Info</label>
        <div class="stat-row" style="margin-top: 0.5rem;">
          <span class="stat-label">Agri-Wallet:</span>
          <span class="stat-value" id="stat-agri-wallet">₦0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Cash Wallet:</span>
          <span class="stat-value" id="stat-cash-wallet">₦0</span>
        </div>
      </div>

      <div class="cheat-sheet">
        <label>SMS Cheat Sheet</label>
        <button class="cmd-btn" onclick="insertCommand('BAL')">
          <div class="cmd-name">BAL</div>
          <div class="cmd-desc">Check wallet balances.</div>
        </button>
        <button class="cmd-btn" onclick="insertCommand('REDEEM 4200 DEALER007')">
          <div class="cmd-name">REDEEM [amount] [dealer_code]</div>
          <div class="cmd-desc">Get OTP code to spend Agri-Wallet funds.</div>
        </button>
        <button class="cmd-btn" onclick="insertCommand('WITHDRAW 2000')">
          <div class="cmd-name">WITHDRAW [amount]</div>
          <div class="cmd-desc">Request Cash Wallet withdrawal.</div>
        </button>
      </div>
    </div>

    <!-- Phone Mockup Area -->
    <div class="phone-container">
      <div class="phone-mockup">
        <div class="camera-hole"></div>
        <div class="phone-screen">
          <div class="chat-area">
            <div class="chat-header" id="chat-header" style="display: none;">
              <div class="chat-header-info">
                <span class="active-farmer-name" id="active-farmer-name">Farmer Name</span>
                <span class="active-farmer-phone" id="active-farmer-phone">+234...</span>
              </div>
              <button id="refresh-btn" class="refresh-btn" title="Refresh Messages">↻</button>
            </div>

            <div class="messages-container" id="messages-container">
              <div class="empty-state">
                <p>Please select a farmer from the sidebar selector to load the conversation.</p>
              </div>
            </div>

            <div class="typing-indicator" id="typing-indicator" style="margin-left: 1.5rem;">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>

            <div class="input-bar">
              <input type="text" id="message-input" placeholder="Type SMS..." disabled>
              <button id="send-btn" disabled>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let farmers = [];
    let selectedFarmer = null;
    let messageCount = 0;

    const selectElement = document.getElementById('farmer-select');
    const farmerStats = document.getElementById('farmer-stats');
    const statAgriWallet = document.getElementById('stat-agri-wallet');
    const statCashWallet = document.getElementById('stat-cash-wallet');
    const chatHeader = document.getElementById('chat-header');
    const activeFarmerName = document.getElementById('active-farmer-name');
    const activeFarmerPhone = document.getElementById('active-farmer-phone');
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const connectionStatus = document.getElementById('connection-status');
    const connectionText = document.getElementById('connection-text');
    const typingIndicator = document.getElementById('typing-indicator');
    const refreshBtn = document.getElementById('refresh-btn');

    window.addEventListener('DOMContentLoaded', () => {
      fetchFarmers();

      // Trigger farmer select
      selectElement.addEventListener('change', (e) => {
        const phone = e.target.value;
        if (!phone) {
          resetUI();
          return;
        }
        const farmer = farmers.find(f => f.phone === phone);
        if (farmer) selectFarmer(farmer);
      });

      // Send buttons
      sendButton.addEventListener('click', sendMessage);
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
      });

      refreshBtn.addEventListener('click', () => {
        if (selectedFarmer) {
          fetchHistory(selectedFarmer.phone, false);
          refreshFarmerBalance(selectedFarmer.phone);
        }
      });
    });

    function resetUI() {
      selectedFarmer = null;
      farmerStats.style.display = 'none';
      chatHeader.style.display = 'none';
      messageInput.setAttribute('disabled', 'true');
      sendButton.setAttribute('disabled', 'true');
      messageInput.placeholder = 'Type SMS...';
      messagesContainer.innerHTML = '<div class="empty-state"><p>Please select a farmer from the sidebar selector to load the conversation.</p></div>';
    }

    async function fetchFarmers() {
      try {
        const response = await fetch('/api/v1/webhooks/sms/simulator/farmers');
        if (!response.ok) throw new Error('API failed');
        farmers = await response.json();
        
        // Populate dropdown
        selectElement.innerHTML = '<option value="">-- Choose a Farmer --</option>';
        farmers.forEach(farmer => {
          const opt = document.createElement('option');
          opt.value = farmer.phone;
          opt.textContent = \`\${farmer.fullName} (\${farmer.phone})\`;
          selectElement.appendChild(opt);
        });

        // Maintain selection if already chosen
        if (selectedFarmer) {
          selectElement.value = selectedFarmer.phone;
        }

        updateConnection(true);
      } catch (err) {
        console.error('Failed to load farmers:', err);
        updateConnection(false);
      }
    }

    function updateConnection(ok) {
      if (ok) {
        connectionStatus.classList.remove('error');
        connectionText.textContent = 'Connected';
      } else {
        connectionStatus.classList.add('error');
        connectionText.textContent = 'Connection Error';
      }
    }

    function selectFarmer(farmer) {
      selectedFarmer = farmer;
      
      // Update UI elements
      farmerStats.style.display = 'flex';
      statAgriWallet.textContent = '₦' + Number(farmer.agriWallet).toLocaleString();
      statCashWallet.textContent = '₦' + Number(farmer.cashWallet).toLocaleString();

      chatHeader.style.display = 'flex';
      activeFarmerName.textContent = farmer.fullName;
      activeFarmerPhone.textContent = farmer.phone;

      messageInput.removeAttribute('disabled');
      messageInput.placeholder = \`Send SMS as \${farmer.fullName}...\`;
      sendButton.removeAttribute('disabled');

      fetchHistory(farmer.phone, true);
    }

    async function fetchHistory(phone, isFirstLoad = false) {
      try {
        const response = await fetch(\`/api/v1/webhooks/sms/mock-history/\${encodeURIComponent(phone)}\`);
        if (!response.ok) throw new Error('API failed');
        const history = await response.json();
        
        if (history.length !== messageCount || isFirstLoad) {
          messageCount = history.length;
          renderMessages(history);
        }
        updateConnection(true);
      } catch (err) {
        console.error('Failed to fetch history:', err);
        updateConnection(false);
      }
    }

    function renderMessages(history) {
      if (history.length === 0) {
        messagesContainer.innerHTML = '<div class="empty-state"><p>No messages yet. Send a command to begin the conversation.</p></div>';
        return;
      }

      messagesContainer.innerHTML = '';
      history.forEach(msg => {
        const div = document.createElement('div');
        div.className = \`message \${msg.direction}\`;
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = msg.message;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'time';
        timeSpan.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        div.appendChild(bubble);
        div.appendChild(timeSpan);
        messagesContainer.appendChild(div);
      });

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
      if (!selectedFarmer) return;
      const text = messageInput.value.trim();
      if (!text) return;

      messageInput.value = '';
      messageInput.focus();

      typingIndicator.style.display = 'flex';
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      try {
        const response = await fetch('/api/v1/webhooks/sms/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msisdn: selectedFarmer.phone,
            text: text
          })
        });

        if (!response.ok) throw new Error('Failed to send');

        await fetchHistory(selectedFarmer.phone, true);
        await refreshFarmerBalance(selectedFarmer.phone);
      } catch (err) {
        console.error(err);
        alert('Could not deliver SMS message.');
      } finally {
        setTimeout(() => {
          typingIndicator.style.display = 'none';
        }, 800);
      }
    }

    async function refreshFarmerBalance(phone) {
      try {
        const response = await fetch('/api/v1/webhooks/sms/simulator/farmers');
        if (response.ok) {
          const freshFarmers = await response.json();
          farmers = freshFarmers;
          const current = freshFarmers.find(f => f.phone === phone);
          if (current) {
            statAgriWallet.textContent = '₦' + Number(current.agriWallet).toLocaleString();
            statCashWallet.textContent = '₦' + Number(current.cashWallet).toLocaleString();
          }
        }
      } catch (e) {}
    }

    function insertCommand(cmd) {
      if (!selectedFarmer) {
        alert('Please select a farmer first.');
        return;
      }
      messageInput.value = cmd;
      messageInput.focus();
    }
  </script>
</body>
</html>`;
};
