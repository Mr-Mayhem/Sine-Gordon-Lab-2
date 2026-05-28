# Recorder Library Specification — `recorder-library/`

This document details the architecture, capabilities, design philosophy, API contracts, and integration workflows of the self-contained browser recording and rendering assembly engine. 

Designed for high-performance in-browser rendering pipelines, this library is crafted to handle ultra-high resolution captures (such as 1080p, 1440p, or 4K) directly inside sandboxed browser frames using modern standards including WebGL, standard ES Modules (ESM), WebAssembly (FFmpeg.wasm), and fast sandboxed storage via the **Origin Private File System (OPFS)**.

---

## 1. Core Philosophy: The Dual-Mode Architecture

During development, it is common to bounce between the simplicity of a raw API and the speed of fully populated diagnostic UI components. To prevent reinventing the wheel while maintaining architectural modularity, the library functions in a **hybrid, dual-mode fashion**:

1. **API-First Engine (Decoupled Mode)**: The core modules (`RecordingEngine` inside `recording.js`, and `assemble` inside `assembly.js`) operate on pure standard JavaScript and WebGL canvases. You can initiate, step, stop, package, and transcribe video completely programmatically by feeding configuration objects and listening to standard callbacks and promises.
2. **Built-in HUD & UI Contract Hooks (Integrated Mode)**: If recognizable DOM elements (or globally registered helpers like `window.LogNexus` and `#processing-overlay`) are present in your application, the engine automatically hooks into them, driving full-screen modal overlays, rich diagnostic graphs, progress bars, frame count ticks, and scrolling diagnostics. 

*If these elements do not exist, the engine gracefully fallbacks directly to console routines or standard developer warnings without throwing exceptions*, leaving you free to design a bespoke dashboard for your new system.

---

## 2. Directory Map & Component Ledger

The engine is modularized across flat standard ES files within the `/js/recorder-library/` directory:

```
recorder-library/
├── recording.js         # Central class orchestrating frame capturing loop and pixel readback
├── assembly.js          # Main video rendering supervisor delegating chunked conversions and assembly
├── video-filters.js     # Modulus grid matching formulas, Aspect resizing formulas, and scale-to-crop settings 
├── ffmpeg-loader.js     # Async worker bootstrapping loader, supporting fallback networks
├── ffmpeg-commands.js   # CLI CLI command compiler formulating WebAssembly-aligned H.264 & WebM tasks  
├── zip-export.js        # High-performance, streaming zip packager using JSZip (Zero-heap inflation)
└── fetch-from-cdn.js    # Resilient fetching algorithm with automatic retry routines for third-party libraries
```

---

## 3. Physical Principles: The Hard Math of Video Formats

### 3.1 Non-Widescreen Aspect Preservation
Standard WebGL graphics are generated centered in responsive divs, which often contain non-even bounds or variable aspect ratios. If raw canvases are rendered directly into H.264 formats, videos suffer from stretched visual profiles or harsh alignment black bars.
* **Aspect Correction Formula**: The library maps resolution boundaries and utilizes a dynamic crop-to-fit filter pipeline during FFmpeg assembly:
  $$\text{Filter Recipe} = \text{scale}=W:H:\text{force\_original\_aspect\_ratio}=\text{increase},\text{crop}=W:H$$
  This ensures that whether a canvas is ultra-wide or portrait, the resulting MP4/WebM features pristine crop alignments to fill target standard scales (1080p, 2K, 4K) perfectly.

### 3.2 H.264 Macroblock Alignment Constraints (The Modulo Rule)
A common crash on in-browser WebAssembly video pipelines is the mismatch between canvas dimensions and macroblock partitions:
* **The Math**: Standard H.264 encoders slice images into macroblocks of $16 \times 16$ or $8 \times 8$ pixels. If your exported dimensional bound is not divisible by these constraints, standard libx264 will abort synthesis or output a broken container with vertical green bars.
* **Our Resolution-Remapping Table**:
  To protect against crashes on standard widescreen scales, the library implements dynamic remapping matching Mod-8/16 compliance:
  - Remaps standard **854x480** to complying widescreen **852x480** (clean division, aspect ratio 1.775:1).
  - Remaps and ensures all canvas size transformations apply a modulo-2 grid (`Math.floor(value / 2) * 2`) even when user triggers dynamic, custom window resize interactions.

---

## 4. Performance & Memory Safeguards

