// =============================================================================
// sine-gordon-lab — js/assembly.js
// Video assembly pipeline. FFmpeg loading delegated to ffmpeg-loader.js.
// Recordings ≤150 frames use inline encoding (one exec, direct to output).
// Larger recordings use double-buffered chunked assembly.
// Thumbnails updated every 10 frames in all paths.
// =============================================================================

import { sgState as appState } from "../core/state.js";
import { loadFFmpeg } from "./ffmpeg-loader.js";

function resolveRecordingResolution() {
  var w = (typeof appState !== 'undefined' ? appState.exportWidth : 1280) || 1280;
  var h = (typeof appState !== 'undefined' ? appState.exportHeight : 720) || 720;
  return {
    width: Math.floor(w / 16) * 16,
    height: h
  };
}

var _assemblyStats = null;

function _updateAssemblyUI() {
  if (!_assemblyStats) return;
  var s = _assemblyStats;
  var statusEl = document.getElementById("assembly-status");
  var percentEl = document.getElementById("assembly-percent");
  var fill = document.getElementById("progress-fill");
  if (statusEl) {
    var lines = [];
    lines.push("Phase: " + s.currentPhase);
    lines.push("Frames: " + s.verifiedFrames + " / " + s.totalFrames);
    if (s.missingFrames > 0) lines.push("Missing: " + s.missingFrames);
    if (s.encodeElapsed > 0) {
      var sec = (s.encodeElapsed / 1000).toFixed(1);
      lines.push("Elapsed: " + sec + "s");
      if (s.encodeProgress > 0 && s.encodeProgress < 100) {
        var remaining = (s.encodeElapsed / s.encodeProgress) * (100 - s.encodeProgress);
        lines.push("Remaining: ~" + (remaining / 1000).toFixed(1) + "s");
      }
    }
    if (s.outputSize) lines.push("Output: " + s.outputSize);
    statusEl.innerHTML = lines.join("<br>");
  }
  if (percentEl) percentEl.textContent = s.encodeProgress + "%";
  if (fill) fill.style.width = s.encodeProgress + "%";
}

