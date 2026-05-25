// =============================================================================
// sine-gordon-lab — js/assembly.js
// Video assembly pipeline. FFmpeg loading delegated to ffmpeg-loader.js.
// Recordings ≤1500 frames use inline encoding (one exec, direct to output).
// Larger recordings use double-buffered chunked assembly.
// Thumbnails updated every 10 frames in all paths.
// =============================================================================

import { sgState as appState } from "./state.js";
import { loadFFmpeg } from "./ffmpeg-loader.js";
import { resolveRecordingResolution } from "./video-filters.js";
import {
  getEncodingParams,
  buildChunkArgs,
  buildAssemblyArgs,
  buildConcatArgs,
} from "./ffmpeg-commands.js";
// No imports needed from zip-export.js since we rely strictly on browser-native directory memory by id.

var _assemblyStats = null;
var _currentLogMessages = [];

// Clean logs helper
export function clearAssemblyLogs() {
  _currentLogMessages = [];
  const el = document.getElementById("assembly-log-scroll");
  if (el) {
    el.innerHTML =
      '<div class="text-white/30">[System] Log cleared. Ready for assembly...</div>';
  }
  const countEl = document.getElementById("assembly-log-count");
  if (countEl) {
    countEl.textContent = "0 messages";
  }
}
window.clearAssemblyLogs = clearAssemblyLogs;

// Append list helper
export function appendAssemblyLog(msg) {
  if (!msg) return;
  const t = new Date().toLocaleTimeString();
  const cleanMsg = msg.replace(/^\[FFmpeg\]\s*/, "");
  _currentLogMessages.push(`[${t}] ${cleanMsg}`);
  if (_currentLogMessages.length > 500) _currentLogMessages.shift();

  const el = document.getElementById("assembly-log-scroll");
  if (el) {
    const row = document.createElement("div");
    row.className = "py-0.5 border-b border-white/[0.02]";

    // Nice style classification
    if (
      cleanMsg.toLowerCase().includes("error") ||
      cleanMsg.toLowerCase().includes("failed")
    ) {
      row.style.color = "#ff6b6b";
    } else if (
      cleanMsg.toLowerCase().includes("warning") ||
      cleanMsg.toLowerCase().includes("warn")
    ) {
      row.style.color = "#ffb24d";
    } else if (
      cleanMsg.startsWith("[System]") ||
      cleanMsg.startsWith("Diagnostic")
    ) {
      row.style.color = "rgba(255,255,255,0.4)";
    } else if (
      cleanMsg.includes("Loaded") ||
      cleanMsg.includes("Success") ||
      cleanMsg.toLowerCase().includes("complete")
    ) {
      row.style.color = "#00ffcc";
    }

    row.textContent = `[${t}] ${cleanMsg}`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
    try {
      row.scrollIntoView({ block: "nearest" });
    } catch (e) {}
    setTimeout(function () {
      el.scrollTop = el.scrollHeight;
      try {
        row.scrollIntoView({ block: "nearest" });
      } catch (e) {}
    }, 0);
    setTimeout(function () {
      el.scrollTop = el.scrollHeight;
      try {
        row.scrollIntoView({ block: "nearest" });
      } catch (e) {}
    }, 50);
  }

  const countEl = document.getElementById("assembly-log-count");
  if (countEl) {
    countEl.textContent = `${_currentLogMessages.length} messages`;
  }
}
window.appendAssemblyLog = appendAssemblyLog;

// Safe global Console Hooks to auto-capture everything
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = function (...args) {
  originalLog.apply(console, args);
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  if (msg && window.appendAssemblyLog) {
    window.appendAssemblyLog(msg);
  }
};
console.warn = function (...args) {
  originalWarn.apply(console, args);
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  if (msg && window.appendAssemblyLog) {
    window.appendAssemblyLog("[Warn] " + msg);
  }
};
console.error = function (...args) {
  originalError.apply(console, args);
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  if (msg && window.appendAssemblyLog) {
    window.appendAssemblyLog("[Error] " + msg);
  }
};