Capturing canvases at high frame rates (e.g. 60 FPS) at 1080p produces roughly **480 Megabytes of raw pixels per second**. Storing those assets in main-thread RAM easily triggers page crashes (Out of Memory - OOM). The library includes several hardcoded defense layers:

### 4.1 Sandboxed Stream Model via OPFS
Instead of saving huge arrays of frame buffers in JavaScript heap memory, the engine streams files continuously to the **Origin Private File System (OPFS)**. A sandbox directory (`navigator.storage.getDirectory()`) is dynamically constructed to contain incoming frame payloads, meaning the browser's disk caches handle file management natively. Upon completion, the library automatically calls recursive eradication routines (`root.removeEntry(tempDir, { recursive: true })`) to release disk space immediately.

### 4.2 Resolution-Aware Pipeline Routing
Rather than a fixed frame limit, the library dynamically samples frame resolution dimensions to decide between a **single-step encode** or a **double-buffered chunked assembly**:
* **4K (3840x2160)**: Triggers chunked assembly at **>30 frames**. Chunk sizing limits peak memory footprint to $\text{chunk size} = 40$ frames.
* **1440p (2560x1440)**: Triggers chunked assembly at **>60 frames**. Chunk sizing limits to $75$ frames.
* **1080p (1920x1080)**: Triggers chunked assembly at **>120 frames**. Chunk sizing limits to $100$ frames.
* **SD Resolutions**: Fallbacks to chunk sizes of $150$ frames, up to $1500$ frames before partitioning.

---

## 5. Complete API Reference

### 5.1 `RecordingEngine` (Class)
The central supervisor managing canvas frames, resolution states, and recording state cycles.

```javascript
import RecordingEngine from './js/recorder-library/recording.js';

const recorder = new RecordingEngine({
  exportFPS: 60,              // Final output target framing count
  exportFormat: 'webm',       // Output format target: 'webm', 'mp4', or 'zip'
  exportPipeline: 'ffmpeg',   // Assembly technique: 'ffmpeg' (WASM compiler) or 'zip'
  exportWidth: 1280,          // Canvas scale width
  exportHeight: 720,          // Canvas scale height
  camera: cameraRef,          // Three.js Camera reference (for projection updates)
  exportTrim: 'none',         // WebM custom height trim boundaries: 'none', 'subtle', 'snug', 'max'
  exportFilename: ''          // Optional output filename base. If empty, defaults to the parent project's sanitized name retrieved from the page title (e.g. 'the_sine_gordon_lab')
});
```

#### Class Methods

* **`init(canvas, renderer)`**
  Registers the WebGL canvas context and coordinates capabilities. Checks for browser support such as `SharedArrayBuffer` availability for multithreading.
  ```javascript
  recorder.init(renderer.domElement, renderer);
  ```

* **`startRecording()`**
  Initiates a capture sequence. Scales the active Three.js canvas dynamically to match target recording dimensions while keeping structural bounds in the original aspect ratio. 

* **`captureFrame()`**
  Should be queried once per render loop inside your `requestAnimationFrame` loop. Gracefully checks if recording is active and captures raw WebGL pixel states.
  ```javascript
  function animLoop() {
    requestAnimationFrame(animLoop);
    renderer.render(scene, camera);
    recorder.captureFrame(); // Self-throttled based on target FPS
  }
  ```

* **`stopRecording()`**
  Forces a stop state on the capturing loop and kicks off the background compiler pipeline (FFmpeg transcode stream or ZIP generation). Restores canvas viewport bounds dynamically back to original browser size. Returns a promise resolving with the assembled file `Blob`.

* **`getTelemetry()`**
  Evaluates active metrics, timings, pixel sizes, storage consumption, and transcode status. Returns a rich analytical report.

---

## 6. Integration Guide: Bringing the Recorder to a New Project

To integrate the library in a new system, you can either utilize the standard programmatic hook structure or provide the corresponding viewport overlay.

### 6.1 Programmatic (Raw API) Integration Example

If your new system does not use the default HUD overlays, import and instantiate the library with custom progress handlers:

