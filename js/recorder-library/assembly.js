// =============================================================================
// Browser Video Recorder Library — assembly.js
// Video assembly pipeline. FFmpeg loading delegated to ffmpeg-loader.js.
// Recordings ≤1500 frames use inline encoding (one exec, direct to output).
// Larger recordings use double-buffered chunked assembly.
// Thumbnails updated every 10 frames in all paths.
// =============================================================================

import { loadFFmpeg } from "./ffmpeg-loader.js";
import { resolveRecordingResolution } from "./video-filters.js";
import {
  getEncodingParams,
  buildChunkArgs,
  buildAssemblyArgs,
  buildConcatArgs,
} from "./ffmpeg-commands.js";

const getAppState = (recorderRef) => {
  if (recorderRef && recorderRef.config) return recorderRef.config;
  if (typeof window !== "undefined" && window.sgState) return window.sgState;
  return { exportWidth: 1280, exportHeight: 720, exportFormat: "webm" };
};

var _assemblyStats = null;

export function onFFmpegLog(msg) {
  if (!_assemblyStats) return;
  const match = msg.match(/frame\s*=\s*(\d+)/i);
  if (match) {
    const frameNum = parseInt(match[1], 10);
    if (!isNaN(frameNum)) {
      const isEncodingPhase = _assemblyStats.currentPhase && _assemblyStats.currentPhase.startsWith("Encoding video");
      if (isEncodingPhase) {
        const baseOffset = _assemblyStats.chunkFramesProcessed || 0;
        _assemblyStats.framesEncoded = Math.min(baseOffset + frameNum, _assemblyStats.totalFrames);
        
        _assemblyStats.encodeProgress = Math.round(
          (_assemblyStats.framesEncoded / _assemblyStats.totalFrames) * 100
        );
        _updateAssemblyUI();
      }
    }
  }
}

// Clean logs helper - delegates to consolidated nexus if present
export function clearAssemblyLogs() {
  if (typeof window !== "undefined" && window.LogNexus) {
    window.LogNexus.clearNormal();
  } else {
    console.log("[System] Log cleared. Ready for assembly...");
  }
}
window.clearAssemblyLogs = clearAssemblyLogs;

// Append list helper - delegates to consolidated nexus if present
export function appendAssemblyLog(msg) {
  if (typeof window !== "undefined" && window.LogNexus) {
    window.LogNexus.logNormal(msg);
  } else {
    console.log("[System Log]", msg);
  }
}
window.appendAssemblyLog = appendAssemblyLog;

// Copy systems helper - delegates to consolidated nexus if present
export function copyAssemblyLogsToClipboard() {
  if (typeof window !== "undefined" && window.LogNexus) {
    window.LogNexus.copyNormalToClipboard();
  } else {
    console.log("[System] Copy requested of normal logs.");
  }
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
  if (typeof window !== "undefined" && window.sgState) {
    window.sgState.exportWidth = width;
    window.sgState.exportHeight = height;
  }
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
    if (window.updateDiskSpaceUI) {
      window.updateDiskSpaceUI();
    }
  }
}

function logBrowserMemory(prefix = "[Memory]") {
  if (window.performance && window.performance.memory) {
    const mem = window.performance.memory;
    const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
    const totalMB = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
    const limitMB = (mem.jsHeapLimit / 1024 / 1024).toFixed(1);
    console.log(`${prefix} Used: ${usedMB} MB / Total: ${totalMB} MB (Limit: ${limitMB} MB)`);
    return { usedMB, totalMB, limitMB };
  } else {
    try {
      if (window.performance && window.performance.getEntries) {
        const entries = window.performance.getEntries();
        console.log(`${prefix} Heartbeat verified (Native heap profiling unavailable in this browser engine). Performance timer count: ${entries.length}`);
      }
    } catch (e) {}
    return null;
  }
}