export function copyAssemblyLogsToClipboard() {
  if (!_currentLogMessages || _currentLogMessages.length === 0) {
    const btn = document.getElementById("btn-copy-logs");
    if (btn) {
      const oldText = btn.textContent;
      btn.textContent = "EMPTY";
      btn.style.color = "#ff6b6b";
      setTimeout(() => {
        btn.textContent = oldText;
        btn.style.color = "";
      }, 1500);
    }
    return;
  }
  const textToCopy = _currentLogMessages.join("\n");
  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      const btn = document.getElementById("btn-copy-logs");
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = "COPIED!";
        btn.style.color = "#00ffcc";
        setTimeout(() => {
          btn.textContent = oldText;
          btn.style.color = "";
        }, 1500);
      }
    })
    .catch((err) => {
      console.warn("Failed to copy clipboard direct, trying backup", err);
      try {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        const btn = document.getElementById("btn-copy-logs");
        if (btn) {
          const oldText = btn.textContent;
          btn.textContent = "COPIED!";
          btn.style.color = "#00ffcc";
          setTimeout(() => {
            btn.textContent = oldText;
            btn.style.color = "";
          }, 1500);
        }
      } catch (e) {
        console.error("Backup copy logs also failed:", e);
      }
    });
}
window.copyAssemblyLogsToClipboard = copyAssemblyLogsToClipboard;

async function parsePngResolution(bytes) {
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    const blob = new Blob([bytes], { type: "image/png" });
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(blob);
    });
    const result = { width: img.naturalWidth, height: img.naturalHeight };
    URL.revokeObjectURL(img.src);
    return result;
  } catch (e) {
    console.warn(
      "[FFmpeg] Failed to parse PNG resolution from frame bytes:",
      e.message,
    );
    return null;
  }
}

function syncResolutionsToUIDropdown(width, height) {
  if (!width || !height) return;
  appState.exportWidth = width;
  appState.exportHeight = height;
  console.log(
    "[FFmpeg] Synced global export resolution from imported frame:",
    width + "x" + height,
  );

  const selRes = document.getElementById("sel-res");
  if (selRes) {
    const resVal = width + "x" + height;
    let optExists = false;
    for (let i = 0; i < selRes.options.length; i++) {
      const option = selRes.options[i];
      if (option.value === resVal) {
        option.disabled = false;
        selRes.selectedIndex = i;
        optExists = true;
        break;
      }
    }
    if (!optExists) {
      const option = document.createElement("option");
      option.value = resVal;
      option.textContent = resVal + " (Detected from Import)";
      selRes.appendChild(option);
      selRes.value = resVal;
    }
  }
}

function _updateAssemblyUI() {
  if (!_assemblyStats) return;
  var s = _assemblyStats;
  var statusEl = document.getElementById("assembly-status");
  var percentEl = document.getElementById("assembly-percent");
  var fill = document.getElementById("progress-fill");
  if (statusEl) {
    var lines = [];
    if (s.mode) {
      lines.push("<strong>Mode:</strong> " + s.mode);
    }
    lines.push("Phase: " + s.currentPhase);
    lines.push("Frames: " + s.verifiedFrames + " / " + s.totalFrames);
    if (s.missingFrames > 0) lines.push("Missing: " + s.missingFrames);
    if (s.encodeElapsed > 0) {
      var sec = (s.encodeElapsed / 1000).toFixed(1);
      lines.push("Elapsed: " + sec + "s");
      if (s.encodeProgress > 0 && s.encodeProgress < 100) {
        var remaining =
          (s.encodeElapsed / s.encodeProgress) * (100 - s.encodeProgress);
        lines.push("Remaining: ~" + (remaining / 1000).toFixed(1) + "s");
      }
    }
    if (s.outputSize) lines.push("Output: " + s.outputSize);

    const format =
      (typeof appState !== "undefined" ? appState.exportFormat : "webm") ||
      "webm";
    const coopCoepSatisfied = typeof SharedArrayBuffer !== "undefined";
    const needMultiThreaded = format === "mp4" && coopCoepSatisfied;

    statusEl.innerHTML = `
      <div class="flex flex-col gap-1 items-center w-full max-w-xs mx-auto">
        <div class="text-center">${lines.join("<br>")}</div>
        <div class="mt-4 pt-3 border-t border-white/10 w-full text-left font-mono" style="font-size: 10px; opacity: 0.7; line-height: 1.5;">
          <div class="text-center font-bold tracking-wider uppercase text-[#00ffcc] mb-2" style="font-size: 9px; letter-spacing: 0.15em;">Diagnostic Report</div>
          <div class="flex justify-between gap-4 py-0.5">
            <span class="text-white/40">Format</span>
            <span class="text-white font-medium">${format.toUpperCase() === "MP4" ? "MP4 (H.264)" : "WebM (VP8)"}</span>
          </div>
          <div class="flex justify-between gap-4 py-0.5">
            <span class="text-white/40">Threading</span>
            <span class="text-white font-medium">${needMultiThreaded ? "Multi-Threaded (MT)" : "Single-Threaded (ST)"}</span>
          </div>
          <div class="flex justify-between gap-4 py-0.5">
            <span class="text-white/40">COOP/COEP</span>
            <span class="${coopCoepSatisfied ? "text-emerald-400" : format === "mp4" ? "text-amber-400" : "text-white/60"} font-medium">
              ${coopCoepSatisfied ? "Satisfied (SAB Enabled)" : format === "mp4" ? "Incomplete (ST Fallback)" : "Unrequired"}
            </span>
          </div>
          ${
            format.toUpperCase() === "MP4"
              ? `<div class="flex justify-between gap-4 py-0.5">
                  <span class="text-white/40">MP4 Headers</span>
                  <span class="text-emerald-400 font-medium">FastStart (+faststart)</span>
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  }
  if (percentEl) percentEl.textContent = s.encodeProgress + "%";
  if (fill) fill.style.width = s.encodeProgress + "%";
}

