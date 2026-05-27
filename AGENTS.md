# AGENTS.md — Persistent Developer Guidelines & Safeguards

This file defines the high-priority architectural rules, major pitfalls, technical specifications, mathematical foundations, and resolution strategies for the **Sine-Gordon Lab**. It is automatically loaded by the AI Studio build system to prevent recurring regressions during subsequent iterative engineering sessions.

---

## 1. HIERARCHY OF PRIORITIES

When modifying or expanding the Sine-Gordon Lab, always prioritize tasks in the following strict order:

1. **Runtime Stability & Integrity (Highest)**: The application must boot immediately with zero browser console errors.
2. **Strict ESM Browser Resolution**: We use browser-native standard ES Modules (ESM) *without a bundler compilation layer*.
3. **Responsive Visual Polish & Alignment**: Layouts, margins, and canvas sizing must scale fluidly across desktop, tablet, and mobile screens.
4. **Functional Precision (Strict Scope Ceiling)**: Only implement features explicitly requested by the user. Refuse to add unrequested telemetry, system state displays, or generic controls.

---

## 2. THE THREE.JS IMPORTMAP PITFALL (MOST CRITICAL SAVIOR)

### The Pitfall
In modern browser environments, running native ES Modules with `import * as THREE from 'three'` creates a **bare specifier**. If the browser attempts to parse, preload, or load any ES module *before* the importmap is fully compiled and registered, it throws a fatal, unrecoverable TypeError:
> `TypeError: The specifier "three" was a bare specifier, but was not remapped to anything.`

### Why AI Agents Regularly Break This
AI agents are heavily pre-trained on bundler-based pipelines (Vite, Next.js, Webpack) where Node resolves bare specifiers at compile time. During general maintenance—such as reordering tags, updating viewport scales, adding metadata, or doing head cleanups—agents commonly:
* Reorder `<link rel="modulepreload">` tags or ES Module scripts *above* the `<script type="importmap">`.
* Simplify or consolidate `<head>` tags, thinking the importmap is redundant or can be handled by Node.

### Ultimate Rules for importmap
1. **Absolute Peak Placement**: The `<script type="importmap">` **MUST** be the absolute first child of the `<head>` element in `index.html`, before any style link, viewport meta, preloads, or module scripts.
2. **Duplicate Entry Mapping**: Ensure both directory-nested and absolute specifier mappings exist using root-relative pathing (preventing relative path resolution breakages within subdirectories):
   ```json
   "imports": {
     "three": "/vendor/three/three.module.js",
     "three/": "/vendor/three/",
     "three/addons/": "/vendor/three/addons/"
   }
   ```
3. **No Bare Specifier Removals**: Never alter, remove, or comment out the `importmap` from the HTML file.

---

## 3. TECHNICAL SPECIFICATIONS & REFERENCE MANUAL

Exploring the relativistic soliton dynamics of the discrete Sine-Gordon equation on coupled pendulum chains using browser-native ES modules and a zero-dependency full-stack server.

### 3.1 Project Overview and Key Capabilities
The **Sine-Gordon Lab** is an interactive, browser-native 3D physics laboratory implementing a discrete, numerical simulation of the relativistic **Sine-Gordon equation**. By modeling a chain of coupled torsion pendulums with non-linear gravitational restoration, users can observe, manipulate, inject, and export topological and non-topological solitons (Kinks, Antikinks, Breathers) and breathers. 

* **Three Topology Modes**:
  * **Linear**: Standard straight chain with optional periodic boundaries (wrapping).
  * **Circular**: Closed continuous ring.
  * **Lemniscate**: Double-loop structures mapped via specialty curves (Lemniscates of Gerono & Bernoulli) with variable structural twists.
* **Dual-Channel Impulse Injection**: Interactive impulse injection at user-customized spots (Sites A & B) featuring adjustable sharpness, velocity, and polarity. Modes include:
  * **Kink (CW/CCW Rotation)**
  * **Antikink (CCW/CW Rotation)**
  * **Breather (Local Oscillatory Packets)**
  * **Wind (Continuous helical twisting field)**