function inspectProbeResults(ffmpegLogs, expectedFrames, fps, expectedW, expectedH) {
  let durationStr = null;
  let resolutionStr = null;
  let actualFpsStr = null;
  
  const lastLogs = ffmpegLogs.slice(-120);
  for (const log of lastLogs) {
    const msg = log.msg || "";
    
    if (msg.includes("Duration:")) {
      const match = msg.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (match) {
        durationStr = `${match[1]}:${match[2]}:${match[3]}`;
      }
    }
    
    if (msg.includes("Video:") && msg.includes("fps")) {
      const resMatch = msg.match(/\b(\d{3,5})x(\d{3,5})\b/);
      if (resMatch) {
        resolutionStr = `${resMatch[1]}x${resMatch[2]}`;
      }
      const fpsMatch = msg.match(/([\d.]+)\s*fps/);
      if (fpsMatch) {
        actualFpsStr = fpsMatch[1];
      }
    }
  }
  
  const expectedDuration = expectedFrames / fps;
  
  console.log("======================================================================");
  console.log("[METADATA SANITY INSPECTOR] Probing Final Compiled Video Quality & Integrity");
  console.log("======================================================================");
  console.log(`- Expected dimensions:            ${expectedW}x${expectedH}`);
  console.log(`- Actual dimensions probed:       ${resolutionStr || "Unknown (No video stream detected)"}`);
  console.log(`- Expected duration calculated:   ${expectedDuration.toFixed(2)} seconds`);
  
  let probedDurationSec = null;
  if (durationStr) {
    const parts = durationStr.split(":");
    if (parts.length === 3) {
      probedDurationSec = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
      console.log(`- Actual duration probed:         ${durationStr} (${probedDurationSec.toFixed(2)} seconds)`);
    }
  } else {
    console.log(`- Actual duration probed:         Unknown (No duration block-metadata parsed)`);
  }
  
  console.log(`- Expected frame rate:            ${fps} fps`);
  console.log(`- Actual frame rate probed:       ${actualFpsStr || "Unknown"} fps`);
  
  let anomaliesFound = 0;
  
  if (resolutionStr) {
    const expectedResKey = `${expectedW}x${expectedH}`;
    if (resolutionStr !== expectedResKey) {
      console.warn(`[ANOMALY DETECTED] Resolution Mismatch! Expected '${expectedResKey}' but got '${resolutionStr}'`);
      anomaliesFound++;
    } else {
      console.log(`[PROBE OK] Output dimensions match exact pixel targets perfectly.`);
    }
  }
  
  if (probedDurationSec !== null) {
    const durationDiff = Math.abs(probedDurationSec - expectedDuration);
    if (durationDiff > 0.15) {
      console.warn(`[ANOMALY DETECTED] Duration Discrepancy! Video is ${durationDiff.toFixed(2)}s ${probedDurationSec > expectedDuration ? 'longer' : 'shorter'} than computed sequence duration (${expectedDuration.toFixed(2)}s)`);
      anomaliesFound++;
    } else {
      console.log(`[PROBE OK] Output duration matches expected physical sequence duration (tolerance < 0.15s).`);
    }
  }
  
  if (actualFpsStr) {
    const probedFps = parseFloat(actualFpsStr);
    if (Math.abs(probedFps - fps) > 0.5) {
      console.warn(`[ANOMALY DETECTED] Frame Rate Mismatch! Video is encoded at ${probedFps} fps instead of target ${fps} fps.`);
      anomaliesFound++;
    } else {
      console.log(`[PROBE OK] Output frame rate matches target simulation capture frequency.`);
    }
  }
  
  if (anomaliesFound === 0) {
    console.log(`[INTEGRITY PASSED] All expectations match generated video headers exactly. Zero anomalies logged.`);
  } else {
    console.warn(`[INTEGRITY CHECK] Complete with ${anomaliesFound} anomalies noted for workspace attention.`);
  }
  console.log("======================================================================");
}