function shouldUseChunkedAssembly(frameCount, width, height) {
  const pixels = (width || 1280) * (height || 720);
  if (pixels >= 3840 * 2160) {
    return frameCount > 30; // 4K limit: use chunked if > 30 frames to bypass WASM heap limits
  }
  if (pixels >= 2560 * 1440) {
    return frameCount > 60; // 1440p limit: use chunked if > 60 frames
  }
  if (pixels >= 1920 * 1080) {
    return frameCount > 120; // 1080p limit: use chunked if > 120 frames
  }
  return frameCount > 1500; // 720p and below
}

export async function assembleFromStorage(pipeline, recorderRef) {
  if (recorderRef.isAssembling) return;
  clearAssemblyLogs();

  let frameFiles = [];

  if (pipeline === "zip") {
    recorderRef._dirHandle = null; // Clean stale directory reference since ZIP imports frames in-memory
    let zipBlob = null;
    if (window.showOpenFilePicker) {
      try {
        const pickerOpts = {
          id: "zip-export",
          types: [
            {
              description: "ZIP Files",
              accept: { "application/zip": [".zip"] },
            },
          ],
          multiple: false,
        };
        console.log(
          "[ZIP Picker] Open file picker requested (Assemble) with id='zip-export'. Browser's native profile folder memory will handle path recall.",
        );
        const fileHandles = await window.showOpenFilePicker(pickerOpts);
        const fh = fileHandles[0];
        if (fh) {
          console.log(
            "[ZIP Picker] Success! File chosen for import under user-selected path! Target File: " +
              fh.name,
          );
          zipBlob = await fh.getFile();
          if (zipBlob) {
            console.log(
              "[ZIP Picker] Loaded file stream: Size = " +
                (zipBlob.size / 1024 / 1024).toFixed(2) +
                " MB",
            );
          }
        }
      } catch (e) {
        if (e.name === "AbortError") {
          console.log("[ZIP Picker] Open file picker canceled by user.");
        } else {
          console.warn("[ZIP Picker] Open file picker failed:", e);
        }
        return;
      }
    } else {
      zipBlob = await new Promise((resolve) => {
        let i = document.createElement("input");
        i.type = "file";
        i.accept = ".zip";
        i.onchange = (e) => resolve(e.target.files?.[0] || null);
        i.click();
      });
    }
    if (!zipBlob) return;
    if (!window.JSZip) {
      alert("JSZip library not found.");
      return;
    }

    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "flex";
    try {
      let zip = new window.JSZip();
      let unzipped = await zip.loadAsync(zipBlob);
      for (let name of Object.keys(unzipped.files)) {
        let fi = unzipped.files[name];
        if (!fi.dir && name.startsWith("frame_") && name.endsWith(".png")) {
          frameFiles.push({
            name,
            handle: {
              getFile: async () => {
                let ab = await fi.async("arraybuffer");
                return { arrayBuffer: async () => ab };
              },
            },
          });
        }
      }
    } catch (e) {
      console.error("ZIP read error", e);
      alert("Could not load ZIP.");
      if (overlay) overlay.style.display = "none";
      return;
    }
  } else if (pipeline === "local") {
    try {
      if (!window.showDirectoryPicker) throw new Error("Not supported");
      const dh = await window.showDirectoryPicker({
        id: "local-export",
        mode: "read",
      });
      for await (const [name, handle] of dh.entries()) {
        if (
          handle.kind === "file" &&
          name.startsWith("frame_") &&
          name.endsWith(".png")
        )
          frameFiles.push({ name, handle });
      }
    } catch (e) {
      if (e.message === "Not supported")
        alert("Local Disk access not supported.");
      return;
    }
  } else if (pipeline === "opfs") {
    try {
      const root = await navigator.storage.getDirectory();
      let dirs = [];
      for await (const [name, handle] of root.entries()) {
        if (handle.kind === "directory" && name.startsWith("sg_frames_"))
          dirs.push(handle);
      }
      if (dirs.length === 0) {
        alert("No saved OPFS frames.");
        return;
      }
      dirs.sort((a, b) => b.name.localeCompare(a.name));
      for await (const [name, handle] of dirs[0].entries()) {
        if (
          handle.kind === "file" &&
          name.startsWith("frame_") &&
          name.endsWith(".png")
        )
          frameFiles.push({ name, handle });
      }
    } catch (e) {
      console.error("OPFS read error", e);
      alert("Could not read OPFS.");
      return;
    }
  } else {
    alert("Pipeline must be OPFS, ZIP, or Disk to assemble.");
    return;
  }

  if (frameFiles.length === 0) {
    alert("No frames found.");
    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "none";
    return;
  }
  frameFiles.sort((a, b) => a.name.localeCompare(b.name));
  var detectedWidth = null;
  var detectedHeight = null;
  var firstBytes = null;
  try {
    var firstFile = await frameFiles[0].handle.getFile();
    var firstAb = await firstFile.arrayBuffer();
    firstBytes = new Uint8Array(firstAb);
    var dims = await parsePngResolution(firstBytes);
    if (dims) {
      detectedWidth = dims.width;
      detectedHeight = dims.height;
      console.log(
        "[FFmpeg] Decoded frame resolution from first file:",
        detectedWidth + "x" + detectedHeight,
      );
    }
  } catch (e) {
    console.warn(
      "[FFmpeg] Could not detect frame resolution, falling back to dropdown:",
      e.message,
    );
  }

  if (detectedWidth && detectedHeight) {
    syncResolutionsToUIDropdown(detectedWidth, detectedHeight);
  }

  recorderRef._recordingWidth = detectedWidth || appState.exportWidth || 1280;
  recorderRef._recordingHeight = detectedHeight || appState.exportHeight || 720;
  recorderRef._firstFrameBytes = firstBytes ? firstBytes.slice() : null;

  const overlay = document.getElementById("processing-overlay");
  overlay.style.display = "flex";
  const ffmpeg = await loadFFmpeg(
    (typeof appState !== "undefined" ? appState.exportFormat : null) || "webm",
    recorderRef,
    null,
  );
  if (!ffmpeg) {
    overlay.style.display = "none";
    return;
  }
  recorderRef._ffmpeg = ffmpeg;
  recorderRef._frameCount = frameFiles.length;

  const useChunked = shouldUseChunkedAssembly(
    frameFiles.length,
    recorderRef._recordingWidth,
    recorderRef._recordingHeight,
  );

  if (!useChunked) {
    for (var i = 0; i < frameFiles.length; i++) {
      var fname = "frame_" + String(i).padStart(6, "0") + ".png";
      var frameBytes;
      if (i === 0) {
        frameBytes = firstBytes;
      } else {
        var file = await frameFiles[i].handle.getFile();
        var ab = await file.arrayBuffer();
        frameBytes = new Uint8Array(ab);
      }
      await ffmpeg.writeFile(fname, frameBytes.slice());
    }
    await _assemble(
      null,
      frameFiles.length,
      recorderRef._recordingWidth,
      recorderRef._recordingHeight,
      ffmpeg,
      recorderRef,
      pipeline === "zip" ? "zip-to-video" : "stills-to-video",
    );
  } else {
    await _assemble(
      frameFiles,
      frameFiles.length,
      recorderRef._recordingWidth,
      recorderRef._recordingHeight,
      ffmpeg,
      recorderRef,
      pipeline === "zip" ? "zip-to-video" : "stills-to-video",
    );
  }
}