* **Real-time 3D Rendering & Aesthetics**: Real-time rendering powered by Three.js with custom GLSL shaders, color gamut expansion based on phase speed, and a dark glassmorphism glass dashboard.
* **Professional Export System**:
  * **FFmpeg.wasm Video Assembly**: In-browser video synthesis yielding containerized **WebM** or **MP4** files, configured with crop-to-fit aspect ratio retention and mod-2/mod-4 alignment filters.
  * **Telemetry Snapshot**: Complete spreadsheet-compatible `.json` data dump containing the absolute physical coordinates ($\phi$, $\dot{\phi}$, $\ddot{\phi}$) across every temporal sequence.
  * **Standalone ZIP Capture**: Streamed frame-by-frame static PNG capturing bundled via non-blocking JSZip pipelines requiring minimal memory overhead.

### 3.2 Directory Structure
The project has been architected to adhere to a clean, build-free flat directory structure leveraging native ES Modules:

```
sine-gordon-lab/
├── index.html                       # Entry point, full DOM structure, and import map
├── style.css                        # Glassmorphism aesthetic theme and embedded assets
├── favicon.ico                      # Custom application logotype icon
├── server.js                        # Zero-dependency, HTTPS-capable full-stack static web server
├── package.json                     # System scripts ("dev", "build", "start", "lint")
├── metadata.json                    # Platform capabilities list
│
├── js/                              # Core application logic as flat ES Modules
│   ├── main.js                      # Bootstrap, scene initialization, UI builders, grid geometry
│   ├── state.js                     # Shared mutable global state (non-persistent)
│   ├── physics.js                   # Discrete Runge-Kutta / leapfrog physical integrator
│   ├── pipeline.js                  # Processing pipeline compiling physics into render-ready frames
│   ├── scene-renderer.js            # Three.js 3D viewport, lighting, and camera management
│   ├── recording.js                 # Frame grabbing and background compilation orchestration
│   ├── ffmpeg-commands.js           # FFmpeg command builder and progress parser
│   ├── video-filters.js             # Resolution recipes and FFmpeg scale/crop filters
│   ├── snapshot.js                  # Standalone client-side web image generator
│   ├── ui-thumbs.js                 # UI counter widgets and thumbs event controllers
│   ├── telemetry.js                 # Metric collection and telemetry formatting
│   ├── events.js                    # Core event loop bindings and button interactions
│   ├── animation.js                 # Central requestAnimationFrame tick pipeline
│   ├── gimbal.js                    # Nested 3-axis visual gimbal rings
│   └── zip-export.js                # Optimized, low-memory streamed JSZip packaging
│
└── vendor/                          # Fully self-hosted third-party assets
    ├── three/
    │   ├── three.module.js          # Raw Three.js ES Module
    │   └── addons/
    │       └── controls/
    │           └── OrbitControls.js # Standard Three.js Orbit Controls
    ├── ffmpeg/
    │   ├── ffmpeg.js                # FFmpeg script loader
    │   ├── 814.ffmpeg.js            # FFmpeg.wasm ESM worker loader
    │   ├── ffmpeg-core.js           # Single threaded JS bindings (Fallback)
    │   ├── ffmpeg-core-mt.js        # Multi threaded JS bindings
    │   └── ffmpeg-core.worker.js    # Multi threaded worker routines
    ├── jszip/
    │   └── jszip.min.js             # JSZip vendor library
    └── file-saver/
        └── FileSaver.min.js         # FileSaver vendor utility
```

### 3.3 Data Flow Architecture
The simulation updates along a unidirectional pipeline executed inside a central requestAnimationFrame tick loop:

```
    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────────┐
    │ Physics  │───→│ Pipeline │───→│  Scene    │───→│ WebGLRenderer│
    │ .step()  │    │ .process │    │ .render() │    │   .render()  │
    └──────────┘    └──────────┘    └───────────┘    └──────────────┘
         │               │               │                  │
    phi[], v[],    FrameData obj    Three.js objects    GPU draw call
    acc[]          {positions,      (InstancedMesh,
                    glowPos/Neg,     LineSegments,
                    ghostState,      Mesh, etc.)
                    ticState,
                    rangeState,
                    markerA/B}

    ┌──────────┐    ┌──────────┐
    │  State   │←───│  Events  │   User input → state mutations
    │ (global) │    │  / UI    │
    └──────────┘    └──────────┘
         │
         └──────────────→ refreshUI() → DOM Updates & UI Elements Rendering
```

### 3.4 Mathematical Formulations & Physics Engine
The motion of the $i$-th pendulum is governed by the second-order ODE representing the discrete Sine-Gordon equation:

