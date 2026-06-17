// sine-gordon-lab — js/design-sandbox.js
// Dedicated Design Sandbox & Visual Calibration Suite.
// Allows developers and users to view and adjust single static, steady-state mockup versions
// of each specific window/panel species in the recording sequence.

import { getDiagnosticsManager } from "./diagnostics.js";

class DesignSandbox {
  constructor() {
    this.controlHubId = "sandbox-widget";
    this.isHubVisible = false;
    this.isAssemblyMocking = false;
    this.isDiagnosticsMocking = false;
    this.mockProgressValue = 80; // default 80%
    this.mockCanvasAnimationId = null;
    this.mockLogIntervalId = null;
    
    this.setupControlHub();
  }

  setupControlHub() {
    const widget = document.getElementById(this.controlHubId);
    if (!widget) return;

    // Bind event handlers
    const selectEl = document.getElementById("sel-sb-active-window");
    if (selectEl) {
      selectEl.onchange = (e) => this.switchWindow(e.target.value);
    }

    const sliderEl = document.getElementById("slider-sb-progress");
    if (sliderEl) {
      sliderEl.oninput = (e) => this.updateMockProgress(e.target.value);
    }

    const exitBtn1 = document.getElementById("btn-sb-exit");
    if (exitBtn1) {
      exitBtn1.onclick = () => this.hideHub();
    }

    const exitBtn2 = document.getElementById("btn-sb-widget-exit");
    if (exitBtn2) {
      exitBtn2.onclick = () => this.hideHub();
    }

    const collapseBtn = document.getElementById("btn-collapse-sandbox");
    if (collapseBtn) {
      collapseBtn.onclick = () => {
        const c = widget.querySelector(".widget-content");
        if (c) {
          if (c.style.display === "none") {
            c.style.display = "";
            collapseBtn.textContent = "▲";
            collapseBtn.title = "Collapse Panel";
            widget.classList.remove("widget-collapsed");
          } else {
            c.style.display = "none";
            collapseBtn.textContent = "▼";
            collapseBtn.title = "Expand Panel";
            widget.classList.add("widget-collapsed");
          }
        }
      };
    }
  }

  isMockActive() {
    if (!this.isHubVisible) return false;
    const selectEl = document.getElementById("sel-sb-active-window");
    return selectEl && selectEl.value !== "none";
  }

  showHub() {
    this.isHubVisible = true;
    const widget = document.getElementById(this.controlHubId);
    if (widget) {
      widget.style.display = "flex";
      const content = widget.querySelector(".widget-content");
      if (content) {
        content.style.display = "";
      }
      const collapseBtn = document.getElementById("btn-collapse-sandbox");
      if (collapseBtn) {
        collapseBtn.textContent = "▲";
        collapseBtn.title = "Collapse Panel";
      }
      widget.classList.remove("widget-collapsed");
    }

    // Toggle button style in bottom bar
    const btnSandbox = document.getElementById("btn-design-sandbox");
    if (btnSandbox) {
      btnSandbox.classList.add("border-amber-500", "bg-amber-500/10", "shadow-[0_0_15px_rgba(245,158,11,0.4)]");
    }

    // Auto-onboarding notice toast
    this.toast("Visual Design Sandbox Active", "Select Viewports from the widget off to the right to inspect and calibrate layouts", "amber");
  }

  hideHub() {
    this.isHubVisible = false;
    const widget = document.getElementById(this.controlHubId);
    if (widget) widget.style.display = "none";

    // Toggle button style in bottom bar back to default
    const btnSandbox = document.getElementById("btn-design-sandbox");
    if (btnSandbox) {
      btnSandbox.classList.remove("border-amber-500", "bg-amber-500/10", "shadow-[0_0_15px_rgba(245,158,11,0.4)]");
    }

    // Reset dropdown selector to 0
    const selectEl = document.getElementById("sel-sb-active-window");
    if (selectEl) selectEl.value = "none";

    // Turn off previews
    this.switchWindow("none");
    
    this.toast("Design Sandbox Deactivated", "Returned to standard laboratory simulation mode", "gray");
  }

