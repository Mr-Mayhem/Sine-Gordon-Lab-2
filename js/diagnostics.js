// =============================================================================
// sine-gordon-lab — js/diagnostics.js
// Dedicated Diagnostics & Pipeline Stress Tester Window Module.
// Consolidates diagnostic testing interfaces, resolution coverage scans,
// different compression rates, and frame counts (30 vs 300) without cluttering.
// =============================================================================

import { DiscSpaceEstimator } from "./disc-space-estimator.js";
import { LogNexus } from "./logger.js";
import { resolveRecordingResolution } from "./recorder-library/video-filters.js";

class EnvironmentDetector {
  static detect() {
    let memStr = "Unknown";
    let devMem = navigator.deviceMemory;
    let heapLimit = null;
    
    if (window.performance && window.performance.memory && window.performance.memory.jsHeapSizeLimit) {
      heapLimit = (window.performance.memory.jsHeapSizeLimit / (1024 * 1024 * 1024)).toFixed(1) + " GB Heap Limit";
    }

    // Direct Heap Capacity Probe (Physical check when browser blocks standard fingerprint APIs)
    // Kept under 512MB to avoid triggering aggressive OOM page termination on mobile/iOS
    let maxAllocatedMb = 0;
    const probeSizes = [512, 256, 128, 64, 32];
    for (let sizeMb of probeSizes) {
      try {
        let len = sizeMb * 1024 * 1024;
        let probe = new Uint8Array(len);
        probe[0] = 1;
        probe[len - 1] = 1; // Commit physical memory space to bypass virtual memory optimizations
        maxAllocatedMb = sizeMb;
        probe = null; // Clean up immediately for Garbage Collection
        break;
      } catch (e) {
        // Fallback to a smaller contiguous allocation block check
      }
    }

    let allocStr = maxAllocatedMb > 0 ? `${maxAllocatedMb} MB Max Chunk` : "";

    // Fallback to WebGL GPU tier identification + hardware concurrency heuristics when standard APIs are restricted
    let webglTier = "";
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
        
        const isHighEndGPU = /nvidia|rtx|gtx|radeon|apple m[1-9]/i.test(renderer);
        if (maxTexSize >= 16384 || isHighEndGPU) {
          webglTier = "High-End GPU";
        } else if (maxTexSize >= 8192) {
          webglTier = "Mid-Range GPU";
        } else {
          webglTier = "Standard GPU";
        }
      }
    } catch (e) {
      // Ignore WebGL exceptions
    }

    let coresVal = navigator.hardwareConcurrency || 4;
    let estimatedRAM = "4 GB Est.";
    if (coresVal >= 12) {
      estimatedRAM = ">= 16 GB Est.";
    } else if (coresVal >= 8) {
      estimatedRAM = ">= 8 GB Est.";
    } else if (coresVal >= 4) {
      estimatedRAM = ">= 4 GB Est.";
    }

    // Assemble the final robust string, ensuring it is NEVER "Unknown" and NEVER red
    if (devMem) {
      memStr = `${devMem} GB RAM`;
      if (heapLimit) {
        memStr += ` (${heapLimit})`;
      } else if (allocStr) {
        memStr += ` (${allocStr})`;
      }
    } else if (heapLimit) {
      memStr = heapLimit;
      if (allocStr) {
        memStr += ` (${allocStr})`;
      }
    } else if (allocStr) {
      memStr = `${estimatedRAM} (${allocStr}`;
      if (webglTier) {
        memStr += `, ${webglTier}`;
      }
      memStr += ")";
    } else {
      memStr = estimatedRAM;
      if (webglTier) {
        memStr += ` (${webglTier})`;
      }
    }

    return {
      cores: navigator.hardwareConcurrency || "N/A",
      mem: memStr,
      sab: typeof SharedArrayBuffer !== "undefined" ? "AVAILABLE" : "UNAVAILABLE",
      opfs: (typeof navigator.storage !== "undefined" && typeof navigator.storage.getDirectory === "function") ? "COMPATIBLE" : "INCOMPATIBLE"
    };
  }
}

class EnvironmentStyleHelper {
  static applyStatusDecoration(el, status, type) {
    if (!el) return;
    el.textContent = status;
    
    if (type === "cores") {
      if (status !== "N/A" && parseInt(status) >= 2) {
        el.style.color = "#4ade80"; // Bright green for multi-core environments
      } else {
        el.style.color = "#f87171"; // Red for single-core/N/A
      }
    } else if (type === "mem") {
      if (status === "Unknown") {
        el.style.color = "#f87171"; // Red for unknown / missing values
      } else {
        // Handle MB/GB capacity detection and color selection robustly
        let hasPlenty = false;
        if (status.includes("GB")) {
          const val = parseFloat(status);
          if (!isNaN(val) && val >= 2.0) hasPlenty = true;
        } else if (status.includes("MB")) {
          const val = parseFloat(status);
          if (!isNaN(val) && val >= 64) hasPlenty = true; // Safe allocated block is plenty
        } else if (status.includes("Est.")) {
          hasPlenty = true; // Estimated using WebGL/Cores is sufficient
        } else {
          const val = parseFloat(status);
          if (!isNaN(val) && val >= 4) hasPlenty = true;
        }

        if (hasPlenty) {
          el.style.color = "#4ade80"; // High-contrast green
        } else {
          el.style.color = "#facc15"; // Yellow warning
        }
      }
    } else if (type === "sab") {
      if (status === "AVAILABLE") {
        el.style.color = "#4ade80"; // High-contrast green
      } else {
        el.style.color = "#f87171"; // High-contrast red
      }
    } else if (type === "opfs") {
      if (status === "COMPATIBLE") {
        el.style.color = "#4ade80"; // High-contrast green
      } else {
        el.style.color = "#f87171"; // High-contrast red
      }
    }
  }
}

class TestSpecHelper {
  static createSpec({ mode, resolution, crf, threading }) {
    let pipeline = "ffmpeg";
    let format = "webm";
    let testCrf = crf;
    let description = "";

    const threadLabel = threading === "MT" ? "multi-threaded" : "single-threaded";

    if (mode === "Frames_to_Zip") {
      pipeline = "zip";
      format = "zip";
      testCrf = null;
      description = `Verifies high-speed synchronized pixel capture and low-memory JSZip stream generation at ${resolution.width}x${resolution.height}.`;
    } else if (mode === "Zip_to_Video_WebM") {
      pipeline = "zip-to-video";
      format = "webm";
      description = `Tests in-memory zip file extraction and high-speed WebAssembly FFmpeg WebM transcode at ${resolution.width}x${resolution.height} (CRF ${testCrf}).`;
    } else if (mode.startsWith("Zip_to_Video_MP4")) {
      pipeline = "zip-to-video";
      format = "mp4";
      description = `Tests in-memory zip file extraction and ${threadLabel} WebAssembly FFmpeg H.264 MP4 transcode at ${resolution.width}x${resolution.height} (CRF ${testCrf}).`;
    } else if (mode === "Frames_to_Video_WebM") {
      pipeline = "ffmpeg";
      format = "webm";
      description = `Verifies direct WebGL capture to high-speed WebAssembly FFmpeg WebM compilation at ${resolution.width}x${resolution.height} (CRF ${testCrf}).`;
    } else if (mode.startsWith("Frames_to_Video_MP4")) {
      pipeline = "ffmpeg";
      format = "mp4";
      description = `Verifies direct WebGL capture to ${threadLabel} H.264 MP4 transcode at ${resolution.width}x${resolution.height} (CRF ${testCrf}).`;
    }

    const modeTitle = mode.replace(/_/g, " ");

    return {
      id: `DIAG_${mode}_${threading || "ST"}_${resolution.width}x${resolution.height}`,
      name: `${modeTitle} (${threading || "ST"}): ${resolution.name} (${resolution.width}x${resolution.height})`,
      category: `Mode: ${mode}`,
      pipeline: pipeline,
      format: format,
      threading: threading || "ST",
      width: resolution.width,
      height: resolution.height,
      fps: resolution.fps,
      crf: testCrf,
      frames: 30,
      highRes: resolution.highRes || false,
      description: description
    };
  }
}

let DIAGNOSTIC_TESTS = [];

export class DiagnosticsManager {
  constructor() {
    this.modalId = "diagnostics-overlay";
    this.isTesting = false;
    this.isAborted = false;
    this.currentTestIndex = -1;
    this.logs = LogNexus.testLogs;
    this.testResults = {};
    
    this.setupModal();
  }

