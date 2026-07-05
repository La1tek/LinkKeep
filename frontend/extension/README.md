# LinkKeep Browser Extension v2.0

A polished Chrome/Firefox extension for quick link saving to your self-hosted LinkKeep instance.

## Features

- 🎨 **Dark UI** matching LinkKeep's glassmorphism design
- 📁 **Folder selection** with tree view (supports subfolders)
- 🏷️ **Tag input** with keyboard support (Enter to add, Backspace to remove)
- 💡 **Suggested tags** — based on your existing tags + domain name
- 📝 **Notes** — add a quick note when saving
- ⚡ **Quick Save mode** — one-click save without form (configurable)
- 🔗 **Metadata auto-fetch** — gets title, description from page
- 🌐 **Favicon preview** — shows site icon
- ⌨️ **Keyboard shortcuts** — Ctrl+Enter to save, Esc to close
- ⚙️ **Settings page** — configure behavior, disconnect

## Installation (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `extension/` folder

## Installation (Firefox)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from this folder

> ⚠️ Firefox temporary add-ons are removed on browser restart. Use web-ext to build a signed version for permanent installation.

## First Use

1. Click the LinkKeep icon in your toolbar
2. Enter your LinkKeep server URL (e.g. `http://your-server:9091`)
3. Enter your username and password
4. Click **Connect**
5. You're ready to save links!

## Configuration

- **Quick Save mode**: When enabled, links are saved immediately on popup open without showing the form
- **Auto-fetch metadata**: Automatically fetches page title and description (enabled by default)

## Screenshots

The extension shows:
- Page title, URL and favicon preview
- Editable title field
- Folder tree with color-coded folders and subfolders
- Tag input with suggestions
- Optional note field
- Save button + quick actions

## Building from LinkKeep server

The extension files are served from the LinkKeep app. You can also download them:

```
http://your-linkkeep-server/extension/
```
