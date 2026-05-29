# Recorder Library Specification — `recorder-library/`

**Active Version: v1.8.2-modular-hybrid**

This document details the architecture, capabilities, design philosophy, API contracts, directories, and integration workflows of the self-contained browser recording and rendering assembly engine. 

Designed for high-performance in-browser rendering pipelines, this library is crafted to handle ultra-high resolution captures (such as 1080p, 1440p, or 4K) directly inside sandboxed browser frames using modern standards including WebGL, standard ES Modules (ESM), WebAssembly (FFmpeg.wasm), and fast sandboxed storage via the **Origin Private File System (OPFS)**.

### Recent Updates in v1.8.2
1. **Fully Encapsulated Vendor Directory**: Moves all external non-downloadable scripts (`ffmpeg.js`, `814.ffmpeg.js`, `jszip.min.js`, `FileSaver.min.js`) into an isolated `vendor/` subfolder within the module itself to make it a portable drag-and-drop package.
2. **Atomic CDN & Sandbox Transaction Fallback**: Fixes single-threaded WASM URL resolution bugs and details how fallbacks and SHA-256 cryptographic hashes operate to satisfy secure origin policies.
3. **Dynamic Target Aspect Ratio Locking**: Remaps capturing dimensions dynamically to match the exact target aspect ratio of the requested export resolution across all formats. This prevents dimensional discrepancy errors during in-memory and OPFS storage ZIP extraction and video rendering workflows.
4. **Integrated Log Window & HUD Tool**: A dedicated terminal console tracks operations, compiling steps, and thread configurations dynamically with visual tracking and message grouping.
5. **Diagnostic Utility (Clipboard Copy)**: Introduces a robust clipboard action featuring dual-tier fallback mechanisms (`navigator.clipboard.writeText` and a hidden temporary textarea node) to grab complete diagnostic reports seamlessly inside iframes or sandboxed origins.
6. **Programmatic Core Test Isolation Guard (`isTesting`)**: Configures and documents the synchronization safety layer that gates render ticks from calling capture functions concurrently while automated test suites run, preventing frame sequence pollution or aspect-ratio desynchronization.
7. **HTML Head Peak Placement (Speculative Parser Protection)**: Incorporates precise documentation on why the `<script type="importmap">` must be the absolute first node inside `<head>`, precluding speculative browser loading pre-fetch races.

---

## 1. Core Philosophy: The Dual-Mode Architecture

During development, it is common to bounce between the simplicity of a raw API and the speed of fully populated diagnostic UI components. To prevent reinventing the wheel while maintaining architectural modularity, the library functions in a **hybrid, dual-mode fashion**:

1. **API-First Engine (Decoupled Mode)**: The core modules (`RecordingEngine` inside `recording.js`, and `assemble` inside `assembly.js`) operate on pure standard JavaScript and WebGL canvases. You can initiate, step, stop, package, and transcribe video completely programmatically by feeding configuration objects and listening to standard callbacks and promises.
2. **Built-in HUD & UI Contract Hooks (Integrated Mode)**: If recognizable DOM elements (or globally registered helpers like `window.LogNexus` and `#processing-overlay`) are present in your application, the engine automatically hooks into them, driving full-screen modal overlays, progress bars, frame count ticks, and scrolling diagnostics. 

*If these elements do not exist, the engine gracefully fallbacks directly to console routines or standard developer warnings without throwing exceptions*, leaving you free to design a bespoke dashboard for your new system.

---

## 2. Directory Map & Component Ledger

The recording module is fully self-supporting and encapsulated. The folder structure inside `./js/recorder-library/` is organized as follows:

```
recorder-library/
├── recording.js            # Central class orchestrating frame capturing loop and pixel readback
├── assembly.js             # Main video rendering supervisor delegating chunked conversions and assembly
├── video-filters.js        # Modulus grid matching formulas, Aspect resizing formulas, and scale-to-crop settings 
├── ffmpeg-loader.js        # Async worker bootstrapping loader with local-to-CDN priority logic
├── ffmpeg-commands.js      # CLI command compiler formulating WebAssembly-aligned H.264 & WebM tasks  
├── zip-export.js           # High-performance, streaming zip packager using JSZip (Zero-heap inflation)
├── fetch-from-cdn.js       # Resilient fetching algorithm with SHA-256 cryptographic check and fallback routines
├── README.txt              # Standard manual and troubleshooting files
├── specifications.md       # Full technical manual and architectural spec sheets (This file)
│
├── example/                # COMPLETE REFERENCE DEMO PROJECT PORTAL
│   ├── index.html          # Embedded reference layout with peak-head Three.js importmaps
│   └── main.js             # Controls simple toy animation, wiring overlays & progress logging HUDs
│
├── ui-templates/           # Embedded CSS and visual layout overrides
│   └── combined-styles.css # UI dashboard stylesheet supporting glassmorphism
│
└── vendor/                 # Local encapsulated vendor dependencies (fully self-supported)
    ├── jszip/
    │   └── jszip.min.js     # JSZip client-side zip creation module
    ├── file-saver/
    │   └── FileSaver.min.js # FileSaver download wrapper for client blobs
    ├── ffmpeg/
    │   ├── ffmpeg.js        # FFmpeg.wasm primary UMD script loader
    │   └── 814.ffmpeg.js    # FFmpeg.wasm browser worker bootstrap thread helper
    └── three/
        ├── three.module.js  # Dedicated Three.js modular script
        └── addons/
            └── controls/
                └── OrbitControls.js # Camera orbital controls addon script
```

