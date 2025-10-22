// Sidebar script for MeetingMind
console.log('MeetingMind sidebar loaded');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const content = document.getElementById('content');
const exportBtn = document.getElementById('exportBtn');
const emailBtn = document.getElementById('emailBtn');

let currentMeeting = null;

// Listen for storage changes (live transcript updates)
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.liveTranscript) {
    displayLiveTranscript(changes.liveTranscript.newValue);
  }

  if (changes.latestMeeting) {
    displayMeetingSummary(changes.latestMeeting.newValue);
  }
});

// Load existing data
chrome.storage.local.get(['liveTranscript', 'latestMeeting', 'showHistory'], (result) => {
  if (result.showHistory) {
    // Clear the flag and show history
    chrome.storage.local.remove('showHistory');
    displayMeetingHistory();
  } else if (result.liveTranscript && result.liveTranscript.length > 0) {
    displayLiveTranscript(result.liveTranscript);
  } else if (result.latestMeeting) {
    displayMeetingSummary(result.latestMeeting);
  }
});

// Export button handler
exportBtn.addEventListener('click', () => {
  if (currentMeeting) {
    exportMeeting(currentMeeting);
  }
});

// Email button handler
emailBtn.addEventListener('click', async () => {
  if (currentMeeting) {
    await generateFollowUpEmail(currentMeeting);
  }
});

// Display live transcript during meeting
function displayLiveTranscript(transcript) {
  statusDot.classList.add('recording');
  statusDot.classList.remove('processing');
  statusText.textContent = 'Recording...';

  exportBtn.style.display = 'none';
  emailBtn.style.display = 'none';

  let html = `
    <div class="section">
      <h2>📝 Live Transcript</h2>
      <div class="section-content">
  `;

  if (Array.isArray(transcript)) {
    transcript.forEach((line, index) => {
      html += `
        <div class="transcript-line">
          <span class="time">${new Date().toLocaleTimeString()}</span>
          ${escapeHtml(line)}
        </div>
      `;
    });
  } else {
    html += `<div class="transcript-line">${escapeHtml(transcript)}</div>`;
  }

  html += `
      </div>
    </div>
  `;

  content.innerHTML = html;

  // Auto-scroll to bottom
  content.scrollTop = content.scrollHeight;
}

// Display meeting summary after processing
function displayMeetingSummary(meeting, fromHistory = false) {
  currentMeeting = meeting;

  statusDot.classList.remove('recording', 'processing');
  statusText.textContent = 'Summary Complete';

  exportBtn.style.display = 'block';
  emailBtn.style.display = 'block';

  let html = '';

  // Add back button if viewing from history
  if (fromHistory) {
    html += `
      <div style="margin-bottom: 16px;">
        <button onclick="displayMeetingHistory()" style="
          padding: 8px 16px;
          background: #f1f5f9;
          color: #475569;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          ← Back to History
        </button>
      </div>
    `;
  }

  // Summary section
  if (meeting.summary) {
    html += `
      <div class="section">
        <h2>📋 Meeting Summary</h2>
        <div class="section-content">${escapeHtml(meeting.summary)}</div>
      </div>
    `;
  }

  // Key Points section
  if (meeting.keyPoints) {
    html += `
      <div class="section">
        <h2>🔑 Key Points</h2>
        <div class="section-content">${escapeHtml(meeting.keyPoints)}</div>
      </div>
    `;
  }

  // Action Items section
  if (meeting.actionItems) {
    html += `
      <div class="section">
        <h2>✅ Action Items</h2>
        <div class="section-content">${formatActionItems(meeting.actionItems)}</div>
      </div>
    `;
  }

  // Follow-up email section (if generated)
  if (meeting.followUpEmail) {
    html += `
      <div class="section">
        <h2>📧 Follow-up Email</h2>
        <div class="section-content">${escapeHtml(meeting.followUpEmail)}</div>
        <div class="export-buttons">
          <button class="export-btn" onclick="copyToClipboard('${escapeForJs(meeting.followUpEmail)}')">
            📋 Copy Email
          </button>
        </div>
      </div>
    `;
  }

  // Export buttons
  html += `
    <div class="section">
      <h2>💾 Export Options</h2>
      <div class="export-buttons">
        <button class="export-btn" onclick="window.exportAsMarkdown()">
          📄 Markdown
        </button>
        <button class="export-btn" onclick="window.exportAsText()">
          📝 Text
        </button>
        <button class="export-btn" onclick="window.copyAllToClipboard()">
          📋 Copy All
        </button>
      </div>
    </div>
  `;

  content.innerHTML = html;
}

// Format action items nicely
function formatActionItems(actionItemsText) {
  const lines = actionItemsText.split('\n');
  let formatted = '';

  lines.forEach(line => {
    if (line.trim()) {
      formatted += `<div class="action-item">${escapeHtml(line.trim())}</div>`;
    }
  });

  return formatted || escapeHtml(actionItemsText);
}

// Generate follow-up email
async function generateFollowUpEmail(meeting) {
  statusDot.classList.add('processing');
  statusText.textContent = 'Generating email...';
  emailBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateEmail',
      data: {
        summary: meeting.summary || '',
        actionItems: meeting.actionItems || ''
      }
    });

    if (response.success && response.email) {
      // Update meeting with email
      meeting.followUpEmail = response.email;
      chrome.storage.local.set({ latestMeeting: meeting });

      showNotification('Follow-up email generated!', 'success');
    } else {
      showNotification('Failed to generate email', 'error');
    }
  } catch (error) {
    console.error('Error generating email:', error);
    showNotification('Failed to generate email', 'error');
  } finally {
    statusDot.classList.remove('processing');
    statusText.textContent = 'Summary Complete';
    emailBtn.disabled = false;
  }
}

