// =============================================================================
// Browser Video Recorder Library — example/main.js
// Interactive 3D Toy Animation and Recorder controller.
// Demonstrates perfect canvas capture, resolution remapping, and assembly log HUDs.
// =============================================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import RecordingEngine from "../recording.js";

// Global Simulation Variables
let scene, camera, renderer, controls;
let toyKnotMesh;
let lastTime = 0;
let animationFrameId = null;

// Symmetrically initialized Recorder Engine
let recorder = null;

// Initialize minimal sgState mock for diagnostics compatibility
window.sgState = {
  _exportWidth: 1280,
  _exportHeight: 720,
  _exportFormat: "mp4",
  _exportFPS: 30,
  _exportPipeline: "ffmpeg",
  _exportAction: "record",
  _exportCRF: 5,
  _exportTrim: "none",
  get isRecording() { return recorder ? recorder.isRecording : false; },
  set isRecording(v) { if (recorder) recorder.isRecording = v; },
  get exportPipeline() { return this._exportPipeline; },
  set exportPipeline(v) { 
    this._exportPipeline = v;
    const el = document.getElementById("sel-pipeline");
    if (el) el.value = v; 
    if (recorder) recorder._pipeline = v;
  },
  get exportAction() { return this._exportAction; },
  set exportAction(v) {
    this._exportAction = v;
    const el = document.getElementById("sel-action");
    if (el) el.value = v;
  },
  get exportFormat() { return this._exportFormat; },
  set exportFormat(v) { 
    this._exportFormat = v;
    const el = document.getElementById("sel-format");
    if (el) el.value = v; 
    if (recorder) recorder.config.exportFormat = v;
  },
  get exportFPS() { return this._exportFPS; },
  set exportFPS(v) { 
    this._exportFPS = Number(v);
    const el = document.getElementById("sel-fps");
    if (el) el.value = String(v); 
    if (recorder) recorder.config.exportFPS = Number(v);
  },
  get exportCRF() { return this._exportCRF; },
  set exportCRF(v) {
    this._exportCRF = Number(v);
    const el = document.getElementById("sel-crf");
    if (el) el.value = String(v);
    if (recorder) recorder.config.exportCRF = Number(v);
  },
  get exportTrim() { return this._exportTrim; },
  set exportTrim(v) {
    this._exportTrim = v;
    const el = document.getElementById("sel-trim");
    if (el) el.value = v;
    if (recorder) recorder.config.exportTrim = v;
  },
  get exportWidth() { return this._exportWidth; },
  set exportWidth(v) {
    this._exportWidth = Number(v);
    if (recorder) recorder.config.exportWidth = Number(v);
    syncResolutionUI();
  },
  get exportHeight() { return this._exportHeight; },
  set exportHeight(v) {
    this._exportHeight = Number(v);
    if (recorder) recorder.config.exportHeight = Number(v);
    syncResolutionUI();
  },
  paused: true
};

function syncResolutionUI() {
  const el = document.getElementById("sel-res");
  if (!el) return;
  const tgtVal = `${window.sgState._exportWidth}x${window.sgState._exportHeight}`;
  let optionExists = false;
  for (let i = 0; i < el.options.length; i++) {
    if (el.options[i].value === tgtVal) {
      el.selectedIndex = i;
      optionExists = true;
      break;
    }
  }
  if (!optionExists) {
    const opt = document.createElement("option");
    opt.value = tgtVal;
    opt.textContent = tgtVal + " (Custom)";
    el.appendChild(opt);
    el.value = tgtVal;
  }
}

window.refreshUI = function() {
  const selPipeline = document.getElementById("sel-pipeline");
  if (selPipeline) selPipeline.value = window.sgState._exportPipeline;
  
  const selAction = document.getElementById("sel-action");
  if (selAction) selAction.value = window.sgState._exportAction;

  const selFormat = document.getElementById("sel-format");
  if (selFormat) selFormat.value = window.sgState._exportFormat;
  
  const selFps = document.getElementById("sel-fps");
  if (selFps) selFps.value = String(window.sgState._exportFPS);

  const selCrf = document.getElementById("sel-crf");
  if (selCrf) selCrf.value = String(window.sgState._exportCRF);

  const selTrim = document.getElementById("sel-trim");
  if (selTrim) selTrim.value = window.sgState._exportTrim;
  
  syncResolutionUI();
};

// UI State Configurations
const params = {
  speed: 0.4,
  tubeRadius: 0.15,
  palette: "emerald-cyan"
};