---

## 3. Secure Origin Policy & Atomic CDN Caching Pipeline

Loading large WebAssembly core binaries (>24MB) into browsers under strict security headers (COOP/COEP) can raise CORS blockages or sandboxed network errors. The library resolves this using a three-tier atomic loading sequence:

### 3.1 Three-Tier Resolution Table
1. **Local Server (Fastest)**: The loader looks relative to the document base URI for `./js/recorder-library/vendor/ffmpeg/`. If core files (e.g. `ffmpeg-core.js`, `ffmpeg-core.wasm`) are present, they are loaded instantly with zero outward connections.
2. **Persistent OPFS Cache (Zero-Server-Request Fallback)**: If files are missing from the server, the loader checks the browser's persistent sandbox directory via the Origin Private File System (OPFS): `navigator.storage.getDirectory()`. If verified checkmarkers (`mt-loaded.ok` or `st-loaded.ok`) are present, files load instantly from sandboxed browser storage.
3. **Symmetrical CDN Fetch with Cryptographic Validation (Atomic Transaction)**: If both are empty, the loader initiates a secure download to fetch matching `@ffmpeg/core@0.12.6` binary chunks from jsDelivr / unpkg.

### 3.2 Symmetrical Hash Check and OPFS Cache Commit
To prevent corrupted downloads (such as truncated files or server HTML redirect falls) and guard against security compromises, downloaded arrays undergo a fast, secure cryptographic SHA-256 validation check:
* Calculated Array Buffer hashes are checked against the `TRUSTED_HASHES` dictionary in `fetch-from-cdn.js`.
* If matching, variables are written as safe local blobs, and committed to OPFS.
* Upon successful write of ALL required resources, an atomic marker (`st-loaded.ok` or `mt-loaded.ok`) is written.
* If any step fails or is blocked, the transaction is immediately cleared to protect storage and maintain pristine, uncorrupted cache alignments.

---

## 4. Physical Principles: The Hard Math of Video Formats

### 4.1 Non-Widescreen Aspect Preservation
Standard WebGL graphics are generated centered in responsive divs, which often contain non-even bounds or variable aspect ratios. If raw canvases are rendered directly into H.264 formats, videos suffer from stretched visual profiles or harsh alignment black bars.
* **Aspect Correction Formula**: The library maps resolution boundaries and utilizes a dynamic crop-to-fit filter pipeline during FFmpeg assembly:
  $$\text{Filter Recipe} = \text{scale}=W:H:\text{force\_original\_aspect\_ratio}=\text{increase},\text{crop}=W:H$$
  This ensures that whether a canvas is ultra-wide or portrait, the resulting MP4/WebM features pristine crop alignments to fill target standard scales (1080p, 2K, 4K) perfectly.

### 4.2 H.264 Macroblock Alignment Constraints (The Modulo Rule)
A common crash on in-browser WebAssembly video pipelines is the mismatch between canvas dimensions and macroblock partitions:
* **The Math**: Standard H.264 encoders slice images into macroblocks of $16 \times 16$ or $8 \times 8$ pixels. If your exported dimensional bound is not divisible by these constraints, standard libx264 will abort synthesis or output a broken container with vertical green bars.
* **Our Resolution-Remapping Table**:
  To protect against crashes on standard widescreen scales, the library implements dynamic remapping matching Mod-8/16 compliance:
  - Remaps standard **854x480** to complying widescreen **852x480** (clean division, aspect ratio 1.775:1).
  - Remaps and ensures all canvas size transformations apply a modulo-2 grid (`Math.floor(value / 2) * 2`) even when user triggers dynamic, custom window resize interactions.

### 4.3 Complete Video Filters and Resolutions Ledger

