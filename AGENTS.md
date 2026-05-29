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
│   ├── snapshot.js                  # Standalone client-side web image generator
│   ├── ui-thumbs.js                 # UI counter widgets and thumbs event controllers
│   ├── telemetry.js                 # Metric collection and telemetry formatting
│   ├── events.js                    # Core event loop bindings and button interactions
│   ├── animation.js                 # Central requestAnimationFrame tick pipeline
│   ├── gimbal.js                    # Nested 3-axis visual gimbal rings
│   │
│   └── recorder-library/            # Self-contained browser recording and rendering assembly engine
│       ├── specifications.md        # Technical FAQ, API reference, and integration workflows
│       ├── recording.js             # Central class orchestrating frame capturing loop and pixel readback
│       ├── assembly.js              # Main video rendering supervisor delegating chunked conversions
│       ├── video-filters.js         # Modulus grid matching formulas, Aspect resizing formulas
│       ├── ffmpeg-loader.js         # Async worker bootstrapping loader, supporting fallback networks
│       ├── ffmpeg-commands.js       # CLI command compiler for WebAssembly-aligned H.264 & WebM tasks
│       ├── zip-export.js            # High-performance, streaming zip packager using JSZip
│       └── fetch-from-cdn.js        # Resilient fetching algorithm with automatic retry routines
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

### 4.1 Canvas Recording, Frame Packing & Video Synthesis (The `recorder-library` Engine)
* **The Architecture**: All operational pipelines for in-browser recording (WebGL frame capturing, CSS layout size preservation, 4K/1080p canvas transformations, OPFS filesystem buffers, and WebAssembly chunks compression) have been structured as a fully decoupled entity located under the `/js/recorder-library/` directory.
* **The Resolution (Single Source of Truth)**: Future maintainers **MUST NOT** write, dupe, or maintain technical pitfalls concerning libx264 boundaries, H.264 profiles under WASM, single vs multi-threaded assets, memory-saving chunk boundaries, or ZIP/FileSaver buffers inside this core project blueprint. 
* **Action Required**: Refer strictly to the **`/js/recorder-library/specifications.md`** file for exhaustive details, math calculations, API definitions, and debug FAQ related to the recorder system.

### 4.2 Over-Engineering, Tech-Larping, & "AI-Slop"
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

### 4.17 No Canvas Resizing and Absolute Aspect Sizing Integrity Mandate
* **The Pitfall**: 
  1. Modifying the DOM elements `canvas.style.width` and `canvas.style.height` inline properties to fit pixel resolutions during a recording capture deforms the layout on high-density displays (such as Retina or mobile viewports) making the renderer jump, flash, or physically shrink.
  2. Forcing a fixed aspect ratio (like 16:9) on the 3D camera projection matrix when the active viewport has a different aspect ratio causes a distinct visual shift in horizontal/vertical field of view (looking like a physical lens zoom or camera aperture shift) and squishes the rendering backbuffer.
* **The Resolution (Visual & Camera Projection Retention)**:
  1. **Strictly Preserve CSS Dimensions**: The recording pipeline is completely forbidden from altering the visual height or width layout of the DOM canvas on screen during active recording.
  2. **Logical Sizing CSS Locks**: During active capture sessions, the canvas's visual CSS style width and height must be locked via inline style properties to `"100%"` (or matching pre-recording outer containers). This ensures that mutating the internal WebGL backbuffer resolution (`canvas.width`/`canvas.height` via `.setSize(..., false)`) does not trigger any browser reflows, page shrinking, or layout jumps.
  3. **No Lens Zoom or Aperture Shifts**: The 3D camera projection aspect ratio **MUST** be kept locked directly to the real client viewport aspect ratio (`preW / preH`) instead of forcing a target 16:9 ratio. This locks the perspective projection matrix, ensuring the interactive scene remains 100% visually identical with absolutely zero shifts in zoom, lens perspective, layout, or dimensions.
  4. **Resolution-Only buffer scaling**: Only adjust the internal pixel density/resolution of the WebGL canvas buffer using `renderer.setSize(captureW, captureH, false)` with the layout updating/style parameter strictly set to `false`. Pre-recording visual style attributes and layout dimensions must be preserved, and cleanly restored upon stopping. Any change in output recording resolution should result purely in a grainy preview stream on the current visual element, leaving container layout aspect ratios completely unchanged on screen.
  5. **No Direct Modification of Filters**: To preserve production assembly stability and prevent audio/video alignment regressions, the underlying FFmpeg command and video filters (such as `scale` and `crop` modulos inside `video-filters.js`) must never be modified. Keep the original `video-filters.js` mathematical scale calculations unchanged.

---

## 5. VERIFICATION WORKFLOW
Before declaring any task complete, always execute these checks sequentially:
1. **Linter Check**: Run the CLI linter to verify syntax: `npm run lint`.
2. **Production Compilation Check**: Test compilation: `npm run build` or `compile_applet`.
3. **Browser Parse Verification**: Check that `<script type="importmap">` rests untouched at the peak of `<head>`.
