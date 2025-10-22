// Service worker for MeetingMind

let activeCaptures = new Map(); // tabId -> { stream, transcript, startTime }
let meetingSummaries = new Map(); // meetingId -> summary data

// Keep service worker alive
let keepAliveInterval;

function startKeepAlive() {
  // Clear any existing interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // Keep service worker alive by doing a lightweight task every 20 seconds
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get('keepalive', () => {
      // This just prevents the service worker from being terminated
    });
  }, 20000);
}

// Start keep-alive on load
startKeepAlive();

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  startKeepAlive();
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startCapture') {
    handleStartCapture(sender.tab.id, sendResponse);
    return true;
  }

  if (request.action === 'stopCapture') {
    handleStopCapture(sender.tab.id, sendResponse);
    return true;
  }

  if (request.action === 'processTranscript') {
    handleProcessTranscript(sender.tab.id, request.data, sendResponse);
    return true;
  }

  if (request.action === 'generateSummary') {
    handleGenerateSummary(sender.tab.id, request.data, sendResponse);
    return true;
  }

  if (request.action === 'generateEmail') {
    handleGenerateEmail(request.data, sendResponse);
    return true;
  }

  if (request.action === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
  }

  if (request.action === 'checkAIAvailability') {
    checkAIAPIs().then(sendResponse);
    return true;
  }

  if (request.action === 'getCaptureStatus') {
    const status = activeCaptures.has(sender.tab.id);
    sendResponse({ isCapturing: status });
  }
});

