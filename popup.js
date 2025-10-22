// Popup script for MeetingMind
console.log('MeetingMind popup loaded');

const aiStatus = document.getElementById('aiStatus');
const openSidePanelBtn = document.getElementById('openSidePanel');
const viewHistoryBtn = document.getElementById('viewHistory');

// Check AI availability on load
checkAIStatus();

// Button handlers
openSidePanelBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

viewHistoryBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Set a flag to show history view
  chrome.storage.local.set({ showHistory: true });

  // Open side panel with history
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

async function checkAIStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAIAvailability' });

    let statusHTML = '';

    // Prompt API
    if (response.promptAPI === 'readily') {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot"></div>
          <span>Prompt API Ready</span>
        </div>
      `;
    } else {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot inactive"></div>
          <span>Prompt API ${response.promptAPI || 'unavailable'}</span>
        </div>
      `;
    }

    // Summarizer API
    if (response.summarizerAPI === 'readily') {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot"></div>
          <span>Summarizer API Ready</span>
        </div>
      `;
    } else {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot inactive"></div>
          <span>Summarizer API ${response.summarizerAPI || 'unavailable'}</span>
        </div>
      `;
    }

    // Writer API
    if (response.writerAPI === 'readily') {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot"></div>
          <span>Writer API Ready</span>
        </div>
      `;
    } else {
      statusHTML += `
        <div class="status-indicator">
          <div class="status-dot inactive"></div>
          <span>Writer API ${response.writerAPI || 'unavailable'}</span>
        </div>
      `;
    }

    aiStatus.innerHTML = statusHTML;

  } catch (error) {
    console.error('Error checking AI status:', error);
    aiStatus.innerHTML = `
      <div class="status-indicator">
        <div class="status-dot inactive"></div>
        <span>Unable to check status</span>
      </div>
    `;
  }
}