To lock in precise output standards and compile high-fidelity outputs, the recording compilation engine utilizes optimized, hardware-friendly FFmpeg scaling and cropping command options. Each target output resolution is mapped to a designated filter chain:

| Target Output Key | Output Name / Preset | Actual Output Width | Actual Output Height | Aspect Ratio | Exact FFmpeg Video Filter (`-vf`) Settings |
|:---|:---|:---|:---|:---|:---|
| **640x360** | standard_definition_360p | 640 px | 360 px | 16:9 (~1.777) | `scale=640:360:force_original_aspect_ratio=increase:flags=lanczos,crop=640:360,setsar=1` |
| **852x480** | standard_definition_480p | 852 px | 480 px | 1.775:1 (Mod-12) | `scale=852:480:force_original_aspect_ratio=increase:flags=lanczos,crop=852:480,setsar=1` |
| **854x480** | standard_definition_480p | 852 px | 480 px | 1.775:1 (Mod-12) | `scale=852:480:force_original_aspect_ratio=increase:flags=lanczos,crop=852:480,setsar=1` |
| **1280x720** | high_definition_720p | 1280 px | 720 px | 16:9 (~1.777) | `scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720,setsar=1` |
| **1920x1080** | full_hd_1080p | 1920 px | 1080 px | 16:9 (~1.777) | `scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1` |
| **2560x1440** | quad_hd_1440p | 2560 px | 1440 px | 16:9 (~1.777) | `scale=2560:1440:force_original_aspect_ratio=increase:flags=bicubic,crop=2560:1440,setsar=1` |
| **3840x2160** | ultra_hd_4k | 3840 px | 2160 px | 16:9 (~1.777) | `scale=3840:2160:force_original_aspect_ratio=increase:flags=bicubic,crop=3840:2160,setsar=1` |

#### Architectural Mechanics of the Filters & Attribute Settings:
1. **`scale=W:H`**: Scale the input frames so that they exactly match the target output width ($W$) and height ($H$) along the dominant axis.
2. **`force_original_aspect_ratio=increase`**: Scale the input video dynamically, preventing aspect squashing or stretching. This ensures the shorter dimension of the input video is scaled to completely fill/override the target, while the longer dimension overflows past the boundaries.
3. **`flags=lanczos` (HD/SD) / `flags=bicubic` (Quad/Ultra HD)**: High-quality spatial resampling filters. Lanczos is utilized for high frequency antialiasing below 1080p, while Bicubic is utilized at higher scales to minimize WebAssembly heap thrashing and keep processing speed steady.
4. **`crop=W:H`**: Extract a perfectly centered rectangle of size $W \times H$ from the scaled frames. This crops the overflow symmetrically, eliminating any layout black bars (letterboxing/pillarboxing) while keeping the center focused.
5. **`setsar=1`**: Force the Sample Aspect Ratio (SAR) to 1:1 (square pixels). This instructs standard media players to display the compiled video precisely and uniformly at a 1.0 pixel ratio.

---

## 5. Performance & Memory Safeguards

Capturing canvases at high frame rates (e.g. 60 FPS) at 1080p produces roughly **480 Megabytes of raw pixels per second**. Storing those assets in main-thread RAM easily triggers page crashes (Out of Memory - OOM). The library includes several hardcoded defense layers:

### 5.1 Sandboxed Stream Model via OPFS
Instead of saving huge arrays of frame buffers in JavaScript heap memory, the engine streams files continuously to the **Origin Private File System (OPFS)**. A sandbox directory (`navigator.storage.getDirectory()`) is dynamically constructed to contain incoming frame payloads, meaning the browser's disk caches handle file management natively. Upon completion, the library automatically calls recursive eradication routines (`root.removeEntry(tempDir, { recursive: true })`) to release disk space immediately.

### 5.2 Resolution-Aware Pipeline Routing
Rather than a fixed frame limit, the library dynamically samples frame resolution dimensions to decide between a **single-step encode** or a **double-buffered chunked assembly**:
* **4K (3840x2160)**: Triggers chunked assembly at **>30 frames**. Chunk sizing limits peak memory footprint to $\text{chunk size} = 40$ frames.
* **1440p (2560x1440)**: Triggers chunked assembly at **>60 frames**. Chunk sizing limits to $75$ frames.
* **1080p (1920x1080)**: Triggers chunked assembly at **>120 frames**. Chunk sizing limits to $100$ frames.
* **SD Resolutions**: Fallbacks to chunk sizes of $150$ frames, up to $1500$ frames before partitioning.

