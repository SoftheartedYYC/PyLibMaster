---
kind: frontend_style
name: Electron Renderer CSS with CSS Variables Theming
category: frontend_style
scope:
    - '**'
source_files:
    - renderer/styles.css
    - renderer/index.html
---

The PyLibMaster frontend uses a single-file CSS architecture (`renderer/styles.css`) built around CSS custom properties for theming, with no external CSS framework or preprocessor. The styling approach is organized as follows:

**Theming System**: Two complete color palettes are defined via CSS variables under `:root` (light theme, default) and `.dark` (dark theme), covering backgrounds, text colors, borders, accents, tags, progress bars, shadows, and radii. Theme switching toggles the `dark` class on the document root. A third "system" theme option exists in the UI but falls back to light/dark based on system preference.

**Layout Structure**: The UI follows a fixed Electron-style layout with a custom titlebar (`.titlebar`), left sidebar navigation (`.sidebar`), main content area (`.content`), and bottom status bar (`.statusbar`). Pages are shown/hidden via `.page` and `.page.active` classes, with a slide-in animation.

**Component Styles**: Reusable components include cards (`.card`), buttons (`.btn`, `.btn-primary`, `.btn-danger`, `.btn-sm`), search inputs (`.search-input`), tables (`.table-wrap` + `table`), tags (`.tag-ok`, `.tag-update`, `.tag-danger`), progress bars (`.progress-bar`, `.progress-fill`), modals (`.modal-overlay`, `.modal`), toasts (`.toast-container`, `.toast`), toggles (`.toggle`), and dropzones (`.dropzone`).

**Responsive Strategy**: Minimal responsive breakpoints exist at `max-width: 900px`, adjusting sidebar width, grid columns, and padding. No mobile-first approach; the app targets desktop Electron windows.

**No CSS Framework**: There is no Tailwind, Bootstrap, or similar library. All styles are hand-written vanilla CSS with consistent naming conventions (BEM-like class names using hyphens). Icons are inline SVGs embedded directly in HTML.

**Asset Organization**: Static assets (logo.png, icon.ico, verify.png) live under `renderer/assets/`. No SCSS, SASS, or CSS preprocessing is used — just plain `.css` files loaded directly in `index.html`.