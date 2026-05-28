// =============================================================================
// sine-gordon-lab — js/logger.js
// Central Nexus of Control for All Logging Activities (Normal & Diagnostics)
// Keeps logs from growing out of control, eliminates code redundancies,
// and separates logging into two controlled piles: Normal & Test Diagnostics.
// =============================================================================

class LogNexusController {
  constructor() {
    this.normalLogs = [];
    this.testLogs = [];
    this.maxNormalLogs = 500;
    this.maxTestLogs = 1000;
    this._hooksSetup = false;
    this.originalLog = null;
    this.originalWarn = null;
    this.originalError = null;
  }

  // --- Compile/Normal Running Logs Pile ---
  clearNormal() {
    this.normalLogs = [];
    const el = document.getElementById("assembly-log-scroll");
    if (el) {
      el.innerHTML = '<div class="text-white/30">[System] Log cleared. Ready for assembly...</div>';
    }
    const countEl = document.getElementById("assembly-log-count");
    if (countEl) {
      countEl.textContent = "0 messages";
    }
  }

  logNormal(msg) {
    if (!msg) return;
    const t = new Date().toLocaleTimeString();
    const cleanMsg = msg.replace(/^\[FFmpeg\]\s*/, "");
    
    // Manage log constraints (prevent growing out of control)
    this.normalLogs.push(`[${t}] ${cleanMsg}`);
    while (this.normalLogs.length > this.maxNormalLogs) {
      this.normalLogs.shift();
    }

    if (this.originalLog) {
      this.originalLog(`[System Log] ${cleanMsg}`);
    } else {
      console.log(`[System Log] ${cleanMsg}`);
    }

    const el = document.getElementById("assembly-log-scroll");
    if (el) {
      const row = document.createElement("div");
      row.className = "py-0.5 border-b border-white/[0.02]";

      // Consistent style classification
      const lower = cleanMsg.toLowerCase();
      let isError = false;
      let isWarning = false;
      let isSuccess = false;
      let isDiagnosticSystem = false;

      if (lower.includes("error") || lower.includes("failed")) {
        // Exclude telemetry entries displaying 0 failures or empty lists
        const isTelemetryZeroOrEmpty = /"[\w\-]*error[\w\-]*"\s*:\s*(0|false|null|\[\s*\])\s*,?/i.test(cleanMsg) ||
                                       /"[\w\-]*failed[\w\-]*"\s*:\s*(0|false|null|\[\s*\])\s*,?/i.test(cleanMsg);
        
        // Exclude general bullet points and list numbers inside the Troubleshooting diagnostics
        const isTroubleshootingGuide = cleanMsg.includes("[FFmpeg Diagnostics]") || 
                                       cleanMsg.includes("CLUES & TROUBLESHOOTING") ||
                                       /^\s*(\d+\.|\-)/.test(cleanMsg);

        if (!isTelemetryZeroOrEmpty && !isTroubleshootingGuide) {
          isError = true;
        }
      }

      if (!isError && (lower.includes("warning") || lower.includes("warn"))) {
        isWarning = true;
      }

      if (cleanMsg.startsWith("[System]") || cleanMsg.startsWith("Diagnostic") || cleanMsg.includes("=== FINAL TELEMETRY ===") || cleanMsg.includes("=== RECORDING TELEMETRY ===")) {
        isDiagnosticSystem = true;
      } else if (
        cleanMsg.includes("Loaded") ||
        cleanMsg.includes("Success") ||
        lower.includes("complete") ||
        lower.includes("passed") ||
        lower.includes("[probe ok]") ||
        lower.includes("[integrity passed]")
      ) {
        isSuccess = true;
      }

      if (isError) {
        row.style.color = "#ff6b6b";
      } else if (isWarning) {
        row.style.color = "#ffb24d";
      } else if (isDiagnosticSystem) {
        row.style.color = "rgba(255,255,255,0.4)";
      } else if (isSuccess) {
        row.style.color = "#00ffcc";
      }

      row.textContent = `[${t}] ${cleanMsg}`;
      el.appendChild(row);

      // Perform scrolling adjustments
      el.scrollTop = el.scrollHeight;
      try {
        row.scrollIntoView({ block: "nearest" });
      } catch (e) {}

      // Asynchronous security offsets for browser layout engines
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
        try { row.scrollIntoView({ block: "nearest" }); } catch (err) {}
      }, 0);
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
        try { row.scrollIntoView({ block: "nearest" }); } catch (err) {}
      }, 50);
    }

    const countEl = document.getElementById("assembly-log-count");
    if (countEl) {
      countEl.textContent = `${this.normalLogs.length} messages`;
    }
  }

  copyNormalToClipboard() {
    if (!this.normalLogs || this.normalLogs.length === 0) {
      this._flashButton("btn-copy-logs", "EMPTY", "#ff6b6b");
      return;
    }
    const textToCopy = this.normalLogs.join("\n");
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        this._flashButton("btn-copy-logs", "COPIED!", "#00ffcc");
      })
      .catch((err) => {
        console.warn("Failed to copy normal logs, using backup input method", err);
        try {
          const textArea = document.createElement("textarea");
          textArea.value = textToCopy;
          textArea.style.position = "fixed";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          this._flashButton("btn-copy-logs", "COPIED!", "#00ffcc");
        } catch (e) {
          console.error("Backup clipboard copy failed", e);
        }
      });
  }

  // --- Test & Diagnostic Logs Pile ---
  clearTest() {
    this.testLogs = [];
    const logScroll = document.getElementById("diagnostics-logs-scrollbar");
    if (logScroll) {
      logScroll.innerHTML = `<div class="text-white/30">[Suite Log Cleared] Console ready.</div>`;
    }
  }

  logTest(msg) {
    if (!msg) return;
    const t = new Date().toLocaleTimeString();
    
    // Manage diagnostic test log pile limits
    this.testLogs.push(msg);
    while (this.testLogs.length > this.maxTestLogs) {
      this.testLogs.shift();
    }

    if (this.originalLog) {
      this.originalLog(`[Diagnostics Sandbox] ${msg}`);
    } else {
      console.log(`[Diagnostics Sandbox] ${msg}`);
    }

    const logScroll = document.getElementById("diagnostics-logs-scrollbar");
    if (logScroll) {
      const line = document.createElement("div");
      
      let finalStyleClass = "text-white/95";
      const lower = msg.toLowerCase();
      
      const isSuccess = lower.includes("success") || lower.includes("passed") || lower.includes("perfect");
      const isFailure = lower.includes("fail") || lower.includes("failed") || lower.includes("panic") || lower.includes("aborted") || lower.includes("error");
      const isWarning = lower.includes("warning") || lower.includes("caution");
      
      if (isSuccess) {
        finalStyleClass = "text-green-400 font-bold";
      } else if (isFailure) {
        finalStyleClass = "text-red-400 font-bold";
      } else if (isWarning) {
        finalStyleClass = "text-yellow-400 font-bold";
      } else {
        finalStyleClass = "text-white/95";
      }
      
      line.className = finalStyleClass;
      line.textContent = `[${t}] ${msg}`;
      logScroll.appendChild(line);
      logScroll.scrollTop = logScroll.scrollHeight;
    }
  }

  copyTestToClipboard() {
    if (!this.testLogs || this.testLogs.length === 0) {
      return "";
    }
    return this.testLogs.join("\n");
  }

  // --- Safe global Console Hooks to auto-capture everything ---
  setupConsoleHooks() {
    if (this._hooksSetup) return;
    this._hooksSetup = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    this.originalLog = originalLog;
    this.originalWarn = originalWarn;
    this.originalError = originalError;

    const self = this;

    console.log = function (...args) {
      originalLog.apply(console, args);
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");

      if (msg) {
        // Prevent infinite cycle recursion or redundant tagging
        if (msg.startsWith("[System Log]") || msg.startsWith("[Diagnostics Sandbox]")) return;
        self.logNormal(msg);
      }
    };

    console.warn = function (...args) {
      originalWarn.apply(console, args);
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");

      if (msg) {
        if (msg.startsWith("[System Log]") || msg.startsWith("[Diagnostics Sandbox]")) return;
        self.logNormal("[Warn] " + msg);
      }
    };

    console.error = function (...args) {
      originalError.apply(console, args);
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");

      if (msg) {
        if (msg.startsWith("[System Log]") || msg.startsWith("[Diagnostics Sandbox]")) return;
        self.logNormal("[Error] " + msg);
      }
    };
  }

  // --- Private Utilities ---
  _flashButton(btnId, flashText, colorHex) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const oldText = btn.textContent;
    btn.textContent = flashText;
    const oldColor = btn.style.color;
    btn.style.color = colorHex;
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.color = oldColor;
    }, 1500);
  }
}

export const LogNexus = new LogNexusController();
LogNexus.setupConsoleHooks();

// Expose globally for backup integration
if (typeof window !== "undefined") {
  window.LogNexus = LogNexus;
  window.clearAssemblyLogs = () => LogNexus.clearNormal();
  window.appendAssemblyLog = (msg) => LogNexus.logNormal(msg);
  window.copyAssemblyLogsToClipboard = () => LogNexus.copyNormalToClipboard();
}
