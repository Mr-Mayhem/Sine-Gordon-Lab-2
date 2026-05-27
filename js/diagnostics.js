// =============================================================================
// sine-gordon-lab — js/diagnostics.js
// Dedicated Diagnostics & Pipeline Stress Tester Window Module.
// Consolidates diagnostic testing interfaces, resolution coverage scans,
// different compression rates, and frame counts (30 vs 300) without cluttering.
// =============================================================================

import { DiscSpaceEstimator } from "./disc-space-estimator.js";

const DIAGNOSTIC_TESTS = [
  {
    id: "SD_WEBM_QUICK",
    name: "Quick Test: SD 360p (WebM)",
    category: "Level 1: Quick Compliance Checks",
    pipeline: "ffmpeg",
    format: "webm",
    width: 640,
    height: 360,
    fps: 30,
    crf: "23",
    frames: 30,
    description: "Verifies basic pixel capture and high-speed WebAssembly FFmpeg integration at 360p."
  },
  {
    id: "SD_MP4_QUICK",
    name: "Quick Test: SD 480p (MP4/H.264)",
    category: "Level 1: Quick Compliance Checks",
    pipeline: "ffmpeg",
    format: "mp4",
    width: 852,
    height: 480,
    fps: 30,
    crf: "18",
    frames: 30,
    description: "Tests single-threaded H.264 macroblock boundary matching at widescreen 852x480 resolution."
  },
  {
    id: "ZIP_STILLS_QUICK",
    name: "Stills Test: ZIP Export 480p",
    category: "Level 1: Quick Compliance Checks",
    pipeline: "zip",
    format: "zip",
    width: 852,
    height: 480,
    fps: 30,
    frames: 30,
    description: "Examines sandboxed ZIP archiving, file streams, and memory footprints without transcoding."
  },
  {
    id: "SD_WEBM_STRESS",
    name: "Extended Stress: SD 480p (WebM)",
    category: "Level 2: Duration & Storage Stress Tests",
    pipeline: "ffmpeg",
    format: "webm",
    width: 852,
    height: 480,
    fps: 30,
    crf: "15",
    frames: 300,
    description: "Renders 300 frames to monitor long-running OPFS storage retention and WebM assembly stability."
  },
  {
    id: "HD_WEBM_STRESS",
    name: "Extended Stress: HD 720p (WebM)",
    category: "Level 2: Duration & Storage Stress Tests",
    pipeline: "ffmpeg",
    format: "webm",
    width: 1280,
    height: 720,
    fps: 30,
    crf: "28",
    frames: 300,
    description: "Exercises thread limits, substantial frame counts, and chunk-oriented memory pipelines."
  },
  {
    id: "FHD_MP4_STRESS",
    name: "Density Stress: FHD 1080p (MP4/H.264)",
    category: "Level 3: High-Density Stress Tests (Opt-In)",
    pipeline: "ffmpeg",
    format: "mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    crf: "23",
    frames: 30,
    highRes: true,
    description: "Evaluates standard 1080p Full HD transcode limits and multi-threaded worker rendering."
  },
  {
    id: "QHD_WEBM_STRESS",
    name: "Density Stress: QHD 1440p (WebM)",
    category: "Level 3: High-Density Stress Tests (Opt-In)",
    pipeline: "ffmpeg",
    format: "webm",
    width: 2560,
    height: 1440,
    fps: 30,
    crf: "25",
    frames: 30,
    highRes: true,
    description: "Tests high-density QHD 1440p pixel buffers and sequential chunk allocations."
  },
  {
    id: "UHD_MP4_STRESS",
    name: "Density Stress: UHD 4K 2160p (MP4/H.264)",
    category: "Level 3: High-Density Stress Tests (Opt-In)",
    pipeline: "ffmpeg",
    format: "mp4",
    width: 3840,
    height: 2160,
    fps: 30,
    crf: "28",
    frames: 30,
    highRes: true,
    description: "Max-density stress benchmark testing memory pressure and WASM heap bounds."
  }
];

