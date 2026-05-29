# Video Recording & Diagnostics — Visual UI Blueprints

This folder contains a complete, highly polished collection of **HTML and CSS layouts** designed to accompany the underlying javascript-native `RecordingEngine` (`recording.js`, `assembly.js`, `diagnostics.js`).

By referencing or copying the markup and styles contained here, you can preserve the identical, professional, glassmorphic look of the **Video settings toolbar**, **Assembly overlay engine window**, and **Diagnostics menu** when migrating this library into a brand-new application.

---

## Folder Structure

*   **/video-settings-panel.html** — Pristine HTML layout of the interactive lower control panel containing the Record button and dropdown selections (resolution, fps, format, CRF quality, trim mechanics, and pipelines).
*   **/assembly-overlay.html** — Interactive fullscreen modal displaying active rendering stats, and an embedded diagnostics grid, rendering canvas preview thumbnail, scroll-pinned terminal console log, and linear loading timeline.
*   **/diagnostics-overlay.html** — Standard testing container displaying device core metrics (SAB support, memory, sandbox capabilities), interactive filters, and cascading test card items with expandable validation blocks.
*   **/combined-styles.css** — Self-contained static styles providing glassmorphism backdrops, high-contrast glow colors, customized dark scrollbars, fluid media adaptive height controls, and performance-tuned micro-animation keyframes.

---

## Integration Guide

### 1. Connecting the Controller Bindings
The underlying library expects standard browser DOM elements to read configuration parameters and output progress updates. If you use our default templates, ensure your app binds these IDs directly:

*   **HTML Input Elements for Recording Engine:**
    *   `#btn-video` — The master recording action toggle triggers (`"Record / Export"`).
    *   `#sel-pipeline` — Select pipeline targets (`"ffmpeg"`, `"opfs"`, `"zip"`, or `"local"`).
    *   `#sel-action` — Action context: `"record"` (realtime frame buffer capture) or `"assemble"` (manually stitch folder chunks).
    *   `#sel-res` — Output resolution bounding targets (e.g. `"1280x720"`, `"1920x1080"`).
    *   `#sel-format` — Video output stream encapsulation format (`"mp4"` or `"webm"`).
    *   `#sel-fps` — Target frame rate (`"24"`, `"30"`, `"60"`).
    *   `#sel-crf` — Compression density value (`"0"`, `"5"`, `"18"`).
    *   `#sel-trim` — Layout viewport frame margin adjustment (`"none"`, `"snug"`).

*   **Assembly Overlay Viewport Outputs:**
    *   `#processing-overlay` — Fullframe backdrop containing the compilation HUD.
    *   `#preview-canvas` — Embedded `<canvas>` where progress thumbnails are rendering.
    *   `#progress-fill` — Relative `style.width` element representing process percentage.
    *   `#assembly-percent` — Label displaying current progress percentage.
    *   `#assembly-bottom-phase` — Underline text indicating active processing phase (e.g., "Stitching frames...").
    *   `#assembly-bottom-frames` — Subtitle displaying frame progression metric ("120 / 300 frames").
    *   `#assembly-log-scroll` — Internal log terminal showing WebWorker and compiler logs.
    *   `#btn-copy-logs` — Clipboard clipboard dump button.

### 2. Styling Prerequisites
These visual references are styled to blend seamlessly with:
1.  **Tailwind CSS** (for margins, simple grid divisions, text colors, and spacing).
2.  **Custom Modals & Scrollbars Styles** (defined in `combined-styles.css`) for high-performance responsive overlays and beautiful dark color palettes.

Enjoy building structured visual tools!