  switchWindow(val) {
    // Synchronize selector synchronously
    const selectEl = document.getElementById("sel-sb-active-window");
    if (selectEl && selectEl.value !== val) selectEl.value = val;

    // 1. Clean disable call paths on other existing mock layers
    this.disableAssemblyMock();
    this.disableDiagnosticsMock();
    this.clearVideoSettingsHighlight();

    // 2. Update Calibration Status panel info
    const targetLabel = document.getElementById("widget-sb-target-label");
    const simStatus = document.getElementById("widget-sb-sim-status");

    if (val === "none") {
      if (targetLabel) {
        targetLabel.textContent = "None";
        targetLabel.className = "text-white/40 font-bold uppercase";
      }
      if (simStatus) {
        simStatus.textContent = "Active";
        simStatus.className = "text-emerald-400 font-bold uppercase animate-pulse";
      }
    } else {
      if (simStatus) {
        simStatus.textContent = "Paused (Mock)";
        simStatus.className = "text-amber-500 font-bold uppercase animate-pulse";
      }
    }

    // 3. Select and initialize exactly one single mock model context
    if (val === "assembly") {
      if (targetLabel) {
        targetLabel.textContent = "Window 1: Assembly";
        targetLabel.className = "text-cyan-400 font-black uppercase";
      }
      this.enableAssemblyMock();
    } else if (val === "diagnostics") {
      if (targetLabel) {
        targetLabel.textContent = "Window 2: Diagnostics";
        targetLabel.className = "text-fuchsia-400 font-black uppercase";
      }
      this.enableDiagnosticsMock();
    } else if (val === "settings") {
      if (targetLabel) {
        targetLabel.textContent = "Window 3: Settings";
        targetLabel.className = "text-amber-400 font-black uppercase";
      }
      this.highlightVideoSettings();
    }
  }

  enableAssemblyMock() {
    this.isAssemblyMocking = true;

    // Show processing overlay
    const overlay = document.getElementById("processing-overlay");
    if (overlay) {
      overlay.style.display = "flex";
      // Force block visibility on actions sub-action buttons
      const readyActions = document.getElementById("assembly-ready-actions");
      if (readyActions) {
        readyActions.style.display = "flex";
      }
    }

    // Populate standard mockup details
    this.populateMockAssemblyData();
    this.startMockCanvasAnimation();
    this.startMockLogWorker();

    this.toast("LOADED: Window 1 (Assembly Engine)", "Adjust log containers, subheader indices, or progress colors", "emerald");
  }

  disableAssemblyMock() {
    this.isAssemblyMocking = false;

    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "none";

    this.stopMockCanvasAnimation();
    this.stopMockLogWorker();
  }

  enableDiagnosticsMock() {
    this.isDiagnosticsMocking = true;

    try {
      // Boot up authentic diagnostics manager panel
      const mgr = getDiagnosticsManager();
      mgr.show();
      
      const diagOverlay = document.getElementById("diagnostics-overlay");
      if (diagOverlay) {
        diagOverlay.style.display = "flex";
        diagOverlay.style.alignItems = "center";
        diagOverlay.style.justifyContent = "center";
        diagOverlay.style.zIndex = "1001";
        diagOverlay.style.position = "fixed";
        diagOverlay.style.inset = "0";
        diagOverlay.style.background = "rgba(0, 0, 0, 0.96)";
        diagOverlay.style.backdropFilter = "blur(24px)";
        diagOverlay.style.padding = "16px";
      }

      // Populate visual states of list items inside target manager
      this.populateMockDiagnosticsData();
      
      this.toast("LOADED: Window 2 (Diagnostics & Audits)", "Adjust assertion check boxes, details heights, or code labels", "emerald");
    } catch (err) {
      console.error("[Sandbox] Failed to load DiagnosticsManager:", err);
      this.toast("Error Loading Diagnostics", err.message, "danger");
    }
  }

  disableDiagnosticsMock() {
    this.isDiagnosticsMocking = false;

    const diagOverlay = document.getElementById("diagnostics-overlay");
    if (diagOverlay) diagOverlay.style.display = "none";
  }

  highlightVideoSettings() {
    const container = document.getElementById("video-controls-container");
    if (container) {
      container.scrollIntoView({ behavior: "smooth", block: "center" });
      container.classList.add("border-amber-500", "shadow-[0_0_20px_rgba(245,158,11,0.5)]");
      container.classList.remove("border-white/10");
      this.toast("LOADED: Window 3 (Settings panel)", "Inspect storage quotas dropdown layouts, trim targets, or recorders styles at bottombar", "amber");
    }
  }

