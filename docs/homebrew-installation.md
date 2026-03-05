# Homebrew Installation (macOS)

## Prerequisites

- [Homebrew](https://brew.sh/) installed on your Mac

## Install

```bash
brew tap pratik1235/burnrate
brew install burnrate
```

This installs Burnrate along with all its dependencies (Python, Node.js for building, qpdf). The install takes a couple of minutes as it builds the frontend and installs Python packages.

## Usage

### Start the app

```bash
burnrate
```

Then open http://localhost:8000 in your browser.

### Run as a background service

```bash
brew services start burnrate
```

Burnrate will start automatically on login and run in the background. Logs are written to:
- `$(brew --prefix)/var/log/burnrate.log`
- `$(brew --prefix)/var/log/burnrate-error.log`

### Manage the service

```bash
brew services stop burnrate       # Stop the background service
brew services restart burnrate    # Restart
brew services list                # Check service status
```

## Data Storage

All your data (database, uploaded statements) is stored at:

```
$(brew --prefix)/var/burnrate/
```

This directory is preserved across upgrades and reinstalls.

## Upgrade

```bash
brew update
brew upgrade burnrate
```

Your data is preserved across upgrades.

## Uninstall

```bash
brew services stop burnrate       # Stop the service if running
brew uninstall burnrate
brew untap pratik1235/burnrate

# Optionally remove your data:
rm -rf $(brew --prefix)/var/burnrate
```

## Troubleshooting

### Port already in use

Pass a different port:

```bash
burnrate --port 9000
```

### Reinstalling from scratch

```bash
brew uninstall burnrate
brew install burnrate
```

### Checking logs

If the service doesn't start, check the logs:

```bash
cat $(brew --prefix)/var/log/burnrate-error.log
```
