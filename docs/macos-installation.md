# macOS Native App Installation

## Download

Download `Burnrate_<version>_aarch64.dmg` from the [latest GitHub release](https://github.com/pratik1235/burnrate/releases/latest).

## Install

1. Open the downloaded `.dmg` file
2. Drag **Burnrate** into the **Applications** folder
3. Eject the DMG

## First Launch

Since the app is not signed with an Apple Developer ID, macOS Gatekeeper will block it on first launch.

**To bypass Gatekeeper:**

1. Right-click (or Control-click) on **Burnrate** in Applications
2. Select **Open** from the context menu
3. Click **Open** in the confirmation dialog

You only need to do this once. Subsequent launches work normally.

Alternatively, run this in Terminal:

```bash
xattr -cr /Applications/Burnrate.app
```

## Usage

1. Launch **Burnrate** from Applications (or Spotlight)
2. The app starts a local server and opens a native window
3. Complete the setup wizard on first run
4. Upload your credit card statement PDFs or set up a watch folder

## Data Storage

Your data is stored in:

```
~/Library/Application Support/burnrate/
```

This includes the SQLite database and any uploaded statement files.

## Updating

1. Download the new `.dmg` from [GitHub Releases](https://github.com/pratik1235/burnrate/releases/latest)
2. Open the DMG and drag the new **Burnrate** to Applications, replacing the old version
3. Your data is preserved — it's stored separately from the app

## Uninstall

1. Drag **Burnrate** from Applications to Trash
2. Optionally remove your data:

```bash
rm -rf ~/Library/Application\ Support/burnrate
```

## Troubleshooting

### "Burnrate is damaged and can't be opened"

Run in Terminal:

```bash
xattr -cr /Applications/Burnrate.app
```

### Server doesn't start

Run from Terminal to see logs:

```bash
/Applications/Burnrate.app/Contents/MacOS/Burnrate
```

### Port conflict

The app uses port 8000. If it's in use, set a different port before launching:

```bash
BURNRATE_PORT=8080 open /Applications/Burnrate.app
```