// Console logger hook setup for the scrolling HUD terminal
const logHistory = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function hookConsole() {
  const scrollContainer = document.getElementById("assembly-log-scroll");
  const countBadge = document.getElementById("assembly-log-count");

  function appendToHUD(text, type = "info") {
    const timeStr = new Date().toISOString().split("T")[1].slice(0, 8);
    const msgDiv = document.createElement("div");
    
    // Aesthetic message coloring matching specifications
    if (type === "warn") {
      msgDiv.className = "text-amber-400 font-medium";
      msgDiv.textContent = `[${timeStr}] ⚠️ ${text}`;
    } else if (type === "err") {
      msgDiv.className = "text-red-400 font-bold";
      msgDiv.textContent = `[${timeStr}] 🚨 ${text}`;
    } else if (type === "success") {
      msgDiv.className = "text-emerald-400 font-semibold";
      msgDiv.textContent = `[${timeStr}] 🌟 ${text}`;
    } else if (type === "system") {
      msgDiv.className = "text-zinc-500 font-light";
      msgDiv.textContent = `[${timeStr}] ⚙️ ${text}`;
    } else {
      msgDiv.className = "text-cyan-400/90";
      msgDiv.textContent = `[${timeStr}] ℹ️ ${text}`;
    }

    if (scrollContainer) {
      scrollContainer.appendChild(msgDiv);
      // Synchronous scroll bottom pinning
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      
      // Secondary macro-task backup scrolling pins
      setTimeout(() => { scrollContainer.scrollTop = scrollContainer.scrollHeight; }, 0);
    }

    logHistory.push(`[${timeStr}] [${type.toUpperCase()}] ${text}`);
    if (countBadge) {
      countBadge.textContent = `${logHistory.length} messages`;
    }
  }

  // Override standard window outputs
  console.log = function (...args) {
    const rawMsg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ");
    originalLog.apply(console, args);
    appendToHUD(rawMsg, rawMsg.includes("[🛡️ verified]") || rawMsg.includes("complete") ? "success" : "info");
  };

  console.warn = function (...args) {
    const rawMsg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ");
    originalWarn.apply(console, args);
    appendToHUD(rawMsg, "warn");
  };

  console.error = function (...args) {
    const rawMsg = args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ");
    originalError.apply(console, args);
    appendToHUD(rawMsg, "err");
  };

  // Safe global logger access handles external module exports logs.
  window.__recordingHUDLog = appendToHUD;
}

// Setup simple three.js interactive canvas scene
function initThree() {
  const container = document.querySelector(".main-canvas-container");
  const canvas = document.getElementById("toy-canvas");

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene setup
  scene = new THREE.Scene();

  // Color gradient background
  scene.background = null; // Let CSS styles handle backdrop gradient

  // Camera settings
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 7);

  // Renderer setup — CRITICAL MUST: preserveDrawingBuffer: true
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight1.position.set(5, 5, 5);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x00aaff, 0.6);
  dirLight2.position.set(-5, -5, 5);
  scene.add(dirLight2);

  // Create TorusKnot geometry
  createToyKnot();

  // Resize boundaries handle
  const resizeObserver = new ResizeObserver(entries => {
    if (recorder && recorder.isRecording) return; // Ignore browser resizing when locked in capture dimensions

    for (let entry of entries) {
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h, false);
    }
  });

  resizeObserver.observe(container);

  // Initialize the central Recording Engine
  recorder = new RecordingEngine({
    exportFPS: 30,
    exportFormat: "mp4",
    exportPipeline: "ffmpeg",
    exportWidth: 1280,
    exportHeight: 720,
    camera: camera,
    exportFilename: "recorded_threejs_toy"
  });

  window.recorder = recorder;

  window.renderManualFrame = function() {
    if (renderer && scene && camera) {
      if (toyKnotMesh) {
        toyKnotMesh.rotation.x += 0.02;
        toyKnotMesh.rotation.y += 0.04;
        updateColors(performance.now());
      }
      renderer.render(scene, camera);
    }
  };

  // Attach renderer
  recorder.init(canvas, renderer);

  // Launch renderer loop
  lastTime = performance.now();
  animate(lastTime);
}

