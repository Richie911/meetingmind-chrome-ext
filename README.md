# MeetingMind

AI-powered meeting assistant that captures, transcribes, and summarizes your online meetings using Chrome's built-in AI.

## Features

- 🎙️ **Auto Caption Capture**: Automatically captures meeting captions from Google Meet, Zoom, and Microsoft Teams
- 📝 **Live Transcription**: Real-time transcript display during meetings
- 🤖 **AI Summaries**: Generates comprehensive meeting summaries using Chrome's Summarizer API
- ✅ **Action Item Extraction**: Identifies tasks and follow-ups using Chrome's Prompt API
- 📧 **Follow-up Emails**: Auto-generates professional follow-up emails using Chrome's Writer API
- 💾 **Export Options**: Save notes as Markdown, plain text, or copy to clipboard
- 🔒 **Privacy First**: All processing happens locally in your browser

## Requirements

- Chrome 138+ with built-in AI features enabled
- Captions must be enabled during meetings for best results

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `meetingmind` directory

## Usage

### During a Meeting

1. Join a meeting on Google Meet, Zoom, or Microsoft Teams
2. **Enable captions** in the meeting (important!)
3. Click the "Start AI Notes" button that appears in the meeting controls
4. The side panel will open showing live transcript
5. Click "Stop AI Notes" when meeting ends

### After a Meeting

1. AI automatically generates:
   - Meeting summary
   - Key points
   - Action items
2. Click "Generate Email" for a follow-up email draft
3. Export notes using the export buttons

## Supported Platforms

- ✅ Google Meet (meet.google.com)
- ✅ Zoom (zoom.us)
- ✅ Microsoft Teams (teams.microsoft.com)

## How It Works

1. **Caption Capture**: Extension monitors meeting captions in real-time
2. **Transcript Building**: Captions are collected and timestamped
3. **AI Processing**: When meeting ends, transcript is sent to Chrome's built-in AI
4. **Summary Generation**:
   - Summarizer API creates meeting overview and key points
   - Prompt API extracts action items and tasks
   - Writer API drafts follow-up email
5. **Export**: Results displayed in side panel with multiple export options

## Project Structure

```
meetingmind/
├── manifest.json       # Extension configuration
├── background.js       # Service worker for AI API calls
├── content.js          # Meeting platform integration
├── popup.html/js       # Extension popup UI
├── sidebar.html/js     # Side panel for notes
├── styles.css          # Injected styles
└── icons/              # Extension icons
```

## Technologies Used

- Chrome Extension Manifest V3
- Chrome's Prompt API (Gemini Nano)
- Chrome's Summarizer API
- Chrome's Writer API
- Tab Capture API
- Vanilla JavaScript

## Hackathon Submission

Built for the Google Chrome AI Hackathon 2025.

**Categories:**
- Most Helpful Chrome Extension
- Best Hybrid AI Application

**Key Differentiators:**
- Combines 3 Chrome AI APIs (Prompt, Summarizer, Writer)
- Solves universal business problem (meeting productivity)
- Privacy-focused (all processing on-device)
- Multi-platform support
- Complete workflow (capture → summarize → export)

## Limitations

- Requires captions to be enabled in meetings
- Caption quality depends on meeting platform
- AI model performance varies by device capabilities
- Some platforms may update their UI, requiring extension updates

## Future Enhancements

- [ ] Support for more platforms (Webex, GoToMeeting)
- [ ] Translator API for multilingual meetings
- [ ] Meeting history and search
- [ ] Calendar integration
- [ ] Custom summary templates
- [ ] Team collaboration features
- [ ] Audio recording and transcription (when available)

## Privacy & Security

- All AI processing happens locally in Chrome
- No data sent to external servers
- Meeting transcripts stored locally in browser storage
- No accounts or sign-ups required

## Troubleshooting

**Captions not being captured?**
- Ensure captions are enabled in the meeting
- Check that you're on a supported platform
- Try refreshing the page and rejoining

**AI features not working?**
- Verify you're using Chrome 138+
- Check AI API status in extension popup
- Some features may require model download on first use

**Button not appearing?**
- Wait a few seconds for page to fully load
- Refresh the meeting page
- Check browser console for errors

## License

MIT License

## Contributing

Contributions welcome! Please open an issue or PR.

---

🤖 Powered by Chrome's Built-in AI

**Demo Video**: [Coming Soon]

**Submission**: Google Chrome AI Hackathon 2025