  clearVideoSettingsHighlight() {
    const container = document.getElementById("video-controls-container");
    if (container) {
      container.classList.remove("border-amber-500", "shadow-[0_0_20px_rgba(245,158,11,0.5)]");
      container.classList.add("border-white/10");
    }
  }

  updateMockProgress(val) {
    this.mockProgressValue = parseInt(val, 10);
    document.getElementById("label-sb-progress").textContent = this.mockProgressValue + "%";

    if (this.isAssemblyMocking) {
      const fillEl = document.getElementById("progress-fill");
      if (fillEl) fillEl.style.width = this.mockProgressValue + "%";
      
      const percentEl = document.getElementById("assembly-percent");
      if (percentEl) percentEl.textContent = this.mockProgressValue + "%";

      const totalFrames = 300;
      const currentFrame = Math.round((this.mockProgressValue / 100) * totalFrames);
      
      const framesCountEl = document.getElementById("telemetry-frames");
      if (framesCountEl) framesCountEl.textContent = `${currentFrame} / ${totalFrames}`;

      const bottomFramesEl = document.getElementById("assembly-bottom-frames");
      if (bottomFramesEl) bottomFramesEl.textContent = `${currentFrame} / ${totalFrames} frames`;
    }
  }

  populateMockAssemblyData() {
    // Top sub-header metadata details lines
    const subheaderEl = document.getElementById("assembly-subheader-info");
    if (subheaderEl) {
      subheaderEl.textContent = "Operation: SANDBOX TEST MODE (STATIC) | Res: 1920x1080";
    }

    const telemetryFramesEl = document.getElementById("telemetry-frames");
    if (telemetryFramesEl) {
      const currentFrame = Math.round((this.mockProgressValue / 100) * 300);
      telemetryFramesEl.textContent = `${currentFrame} / 300`;
    }

    const diagnosticThreadsEl = document.getElementById("diagnostic-threads");
    if (diagnosticThreadsEl) {
      diagnosticThreadsEl.textContent = "Multi-Threaded (MT)";
      diagnosticThreadsEl.className = "text-emerald-400 font-bold font-mono";
    }

    const diagnosticResEl = document.getElementById("diagnostic-resolution");
    if (diagnosticResEl) {
      diagnosticResEl.textContent = "1920x1080 (FHD)";
    }

    const diagnosticQualEl = document.getElementById("diagnostic-quality");
    if (diagnosticQualEl) {
      diagnosticQualEl.textContent = "5 (Ultra Quality)";
      diagnosticQualEl.className = "text-[#00ffcc] font-bold font-mono";
    }

    const diagnosticSafeguardEl = document.getElementById("diagnostic-safeguard");
    if (diagnosticSafeguardEl) {
      diagnosticSafeguardEl.textContent = "Inactive (Safe)";
      diagnosticSafeguardEl.className = "text-emerald-400 font-bold font-mono uppercase";
    }

    const phaseEl = document.getElementById("current-telemetry-phase");
    if (phaseEl) {
      phaseEl.textContent = "Transcoding Chunks ⚙";
      phaseEl.className = "text-amber-400 font-bold animate-pulse";
    }

    // Set progress bar fill bounds
    const fillEl = document.getElementById("progress-fill");
    if (fillEl) fillEl.style.width = this.mockProgressValue + "%";
    
    const percentEl = document.getElementById("assembly-percent");
    if (percentEl) percentEl.textContent = this.mockProgressValue + "%";

    const bottomFramesEl = document.getElementById("assembly-bottom-frames");
    if (bottomFramesEl) {
      const currentFrame = Math.round((this.mockProgressValue / 100) * 300);
      bottomFramesEl.textContent = `${currentFrame} / 300 frames`;
    }

    const bottomPhaseEl = document.getElementById("assembly-bottom-phase");
    if (bottomPhaseEl) {
      bottomPhaseEl.textContent = "Compressing sub-component frame bytes...";
    }

    // Populate log scroll with professional simulated steps
    const logScroll = document.getElementById("assembly-log-scroll");
    if (logScroll) {
      logScroll.innerHTML = `
        <div class="text-white/30">[System] Initializing Visual Design Sandbox Session...</div>
        <div class="text-emerald-400/90">[Assemble] Dedicated Sandboxed Frame Pipe launched successfully.</div>
        <div class="text-white/45">[Memory] System memory bounds verified: 12.0 GB reported limit.</div>
        <div class="text-[#00ffcc]/80">[WASM] Loading high-speed multi-threaded workers from CDNs...</div>
        <div class="text-[#00ffcc]/95">[WASM] SharedArrayBuffer detected! 4 discrete threads spawned successfully.</div>
        <div class="text-white/60">[FFmpeg] Command options generated: ffmpeg -f image2 -framerate 30 -i frame_%05d.png -vcodec libx264 -crf 5 -pix_fmt yuv420p output.mp4</div>
        <div class="text-white/50">[Compile] Initialized backbuffer canvas size: 1920x1080 (Double Buffering locked).</div>
        <div class="text-white/60">[Pipeline] Frame extraction rate calibrated at 62 FMR.</div>
        <div class="text-white/70">[Compile] Processing frame index 1 to 120...</div>
        <div class="text-emerald-400">[Assemble] Compressed block chunks 1-3 written to OPFS storage safely.</div>
        <div class="text-white/70">[Compile] Processing frame index 121 to 240...</div>
        <div class="text-amber-400 font-bold">[Compile] WARNING: Jitter speed offset detected (3.2ms latency). Throttling queue filter.</div>
      `;
      this.updateLogCount();
      this.scrollLogToBottom();
    }

    // Populate ready CTA actions statically so they can adjust heights & margins
    const readyActions = document.getElementById("assembly-ready-actions");
    if (readyActions) {
      readyActions.innerHTML = `
        <button class="bg-[#00ffcc]/20 hover:bg-[#00ffcc]/30 border border-[#00ffcc]/40 text-[#00ffcc] font-mono text-[9px] font-bold py-1 px-4 rounded-full uppercase cursor-pointer" onclick="alert('Static Preview Mode - Download Not Active')">
          📥 Download MP4 Video
        </button>
        <button class="bg-white/5 hover:bg-white/10 border border-white/15 text-white/85 font-mono text-[9px] font-bold py-1 px-4 rounded-full uppercase cursor-pointer" onclick="alert('Static Preview Mode - ZIP Not Active')">
          📦 Download Frame ZIP
        </button>
        <button class="bg-red-500/15 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-mono text-[9px] font-bold py-1 px-3 rounded-full uppercase cursor-pointer" onclick="window.getDesignSandbox().switchWindow('none');">
          ✕ Close Static View
        </button>
      `;
      readyActions.style.display = "flex";
    }
  }