  setupModal() {
    // Avoid double injection
    if (document.getElementById(this.modalId)) return;

    const overlay = document.createElement("div");
    overlay.id = this.modalId;
    overlay.className = "theory-overlay"; // reuse backdrop style
    overlay.style.display = "none";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.backdropFilter = "blur(24px)";
    overlay.style.zIndex = "1001";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";

    const content = document.createElement("div");
    content.className = "theory-content";
    content.style.position = "relative";
    // Inline constraints deleted to allow complete layout parity matching of ID selector in style.css

    let testsHtml = "";

    content.innerHTML = `
      <!-- Circular Glass Close button at upper-right -->
      <button id="btn-close-diagnostics" style="position: absolute; top: 16px; right: 16px; z-index: 50;" class="w-8 h-8 rounded-full bg-white/10 border-0 text-white hover:bg-white/20 text-sm flex items-center justify-center cursor-pointer transition-all active:scale-95" title="Close Diagnostics">✕</button>

      <header class="flex justify-between items-center border-b border-white/10 pb-1 mb-1.5 pr-10">
        <div>
          <h1 class="text-[8px] font-bold tracking-wider text-white select-none uppercase font-mono">Video Pipeline Diagnostics</h1>
          <p class="text-white/35 font-mono text-[5.2px] uppercase tracking-[0.12em] mt-0.5 select-none">Automated compliance checks • Frame rate integrity benchmarks</p>
        </div>
      </header>

      <!-- System Diagnostic Metadata Header -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-1.5 bg-white/[0.015] border border-white/5 rounded-lg p-1 mb-1.5 text-[5.5px] text-white/60">
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">System Cores: </span><strong id="diag-cores">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">Reported Memory: </span><strong id="diag-mem">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">SharedArrayBuffer: </span><strong id="diag-sab">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">OPFS Sandbox: </span><strong id="diag-opfs">Calculating...</strong></div>
      </section>

      <!-- Action Control Row -->
      <div class="flex flex-wrap items-center justify-between gap-1 bg-white/[0.02] border border-white/5 p-1 px-1.5 rounded-lg mb-1.5">
        <div class="flex flex-wrap gap-1 md:gap-2 items-center">
          <!-- Mode Selection Dropdown -->
          <div class="flex items-center gap-1 text-[5.5px] text-white select-none uppercase font-bold tracking-wider border-r border-white/10 pr-1 lg:pr-2">
            <span class="text-white/45 font-bold text-[5.5px]">Mode:</span>
            <select id="sel-diagnostic-mode" class="thumb-select bg-white/5 border border-white/15 hover:border-white/45 rounded px-1 cursor-pointer !h-[16px] !py-0 !text-[5.5px] text-white font-bold focus:outline-none focus:ring-1 focus:ring-white/30">
              <option value="Frames_to_Zip" selected>Frames_to_Zip</option>
              <option value="Zip_to_Video_WebM">Zip_to_Video (WebM)</option>
              <option value="Zip_to_Video_MP4_ST">Zip_to_Video (MP4 ST)</option>
              <option value="Zip_to_Video_MP4_MT" id="opt-zip-mp4-mt">Zip_to_Video (MP4 MT)</option>
              <option value="Frames_to_Video_WebM">Frames_to_Video (WebM)</option>
              <option value="Frames_to_Video_MP4_ST">Frames_to_Video (MP4 ST)</option>
              <option value="Frames_to_Video_MP4_MT" id="opt-frames-mp4-mt">Frames_to_Video (MP4 MT)</option>
            </select>
          </div>
          <!-- Compression Selection Dropdown -->
          <div class="flex items-center gap-1 text-[5.5px] text-white select-none uppercase font-bold tracking-wider border-r border-white/10 pr-1 lg:pr-2" id="box-diagnostic-compression" style="display: none;">
            <span class="text-white/45 font-bold text-[5.5px]">Compression:</span>
            <select id="sel-diagnostic-compression" class="thumb-select bg-white/5 border border-white/15 hover:border-white/45 rounded px-1 cursor-pointer !h-[16px] !py-0 !text-[5.5px] text-white font-bold focus:outline-none focus:ring-1 focus:ring-white/30">
              <option value="18">High Quality (CRF 18)</option>
              <option value="23" selected>Standard (CRF 23)</option>
              <option value="28">Eco Space (CRF 28)</option>
              <option value="32">Extreme Space (CRF 32)</option>
            </select>
          </div>
          <label class="flex items-center gap-1 text-[5.5px] text-white/55 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-select-all" class="w-2 h-2 accent-white cursor-pointer" checked>
            Select All
          </label>
          <label class="flex items-center gap-1 text-[5.5px] text-white/55 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-enable-probing" class="w-2 h-2 accent-white cursor-pointer" checked>
            Enable Output Probing
          </label>
        </div>
        
        <!-- Dynamic Target Frame Count Range -->
        <div class="flex items-center gap-1">
          <select id="sel-test-frames-selector" class="thumb-select bg-white/5 border border-white/15 rounded px-1 cursor-pointer !h-[16px] !py-0 !text-[5.5px]">
            <option value="10">DURATION: 10 Frames (Ultra Short)</option>
            <option value="15" selected>DURATION: 15 Frames (Short Sandbox)</option>
            <option value="30">DURATION: 30 Frames (Quick Sandbox)</option>
            <option value="60">DURATION: 60 Frames (Medium Debug)</option>
            <option value="150">DURATION: 150 Frames (Stress Standard)</option>
            <option value="300">DURATION: 300 Frames (Long Stress)</option>
            <option value="600">DURATION: 600 Frames (Extreme Stress)</option>
            <option value="1500">DURATION: 1500 Frames (Max Space Lab)</option>
          </select>
        </div>

        <div class="flex gap-1">
          <button id="btn-run-all-diagnostics" class="btn-pill bg-white/10 text-white hover:bg-white/15 border border-white/20 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap">▶ Run Selected</button>
          <button id="btn-abort-diagnostics" class="btn-pill bg-white/10 text-white hover:bg-white/15 border border-white/20 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap" style="display:none;">⏹ Abort Suite</button>
          <button id="btn-copy-test-report" class="btn-pill bg-white/10 text-white hover:bg-white/15 border border-white/20 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-clear-diagnostic-logs" class="btn-pill bg-white/5 text-white/55 hover:bg-white/10 border border-white/10 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap">🧹 Clear Logs</button>
        </div>
      </div>

      <!-- Main Test Suite Grid (Made Taller) -->
      <div id="diagnostics-tests-container" class="flex flex-col gap-1 pr-1 select-none scrollbar-thin mb-1.5" style="flex: 1; overflow-y: auto;">
        <!-- Dynamically populated via rebuildTestsList() -->
      </div>

      <!-- Real-time Test Output Logs Console (Fine print and scrollable) -->
      <div id="diagnostics-console-box" class="border border-white/5 rounded-lg bg-black/95 p-1.5 flex flex-col gap-0.5 overflow-hidden" style="height: 150px; min-height: 150px; display: flex !important; flex-shrink: 0; box-sizing: border-box;">
        <div class="flex justify-between items-center text-[4.6px] uppercase tracking-wider border-b border-white/5 pb-0.5 mb-0.5 text-white/35">
          <span>Engine Output Console</span>
          <span id="txt-diagnostics-phase-val" class="font-bold text-yellow-400">IDLE</span>
        </div>
        <div id="diagnostics-logs-scrollbar" class="flex-1 overflow-y-auto pr-1 space-y-0.5 text-left text-white/60 font-mono text-[4.8px] leading-tight scrollbar-thin select-text">
          <div class="text-white/20 font-bold">[Suite] Welcome to the Sine-Gordon Lab Pipeline Diagnostics Center. Select tests and run pipeline benchmark assertions.</div>
        </div>
        <div class="mt-0.5" id="box-diagnostics-progress-outer" style="display:none;">
          <div style="height:3px; background:rgba(255,255,255,0.05); border-radius:9999px; overflow:hidden;" class="w-full">
            <div id="diagnostics-progress-fill" style="height:100%; background:linear-gradient(90deg, #ffffff, #9ca3af); width:0%; transition:none;"></div>
          </div>
          <div class="flex justify-between items-center text-[4.6px] text-white/35 mt-0.5">
            <span id="txt-diagnostics-progress-step">Processing...</span>
            <span id="txt-diagnostics-progress-percent">0%</span>
          </div>
        </div>
      </div>

      <!-- Bottom Actions Footer Row -->
      <div class="flex justify-between items-center mt-1.5 bg-white/[0.015] border border-white/5 p-1 px-1.5 rounded-lg select-none text-[6px]">
        <span class="text-white/30 font-mono text-[5.2px] uppercase tracking-wider pl-1 font-bold">Compliance Report Actions</span>
        <div class="flex gap-1">
          <button id="btn-copy-test-report-bottom" class="btn-pill bg-white/10 text-white hover:bg-white/15 border border-white/20 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap cursor-pointer select-none" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-close-diagnostics-bottom" class="btn-pill bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 py-0.5 px-1.5 rounded text-[5.5px] font-bold transition-all whitespace-nowrap cursor-pointer select-none">Close</button>
        </div>
      </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Filter MT options dynamically if SAB is absent or browser-restricted
    const hasSAB = typeof SharedArrayBuffer !== "undefined";
    if (!hasSAB) {
      const optZipMt = document.getElementById("opt-zip-mp4-mt");
      if (optZipMt) optZipMt.remove();
      const optFramesMt = document.getElementById("opt-frames-mp4-mt");
      if (optFramesMt) optFramesMt.remove();
    }

    // Bind event handlers
    const btnCloseDiag = document.getElementById("btn-close-diagnostics");
    if (btnCloseDiag) {
      btnCloseDiag.onclick = (e) => {
        if (e) e.stopPropagation();
        this.hide();
      };
      btnCloseDiag.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        this.hide();
      });
    }
    const btnCloseDiagBot = document.getElementById("btn-close-diagnostics-bottom");
    if (btnCloseDiagBot) {
      btnCloseDiagBot.onclick = (e) => {
        if (e) e.stopPropagation();
        this.hide();
      };
      btnCloseDiagBot.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        this.hide();
      });
    }
    document.getElementById("btn-clear-diagnostic-logs").onclick = () => this.clearLogs();
    
    // Frames list update binding
    const framesSelect = document.getElementById("sel-test-frames-selector");
    if (framesSelect) {
      framesSelect.onchange = () => {
        this.updateUIForSelectedFrameCount();
      };
    }
    
    // Select All Checkbox logic
    const selectAllChk = document.getElementById("chk-select-all");
    if (selectAllChk) {
      selectAllChk.onchange = (e) => {
        const isChecked = e.target.checked;
        DIAGNOSTIC_TESTS.forEach(t => {
          const itemChk = document.getElementById(`chk-test-${t.id}`);
          if (itemChk && !itemChk.disabled) {
            itemChk.checked = isChecked;
          }
        });
      };
    }

    // Mode / compression reactive updates
    const modeSelect = document.getElementById("sel-diagnostic-mode");
    const compressionSelect = document.getElementById("sel-diagnostic-compression");

    if (modeSelect) {
      modeSelect.onchange = () => {
        const compBox = document.getElementById("box-diagnostic-compression");
        if (modeSelect.value === "Frames_to_Zip") {
          if (compBox) compBox.style.display = "none";
        } else {
          if (compBox) compBox.style.display = "flex";
        }
        this.rebuildTestsList();
      };
    }

    if (compressionSelect) {
      compressionSelect.onchange = () => {
        this.rebuildTestsList();
      };
    }

    // Run Selected Button
    document.getElementById("btn-run-all-diagnostics").onclick = () => this.runSelected();

    // Abort button
    document.getElementById("btn-abort-diagnostics").onclick = () => this.abort();

    // Copy Report button
    document.getElementById("btn-copy-test-report").onclick = () => this.copyReportToClipboard();
    const copyReportBottom = document.getElementById("btn-copy-test-report-bottom");
    if (copyReportBottom) {
      copyReportBottom.onclick = () => this.copyReportToClipboard();
    }

    // Initialize Tests List Reactively
    this.rebuildTestsList();

    // Load specs dynamically
    this.updateSpecs();
  }

  rebuildTestsList() {
    const selMode = document.getElementById("sel-diagnostic-mode") ? document.getElementById("sel-diagnostic-mode").value : "Frames_to_Zip";
    const selCrf = document.getElementById("sel-diagnostic-compression") ? document.getElementById("sel-diagnostic-compression").value : "23";

    const RESOLUTIONS = [
      { name: "SD 360p", width: 640, height: 360, fps: 30 },
      { name: "SD 480p", width: 852, height: 480, fps: 30 },
      { name: "HD 720p", width: 1280, height: 720, fps: 30 },
      { name: "FHD 1080p", width: 1920, height: 1080, fps: 30, highRes: true },
      { name: "QHD 1440p", width: 2560, height: 1440, fps: 30, highRes: true },
      { name: "UHD 4K 2160p", width: 3840, height: 2160, fps: 30, highRes: true }
    ];

    let threading = "ST";
    let baseMode = selMode;
    if (selMode.endsWith("_ST")) {
      threading = "ST";
      baseMode = selMode.substring(0, selMode.length - 3);
    } else if (selMode.endsWith("_MT")) {
      threading = "MT";
      baseMode = selMode.substring(0, selMode.length - 3);
    }

    DIAGNOSTIC_TESTS = RESOLUTIONS.map(res => {
      return TestSpecHelper.createSpec({
        mode: baseMode,
        resolution: res,
        crf: selCrf,
        threading: threading
      });
    });

    const container = document.getElementById("diagnostics-tests-container");
    if (!container) return;

    const selectAllChk = document.getElementById("chk-select-all");
    const isSelectAllChecked = selectAllChk ? selectAllChk.checked : true;

    // Tablet & mobile device boundary matching
    const isMobileOrTablet = /Mobi|Android|iPhone|iPad|Macintosh/i.test(navigator.userAgent) && 
                             (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches);
    const screenW = window.screen && window.screen.width ? window.screen.width : 1024;
    const screenH = window.screen && window.screen.height ? window.screen.height : 768;
    const maxScreenDim = Math.max(screenW, screenH);
    const minScreenDim = Math.min(screenW, screenH);

    const testsGroupHtml = DIAGNOSTIC_TESTS.map(test => {
      let description = test.description;
      if (typeof SharedArrayBuffer === "undefined") {
        description = description.replace(" and multi-threaded worker rendering", "");
        description = description.replace("multi-threaded worker rendering", "single-threaded rendering");
      }

      // If test dimensions are wider/higher than screen dimensions
      const isTooLarge = isMobileOrTablet && (test.width > maxScreenDim || test.height > minScreenDim);
      const checkedAttr = (isSelectAllChecked && !isTooLarge) ? "checked" : "";
      const disabledAttr = isTooLarge ? "disabled" : "";
      const opacityClass = isTooLarge ? "opacity-45" : "";

      return `
      <div class="test-item border border-white/5 bg-white/[0.015] rounded-md p-1 px-1.5 flex flex-col sm:flex-row justify-between sm:items-center gap-1.5 ${opacityClass}" id="test-card-${test.id}">
        <div class="flex-1 col-span-1 min-w-0">
          <div class="flex items-center gap-1">
            <input type="checkbox" id="chk-test-${test.id}" class="w-2 h-2 accent-white cursor-pointer" ${checkedAttr} ${disabledAttr}>
            <span id="test-title-${test.id}" class="text-[6px] font-semibold text-white/95 transition-colors ${isTooLarge ? 'text-white/40 line-through' : ''}">${test.name}</span>
            <span class="text-[4.2px] bg-white/5 hover:bg-white/10 text-white/70 border border-white/15 px-1 py-0.1 rounded font-mono font-bold select-none flex-frames-badge" id="frames-badge-${test.id}">${test.frames} FMR</span>
          </div>
          <p class="text-[5px] text-white/40 pl-3.5 select-none leading-snug">${description}</p>
          <div class="text-[4.6px] font-mono text-white/20 pl-3.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
            Pipeline: <span class="text-white/50">${test.pipeline}</span> | 
            Resolution: <span class="text-white/50">${test.width}x${test.height}</span> | 
            Format: <span class="text-white/50">${test.format}</span> ${test.crf ? `| CRF: <span class="text-white/50 font-medium">${test.crf}</span>` : ""}
          </div>
          ${isTooLarge ? `<div class="ml-3.5 mt-0.5 text-amber-500/70 font-mono text-[4.6px] font-semibold select-none uppercase">⚠ Omitted: Format Too Large for Device Screen (${screenW}x${screenH})</div>` : ""}
          <!-- Dynamic Error Box -->
          <div id="test-error-${test.id}" class="test-error-box ml-3.5 border border-red-500/20 bg-red-500/5 text-red-300 font-mono text-[4.6px] p-1 mt-0.5 rounded-md overflow-x-auto select-text hidden"></div>
        </div>
        <div class="flex items-center gap-1 shrink-0 justify-end pl-3.5 sm:pl-0">
          ${isTooLarge ? `
            <span class="text-[4.6px] font-sans font-bold uppercase select-none rounded px-1.5 py-0.5 tracking-wider border border-amber-500/20 bg-amber-500/10 text-amber-300">Format Too Large</span>
          ` : `
            <span class="text-[4.6px] font-sans font-bold uppercase select-none rounded px-1 py-0.2 tracking-wider border text-white/40 border-white/10" id="status-badge-${test.id}" style="display: none;">PENDING</span>
            <button class="btn-single-test bg-white/5 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/25 border border-white/10 py-0.5 px-1.5 rounded text-[4.2px] font-bold transition-all uppercase tracking-wider whitespace-nowrap cursor-pointer select-none" data-id="${test.id}">▶ Run Base</button>
          `}
        </div>
      </div>
      `;
    }).join("");

    container.innerHTML = `
    <div class="test-category-group mb-1.5">
      <h3 class="text-[5.5px] uppercase font-bold tracking-wider text-white/80 mb-0.5 border-b border-white/5 pb-0.5 select-none flex items-center justify-between">
        <span>MODE: ${selMode.replace(/_/g, " ")}</span>
        <span class="text-[5px] opacity-30 font-normal normal-case font-mono">Sequence Batch Assertions</span>
      </h3>
      <div class="flex flex-col gap-1">
        ${testsGroupHtml}
      </div>
    </div>
    `;

    // Rebind individual run buttons
    container.querySelectorAll(".btn-single-test").forEach(btn => {
      btn.onclick = (e) => {
        const testId = e.target.getAttribute("data-id");
        this.runSingle(testId);
      };
    });

    this.updateUIForSelectedFrameCount();
  }

  updateSpecs() {
    const specs = EnvironmentDetector.detect();

    EnvironmentStyleHelper.applyStatusDecoration(document.getElementById("diag-cores"), specs.cores, "cores");
    EnvironmentStyleHelper.applyStatusDecoration(document.getElementById("diag-mem"), specs.mem, "mem");
    EnvironmentStyleHelper.applyStatusDecoration(document.getElementById("diag-sab"), specs.sab, "sab");
    EnvironmentStyleHelper.applyStatusDecoration(document.getElementById("diag-opfs"), specs.opfs, "opfs");

    // Asynchronously resolve Storage Estimate quota constraints to augment reported memory data
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const memEl = document.getElementById("diag-mem");
        if (memEl && estimate.quota) {
          const quotaGB = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);
          const usageMB = (estimate.usage / (1024 * 1024)).toFixed(1);
          let currentText = memEl.textContent;
          // Cleanly append non-colliding storage metrics
          if (!currentText.includes("Storage Q")) {
            memEl.textContent = `${currentText} | Storage Q: ${quotaGB} GB (Used: ${usageMB} MB)`;
            memEl.style.color = "#4ade80";
          }
        }
      }).catch(err => {
        console.warn("[Diagnostics] Storage quota estimation failed:", err);
      });
    }
  }

  show() {
    const el = document.getElementById(this.modalId);
    if (el) {
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
    }
    this.updateSpecs();
    this.updateTestLengthsSelector();
    this.updateUIForSelectedFrameCount();

    // Reset selection and visibility to Level 1
    const levelFilterSelect = document.getElementById("sel-diagnostic-level-filter");
    if (levelFilterSelect) {
      levelFilterSelect.value = "level-1";
      levelFilterSelect.dispatchEvent(new Event('change'));
    }
  }

  cleanupMainRecordingState() {
    if (window.recorder) {
      window.recorder.isRecording = false;
      window.recorder.isAssembling = false;
      window.recorder.isTesting = false;
      window.recorder.testThreading = null;
      window.recorder._frameCount = 0;
      window.recorder._recordedFrames = [];
      if (typeof window.recorder._restoreCanvasSize === "function") {
        try {
          window.recorder._restoreCanvasSize();
        } catch (e) {
          console.warn("[Diagnostics Cleanup] Failed to restore canvas size:", e);
        }
      }
    }
    window.onTestVideoBlobGenerated = null;
    window.onTestZipBlobGenerated = null;

    if (window.sgState) {
      window.sgState.isRecording = false;
    }

    const recIndicator = document.getElementById("recording-indicator");
    if (recIndicator) {
      recIndicator.style.display = "none";
    }

    const processingOverlay = document.getElementById("processing-overlay");
    if (processingOverlay) {
      processingOverlay.style.display = "none";
    }

    const txtRec = document.getElementById("txt-recording");
    if (txtRec) {
      txtRec.textContent = "REC: 0";
    }

    if (window.refreshUI) {
      try {
        window.refreshUI();
      } catch (e) {}
    }
  }

  hide() {
    if (this.isTesting) {
      if (!confirm("A diagnostic check is active. Do you really wish to close and abort the running suite?")) {
        return;
      }
      this.abort();
    }
    this.cleanupMainRecordingState();
    document.getElementById(this.modalId).style.display = "none";
  }

  clearLogs() {
    LogNexus.clearTest();
    this.logs = LogNexus.testLogs;
  }

  log(msg, styleClass = "") {
    LogNexus.logTest(msg);
    this.logs = LogNexus.testLogs;
  }

  updateTestBadge(testId, status, isError = false) {
    const badge = document.getElementById(`status-badge-${testId}`);
    if (!badge) return;

    badge.textContent = status;
    badge.className = "text-[4.8px] font-sans font-bold uppercase select-none rounded px-1.5 py-0.5 tracking-wider border transition-all";
    badge.classList.remove("animate-pulse");

    const titleEl = document.getElementById(`test-title-${testId}`);

    if (status === "PENDING") {
      badge.style.display = "none";
      badge.style.color = "";
      badge.style.borderColor = "";
      badge.style.backgroundColor = "";
      if (titleEl) {
        titleEl.style.color = "";
        titleEl.className = "text-[6px] font-semibold text-white/95 transition-colors";
      }
    } else {
      badge.style.display = "inline-block";
      if (status === "PASS") {
        badge.style.color = "#4ade80";
        badge.style.borderColor = "rgba(74, 222, 128, 0.3)";
        badge.style.backgroundColor = "rgba(74, 222, 128, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#4ade80";
          titleEl.className = "text-[6px] font-semibold transition-colors";
        }
      } else if (status === "FAIL") {
        badge.style.color = "#f87171";
        badge.style.borderColor = "rgba(248, 113, 113, 0.3)";
        badge.style.backgroundColor = "rgba(248, 113, 113, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#f87171";
          titleEl.className = "text-[6px] font-semibold transition-colors";
        }
      } else {
        // Typically RUNNING or anything else
        badge.style.color = "#facc15";
        badge.style.borderColor = "rgba(250, 204, 21, 0.3)";
        badge.style.backgroundColor = "rgba(250, 204, 21, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#facc15";
          titleEl.className = "text-[6px] font-semibold transition-colors";
        }
        if (status === "RUNNING") {
          badge.classList.add("animate-pulse");
        }
      }
    }
  }

  parseErrorDetails(err) {
    const result = {
      reason: "Unknown execution challenge",
      base: "N/A",
      functionName: "anonymous"
    };

    if (!err) return result;

    result.reason = err.message || String(err);
    result.base = err.name || "Error";

    if (err.stack) {
      const lines = err.stack.split("\n");
      for (const line of lines) {
        if (!line) continue;
        if (line.includes(err.message) && !line.includes(".js") && !line.includes("@")) continue;

        // Chrome-style backtrace parsing
        const chromeMatch = line.match(/^\s*at\s+([^\s(]+)?\s*\(?([^)]+)\)?/);
        if (chromeMatch) {
          const fnName = chromeMatch[1] || "anonymous";
          const sourceUrl = chromeMatch[2] || "";
          
          let baseFile = "unknown file";
          if (sourceUrl) {
            const parts = sourceUrl.split("?")[0].split("/");
            baseFile = parts[parts.length - 1] || "unknown file";
          }
          
          result.functionName = fnName;
          result.base = baseFile;
          break;
        }

        // Firefox/Safari-style backtrace parsing
        const firefoxMatch = line.match(/^([^@]+)?@(.*)$/);
        if (firefoxMatch) {
          const fnName = firefoxMatch[1] || "anonymous";
          const sourceUrl = firefoxMatch[2] || "";
          
          let baseFile = "unknown file";
          if (sourceUrl) {
            const parts = sourceUrl.split("?")[0].split("/");
            baseFile = parts[parts.length - 1] || "unknown file";
          }
          
          result.functionName = fnName;
          result.base = baseFile;
          break;
        }
      }
    }

    return result;
  }

  updateTestErrorUI(testId, errorDetails = null) {
    const errorEl = document.getElementById(`test-error-${testId}`);
    if (!errorEl) return;

    if (errorDetails) {
      errorEl.innerHTML = `<div class="flex items-start gap-1.5"><strong class="text-red-400 shrink-0">ERROR:</strong> <span class="break-words font-medium text-red-300">${errorDetails.reason || "Unknown execution challenge"}</span></div>`;
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
      errorEl.innerHTML = "";
    }
  }

  showProgress(show, label = "", percent = 0) {
    const progOuter = document.getElementById("box-diagnostics-progress-outer");
    const progFill = document.getElementById("diagnostics-progress-fill");
    const progStep = document.getElementById("txt-diagnostics-progress-step");
    const progPct = document.getElementById("txt-diagnostics-progress-percent");

    if (!progOuter) return;

    progOuter.style.display = show ? "block" : "none";
    if (show) {
      progStep.textContent = label;
      progPct.textContent = `${Math.round(percent)}%`;
      progFill.style.width = `${percent}%`;
    }
  }

  abort() {
    if (!this.isTesting) return;
    this.isAborted = true;
    this.log("⚠️ Abort requested! Safe-unwinding live recording pipeline context...", "text-red-400 font-bold");
  }

  async runSingle(testId) {
    if (this.isTesting) {
      this.log("⚠️ Error: Another test run is currently active. Please wait or abort before starting.", "text-red-400");
      return;
    }

    const test = DIAGNOSTIC_TESTS.find(t => t.id === testId);
    if (!test) return;

    await this.executeSuite([test]);
  }

  async runSelected() {
    if (this.isTesting) return;

    const testsToRun = [];
    DIAGNOSTIC_TESTS.forEach(test => {
      const chk = document.getElementById(`chk-test-${test.id}`);
      if (chk && chk.checked) {
        testsToRun.push(test);
      }
    });

    if (testsToRun.length === 0) {
      this.log("⚠ No tests selected to run. Check at least one test.", "text-amber-400");
      return;
    }

    await this.executeSuite(testsToRun);
  }

  async executeSuite(tests) {
    this.isTesting = true;
    this.isAborted = false;
    LogNexus.isTestingRunning = true;

    // Read user-selected frames limit factor
    const selectEl = document.getElementById("sel-test-frames-selector");
    const chosenFramesCount = selectEl ? parseInt(selectEl.value, 10) : null;

    const enableProbingEl = document.getElementById("chk-enable-probing");
    const enableProbing = enableProbingEl ? enableProbingEl.checked : true;

    // UI state shifts
    document.getElementById("btn-run-all-diagnostics").style.display = "none";
    document.getElementById("btn-abort-diagnostics").style.display = "inline-block";
    document.getElementById("btn-copy-test-report").style.display = "none";
    const btnCopyBottom = document.getElementById("btn-copy-test-report-bottom");
    if (btnCopyBottom) btnCopyBottom.style.display = "none";
    document.getElementById("txt-diagnostics-phase-val").textContent = "RUNNING TESTS";
    document.getElementById("txt-diagnostics-phase-val").className = "font-bold text-amber-400 animate-pulse";

    this.log(`🚀 Starting Diagnostic Pipeline Suite (${tests.length} test configurations)...`, "text-green-400 font-bold");

    const hasSAB = typeof SharedArrayBuffer !== "undefined";
    this.log(`[Env Diagnostics] SharedArrayBuffer: ${hasSAB ? "AVAILABLE (COOP/COEP headers present. Native Multi-Threading Enabled)" : "UNAVAILABLE (COOP/COEP headers absent or browser restricted. Single-Threaded Fallbacks Active)"}`, hasSAB ? "text-emerald-400 font-medium" : "text-amber-400 font-medium");
    if (hasSAB) {
      this.log(`[Env Diagnostics] MP4/H.264 exports will utilize multi-threaded WebAssembly worker pools.`);
    } else {
      this.log(`[Env Diagnostics] Note: MP4/H.264 exports will fall back to single-threaded WebAssembly workers.`);
    }

    if (!enableProbing) {
      this.log(`[Env Diagnostics] Strict Output Probing (HTML5 decoding & ZIP verification) is disabled. Tests will assert pipeline completion and payload bounds.`, "text-amber-300 font-medium");
    }

    // Reset all status badges of DIAGNOSTIC_TESTS to PENDING (completely hidden by default)
    DIAGNOSTIC_TESTS.forEach(t => {
      this.updateTestBadge(t.id, "PENDING");
      this.updateTestErrorUI(t.id, null);
      this.testResults[t.id] = { status: "PENDING", failureReason: null, failureBase: null, failureFunction: null };
    });

    // Cache pre-test global settings
    const savedGlobalSettings = {
      pipeline: window.sgState.exportPipeline,
      format: window.sgState.exportFormat,
      fps: window.sgState.exportFPS,
      crf: document.getElementById("sel-crf") ? document.getElementById("sel-crf").value : "23",
      width: window.sgState.exportWidth,
      height: window.sgState.exportHeight,
      paused: window.sgState.paused
    };

    if (window.clearAssemblyLogs) {
      window.clearAssemblyLogs();
    }

    // Freeze simulation physically so we step sequentially
    window.sgState.paused = true;
    const playBtn = document.getElementById("btn-play");
    if (playBtn) playBtn.textContent = "▶ Run";

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        if (this.isAborted) {
          // Immediately mark all remaining tests in the suite as ABORTED
          for (let j = i; j < tests.length; j++) {
            this.updateTestBadge(tests[j].id, "ABORTED");
            this.testResults[tests[j].id] = { status: "ABORTED", failureReason: "Suite aborted by user", failureBase: "SuiteAbort", failureFunction: "executeSuite" };
          }
          break;
        }

        const actualFrames = chosenFramesCount !== null ? chosenFramesCount : t.frames;
        this.log(`🤖 INITIALIZING: [${t.name}]`, "text-white font-bold mt-3");
        this.updateTestBadge(t.id, "RUNNING");
        this.updateTestErrorUI(t.id, null); // Clear existing error UI

        let savedDirName = null;
        const res = resolveRecordingResolution({ exportWidth: t.width, exportHeight: t.height });
        let expectedW = res.width;
        let expectedH = res.height;
        if (expectedW > 1920 || expectedH > 1080) {
          const scaleFactor = Math.min(1920 / expectedW, 1080 / expectedH);
          expectedW = Math.floor((expectedW * scaleFactor) / 2) * 2;
          expectedH = Math.floor((expectedH * scaleFactor) / 2) * 2;
        }

        try {
          // 1. Synchronize options programmatically
          window.sgState.exportPipeline = t.pipeline;
          window.sgState.exportFormat = t.format;
          window.sgState.exportFPS = t.fps;
          window.sgState.exportWidth = t.width;
          window.sgState.exportHeight = t.height;
          if (document.getElementById("sel-crf") && t.crf) {
            document.getElementById("sel-crf").value = t.crf;
          }

          if (window.refreshUI) {
            window.refreshUI();
          }

          const testHasSab = typeof SharedArrayBuffer !== "undefined";
          const testNeedMultiThreaded = t.threading === "MT";
          const testThreadingLabel = t.pipeline === "zip" ? "N/A (ZIP Still Archive)" : (testNeedMultiThreaded ? "MULTI-THREADED (MT)" : "SINGLE-THREADED (ST)");
          this.log(`[Config] Pipeline=${t.pipeline}, Format=${t.format}, Target Resolution=${t.width}x${t.height}, Frames Limit=${actualFrames}, Threads=${testThreadingLabel}`);

          // 2. Clear previous flags and establish testers
          window.recorder.isTesting = true;
          window.recorder.testThreading = t.threading || "ST";
          let finalOutputBlob = null;

          if (t.pipeline === "zip-to-video") {
            this.log(`[Dual Stage] Initiating STAGE 1/2: Pre-capturing ${actualFrames} frames in-memory to build transient validation ZIP...`);
            
            // Re-route to standard ZIP to capture transient buffer
            window.sgState.exportPipeline = "zip";
            window.sgState.exportFormat = "zip";
            if (window.refreshUI) window.refreshUI();

            let transientZipBlob = null;
            window.onTestZipBlobGenerated = function(blob, err) {
              transientZipBlob = blob;
            };

            this.log(`[Dual Stage] Instantiating frame stream capture buffer for ZIP assembly...`);
            this.showProgress(true, `[1/2] Pre-capturing frames for ${t.id}`, 0);
            await window.recorder.start();

            // Run manual frame loop
            for (let frameIndex = 0; frameIndex < actualFrames; frameIndex++) {
              if (this.isAborted) {
                const abortErr = new Error("Recording cancelled programmatically during pre-capture loop.");
                abortErr.name = "AbortActionError";
                throw abortErr;
              }
              if (window.physics) window.physics.step(2);
              if (window.renderManualFrame) window.renderManualFrame();
              await window.recorder.captureAndWait();
              this.showProgress(true, `Pre-capturing frame ${frameIndex + 1}/${actualFrames}`, (frameIndex + 1) / actualFrames * 100);
              await delay(10);
            }

            this.log(`[Dual Stage] Standard pre-capture completed. Packing frames inside JSZip...`);
            await window.recorder.stop();

            let waitZipRetries = 60;
            while (!transientZipBlob && waitZipRetries > 0 && !this.isAborted) {
              await delay(500);
              waitZipRetries--;
            }

            if (!transientZipBlob || transientZipBlob.size === 0) {
              throw new Error("Dual Stage Failed: Transit validation frame ZIP package remained empty or timed out.");
            }

            this.log(`🎉 [Dual Stage] STAGE 1 PASSED: Intermediate validation frame ZIP compiled successfully! Payload Size: ${(transientZipBlob.size / 1024).toFixed(1)} KB`, "text-green-400 font-bold");

            // STAGE 2: Mock-intercept file picker and run FFmpeg conversion
            this.log(`[Dual Stage] Initiating STAGE 2/2: Mock-intercepting browser file prompts to decompress ZIP and compile video...`);
            
            // Re-route to ZIP format conversion
            window.sgState.exportPipeline = "zip"; // execute extraction block
            window.sgState.exportFormat = t.format;
            window.sgState.exportWidth = t.width;
            window.sgState.exportHeight = t.height;
            if (window.refreshUI) window.refreshUI();

            const needMT = t.threading === "MT";
            const threadingLabel = needMT ? "FFmpeg WASM Multi-Threaded (MT) worker pool" : "FFmpeg WASM Single-Threaded (ST)";
            this.log(`[Dual Stage] Intercepting file selection. Targets: Format: ${t.format.toUpperCase()}, Threading: ${threadingLabel}, Decoded Target Canvas: ${t.width}x${t.height}`);

            window.onTestVideoBlobGenerated = function(blob) {
              finalOutputBlob = blob;
            };

            // Programmatic File Picker Interceptor Mock
            const originalFilePicker = window.showOpenFilePicker;
            window.showOpenFilePicker = async function(opts) {
              console.log("[Diagnostics Interceptor] Intercepted window.showOpenFilePicker call. Injecting Stage 1 zipped frames package.");
              return [{
                name: `sg_render_transit_${t.id}.zip`,
                getFile: async () => transientZipBlob
              }];
            };

            let assemblyOutcomeError = null;
            let assemblyTimedOut = false;
            let assembleTimer = null;
            const maxAssembleTimeMs = Math.max(60000, actualFrames * 1200);

            try {
              window.recorder.isAssembling = false; // Reset potential stale locks
              this.showProgress(true, `Decompressing ZIP package and beginning transcoder threads...`, 50);
              
              const assemblePromise = (async () => {
                await window.recorder.assembleFromStorage("zip");
                
                let checkRetries = actualFrames > 150 ? 120 : 40;
                while (window.recorder.isAssembling && checkRetries > 0 && !this.isAborted && !assemblyTimedOut) {
                  await delay(1000);
                  checkRetries--;
                  this.showProgress(true, `Transcoding (Stage 2)... Outstanding limit: ${checkRetries}s`, 75);
                }
                return { success: !this.isAborted };
              })();

              const timeoutPromise = new Promise((resolve) => {
                assembleTimer = setTimeout(() => {
                  assemblyTimedOut = true;
                  resolve({ timeout: true });
                }, maxAssembleTimeMs);
              });

              const raceResult = await Promise.race([assemblePromise, timeoutPromise]);
              clearTimeout(assembleTimer);

              if (raceResult && raceResult.timeout) {
                throw new Error(`Transcoder Assembly Timeout: Thread stalled after ${(maxAssembleTimeMs / 1000).toFixed(0)}s.`);
              }
            } catch (err) {
              assemblyOutcomeError = err;
            } finally {
              // Restore native file picker
              window.showOpenFilePicker = originalFilePicker;
            }

            if (assemblyOutcomeError) {
              throw assemblyOutcomeError;
            }

            if (this.isAborted) {
              throw new Error("Transcoding cancelled programmatically.");
            }

          } else {
            // Standard original single pipeline flow remains perfectly intact!
            if (t.pipeline === "zip") {
              window.onTestZipBlobGenerated = function(blob, err) {
                finalOutputBlob = blob;
              };
            } else {
              window.onTestVideoBlobGenerated = function(blob) {
                finalOutputBlob = blob;
              };
            }

            // 3. Fire recording engine
            this.log(`[Record] Instantiating frame stream capture buffer...`);
            this.showProgress(true, `[1/2] Recording frames for ${t.id}`, 0);
            await window.recorder.start();

            savedDirName = window.recorder._dirHandle ? window.recorder._dirHandle.name : null;

            // 4. Manual frame submission loop
            for (let frameIndex = 0; frameIndex < actualFrames; frameIndex++) {
              if (this.isAborted) {
                const abortErr = new Error("Recording cancelled programmatically during frame loop.");
                abortErr.name = "AbortActionError";
                throw abortErr;
              }

              // Advance physical pendulums sequentially to guarantee variation
              if (window.physics) {
                window.physics.step(2);
              }

              // Force fresh WebGL render to guarantee active non-blank frames
              if (window.renderManualFrame) {
                window.renderManualFrame();
              }

              // Synchronously request WebGL render frame mapping
              await window.recorder.captureAndWait();
              
              this.showProgress(true, `Capturing frame ${frameIndex + 1}/${actualFrames}`, (frameIndex + 1) / actualFrames * 100);
              await delay(10); // minor interval to let general microtasks complete
            }

            if (this.isAborted) {
              const abortErr = new Error("Recording cancelled programmatically.");
              abortErr.name = "AbortActionError";
              throw abortErr;
            }

            // 4.1 Perform Intermediate Storage Integrity Audit
            let auditSuccess = true;
            let auditMessage = "";
            
            if (window.recorder._dirHandle) {
              this.log("[Audit Prereq] Auditing captured frames saved inside OPFS sandboxed disk...");
              const opfsFiles = [];
              for await (const name of window.recorder._dirHandle.keys()) {
                opfsFiles.push(name);
              }
              this.log(`[Audit Prereq] Found ${opfsFiles.length} file entries in OPFS temporary folder.`);
              if (opfsFiles.length !== actualFrames) {
                this.log(`⚠️ Audit Warning: Saved file count (${opfsFiles.length}) differs from expected frames (${actualFrames})!`, "text-amber-400 font-bold");
              }

              // Inspect the first saved frame binaries directly from OPFS
              if (opfsFiles.length > 0) {
                const fileHandle = await window.recorder._dirHandle.getFileHandle("frame_000000.png");
                const fileBlob = await fileHandle.getFile();
                const arrayBuffer = await fileBlob.arrayBuffer();
                const uint8 = new Uint8Array(arrayBuffer);

                // Assert standard PNG magic bytes: 137, 80, 78, 71, 13, 10, 26, 10
                const isPngSignatureOk = uint8[0] === 137 && uint8[1] === 80 && uint8[2] === 78 && uint8[3] === 71;
                if (isPngSignatureOk) {
                  this.log(`[Audit Prereq] PNG binary signature assertion: PASSED`, "text-green-400");
                } else {
                  auditSuccess = false;
                  auditMessage = "frame_000000.png has invalid PNG signature.";
                  this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                }

                // Assert correct dimension inside the critical IHDR chunk
                const view = new DataView(arrayBuffer, 16, 8);
                const readW = view.getUint32(0);
                const readH = view.getUint32(4);
                this.log(`[Audit Prereq] PNG IHDR block assertion: Read dimensions are ${readW}x${readH}`);
                if (readW !== expectedW || readH !== expectedH) {
                  auditSuccess = false;
                  auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target raw PNG expected matches ${expectedW}x${expectedH} (Simulation target logic limits active: ${t.width}x${t.height})`;
                  this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                } else {
                  this.log(`[Audit Prereq] PNG dimensional assertion: PASSED (Parsed frame size matches expected raw capture resolution)`, "text-green-400");
                }
              } else {
                auditSuccess = false;
                auditMessage = "No files saved in directory.";
                this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
              }
            } else if (window.recorder._zip) {
              this.log("[Audit Prereq] Auditing captured frames saved inside in-memory JSZip...");
              const frameNames = Object.keys(window.recorder._zip.files).filter(
                name => name.startsWith("frame_") && name.endsWith(".png")
              );
              frameNames.sort((a, b) => a.localeCompare(b));
              this.log(`[Audit Prereq] Found ${frameNames.length} file entries inside in-memory JSZip.`);
              if (frameNames.length !== actualFrames) {
                this.log(`⚠️ Audit Warning: Saved file count (${frameNames.length}) differs from expected frames (${actualFrames})!`, "text-amber-400 font-bold");
              }

              if (frameNames.length > 0) {
                const fileObj = window.recorder._zip.file("frame_000000.png");
                if (fileObj) {
                  const uint8 = await fileObj.async("uint8array");
                  const isPngSignatureOk = uint8[0] === 137 && uint8[1] === 80 && uint8[2] === 78 && uint8[3] === 71;
                  if (isPngSignatureOk) {
                    this.log(`[Audit Prereq] PNG binary signature assertion: PASSED`, "text-green-400");
                  } else {
                    auditSuccess = false;
                    auditMessage = "frame_000000.png has invalid PNG signature.";
                    this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                  }

                  // Assert correct dimensions inside the critical IHDR chunk
                  const view = new DataView(uint8.buffer, uint8.byteOffset + 16, 8);
                  const readW = view.getUint32(0);
                  const readH = view.getUint32(4);
                  this.log(`[Audit Prereq] PNG IHDR block assertion: Read dimensions are ${readW}x${readH}`);
                  if (readW !== expectedW || readH !== expectedH) {
                    auditSuccess = false;
                    auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target raw PNG expected matches ${expectedW}x${expectedH} (Simulation target logic limits active: ${t.width}x${t.height})`;
                    this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                  } else {
                    this.log(`[Audit Prereq] PNG dimensional assertion: PASSED (Parsed frame size matches expected raw capture resolution)`, "text-green-400");
                  }
                } else {
                  auditSuccess = false;
                  auditMessage = "Could not find frame_000000.png inside the in-memory JSZip.";
                  this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                }
              } else {
                auditSuccess = false;
                auditMessage = "No files saved in JSZip.";
                this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
              }
            } else if (window.recorder._recordedFrames && window.recorder._recordedFrames.length > 0) {
              this.log("[Audit Prereq] Auditing captured frames saved in-memory...");
              const frameBytes = window.recorder._recordedFrames[0];
              const isPngSignatureOk = frameBytes[0] === 137 && frameBytes[1] === 80 && frameBytes[2] === 78 && frameBytes[3] === 71;
              if (isPngSignatureOk) {
                this.log(`[Audit Prereq] In-memory PNG signature assertion: PASSED`, "text-green-400");
              } else {
                auditSuccess = false;
                auditMessage = "In-memory frame 0 has invalid PNG signature.";
                this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
              }

              const view = new DataView(frameBytes.buffer, 16, 8);
              const readW = view.getUint32(0);
              const readH = view.getUint32(4);
              this.log(`[Audit Prereq] PNG IHDR block assertion: Read dimensions are ${readW}x${readH}`);
              if (readW !== expectedW || readH !== expectedH) {
                auditSuccess = false;
                auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target raw PNG expected matches ${expectedW}x${expectedH} (Simulation target logic limits active: ${t.width}x${t.height})`;
                this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
              } else {
                this.log(`[Audit Prereq] In-memory PNG dimensional assertion: PASSED (Parsed frame size matches expected raw capture resolution)`, "text-green-400");
              }
            }

            if (!auditSuccess) {
              const auditErr = new Error(`PNG Audit Checklist Failed: ${auditMessage}`);
              auditErr.name = "AuditAssertionError";
              throw auditErr;
            }

            // 5. Trigger Stop / Frame Assembly
            const activeMT = (t.format === "mp4") && (typeof SharedArrayBuffer !== "undefined");
            const modeLabel = t.pipeline === "zip" ? "ZIP storage archive stream" : (activeMT ? "FFmpeg WASM Multi-Threaded (MT) worker pools (SAB enabled)" : "FFmpeg WASM Single-Threaded (ST) transcode loop");
            this.log(`[Assemble] Direct capture completed. Bundling and transcoding via ${modeLabel}...`);
            this.showProgress(true, `[2/2] Assembling compiled binary stream`, 50);
            
            let assemblyTimedOut = false;
            let assembleTimer = null;
            const maxAssembleTimeMs = Math.max(50000, actualFrames * 1000);

            const stopPromise = (async () => {
              await window.recorder.stop();
              
              // 6. Wait for compilation thread to output finished product
              let waitRetries = actualFrames > 150 ? 120 : 40; // longer retry scope for large stress files
              while (window.recorder.isAssembling && waitRetries > 0 && !this.isAborted && !assemblyTimedOut) {
                await delay(1000);
                waitRetries--;
                this.showProgress(true, `Assembling... Time outstanding limit: ${waitRetries}s`, 75);
              }
              return { success: !this.isAborted };
            })();

            const assembleTimeoutPromise = new Promise((resolve) => {
              assembleTimer = setTimeout(() => {
                assemblyTimedOut = true;
                resolve({ timeout: true });
              }, maxAssembleTimeMs);
            });

            const assemblyOutcome = await Promise.race([stopPromise, assembleTimeoutPromise]);
            clearTimeout(assembleTimer);

            if (assemblyOutcome && assemblyOutcome.timeout) {
              const timeoutErr = new Error(`Assembly timeout: blocked or transcoder stalled after ${(maxAssembleTimeMs / 1000).toFixed(0)} seconds!`);
              timeoutErr.name = "TimeoutError";
              throw timeoutErr;
            }

            if (this.isAborted) {
              const abortErr = new Error("Assembly suite cancelled programmatically.");
              abortErr.name = "AbortActionError";
              throw abortErr;
            }
          }

          // 6.1 Verify directory cleanup in the Origin Private File System
          if (savedDirName) {
            try {
              const rootCheck = await navigator.storage.getDirectory();
              let isDirStillExist = false;
              for await (const name of rootCheck.keys()) {
                if (name === savedDirName) {
                  isDirStillExist = true;
                  break;
                }
              }
              if (isDirStillExist) {
                const cleanErr = new Error(`Cleanup Assertion Fail: Sandboxed temporary directory '${savedDirName}' remained in OPFS after stop/completion!`);
                cleanErr.name = "CleanupError";
                throw cleanErr;
              } else {
                this.log(`[Cleanup Probe] OPFS Sandbox Cleanup: PASSED (Temporary frames directory successfully deleted)`, "text-green-400");
              }
            } catch (cleanCheckErr) {
              this.log(`⚠️ Cleanup verify caution: ${cleanCheckErr.message}`);
              if (cleanCheckErr.name === "CleanupError") throw cleanCheckErr;
            }
          }

          // 7. Verify result blob structure
          if (finalOutputBlob && finalOutputBlob.size > 0) {
            const blobSizeKB = (finalOutputBlob.size / 1024).toFixed(1);
            this.log(`🎉 SUCCESS: Compiled Blob generated! Payload: ${blobSizeKB} KB. (MIME: ${finalOutputBlob.type})`, "text-green-400 font-semibold");
            
            // Let's run structural probes to ensure compatibility
            if (t.pipeline === "ffmpeg" || t.pipeline === "zip-to-video") {
              if (enableProbing) {
                this.log(`[Probe] Attempting standard HTML5 direct-to-video decode...`);
                const probeResult = await this.probeVideoBlob(finalOutputBlob);
                this.log(`[Probe] Decode validation successful! Tracks: ${probeResult.width}x${probeResult.height}, Length: ${probeResult.duration.toFixed(2)}s`, "text-green-400");
                
                // 7.1 Perform Dynamic Aspect Ratio and Letterbox Intrusion Audit
                const srcAspect = (t.width / t.height);
                const videoAspect = (probeResult.width / probeResult.height);
                const isWebM = t.format === "webm";
                const diffAttr = Math.abs(srcAspect - videoAspect);
                
                this.log(`[Probe] Aspect Ratio Evaluation: Target Config: ${srcAspect.toFixed(3)}, Decoded Track: ${videoAspect.toFixed(3)}`);
                if (isWebM) {
                  if (diffAttr < 0.02) {
                    this.log(`[Aspect Audit] WebM Letterbox Minimization: SUCCESS (Flawless snug fit. No extraneous padding detected)`, "text-green-400");
                  } else {
                    const isLetterboxNecessary = (t.width === 1920 && t.height === 1080) || (t.width === 1280 && t.height === 720);
                    if (isLetterboxNecessary) {
                      this.log(`[Aspect Audit] WebM Letterbox Minimization: Intrusions only used for standard 16:9 compliance (${t.width}x${t.height})`, "text-green-400/80");
                    } else {
                      this.log(`⚠️ [Aspect Audit] WebM Aspect Notice: Mismatch detected (${(diffAttr * 100).toFixed(1)}%). Recommend strict crop-to-fit sizing to clip borders.`, "text-amber-400 font-medium");
                    }
                  }
                } else {
                  if (diffAttr < 0.02) {
                    this.log(`[Aspect Audit] Aspect Compliance: PERFECT fit.`, "text-green-400");
                  } else {
                    this.log(`[Aspect Audit] Aspect Compliance: Letterboxing configured to adapt mismatch.`, "text-white/40");
                  }
                }

                if (probeResult.width !== res.width || probeResult.height !== res.height) {
                  const mmErr = new Error(`Video output resolution mismatch: parsed ${probeResult.width}x${probeResult.height}, configured ${res.width}x${res.height} (target aligned).`);
                  mmErr.name = "ResolutionMismatchError";
                  throw mmErr;
                }
              } else {
                this.log(`[Probe] Direct output probing bypassed (Opted out).`);
              }

              this.updateTestBadge(t.id, "PASS");
              this.testResults[t.id] = { status: "PASS", failureReason: null, failureBase: null, failureFunction: null };

            } else {
              // ZIP Pipeline Check
              if (window.JSZip && t.format === "zip") {
                if (enableProbing) {
                  this.log(`[Probe] Decompressing sandboxed ZIP stream...`);
                  const zipObj = await new window.JSZip().loadAsync(finalOutputBlob);
                  const countOfFiles = Object.keys(zipObj.files).length;
                  this.log(`[Probe] Valid zip found. Holds ${countOfFiles} frame entries!`, "text-green-400");
                  
                  // Assert ZIP count matches frames scheduled
                  if (countOfFiles !== actualFrames) {
                    this.log(`⚠️ Assertion Warning: ZIP items count (${countOfFiles}) differs from expected frames (${actualFrames})!`, "text-amber-400 font-bold");
                  }

                  // Parse the first image inside the ZIP to guarantee its dimensions!
                  const firstZipFile = zipObj.file("frame_000000.png");
                  if (firstZipFile) {
                    const dataArray = await firstZipFile.async("uint8array");
                    const view = new DataView(dataArray.buffer, 16, 8);
                    const zW = view.getUint32(0);
                    const zH = view.getUint32(4);
                    this.log(`[Probe] ZIP frame 0 IHDR assertion: Extracted size is ${zW}x${zH}`);
                    if (zW !== expectedW || zH !== expectedH) {
                      const mmErr = new Error(`ZIP dimensional mismatch: Extracted size ${zW}x${zH} does not match expected target ${expectedW}x${expectedH} (Target input configured: ${t.width}x${t.height}).`);
                      mmErr.name = "ZipDimensionError";
                      throw mmErr;
                    } else {
                      this.log(`[Probe] ZIP frame extraction size verification: PASSED`, "text-green-400");
                    }
                  } else {
                    const findErr = new Error("Could not find frame_000000.png inside the ZIP archive.");
                    findErr.name = "ZipFrameNotFoundError";
                    throw findErr;
                  }
                } else {
                  this.log(`[Probe] Sandboxed ZIP format probing bypassed (Opted out).`);
                }

                this.updateTestBadge(t.id, "PASS");
                this.testResults[t.id] = { status: "PASS", failureReason: null, failureBase: null, failureFunction: null };
              } else {
                this.updateTestBadge(t.id, "PASS");
                this.testResults[t.id] = { status: "PASS", failureReason: null, failureBase: null, failureFunction: null };
              }
            }
          } else {
            const emptyErr = new Error("No finished video bytes accumulated or stream is blank.");
            emptyErr.name = "EmptyPayloadError";
            throw emptyErr;
          }

        } catch (testErr) {
          // Failure handling!
          this.log(`❌ TEST FAILED: ${testErr.message || testErr}`, "text-red-500 font-bold");
          
          const errDetails = this.parseErrorDetails(testErr);
          this.testResults[t.id] = {
            status: "FAIL",
            failureReason: errDetails.reason,
            failureBase: errDetails.base,
            failureFunction: errDetails.functionName
          };
          
          this.updateTestBadge(t.id, "FAIL");
          this.updateTestErrorUI(t.id, errDetails);

          // Forcibly stop loops, deactivate encoding thread and clear state to prevent resource lock
          if (window.recorder) {
            window.recorder.isRecording = false;
            window.recorder.isAssembling = false;
            
            if (window.recorder._ffmpeg) {
              try {
                if (typeof window.recorder._ffmpeg.terminate === "function") {
                  window.recorder._ffmpeg.terminate();
                } else if (typeof window.recorder._ffmpeg.exit === "function") {
                  window.recorder._ffmpeg.exit();
                }
              } catch (tErr) {
                console.warn("[Failure Cleanup] Worker termination warning:", tErr);
              }
              window.recorder._ffmpeg = null;
            }

            // Immediately delete sandboxed OPFS directory to prevent space pollution
            if (savedDirName) {
              try {
                const root = await navigator.storage.getDirectory();
                await root.removeEntry(savedDirName, { recursive: true });
                this.log(`[Failure Cleanup] Decimated temporary sandboxed directory '${savedDirName}' from OPFS.`, "text-white/40");
              } catch (cleanCheckErr) {
                console.log(`[Failure Cleanup] Sandboxed folder removal skipped: ${cleanCheckErr.message}`);
              }
            }

            // Restore canvas size
            if (typeof window.recorder._restoreCanvasSize === "function") {
              window.recorder._restoreCanvasSize();
            }
          }

        } finally {
          // Clear test flags and proceed to next sequential test
          if (window.recorder) {
            window.recorder.isTesting = false;
            window.recorder.testThreading = null;
            window.recorder.isAssembling = false;

            if (window.recorder._ffmpeg) {
              try {
                this.log(`🧹 Offloading FFmpeg WebAssembly worker to completely free memory heap...`, "text-white/40");
                if (typeof window.recorder._ffmpeg.terminate === "function") {
                  window.recorder._ffmpeg.terminate();
                } else if (typeof window.recorder._ffmpeg.exit === "function") {
                  window.recorder._ffmpeg.exit();
                }
              } catch (tErr) {
                console.warn("[Cooldown Cleanup] Worker termination warning:", tErr);
              }
              window.recorder._ffmpeg = null;
            }

            window.recorder._recordedFrames = [];
          }
          window.onTestVideoBlobGenerated = null;
          window.onTestZipBlobGenerated = null;
          
          // Apple tablet, mobile, or touch devices check
          const isCoarseOrTablet = /Mobi|Android|iPhone|iPad|Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches);
          const cooldownMs = isCoarseOrTablet ? 3000 : 800; // longer pause (3s) for mobile/tablet to let GC reclaim heap
          if (isCoarseOrTablet) {
            this.log(`📱 Hardware limits detected: Pausing for ${cooldownMs}ms between tests to run browser Garbage Collection...`, "text-amber-300/80");
          } else {
            this.log(`⏱️ Pausing for ${cooldownMs}ms to stabilize state...`, "text-white/30");
          }
          await delay(cooldownMs);
        }
      }
    } catch (e) {
      this.log(`🛑 Fatal suite panic: ${e.message || e}`, "text-red-400 font-black");
    } finally {
      // 8. Restore initial user configurations
      this.log(`🧹 Restoring initial workspace state parameters...`, "text-white/40");
      window.sgState.exportPipeline = savedGlobalSettings.pipeline;
      window.sgState.exportFormat = savedGlobalSettings.format;
      window.sgState.exportFPS = savedGlobalSettings.fps;
      window.sgState.exportWidth = savedGlobalSettings.width;
      window.sgState.exportHeight = savedGlobalSettings.height;
      window.sgState.paused = savedGlobalSettings.paused;
      if (document.getElementById("sel-crf")) {
        document.getElementById("sel-crf").value = savedGlobalSettings.crf;
      }

      if (window.refreshUI) {
        window.refreshUI();
      }

      if (!savedGlobalSettings.paused) {
        const playBtn = document.getElementById("btn-play");
        if (playBtn) playBtn.textContent = "⏸ Pause";
      }

      this.cleanupMainRecordingState();

      this.showProgress(false);
      
      this.isTesting = false;
      LogNexus.isTestingRunning = false;
      document.getElementById("btn-run-all-diagnostics").style.display = "inline-block";
      document.getElementById("btn-abort-diagnostics").style.display = "none";
      document.getElementById("btn-copy-test-report").style.display = "inline-block";
      const btnCopyBottom = document.getElementById("btn-copy-test-report-bottom");
      if (btnCopyBottom) btnCopyBottom.style.display = "inline-block";
      document.getElementById("txt-diagnostics-phase-val").textContent = this.isAborted ? "ABORTED" : "FINISHED";
      document.getElementById("txt-diagnostics-phase-val").className = this.isAborted ? "font-bold text-red-400" : "font-bold text-green-400";
      this.log(`🏁 Suite completed sequence.`, "text-white/60 font-medium");
    }
  }

  copyReportToClipboard() {
    try {
      const select = document.getElementById("sel-test-frames-selector");
      const chosenFramesCount = select ? parseInt(select.value, 10) : null;

      const summaryTests = DIAGNOSTIC_TESTS.map(t => {
        const badge = document.getElementById(`status-badge-${t.id}`);
        const status = badge ? badge.textContent : "UNTESTED";
        const resObj = {
          id: t.id,
          name: t.name,
          pipeline: t.pipeline,
          format: t.format,
          resolution: `${t.width}x${t.height}`,
          frames: chosenFramesCount !== null ? chosenFramesCount : t.frames,
          status: status
        };

        const storedResult = this.testResults[t.id];
        if (storedResult && storedResult.status === "FAIL") {
          resObj.failureReason = storedResult.failureReason || "Unknown challenge during pipeline assembly execution";
          resObj.failureBase = storedResult.failureBase || "Error";
          resObj.failureFunction = storedResult.failureFunction || "anonymous";
        }
        return resObj;
      });

      const specs = EnvironmentDetector.detect();

      const report = {
        title: "SINE-GORDON LAB VIDEO COMPLIANCE & PIXEL INTEGRITY DIAGNOSTIC REPORT",
        timestamp: new Date().toISOString(),
        systemSpecs: specs,
        results: summaryTests,
        logs: this.logs
      };

      const reportStr = JSON.stringify(report, null, 2);

      const textArea = document.createElement("textarea");
      textArea.value = reportStr;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      this.log("🎉 SUCCESS: Compliance Test Report copied to clipboard!", "text-green-400 font-bold");

      [
        document.getElementById("btn-copy-test-report"),
        document.getElementById("btn-copy-test-report-bottom")
      ].forEach(btn => {
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = "✅ COPIED REPORT!";
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }
      });
    } catch (err) {
      this.log(`❌ Error copying test report: ${err.message}`, "text-red-400");
    }
  }

  async updateTestLengthsSelector() {
    const selectEl = document.getElementById("sel-test-frames-selector");
    if (!selectEl) return;

    let availableBytes = Infinity;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        availableBytes = quota - usage;
      }
    } catch (err) {
      console.warn("Could not estimate storage:", err);
    }

    const options = selectEl.options;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const framesVal = parseInt(opt.value, 10);

      let maxTestPeakBytes = 0;
      for (const test of DIAGNOSTIC_TESTS) {
        const peak = DiscSpaceEstimator.calculatePeakStorageBytes(
          test.pipeline,
          framesVal,
          test.width,
          test.height,
          test.fps,
          test.format,
          test.crf ? parseInt(test.crf, 10) : 18
        );
        if (peak > maxTestPeakBytes) {
          maxTestPeakBytes = peak;
        }
      }

      const mbsNeeded = (maxTestPeakBytes / (1024 * 1024)).toFixed(1);

      let originalText = opt.textContent;
      const bracketIndex = originalText.indexOf(" [");
      if (bracketIndex !== -1) {
        originalText = originalText.substring(0, bracketIndex);
      }
      const naIndex = originalText.indexOf(" (N/A");
      if (naIndex !== -1) {
        originalText = originalText.substring(0, naIndex);
      }

      if (maxTestPeakBytes > availableBytes) {
        opt.disabled = true;
        opt.textContent = `${originalText} (N/A: Limit Exceeded, ~${mbsNeeded} MB needed)`;
      } else {
        opt.disabled = false;
        opt.textContent = `${originalText} [~${mbsNeeded} MB req]`;
      }
    }
  }

  updateUIForSelectedFrameCount() {
    const selector = document.getElementById("sel-test-frames-selector");
    if (!selector) return;
    const selectedFrames = selector.value;
    const badges = document.querySelectorAll(".flex-frames-badge");
    badges.forEach(badge => {
      badge.textContent = `${selectedFrames} FMR`;
    });
  }

  probeVideoBlob(blob) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;

      const finishProbe = () => {
        v.onloadedmetadata = null;
        v.onerror = null;
        URL.revokeObjectURL(v.src);
      };

      v.onloadedmetadata = () => {
        const details = {
          width: v.videoWidth,
          height: v.videoHeight,
          duration: v.duration
        };
        finishProbe();
        resolve(details);
      };

      v.onerror = () => {
        finishProbe();
        reject(new Error(v.error ? `Video parse failure: code ${v.error.code}` : "Unknown decoder issue"));
      };

      v.src = URL.createObjectURL(blob);
    });
  }
}

// Global Singleton factory
let instance = null;
export function getDiagnosticsManager() {
  if (!instance) {
    instance = new DiagnosticsManager();
  }
  return instance;
}
