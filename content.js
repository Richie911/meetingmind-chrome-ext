// Content script for meeting platforms
console.log('MeetingMind content script loaded');

let isCapturing = false;
let captureButton = null;
let transcriptObserver = null;
let capturedCaptions = []; // Array of {text, speaker, timestamp} objects

// Detect platform
const platform = detectPlatform();
console.log('Platform detected:', platform);

// Initialize
function init() {
  if (platform) {
    console.log('Meeting platform detected, initializing MeetingMind');
    checkAIAvailability();
    injectCaptureButton();
    setupCaptionCapture();
  }
}

// Detect which meeting platform we're on
function detectPlatform() {
  const hostname = window.location.hostname;

  if (hostname.includes('meet.google.com')) {
    return 'google-meet';
  } else if (hostname.includes('zoom.us')) {
    return 'zoom';
  } else if (hostname.includes('teams.microsoft.com')) {
    return 'teams';
  }

  return null;
}

// Check AI availability
async function checkAIAvailability() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAIAvailability' });
    console.log('AI API availability:', response);

    if (!response.ready) {
      showNotification('MeetingMind requires Chrome 138+ with AI features enabled', 'warning');
    }
  } catch (error) {
    console.error('Error checking AI availability:', error);
  }
}

// Inject capture button
function injectCaptureButton() {
  // Find appropriate location based on platform
  let targetElement;

  if (platform === 'google-meet') {
    // Google Meet: bottom control bar
    targetElement = document.querySelector('[data-call-controls-bottom-bar]') ||
                   document.querySelector('[jscontroller][jsname]');
  } else if (platform === 'zoom') {
    // Zoom: footer controls
    targetElement = document.querySelector('.footer__inner') ||
                   document.querySelector('.meeting-client-controls');
  } else if (platform === 'teams') {
    // Teams: calling controls
    targetElement = document.querySelector('[data-tid="callingControls"]') ||
                   document.querySelector('.ts-calling-screen');
  }

  if (!targetElement) {
    console.warn('Could not find target element for capture button');
    setTimeout(injectCaptureButton, 2000);
    return;
  }

  // Check if button already exists
  if (document.getElementById('meetingmind-button')) {
    return;
  }

  // Create button
  captureButton = document.createElement('button');
  captureButton.id = 'meetingmind-button';
  captureButton.className = 'meetingmind-capture-btn';
  captureButton.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
    </svg>
    <span>Start AI Notes</span>
  `;

  captureButton.addEventListener('click', handleCaptureClick);

  // Insert button
  if (platform === 'google-meet') {
    targetElement.appendChild(captureButton);
  } else {
    targetElement.insertBefore(captureButton, targetElement.firstChild);
  }

  console.log('Capture button injected');
}

// Handle capture button click
async function handleCaptureClick() {
  if (!isCapturing) {
    await startCapture();
  } else {
    await stopCapture();
  }
}

// Start capturing meeting
async function startCapture() {
  try {
    console.log('=== START CAPTURE INITIATED ===');
    console.log('Platform:', platform);
    console.log('Current URL:', window.location.href);
    updateButtonState('starting');

    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated. Please refresh the page.');
    }

    // Request capture permission
    const response = await chrome.runtime.sendMessage({ action: 'startCapture' });
    console.log('Start capture response:', response);

    if (response && response.success) {
      isCapturing = true;
      updateButtonState('capturing');
      capturedCaptions = [];

      console.log('Capture started successfully. Listening for captions...');

      // Open side panel for live notes
      try {
        await chrome.runtime.sendMessage({ action: 'openSidePanel' });
      } catch (e) {
        // Silent fail for side panel open
        console.log('Side panel open failed (may not be supported):', e);
      }

      showNotification('AI Notes started - captions are being captured', 'success');
    } else {
      showNotification(`Failed to start: ${response?.error || 'Unknown error'}`, 'error');
      updateButtonState('idle');
    }
  } catch (error) {
    console.error('Error starting capture:', error);

    // Check for context invalidation
    if (error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh this page and try again.', 'error');
    } else {
      showNotification('Failed to start capture. Try refreshing the page.', 'error');
    }

    updateButtonState('idle');
  }
}

// Stop capturing meeting
async function stopCapture() {
  try {
    console.log('=== STOP CAPTURE INITIATED ===');
    console.log('Total captions captured:', capturedCaptions.length);
    console.log('Sample captions:', capturedCaptions.slice(0, 3));
    updateButtonState('stopping');

    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated. Please refresh the page.');
    }

    const response = await chrome.runtime.sendMessage({ action: 'stopCapture' });
    console.log('Stop capture response:', response);

    if (response && response.success) {
      isCapturing = false;
      updateButtonState('idle');

      showNotification('Processing meeting notes...', 'info');

      // Generate summary
      await generateMeetingSummary();
    } else {
      showNotification('Failed to stop capture', 'error');
      updateButtonState('idle');
    }
  } catch (error) {
    console.error('Error stopping capture:', error);

    // Check for context invalidation
    if (error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh this page.', 'error');
    } else {
      showNotification('Failed to stop capture', 'error');
    }

    updateButtonState('idle');
  }
}

// Setup caption/transcript capture
function setupCaptionCapture() {
  let captionSelectors = [];

  if (platform === 'google-meet') {
    // Multiple fallback selectors for Google Meet (they change frequently)
    captionSelectors = [
      '[jsname="tgaKEf"]',                    // Current primary selector
      '.a4cQT',                                // Alternative class
      '[class*="caption"]',                    // Any element with caption in class
      '[aria-label*="captions" i]',           // Accessibility label
      '[data-auto-gen-transcript-caption]',   // Auto-generated transcript
      '.iOzk7'                                 // Another known caption class
    ];
  } else if (platform === 'zoom') {
    captionSelectors = [
      '.caption__transcript-item',
      '[data-qa="caption-item"]',
      '.caption-line',
      '[class*="caption"]'
    ];
  } else if (platform === 'teams') {
    captionSelectors = [
      '[data-tid="closed-captions-v2-text"]',
      '[data-tid="closed-captions-text"]',
      '[class*="closedCaption"]',
      '[class*="caption"]'
    ];
  }

  if (captionSelectors.length === 0) {
    console.warn('No caption selectors configured for platform:', platform);
    return;
  }

  // Observe for caption elements
  transcriptObserver = new MutationObserver((mutations) => {
    if (!isCapturing) return;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          let captionElement = null;

          // Try each selector until we find a match
          for (const selector of captionSelectors) {
            try {
              captionElement = node.matches(selector) ? node : node.querySelector(selector);
              if (captionElement) {
                break; // Found a match, stop searching
              }
            } catch (e) {
              // Invalid selector, skip to next one
              continue;
            }
          }

          if (captionElement) {
            const text = captionElement.textContent.trim();
            const speaker = extractSpeaker(captionElement);

            // Check if this text was already captured (avoid duplicates)
            const isDuplicate = capturedCaptions.some(caption => caption.text === text);

            if (text && !isDuplicate && text.length > 2) { // Ignore very short text
              const captionData = {
                text: text,
                speaker: speaker,
                timestamp: Date.now()
              };

              capturedCaptions.push(captionData);

              console.log(`Captured caption (${capturedCaptions.length}):`, text.substring(0, 50));

              // Send to background for processing
              chrome.runtime.sendMessage({
                action: 'processTranscript',
                data: {
                  text: text,
                  speaker: speaker,
                  timestamp: Date.now()
                }
              }).catch(err => {
                console.warn('Failed to send transcript to background:', err);
              });

              // Update sidebar - store as plain text array for display
              chrome.storage.local.set({
                liveTranscript: capturedCaptions.map(c => c.text)
              });
            }
          }
        }
      });
    });
  });

  // Start observing
  transcriptObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('Caption capture setup complete with selectors:', captionSelectors);

  // Diagnostic: Check if captions are currently visible
  setTimeout(() => {
    const foundCaptions = checkForCaptions(captionSelectors);
    if (!foundCaptions && isCapturing) {
      console.warn('No captions detected on page. Make sure captions are enabled in your meeting.');
      showNotification('No captions detected. Please enable captions in your meeting settings.', 'warning');
    }
  }, 5000); // Check after 5 seconds
}

// Diagnostic function to check if captions exist on the page
function checkForCaptions(selectors) {
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} caption elements with selector: ${selector}`);
        return true;
      }
    } catch (e) {
      continue;
    }
  }
  return false;
}

