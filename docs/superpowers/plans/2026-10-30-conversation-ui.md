# Conversation UI 0.8.0

User-approved direction: prioritize conversation and composer; move persistent utilities into a menu; keep one task card per request, collapse past steps, preserve explicit action confirmation and all safety checks.

- [x] Add browser regressions for a quiet start, accessible tools menu/dialog, multiline Enter/Shift+Enter, no classifier narration, and one task card with no synthetic user messages across continuation.
- [x] Update panel, preview and web shells with a compact header and growing textarea. Keep web/manual constraints explicit.
- [x] Move utilities to a dismissible menu/dialog, show three start suggestions, and hide technical evidence behind disclosure.
- [x] Keep continuation in its originating task card; archive completed steps as text, leave only the current confirmation active, and provide contextual retry/cancel states.
- [x] Replace the layered chat CSS with a coherent neutral light/dark design, readable typography, visible focus and narrow-screen support.
- [x] Run all unit/browser tests, inspect light/dark/narrow screenshots, obtain independent review, update README and release 0.8.0.

Verification uses local fake AI responses only; no live credentials or site actions. Preserve untracked user agent configuration and original line endings.

Verification: 18 unit tests and all three local Chrome browser suites passed. Light, dark and narrow screenshots inspected. Independent review identified utility-dialog lookup routing and selection-mode retry loss; both were reproduced by failing browser cases and fixed. No live Gemini request or installed-extension test was performed.
