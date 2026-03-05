# Windows Installation

## Download

Download `Burnrate-Setup.exe` from the [latest GitHub release](https://github.com/pratik1235/burnrate/releases/latest).

## Install

1. Run `Burnrate-Setup.exe`
2. Follow the installer prompts
3. Choose installation directory (defaults to `Program Files`)
4. Optionally create a desktop shortcut

No admin privileges are required — the installer uses per-user installation by default.

## Windows SmartScreen

Since the installer is not code-signed, Windows Defender SmartScreen will show a warning:

> "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."

**To proceed:**

1. Click **More info**
2. Click **Run anyway**

This is a one-time warning.

## Usage

1. Launch **Burnrate** from the Start Menu or desktop shortcut
2. A terminal window opens with the server running
3. Your default browser opens to http://localhost:8000
4. Complete the setup wizard on first run
5. Upload your credit card statement PDFs or set up a watch folder

## Data Storage

Your data is stored in:

```
%LOCALAPPDATA%\burnrate\Data\
```

This includes the SQLite database and any uploaded statement files.

## Updating

1. Download the new `Burnrate-Setup.exe` from [GitHub Releases](https://github.com/pratik1235/burnrate/releases/latest)
2. Run the installer — it will update in place
3. Your data is preserved

## Uninstall

1. Open **Settings** → **Apps** → **Installed apps**
2. Find **Burnrate** and click **Uninstall**
3. Optionally remove your data by deleting `%LOCALAPPDATA%\burnrate`

## Troubleshooting

### Port already in use

Set a different port before launching:

```cmd
set BURNRATE_PORT=8080
Burnrate.exe
```

### Missing DLLs

If the app fails with missing DLL errors, install the [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).

### Antivirus false positive

PyInstaller executables are occasionally flagged by antivirus software. Add an exception for `Burnrate.exe` in your antivirus settings if this happens.