// Export meeting as Markdown
window.exportAsMarkdown = function() {
  if (!currentMeeting) return;

  const markdown = formatAsMarkdown(currentMeeting);
  downloadFile('meeting-notes.md', markdown, 'text/markdown');
  showNotification('Exported as Markdown!', 'success');
};

// Export meeting as Text
window.exportAsText = function() {
  if (!currentMeeting) return;

  const text = formatAsText(currentMeeting);
  downloadFile('meeting-notes.txt', text, 'text/plain');
  showNotification('Exported as Text!', 'success');
};

// Copy all to clipboard
window.copyAllToClipboard = function() {
  if (!currentMeeting) return;

  const text = formatAsText(currentMeeting);
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy', 'error');
  });
};

// Format meeting as Markdown
function formatAsMarkdown(meeting) {
  let md = '# Meeting Notes\n\n';
  md += `**Date:** ${new Date(meeting.timestamp).toLocaleString()}\n\n`;

  if (meeting.summary) {
    md += '## Summary\n\n';
    md += meeting.summary + '\n\n';
  }

  if (meeting.keyPoints) {
    md += '## Key Points\n\n';
    md += meeting.keyPoints + '\n\n';
  }

  if (meeting.actionItems) {
    md += '## Action Items\n\n';
    md += meeting.actionItems + '\n\n';
  }

  if (meeting.followUpEmail) {
    md += '## Follow-up Email\n\n';
    md += meeting.followUpEmail + '\n\n';
  }

  md += '\n---\n*Generated by MeetingMind*';

  return md;
}

// Format meeting as plain text
function formatAsText(meeting) {
  let text = 'MEETING NOTES\n';
  text += '='.repeat(50) + '\n\n';
  text += `Date: ${new Date(meeting.timestamp).toLocaleString()}\n\n`;

  if (meeting.summary) {
    text += 'SUMMARY\n';
    text += '-'.repeat(50) + '\n';
    text += meeting.summary + '\n\n';
  }

  if (meeting.keyPoints) {
    text += 'KEY POINTS\n';
    text += '-'.repeat(50) + '\n';
    text += meeting.keyPoints + '\n\n';
  }

  if (meeting.actionItems) {
    text += 'ACTION ITEMS\n';
    text += '-'.repeat(50) + '\n';
    text += meeting.actionItems + '\n\n';
  }

  if (meeting.followUpEmail) {
    text += 'FOLLOW-UP EMAIL\n';
    text += '-'.repeat(50) + '\n';
    text += meeting.followUpEmail + '\n\n';
  }

  text += '\nGenerated by MeetingMind';

  return text;
}

// Download file
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Copy to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy', 'error');
  });
}

// Show notification
function showNotification(message, type) {
  // Simple in-page notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#28a745' : '#dc3545'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    font-size: 13px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Escape for JavaScript string
function escapeForJs(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// Export functions
function exportMeeting(meeting) {
  // Show export options (already in UI)
  console.log('Export meeting:', meeting);
}

// Display meeting history
function displayMeetingHistory() {
  statusDot.classList.remove('recording', 'processing');
  statusText.textContent = 'Meeting History';

  exportBtn.style.display = 'none';
  emailBtn.style.display = 'none';

  chrome.storage.local.get(['meetingHistory'], (result) => {
    const history = result.meetingHistory || [];

    if (history.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-bottom: 16px;">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <p style="font-size: 16px; margin-bottom: 8px;">No Meeting History</p>
          <p style="font-size: 14px; opacity: 0.8;">Your completed meetings will appear here</p>
        </div>
      `;
      return;
    }

    let html = '<div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">';
    html += '<h2 style="font-size: 18px; font-weight: 600; color: #1e293b;">Past Meetings</h2>';
    html += `<button onclick="clearHistory()" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Clear All</button>`;
    html += '</div>';

    history.forEach((meeting, index) => {
      const date = new Date(meeting.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="history-item" onclick="viewMeeting(${index})" style="
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='#667eea'; this.style.transform='translateY(-2px)'"
           onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='translateY(0)'">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">
                ${meeting.platform || 'Meeting'} - ${dateStr}
              </div>
              <div style="font-size: 12px; color: #64748b;">
                ${timeStr} • ${meeting.meetingId ? 'ID: ' + meeting.meetingId.substring(0, 8) : ''}
              </div>
            </div>
            <span style="padding: 4px 8px; background: #f1f5f9; color: #475569; border-radius: 4px; font-size: 11px; font-weight: 500;">
              ${meeting.platform || 'Meeting'}
            </span>
          </div>
          <div style="font-size: 13px; color: #475569; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${meeting.summary ? meeting.summary.substring(0, 150) + '...' : 'No summary available'}
          </div>
        </div>
      `;
    });

    content.innerHTML = html;
  });
}

// View specific meeting from history
window.viewMeeting = function(index) {
  chrome.storage.local.get(['meetingHistory'], (result) => {
    const history = result.meetingHistory || [];
    if (history[index]) {
      displayMeetingSummary(history[index], true); // Pass true to show back button
    }
  });
};

// Clear all history
window.clearHistory = function() {
  if (confirm('Are you sure you want to clear all meeting history? This cannot be undone.')) {
    chrome.storage.local.set({ meetingHistory: [] });
    displayMeetingHistory();
    showNotification('History cleared', 'success');
  }
};