  startMockLogWorker() {
    this.stopMockLogWorker();

    const mockLogs = [
      () => `<div class="text-white/60">[Pipeline] Transcoding index ${Math.round(100 + Math.random() * 150)} ... done</div>`,
      () => `<div class="text-emerald-400/90">[Assemble] Chunk write validation verified at 0.12ms.</div>`,
      () => `<div class="text-white/55">[Memory] Active GC heap cleared. Available: 4.81 GB balance.</div>`,
      () => `<div class="text-amber-400/90">[Compile] Sub-thread 2 reported microsecond drift. Corrected alignment.</div>`,
      () => `<div class="text-white/65">[FFmpeg] Packet frame flags: metadata tags successfully serialized.</div>`,
      () => `<div class="text-cyan-400">[Pipeline] Live speed calculation: ~2.8x compression coefficient.</div>`
    ];

    this.mockLogIntervalId = setInterval(() => {
      const logScroll = document.getElementById("assembly-log-scroll");
      if (logScroll) {
        const randFunc = mockLogs[Math.floor(Math.random() * mockLogs.length)];
        logScroll.insertAdjacentHTML("beforeend", randFunc());
        this.updateLogCount();
        this.scrollLogToBottom();
      }
    }, 2800);
  }

  stopMockLogWorker() {
    if (this.mockLogIntervalId) {
      clearInterval(this.mockLogIntervalId);
      this.mockLogIntervalId = null;
    }
  }

  updateLogCount() {
    const logScroll = document.getElementById("assembly-log-scroll");
    const countEl = document.getElementById("assembly-log-count");
    if (logScroll && countEl) {
      const linesCount = logScroll.children.length;
      countEl.textContent = `${linesCount} lines total`;
    }
  }

