# Release v0.4.0

This release introduces major new features including LLM-powered insights, manual transaction categorization, and significant improvements to our parsing engine.

## What's New

### 🤖 LLM Insights & Cloud Providers
- **Cloud LLM Providers**: Added support for Anthropic, OpenAI, and AWS Bedrock.
- **Secure Keychain Storage**: Implemented secure OS keychain credential management for LLM API keys.
- **Insights & Reminders**: Added LLM-powered insights and built-in payment reminders.

### 🏷️ Manual Categorization
- **Inline Editing**: Added support for manual categorization of transactions with inline category editing in the UI.
- **Persistent Categories**: Manual categories are now accurately preserved during statement reparsing or password unlocks.
- **Customization**: Introduced modal prompts in Customization settings to clarify manual category preservation intent.

### 🏦 Parsing Engine & Banks
- **Negative Total Dues**: Updated the parsing engine across all supported banks (HDFC, ICICI, Axis, IDFC, Indian Bank, Federal) to accurately extract and represent negative / credit Total Amount Due balances.
- **Federal Scapia**: Added a new parser to correctly detect and parse Federal Scapia statements.
- **Card Variant Detection**: Added card variant detection to all bank statement parsers to auto-name cards.
- **CC Payments**: Added credit card payment category keywords in parsers for better auto-categorization.

### 📊 UI & Analytics Enhancements
- **Statement Scoped Filters**: Added statement scoped filters across analytics and transactions.
- **Sorting & Pagination**: Improved statements and transactions pagination, sorting, and filtering in the UI.
- **Precise Targeting**: Implemented statement row pointer-events toggling for precise click targeting.
- **Offers & Milestones**: Added built-in offers and milestones tracking.

### 🛠️ Fixes & Improvements
- Added a unique index to prevent duplicate statement imports.
- Implemented a secure endpoint to open statement files locally.
- Minor UI and tag fixes.