$$ \frac{d^2 \phi_i}{dt^2} = \kappa \left( \phi_{i+1} - 2\phi_i + \phi_{i-1} \right) - \gamma \frac{d\phi_i}{dt} - g \sin(\phi_i) + T_{\text{inertial}} $$

Where:
* **Coupling Term ($\kappa$)**: Represents torsion springs connecting adjacent pendulums. Under periodic topologies, indices wrap such that $i+1 \equiv (i+1) \bmod N$.
* **Damping ($\gamma$)**: Represents local drag forces.
* **Restoring Gravity ($g$)**: Restores pendulums towards the vertical axis of stable equilibrium. If $g < 0$, the pendulum chain flips orientation, centering stable equilibrium at state $\phi = \pi$.

#### Gimbal Inertial Couplings ($T_{\text{inertial}}$)
When the visual nested gimbal rings are activated, the laboratory simulates the physical consequences of moving frames including Coriolis, Centrifugal, and Euler torques:
* **Simplified Mode**: Simulates centrifugal torque generated under continuous steady axial rotation at vertical angular velocity $\Omega_y$:

  $$ T_{\text{centrifugal}} = - \frac{\Omega_y^2}{L} \cos(\phi_i) \left( R_{\text{trans}} - L \sin(\phi_i) \right) $$

* **Full Rigorous Mode**: Translates the full dynamic rotation matrix across coordinate axes. Resolves 3D angular velocities $\vec{\Omega}$ and acceleration vectors $\vec{\dot{\Omega}}$ across local coordinates to determine instantaneous Euler and centrifugal accelerations.

#### Symmetrical Soliton Injection
Kinks are injected by mapping analytical spatial forms onto the discrete array. The phase assignment is defined as:

$$ \phi_i = \phi_i^0 + A \cdot 4 \arctan\left( \exp\left( \frac{x_i - x_0}{W_{\text{eff}}} \right) \right) $$

With conjugate velocities:

$$ \dot{\phi}_i = \dot{\phi}_i^0 \pm v_{\text{launch}} \cdot A \cdot \frac{2}{W_{\text{eff}}} \operatorname{sech}\left( \frac{x_i - x_0}{W_{\text{eff}}} \right) $$

Where:
* $W_{\text{eff}} = \max\left( W_0 \cdot \sqrt{1 - \frac{v^2}{\kappa}}, 1.5 \right)$ represents the relativistic Lorentz contraction limit adjusted to prevent sub-lattice pinning (Peierls-Nabarro barrier).
* A small relaxation stage (4 simulation steps using high local damping of $\gamma = 0.3$) is automatically executed post-injection to absorb high-frequency lattice noise.

---

## 4. CRITICAL PITFALLS, SOLUTIONS, & RESOLVER BLUEPRINTS

### 4.1 Non-Widescreen Aspect Stretching
* **The Pitfall**: Video recordings or canvas outputs being stretched or containing black letterboxes/pillarboxes when resolution defaults to rigid dimensions.
* **The Resolution**: Use standard modulo-2 dimensions (`Math.floor(value / 2) * 2`) instead of modulo-16. Introduce a dynamic crop-to-fit filter in the FFmpeg assembly phase using:
  `scale=W:H:force_original_aspect_ratio=increase,crop=W:H`
  This ensures the exported canvas matches modern standard aspect ratios beautifully without distorting the simulated physics visual grid.

### 4.2 H.264 Macroblock Boundaries & Widescreen Remapping
* **The Pitfall**: Standard 480p is commonly listed as 854x480. However, the number `854` is not divisible by 4 (nor 8 or 16), which triggers H.264 (libx264) macroblock alignment errors or decoders rendering ugly green boundary stripes or crashing entirely on export.
* **The Precision Recipe**: Remap standard resolutions to strictly compliant Mod-8 or Mod-16 boundaries:
  - Remap **854x480** to exact Mod-4 widescreen **852x480** (aspect ratio 1.775:1), which compiles perfectly inside standard H.264 video streams.
  - Employ square pixel output properties (`setsar=1`) and standard Lanczos scale/crop-to-fit parameters inside the filters to prevent canvas pixel distortion.