  scrollLogToBottom() {
    const container = document.getElementById("assembly-log-scroll");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  startMockCanvasAnimation() {
    this.stopMockCanvasAnimation();

    const canvas = document.getElementById("preview-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 320;
    canvas.height = 180;

    let tick = 0;
    const animate = () => {
      ctx.fillStyle = "#0c0a09"; // Dark background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render oscilloscope scan line inside preview
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0, 255, 204, 0.8)";
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        // Multi-frequency wave simulating coupled soliton pendulum
        const angle1 = (x / 20) + (tick / 15);
        const angle2 = (x / 10) - (tick / 8);
        const y = canvas.height / 2 + Math.sin(angle1) * 35 + Math.cos(angle2) * 12;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Render glowing crosshairs
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Draw active frames counts
      ctx.fillStyle = "rgba(0, 255, 204, 0.95)";
      ctx.font = "bold 9px monospace";
      ctx.fillText(`MOCK RENDER FRAME: ${Math.round((this.mockProgressValue / 100) * 300)}`, 12, 24);
      ctx.fillText("STATUS: ACTIVE PIPELINE", 12, canvas.height - 12);

      // Rotating pointer simulating 3D Orbit view axis
      const cx = canvas.width - 32;
      const cy = 28;
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
      
      const px = cx + Math.cos(tick / 18) * 12;
      const py = cy + Math.sin(tick / 18) * 12;
      ctx.fillStyle = "#e11d48";
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      tick++;
      this.mockCanvasAnimationId = requestAnimationFrame(animate);
    };

    animate();
  }

  stopMockCanvasAnimation() {
    if (this.mockCanvasAnimationId) {
      cancelAnimationFrame(this.mockCanvasAnimationId);
      this.mockCanvasAnimationId = null;
    }
  }

  populateMockDiagnosticsData() {
    const hardwareCoresEl = document.getElementById("diag-cores");
    if (hardwareCoresEl) { hardwareCoresEl.textContent = "12 HyperThreads"; }

    const hardwareMemEl = document.getElementById("diag-mem");
    if (hardwareMemEl) { hardwareMemEl.textContent = "16.0 GB RAM (Verified Device Pool)"; }

    const hardwareSabEl = document.getElementById("diag-sab");
    if (hardwareSabEl) {
      hardwareSabEl.textContent = "YES (SharedArrayBuffer Secured)";
      hardwareSabEl.className = "text-emerald-400 font-bold font-mono";
    }

    const opfsEl = document.getElementById("diag-opfs");
    if (opfsEl) {
      opfsEl.textContent = "AVAILABLE (Full Read/Write OPFS active)";
      opfsEl.className = "text-emerald-400 font-bold font-mono";
    }

    // Populate test checkboxes and visual status rows inside modal container
    const container = document.getElementById("diagnostics-tests-container");
    if (container) {
      container.innerHTML = `
        <!-- ITEM 1: COMPLETED SUCCESS -->
        <div class="test-item border-2 border-emerald-500/50 bg-emerald-500/5 rounded-md p-1 px-1.5 flex flex-col sm:flex-row justify-between sm:items-center gap-1.5 transition-colors">
          <div class="flex-1 col-span-1 min-w-0">
            <div class="flex items-center gap-1">
              <input type="checkbox" class="w-2 h-2 accent-white cursor-pointer" checked>
              <span class="text-[7.5px] font-bold text-white uppercase font-mono">Assertion SD MP4 (ST Single Threaded)</span>
              <span class="text-[4.5px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 py-0.1 rounded font-mono font-bold select-none font-semibold">30 FMR</span>
            </div>
            <p class="text-[5.5px] text-white/50 pl-3.5 select-none leading-snug">Verifies rapid MP4 rendering with a basic 30-frame sequence using direct pixel byte array transcoding feeds.</p>
            <div class="text-[4.8px] font-mono text-white/35 pl-3.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
              Pipeline: <span class="text-white/60">FFmpeg WASM</span> | Resolution: <span class="text-white/60">640x360</span> | Format: <span class="text-white/60">mp4</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 justify-end pl-3.5 sm:pl-0">
            <span class="text-[5.5px] font-mono font-bold uppercase select-none rounded px-1 text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">SUCCEEDED ✓</span>
            <button class="bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 rounded py-0.5 px-1.5 text-[5px] select-none uppercase tracking-wider font-bold">Reshoot</button>
          </div>
        </div>

        <!-- ITEM 2: WORKING STATE -->
        <div class="test-item border-2 border-amber-500/50 bg-amber-500/5 rounded-md p-1 px-1.5 flex flex-col sm:flex-row justify-between sm:items-center gap-1.5 transition-colors animate-pulse">
          <div class="flex-1 col-span-1 min-w-0">
            <div class="flex items-center gap-1">
              <input type="checkbox" class="w-2 h-2 accent-white cursor-pointer" checked>
              <span class="text-[7.5px] font-bold text-amber-300 uppercase font-mono">Assertion FHD 1080p (MT Multi Threaded)</span>
              <span class="text-[4.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.1 rounded font-mono font-bold select-none font-semibold">60 FMR</span>
            </div>
            <p class="text-[5.5px] text-white/50 pl-3.5 select-none leading-snug">Parallelizes transcoding computations across multiple webassembly CPU cores inside background worker contexts.</p>
            <div class="text-[4.8px] font-mono text-white/35 pl-3.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
              Pipeline: <span class="text-white/60">FFmpeg WASM MT</span> | Resolution: <span class="text-white/60">1920x1080</span> | Format: <span class="text-white/60">webm</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 justify-end pl-3.5 sm:pl-0">
            <span class="text-[5.5px] font-mono font-extrabold uppercase select-none rounded px-1 text-amber-300 bg-amber-500/15 border border-amber-500/30 animate-pulse">RUNNING⚙</span>
            <button class="bg-red-500/25 border border-red-500/40 text-red-400 hover:bg-red-500/40 rounded py-0.5 px-1.5 text-[5px] select-none uppercase tracking-wider font-bold">Abort</button>
          </div>
        </div>

        <!-- ITEM 3: ERROR FAILURE STATE -->
        <div class="test-item border-2 border-red-500/50 bg-red-500/5 rounded-md p-1.5 flex flex-col justify-between gap-1.5 transition-colors">
          <div class="flex justify-between items-center w-full flex-wrap gap-1">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1">
                <input type="checkbox" class="w-2 h-2 accent-white cursor-pointer">
                <span class="text-[7.5px] font-bold text-red-400 uppercase font-mono">UHD 4K (Sab Memory Check)</span>
                <span class="text-[4.5px] bg-red-500/20 text-red-300 border border-red-500/30 px-1 py-0.1 rounded font-mono font-bold select-none font-semibold">120 FMR</span>
              </div>
              <p class="text-[5.5px] text-white/55 pl-3.5 select-none leading-snug">Extreme stress test asserting heavy allocations and video memory scaling under 3840x2160 pixels bounds.</p>
              <div class="text-[4.8px] font-mono text-white/35 pl-3.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
                Pipeline: <span class="text-white/60">FFmpeg WASM MT</span> | Resolution: <span class="text-white/60">3840x2160</span> | Format: <span class="text-white/60">mp4</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0 justify-end pl-3.5 sm:pl-0">
              <span class="text-[5.5px] font-mono font-bold uppercase select-none rounded px-1 text-red-400 bg-red-500/15 border border-red-500/30">FAILED 🛑</span>
              <button class="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded py-0.5 px-1.5 text-[5px] select-none uppercase tracking-wider font-bold">Retry</button>
            </div>
          </div>
          <!-- Revealed Error Log Panel in red -->
          <div class="ml-3.5 border border-red-500/30 bg-red-500/10 text-red-200 font-mono text-[5px] p-2 rounded-md leading-normal select-text">
            <strong class="text-red-400 select-none font-bold uppercase block mb-1">FAIL DETAILS: Out-of-Memory heap overflow exception (OOM)</strong>
            <span>Worker thread terminated unexpectedly at step 84 due to restricted browser memory cap. Max heap limit of 2.1 GB reached. Suggest thottling CRF compression or selecting smaller FHD resolution scale.</span>
          </div>
        </div>

        <!-- ITEM 4: OMITTED TABLET RESTRICTION -->
        <div class="test-item border border-white/5 bg-white/[0.015] rounded-md p-1 px-1.5 flex flex-col sm:flex-row justify-between sm:items-center gap-1.5 transition-colors opacity-45">
          <div class="flex-1 col-span-1 min-w-0">
            <div class="flex items-center gap-1">
              <input type="checkbox" class="w-2 h-2 accent-white cursor-pointer" disabled>
              <span class="text-[7.5px] font-normal text-white/40 uppercase font-mono line-through">Handheld Max Viewport 4K Assert</span>
              <span class="text-[4.5px] bg-white/5 text-white/40 border border-white/10 px-1 py-0.1 rounded font-mono font-bold select-none font-semibold">90 FMR</span>
            </div>
            <p class="text-[5.5px] text-white/30 pl-3.5 select-none leading-snug">Checks compliance mapping benchmarks on small/portable high-density tactile devices screens.</p>
            <div class="text-[4.8px] font-mono text-white/20 pl-3.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
              Resolution: <span class="text-white/40">3840x2160</span> | Format: <span class="text-white/40">mp4</span>
            </div>
            <div class="ml-3.5 mt-0.5 text-amber-500/60 font-mono text-[5px] font-semibold select-none uppercase">⚠ Omitted: Format Too Large for Mobile Aspect Scale Bounds</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 justify-end pl-3.5 sm:pl-0">
            <span class="text-[5px] font-mono font-bold uppercase select-none rounded px-2 py-0.5 border border-amber-500/20 bg-amber-500/10 text-amber-400">Scale Restricted</span>
          </div>
        </div>
      `;
    }

    // Connect text phase
    const phaseVal = document.getElementById("txt-diagnostics-phase-val");
    if (phaseVal) {
      phaseVal.textContent = "SANDBOX CALIBRATION";
      phaseVal.className = "font-black text-amber-400 tracking-wider";
    }

    // Populate Console Logs box with simulated diagnostics assert traces
    const consoleBoxEl = document.getElementById("diagnostics-logs-scrollbar");
    if (consoleBoxEl) {
      consoleBoxEl.innerHTML = `
        <div class="text-amber-500/90 font-bold">[Sandbox] Triggering static visual calibration for diagnostics overlays...</div>
        <div class="text-white/40">[System] Virtual test array size: 4 tests initialized.</div>
        <div class="text-white/60">[Audit] Hardware thread capacity profile: SharedArrayBuffer secured successfully.</div>
        <div class="text-emerald-400">[Test 1] Succeeded. Assert pass criterion checked in 1.48s. Video bytes aligned.</div>
        <div class="text-amber-400 animate-pulse">[Test 2] Active transcode worker spawned. Pumping frame queue blocks...</div>
        <div class="text-red-400/95 font-bold">[Test 3] CRITICAL FAILURE: Out-Of-Memory heap boundary triggered in raw codec allocator pool.</div>
        <div class="text-white/30">[Suite] Automated trace dumps mapped inside copy buffer arrays.</div>
      `;
    }
  }

  toast(title, text, type = "amber") {
    const container = document.getElementById("hud-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "p-3 rounded-lg border backdrop-blur-md flex flex-col gap-0.5 pointer-events-auto transition-transform animate-slide-in shadow-lg";
    
    let border = "border-amber-500/30";
    let bg = "bg-amber-950/80";
    let textAccent = "text-amber-400";
    
    if (type === "emerald") {
      border = "border-emerald-500/30";
      bg = "bg-emerald-950/80";
      textAccent = "text-emerald-400";
    } else if (type === "gray") {
      border = "border-white/10";
      bg = "bg-zinc-900/80";
      textAccent = "text-white/60";
    } else if (type === "warning") {
      border = "border-orange-500/30";
      bg = "bg-orange-950/80";
      textAccent = "text-orange-400";
    } else if (type === "danger") {
      border = "border-red-500/30";
      bg = "bg-red-950/80";
      textAccent = "text-red-400";
    }

    toast.className += ` ${border} ${bg}`;

    toast.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="font-mono text-[9px] font-black uppercase tracking-widest ${textAccent}">${title}</span>
        <button class="text-white/40 hover:text-white font-mono text-[8px] cursor-pointer" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <p class="text-white/70 font-mono text-[8.5px] leading-snug">${text}</p>
    `;

    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3500);
  }
}

// Singleton instances factory
let sandboxInstance = null;
export function getDesignSandbox() {
  if (!sandboxInstance) {
    sandboxInstance = new DesignSandbox();
  }
  return sandboxInstance;
}
window.getDesignSandbox = getDesignSandbox;