### 5.3 Canvas Layout Sizing & Aspect Integrity (Preservation Mandate)
To maintain user interface alignment and responsive layouts across high-DPI displays (including Retina, mobile grids, and split-screen desktop windows), the recording system operates under a strict preservation mandate:
* **No Visual Sizing Mutations**: The engine is strictly prohibited from changing the visual inline height or width of the active canvas on screen during active frame capturing.
* **Aspect Sizing Locks**: During active recording, the canvas's visual CSS style width and height are locked via inline properties to `100%`. This prevents the browser from changing layout reflows or warping elements when internal WebGL backbuffer properties mutate, completely halting any visual shrinking.
* **No Lens/Zoom Aperture Shifts**: The 3D camera aspect ratio is kept locked directly to the viewport aspect ratio (`preW / preH`) instead of forcing a target 16:9 ratio. Forcing a mismatch aspect ratio changes the camera projection matrix, changing the horizontal field of view (creating lens zoom/aperture artifacts on screen) and squishing the rendering buffer. Under the lock, the scene remains 100% visually identical with absolutely zero shift in zoom, lens perspective, layout, or dimensions.
* **Resolution-Only Buffer Scaling**: Changing target recording quality (e.g. exporting a 1080p, 1440p, or 4K frame stream) is performed strictly on the internal WebGL backbuffer via the renderer context (using `renderer.setSize(captureW, captureH, false)` with the layout updating flag set to `false`).
* **Instant Inline Recovery**: Whenever resolution scaling is completed, or when recording is stopped, original width and height style properties must be cleanly restored to their cached pre-recording states. The on-screen dashboard visual appearance remains completely static (even if grainy during lower recording quality settings), protecting container margins, aspect ratios, and visual fluidity.
* **Untouched Video Filters Directive**: The underlying ffmpeg video scale and crop command filters must never be mutated, ensuring compilation pipeline alignment is not broken.

---

## 6. Complete API Reference

### 6.1 `RecordingEngine` (Class)
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
  exportFilename: ''          // Optional output filename base. If empty, defaults to page config snake_case
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

## 7. Integration Guide: Bringing the Recorder to a New Project

To integrate the library in a new system, import and instantiate the library with matching HTML hooks:

```javascript
import RecordingEngine from "./js/recorder-library/recording.js";

// 1. Initial configuration
const recorder = new RecordingEngine({
  exportFPS: 60,
  exportFormat: "mp4",
  exportWidth: 1280,
  exportHeight: 720,
  camera: camera
});

// 2. Attach to canvas renderer
recorder.init(renderer.domElement, renderer);

// 3. Optional progress logger
recorder.setProgressCallback((stage, frames, total, completedPercent) => {
  console.log(`[Recorder] Phase: ${stage} | Progress: ${completedPercent}% (${frames}/${total} frames)`);
});

// 4. Hook frame capture inside the render tick
function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
  recorder.captureFrame();
}

// 5. Wire action controllers
document.getElementById("btn-start").addEventListener("click", () => {
  recorder.startRecording();
});

document.getElementById("btn-stop").addEventListener("click", async () => {
  const compiledBlob = await recorder.stopRecording();
  const url = URL.createObjectURL(compiledBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rendered_capture_${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
});
```

---

## 8. Embedded Reference Example Portal

For developers looking to inspect a complete, functional setup, we have provided an interactive project under:
`/js/recorder-library/example/`

### 8.1 Key Implementation Highlights
- **Immediate Import Maps**: The `<script type="importmap">` is declared as the absolute first child of the `<head>` block inside `example/index.html`. This ensures that native browser ES Module speculative parsing succeeds with zero remapping type errors.
- **Wired Progress HUD**: Connects all recorder callbacks symmetrically to update the interactive compilation status overview tiles, log lists, and progress bars.
- **Toy Canvas Engine**: Uses Three.js to render a spinning Torus Knot with dynamic vertex and fragment-resembling phase rotations that shift colors dynamically based on user panel settings.
- **Diagnostic Panel**: Connects modern Web API checks to verify the platform features (such as `SharedArrayBuffer` and `getDirectory` OPFS status) in the client context.

### 8.2 Symmetrical HUD Overlay — The Recording Blurb
To preserve design intent and provide clear real-time user feedback, the recording layout implements a high-visibility, pulsing red "recording blurb":
- **UI Positioning**: Placed overlaying the active canvas viewport, absolute centered at `top-8` (`absolute top-8 left-1/2 -translate-x-1/2` inside `example/index.html` or `index.html`).
- **Interactive Triggering**: Symmetrically linked to the underlying `RecordingEngine` class context:
  - On `startRecording()`, the container element with ID `recording-indicator` is found in the DOM and toggled to `display: flex`.
  - In each requestAnimationFrame capture loop, as frames are stored to OPFS, the script updates the internal element containing ID `txt-recording` with the current sequence state: `"REC: " + frameCount`.
  - On `stop()`, the `recording-indicator` is hidden gracefully (`style.display = "none"`) and reset to zero.
