# ClipTrace

A cross-browser extension that intelligently manages your copy operations while browsing. Automatically saves copied content with source information, supports history management and smart jump-to-highlight.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- 🔄 **Auto Capture** - Listens for copy events and automatically saves text content
- 🔗 **Source Tracking** - Records page URL, title, and timestamp
- 📋 **Sidebar Management** - Convenient history viewing and search
- 🎯 **Smart Highlight** - Click a record to jump to the original page and highlight
- 🔒 **Privacy Protection** - Auto-filters sensitive information, supports incognito mode
- 📊 **Group by Date** - Clear timeline display
- 🚫 **Website Blacklist** - Exclude specific websites
- 💾 **Data Import/Export** - Backup and migrate data

## 🚀 Installation

### Chrome / Edge Browser

1. Download or clone this repository
2. Open the browser and go to `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
3. Enable **"Developer mode"** in the upper right corner
4. Click **"Load unpacked"**
5. Select the `smart-clipboard` folder
6. Done! Click the toolbar icon to use

## 📖 Usage

### Basic Usage

1. Copy text on any webpage (Ctrl+C / Cmd+C)
2. Click the extension icon in the browser toolbar to open the sidebar
3. View all copy history, with search and filter support
4. Click **"Open & Highlight"** to jump to the original page and highlight

### Settings

Click the ⚙️ button in the upper right corner of the sidebar to open settings:

- **Incognito Mode**: Pause recording all copy operations
- **Website Blacklist**: Add website domains you don't want to record
- **Data Export/Import**: Backup or restore history

## 📁 Project Structure

```
smart-clipboard/
├── manifest.json          # Extension manifest
├── background/            # Background service
│   └── service-worker.js
├── content/               # Content script
│   └── content-script.js
├── sidebar/               # Sidebar UI
│   ├── sidebar.html
│   ├── sidebar.css
│   └── sidebar.js
├── utils/                 # Utility functions
│   ├── storage.js
│   └── common.js
└── icons/                 # Icon assets
```

## 🔐 Privacy

- All data is stored locally in the browser only
- No data is uploaded to any server
- Auto-filters sensitive sites and information (passwords, credit cards, etc.)
- Open source and auditable

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/your-username/smart-clipboard.git

# Load the development version in Chrome
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project directory
```

## 📝 Changelog

### v1.0.0
- Initial release
- Core features: copy monitoring, history management, highlight navigation
- Settings panel: incognito mode, website blacklist, data import/export

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**ClipTrace** - Make copying smarter 📋✨
