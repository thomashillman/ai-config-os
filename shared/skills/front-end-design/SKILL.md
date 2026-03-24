---
skill: front-end-design
description: |
  Audit and improve front-end UI code for visual consistency, missing CSS utility classes, and design quality.
  Use when reviewing or improving React/JSX components, CSS utility files, or dashboard UI — especially when
  components use Tailwind-style class names backed by a hand-rolled CSS utility file.

type: prompt
status: stable

capabilities:
  required: [fs.read, fs.write]
  optional: []
  fallback_mode: prompt-only
  fallback_notes: Can review pasted component code without filesystem access.

platforms: {}

inputs:
  - name: target
    type: string
    description: File path, directory, or component description to review and improve
    required: false

outputs:
  - name: improvements
    type: string
    description: Design improvements applied or recommended (missing classes added, visual hierarchy improved)

examples:
  - input: "Improve the dashboard UI"
    output: "Audited CSS class usage across all tabs, added missing utility classes, improved header navigation design"
  - input: "Fix the analytics tab styling"
    output: "Added animate-pulse, overflow-hidden, rounded-lg, and group-hover utilities; corrected spacing"

version: "1.0.0"
changelog:
  "1.0.0": "Initial release"

tags:
  - frontend
  - design
  - css
  - react
---

# front-end-design

Audit and improve front-end UI code for visual consistency, missing CSS utility classes, and design quality.

Use when reviewing or improving React/JSX components, CSS utility files, or dashboard UI — especially when
components use Tailwind-style class names backed by a hand-rolled CSS utility file (no Tailwind installed).

## When to use

- User asks to improve, polish, or fix dashboard/UI styling
- Components use class names that aren't defined in the utility CSS file
- UI elements look broken, unstyled, or visually inconsistent
- Adding new components that introduce new utility class requirements

## Instructions

### Step 1 — Audit class coverage

1. Grep all JSX/TSX files in the component tree for `className` values
2. Extract every unique class name used
3. Compare against the utility CSS file (typically `index.css` or `globals.css`)
4. List all classes used in JSX but absent from the CSS file — these are silent failures

### Step 2 — Add missing utility classes

For each missing class, add the correct CSS rule to the utility file. Follow the existing file's
organisation (layout → spacing → sizing → typography → colour → interactive → animation).

Key patterns for this repo (dark theme, monospace, gray-950 base):

```css
/* Layout */
.absolute { position: absolute; }
.relative { position: relative; }
.fixed { position: fixed; }
.inset-0 { inset: 0; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-shrink-0 { flex-shrink: 0; }
.min-w-0 { min-width: 0; }
.ml-auto { margin-left: auto; }
.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }

/* Spacing — add fractional variants (0.5, 1.5, 2.5) alongside whole numbers */
.gap-1\.5 { gap: 0.375rem; }
.space-y-4 > * + * { margin-top: 1rem; }

/* Animation */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

/* Group hover (requires .group on a parent) */
.group-hover\:opacity-100 { opacity: 0; }
.group:hover .group-hover\:opacity-100 { opacity: 1; }
```

### Step 3 — Improve visual design

Focus on:

1. **Navigation / tab bars** — prefer an active indicator (underline or border accent) over a flat
   background pill. The underline approach communicates selection without adding visual weight.
2. **Brand / app header** — use a slightly higher contrast color for the app name (`text-gray-200`
   vs `text-gray-400`) and a thin vertical separator between brand and nav links.
3. **Empty states** — center them, give them breathing room (`p-8`), and use muted language.
4. **Skeleton loaders** — ensure `animate-pulse` is defined and applied so loading states feel alive.
5. **Error states** — use a red/amber tinted border and background (`border-red-900/50`,
   `bg-red-950/20`) to distinguish them from normal content.

### Step 4 — Clean up scaffold leftovers

Remove any unused CSS from Vite/CRA scaffolding (`.logo`, `.logo-spin`, `.read-the-docs`, `.card`,
the `#root` centering rules). These add noise and can conflict with app layout.

### Step 5 — Verify

After changes, read back the modified files to confirm:
- No class used in JSX is now missing from the CSS utility file
- Removed CSS rules are not referenced anywhere in JSX
- Visual improvements are consistent with the existing dark theme

## Examples

### Example 1 — Dashboard audit

**Input:** "Improve the dashboard UI"
**Process:**
1. Grep all tabs and components for className values
2. Compare against index.css — find 40+ missing utilities
3. Add missing classes in logical groups
4. Remove Vite scaffold CSS from App.css
5. Update header to use underline tab indicator

**Output:** Missing utilities added; App.css cleaned; header nav redesigned with bottom-border active indicator

### Example 2 — Single component

**Input:** "The analytics tab skeleton isn't animating"
**Process:**
1. Find `animate-pulse` usage in AnalyticsTab.jsx
2. Confirm `animate-pulse` is absent from index.css
3. Add `@keyframes pulse` + `.animate-pulse` rule

**Output:** Animation added; skeleton loaders now pulse correctly