// Extract speaker name from caption element
function extractSpeaker(element) {
  if (platform === 'google-meet') {
    const speakerEl = element.closest('[data-participant-name]');
    return speakerEl?.getAttribute('data-participant-name') || 'Unknown';
  } else if (platform === 'zoom') {
    const speakerEl = element.querySelector('.caption__name');
    return speakerEl?.textContent.trim() || 'Unknown';
  } else if (platform === 'teams') {
    return 'Participant'; // Teams doesn't always show speaker names in captions
  }
  return 'Unknown';
}

// Generate meeting summary
async function generateMeetingSummary() {
  try {
    // Check if we captured any captions
    if (capturedCaptions.length === 0) {
      showNotification('No captions were captured. Please enable captions in your meeting and try again.', 'error');
      console.error('No captions captured. Captured array is empty.');
      return;
    }

    console.log(`Generating summary with ${capturedCaptions.length} captured captions`);

    const response = await chrome.runtime.sendMessage({
      action: 'generateSummary',
      data: {
        platform: platform
      }
    });

    if (response.success) {
      const meeting = {
        ...response.results,
        meetingId: response.meetingId,
        platform: platform,
        timestamp: Date.now()
      };

      // Store latest meeting
      chrome.storage.local.set({ latestMeeting: meeting });

      // Save to meeting history
      chrome.storage.local.get(['meetingHistory'], (result) => {
        const history = result.meetingHistory || [];
        history.unshift(meeting); // Add to beginning

        // Keep only last 50 meetings
        if (history.length > 50) {
          history.pop();
        }

        chrome.storage.local.set({ meetingHistory: history });
      });

      showNotification('Meeting summary ready! Check the side panel', 'success');
    } else {
      const errorMessage = response.error || 'Failed to generate summary';
      showNotification(errorMessage, 'error');
      console.error('Summary generation failed:', errorMessage);
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    showNotification(`Failed to generate summary: ${error.message}`, 'error');
  }
}

// Update button state
function updateButtonState(state) {
  if (!captureButton) return;

  const span = captureButton.querySelector('span');
  const svg = captureButton.querySelector('svg circle:last-child');

  switch (state) {
    case 'idle':
      span.textContent = 'Start AI Notes';
      captureButton.classList.remove('capturing', 'processing');
      captureButton.disabled = false;
      break;

    case 'starting':
      span.textContent = 'Starting...';
      captureButton.disabled = true;
      break;

    case 'capturing':
      span.textContent = 'Stop AI Notes';
      captureButton.classList.add('capturing');
      captureButton.disabled = false;
      break;

    case 'stopping':
      span.textContent = 'Stopping...';
      captureButton.disabled = true;
      break;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `meetingmind-notification meetingmind-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 999999;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 300px;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureStarted') {
    console.log('Capture started notification received');
  }

  if (request.action === 'captureStopped') {
    console.log('Capture stopped notification received');
  }
});

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-initialize on navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 2000);
  }
}).observe(document, { subtree: true, childList: true });
