# YYNotes design system

## Direction
A monochrome academic note workspace. Default English interface with a persistent English/Chinese switch. Direct functional copy; no motivational slogans, ornamental labels, or diagonal external-link arrows.

## Structure
Home opens with a full-height hero containing a centered `YYnotes` wordmark and a direct bilingual description. The source composer appears below the first viewport, followed by the searchable note library. Native CSS scroll timelines move the hero text and flowing background at different speeds while the composer enters; unsupported browsers and reduced-motion settings retain the static layout. The original flowing mask and grain texture return as the homepage background. A translucent frosted navigation bar carries the monochrome YY icon. Archive retains progressively disclosed import, folders, filters, and notes. Reading has an optional contents panel and collapsible assistant fixed inside the viewport on desktop, with its own conversation scroll area. The assistant header uses labelled history, fullscreen, and collapse icons without repeating the note title. Auth uses a clear single-column form.

## Tokens
app/monochrome.css overrides the semantic HSL variables with zero-saturation colors. Light: near-white canvas, black ink. Dark: near-black canvas, white ink. Self-hosted DM Sans and platform Chinese sans. Thin dividers, restrained corners, limited shadows. Avoid blur on text and interactive content.

## Interaction
Transform/opacity entrances and responsive control feedback. Background drift uses compositor transforms; pause offscreen and when the document is hidden. Respect reduced motion. No scroll interception. Focus-visible controls, labelled actions, responsive touch targets, retry and empty states, cancellable source preparation, and drafts preserved through sign-in. Assistant dialogs use body portals, keyboard focus containment, and Escape to close. Generation reports actual preparation, prompt-loading, and generation stages; it rejects oversized sources without truncation and never retries automatically after an uncertain save.

## Language and content
UI defaults to English and switches to Chinese. Notes retain their original bilingual source and generation rules; the reader selects the matching language section when available. User-authored content is never translated or overwritten merely by switching UI language.

## References
Functional navigation and note organisation informed by https://www.notion.com/product/docs and https://capacities.io/product. Motion and typography reference https://godly.design/ and https://www.siteinspire.com/ without copying their artwork.
