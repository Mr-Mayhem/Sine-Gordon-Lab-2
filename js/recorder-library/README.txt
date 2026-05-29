========================================================================
    VIDEO RECORDING & ASSEMBLY LIBRARY — INTEGRATION & TROUBLESHOOTING
========================================================================
Version: v1.7.0-hybrid-ts (Optimized Memory Allocation Edition)
Date: May 2026

This directory contains a self-contained, high-performance, in-browser
video recording and assembly engine. It is capable of capturing raw canvas
rendering frames (including dense WebGL scenes) and synthesizing them into
high-quality MP4/H.264, WebM, or ZIP packages directly inside the browser
using WebAssembly (FFmpeg.wasm) and the Origin Private File System (OPFS).

------------------------------------------------------------------------
1. HOW TO COPY AND USE THE RECORDING LIBRARY IN A NEW PROJECT
------------------------------------------------------------------------
To move this module over to a brand-new application, follow this guide:

Step A: Copy the Library Directory
---------------------------------
Copy the entire `js/recorder-library/` folder into your new project.
Ensure all of the following module files are present:
- `recording.js`       : Primary orchestrator managing capture loop & state.
- `assembly.js`        : Background FFmpeg compiler manager.
- `video-filters.js`   : Computes dimension alignments (modulo limits & cropping).
- `ffmpeg-loader.js`   : Handles async WebAssembly module orchestration.
- `ffmpeg-commands.js` : Builds optimized CLI compiling parameters.
- `zip-export.js`      : Streams captures to client ZIP structures (packaged via JSZip).
- `fetch-from-cdn.js`  : Retries downloading assets from fallback sources.

Step B: Copy the Dependency Files (Mandatory Vendor Assets)
----------------------------------------------------------
The compiler relies on specific WebAssembly core blobs and helper libraries.
To ensure full offline capabilities, copy these files into your new project's
vendor/ assets directory (and match your project structure):
1. JSZip Package (for ZIP packaging):
   - Copy `vendor/jszip/jszip.min.js`
2. FileSaver Utility (for initiating saving procedures):
   - Copy `vendor/file-saver/FileSaver.min.js`
3. WebAssembly FFmpeg Workers:
   - Copy the entire `vendor/ffmpeg/` directory (which contains `ffmpeg.js`,
     `814.ffmpeg.js`, `ffmpeg-core.js`, `ffmpeg-core-mt.js`, etc.)

Step C: Code Integration Walkthrough
------------------------------------
In your main script (e.g. `main.js` or standard entry module):

1. Import the Recording Module at the top:
   import RecordingEngine from './js/recorder-library/recording.js';

2. Instantiate the engine inside your viewport setup function:
   const recorder = new RecordingEngine({
     exportFPS: 60,              // Framing speed (e.g. 30 or 60)
     exportFormat: 'mp4',        // Format option: 'mp4', 'webm', or 'zip'
     exportPipeline: 'ffmpeg',   // Set to 'ffmpeg' or 'zip'
     exportWidth: 1280,          // Recording scale target (e.g., 1280, 1920)
     exportHeight: 720,          // Recording scale vertical
     camera: camera,             // Three.js Camera reference (if adjusting viewports)
     exportFilename: 'my_project_capture' // Optional filename prefix
   });

3. Initialize the renderer attachment:
   recorder.init(renderer.domElement, renderer);

4. Register the hook in your RequestAnimationFrame render tick:
   function animate() {
     requestAnimationFrame(animate);
     
     // Step your physics simulation here...
     
     // Draw your 3D canvas
     renderer.render(scene, camera);
     
     // Intercept WebGL frames automatically
     recorder.captureFrame(); 
   }