export class DiagnosticsManager {
  constructor() {
    this.modalId = "diagnostics-overlay";
    this.isTesting = false;
    this.isAborted = false;
    this.currentTestIndex = -1;
    this.logs = [];
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
    overlay.style.backdropFilter = "blur(12px)";
    overlay.style.zIndex = "300";
    overlay.style.overflowY = "auto";
    overlay.style.padding = "20px 16px";

    const content = document.createElement("div");
    content.className = "theory-content";
    content.style.maxWidth = "780px";
    content.style.margin = "20px auto";
    content.style.backgroundColor = "rgba(10, 10, 10, 0.85)";
    content.style.border = "1px solid rgba(255,255,255,0.08)";
    content.style.borderRadius = "16px";
    content.style.padding = "20px 24px";
    content.style.boxShadow = "0 20px 50px rgba(0,0,0,0.6)";

    const categories = [
      { name: "Level 1: Quick Compliance Checks", highRes: false },
      { name: "Level 2: Duration & Storage Stress Tests", highRes: false },
      { name: "Level 3: High-Density Stress Tests (Opt-In)", highRes: true }
    ];

    let testsHtml = categories.map(cat => {
      const catTests = DIAGNOSTIC_TESTS.filter(t => t.category === cat.name);
      // Default level selection in the dropdown is Level 1, so Level 1 group is shown by default - Level 2/3 are initially display:none
      let initialStyle = "";
      if (cat.name === "Level 1: Quick Compliance Checks") {
        initialStyle = "display: block !important;";
      } else {
        initialStyle = "display: none !important;";
      }
      
      const testsGroupHtml = catTests.map(test => {
        // Only Level 1 should be checked by default initially
        const isDefaultChecked = (cat.name === "Level 1: Quick Compliance Checks");
        const checkedAttr = isDefaultChecked ? "checked" : "";
        
        let description = test.description;
        if (typeof SharedArrayBuffer === "undefined") {
          description = description.replace(" and multi-threaded worker rendering", "");
          description = description.replace("multi-threaded worker rendering", "single-threaded rendering");
        }

        return `
        <div class="test-item border border-white/5 bg-white/[0.015] rounded-lg p-2 flex flex-col sm:flex-row justify-between sm:items-center gap-2.5" id="test-card-${test.id}">
          <div class="flex-1 col-span-1 min-w-0">
            <div class="flex items-center gap-2">
              <input type="checkbox" id="chk-test-${test.id}" class="w-3.5 h-3.5 accent-green-400 cursor-pointer" ${checkedAttr}>
              <span id="test-title-${test.id}" class="text-[10px] font-semibold text-white/95 transition-colors">${test.name}</span>
              <span class="text-[6.5px] bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/25 px-1.5 py-0.2 rounded font-mono font-bold select-none flex-frames-badge" data-testid="${test.id}">${test.frames} FMR</span>
            </div>
            <p class="text-[8.5px] text-white/45 mt-0.5 pl-5.5 select-none leading-relaxed">${description}</p>
            <div class="text-[7px] font-mono text-white/25 pl-5.5 mt-0.5 select-none uppercase tracking-wider font-semibold">
              Pipeline: <span class="text-green-400/80">${test.pipeline}</span> | 
              Resolution: <span class="text-white/60">${test.width}x${test.height}</span> | 
              Format: <span class="text-green-400/80">${test.format}</span> ${test.crf ? `| CRF: <span class="text-amber-400 font-bold">${test.crf}</span>` : ""}
            </div>
            <!-- Dynamic Error Box -->
            <div id="test-error-${test.id}" class="test-error-box ml-5.5 border border-red-500/20 bg-red-500/5 text-red-300 font-mono text-[7px] p-2 mt-1.5 rounded-lg overflow-x-auto select-text hidden"></div>
          </div>
          <div class="flex items-center gap-2 shrink-0 justify-end pl-5.5 sm:pl-0">
            <span class="text-[7px] font-sans font-bold uppercase select-none rounded px-1.5 py-0.5 tracking-wider border text-white/40 border-white/10" id="status-badge-${test.id}" style="display: none;">PENDING</span>
            <button class="btn-single-test bg-white/5 text-white/70 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30 border border-white/10 py-1 px-2.5 rounded text-[6.5px] font-bold transition-all uppercase tracking-wider whitespace-nowrap cursor-pointer select-none" data-id="${test.id}">▶ Run Base</button>
          </div>
        </div>
        `;
      }).join("");

      return `
      <div class="test-category-group test-category-highres mb-4" style="${initialStyle}" id="cat-group-${cat.name.replace(/\s+/g, '-')}">
        <h3 class="text-[9px] uppercase font-bold tracking-wider text-green-400/90 mb-2 border-b border-white/5 pb-1 select-none flex items-center justify-between">
          <span>${cat.name}</span>
          <span class="text-[8px] opacity-30 font-normal normal-case">Sequence Batch Assertions</span>
        </h3>
        <div class="flex flex-col gap-1.5">
          ${testsGroupHtml}
        </div>
      </div>
      `;
    }).join("");

    content.innerHTML = `
      <header class="flex justify-between items-center border-b border-white/10 pb-3 mb-3">
        <div>
          <h1 class="text-xl font-black mt-0.5 tracking-tight text-white select-none uppercase">Video Pipeline Diagnostics and Test Suite</h1>
          <p class="text-white/40 font-mono text-[8.5px] uppercase tracking-[0.12em] mt-0.5 select-none">Automated compliance checks • Frame rate integrity benchmarks</p>
        </div>
        <button id="btn-close-diagnostics" class="btn-icon w-8 h-8 text-white hover:bg-white/10 text-sm border border-white/10 rounded-full transition-all flex items-center justify-center">✕</button>
      </header>

      <!-- System Diagnostic Metadata Header -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white/[0.015] border border-white/5 rounded-xl p-2.5 mb-3 text-[9px] text-white/60">
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">System Cores: </span><strong id="diag-cores">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">Reported Memory: </span><strong id="diag-mem">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">SharedArrayBuffer: </span><strong id="diag-sab">Calculating...</strong></div>
        <div><span class="text-white/35 select-none mb-0.5 font-bold uppercase tracking-wider" style="display: block;">OPFS Sandbox: </span><strong id="diag-opfs">Calculating...</strong></div>
      </section>

      <!-- Action Control Row -->
      <div class="flex flex-wrap items-center justify-between gap-2.5 bg-white/[0.02] border border-white/5 p-2 rounded-xl mb-3">
        <div class="flex flex-wrap gap-3.5 items-center">
          <!-- Diagnostics Filter Dropdown -->
          <div class="flex items-center gap-2 text-[9px] text-white select-none uppercase font-bold tracking-wider border-r border-white/10 pr-3.5">
            <span class="text-white/45">Viewing Level:</span>
            <select id="sel-diagnostic-level-filter" class="thumb-select bg-white/5 border border-white/15 hover:border-green-500/50 rounded px-2 cursor-pointer !h-[22px] !py-0 !text-[9.5px] text-green-400 font-bold focus:outline-none focus:ring-1 focus:ring-green-500/50">
              <option value="level-1" selected>Level 1: Quick Compliance Checks</option>
              <option value="level-2">Level 2: Duration & Storage Stress Tests</option>
              <option value="level-3">Level 3: High-Density Stress (Opt-In)</option>
              <option value="all">Show All Suite Levels</option>
            </select>
          </div>
          <label class="flex items-center gap-1.5 text-[9px] text-white/55 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-select-all" class="w-3.5 h-3.5 accent-green-400 cursor-pointer" checked>
            Select All
          </label>
          <label class="flex items-center gap-1.5 text-[9px] text-white/55 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-enable-probing" class="w-3.5 h-3.5 accent-green-400 cursor-pointer" checked>
            Enable Output Probing
          </label>
          <label class="flex items-center gap-1.5 text-[9px] text-white/55 select-none uppercase font-bold cursor-pointer" style="display: none;">
            <input type="checkbox" id="chk-enable-highres" class="w-3.5 h-3.5 accent-green-400 cursor-pointer">
            Enable 1080p/1440p/4K Tests
          </label>
        </div>
        
        <!-- Dynamic Target Frame Count Range -->
        <div class="flex items-center gap-2">
          <select id="sel-test-frames-selector" class="thumb-select bg-white/5 border border-white/15 rounded px-2 cursor-pointer !h-[22px] !py-0 !text-[9.5px]">
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

        <div class="flex gap-1.5">
          <button id="btn-run-all-diagnostics" class="btn-pill bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 py-1 px-3 rounded text-[10px] font-bold transition-all whitespace-nowrap">▶ Run Selected</button>
          <button id="btn-abort-diagnostics" class="btn-pill bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 py-1 px-3 rounded text-[10px] font-bold transition-all whitespace-nowrap" style="display:none;">⏹ Abort Suite</button>
          <button id="btn-copy-test-report" class="btn-pill bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 py-1 px-3 rounded text-[10px] font-bold transition-all whitespace-nowrap" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-clear-diagnostic-logs" class="btn-pill bg-white/5 text-white/55 hover:bg-white/10 border border-white/10 py-1 px-2.5 rounded text-[10px] font-bold transition-all whitespace-nowrap">🧹 Clear Logs</button>
        </div>
      </div>

      <!-- Main Test Suite Grid -->
      <div class="flex flex-col gap-1.5 pr-1 select-none scrollbar-thin mb-3" style="max-height: 250px; overflow-y: auto;">
        ${testsHtml}
      </div>

      <!-- Real-time Test Output Logs Console -->
      <div id="diagnostics-console-box" class="border border-white/5 rounded-xl bg-black/95 p-3 font-mono text-[7px] flex flex-col gap-1 overflow-hidden" style="height: 180px; min-height: 180px; display: flex !important; flex-shrink: 0; box-sizing: border-box;">
        <div class="flex justify-between items-center text-[7px] uppercase tracking-wider border-b border-white/5 pb-1 mb-1 text-white/35">
          <span>Engine Output Console</span>
          <span id="txt-diagnostics-phase-val" class="font-bold text-yellow-400">IDLE</span>
        </div>
        <div id="diagnostics-logs-scrollbar" class="flex-1 overflow-y-auto pr-1 space-y-0.5 text-left text-white/60 scrollbar-thin select-text">
          <div class="text-white/20">[Suite] Welcome to the Sine-Gordon Lab Pipeline Diagnostics Center. Select tests and run pipeline benchmark assertions.</div>
        </div>
        <div class="mt-1" id="box-diagnostics-progress-outer" style="display:none;">
          <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:9999px; overflow:hidden;" class="w-full">
            <div id="diagnostics-progress-fill" style="height:100%; background:linear-gradient(90deg, #4ade80, #10b981); width:0%; transition:none;"></div>
          </div>
          <div class="flex justify-between items-center text-[6.5px] text-white/35 mt-0.5">
            <span id="txt-diagnostics-progress-step">Processing...</span>
            <span id="txt-diagnostics-progress-percent">0%</span>
          </div>
        </div>
      </div>

      <!-- Bottom Actions Footer Row -->
      <div class="flex justify-between items-center mt-3 bg-white/[0.015] border border-white/5 p-2 px-3 rounded-lg select-none text-[9.5px]">
        <span class="text-white/30 font-mono text-[8.5px] uppercase tracking-wider pl-1">Compliance Report Actions</span>
        <div class="flex gap-2">
          <button id="btn-copy-test-report-bottom" class="btn-pill bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/40 py-1 px-3 rounded text-[10px] font-bold transition-all whitespace-nowrap" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-close-diagnostics-bottom" class="btn-pill bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 py-1 px-3 rounded text-[10px] font-bold transition-all whitespace-nowrap">Close</button>
        </div>
      </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Bind event handlers
    document.getElementById("btn-close-diagnostics").onclick = () => this.hide();
    document.getElementById("btn-close-diagnostics-bottom").onclick = () => this.hide();
    document.getElementById("btn-clear-diagnostic-logs").onclick = () => this.clearLogs();
    
    // Frames list update binding
    const framesSelect = document.getElementById("sel-test-frames-selector");
    if (framesSelect) {
      framesSelect.onchange = () => {
        this.updateUIForSelectedFrameCount();
      };
    }
    
    // Select All Checkbox logic — modified to only select visible category tests
    const selectAllChk = document.getElementById("chk-select-all");
    selectAllChk.onchange = (e) => {
      const isChecked = e.target.checked;
      DIAGNOSTIC_TESTS.forEach(t => {
        const itemChk = document.getElementById(`chk-test-${t.id}`);
        if (itemChk) {
          const groupName = t.category;
          const groupEl = document.getElementById(`cat-group-${groupName.replace(/\s+/g, '-')}`);
          if (groupEl && groupEl.style.display !== "none") {
            itemChk.checked = isChecked;
          }
        }
      });
    };

    // Diagnostics Filter & High-Res checks coordination
    const levelFilterSelect = document.getElementById("sel-diagnostic-level-filter");
    const highresChk = document.getElementById("chk-enable-highres");

    const updateCategoryVisibilities = (filterVal) => {
      const group1 = document.getElementById("cat-group-Level-1:-Quick-Compliance-Checks");
      const group2 = document.getElementById("cat-group-Level-2:-Duration-&-Storage-Stress-Tests");
      const group3 = document.getElementById("cat-group-Level-3:-High-Density-Stress-Tests-(Opt-In)");

      if (filterVal === "level-1") {
        if (group1) group1.style.setProperty("display", "block", "important");
        if (group2) group2.style.setProperty("display", "none", "important");
        if (group3) group3.style.setProperty("display", "none", "important");
        if (highresChk) highresChk.checked = false;
      } else if (filterVal === "level-2") {
        if (group1) group1.style.setProperty("display", "none", "important");
        if (group2) group2.style.setProperty("display", "block", "important");
        if (group3) group3.style.setProperty("display", "none", "important");
        if (highresChk) highresChk.checked = false;
      } else if (filterVal === "level-3") {
        if (group1) group1.style.setProperty("display", "none", "important");
        if (group2) group2.style.setProperty("display", "none", "important");
        if (group3) group3.style.setProperty("display", "block", "important");
        if (highresChk) {
          highresChk.checked = true;
        }
      } else if (filterVal === "all") {
        if (group1) group1.style.setProperty("display", "block", "important");
        if (group2) group2.style.setProperty("display", "block", "important");
        const highresEnabled = highresChk ? highresChk.checked : false;
        if (group3) group3.style.setProperty("display", highresEnabled ? "block" : "none", "important");
      }

      // Automatically sync checkboxes: check if they are in a visible category, uncheck if they are in a hidden category
      const selectAllChecked = selectAllChk ? selectAllChk.checked : true;
      DIAGNOSTIC_TESTS.forEach(t => {
        const itemChk = document.getElementById(`chk-test-${t.id}`);
        if (itemChk) {
          const groupName = t.category;
          const groupEl = document.getElementById(`cat-group-${groupName.replace(/\s+/g, '-')}`);
          const isGroupVisible = groupEl && groupEl.style.display !== "none";
          
          if (isGroupVisible) {
            if (t.highRes) {
              itemChk.checked = highresChk ? highresChk.checked : false;
            } else {
              itemChk.checked = selectAllChecked;
            }
          } else {
            itemChk.checked = false;
          }
        }
      });
    };

    if (levelFilterSelect) {
      levelFilterSelect.onchange = (e) => {
        updateCategoryVisibilities(e.target.value);
      };
    }

    if (highresChk) {
      highresChk.onchange = (e) => {
        const isChecked = e.target.checked;
        const currentFilter = levelFilterSelect ? levelFilterSelect.value : "level-1";

        if (isChecked && currentFilter !== "level-3" && currentFilter !== "all") {
          if (levelFilterSelect) {
            levelFilterSelect.value = "all";
          }
          updateCategoryVisibilities("all");
        } else {
          updateCategoryVisibilities(currentFilter);
        }

        DIAGNOSTIC_TESTS.forEach(t => {
          if (t.highRes) {
            const itemChk = document.getElementById(`chk-test-${t.id}`);
            if (itemChk) {
              itemChk.checked = isChecked;
            }
          }
        });
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

    // Bind individual run buttons
    const btnSingles = overlay.querySelectorAll(".btn-single-test");
    btnSingles.forEach(btn => {
      btn.onclick = (e) => {
        const testId = e.target.getAttribute("data-id");
        this.runSingle(testId);
      };
    });

    // Load specs dynamically
    this.updateSpecs();
  }

  updateSpecs() {
    const specs = {
      cores: navigator.hardwareConcurrency || "N/A",
      mem: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "Unknown",
      sab: typeof SharedArrayBuffer !== "undefined" ? "AVAILABLE" : "UNAVAILABLE",
      opfs: (typeof navigator.storage !== "undefined" && typeof navigator.storage.getDirectory === "function") ? "COMPATIBLE" : "INCOMPATIBLE"
    };

    document.getElementById("diag-cores").textContent = specs.cores;
    document.getElementById("diag-mem").textContent = specs.mem;
    document.getElementById("diag-sab").textContent = specs.sab;
    document.getElementById("diag-opfs").textContent = specs.opfs;

    if (specs.sab === "UNAVAILABLE") {
      document.getElementById("diag-sab").style.color = "#ff6b6b";
    } else {
      document.getElementById("diag-sab").style.color = "#4ade80";
    }
    if (specs.opfs === "INCOMPATIBLE") {
      document.getElementById("diag-opfs").style.color = "#ff6b6b";
    } else {
      document.getElementById("diag-opfs").style.color = "#4ade80";
    }
  }

  show() {
    document.getElementById(this.modalId).style.display = "block";
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

  hide() {
    if (this.isTesting) {
      if (!confirm("A diagnostic check is active. Do you really wish to close and abort the running suite?")) {
        return;
      }
      this.abort();
    }
    document.getElementById(this.modalId).style.display = "none";
  }

  clearLogs() {
    this.logs = [];
    const logScroll = document.getElementById("diagnostics-logs-scrollbar");
    if (logScroll) {
      logScroll.innerHTML = `<div class="text-white/30">[Suite Log Cleared] Console ready.</div>`;
    }
  }

  log(msg, styleClass = "") {
    console.log(`[Diagnostics Sandbox] ${msg}`);
    this.logs.push(msg);
    const logScroll = document.getElementById("diagnostics-logs-scrollbar");
    if (logScroll) {
      const line = document.createElement("div");
      line.className = styleClass;
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logScroll.appendChild(line);
      logScroll.scrollTop = logScroll.scrollHeight;
    }
  }

  updateTestBadge(testId, status, isError = false) {
    const badge = document.getElementById(`status-badge-${testId}`);
    if (!badge) return;

    badge.textContent = status;
    badge.className = "text-[7px] font-sans font-bold uppercase select-none rounded px-1.5 py-0.5 tracking-wider border transition-all";
    badge.classList.remove("animate-pulse");

    const titleEl = document.getElementById(`test-title-${testId}`);

    if (status === "PENDING") {
      badge.style.display = "none";
      badge.style.color = "";
      badge.style.borderColor = "";
      badge.style.backgroundColor = "";
      if (titleEl) {
        titleEl.style.color = "";
        titleEl.className = "text-[10px] font-semibold text-white/95 transition-colors";
      }
    } else {
      badge.style.display = "inline-block";
      if (status === "PASS") {
        badge.style.color = "#4ade80";
        badge.style.borderColor = "rgba(74, 222, 128, 0.3)";
        badge.style.backgroundColor = "rgba(74, 222, 128, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#4ade80";
          titleEl.className = "text-[10px] font-semibold transition-colors";
        }
      } else if (status === "FAIL") {
        badge.style.color = "#f87171";
        badge.style.borderColor = "rgba(248, 113, 113, 0.3)";
        badge.style.backgroundColor = "rgba(248, 113, 113, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#f87171";
          titleEl.className = "text-[10px] font-semibold transition-colors";
        }
      } else {
        // Typically RUNNING or anything else
        badge.style.color = "#facc15";
        badge.style.borderColor = "rgba(250, 204, 21, 0.3)";
        badge.style.backgroundColor = "rgba(250, 204, 21, 0.05)";
        if (titleEl) {
          titleEl.style.color = "#facc15";
          titleEl.className = "text-[10px] font-semibold transition-colors";
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
          this.updateTestBadge(t.id, "ABORTED");
          this.testResults[t.id] = { status: "ABORTED", failureReason: null, failureBase: null, failureFunction: null };
          continue;
        }

        const actualFrames = chosenFramesCount !== null ? chosenFramesCount : t.frames;
        this.log(`🤖 INITIALIZING: [${t.name}]`, "text-white font-bold mt-3");
        this.updateTestBadge(t.id, "RUNNING");
        this.updateTestErrorUI(t.id, null); // Clear existing error UI

        let savedDirName = null;

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
          const testNeedMultiThreaded = (t.format === "mp4") && testHasSab;
          const testThreadingLabel = t.pipeline === "zip" ? "N/A (ZIP Still Archive)" : (testNeedMultiThreaded ? "MULTI-THREADED (MT)" : "SINGLE-THREADED (ST)");
          this.log(`[Config] Pipeline=${t.pipeline}, Format=${t.format}, Target Resolution=${t.width}x${t.height}, Frames Limit=${actualFrames}, Threads=${testThreadingLabel}`);

          // 2. Clear previous flags and establish testers
          window.recorder.isTesting = true;
          let finalOutputBlob = null;

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
          
          let expectedW = t.width;
          let expectedH = t.height;
          if (t.width > 1920 || t.height > 1080) {
            const scaleFactor = Math.min(1920 / t.width, 1080 / t.height);
            expectedW = Math.floor((t.width * scaleFactor) / 2) * 2;
            expectedH = Math.floor((t.height * scaleFactor) / 2) * 2;
          }

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
            if (t.pipeline === "ffmpeg") {
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

                if (probeResult.width !== t.width || probeResult.height !== t.height) {
                  const mmErr = new Error(`Video output resolution mismatch: parsed ${probeResult.width}x${probeResult.height}, configured ${t.width}x${t.height}.`);
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
                    if (zW !== t.width || zH !== t.height) {
                      const mmErr = new Error(`ZIP dimensional mismatch: Extracted size ${zW}x${zH} does not match target ${t.width}x${t.height}.`);
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
            window.recorder.isAssembling = false;
          }
          window.onTestVideoBlobGenerated = null;
          window.onTestZipBlobGenerated = null;
          
          await delay(500); // cooldown padding between sequential runs
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

      window.recorder.isTesting = false;
      window.onTestVideoBlobGenerated = null;
      window.onTestZipBlobGenerated = null;
      window.recorder.isAssembling = false;

      this.showProgress(false);
      
      this.isTesting = false;
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

      const specs = {
        cores: navigator.hardwareConcurrency || "N/A",
        mem: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "Unknown",
        sab: typeof SharedArrayBuffer !== "undefined" ? "AVAILABLE" : "UNAVAILABLE",
        opfs: (typeof navigator.storage !== "undefined" && typeof navigator.storage.getDirectory === "function") ? "COMPATIBLE" : "INCOMPATIBLE"
      };

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