export async function assembleFromStorage(pipeline, recorderRef) {
  if (recorderRef.isAssembling) return;
  
  let frameFiles = [];
  
  if (pipeline === "zip") {
    let zipBlob = null;
    if (window.showOpenFilePicker) {
      try { const [fh] = await window.showOpenFilePicker({ id: 'zip-export', types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }], multiple: false }); zipBlob = await fh.getFile(); } catch (e) { return; }
    } else {
      zipBlob = await new Promise((resolve) => { let i = document.createElement("input"); i.type = "file"; i.accept = ".zip"; i.onchange = (e) => resolve(e.target.files?.[0] || null); i.click(); });
    }
    if (!zipBlob) return;
    if (!window.JSZip) { alert("JSZip library not found."); return; }
    
    const overlay = document.getElementById("processing-overlay"); if (overlay) overlay.style.display = "flex";
    try {
      let zip = new window.JSZip();
      let unzipped = await zip.loadAsync(zipBlob);
      for (let name of Object.keys(unzipped.files)) {
        let fi = unzipped.files[name];
        if (!fi.dir && name.startsWith("frame_") && name.endsWith(".png")) {
          frameFiles.push({ name, handle: { getFile: async () => { let ab = await fi.async("arraybuffer"); return { arrayBuffer: async () => ab }; } } });
        }
      }
    } catch (e) { console.error("ZIP read error", e); alert("Could not load ZIP."); if (overlay) overlay.style.display = "none"; return; }
  } else if (pipeline === "local") {
    try {
      if (!window.showDirectoryPicker) throw new Error("Not supported");
      const dh = await window.showDirectoryPicker({ id: 'local-export', mode: 'read' });
      for await (const [name, handle] of dh.entries()) { if (handle.kind === "file" && name.startsWith("frame_") && name.endsWith(".png")) frameFiles.push({ name, handle }); }
    } catch(e) { if (e.message === "Not supported") alert("Local Disk access not supported."); return; }
  } else if (pipeline === "opfs") {
    try {
      const root = await navigator.storage.getDirectory();
      let dirs = [];
      for await (const [name, handle] of root.entries()) { if (handle.kind === "directory" && name.startsWith("sg_frames_")) dirs.push(handle); }
      if (dirs.length === 0) { alert("No saved OPFS frames."); return; }
      dirs.sort((a,b) => b.name.localeCompare(a.name));
      for await (const [name, handle] of dirs[0].entries()) { if (handle.kind === "file" && name.startsWith("frame_") && name.endsWith(".png")) frameFiles.push({ name, handle }); }
    } catch (e) { console.error("OPFS read error", e); alert("Could not read OPFS."); return; }
  } else { alert("Pipeline must be OPFS, ZIP, or Disk to assemble."); return; }

  if (frameFiles.length === 0) { alert("No frames found."); return; }
  frameFiles.sort((a, b) => a.name.localeCompare(b.name));
  
  var detectedWidth = null;
  var detectedHeight = null;
  var firstBytes = null;
  try {
    var firstFile = await frameFiles[0].handle.getFile();
    var firstAb = await firstFile.arrayBuffer();
    firstBytes = new Uint8Array(firstAb);
    var blob = new Blob([firstBytes], { type: "image/png" });
    var img = await new Promise((resolve, reject) => {
      var image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(blob);
    });
    detectedWidth = img.naturalWidth;
    detectedHeight = img.naturalHeight;
    URL.revokeObjectURL(img.src);
    console.log("[FFmpeg] Detected frame resolution:", detectedWidth + "x" + detectedHeight);
  } catch (e) {
    console.warn("[FFmpeg] Could not detect frame resolution, falling back to dropdown:", e.message);
  }
  
  recorderRef._recordingWidth = detectedWidth || (appState.exportWidth || 1280);
  recorderRef._recordingHeight = detectedHeight || (appState.exportHeight || 720);
  
  const overlay = document.getElementById("processing-overlay"); overlay.style.display = "flex";
  const ffmpeg = await loadFFmpeg((typeof appState !== 'undefined' ? appState.exportFormat : null) || "webm", recorderRef, null);
  if (!ffmpeg) { overlay.style.display = "none"; return; }
  recorderRef._ffmpeg = ffmpeg;
  recorderRef._frameCount = frameFiles.length;

  if (frameFiles.length <= 150) {
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
      await ffmpeg.writeFile(fname, frameBytes);
    }
    await _assemble(null, frameFiles.length, recorderRef._recordingWidth, recorderRef._recordingHeight, ffmpeg, recorderRef);
  } else {
    await _assemble(frameFiles, frameFiles.length, recorderRef._recordingWidth, recorderRef._recordingHeight, ffmpeg, recorderRef);
  }
}

export async function assemble(ffmpeg, frameCount, recordedFrames, recordingWidth, recordingHeight, recorderRef) {
  recorderRef.isAssembling = true;
  
  if (frameCount <= 150) {
    for (let i = 0; i < recordedFrames.length; i++) {
      let fname = "frame_" + String(i).padStart(6, "0") + ".png";
      await ffmpeg.writeFile(fname, recordedFrames[i]);
    }
    await _assemble(null, frameCount, recordingWidth, recordingHeight, ffmpeg, recorderRef);
  } else {
    let externalFrameFiles = recordedFrames.map((bytes, index) => ({
      name: "frame_" + String(index).padStart(6, "0") + ".png",
      handle: { getFile: async () => ({ arrayBuffer: async () => bytes.buffer }) }
    }));
    await _assemble(externalFrameFiles, frameCount, recordingWidth, recordingHeight, ffmpeg, recorderRef);
  }
}