5. Bind triggers to user buttons:
   // Start capturing
   document.getElementById("btn-start").addEventListener("click", () => {
     recorder.startRecording();
   });

   // Stop capture and initiate rendering download
   document.getElementById("btn-stop").addEventListener("click", async () => {
     const compiledBlob = await recorder.stopRecording();
     const url = URL.createObjectURL(compiledBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `rendered_capture_${Date.now()}.mp4`;
     a.click();
     URL.revokeObjectURL(url);
   });


------------------------------------------------------------------------
2. THE APPLE IPADOS & IOS MOBILE MEMORY PITFALL (COOLDOWN STRATEGY)
------------------------------------------------------------------------
Mobile and tablet Safari browsers (WebKit) impose strict RAM and thread
constraints. Running dense WebAssembly compiler loops on these devices can
easily cause a memory spike, leading to a silent browser reload/crash.

To address this, our framework includes the following mobile-specific
optimizations when sequential tests are running in the Diagnostics suite:

1. Dynamic Offloading:
   As soon as a diagnostics test concludes, the WebAssembly worker thread is
   immediately destroyed and freed via:
   `window.recorder._ffmpeg.terminate()` (or `.exit()`)
   All main thread references are set to null, and the internal frame array:
   `window.recorder._recordedFrames = []` is cleared outright.

2. Garbage Collector Breathing Padding:
   When a touch or mobile user agent (matching Android, iPhone, iPad, macOS 
   with maxTouchPoints > 0) is flagged, the transition delay between individual
   consecutive runs is automatically boosted from 800ms up to **3000ms (3s)**.
   This gives the browser's native garbage collection engine sufficient time
   to completely flush the memory heap of WebGL textures and image blobs before
   firing the next automated run.


------------------------------------------------------------------------
3. SAFARI / APPLE COMPATIBILITY: WEBM VS MP4 FOR WEB-VIDEOS
------------------------------------------------------------------------
A common question: "Why do 720p WebM videos not play on Apple tablets?"

- **The Limitation**: Apple native devices (iOS, iPadOS) and standard Safari
  do not support playing WebM (.webm) format natively within `<video>` tags
  or saving them to the system Photos library. This holds true even on
  modern, high-spec iPads and computers.
- **The Solution**: Users on Apple mobile devices (iPads/iPhones) must select
  **MP4** as their export format inside the application. MP4/H.264 formats have
  excellent universal support on WebKit browsers.
- **Alternate Route**: If a user on iPad/iPhone downloads a WebM file, they
  will need alternative media viewers such as "VLC for Mobile" or similar apps
  to process and render the codec, or transcode the file on a separate computer.


------------------------------------------------------------------------
4. CORE TROUBLESHOOTING CHECKLIST
------------------------------------------------------------------------
If something goes wrong (errors, crashes, static captures), verify these checks:

[ ] Are you seeing "SharedArrayBuffer is not defined" or "Fallback Active"?
    - EXPLANATION: This occurs when the server is not serving Cross-Origin Isolation
      headers (unlocked only in secure context). It is normal! The engine automatically
      detects this and gracefully falls back to Single Threaded (ST) WebM rendering,
      which is extremely stable.
    - RE-ENABLING MT: If you want Multi-Threaded assembly speeds, ensure the server
      serving the page responds with these headers:
        - `Cross-Origin-Embedder-Policy: require-corp`
        - `Cross-Origin-Opener-Policy: same-origin`

[ ] Macroblock Division Errors (Video Synthesizer throws alignment errors)?
    - WebAssembly video synthesizers require widths and heights is divisible by 2,
      and for standard H.264, ideally divisible by 8 or 16.
    - Check `video-filters.js` inside the code folder. It automatically forces
      your frame sizing bounds into even, safe bounds (`Math.floor(x / 2) * 2`).
      Ensure any custom code edits of export resolutions maintain this modular alignment.

[ ] Is the active tab crashing with Out-of-Memory (OOM) alerts on long records?
    - If recording lots of frames, switch the pipeline. Check if ZIP Export mode is sufficient.
    - Reduce the export size to 720p (1280x720) or 480p to lower RAM allocations, and ensure
      that your recording does not include unneeded elements.
    - Double-check that your render code releases temporary canvas context pointers and calls
      `URL.revokeObjectURL(tUrl)` immediately inside image loading blocks.

[ ] First frame black / missing visuals?
    - WebGL canvases wipe their drawing buffer cleanly on every monitor refresh cycle
      for performance. Ensure that in your Three.js options, you pass:
      `preserveDrawingBuffer: true` (or fetch pixels synchronously immediately within the
      same script block as the raw `.render()` call, which our Recording System handles
      impeccably).

========================================================================
                          Enjoy the Soliton Lab!
========================================================================