export async function assemble(
  ffmpeg,
  frameCount,
  recordedFrames,
  recordingWidth,
  recordingHeight,
  recorderRef,
) {
  recorderRef.isAssembling = true;
  clearAssemblyLogs();

  let frameFiles = null;

  if (recorderRef && recorderRef._dirHandle) {
    try {
      frameFiles = [];
      for await (const [name, handle] of recorderRef._dirHandle.entries()) {
        if (
          handle.kind === "file" &&
          name.startsWith("frame_") &&
          name.endsWith(".png")
        ) {
          frameFiles.push({ name, handle });
        }
      }
      frameFiles.sort((a, b) => a.name.localeCompare(b.name));
      console.log(
        `[FFmpeg] Retrieved ${frameFiles.length} frames from OPFS temporary directory.`,
      );
      frameCount = frameFiles.length;
    } catch (e) {
      console.error("[FFmpeg] Error querying temp frames from OPFS:", e);
    }
  }

  var firstBytes = null;
  if (frameFiles && frameFiles.length > 0) {
    try {
      var firstFile = await frameFiles[0].handle.getFile();
      var firstAb = await firstFile.arrayBuffer();
      firstBytes = new Uint8Array(firstAb);
    } catch (e) {
      console.error(
        "[FFmpeg] Failed to read 1st frame from OPFS directory for preview:",
        e,
      );
    }
  } else if (recordedFrames && recordedFrames.length > 0) {
    firstBytes = recordedFrames[0];
  }

  if (firstBytes) {
    recorderRef._firstFrameBytes = firstBytes.slice();
  }

  var detectedWidth = null;
  var detectedHeight = null;
  if (firstBytes) {
    var dims = await parsePngResolution(firstBytes);
    if (dims) {
      detectedWidth = dims.width;
      detectedHeight = dims.height;
      console.log(
        "[FFmpeg] Detected 1st frame resolution:",
        detectedWidth + "x" + detectedHeight,
      );
    }
  }

  var finalW =
    detectedWidth || recordingWidth || resolveRecordingResolution().width;
  var finalH =
    detectedHeight || recordingHeight || resolveRecordingResolution().height;

  const useChunked = shouldUseChunkedAssembly(frameCount, finalW, finalH);

  if (frameFiles && frameFiles.length > 0) {
    if (!useChunked) {
      for (var i = 0; i < frameCount; i++) {
        var fname = "frame_" + String(i).padStart(6, "0") + ".png";
        var frameBytes;
        if (i === 0) {
          frameBytes = firstBytes;
        } else {
          var file = await frameFiles[i].handle.getFile();
          var ab = await file.arrayBuffer();
          frameBytes = new Uint8Array(ab);
        }
        await ffmpeg.writeFile(fname, frameBytes.slice());
      }
      await _assemble(
        null,
        frameCount,
        finalW,
        finalH,
        ffmpeg,
        recorderRef,
        "three.js canvas-to-video",
      );
    } else {
      await _assemble(
        frameFiles,
        frameCount,
        finalW,
        finalH,
        ffmpeg,
        recorderRef,
        "three.js canvas-to-video",
      );
    }
  } else {
    if (!useChunked) {
      if (recordedFrames) {
        if (recordedFrames.length < frameCount) {
          console.warn(
            `[FFmpeg] Mismatch in short buffer: frameCount is ${frameCount}, but recordedFrames.length is ${recordedFrames.length}. Adjusting.`,
          );
          frameCount = recordedFrames.length;
        }
        for (var i = 0; i < frameCount; i++) {
          var fname = "frame_" + String(i).padStart(6, "0") + ".png";
          await ffmpeg.writeFile(fname, recordedFrames[i].slice());
        }
      }
      await _assemble(
        null,
        frameCount,
        finalW,
        finalH,
        ffmpeg,
        recorderRef,
        "three.js canvas-to-video",
      );
    } else {
      let externalFrameFiles = recordedFrames.map((bytes, index) => ({
        name: "frame_" + String(index).padStart(6, "0") + ".png",
        handle: {
          getFile: async () => {
            let ab = bytes.slice().buffer;
            return { arrayBuffer: async () => ab };
          },
        },
      }));
      await _assemble(
        externalFrameFiles,
        frameCount,
        finalW,
        finalH,
        ffmpeg,
        recorderRef,
        "three.js canvas-to-video",
      );
    }
  }
}