```js
export const FFMPEG_RESOLUTIONS_RECIPES = {
  "640x360": {
    width: 640,
    height: 360,
    filter: "scale=640:360:force_original_aspect_ratio=increase:flags=lanczos,crop=640:360,setsar=1"
  },
  "854x480": {
    width: 852,
    height: 480,
    filter: "scale=852:480:force_original_aspect_ratio=increase:flags=lanczos,crop=852:480,setsar=1"
  },
  "1280x720": {
    width: 1280,
    height: 720,
    filter: "scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720,setsar=1"
  },
  "1920x1080": {
    width: 1920,
    height: 1080,
    filter: "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1"
  },
  "2560x1440": {
    width: 2560,
    height: 1440,
    filter: "scale=2560:1440:force_original_aspect_ratio=increase:flags=lanczos,crop=2560:1440,setsar=1"
  },
  "3840x2160": {
    width: 3840,
    height: 2160,
    filter: "scale=3840:2160:force_original_aspect_ratio=increase:flags=lanczos,crop=3840:2160,setsar=1"
  }
};
```

### 4.3 Canvas Context Self-Draw Collision
* **The Pitfall**: Reusing a single temporary canvas for both pixel reading and coordinate vertical inversion (y-flip) causes browser horizontal clipping or blank frame compilation.
* **The Resolution**: Keep separate source and destination canvas buffers in GPU storage. Draw the active WebGL canvas raw frames onto a `_rawCanvas` (for pristine pixel capture with no interface scaling or thread blocking), and project it onto the destination context inversion matrix cleanly.

### 4.4 Multi-threaded FFmpeg.wasm Re-entry Crash & RAM Saturation (Unified OPFS Architecture)
* **The Pitfall**: Capturing high-resolution canvas frames at 60fps easily saturates RAM inside the browser tab, leading to abrupt page crashes (OOM errors) or memory leaks. Furthermore, passing raw references of `Uint8Array` byte buffers directly to FFmpeg memory transfers can detach arrays or freeze multi-threaded background workers, crashing sequential assemblies. Additionally, writing hundreds of high-resolution (e.g. 1440p or 4K) raw uncompressed frames to MEMFS and running single-pass assembly easily exceeds the 2GB WebAssembly heap restriction, triggering instant VM crashes.
* **The Resolution (Unified Safe Stream & Dynamic Bounds)**:
  1. **Unified OPFS Storage Loop**: Both the "direct" video-rendering (MP4/WebM) and standard "ZIP export" pipelines use the exact same file-streaming model. Rather than holding huge frame arrays in main RAM, frames are written immediately to a temporary sub-directory via the high-speed, sandboxed **Origin Private File System (OPFS)** (`navigator.storage.getDirectory()`).
  2. **Zero-leak Lifetime Management**: When FFmpeg assembly completes or is aborted, the temporary directory is recursively deleted (`root.removeEntry(tempDir, { recursive: true })`) to completely eliminate storage waste.
  3. **Resolution-Aware Pipeline Router (`shouldUseChunkedAssembly`)**: Instead of a hardcoded 1500-frame threshold for all videos, the system evaluates the frame pixel overhead. If the resolution is extremely high, we route to the chunked memory-safe pipeline much sooner to protect the WASM heap:
     - **4K (3840x2160)**: Chunked assembly is triggered if the recording exceeds **30 frames**.
     - **1440p (2560x1440)**: Chunked assembly is triggered if the recording exceeds **60 frames**.
     - **1080p (1920x1080)**: Chunked assembly is triggered if the recording exceeds **120 frames**.
     - **720p and below**: Uses the default **1500 frames** threshold.
  4. **Dynamic Chunk Size Boundaries**: In the chunked assembly phase, `CHUNK_SIZE` scales dynamically based on the rendering resolution to keep peak allocations under ~150MB of heap:
     - **4K**: `CHUNK_SIZE = 40` frames
     - **1440p**: `CHUNK_SIZE = 75` frames
     - **1080p**: `CHUNK_SIZE = 100` frames
     - **720p and below**: `CHUNK_SIZE = 150` frames
  5. **Low-Weight Processing Profiles**: To avoid CPU bottlenecks that crash browser worker thresholds, WebM (VP8) videos are built with the high-speed `-deadline realtime` profile and `-cpu-used 4/5` flags. MP4 (H.264) videos rendered in high density (1440p/4K) automatically swap the heavy default preset for `-preset veryfast` to maintain pristine performance on a single-threaded WebAssembly execution.

