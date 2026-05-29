========================================================================
    VIDEO RECORDING & ASSEMBLY LIBRARY — INTEGRATION & TROUBLESHOOTING
========================================================================
Version: v1.8.0-fully-encapsulated (Self-Supported Desktop/Mobile Edition)
Date: May 2026

This directory contains a self-contained, high-performance, in-browser
video recording and assembly engine. It is capable of capturing raw canvas
rendering frames (including dense WebGL scenes) and synthesizing them into
high-quality MP4/H.264, WebM, or ZIP packages directly inside the browser
using WebAssembly (FFmpeg.wasm) and the Origin Private File System (OPFS).

All vital libraries and non-downloadable binary loaders are bundled directly
within this folder's subdirectories, making the whole library fully portable
and easily drag-and-drop integration-friendly!

------------------------------------------------------------------------
1. DIRECTORY AND FILE STRUCTURE
------------------------------------------------------------------------
The recording library is fully housed inside the following flat directory structure:

recorder-library/
├── recording.js            # Primary orchestrator managing capture loop, resizing and state.
├── assembly.js             # Background FFmpeg compiler manager.
├── video-filters.js        # Computes dimension alignments (modulo limits & cropping).
├── ffmpeg-loader.js        # Handles async WebAssembly module orchestration and caching.
├── ffmpeg-commands.js      # Builds optimized CLI compiling parameters for WebAssembly.
├── zip-export.js           # Streams captures to client ZIP structures (powered by local JSZip).
├── fetch-from-cdn.js       # Manages CDN fallback downloads with SHA-256 validation.
├── README.txt              # Standard manual and troubleshooting files (This file).
├── specifications.md       # Comprehensive technical manual and architectural spec sheets.
│
├── example/                # COMPACT INTERACTIVE IMPLEMENTATION MANUAL
│   ├── index.html          # Self-contained reference layout with Three.js importmaps set at absolute peak <head>
│   └── main.js             # Implements TorusKnot animation, wires all controls, overlays & logging HUD consoles
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

------------------------------------------------------------------------
2. SECURE ORIGIN POLICY & INTEGRITY VERIFICATION (ATOMIC CDN FALLBACK)
------------------------------------------------------------------------
To meet modern browser Origin Security Policies (such as CORS, sandboxing, and safe context
restrictions), the loading sequence for FFmpeg.wasm core binaries functions as a secure,
atomic loading system:

1. Local Vendor Cache Lookup (Priority 1):
   The loader tries to grab base modules locally first. If they exist on your local server 
   under `./js/recorder-library/vendor/ffmpeg/`, they are loaded instantly with no outward network calls.

2. Browser Sandboxed OPFS Cache (Priority 2):
   If local binary files are missing or can't be hosted due to size restrictions, the loader
   queries the browser's persistent sandboxed Origin Private File System (OPFS) directory
   under `vendor/ffmpeg/`. If verified cache markers (`st-loaded.ok` or `mt-loaded.ok`) are present,
   the files are loaded dynamically from sandboxed browser space with zero server requests.

3. Symmetrical CDN Fallback with Signature Matching (Priority 3):
   If both local and OPFS structures are dry (such as on first-fire onboarding), a single,
   secure atomic network transaction pulls the matching version of `@ffmpeg/core` (0.12.6) 
   direct from certified CDNs (jsDelivr / unpkg) in raw array buffer format. 
   
   To protect against network injection or routing compromises, the system performs a
   full cryptographic SHA-256 hash checksum calculation on the binary arrays before registering
   them. Only verified binaries are saved to OPFS, finalizing the atomic transaction.
   
   Note: Secure contexts (HTTPS or localhost) are required. SharedArrayBuffer requires
   COOP/COEP headers to enable Multi-Threaded compilation. If they are blocked, the library
   automatically degrades gracefully to Single-Threaded mode.

------------------------------------------------------------------------
3. HOW TO INTEGRATE THE RECORDING LIBRARY IN A NEW PROJECT
========================================================================

Step A: Copy the Library Folder
-------------------------------
Simply duplicate the entire `js/recorder-library/` folder into your new project's structure.

Step B: Reference the Scripts in index.html
------------------------------------------
Add the base vendor JS files within your main HTML `<head>` block. Ensure paths align:
```html
<!-- Encapsulated Recorder Library base dependencies -->
<script src="js/recorder-library/vendor/ffmpeg/ffmpeg.js?v=fresh10"></script>
<script src="js/recorder-library/vendor/jszip/jszip.min.js?v=fresh10"></script>
<script src="js/recorder-library/vendor/file-saver/FileSaver.min.js?v=fresh10"></script>
```