// Generate the high-polish rotating Torus Knot meshes
function createToyKnot() {
  if (toyKnotMesh) {
    scene.remove(toyKnotMesh);
    toyKnotMesh.geometry.dispose();
    toyKnotMesh.material.dispose();
  }

  // Shiny customizable geometry
  const geometry = new THREE.TorusKnotGeometry(1.4, params.tubeRadius, 150, 16);
  
  // Custom Material using physical shader attributes and responsive glowing colors
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x00ffcc,
    roughness: 0.1,
    metalness: 0.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    flatShading: true
  });

  toyKnotMesh = new THREE.Mesh(geometry, material);
  scene.add(toyKnotMesh);
}

// Dynamic shader-inspired shifts representing colors
function updateColors(time) {
  if (!toyKnotMesh) return;

  const t = time * 0.001 * params.speed;

  if (params.palette === "emerald-cyan") {
    // Shifting color between cyber emerald green and deep tropical blue-cyan
    const r = Math.sin(t) * 0.15 + 0.15;
    const g = Math.cos(t) * 0.4 + 0.6;
    const b = Math.sin(t) * 0.5 + 0.5;
    toyKnotMesh.material.color.setRGB(r, g, b);
  } else if (params.palette === "neon-sunset") {
    // Dynamic sunset neon purple and blazing orange
    const r = Math.sin(t) * 0.4 + 0.6;
    const g = Math.cos(t * 1.5) * 0.2 + 0.2;
    const b = Math.sin(t * 1.2) * 0.4 + 0.6;
    toyKnotMesh.material.color.setRGB(r, g, b);
  } else {
    // Matrix style scale monochrome binary greens
    const greenShft = Math.sin(t * 2.0) * 0.3 + 0.5;
    toyKnotMesh.material.color.setRGB(0, greenShft, 0);
  }
}

// Render dynamic loop
function animate(time) {
  animationFrameId = requestAnimationFrame(animate);

  const delta = (time - lastTime) * 0.001;
  lastTime = time;

  // Slowly rotate toy object
  if (toyKnotMesh) {
    toyKnotMesh.rotation.x += delta * params.speed * 0.6;
    toyKnotMesh.rotation.y += delta * params.speed * 1.2;
    updateColors(time);
  }

  controls.update();
  renderer.render(scene, camera);

  // SOURCING VITAL CAPTURE STEP
  if (recorder && recorder.isRecording && !recorder.isTesting) {
    recorder.captureFrame();
  }
}