- **Pulsing Aesthetic**: Rendered using glassmorphism styling (`backdrop-blur-md`, alpha-backed red background bounds, and a pulsing core red indicator dot mapped via smooth infinite keyframes). This visual feedback guarantees users know that the canvas is being captured and that the application is actively processing frames.

---

## 9. Sandbox Diagnostic Test Isolation Guidelines

### 9.1 Background
The recording library contains a powerful interactive **Diagnostic Suite** that allows testing WebGL frame buffers, JSZip streams, and WebAssembly transcode speeds over different compliant resolutions (from 360p up to UHD 4K). 

### 9.2 The Double-Capture Concurrency Pitfall
Because the browser's visual viewport utilizes a continuous `requestAnimationFrame` render/animation loop, adding frame capturing operations like `recorder.captureFrame()` direct-coupled to general drawing updates can trigger severe desynchronization during test validations:
- As the Diagnostic Suite initializes, it sets up its own programmatically controlled frame capture cycles under temporary mock resolutions.
- If the main visual timeline ticker concurrently issues `captureFrame()` inside the normal animation loop, the two cycles collide.
- This results in excess frame writes, frame count mismatches on OPFS/RAM disk buffers, and dimensional mismatch violations (e.g., standard renderer dimensions being written to target sandboxed directories).

### 9.3 The Golden Guard Strategy
To maintain absolute separation of concerns and avoid concurrency desynchronization under iframe and preview environments, all primary model render/animation ticks MUST gate capturing operations to isolate them under active testing flags:

```javascript
// Main viewport animation tick
function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
  
  // GOLDEN safety lock separates manual user recording from programmatic tests
  if (recorder && recorder.isRecording && !recorder.isTesting) {
    recorder.captureFrame();
  }
}
```

This simple guard isolates standard user recording sessions cleanly from background programmatic audits, resolving timing races and ensuring that every single compliant resolution test delivers precise, reproducible results.


## 10. Peak Placement HTML Head Rules (Speculative Parser Protection)

### 10.1 The Issue
Under aggressive, concurrent browser parsing routines (specifically in sandboxed frames or standard secure origins), the browser uses a **Speculative Preparser (HTML Preloader)**. If it sees ANY element before the `<script type="importmap">`—including comments, stylesheets, link preconnect tags, or viewport meta elements—it may speculatively parse and attempt to fetch/preload ES modules down in the file body. Since the import map hasn't been compiled on the main thread yet, resolving `"three"` bare specifiers will immediately crash speculative execution, generating unrecoverable `TypeError: The specifier "three" was a bare specifier, but was not remapped to anything.` errors.

### 10.2 The Safe Pattern
To eliminate timing-related bare specifier crashes entirely across all environments:
1. The `<script type="importmap">` **MUST** be placed as the absolute first child of the `<head>` tag.
2. Even comment blocks (such as `<!-- ... -->` or headers) must not precede it.
3. Keep structural and style assets locked strictly below the importmap.


## 11. One Design Throughout Mandate

To maintain absolute uniformity of user experience and mechanical logic, this project operates under a strict **One Design Throughout** architectural mandate:

* **Symmetrical Options Mapping**: The main application and the reference example project must perfectly mirror each other in all recorder, diagnostic, and control options. 
  - Supported resolutions (such as 360p, 480p, 720p, 1080p, 1440p, and 4K), formats, FPS presets, quality/CRF scales, and trim bounds must remain fully synced in options and implementation without feature or setting drift.
  - Symmetrical state engines (such as `window.sgState` mocks) must expose the exact same properties, setters, and programmatic update hooks so that the underlying diagnostic framework can evaluate either project interchangeably.
* **Component-Level Visual Styling Harmony**: The dark glassmorphism styling, structural layouts, HUD terminal console logs, copyable diagnostic clipboards, overlays, and modal compiler screens must use the exact same aesthetic configurations, ensuring a brand-coherent look.
* **Scene Isolation Exception**: The only permissible divergence between the main application and the reference example is the underlying 3D visual scene. While the main app renders the complex, coupled-pendulum Sine-Gordon simulation, the reference example behaves as a lightweight learning playground rendering a Three.js Torus Knot, focusing developer attention purely on understanding and preserving the recording mechanics.



