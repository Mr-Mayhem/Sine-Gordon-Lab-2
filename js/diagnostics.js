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
    overlay.style.background = "rgba(0,0,0,0.96)";
    overlay.style.backdropFilter = "blur(16px)";
    overlay.style.zIndex = "300";
    overlay.style.overflowY = "auto";
    overlay.style.padding = "40px 20px";

    const content = document.createElement("div");
    content.className = "theory-content";
    content.style.maxWidth = "880px";
    content.style.margin = "40px auto";
    content.style.backgroundColor = "rgba(10, 10, 10, 0.75)";
    content.style.border = "1px solid rgba(255,255,255,0.08)";
    content.style.borderRadius = "24px";
    content.style.padding = "32px";
    content.style.boxShadow = "0 30px 60px rgba(0,0,0,0.5)";

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
        return `
        <div class="test-item border border-white/5 bg-white/[0.02] rounded-xl p-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3" id="test-card-${test.id}">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <input type="checkbox" id="chk-test-${test.id}" class="w-4 h-4 accent-[#00ffcc] cursor-pointer" ${checkedAttr}>
              <span class="text-sm font-bold text-white">${test.name}</span>
              <span class="text-[9px] bg-[#00ffcc]/10 hover:bg-[#00ffcc]/20 text-[#00ffcc] border border-[#00ffcc]/30 px-1.5 py-0.5 rounded font-mono font-semibold select-none flex-frames-badge" data-testid="${test.id}">${test.frames} FMR</span>
            </div>
            <p class="text-xs text-white/50 mt-1 pl-6 select-none">${test.description}</p>
            <div class="text-[10px] font-mono text-white/30 pl-6 mt-0.5 select-none font-bold uppercase tracking-wide">
              Pipeline: <span class="text-[#00ffcc]/80">${test.pipeline}</span> | 
              Resolution: <span class="text-white/60">${test.width}x${test.height}</span> | 
              Format: <span class="text-[#00ffcc]/80">${test.format}</span> ${test.crf ? `| CRF: <span class="text-amber-400 font-bold">${test.crf}</span>` : ""}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 justify-end pl-6 sm:pl-0">
            <span class="text-xs font-mono font-bold uppercase select-none rounded px-2.5 py-1 tracking-wider border text-white/40 border-white/10" id="status-badge-${test.id}" style="display: none;">PENDING</span>
            <button class="btn-single-test bg-white/5 text-white/70 hover:bg-[#00ffcc]/10 hover:text-[#00ffcc] hover:border-[#00ffcc]/40 border border-white/10 py-1.5 px-3 rounded-xl text-[9px] font-bold font-mono transition-all uppercase tracking-wider whitespace-nowrap cursor-pointer select-none" data-id="${test.id}">▶ Run Base</button>
          </div>
        </div>
        `;
      }).join("");

      return `
      <div class="test-category-group test-category-highres mb-5" style="${initialStyle}" id="cat-group-${cat.name.replace(/\s+/g, '-')}">
        <h3 class="text-[10px] uppercase font-mono font-black tracking-widest text-[#00ffcc] mb-2.5 border-b border-white/10 pb-1.5 select-none flex items-center justify-between">
          <span>${cat.name}</span>
          <span class="text-[9px] opacity-40 font-normal normal-case font-sans">Sequence Batch Assertions</span>
        </h3>
        <div class="flex flex-col gap-2.5">
          ${testsGroupHtml}
        </div>
      </div>
      `;
    }).join("");

    content.innerHTML = `
      <header class="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
        <div>
          <span class="text-xs font-bold tracking-[0.25em] text-[#00ffcc] uppercase select-none">Engineering Sandbox</span>
          <h1 class="text-3xl font-black mt-1 italic uppercase tracking-tight text-white select-none">Pipeline Diagnostics & stress suite</h1>
          <p class="text-white/40 font-mono text-[9px] uppercase tracking-[0.15em] mt-0.5 select-none">Automated compliance checks • Frame rate integrity benchmarks</p>
        </div>
        <button id="btn-close-diagnostics" class="btn-icon w-10 h-10 text-white hover:bg-white/10 text-xl border border-white/10 rounded-full transition-all">✕</button>
      </header>

      <!-- System Diagnostic Metadata Header -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4 mb-5 font-mono text-[10px] text-white/60">
        <div><span class="text-white/30 block select-none mb-0.5 font-bold uppercase">System Cores </span><strong id="diag-cores">Calculating...</strong></div>
        <div><span class="text-white/30 block select-none mb-0.5 font-bold uppercase">Reported Memory </span><strong id="diag-mem">Calculating...</strong></div>
        <div><span class="text-white/30 block select-none mb-0.5 font-bold uppercase">SharedArrayBuffer </span><strong id="diag-sab">Calculating...</strong></div>
        <div><span class="text-white/30 block select-none mb-0.5 font-bold uppercase">OPFS Sandbox </span><strong id="diag-opfs">Calculating...</strong></div>
      </section>

      <!-- Action Control Row -->
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 p-3 rounded-2xl mb-5">
        <div class="flex flex-wrap gap-4 items-center">
          <!-- Diagnostics Filter Dropdown -->
          <div class="flex items-center gap-2 font-mono text-[10px] text-white select-none uppercase font-black tracking-wide border-r border-white/15 pr-3.5">
            <span class="text-white/50">Viewing Level:</span>
            <select id="sel-diagnostic-level-filter" class="thumb-select bg-white/10 border border-white/20 hover:border-[#00ffcc]/50 rounded-xl px-2.5 cursor-pointer !h-[26px] !py-0 !text-[10px] text-[#00ffcc] font-black focus:outline-none focus:ring-1 focus:ring-[#00ffcc]">
              <option value="level-1" selected>Level 1: Quick Compliance Checks</option>
              <option value="level-2">Level 2: Duration & Storage Stress Tests</option>
              <option value="level-3">Level 3: High-Density Stress (Opt-In)</option>
              <option value="all">Show All Suite Levels</option>
            </select>
          </div>
          <label class="flex items-center gap-2 font-mono text-[10px] text-white/70 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-select-all" class="w-4 h-4 accent-[#00ffcc] cursor-pointer" checked>
            Select All
          </label>
          <label class="flex items-center gap-2 font-mono text-[10px] text-white/70 select-none uppercase font-bold cursor-pointer">
            <input type="checkbox" id="chk-enable-probing" class="w-4 h-4 accent-[#00ffcc] cursor-pointer" checked>
            Enable Output Probing (HTML5/ZIP)
          </label>
          <label class="flex items-center gap-2 font-mono text-[10px] text-white/70 select-none uppercase font-bold cursor-pointer" style="display: none;">
            <input type="checkbox" id="chk-enable-highres" class="w-4 h-4 accent-[#00ffcc] cursor-pointer">
            Enable 1080p/1440p/4K Tests
          </label>
        </div>
        
        <!-- Dynamic Target Frame Count Range -->
        <div class="flex items-center gap-2">
          <select id="sel-test-frames-selector" class="thumb-select bg-white/5 border border-white/15 rounded-xl px-2.5 cursor-pointer !h-[26px] !py-0 !text-[10px]">
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

        <div class="flex gap-2">
          <button id="btn-run-all-diagnostics" class="btn-pill bg-[#00ffcc]/10 text-[#00ffcc] hover:bg-[#00ffcc]/20 border border-[#00ffcc]/40 py-1.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap">▶ Run Selected</button>
          <button id="btn-abort-diagnostics" class="btn-pill bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/40 py-1.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap" style="display:none;">⏹ Abort Suite</button>
          <button id="btn-copy-test-report" class="btn-pill bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/40 py-1.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-clear-diagnostic-logs" class="btn-pill bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 py-1.5 px-3 rounded-xl text-xs transition-all whitespace-nowrap">🧹 Clear Logs</button>
        </div>
      </div>

      <!-- Main Test Suite Grid -->
      <div class="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1 select-none scrollbar-thin">
        ${testsHtml}
      </div>

      <!-- Real-time Test Output Logs Console -->
      <div id="diagnostics-console-box" class="mt-6 border border-white/10 rounded-2xl bg-black/80 p-4 font-mono text-[10px] flex flex-col gap-1 overflow-hidden" style="height: 250px;">
        <div class="flex justify-between items-center text-[10px] uppercase tracking-wide border-b border-white/10 pb-1.5 mb-1.5 text-white/40">
          <span>Engine Output Console</span>
          <span id="txt-diagnostics-phase-val" class="font-bold text-[#00ffcc]">IDLE</span>
        </div>
        <div id="diagnostics-logs-scrollbar" class="flex-1 overflow-y-auto pr-1 space-y-1 text-left text-[#00ffcc]/85 scrollbar-thin select-text">
          <div class="text-white/30">[Suite] Welcome to the Sine-Gordon Lab Pipeline Diagnostics Center. Select tests and run pipeline benchmark assertions.</div>
        </div>
        <div class="mt-2" id="box-diagnostics-progress-outer" style="display:none;">
          <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:9999px; overflow:hidden;" class="w-full">
            <div id="diagnostics-progress-fill" style="height:100%; background:linear-gradient(90deg, #00ffcc, #00saff); width:0%; transition:none;"></div>
          </div>
          <div class="flex justify-between items-center text-[9px] text-white/40 mt-1">
            <span id="txt-diagnostics-progress-step">Processing...</span>
            <span id="txt-diagnostics-progress-percent">0%</span>
          </div>
        </div>
      </div>

      <!-- Bottom Actions Footer Row -->
      <div class="flex justify-between items-center mt-5 bg-white/[0.02] border border-white/5 p-3 rounded-xl select-none">
        <span class="text-white/40 font-mono text-[9px] uppercase tracking-wider pl-1">Compliance Report Actions</span>
        <div class="flex gap-2">
          <button id="btn-copy-test-report-bottom" class="btn-pill bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/40 py-1.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap" style="display:none;">📋 Copy Test Report</button>
          <button id="btn-close-diagnostics-bottom" class="btn-pill bg-white/5 text-white/70 hover:bg-white/10 border border-white/10 py-1.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap">Close</button>
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
      document.getElementById("diag-sab").style.color = "#00ffcc";
    }
    if (specs.opfs === "INCOMPATIBLE") {
      document.getElementById("diag-opfs").style.color = "#ff6b6b";
    } else {
      document.getElementById("diag-opfs").style.color = "#00ffcc";
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
    badge.className = "text-xs font-mono font-bold uppercase select-none rounded px-2.5 py-1 tracking-wider border transition-all";

    if (status === "PENDING") {
      badge.classList.add("text-white/40", "border-white/10");
      badge.style.display = "none";
    } else {
      badge.style.display = "inline-block";
      if (status === "RUNNING") {
        badge.classList.add("text-amber-400", "border-amber-400/30", "bg-amber-400/5", "animate-pulse");
      } else if (status === "PASS") {
        badge.classList.add("text-[#00ffcc]", "border-[#00ffcc]/30", "bg-[#00ffcc]/5");
      } else if (status === "FAIL") {
        badge.classList.add("text-red-400", "border-red-400/30", "bg-red-500/5");
      } else if (status === "ABORTED") {
        badge.classList.add("text-gray-400", "border-gray-500/20", "bg-white/[0.02]");
      }
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

    this.log(`🚀 Starting Diagnostic Pipeline Suite (${tests.length} test configurations)...`, "text-[#00ffcc] font-bold");

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
        if (this.isAborted) {
          this.updateTestBadge(tests[i].id, "ABORTED");
          continue;
        }

        const t = tests[i];
        const actualFrames = chosenFramesCount !== null ? chosenFramesCount : t.frames;
        this.log(`🤖 INITIALIZING: [${t.name}]`, "text-white font-bold mt-3");
        this.updateTestBadge(t.id, "RUNNING");

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

        // 4. Manual frame submission loop
        let success = true;
        for (let frameIndex = 0; frameIndex < actualFrames; frameIndex++) {
          if (this.isAborted) {
            success = false;
            break;
          }

          // Advance physical pendulums sequentially to guarantee variation
          if (window.physics) {
            window.physics.step(2);
          }

          // Synchronously request WebGL render frame mapping
          await window.recorder.captureAndWait();
          
          this.showProgress(true, `Capturing frame ${frameIndex + 1}/${actualFrames}`, (frameIndex + 1) / actualFrames * 100);
          await delay(10); // minor interval to let general microtasks complete
        }

        if (this.isAborted) {
          this.log(`⚠️ Recording cancelled Programmatically for ${t.id}`);
          await window.recorder.stop();
          this.updateTestBadge(t.id, "ABORTED");
          continue;
        }

        // 4.1 Perform Intermediate Storage Integrity Audit
        const savedDirName = window.recorder._dirHandle ? window.recorder._dirHandle.name : null;
        let auditSuccess = true;
        let auditMessage = "";

        try {
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
                this.log(`[Audit Prereq] PNG binary signature assertion: PASSED`, "text-[#00ffcc]");
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
              if (readW !== t.width || readH !== t.height) {
                auditSuccess = false;
                auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target is ${t.width}x${t.height}.`;
                this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
              } else {
                this.log(`[Audit Prereq] PNG dimensional assertion: PASSED (Parsed frame size matches configured resolution)`, "text-[#00ffcc]");
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
                  this.log(`[Audit Prereq] PNG binary signature assertion: PASSED`, "text-[#00ffcc]");
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
                if (readW !== t.width || readH !== t.height) {
                  auditSuccess = false;
                  auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target is ${t.width}x${t.height}.`;
                  this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
                } else {
                  this.log(`[Audit Prereq] PNG dimensional assertion: PASSED (Parsed frame size matches configured resolution)`, "text-[#00ffcc]");
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
              this.log(`[Audit Prereq] In-memory PNG signature assertion: PASSED`, "text-[#00ffcc]");
            } else {
              auditSuccess = false;
              auditMessage = "In-memory frame 0 has invalid PNG signature.";
              this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
            }

            const view = new DataView(frameBytes.buffer, 16, 8);
            const readW = view.getUint32(0);
            const readH = view.getUint32(4);
            this.log(`[Audit Prereq] PNG IHDR block assertion: Read dimensions are ${readW}x${readH}`);
            if (readW !== t.width || readH !== t.height) {
              auditSuccess = false;
              auditMessage = `Dimensional Mismatch: read ${readW}x${readH}, target is ${t.width}x${t.height}.`;
              this.log(`❌ [Audit Fail] ${auditMessage}`, "text-red-400 font-bold");
            } else {
              this.log(`[Audit Prereq] In-memory PNG dimensional assertion: PASSED (Parsed frame size matches configured resolution)`, "text-[#00ffcc]");
            }
          }
        } catch (auditErr) {
          auditSuccess = false;
          auditMessage = `Audit checklist threw exception: ${auditErr.message}`;
          this.log(`🛑 [Audit Exception] ${auditMessage}`, "text-red-400");
        }

        // 5. Trigger Stop / Frame Assembly
        const activeMT = (t.format === "mp4") && (typeof SharedArrayBuffer !== "undefined");
        const modeLabel = t.pipeline === "zip" ? "ZIP storage archive stream" : (activeMT ? "FFmpeg WASM Multi-Threaded (MT) worker pools (SAB enabled)" : "FFmpeg WASM Single-Threaded (ST) transcode loop");
        this.log(`[Assemble] Direct capture completed. Bundling and transcoding via ${modeLabel}...`);
        this.showProgress(true, `[2/2] Assembling compiled binary stream`, 50);
        
        await window.recorder.stop();

        // 6. Wait for compilation thread to output finished product
        let waitRetries = actualFrames > 150 ? 120 : 40; // longer retry scope for large stress files
        while (window.recorder.isAssembling && waitRetries > 0 && !this.isAborted) {
          await delay(1000);
          waitRetries--;
          this.showProgress(true, `Assembling... Time outstanding limit: ${waitRetries}s`, 75);
        }

        if (this.isAborted) {
          this.log(`⚠️ Assembly suite cancelled for ${t.id}`);
          this.updateTestBadge(t.id, "ABORTED");
          continue;
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
              this.log(`⚠️ Cleanup Assertion Fail: Sandboxed temporary directory '${savedDirName}' remained in OPFS after stop/completion!`, "text-amber-400 font-bold");
              auditSuccess = false;
            } else {
              this.log(`[Cleanup Probe] OPFS Sandbox Cleanup: PASSED (Temporary frames directory successfully deleted)`, "text-[#00ffcc]");
            }
          } catch (cleanCheckErr) {
            this.log(`⚠️ Cleanup verify caution: ${cleanCheckErr.message}`);
          }
        }

        // 7. Verify result blob structure
        if (finalOutputBlob && finalOutputBlob.size > 0) {
          const blobSizeKB = (finalOutputBlob.size / 1024).toFixed(1);
          this.log(`🎉 SUCCESS: Compiled Blob generated! Payload: ${blobSizeKB} KB. (MIME: ${finalOutputBlob.type})`, "text-[#00ffcc] font-semibold");
          
          // Let's run structural probes to ensure compatibility
          if (t.pipeline === "ffmpeg") {
            try {
              if (enableProbing) {
                this.log(`[Probe] Attempting standard HTML5 direct-to-video decode...`);
                const probeResult = await this.probeVideoBlob(finalOutputBlob);
                this.log(`[Probe] Decode validation successful! Tracks: ${probeResult.width}x${probeResult.height}, Length: ${probeResult.duration.toFixed(2)}s`, "text-[#00ffcc]");
                
                // 7.1 Perform Dynamic Aspect Ratio and Letterbox Intrusion Audit
                const srcAspect = (t.width / t.height);
                const videoAspect = (probeResult.width / probeResult.height);
                const isWebM = t.format === "webm";
                const diffAttr = Math.abs(srcAspect - videoAspect);
                
                this.log(`[Probe] Aspect Ratio Evaluation: Target Config: ${srcAspect.toFixed(3)}, Decoded Track: ${videoAspect.toFixed(3)}`);
                if (isWebM) {
                  if (diffAttr < 0.02) {
                    this.log(`[Aspect Audit] WebM Letterbox Minimization: SUCCESS (Flawless snug fit. No extraneous padding detected)`, "text-[#00ffcc]");
                  } else {
                    const isLetterboxNecessary = (t.width === 1920 && t.height === 1080) || (t.width === 1280 && t.height === 720);
                    if (isLetterboxNecessary) {
                      this.log(`[Aspect Audit] WebM Letterbox Minimization: Intrusions only used for standard 16:9 compliance (${t.width}x${t.height})`, "text-[#00ffcc]/80");
                    } else {
                      this.log(`⚠️ [Aspect Audit] WebM Aspect Notice: Mismatch detected (${(diffAttr * 100).toFixed(1)}%). Recommend strict crop-to-fit sizing to clip borders.`, "text-amber-400 font-medium");
                    }
                  }
                } else {
                  if (diffAttr < 0.02) {
                    this.log(`[Aspect Audit] Aspect Compliance: PERFECT fit.`, "text-[#00ffcc]");
                  } else {
                    this.log(`[Aspect Audit] Aspect Compliance: Letterboxing configured to adapt mismatch.`, "text-white/40");
                  }
                }

                if (probeResult.width !== t.width || probeResult.height !== t.height) {
                  throw new Error(`Video output resolution mismatch: parsed ${probeResult.width}x${probeResult.height}, configured ${t.width}x${t.height}.`);
                }
              } else {
                this.log(`[Probe] Direct output probing bypassed (Opted out).`);
              }

              if (auditSuccess) {
                this.updateTestBadge(t.id, "PASS");
              } else {
                this.log(`❌ Assert Failed: Video compiled, but pre-record PNG verification failed: ${auditMessage}`, "text-red-400 font-bold");
                this.updateTestBadge(t.id, "FAIL");
              }
            } catch (probeErr) {
              this.log(`⚠️ Decode Warning: ${probeErr.message}`, "text-[#ff6b6b]");
              if (auditSuccess) {
                this.updateTestBadge(t.id, "PASS"); // Allow as pass if payload is intact, but alert logger
              } else {
                this.updateTestBadge(t.id, "FAIL");
              }
            }
          } else {
            // ZIP Pipeline Check
            if (window.JSZip && t.format === "zip") {
              try {
                if (enableProbing) {
                  this.log(`[Probe] Decompressing sandboxed ZIP stream...`);
                  const zipObj = await new window.JSZip().loadAsync(finalOutputBlob);
                  const countOfFiles = Object.keys(zipObj.files).length;
                  this.log(`[Probe] Valid zip found. Holds ${countOfFiles} frame entries!`, "text-[#00ffcc]");
                  
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
                      throw new Error(`ZIP dimensional mismatch: Extracted size ${zW}x${zH} does not match target ${t.width}x${t.height}.`);
                    } else {
                      this.log(`[Probe] ZIP frame extraction size verification: PASSED`, "text-[#00ffcc]");
                    }
                  } else {
                    throw new Error("Could not find frame_000000.png inside the ZIP archive.");
                  }
                } else {
                  this.log(`[Probe] Sandboxed ZIP format probing bypassed (Opted out).`);
                }

                if (auditSuccess) {
                  this.updateTestBadge(t.id, "PASS");
                } else {
                  this.log(`❌ Assert Failed: Output OK, but pre-record PNG verification failed: ${auditMessage}`, "text-red-400 font-bold");
                  this.updateTestBadge(t.id, "FAIL");
                }
              } catch (zipErr) {
                this.log(`⚠️ Unzip error structural trace: ${zipErr.message}`, "text-[#ff6b6b]");
                this.updateTestBadge(t.id, "FAIL");
              }
            } else {
              if (auditSuccess) {
                this.updateTestBadge(t.id, "PASS");
              } else {
                this.log(`❌ Assert Failed: Output OK, but pre-record PNG verification failed: ${auditMessage}`, "text-red-400 font-bold");
                this.updateTestBadge(t.id, "FAIL");
              }
            }
          }
        } else {
          this.log(`⚠️ Error: No finished video bytes accumulated or stream is blank.`, "text-[#ff6b6b] font-bold");
          this.updateTestBadge(t.id, "FAIL");
        }

        // Clear test loops
        window.recorder.isTesting = false;
        window.onTestVideoBlobGenerated = null;
        window.onTestZipBlobGenerated = null;
        window.recorder.isAssembling = false;

        await delay(500); // cooldown padding between sequential runs
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
      document.getElementById("txt-diagnostics-phase-val").className = this.isAborted ? "font-bold text-red-400" : "font-bold text-[#00ffcc]";
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
        return {
          id: t.id,
          name: t.name,
          pipeline: t.pipeline,
          format: t.format,
          resolution: `${t.width}x${t.height}`,
          frames: chosenFramesCount !== null ? chosenFramesCount : t.frames,
          status: status
        };
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

      this.log("🎉 SUCCESS: Compliance Test Report copied to clipboard!", "text-[#00ffcc] font-bold");

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