async function _assemble(
  externalFrameFiles,
  totalFrames,
  recordingWidth,
  recordingHeight,
  ffmpeg,
  recorderRef,
  mode = "canvas-to-video",
) {
  if (totalFrames === 0) {
    console.error("No frames.");
    recorderRef.isAssembling = false;
    return;
  }
  if (externalFrameFiles && externalFrameFiles.length < totalFrames) {
    console.warn(
      `[FFmpeg] Parameter totalFrames is ${totalFrames} but externalFrameFiles.length is ${externalFrameFiles.length}. Clamping to match.`,
    );
    totalFrames = externalFrameFiles.length;
  }
  console.log(`[FFmpeg] Activity Mode: ${mode}`);
  console.log("Assembling", totalFrames, "frames...");

  _assemblyStats = {
    mode,
    totalFrames,
    verifiedFrames: 0,
    missingFrames: 0,
    encodeStartTime: 0,
    encodeElapsed: 0,
    encodeProgress: 0,
    framesEncoded: 0,
    currentPhase: "Initializing",
    outputSize: "",
  };

  const overlay = document.getElementById("processing-overlay");
  const readyActions = document.getElementById("assembly-ready-actions");
  if (readyActions) readyActions.style.display = "none";
  const percentEl = document.getElementById("assembly-percent");
  const fill = document.getElementById("progress-fill");
  const previewCanvas = document.getElementById("preview-canvas");

  const targetW = recordingWidth || resolveRecordingResolution().width;
  const targetH = recordingHeight || resolveRecordingResolution().height;

  const alignedW = Math.floor(targetW / 2) * 2;
  const alignedH = Math.floor(targetH / 2) * 2;
  console.log(
    `[FFmpeg] Pipeline Stage: Verifying target dimensions ${targetW}x${targetH} -> Even aligned output resolution: ${alignedW}x${alignedH}`,
  );

  var ctx = null;
  if (previewCanvas) {
    previewCanvas.width = alignedW;
    previewCanvas.height = alignedH;
    previewCanvas.style.width = "100%";
    previewCanvas.style.height = "auto";
    previewCanvas.style.aspectRatio = `${alignedW} / ${alignedH}`;
    ctx = previewCanvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, alignedW, alignedH);
  }
  overlay.style.display = "flex";

  if (
    ctx &&
    recorderRef &&
    recorderRef._firstFrameBytes &&
    recorderRef._firstFrameBytes.byteLength > 0
  ) {
    try {
      var tBlob = new Blob([recorderRef._firstFrameBytes], {
        type: "image/png",
      });
      var tUrl = URL.createObjectURL(tBlob);
      var tImg = new Image();
      tImg.onload = function () {
        ctx.drawImage(tImg, 0, 0, alignedW, alignedH);
        URL.revokeObjectURL(tUrl);
        recorderRef._firstFrameBytes = null;
      };
      tImg.src = tUrl;
    } catch (err) {
      console.error(
        "[FFmpeg] Upstream first-frame preview generation failed:",
        err,
      );
    }
  }

  var oc = overlay.querySelector("div");
  if (oc) {
    oc.style.maxWidth = "800px";
    oc.style.padding = "32px";
    oc.style.height = "auto";
    oc.style.minHeight = "400px";
  }

  const params = getEncodingParams(alignedW, alignedH);
  const format = params.format;
  const fps = params.fps;
  const outputFile = params.outputFile;

  _assemblyStats.currentPhase = externalFrameFiles
    ? "Importing frames"
    : "Verifying frames";
  _updateAssemblyUI();

  var encodingInterval = setInterval(() => {
    if (_assemblyStats.encodeStartTime > 0)
      _assemblyStats.encodeElapsed =
        performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI();
  }, 500);

  if (externalFrameFiles) {
    let CHUNK_SIZE = 150;
    const pixelsPerFrame = alignedW * alignedH;
    if (pixelsPerFrame >= 3840 * 2160) {
      CHUNK_SIZE = 40; // 4K: keep WASM memory footprint exceptionally small
    } else if (pixelsPerFrame >= 2560 * 1440) {
      CHUNK_SIZE = 75; // 1440p: medium-small chunk batches
    } else if (pixelsPerFrame >= 1920 * 1080) {
      CHUNK_SIZE = 100; // 1080p: safe memory barrier chunks
    }
    const numChunks = Math.ceil(totalFrames / CHUNK_SIZE);
    let concatList = "";
    var framesProcessed = 0;
    _assemblyStats.chunkFramesProcessed = 0;
    _assemblyStats.encodeStartTime = performance.now();

    var doubleBuffer = [[], []];
    var doubleBufferLengths = [0, 0];
    var activeBufferIdx = 0;
    var loadIdx = 0;

    const preloadChunk = async (bufferIdx) => {
      let end = Math.min(loadIdx + CHUNK_SIZE, totalFrames);
      let ptr = 0;
      for (let i = loadIdx; i < end; i++) {
        try {
          if (!externalFrameFiles[i]) {
            console.warn(
              `[FFmpeg] externalFrameFiles[${i}] is undefined (total length: ${externalFrameFiles.length})`,
            );
            continue;
          }
          const file = await externalFrameFiles[i].handle.getFile();
          if (!file) {
            console.warn(`[FFmpeg] getFile() returned null for frame ${i}`);
            continue;
          }
          const buffer = await file.arrayBuffer();
          if (!buffer) {
            console.warn(
              `[FFmpeg] arrayBuffer() resolved to null/undefined for frame ${i}`,
            );
            continue;
          }
          doubleBuffer[bufferIdx][ptr] = new Uint8Array(buffer);
          ptr++;
        } catch (e) {
          console.error(`[FFmpeg] Failed to preload frame ${i}:`, e);
        }
      }
      doubleBufferLengths[bufferIdx] = ptr;
      loadIdx = end;
    };

    await preloadChunk(activeBufferIdx);

    for (let c = 0; c < numChunks; c++) {
      let framesInThisChunk = doubleBufferLengths[activeBufferIdx];

      // Grab and draw the first frame of each batch/chunk of the double-buffer upstream
      if (framesInThisChunk > 0 && ctx) {
        var firstChunkFrame = doubleBuffer[activeBufferIdx][0];
        if (firstChunkFrame) {
          try {
            var tBlob = new Blob([firstChunkFrame], { type: "image/png" });
            var tUrl = URL.createObjectURL(tBlob);
            var tImg = new Image();
            tImg.onload = function () {
              ctx.drawImage(tImg, 0, 0, alignedW, alignedH);
              URL.revokeObjectURL(tUrl);
            };
            tImg.src = tUrl;
          } catch (blobErr) {
            console.error(
              `[FFmpeg] Preview first-of-batch generation failed:`,
              blobErr,
            );
          }
        }
      }

      for (let i = 0; i < framesInThisChunk; i++) {
        var frameData = doubleBuffer[activeBufferIdx][i];
        if (!frameData) {
          console.error(
            `[FFmpeg] Frame data is NULL/UNDEFINED in activeBufferIdx ${activeBufferIdx} at index ${i}. framesInThisChunk was ${framesInThisChunk}.`,
          );
          continue;
        }
        await ffmpeg.writeFile(
          "frame_" + String(i).padStart(6, "0") + ".png",
          frameData,
        );
      }

      let chunkName = "chunk_" + c + (format === "mp4" ? ".mp4" : ".webm");
      concatList += "file '" + chunkName + "'\n";
      let chunkArgs = buildChunkArgs(
        framesInThisChunk,
        alignedW,
        alignedH,
        chunkName,
      );

      let nextBufferIdx = (activeBufferIdx + 1) % 2;
      let preloadPromise =
        c + 1 < numChunks ? preloadChunk(nextBufferIdx) : null;
      await ffmpeg.exec(chunkArgs);
      for (let i = 0; i < framesInThisChunk; i++) {
        try {
          await ffmpeg.deleteFile(
            "frame_" + String(i).padStart(6, "0") + ".png",
          );
        } catch (e) {}
      }
      framesProcessed += framesInThisChunk;
      _assemblyStats.chunkFramesProcessed = framesProcessed;
      if (preloadPromise) await preloadPromise;
      activeBufferIdx = nextBufferIdx;
    }

    if (numChunks === 1) {
      var onlyChunk = "chunk_0." + (format === "mp4" ? "mp4" : "webm");
      try {
        if (format === "mp4") {
          await ffmpeg.exec([
            "-i",
            onlyChunk,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            outputFile,
          ]);
        } else {
          await ffmpeg.exec(["-i", onlyChunk, "-c", "copy", outputFile]);
        }
      } catch (e) {
        console.warn("[FFmpeg] Copy failed, using chunk directly:", e.message);
      }
      try {
        await ffmpeg.deleteFile(onlyChunk);
      } catch (e) {}
    } else {
      await ffmpeg.writeFile(
        "mylist.txt",
        new TextEncoder().encode(concatList),
      );
      const concatArgs = buildConcatArgs("mylist.txt", format, outputFile);
      await ffmpeg.exec(concatArgs);
      for (let c = 0; c < numChunks; c++) {
        try {
          await ffmpeg.deleteFile(
            "chunk_" + c + (format === "mp4" ? ".mp4" : ".webm"),
          );
        } catch (e) {}
      }
    }

    _assemblyStats.encodeProgress = 100;
    if (percentEl) percentEl.textContent = "100%";
    if (fill) fill.style.width = "100%";
    _assemblyStats.currentPhase = "Encoding complete";
    _assemblyStats.encodeElapsed =
      performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI();
    clearInterval(encodingInterval);
  } else {
    var missingFrames = [];
    var loadedCount = 0;
    for (var i = 0; i < totalFrames; i++) {
      var fname = "frame_" + String(i).padStart(6, "0") + ".png";
      try {
        var checkData = await ffmpeg.readFile(fname);
        if (!checkData || checkData.length === 0) throw new Error("empty");
        loadedCount++;
        _assemblyStats.verifiedFrames = loadedCount;

        if (i === 0 && ctx && checkData) {
          try {
            var tBlob = new Blob([checkData], { type: "image/png" });
            var tUrl = URL.createObjectURL(tBlob);
            var tImg = new Image();
            tImg.onload = function () {
              ctx.drawImage(tImg, 0, 0, alignedW, alignedH);
              URL.revokeObjectURL(tUrl);
            };
            tImg.src = tUrl;
          } catch (blobErr) {
            console.error(
              `[FFmpeg] Short buffer first frame preview failed:`,
              blobErr,
            );
          }
        }

        if (i % 10 === 0 || i === totalFrames - 1) {
          _assemblyStats.encodeProgress = Math.round(
            ((i + 1) / totalFrames) * 100,
          );
          _updateAssemblyUI();
        }
      } catch (e) {
        missingFrames.push({ index: i });
      }
    }
    _assemblyStats.missingFrames = missingFrames.length;
    if (missingFrames.length > totalFrames * 0.5) {
      console.error("Too many missing frames.");
      recorderRef.isAssembling = false;
      if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
        console.log(
          "[FFmpeg] Returning canvas size back to normal viewing resolution on abort.",
        );
        recorderRef._restoreCanvasSize();
      }
      if (recorderRef && recorderRef._dirHandle) {
        try {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry(recorderRef._dirHandle.name, {
            recursive: true,
          });
          recorderRef._dirHandle = null;
        } catch (e) {
          console.error(
            "[FFmpeg] Failed to delete temporary directory on abort:",
            e,
          );
        }
      }
      setTimeout(() => {
        overlay.style.display = "none";
      }, 3000);
      return;
    }

    _assemblyStats.currentPhase = "Encoding video";
    _assemblyStats.encodeProgress = 20;
    _assemblyStats.encodeStartTime = performance.now();
    _updateAssemblyUI();

    const args = buildAssemblyArgs(alignedW, alignedH, outputFile);
    console.log(
      "[FFmpeg] Assembly:",
      format.toUpperCase(),
      "Args:",
      args.join(" "),
    );
    try {
      await Promise.race([
        ffmpeg.exec(args),
        new Promise((_, r) =>
          setTimeout(() => r(new Error("Timeout")), 300000),
        ),
      ]);
    } catch (e) {
      console.error("Encode failed:", e);
    }
    clearInterval(encodingInterval);
    _assemblyStats.currentPhase = "Encoding complete";
    _assemblyStats.encodeProgress = 100;
    _assemblyStats.encodeElapsed =
      performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI();
  }

  try {
    if (!ffmpeg) throw new Error("FFmpeg instance unavailable");
    const data = await ffmpeg.readFile(outputFile);
    console.log(
      "[FFmpeg] Output:",
      (data.byteLength / 1024 / 1024).toFixed(2),
      "MB",
    );
    const blob = new Blob([data], {
      type: format === "mp4" ? "video/mp4" : "video/webm",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "sg_lab_render_" + Date.now() + "." + (format === "mp4" ? "mp4" : "webm");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    _assemblyStats.outputSize =
      (data.byteLength / 1024 / 1024).toFixed(2) + " MB";
    _assemblyStats.currentPhase = "Download ready";
    _updateAssemblyUI();
  } catch (e) {
    console.error("Download failed:", e.message || e);
    _assemblyStats.currentPhase =
      "Download failed: " + (e.message || "unknown error");
    _updateAssemblyUI();
  }

  for (let i = 0; i < totalFrames; i++) {
    try {
      await ffmpeg.deleteFile("frame_" + String(i).padStart(6, "0") + ".png");
    } catch (e) {}
  }
  try {
    await ffmpeg.deleteFile(outputFile);
  } catch (e) {}

  if (recorderRef && recorderRef._dirHandle) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(recorderRef._dirHandle.name, { recursive: true });
      console.log(
        `[FFmpeg] Deleted temporary OPFS directory after video output: ${recorderRef._dirHandle.name}`,
      );
      recorderRef._dirHandle = null;
    } catch (e) {
      console.warn("[FFmpeg] Failed to delete temporary directory:", e);
    }
  }

  recorderRef.isAssembling = false;
  recorderRef._recordedFrames = [];
  if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
    console.log(
      "[FFmpeg] Returning canvas size back to normal viewing resolution.",
    );
    recorderRef._restoreCanvasSize();
  }
  if (document.getElementById("assembly-ready-actions"))
    document.getElementById("assembly-ready-actions").style.display = "flex";
  console.log("[FFmpeg] Assembly complete.");
  console.log("=== FINAL TELEMETRY ===");
  if (recorderRef.getTelemetry) recorderRef.getTelemetry();
}