// Bind controllers and interface buttons
function wireUI() {
  const btnVideo = document.getElementById("btn-video");
  const selPipeline = document.getElementById("sel-pipeline");
  const selAction = document.getElementById("sel-action");
  const selRes = document.getElementById("sel-res");
  const selFormat = document.getElementById("sel-format");
  const selFps = document.getElementById("sel-fps");
  const selCrf = document.getElementById("sel-crf");
  const selTrim = document.getElementById("sel-trim");

  // Toy parameters
  const paramSpeed = document.getElementById("param-speed");
  const paramRadius = document.getElementById("param-radius");
  const paramPalette = document.getElementById("param-palette");

  // Layout modals
  const procOverlay = document.getElementById("processing-overlay");
  const btnCloseProc = document.getElementById("btn-close-processing");
  const btnCopyLogs = document.getElementById("btn-copy-logs");
  const btnDemoDiag = document.getElementById("btn-demo-diagnostics");

  // Sync changes in dropdowns back to sgState properties
  selPipeline.addEventListener("change", (e) => {
    window.sgState._exportPipeline = e.target.value;
    if (recorder) recorder._pipeline = e.target.value;
  });

  selAction.addEventListener("change", (e) => {
    window.sgState._exportAction = e.target.value;
  });
  
  selFormat.addEventListener("change", (e) => {
    window.sgState._exportFormat = e.target.value;
    if (recorder) recorder.config.exportFormat = e.target.value;
  });
  
  selFps.addEventListener("change", (e) => {
    window.sgState._exportFPS = Number(e.target.value);
    if (recorder) recorder.config.exportFPS = Number(e.target.value);
  });

  selCrf.addEventListener("change", (e) => {
    window.sgState._exportCRF = Number(e.target.value);
    if (recorder) recorder.config.exportCRF = Number(e.target.value);
  });

  if (selTrim) {
    selTrim.addEventListener("change", (e) => {
      window.sgState._exportTrim = e.target.value;
      if (recorder) recorder.config.exportTrim = e.target.value;
    });
  }
  
  selRes.addEventListener("change", (e) => {
    const [w, h] = e.target.value.split("x").map(Number);
    window.sgState._exportWidth = w;
    window.sgState._exportHeight = h;
    if (recorder) {
      recorder.config.exportWidth = w;
      recorder.config.exportHeight = h;
    }
  });

  // Bind speed & density inputs
  paramSpeed.addEventListener("input", (e) => {
    params.speed = parseFloat(e.target.value) / 100;
  });

  paramRadius.addEventListener("input", (e) => {
    params.tubeRadius = parseFloat(e.target.value) / 200;
    createToyKnot();
  });

  paramPalette.addEventListener("change", (e) => {
    params.palette = e.target.value;
  });

  // Diagnostics overlays
  btnDemoDiag.addEventListener("click", async () => {
    try {
      const { getDiagnosticsManager } = await import("/js/diagnostics.js");
      getDiagnosticsManager().show();
    } catch (err) {
      console.error("[Diagnostics Loader] Failed to load diagnostics module in example:", err);
    }
  });

  btnCloseProc.addEventListener("click", () => {
    procOverlay.style.display = "none";
  });

  // Log copying
  btnCopyLogs.addEventListener("click", () => {
    const logDump = logHistory.join("\n");
    if (!logDump) {
      btnCopyLogs.textContent = "EMPTY";
      setTimeout(() => { btnCopyLogs.textContent = "Copy Logs"; }, 1500);
      return;
    }

    navigator.clipboard.writeText(logDump)
      .then(() => {
        btnCopyLogs.textContent = "COPIED!";
        setTimeout(() => { btnCopyLogs.textContent = "Copy Logs"; }, 1500);
      })
      .catch(() => {
        // Fallback for sandboxed context
        const txt = document.createElement("textarea");
        txt.value = logDump;
        document.body.appendChild(txt);
        txt.select();
        try {
          document.execCommand("copy");
          btnCopyLogs.textContent = "COPIED!";
        } catch (e) {
          btnCopyLogs.textContent = "FAILED";
        }
        document.body.removeChild(txt);
        setTimeout(() => { btnCopyLogs.textContent = "Copy Logs"; }, 1500);
      });
  });

  // Main capture toggle hook
  btnVideo.addEventListener("click", async () => {
    if (!recorder) return;

    if (window.sgState.exportAction === "assemble") {
      const pipelineMode = selPipeline.value;
      const [resW, resH] = selRes.value.split("x").map(Number);
      const outputFormat = selFormat.value;
      const targetFPS = Number(selFps.value);
      const crfLimit = Number(selCrf.value);
      const trimMode = selTrim ? selTrim.value : "none";

      // Mutate configs symmetrically
      recorder.config.exportWidth = resW;
      recorder.config.exportHeight = resH;
      recorder.config.exportFormat = outputFormat;
      recorder.config.exportFPS = targetFPS;
      recorder.config.exportCRF = crfLimit;
      recorder.config.exportTrim = trimMode;
      recorder._pipeline = pipelineMode;

      // Reset logs and launch compiling overlay
      logHistory.length = 0;
      document.getElementById("assembly-log-scroll").innerHTML = '<div class="text-white/30">[System] Initiating Assemble Dynamic Storage Context...</div>';
      
      procOverlay.style.display = "flex";
      
      // Feed HUD elements programmatically
      document.getElementById("diagnostic-resolution").textContent = `${resW}x${resH}`;
      document.getElementById("diagnostic-threads").textContent = (typeof SharedArrayBuffer !== "undefined") ? "Multi-Threaded (MT)" : "Single-Threaded (ST)";
      document.getElementById("diagnostic-quality").textContent = String(crfLimit);
      
      document.getElementById("assembly-subheader-info").textContent = `Operation: Transcoding Chunks | Res: ${resW}x${resH}`;
      document.getElementById("current-telemetry-phase").textContent = "Transcoding Chunks";
      document.getElementById("assembly-bottom-phase").textContent = "Parsing OPFS frames... compiling video stream...";

      const rawActionContainer = document.getElementById("assembly-ready-actions");
      rawActionContainer.classList.add("hidden");
      rawActionContainer.innerHTML = "";

      // Track assembly updates through progress callbacks
      recorder.setProgressCallback((stage, frameNum, totalFrames, percent) => {
        const progressFill = document.getElementById("progress-fill");
        const assemblyPercent = document.getElementById("assembly-percent");
        const bottomFrames = document.getElementById("assembly-bottom-frames");
        const framesLeftBadge = document.getElementById("telemetry-frames");
        const btmPhase = document.getElementById("assembly-bottom-phase");

        if (progressFill) progressFill.style.width = `${percent}%`;
        if (assemblyPercent) assemblyPercent.textContent = `${Math.round(percent)}%`;
        if (bottomFrames) bottomFrames.textContent = `${frameNum} / ${totalFrames} frames`;
        if (framesLeftBadge) framesLeftBadge.textContent = `${frameNum} / ${totalFrames}`;
        if (btmPhase) btmPhase.textContent = `Processing stage: ${stage}`;
        
        // Grab preview frames if available and copy onto preview canvas
        if (recorder._tempCanvas) {
          const previewCanvas = document.getElementById("preview-canvas");
          if (previewCanvas) {
            const pCtx = previewCanvas.getContext("2d");
            previewCanvas.width = recorder._tempCanvas.width;
            previewCanvas.height = recorder._tempCanvas.height;
            pCtx.drawImage(recorder._tempCanvas, 0, 0);
          }
        }
      });

      try {
        const assembledBlob = await recorder.assembleFromStorage(pipelineMode);
        
        // Success completion and file offering
        document.getElementById("current-telemetry-phase").textContent = "Succeeded ✓";
        document.getElementById("assembly-bottom-phase").textContent = "File assembly completed successfully!";
        document.getElementById("assembly-subheader-info").textContent = "Status: Export Ready";
        
        console.log("[🌟 Success] Assembly completed! Blob size:", (assembledBlob.size/1024/1024).toFixed(4), "MB");

        // Present dynamic completion buttons inside compiler overlay
        rawActionContainer.classList.remove("hidden");
        rawActionContainer.classList.add("flex");
        
        const btnDownload = document.createElement("button");
        btnDownload.className = "px-6 py-2 bg-[#00ffcc] text-black font-bold uppercase tracking-wider text-xs rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer";
        btnDownload.textContent = "Download export";
        btnDownload.addEventListener("click", () => {
          const filename = recorder.getExportFilename(recorder.config.exportFormat);
          if (window.saveAs) {
            window.saveAs(assembledBlob, filename);
          } else {
            const tempUrl = URL.createObjectURL(assembledBlob);
            const a = document.createElement("a");
            a.href = tempUrl;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(tempUrl);
          }
        });

        rawActionContainer.appendChild(btnDownload);

      } catch (err) {
        document.getElementById("current-telemetry-phase").textContent = "Errored 🛑";
        document.getElementById("assembly-bottom-phase").textContent = "Video assembly encountered a fatal error.";
        console.error("[Compilation Abort]", err);
      }
      return;
    }

    if (!recorder.isRecording) {
      // READ INTERFACE CONFIGURATIONS
      const pipelineMode = selPipeline.value;
      const [resW, resH] = selRes.value.split("x").map(Number);
      const outputFormat = selFormat.value;
      const targetFPS = Number(selFps.value);
      const crfLimit = Number(selCrf.value);
      const trimMode = selTrim ? selTrim.value : "none";

      // Mutate configs symmetrically
      recorder.config.exportWidth = resW;
      recorder.config.exportHeight = resH;
      recorder.config.exportFormat = outputFormat;
      recorder.config.exportFPS = targetFPS;
      recorder.config.exportCRF = crfLimit;
      recorder.config.exportTrim = trimMode;
      recorder._pipeline = pipelineMode;

      // Reset logs and launch capture lock
      logHistory.length = 0;
      document.getElementById("assembly-log-scroll").innerHTML = '<div class="text-white/30">[System] Initiating New Captured Stream Context...</div>';
      
      console.log(`[Recorder Engine] Locking canvas layout, initializing capturing at ${resW}x${resH} (${targetFPS} FPS) ...`);
      
      recorder.startRecording();

      // UI button transformation
      btnVideo.textContent = "🛑 Stop Capture";
      btnVideo.classList.remove("text-red-400", "bg-red-500/5", "border-red-500/30", "hover:bg-red-500/10");
      btnVideo.classList.add("text-yellow-400", "bg-yellow-500/10", "border-yellow-500/40", "hover:bg-yellow-500/20");

    } else {
      // STOP CAPTURING, INITIATE ASSEMBLY SEQUENCE
      console.log("[Recorder Engine] Capturing Stopped. Grabbing OPFS structures, presenting compiler window...");
      
      btnVideo.textContent = "⏺ Start Capture";
      btnVideo.classList.remove("text-yellow-400", "bg-yellow-500/10", "border-yellow-500/40", "hover:bg-yellow-500/20");
      btnVideo.classList.add("text-red-400", "bg-red-500/5", "border-red-500/30", "hover:bg-red-500/10");

      // Build out compiling panel elements
      procOverlay.style.display = "flex";
      
      // Feed HUD elements programmatically
      document.getElementById("diagnostic-resolution").textContent = `${recorder.config.exportWidth}x${recorder.config.exportHeight}`;
      document.getElementById("diagnostic-threads").textContent = (typeof SharedArrayBuffer !== "undefined") ? "Multi-Threaded (MT)" : "Single-Threaded (ST)";
      document.getElementById("diagnostic-quality").textContent = String(recorder.config.exportCRF || 18);
      
      document.getElementById("assembly-subheader-info").textContent = `Operation: Transcoding Chunks | Res: ${recorder.config.exportWidth}x${recorder.config.exportHeight}`;
      document.getElementById("current-telemetry-phase").textContent = "Transcoding Chunks";
      document.getElementById("assembly-bottom-phase").textContent = "Parsing OPFS frames... compiling video stream...";

      const rawActionContainer = document.getElementById("assembly-ready-actions");
      rawActionContainer.classList.add("hidden");
      rawActionContainer.innerHTML = "";

      // Track assembly updates through progress callbacks
      recorder.setProgressCallback((stage, frameNum, totalFrames, percent) => {
        const progressFill = document.getElementById("progress-fill");
        const assemblyPercent = document.getElementById("assembly-percent");
        const bottomFrames = document.getElementById("assembly-bottom-frames");
        const framesLeftBadge = document.getElementById("telemetry-frames");
        const btmPhase = document.getElementById("assembly-bottom-phase");

        if (progressFill) progressFill.style.width = `${percent}%`;
        if (assemblyPercent) assemblyPercent.textContent = `${Math.round(percent)}%`;
        if (bottomFrames) bottomFrames.textContent = `${frameNum} / ${totalFrames} frames`;
        if (framesLeftBadge) framesLeftBadge.textContent = `${frameNum} / ${totalFrames}`;
        if (btmPhase) btmPhase.textContent = `Processing stage: ${stage}`;
        
        // Grab preview frames if available and copy onto preview canvas
        if (recorder._tempCanvas) {
          const previewCanvas = document.getElementById("preview-canvas");
          if (previewCanvas) {
            const pCtx = previewCanvas.getContext("2d");
            previewCanvas.width = recorder._tempCanvas.width;
            previewCanvas.height = recorder._tempCanvas.height;
            pCtx.drawImage(recorder._tempCanvas, 0, 0);
          }
        }
      });

      try {
        const assembledBlob = await recorder.stopRecording();
        
        // Success completion and file offering
        document.getElementById("current-telemetry-phase").textContent = "Succeeded ✓";
        document.getElementById("assembly-bottom-phase").textContent = "File assembly completed successfully!";
        document.getElementById("assembly-subheader-info").textContent = "Status: Export Ready";
        
        console.log("[🌟 Success] Assembly completed! Blob size:", (assembledBlob.size/1024/1024).toFixed(4), "MB");

        // Present dynamic completion buttons inside compiler overlay
        rawActionContainer.classList.remove("hidden");
        rawActionContainer.classList.add("flex");
        
        const btnDownload = document.createElement("button");
        btnDownload.className = "px-6 py-2 bg-[#00ffcc] text-black font-bold uppercase tracking-wider text-xs rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer";
        btnDownload.textContent = "Download export";
        btnDownload.addEventListener("click", () => {
          const filename = recorder.getExportFilename(recorder.config.exportFormat);
          if (window.saveAs) {
            window.saveAs(assembledBlob, filename);
          } else {
            const tempUrl = URL.createObjectURL(assembledBlob);
            const a = document.createElement("a");
            a.href = tempUrl;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(tempUrl);
          }
        });

        rawActionContainer.appendChild(btnDownload);

      } catch (err) {
        document.getElementById("current-telemetry-phase").textContent = "Errored 🛑";
        document.getElementById("assembly-bottom-phase").textContent = "Video assembly encountered a fatal error.";
        console.error("[Compilation Abort]", err);
      }
    }
  });

  // Sync formats options nicely if Multi-threading is restricted
  if (typeof SharedArrayBuffer === "undefined") {
    console.log("[System Setup] SAB restricted mode detected. Falling back safely to .webm format outputs.");
    selFormat.value = "webm";
  }
}

// Kickstart
window.addEventListener("DOMContentLoaded", () => {
  hookConsole();
  initThree();
  wireUI();
  console.log("%c[System] Interactive integration example bootstrapped successfully.", "color: #00ffcc; font-weight: bold;");
});