### 4.5 Persistent Save/Open Directories (Chromium Native ID Association)
* **The Pitfall**: In web apps with rich export and offline assembly workflows, every time a user triggers a ZIP save or wants to open/upload a zip file, standard browser fallbacks force the local system's directory dialogue to reset to the computer's generic default directory (such as `/Downloads` or `/Documents`). This breaks continuity during laboratory sessions where users export sequentially or load files from a designated project workspace.
* **The Resolution (Shared Native Browser Picker IDs)**:
  1. **Strictly Shared Identifiers**: We assign the exact same `id: 'zip-export'` parameter across all invocations of `showSaveFilePicker` and `showOpenFilePicker`.
  2. **Native Path Tracking**: Chromium-based browsers recognize matching IDs and natively anchor the active file prompts (whether saving or opening) back into the user's exact host folder (e.g., standard Windows File Explorer or macOS Finder directories) from the previous action. This guarantees elegant, zero-overhead offline continuity without complex security exceptions:
     ```js
     const pickerOpts = {
       id: 'zip-export',
       types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }]
     };
     const handle = await window.showSaveFilePicker(pickerOpts);
     ```

### 4.6 Direct ZIP Assembly Layout Alignment (Jitter-Free Stacking)
* **The Pitfall**: Coupling export, record, and offline assembly actions specifically to the `zip` pipeline selection option can cause layout shifting, dropdown misalignment, or sudden element jumps if the action dropdown is toggled with aggressive display layout changes.
* **The Resolution (Jitter-Free Visibility & Stacked Alignment Control)**:
  1. **Clean Stacked Hierarchy**: In the UI, structure the main export pipeline format dropdown (FFmpeg, OPFS, ZIP) directly on top, and place the Record/Assemble action dropdown directly below it.
  2. **Jitter-Free State Toggles**: Symmetrically manage the action select dropdown state with `visibility: hidden; pointer-events: none` when non-zip pipelines are active. This retains the exact spatial dimensions and prevents components from jumping or popping vertically.
  3. **Secure Action Binding**: Symmetrically disable user controls and update state indicators (`isAssembling: true`) when assembly or extraction pipelines are busy, locking potential state conflicts.

### 4.7 Resolution-Aware Frame Discovery & UI Synchronization
* **The Pitfall**: Direct Assembly or Offline ZIP extraction pipelines must parse arbitrary, unpredictable custom resolutions of stored frames. If the assembler blindly operates on default dropdown dimensions, high-resolution imported archives (e.g. 1440p or 4K PNG frames) will be distorted, cropped, stretched, or generate invalid MP4 streams.
* **The Resolution**:
  1. **Binary Metadata Reading**: When opening an archive or loading from OPFS, the system extracts the first frame PNG bytes and uses standard binary chunk analysis to parse its exact physical dimensions (`width` and `height`) directly from the IHDR chunk.
  2. **State & UI Back-Syncing**: Once parsed, the simulation's state (`appState`) updates its target output dimensions automatically to match.
  3. **Programmatic Dropdown Insertion**: Symmetrically sync the resolution selector (`#sel-res`) dropdown. If the imported resolution does not match any current options, a placeholder is dynamically generated, injected, and selected (e.g., `"3840x2160 (Detected from Import)"`), guaranteeing pixel-perfect scaling alignment without manual intervention.

### 4.8 Unified Filename Consistency Across Pipelines
* **The Pitfall**: Unaligned file-saving and zip-packaging pipelines lead to mismatched export nomenclature (`frames_[Date].zip` vs `output.mp4`), hindering workspace cohesion and tracking.
* **The Resolution**: Symmetrically override all naming utilities to output consistent, recognizable filenames starting with the specific simulation laboratory prefix: `sg_lab_render_${Date.now()}`. This applies uniformly to direct MP4 compilations, WebM videos, and structured ZIP file downloads.