// Start capturing meeting
async function handleStartCapture(tabId, sendResponse) {
  try {
    // Check if already capturing
    if (activeCaptures.has(tabId)) {
      sendResponse({ success: false, error: 'Already capturing this tab' });
      return;
    }

    // Store capture info (no audio stream needed - we capture captions from DOM)
    activeCaptures.set(tabId, {
      transcript: [],
      startTime: Date.now()
    });

    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Stop capturing meeting
async function handleStopCapture(tabId, sendResponse) {
  try {
    const capture = activeCaptures.get(tabId);
    if (!capture) {
      sendResponse({ success: false, error: 'No active capture found' });
      return;
    }

    // Get transcript data
    const transcriptData = {
      transcript: capture.transcript,
      duration: Date.now() - capture.startTime,
      endTime: Date.now()
    };

    // Remove from active captures
    activeCaptures.delete(tabId);

    sendResponse({ success: true, data: transcriptData });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Process transcript with AI
async function handleProcessTranscript(tabId, data, sendResponse) {
  try {
    // Store transcript line in background
    if (activeCaptures.has(tabId)) {
      activeCaptures.get(tabId).transcript.push({
        text: data.text,
        timestamp: data.timestamp,
        speaker: data.speaker
      });
      console.log(`Transcript stored for tab ${tabId}:`, data.text.substring(0, 50));
    } else {
      console.warn(`No active capture for tab ${tabId}`);
    }

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Generate meeting summary using Summarizer API
async function handleGenerateSummary(tabId, data, sendResponse) {
  try {
    const results = {
      summary: null,
      keyPoints: null,
      actionItems: null,
      error: null
    };

    // Get transcript from activeCaptures (the source of truth)
    const capture = activeCaptures.get(tabId);
    const transcript = capture ? capture.transcript : data.transcript;

    console.log('Generating summary for tabId:', tabId);
    console.log('Transcript length:', transcript ? transcript.length : 0);
    console.log('First few entries:', transcript ? transcript.slice(0, 3) : []);

    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript data available');
    }

    // Check if AI APIs are available (try both patterns)
    const hasAI = typeof ai !== 'undefined';
    const hasLanguageModel = typeof LanguageModel !== 'undefined';
    const hasSummarizer = typeof Summarizer !== 'undefined';

    if (!hasAI && !hasLanguageModel && !hasSummarizer) {
      throw new Error('Chrome AI APIs not available. Please enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
    }

    // Use global APIs if available, fallback to ai namespace
    const summarizerAPI = hasSummarizer ? Summarizer : (hasAI ? ai.summarizer : null);
    const languageModelAPI = hasLanguageModel ? LanguageModel : (hasAI ? ai.languageModel : null);

    // Check Summarizer API availability
    const summarizerAvailability = summarizerAPI ? await summarizerAPI.availability() : 'unavailable';

    if (summarizerAvailability === 'available' || summarizerAvailability === 'downloadable') {
      // Create summarizer for meeting overview
      const summarizer = await summarizerAPI.create({
        type: 'key-points',
        format: 'markdown',
        length: 'medium'
      });

      const meetingText = formatTranscriptForSummary(transcript);
      results.summary = await summarizer.summarize(meetingText);
      summarizer.destroy();

      // Create another summarizer for key points
      const keyPointsSummarizer = await summarizerAPI.create({
        type: 'key-points',
        format: 'markdown',
        length: 'short'
      });

      results.keyPoints = await keyPointsSummarizer.summarize(meetingText);
      keyPointsSummarizer.destroy();
    }

    // Use Prompt API to extract action items
    const promptAvailability = languageModelAPI ? await languageModelAPI.availability() : 'unavailable';
    if (promptAvailability === 'available' || promptAvailability === 'downloadable') {
      const session = await languageModelAPI.create();

      const actionPrompt = `Extract action items from this meeting transcript:

${formatTranscriptForSummary(transcript)}

List all action items, tasks, and follow-ups mentioned. Format as a bulleted list with:
- What needs to be done
- Who is responsible (if mentioned)
- Deadline (if mentioned)`;

      results.actionItems = await session.prompt(actionPrompt);
      session.destroy();
    }

    // Store summary
    const meetingId = `meeting_${Date.now()}`;
    meetingSummaries.set(meetingId, {
      ...results,
      transcript: transcript,
      createdAt: Date.now()
    });

    sendResponse({ success: true, results, meetingId });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Generate follow-up email using Writer API
async function handleGenerateEmail(data, sendResponse) {
  try {
    let email = null;

    // Check if AI APIs are available (try both patterns)
    const hasAI = typeof ai !== 'undefined';
    const hasWriter = typeof Writer !== 'undefined';
    const hasLanguageModel = typeof LanguageModel !== 'undefined';

    if (!hasAI && !hasWriter && !hasLanguageModel) {
      throw new Error('Chrome AI APIs not available. Please enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input');
    }

    // Use global APIs if available, fallback to ai namespace
    const writerAPI = hasWriter ? Writer : (hasAI ? ai.writer : null);
    const languageModelAPI = hasLanguageModel ? LanguageModel : (hasAI ? ai.languageModel : null);

    // Check Writer API availability
    const writerAvailability = writerAPI ? await writerAPI.availability() : 'unavailable';

    if (writerAvailability === 'available' || writerAvailability === 'downloadable') {
      const writer = await writerAPI.create({
        tone: 'formal',
        format: 'plain-text',
        length: 'medium'
      });

      const context = `Meeting summary: ${data.summary}\n\nAction items: ${data.actionItems}`;
      email = await writer.write(
        'Write a professional follow-up email thanking attendees and outlining action items',
        { context }
      );

      writer.destroy();
    } else {
      // Fallback to Prompt API
      const promptAvailability = languageModelAPI ? await languageModelAPI.availability() : 'unavailable';
      if (promptAvailability === 'available' || promptAvailability === 'downloadable') {
        const session = await languageModelAPI.create();

        const emailPrompt = `Write a professional follow-up email for a meeting with this summary:

Summary: ${data.summary}

Action Items: ${data.actionItems}

The email should:
- Thank attendees
- Briefly recap key points
- List action items clearly
- Be professional and concise`;

        email = await session.prompt(emailPrompt);
        session.destroy();
      }
    }

    sendResponse({ success: true, email });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Format transcript for AI processing
function formatTranscriptForSummary(transcript) {
  if (Array.isArray(transcript)) {
    return transcript.map(entry => {
      const speaker = entry.speaker || 'Speaker';
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
      return `[${time}] ${speaker}: ${entry.text}`;
    }).join('\n');
  }
  return transcript.toString();
}

// Check AI API availability
async function checkAIAPIs() {
  try {
    // Check if AI APIs are available (try both patterns)
    const hasAI = typeof ai !== 'undefined';
    const hasLanguageModel = typeof LanguageModel !== 'undefined';
    const hasSummarizer = typeof Summarizer !== 'undefined';
    const hasWriter = typeof Writer !== 'undefined';

    if (!hasAI && !hasLanguageModel && !hasSummarizer && !hasWriter) {
      return {
        promptAPI: 'unavailable',
        summarizerAPI: 'unavailable',
        writerAPI: 'unavailable',
        ready: false,
        error: 'Chrome AI APIs not available. Please enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input and relaunch Chrome.'
      };
    }

    // Use global APIs if available, fallback to ai namespace
    const languageModelAPI = hasLanguageModel ? LanguageModel : (hasAI ? ai.languageModel : null);
    const summarizerAPI = hasSummarizer ? Summarizer : (hasAI ? ai.summarizer : null);
    const writerAPI = hasWriter ? Writer : (hasAI ? ai.writer : null);

    const [promptAvailable, summarizerAvailable, writerAvailable] = await Promise.all([
      languageModelAPI ? languageModelAPI.availability().catch(() => 'unavailable') : 'unavailable',
      summarizerAPI ? summarizerAPI.availability().catch(() => 'unavailable') : 'unavailable',
      writerAPI ? writerAPI.availability().catch(() => 'unavailable') : 'unavailable'
    ]);

    return {
      promptAPI: promptAvailable,
      summarizerAPI: summarizerAvailable,
      writerAPI: writerAvailable,
      ready: promptAvailable === 'available' || summarizerAvailable === 'available' || writerAvailable === 'available' ||
             promptAvailable === 'downloadable' || summarizerAvailable === 'downloadable' || writerAvailable === 'downloadable',
      downloading: promptAvailable === 'downloading' || summarizerAvailable === 'downloading' || writerAvailable === 'downloading'
    };
  } catch (error) {
    return {
      promptAPI: 'unavailable',
      summarizerAPI: 'unavailable',
      writerAPI: 'unavailable',
      ready: false,
      error: error.message
    };
  }
}

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeCaptures.has(tabId)) {
    const capture = activeCaptures.get(tabId);
    if (capture.stream) {
      capture.stream.getTracks().forEach(track => track.stop());
    }
    activeCaptures.delete(tabId);
  }
});