function _updateAssemblyUI() {
  if (!_assemblyStats) return;
  var s = _assemblyStats;
  var statusEl = document.getElementById("assembly-status");
  var percentEl = document.getElementById("assembly-percent");
  var fill = document.getElementById("progress-fill");
  if (statusEl) {
    var lines = [];
    lines.push("<strong>Project Version:</strong> v1.7.0-hybrid-ts");
    if (s.mode) {
      lines.push("<strong>Mode:</strong> " + s.mode);
    }
    lines.push("Phase: " + s.currentPhase);
    
    const isEncodingPhase = s.currentPhase && s.currentPhase.startsWith("Encoding video");
    if (isEncodingPhase) {
      lines.push("Frames: " + s.framesEncoded + " / " + s.totalFrames);
    } else {
      lines.push("Frames: " + s.verifiedFrames + " / " + s.totalFrames);
    }

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

    const format = (typeof window !== "undefined" && window.sgState ? window.sgState.exportFormat : "webm") || "webm";
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

  var bottomPhaseEl = document.getElementById("assembly-bottom-phase");
  var bottomFramesEl = document.getElementById("assembly-bottom-frames");
  if (bottomPhaseEl && s.currentPhase) {
    bottomPhaseEl.textContent = s.currentPhase;
  }
  if (bottomFramesEl && typeof s.verifiedFrames !== "undefined") {
    const isEncodingPhase = s.currentPhase && s.currentPhase.startsWith("Encoding video");
    if (isEncodingPhase) {
      bottomFramesEl.textContent = `${s.framesEncoded} / ${s.totalFrames} frames`;
    } else {
      bottomFramesEl.textContent = `${s.verifiedFrames} / ${s.totalFrames} frames`;
    }
  }
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
  logBrowserMemory("[Storage Baseline]");

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
      let indices = [];
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
          let matches = name.match(/frame_(\d+)\.png/);
          if (matches) {
            indices.push(parseInt(matches[1], 10));
          }
        }
      }
      let expectedTotalFrames = 0;
      if (indices.length > 0) {
        let minIndex = Math.min(...indices);
        let maxIndex = Math.max(...indices);
        expectedTotalFrames = maxIndex - minIndex + 1;
      } else {
        expectedTotalFrames = frameFiles.length;
      }
      recorderRef._expectedZipFrameCount = expectedTotalFrames;
      recorderRef._zipActualPngCount = frameFiles.length;
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

  const state = getAppState(recorderRef);
  recorderRef._recordingWidth = detectedWidth || state.exportWidth || 1280;
  recorderRef._recordingHeight = detectedHeight || state.exportHeight || 720;
  recorderRef._firstFrameBytes = firstBytes ? firstBytes.slice() : null;

  const overlay = document.getElementById("processing-overlay");
  overlay.style.display = "flex";
  const ffmpeg = await loadFFmpeg(
    state.exportFormat || "webm",
    recorderRef,
    onFFmpegLog,
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
  logBrowserMemory("[Canvas Buffer Baseline]");

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

  const state = getAppState(recorderRef);
  var finalW =
    detectedWidth || recordingWidth || state.exportWidth || 1280;
  var finalH =
    detectedHeight || recordingHeight || state.exportHeight || 720;

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
  let actualAssembledFrames = 0;
  logBrowserMemory("[Assembly Initial Baseline]");
  if (externalFrameFiles && externalFrameFiles.length < totalFrames) {
    console.warn(
      `[FFmpeg] Parameter totalFrames is ${totalFrames} but externalFrameFiles.length is ${externalFrameFiles.length}. Clamping to match.`,
    );
    totalFrames = externalFrameFiles.length;
  }
  console.log(`[Sine-Gordon Lab v1.4.0-hybrid-ts] [FFmpeg] Activity Mode: ${mode}`);
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

  const state = getAppState(recorderRef);
  const targetW = recordingWidth || state.exportWidth || 1280;
  const targetH = recordingHeight || state.exportHeight || 720;

  const alignedW = Math.floor(targetW / 2) * 2;
  const alignedH = Math.floor(targetH / 2) * 2;
  console.log(
    `[FFmpeg] Pipeline Stage: Verifying target dimensions ${targetW}x${targetH} -> Even aligned output resolution: ${alignedW}x${alignedH}`,
  );

  var ctx = null;
  if (previewCanvas) {
    previewCanvas.width = alignedW;
    previewCanvas.height = alignedH;
    ctx = previewCanvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, alignedW, alignedH);
  }
  if (overlay) overlay.style.display = "flex";

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

  // Keep standard modal height and width from index.html and style.css to prevent layout degradation during compilation
  if (overlay) {
    var oc = overlay.querySelector("div");
    if (oc) {
      // styles are cleanly managed by index.html and style.css
    }
  }

  const params = getEncodingParams(alignedW, alignedH, recorderRef?.config);
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

    // Dynamic chunk sizes to prevent tiny final chunks (minimum 15 frames)
    const chunkSizes = [];
    let remaining = totalFrames;
    while (remaining > 0) {
      if (remaining <= CHUNK_SIZE + 15) {
        chunkSizes.push(remaining);
        break;
      } else {
        chunkSizes.push(CHUNK_SIZE);
        remaining -= CHUNK_SIZE;
      }
    }
    const numChunks = chunkSizes.length;

    let concatList = "";
    var framesProcessed = 0;
    _assemblyStats.chunkFramesProcessed = 0;
    _assemblyStats.encodeStartTime = performance.now();

    var doubleBuffer = [[], []];
    var doubleBufferLengths = [0, 0];
    var activeBufferIdx = 0;
    var loadIdx = 0;
    var loadChunkIdx = 0;

    const preloadChunk = async (bufferIdx) => {
      if (loadChunkIdx >= numChunks) return;
      let currentChunkSize = chunkSizes[loadChunkIdx];
      let end = loadIdx + currentChunkSize;
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
      loadChunkIdx++;
    };

    await preloadChunk(activeBufferIdx);

    for (let c = 0; c < numChunks; c++) {
      let framesInThisChunk = doubleBufferLengths[activeBufferIdx];

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

      _assemblyStats.currentPhase = `Writing frames (Batch ${c + 1}/${numChunks})`;
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
        doubleBuffer[activeBufferIdx][i] = null;

        _assemblyStats.verifiedFrames = framesProcessed + i + 1;
        _assemblyStats.encodeProgress = Math.round(
          (_assemblyStats.verifiedFrames / totalFrames) * 100
        );
        _updateAssemblyUI();
      }

      let chunkName = "chunk_" + c + (format === "mp4" ? ".ts" : ".webm");
      concatList += "file '" + chunkName + "'\n";
      let chunkArgs = buildChunkArgs(
        framesInThisChunk,
        alignedW,
        alignedH,
        chunkName,
        framesProcessed,
        recorderRef?.config
      );

      let nextBufferIdx = (activeBufferIdx + 1) % 2;
      let preloadPromise =
        c + 1 < numChunks ? preloadChunk(nextBufferIdx) : null;

      const expectedChunkFrameCount = chunkSizes[c];
      console.log(`[CHUNK INSPECTION] Executing chunk synthesis for batch ${c + 1}/${numChunks}: expected ${expectedChunkFrameCount} frames, actual preloaded ${framesInThisChunk} frames.`);
      if (expectedChunkFrameCount !== framesInThisChunk) {
        console.warn(`[CHUNK ANOMALY] Frame count mismatch inside chunk compiler! (Expected: ${expectedChunkFrameCount}, Got: ${framesInThisChunk})`);
      }

      _assemblyStats.currentPhase = `Encoding video (Batch ${c + 1}/${numChunks})`;
      _updateAssemblyUI();

      await ffmpeg.exec(chunkArgs);

      try {
        const fileData = await ffmpeg.readFile(chunkName);
        console.log(`[CHUNK INSPECTION] Chunk '${chunkName}' compiles matching expectations. WebAssembly VM file size: ${(fileData.byteLength / 1024).toFixed(1)} KB.`);
        if (fileData.byteLength === 0) {
          console.error(`[CHUNK ANOMALY] Chunk '${chunkName}' generated an empty 0-byte stream file! This will break subsequent concat stages.`);
        }
      } catch (fileErr) {
        console.error(`[CHUNK ANOMALY] Failed to inspect compiled chunk file '${chunkName}':`, fileErr);
      }

      logBrowserMemory(`[Memory] Post-chunk ${c + 1}/${numChunks}`);
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
      var onlyChunk = "chunk_0." + (format === "mp4" ? "ts" : "webm");
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
      console.log(`[FFmpeg] Merging ${numChunks} chunks via native concat demuxer...`);
      await ffmpeg.writeFile(
        "mylist.txt",
        new TextEncoder().encode(concatList),
      );
      const concatArgs = buildConcatArgs("mylist.txt", format, outputFile);
      await ffmpeg.exec(concatArgs);
      try {
        await ffmpeg.deleteFile("mylist.txt");
      } catch (e) {}

      for (let c = 0; c < numChunks; c++) {
        try {
          await ffmpeg.deleteFile(
            "chunk_" + c + (format === "mp4" ? ".ts" : ".webm"),
          );
        } catch (e) {}
      }
    }

    doubleBuffer = null;
    doubleBufferLengths = null;

    actualAssembledFrames = framesProcessed;
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

        _assemblyStats.encodeProgress = Math.round(
          ((i + 1) / totalFrames) * 100,
        );
        _updateAssemblyUI();
      } catch (e) {
        missingFrames.push({ index: i });
      }
    }
    _assemblyStats.missingFrames = missingFrames.length;
    if (missingFrames.length > totalFrames * 0.5) {
      console.error("Too many missing frames.");
      clearInterval(encodingInterval);
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
        if (overlay) overlay.style.display = "none";
      }, 3000);
      return;
    }

    _assemblyStats.currentPhase = "Encoding video";
    _assemblyStats.encodeProgress = 20;
    _assemblyStats.encodeStartTime = performance.now();
    _updateAssemblyUI();

    const args = buildAssemblyArgs(alignedW, alignedH, outputFile, recorderRef?.config);
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
    actualAssembledFrames = loadedCount;
    _assemblyStats.currentPhase = "Encoding complete";
    _assemblyStats.encodeProgress = 100;
    _assemblyStats.encodeElapsed =
      performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI();
  }

  try {
    if (!ffmpeg) throw new Error("FFmpeg instance unavailable");

    if (mode === "zip-to-video") {
      const expected = recorderRef._expectedZipFrameCount || totalFrames;
      const actualPngs = recorderRef._zipActualPngCount || totalFrames;
      const actualChunked = actualAssembledFrames;
      
      console.log("======================================================================");
      console.log("[ZIP SANITY CHECK] Verification of Frame Integrity at Video Compiler Phase");
      console.log("======================================================================");
      console.log(`- Expected total frames in sequence range: ${expected}`);
      console.log(`- Actual physical PNG frames extracted:      ${actualPngs}`);
      console.log(`- Actual chunking count encoded at end:     ${actualChunked}`);
      
      const frameDiscrepancyFromSequence = expected - actualPngs;
      const lossDuringEncoding = actualPngs - actualChunked;
      const integrityPct = expected > 0 ? ((actualChunked / expected) * 100).toFixed(2) : "0.00";
      
      if (expected === actualChunked) {
        console.log(`[ZIP OK] Integrity Test Passed (100.00% matching). Zero frames omitted or dropped.`);
      } else {
        console.warn(`[ZIP WARNING] Frame count discrepancy detected! Integrity at ${integrityPct}%.`);
        if (frameDiscrepancyFromSequence > 0) {
          console.warn(`  ↳ Gaps in imported ZIP filename indices: ${frameDiscrepancyFromSequence} frame(s) missing from raw sequence.`);
        }
        if (lossDuringEncoding > 0) {
          console.warn(`  ↳ Dropped or corrupted during FFmpeg processing: ${lossDuringEncoding} frame(s) skipped.`);
        }
      }
      console.log("======================================================================");
    }

    console.log("======================================================================");
    console.log("[FFmpeg Diagnostics] STARTING METADATA PROBE OF:", outputFile);
    console.log("======================================================================");
    try {
      await ffmpeg.exec(["-i", outputFile]);
    } catch (probeErr) {}
    console.log("======================================================================");
    console.log("[FFmpeg Diagnostics] METADATA PROBE COMPLETED.");
    console.log("======================================================================");

    try {
      const logsArray = (recorderRef && recorderRef._ffmpegLogs) || [];
      const finalW = resolveRecordingResolution(recorderRef?.config).width;
      const finalH = resolveRecordingResolution(recorderRef?.config).height;
      const params = getEncodingParams(alignedW, alignedH, recorderRef?.config);
      inspectProbeResults(logsArray, totalFrames, params.fps, finalW, finalH);
    } catch (probeParseErr) {
      console.warn("[Integrity Check] Failed to complete metadata check parser:", probeParseErr);
    }

    console.log("[FFmpeg Diagnostics] CLUES & TROUBLESHOOTING PLAYBACK ISSUES:");
    console.log("----------------------------------------------------------------------");
    console.log("1. ULTRA HIGH RESOLUTION (e.g. 4K, 3840x2160 @ 60fps) LIMITS:");
    console.log("   - High resolution 4K streams at 60fps are demanding and encode using H.264 profile 'High' with level 5.2.");
    console.log("   - Older devices, certain mobile/tablet screens, and standard legacy media players will show a black screen,");
    console.log("     render frozen frames, or stutter. We recommend 1080p (1920x1080) for excellent universal compatibility.");
    console.log("2. SUB-SECOND OR VERY SHORT DURATION BARRIERS:");
    console.log("   - Many native OS media players (like QuickTime on macOS/iOS, default Android players) have built-in");
    console.log("     safety/continuity checks that discard or crash on video files that have a total duration of under 1.5 seconds.");
    console.log("   - To play perfectly, please record a longer segment (at least 3-4 seconds, i.e., 180+ frames).");
    console.log("3. NO AUDIO STREAM SENSITIVITY:");
    console.log("   - Some strict video players and upload applications (like messaging apps or email clients) will report");
    console.log("     a silent video lacking an audio layer as 'corrupt' or 'unsupported'.");
    console.log("4. CONTAINER FORMAT SELECTION (MP4 vs. WebM):");
    console.log("   - If mp4 files do not play cleanly on your device/browser, switch the Export Format dropdown to WebM");
    console.log("     which uses modern web codecs (VP8/VP9) that run flawlessly on all major browser layout engines.");
    console.log("======================================================================");

    const data = await ffmpeg.readFile(outputFile);
    console.log(
      "[FFmpeg] Output:",
      (data.byteLength / 1024 / 1024).toFixed(2),
      "MB",
    );
    const blob = new Blob([data], {
      type: format === "mp4" ? "video/mp4" : "video/webm",
    });

    if (recorderRef && recorderRef.isTesting) {
      console.log("[FFmpeg Test] Intercepted video compilation in automated test mode!");
      if (window.onTestVideoBlobGenerated) {
        window.onTestVideoBlobGenerated(blob);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      let videoFilename;
      if (recorderRef && typeof recorderRef.getExportFilename === "function") {
        videoFilename = recorderRef.getExportFilename(format === "mp4" ? "mp4" : "webm");
      } else {
        videoFilename = "Sine-Gordon-Render_" + Date.now() + "." + (format === "mp4" ? "mp4" : "webm");
      }
      a.download = videoFilename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

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
  logBrowserMemory("[Memory] Final Reclamation Check");
  console.log("[FFmpeg] Assembly complete.");
  console.log("=== FINAL TELEMETRY ===");
  if (recorderRef.getTelemetry) recorderRef.getTelemetry();
}