### 4.9 High-Density Thread & Stream Tuning for H.264 WebAssembly
* **The Pitfall**: Standard Web Assembly decoders crash (VM Abort / OOM) under large resolution frames during intermediate containerization tasks. For instance, concatenating raw sub-sequences of high-density streams at 4K resolution using standard macroblock boundaries leaks heap metadata if processed standard threads overlap.
* **The Resolution**:
  1. **Single-Thread Bottleneck Management**: Limit `-threads 1` for H.264 encoding when the resolution scale exceeds modern 1080p thresholds to keep heap usage extremely low.
  2. **Lookahead Optimization**: Reduce encoder buffer complexity dynamically using `-rc-lookahead 5` (down from standard `15`) for high density scales.
  3. **Standard Level Enforcement**: Apply dynamic level constraints (auto-scaling to `-level:v 5.2` above 1080p, and `-level:v 5.1` for standard density streams) to comply with H.264 macroblock rate caps. Strictly enforce constant frame rates (`-r`) on all chunks and inject `-fflags +genpts` during concat stages to bypass keyframe artifacts, timing stutters, and visual shifts. Use format-compliant MPEG-Transport streams (`.ts`) for chunk-level compilation instead of sub-nested `.mp4` containers. Raw `.ts` envelopes concatenate instantaneously without structural parses, preventing thread crashes on final containerization.
  4. **Dynamic Atom Repositioning**: Append `-movflags +faststart` during single-chunk optimization, placing the index metadata (`moov` atom) at the head of the output stream instantly.

### 4.10 Over-Engineering, Tech-Larping, & "AI-Slop"
* **The Pitfall**: Adding unrequested technical decorations (e.g., "CORE_NODE_ONLINE", "PORT: 3000", custom grid coordinates) to make the simulation look more "complex."
* **The Resolution**: Keep labels literal, human, and modest. If the user asks for a simple mathematical control, implement ONLY that control cleanly, utilizing generous white space and high-contrast styling.

### 4.11 Onboarding Gate ("First Fire")
* **The Pitfall**: Users launching the lab with a passive stable vacuum state are often confused about how to initiate solitons. Without clear direction, running or pausing an unperturbed system appears static.
* **The Resolution (First-Fire Hook)**:
  1. **Control Gating**: Hide the primary playback controls container (`#playback-controls-container` containing Play, Step, and Reset buttons) entirely behind state flags (`sgState.hasFiredAtLeastOnce`) on startup.
  2. **Interactive Onboarding Blink**: Attach a modern attention-grabbing keyframe animation (`animate-fire-onboarding`) to the **FIRE** button (`#btn-fire`) on load to coach the user to inject their first wave packet.
  3. **Auto-Unlocking**: Upon the very first trigger of the Fire button, permanently unlock playback controls, dismiss the blinking stylesheet classes, and update UI state uniformly.

### 4.12 Embedded Scrolling Log Console
* **The Pitfall**: WebAssembly video compilation and raw file extraction workflows run in nested asynchronous worker targets. If a task fails, developers and users have to open browser inspector panels to understand the error context.
* **The Resolution (Inline Log Window)**:
  1. **Console Interception**: Inject lightweight custom hooks overriding standard browser `console.log`, `console.warn`, and `console.error` methods, safely feeding stringified arguments into an active state-array.
  2. **Scrolling HUD Box**: Embed an expanded 380px high dedicated terminal console container (`#assembly-log-container`) positioned below the high-density aspect-ratio preview block. Position header titles and reactive status badges side-by-side in a horizontal row at the very top of the window, immediately pulling up the preview canvas.
  3. **Visual Message Tracking**: Filter incoming logs dynamically, highlighting warnings in light amber, fatal compilation aborts in red, system state handshakes in muted gray, and successful assembly steps in emerald green. Employ a robust cascading scroll-pinning routine (synchronous element bottom scrolling followed by dual asynchronous backup macro-tasks at 0ms and 50ms) to ensure the HUD container is securely anchored to the newest log output regardless of render scheduling delays.

### 4.13 Integrated Diagnostics Clipboard Copy
* **The Pitfall**: Sharing assembly errors or pipeline details for troubleshooting requires selecting and copying formatted browser outputs, which is tricky inside overlay containers.
* **The Resolution (Diagnostic Utility)**:
  1. **Dedicated Clipboard Action**: Place an uppercase diagnostic click button (`#btn-copy-logs`) directly adjacent to the running message tracking header in the log panel.
  2. **Dual-Tier Copy Pipeline**: Attempt modern secure `navigator.clipboard.writeText` writing, with an immediate fallback to a temporary hidden `<textarea>` node selector under older context configurations or iframe nesting barriers.
  3. **Instant Micro-Feedback**: Swap the copy label text dynamically upon clicks, flashing a cyan `"COPIED!"` banner or red `"EMPTY"` notification to acknowledge state resolution before reverting back gracefully.