```javascript
import RecordingEngine from "./js/recorder-library/recording.js";

// 1. Initial configuration
const recorder = new RecordingEngine({
  exportFPS: 60,
  exportFormat: "webm",
  exportWidth: 1280,
  exportHeight: 720,
  camera: camera
});

// 2. Attach to canvas renderer
recorder.init(renderer.domElement, renderer);

// 3. Optional programmatic progress logger
recorder.setProgressCallback((stage, frames, total, completedPercent) => {
  console.log(`[Recording System] Phase: ${stage} | Progress: ${completedPercent}% (${frames}/${total} frames)`);
});

// 4. Hook frame capture inside the render tick
function tick() {
  requestAnimationFrame(tick);
  
  // Update physics/scene...
  renderer.render(scene, camera);
  
  // Call capturing system
  recorder.captureFrame();
}

// 5. Build trigger controls
document.getElementById("btn-start").addEventListener("click", () => {
  recorder.startRecording();
});

document.getElementById("btn-stop").addEventListener("click", async () => {
  console.log("Stopping recording and starting in-browser video compilation...");
  const compiledBlob = await recorder.stopRecording();
  
  // Trigger file download helper
  const url = URL.createObjectURL(compiledBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my_experimental_capture_${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
});
```

---

## 7. Operational FAQ & Diagnostic Blueprints

#### Q: The browser console shows `SharedArrayBuffer is not defined`. Will recording crash?
**A**: No. If `SharedArrayBuffer` is blocked (e.g. your application's proxy server is not configured with necessary Cross-Origin headers), the system automatically degrades gracefully. It falls back dynamically to the **Single-Threaded (ST)** transcode loop. If MP4 format is requested in high-resolutions under simple thread pipelines, it will intelligently switch to **WebM format** which complies beautifully with single-thread compression speeds.

#### Q: What are the necessary Cross-Origin Headers to enable Multi-Threading (COEP/COOP)?
**A**: To allow high-speed multithreaded WASM workers, your static file server (`server.js`) must inject the following headers on document loads:
```http
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

#### Q: How does the ZIP extraction pipeline preserve resolution states?
**A**: When importing a previously recorded ZIP folder containing static PNG files, the layout pipeline reads the first few bytes of the initial frame directly. Using standard binary chunk parsing, the engine extracts the file size elements from the `IHDR` PNG header structure, automatically synchronizing your local UI aspect ratios.

```
                    PNG FILE HEADER PARSER
┌────────────────────────────┬────────────────────────────┐
│ PNG Magic (8 Bytes)        │ IHDR Chunk Signature (4B)   │
│ 89 50 4E 47 0D 0A 1A 0A    │ 49 48 44 52                │
└────────────────────────────┴──────────────────────────┬─┘
                                                        │
                                                        ▼
                                             Width (4B)  → e.g., 3840px
                                             Height (4B) → e.g., 2160px
```

#### Q: I resized the browser during recording but the final video aspect is perfect. How?
**A**: The compiler decouples layout preservation from rendering size. When starting, the viewport's original bounds are cached inside `this._preRecordingWidth` and `this._preRecordingHeight`, and the viewport resize listener is paused. The physical canvas's pixel buffer is set to the target resolution (e.g. 4K, 1080p, etc.) for high-speed offline capture. Symmetrically, the canvas's visual displays are anchored using inline CSS width and height mappings (`canvas.style.width`, `canvas.style.height`) matching the original layout. This ensures that the canvas never visibly shifts, jumps or contracts during active recording, maintaining full UI consistency.

#### Q: How does the library handle Chromium workspace directory memory on file dialogues?
**A**: To prevent the browser dialog from resetting to generic system folders on subsequent saves/opens, the library assigns a strictly matching native ID string (`id: 'zip-export'`) to options passed into `window.showSaveFilePicker` and `window.showOpenFilePicker`. Supported browsers recognize matching IDs and natively anchor the active file dialogs back into the user's previously-selected host directory automatically.

#### Q: How is Canvas Context isolation managed during raw frame capturing?
**A**: To avoid canvas flashing or coordinate horizontal clipping, the engine avoids self-drawing operations on a single surface. It reads raw WebGL pixels directly into a structured GPU buffer, performs y-flip operations, and projects those frames onto a completely isolated, target-sized 2D 2-buffer pipeline context (`_rawCanvas`) for thread-safe compilation.

#### Q: Are exported filenames (video/ZIP/frames) customizable?
**A**: Yes, completely! You can set the custom output name prefix by passing the `exportFilename` property inside the initialization config, or by modifying `window.sgState.exportFilename` dynamically in the active session. If this parameter is empty, the engine automatically extracts the parent project name directly from the DOM `<title>` (or defaults to `the_sine_gordon_lab`), sanitizes it to safe filesystem snake_case (e.g., `the_sine_gordon_lab`), and appends a clean unique millisecond timestamp:
```javascript
// Filename output logic internally:
let filename = recorder.getExportFilename("mp4"); 
// Returns e.g. "the_sine_gordon_lab_render_1716912345678.mp4"
```
