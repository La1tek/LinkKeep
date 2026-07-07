# LinkKeep Browser Extension v2.4

A Chrome extension for quick link saving and bookmark sync with your self-hosted LinkKeep instance.

## Features

- 🎨 **Dark UI** matching LinkKeep's glassmorphism design
- 📝 **Notes** — add a quick note when saving
- 🔗 **Metadata auto-fetch** — gets title, description from page
- 🌐 **Favicon preview** — shows site icon
- ⌨️ **Keyboard shortcuts** — Ctrl+Enter to save, Esc to close
- ⚙️ **Settings page** — configure behavior, disconnect
- 🔄 **Bookmark sync** — optional two-way sync with a dedicated `LinkKeep` bookmarks folder

## Installation (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `extension/` folder

## First Use

1. Click the LinkKeep icon in your toolbar
2. Enter your LinkKeep server URL (e.g. `http://your-server:9091`)
3. Enter your username and password
4. Click **Connect**
5. You're ready to save links!

## Configuration

- **Bookmark Sync**: Creates and syncs a dedicated browser bookmarks folder named `LinkKeep`
- **Auto-fetch metadata**: Automatically fetches page title and description when saving

## Screenshots

The extension shows:
- Page title, URL and favicon preview
- Editable title field
- Optional note field
- Save button + quick actions

## Building from LinkKeep server

The extension files are served from the LinkKeep app. You can also download them:

```
http://your-linkkeep-server/extension/
```
