# Precise guidance and visible control

User request: reduce nonsensical element highlighting; show a moving pointer and orange page border during AI operations.

- Remove fuzzy answer-to-element guesses. Require explicit target name plus ID, reject ambiguous names and stale/hidden/occluded elements; summary/translation use read-only mode.
- Keep guidance small (maximum two verified visible targets), no forced focus/scroll for an explanation.
- Revalidate element identity at execution. Install an isolated, non-blocking Shadow DOM overlay only after confirmation; animate a virtual pointer to the live element, show a click ripple and orange frame.
- Stop via panel, page button or Escape. Check cancellation around animation waits and actions; remove overlay on completion/error/navigation/timeout. Never impersonate actual OS mouse movement.
- Test pure target checks, real DOM validation/occlusion, accurate pointer position, stop-before-side-effect, reduced-motion and cleanup, plus existing tab/production/confirmation regressions.
- Preserve the single-file background worker and existing local settings. Update README and verify extension reload/restart before release 0.9.0.

Verification: 36 unit tests, four local browser suites and actual Chromium isolated-world execution/restart passed. Independent review fixes cover cancellation before the first query, inherited disabled controls, ambiguity hidden by link deduplication, SPA navigation, layout drift and removed overlays. OS pointer is unchanged; displayed pointer is page-local.
