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
2. **Duplicate Entry Mapping**: Ensure both directory-nested and absolute specifier mappings exist:
   ```json
   "imports": {
     "three": "./vendor/three/three.module.js",
     "three/": "./vendor/three/",
     "three/addons/": "./vendor/three/addons/"
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
* **The Pitfall**: Capturing high-resolution canvas frames at 60fps easily saturates RAM inside the browser tab, leading to abrupt page crashes (OOM errors) or memory leaks. Furthermore, passing raw references of `Uint8Array` byte buffers directly to FFmpeg memory transfers can detach arrays or freeze multi-threaded background workers, crashing sequential assemblies.
* **The Resolution (Unified Safe Stream)**:
  1. **Unified OPFS Storage Loop**: Both the "direct" video-rendering (MP4/WebM) and standard "ZIP export" pipelines use the exact same file-streaming model. Rather than holding huge frame arrays in main RAM, frames are written immediately to a temporary sub-directory via the high-speed, sandboxed **Origin Private File System (OPFS)** (`navigator.storage.getDirectory()`).
  2. **Zero-leak Lifetime Management**: When FFmpeg assembly completes or is aborted, the temporary directory is recursively deleted (`root.removeEntry(tempDir, { recursive: true })`) to completely eliminate storage waste.
  3. **High Single-Pass Limit**: Direct encoding handles sequences up to **1500 frames** in a single continuous `.exec()` thread, utilizing local slices (`bytes.slice()`) on file read to prevent memory detachment during browser background execution.

### 4.5 Persistent Save/Open Directories (IndexedDB Directory Handles)
* **The Pitfall**: In web apps with rich export and offline assembly workflows, every time a user triggers a ZIP save or wants to open/upload a zip file, standard browser fallbacks force the local system's directory dialogue to reset to the computer's generic default directory (such as `/Downloads` or `/Documents`). This breaks continuity during laboratory sessions where users export sequentially or load files from a designated project workspace.
* **The Resolution (Symmetrical Serialized Handles and startIn Caching)**:
  1. **IndexedDB Object Store Cache**: We implement a lightweight, zero-dependency storage system inside `sine_gordon_lab_db`'s custom object store `handles` to cache the chosen host `FileSystemFileHandle` from both `showSaveFilePicker` and `showOpenFilePicker`.
  2. **In-Memory & Persistent Sync**: Store chosen handles in IndexedDB and sync to `window._lastZipHandle`. Symmetrically load them to seed the browser's directory dialogs on consecutive loops.
  3. **Universal Host OS Alignment**: By feeding the serialized handle as the `startIn` configuration property (e.g., `pickerOpts.startIn = lastHandle`), the browser natively anchors the active file prompt (whether file-saving or file-reading) back into the user's exact host folder (e.g., standard Windows File Explorer or macOS Finder directories) from the previous action. This creates seamless offline continuity:
     ```js
     const lastHandle = await getLastZipHandle();
     const pickerOpts = {
       id: 'zip-export',
       types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }]
     };
     if (lastHandle) pickerOpts.startIn = lastHandle;
     ```

### 4.6 Direct ZIP Assembly Layout Alignment (Jitter-Free Stacking)
* **The Pitfall**: Coupling export, record, and offline assembly actions specifically to the `zip` pipeline selection option can cause layout shifting, dropdown misalignment, or sudden element jumps if the action dropdown is toggled with aggressive display layout changes.
* **The Resolution (Jitter-Free Visibility & Stacked Alignment Control)**:
  1. **Clean Stacked Hierarchy**: In the UI, structure the main export pipeline format dropdown (FFmpeg, OPFS, ZIP) directly on top, and place the Record/Assemble action dropdown directly below it.
  2. **Jitter-Free State Toggles**: Symmetrically manage the action select dropdown state with `visibility: hidden; pointer-events: none` when non-zip pipelines are active. This retains the exact spatial dimensions and prevents components from jumping or popping vertically.
  3. **Secure Action Binding**: Symmetrically disable user controls and update state indicators (`isAssembling: true`) when assembly or extraction pipelines are busy, locking potential state conflicts.

### 4.7 Over-Engineering, Tech-Larping, & "AI-Slop"
* **The Pitfall**: Adding unrequested technical decorations (e.g., "CORE_NODE_ONLINE", "PORT: 3000", custom grid coordinates) to make the simulation look more "complex."
* **The Resolution**: Keep labels literal, human, and modest. If the user asks for a simple mathematical control, implement ONLY that control cleanly, utilizing generous white space and high-contrast styling.

---

## 5. VERIFICATION WORKFLOW
Before declaring any task complete, always execute these checks sequentially:
1. **Linter Check**: Run the CLI linter to verify syntax: `npm run lint`.
2. **Production Compilation Check**: Test compilation: `npm run build` or `compile_applet`.
3. **Browser Parse Verification**: Check that `<script type="importmap">` rests untouched at the peak of `<head>`.