Step C: JS Code Integration Callouts
------------------------------------
In your main application script:

1. Import the main engine class:
   ```javascript
   import RecordingEngine from './js/recorder-library/recording.js';
   ```

2. Symmetrically instantiate the manager inside your window layout setup:
   ```javascript
   const recorder = new RecordingEngine({
     exportFPS: 60,              // Framing rate (30 or 60)
     exportFormat: 'mp4',        // Output target: 'mp4', 'webm', or 'zip'
     exportPipeline: 'ffmpeg',   // Render pipeline: 'ffmpeg' (compiles video) or 'zip'
     exportWidth: 1280,          // Canvas target render resolution width
     exportHeight: 720,          // Canvas target render resolution height
     camera: camera,             // Three.js Camera reference
     exportTrim: 'none'          // WebM height trim bounds (default 'none')
   });
   ```

3. Initialize renderer hooks:
   ```javascript
   recorder.init(renderer.domElement, renderer);
   ```

4. Place the capture frames call straight inside your central animation rendering tick:
   ```javascript
   function tick() {
     requestAnimationFrame(tick);
     
     // Step physical models...
     
     // Render Three.js viewport
     renderer.render(scene, camera);
     
     // Automatically capture active frame metrics
     recorder.captureFrame();
   }
   ```

5. Coordinate user actions to starting/stopping functions:
   ```javascript
   // Starting recording state
   document.getElementById("btn-start").addEventListener("click", () => {
     recorder.startRecording();
   });

   // Stopping capture and compiling file download
   document.getElementById("btn-stop").addEventListener("click", async () => {
     const compiledBlob = await recorder.stopRecording();
     const url = URL.createObjectURL(compiledBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `rendered_session_${Date.now()}.mp4`;
     a.click();
     URL.revokeObjectURL(url);
   });
   ```

------------------------------------------------------------------------
4. CORE TROUBLESHOOTING CHECKLIST
------------------------------------------------------------------------
If experiencing visual degradation, download interruptions, or browser crashes:

[ ] Are you seeing "SharedArrayBuffer is not defined" or "Fallback Active"?
    - EXPLANATION: This occurs when the hosting server is not serving Cross-Origin Isolation
      headers (unlocked only in secure context). It is normal! The engine automatically
      detects this and gracefully falls back to Single Threaded (ST) WebM rendering,
      which is extremely stable.
    - RE-ENABLING MT: If you want Multi-Threaded assembly speeds, ensure the server
      serving the page responds with these headers:
        - `Cross-Origin-Embedder-Policy: require-corp`
        - `Cross-Origin-Opener-Policy: same-origin`

[ ] Macroblock Division Errors (Video Synthesizer throws alignment errors)?
    - WebAssembly video synthesizers require widths and heights divisible by 2,
      and for standard H.264, ideally divisible by 8 or 16.
    - Our helper script `video-filters.js` automatically handles this by slicing canvas
      rendering resolutions to Mod-2 widescreen alignments (`Math.floor(x / 2) * 2`).
      Ensure custom sizing attributes maintain this division.

[ ] Is the active tab crashing with Out-of-Memory (OOM) alerts on long records?
    - If recording lots of frames, switch the pipeline or utilize ZIP Export mode.
    - Reduce the export size to 720p (1280x720) or 480p to lower RAM allocations.
    - Remember to call `URL.revokeObjectURL()` once you've saved downloaded targets.

[ ] First frame black / missing WebGL visuals?
    - WebGL canvases wipe their drawing buffer cleanly on every monitor refresh cycle
      for performance. Ensure that in your Three.js options, you pass:
      `preserveDrawingBuffer: true` (or fetch pixels synchronously immediately within the
      same script block as the raw `.render()` call, which our Recording System handles
      impeccably).

------------------------------------------------------------------------
5. INTERACTIVE TESTING REFERENCE PORT
------------------------------------------------------------------------
To see all of the pieces functioning in a cohesive ecosystem:
- Open your browser to `/js/recorder-library/example/index.html` (e.g. http://localhost:3000/js/recorder-library/example/)
- You will find a rotating 3D Torus Knot toy scene utilizing native ES modules.
- The import maps reside at the immediate top of index.html as standard, and all visual HUD templates, status metrics, and standard output terminals function interactively.

========================================================================
                          Enjoy the Soliton Lab!
========================================================================