async function _assemble(externalFrameFiles, totalFrames, recordingWidth, recordingHeight, ffmpeg, recorderRef) {
  if (totalFrames === 0) { console.error("No frames."); recorderRef.isAssembling = false; return; }
  console.log("Assembling", totalFrames, "frames...");

  _assemblyStats = { totalFrames, verifiedFrames: 0, missingFrames: 0, encodeStartTime: 0, encodeElapsed: 0, encodeProgress: 0, framesEncoded: 0, currentPhase: "Initializing", outputSize: "" };

  const overlay = document.getElementById("processing-overlay");
  const readyActions = document.getElementById("assembly-ready-actions"); if (readyActions) readyActions.style.display = "none";
  const percentEl = document.getElementById("assembly-percent");
  const fill = document.getElementById("progress-fill");
  const previewCanvas = document.getElementById("preview-canvas");
  
  const targetW = recordingWidth || resolveRecordingResolution().width;
  const targetH = recordingHeight || resolveRecordingResolution().height;
  
  var ctx = null;
  if (previewCanvas) {
    previewCanvas.width = targetW; previewCanvas.height = targetH;
    previewCanvas.style.width = "100%"; previewCanvas.style.height = "auto";
    previewCanvas.style.aspectRatio = `${targetW} / ${targetH}`;
    ctx = previewCanvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, targetW, targetH);
  }
  overlay.style.display = "flex";
  var oc = overlay.querySelector("div"); if (oc) { oc.style.maxWidth = "800px"; oc.style.padding = "32px"; oc.style.height = "auto"; oc.style.minHeight = "400px"; }

  const format = appState.exportFormat || "webm";
  const fps = appState.exportFPS || 60;
  const crf = String(appState.exportCRF || 18);
  const outputFile = "output." + (format === "mp4" ? "mp4" : "webm");
  const alignedW = targetW;
  const alignedH = targetH;
  var scaleFilter = "scale=" + alignedW + ":" + alignedH + ":flags=lanczos";
  var resolutionScale = (alignedW * alignedH) / (1280 * 720);
  var webmBitrate = Math.max(2, Math.round(2 * resolutionScale)) + "M";
  var webmDeadline = resolutionScale > 2.0 ? "good" : "realtime";
  var webmCpuUsed = resolutionScale > 2.0 ? "2" : "4";

  _assemblyStats.currentPhase = externalFrameFiles ? "Importing frames" : "Verifying frames";
  _updateAssemblyUI();

  var encodingInterval = setInterval(() => {
    if (_assemblyStats.encodeStartTime > 0) _assemblyStats.encodeElapsed = performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI();
  }, 500);

  if (externalFrameFiles) {
    const CHUNK_SIZE = 150;
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
        try { const file = await externalFrameFiles[i].handle.getFile(); const buffer = await file.arrayBuffer(); doubleBuffer[bufferIdx][ptr] = new Uint8Array(buffer); ptr++; } catch (e) {}
      }
      doubleBufferLengths[bufferIdx] = ptr;
      loadIdx = end;
    };

    await preloadChunk(activeBufferIdx);
    
    for (let c = 0; c < numChunks; c++) {
      let framesInThisChunk = doubleBufferLengths[activeBufferIdx];
      for (let i = 0; i < framesInThisChunk; i++) {
        const frameData = doubleBuffer[activeBufferIdx][i];
        if (!frameData) {
          console.warn(`[FFmpeg] Missing frame data at index ${i} in buffer ${activeBufferIdx}. Skipping.`);
          continue;
        }

        // 1. Generate preview thumbnail BEFORE transferring/writing to FFmpeg.
        // ffmpeg.writeFile may detach or neuter the underlying ArrayBuffer in some browsers (like Firefox),
        // which makes creating a Blob from it afterwards throw NS_ERROR_ILLEGAL_VALUE.
        if (i % 10 === 0 && ctx) {
          try {
            var tBlob = new Blob([frameData], { type: "image/png" });
            var tUrl = URL.createObjectURL(tBlob);
            var tImg = new Image();
            tImg.onload = function() { 
              ctx.drawImage(tImg, 0, 0, targetW, targetH); 
              URL.revokeObjectURL(tUrl); 
            };
            tImg.src = tUrl;
          } catch (blobErr) {
            console.warn("[FFmpeg] Thumbnail preview Blob creation skipped:", blobErr.message || blobErr);
          }
        }

        // 2. Write the frame data to the virtual file system.
        await ffmpeg.writeFile("frame_" + String(i).padStart(6, "0") + ".png", frameData);
      }
      
      let chunkName = "chunk_" + c + (format === "mp4" ? ".mp4" : ".webm");
      concatList += "file '" + chunkName + "'\n";
      let chunkArgs = format === "mp4" ? [
        "-framerate", String(fps), "-start_number", "0", "-i", "frame_%06d.png", "-vframes", String(framesInThisChunk),
        "-c:v", "libx264", "-preset", "medium", "-crf", crf, "-pix_fmt", "yuv420p",
        "-bf", "0", "-g", String(fps), "-video_track_timescale", "90000", "-vf", scaleFilter, chunkName
      ] : [
        "-framerate", String(fps), "-start_number", "0", "-i", "frame_%06d.png", "-vframes", String(framesInThisChunk),
        "-c:v", "libvpx", "-crf", crf, "-b:v", webmBitrate, "-deadline", webmDeadline,
        "-cpu-used", webmCpuUsed, "-threads", "1", "-pix_fmt", "yuv420p", "-vf", scaleFilter, chunkName
      ];
      
      let nextBufferIdx = (activeBufferIdx + 1) % 2;
      let preloadPromise = (c + 1 < numChunks) ? preloadChunk(nextBufferIdx) : null;
      await ffmpeg.exec(chunkArgs);
      for (let i = 0; i < framesInThisChunk; i++) { try { await ffmpeg.deleteFile("frame_" + String(i).padStart(6, "0") + ".png"); } catch (e) {} }
      framesProcessed += framesInThisChunk;
      _assemblyStats.chunkFramesProcessed = framesProcessed;
      if (preloadPromise) await preloadPromise;
      activeBufferIdx = nextBufferIdx;
    }
    
    if (numChunks === 1) {
      var onlyChunk = "chunk_0." + (format === "mp4" ? "mp4" : "webm");
      try { await ffmpeg.exec(["-i", onlyChunk, "-c", "copy", outputFile]); } catch(e) {
        console.warn("[FFmpeg] Copy failed, using chunk directly:", e.message);
      }
      try { await ffmpeg.deleteFile(onlyChunk); } catch (e) {}
    } else {
      await ffmpeg.writeFile("mylist.txt", new TextEncoder().encode(concatList));
      if (format === "mp4") await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "mylist.txt", "-c", "copy", "-movflags", "+faststart", outputFile]);
      else await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "mylist.txt", "-c", "copy", outputFile]);
      for (let c = 0; c < numChunks; c++) { try { await ffmpeg.deleteFile("chunk_" + c + (format === "mp4" ? ".mp4" : ".webm")); } catch (e) {} }
    }
    
    _assemblyStats.encodeProgress = 100; if (percentEl) percentEl.textContent = "100%"; if (fill) fill.style.width = "100%";
    _assemblyStats.currentPhase = "Encoding complete";
    _assemblyStats.encodeElapsed = performance.now() - _assemblyStats.encodeStartTime;
    _updateAssemblyUI(); clearInterval(encodingInterval);
  } else {
    var missingFrames = [];
    var loadedCount = 0;
    for (var i = 0; i < totalFrames; i++) {
      var fname = "frame_" + String(i).padStart(6, "0") + ".png";
      try {
        var checkData = await ffmpeg.readFile(fname);
        if (!checkData || checkData.length === 0) throw new Error("empty");
        loadedCount++; _assemblyStats.verifiedFrames = loadedCount;
        if (i % 10 === 0 || i === totalFrames - 1) {
          _assemblyStats.encodeProgress = Math.round((i + 1) / totalFrames * 100);
          if (ctx && checkData) { let blob = new Blob([checkData], { type: "image/png" }); let url = URL.createObjectURL(blob); let img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, targetW, targetH); URL.revokeObjectURL(url); }; img.src = url; }
          _updateAssemblyUI();
        }
      } catch (e) { missingFrames.push({ index: i }); }
    }
    _assemblyStats.missingFrames = missingFrames.length;
    if (missingFrames.length > totalFrames * 0.5) { console.error("Too many missing frames."); recorderRef.isAssembling = false; setTimeout(() => { overlay.style.display = "none"; }, 3000); return; }

    _assemblyStats.currentPhase = "Encoding video"; _assemblyStats.encodeProgress = 20;
    _assemblyStats.encodeStartTime = performance.now(); _updateAssemblyUI();

    const args = format === "mp4" ? [
      "-framerate", String(fps), "-start_number", "0", "-i", "frame_%06d.png",
      "-c:v", "libx264", "-preset", "medium", "-crf", crf, "-pix_fmt", "yuv420p",
      "-bf", "0", "-vf", scaleFilter, outputFile
    ] : [
      "-framerate", String(fps), "-start_number", "0", "-i", "frame_%06d.png",
      "-c:v", "libvpx", "-crf", crf, "-b:v", webmBitrate, "-deadline", webmDeadline,
      "-cpu-used", webmCpuUsed, "-threads", "1", "-pix_fmt", "yuv420p", "-vf", scaleFilter, outputFile
    ];
    console.log("[FFmpeg] Assembly:", format.toUpperCase(), "Args:", args.join(" "));
    try { await Promise.race([ffmpeg.exec(args), new Promise((_,r) => setTimeout(() => r(new Error("Timeout")), 300000))]); } catch(e) { console.error("Encode failed:", e); }
    clearInterval(encodingInterval);
    _assemblyStats.currentPhase = "Encoding complete"; _assemblyStats.encodeProgress = 100;
    _assemblyStats.encodeElapsed = performance.now() - _assemblyStats.encodeStartTime; _updateAssemblyUI();
  }

  try {
    if (!ffmpeg) throw new Error("FFmpeg instance unavailable");
    const data = await ffmpeg.readFile(outputFile);
    console.log("[FFmpeg] Output:", (data.byteLength / 1024 / 1024).toFixed(2), "MB");
    const blob = new Blob([data], { type: format === "mp4" ? "video/mp4" : "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "sg_lab_render_" + Date.now() + "." + (format === "mp4" ? "mp4" : "webm");
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    _assemblyStats.outputSize = (data.byteLength / 1024 / 1024).toFixed(2) + " MB";
    _assemblyStats.currentPhase = "Download ready"; _updateAssemblyUI();
  } catch (e) {
    console.error("Download failed:", e.message || e);
    _assemblyStats.currentPhase = "Download failed: " + (e.message || "unknown error");
    _updateAssemblyUI();
  }

  for (let i = 0; i < totalFrames; i++) { try { await ffmpeg.deleteFile("frame_" + String(i).padStart(6, "0") + ".png"); } catch (e) {} }
  try { await ffmpeg.deleteFile(outputFile); } catch (e) {}

  recorderRef.isAssembling = false;
  recorderRef._recordedFrames = [];
  if (document.getElementById("assembly-ready-actions")) document.getElementById("assembly-ready-actions").style.display = "flex";
  console.log("[FFmpeg] Assembly complete.");
  console.log("=== FINAL TELEMETRY ===");
  if (recorderRef.getTelemetry) recorderRef.getTelemetry();
}