### 4.14 Auto-Dismissal of Assembly Overlay on Import Errors
* **The Pitfall**: When opening/loading a corrupted ZIP archive or importing raw files containing empty frames, the system triggers alert notifications. If active display layouts (the processing/assembly overlays) are initialized synchronously or asynchronously beforehand, leaving them displayed over the laboratory canvas leads to visual freezing or confusion.
* **The Resolution (Close-on-Alert Hook)**:
  1. **Dynamic Cleanup Paths**: Upon encountering empty directories (`frameFiles.length === 0`), invalid zip structure exceptions, or file validation failures, dismiss standard parent layouts immediately.
  2. **Secure Synchronous Chaining**: Call `.style.display = "none"` on active modal screens (`#processing-overlay`) directly inside the synchronous early-return handler blocks immediately following standard warning alerts. This returns the application seamlessly to interactive laboratory contexts as soon as standard browser popup alerts are confirmed and closed.

### 4.15 Environment-Sensitive Thread Diagnostics & Multi-Threaded Verification
* **The Pitfall**: Video transcode loops and automated pipeline scripts run in both Single-Threaded (ST) fallback and Multi-Threaded (MT) native WebAssembly modes depending on `SharedArrayBuffer` availability. If the diagnostics center or automated test suites fail to detect, log, and target specific assertions on the active execution context (e.g., expecting MT characteristics in sandboxed / iframe environments where COOP/COEP headers are disabled), testing logs become mismatched and difficult to debug.
* **The Resolution**:
  1. **Strict Context Diagnostics**: On initialization, the test suite queries and logs the presence of the `SharedArrayBuffer` API:
     - **MT Mode Enabled**: Safe COOP/COEP context (multi-threaded workers available).
     - **ST Fallback Active**: Sandboxed/restricted origin context (single-threaded assembly).
  2. **Thread-Targeted Config Verbosity**: Dynamically append a `Threads=` configuration parameter to the initial test log reports (`SINGLE-THREADED (ST)`, `MULTI-THREADED (MT)`, or `N/A` for still archives).
  3. **Reactive Assembly Logs**: Tailor assembly step prints (`[Assemble] ...`) to explicitly state the compilation mechanism (e.g. `FFmpeg WASM Multi-Threaded (MT) worker pools (SAB enabled)` vs `FFmpeg WASM Single-Threaded (ST) transcode loop`). This ensures flawless inspection, precise log validation on external servers, and clear, reproducible diagnostic trails.

### 4.16 Structural Control Panel State-Sync Integrity
* **The Pitfall**: In complex multi-window, persistent browser, or manual testing environments, global state parameters such as the active topology (`sgState.physics.topo`), linear wrapping state (`sgState.physics.linearWrap`), or screen orientation (`sgState.orientationTarget`) can get out of sync with raw DOM selectors (`#sel-topology`, `#sel-lemniscate-form`, `#btn-linear-wrap`, `#sel-orientation`). When different windows are loaded or re-initialized, the UI state dropdowns can display stale mock defaults while the underlying physics simulation runs on a different active mode.
* **The Resolution (Bi-directional UI Back-Syncing)**:
  1. On every single invocation of the baseline UI update pipeline (`refreshUI()`), programmatically force all high-level control dropdowns and dynamic buttons to re-align their active DOM properties to match the exact values held in the simulation state:
     - Always force selection state: `document.getElementById("sel-topology").value = sgState.physics.topo`.
     - Manage visibility arrays cleanly, showing/hiding `#sel-lemniscate-form` and `#btn-linear-wrap` depending on active layout modes.
     - Toggle class listings dynamically to keep button accent classes (`.active`) completely accurate.
  2. This guarantees absolute structural integrity across multiple tabs, device pivots, or window resizes, preventing stale DOM displays from masking active physical topologies.

---

## 5. VERIFICATION WORKFLOW
Before declaring any task complete, always execute these checks sequentially:
1. **Linter Check**: Run the CLI linter to verify syntax: `npm run lint`.
2. **Production Compilation Check**: Test compilation: `npm run build` or `compile_applet`.
3. **Browser Parse Verification**: Check that `<script type="importmap">` rests untouched at the peak of `<head>`.
