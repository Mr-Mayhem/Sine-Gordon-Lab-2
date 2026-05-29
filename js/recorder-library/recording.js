// =============================================================================
// Browser Video Recorder Library — recording.js
// Frame capture pipeline — canvas management, pixel readback, PNG encoding,
// frame writing to FFmpeg/OPFS/ZIP. No assembly or FFmpeg loading logic.
// =============================================================================

import { assemble, assembleFromStorage, onFFmpegLog } from "./assembly.js";
import { loadFFmpeg } from "./ffmpeg-loader.js";
import { exportToZip } from "./zip-export.js";
import {
  resolveRecordingResolution,
  changeCanvasToRecordingResolution,
  restoreCanvasResolution
} from "./video-filters.js";

export default class RecordingEngine {
  constructor(config = {}) {
    this.config = Object.assign({
      exportFPS: 60,
      exportFormat: "webm",
      exportPipeline: "ffmpeg",
      exportWidth: 1280,
      exportHeight: 720,
      camera: null,
      exportFilename: ""
    }, config);

    this.isRecording = false;
    this.isAssembling = false;
    this.isTesting = false;
    this._canvas = null;
    this._renderer = null;
    this._gl = null;
    this._frameCount = 0;
    this._ffmpeg = null;
    this._ffmpegReady = false;
    this._ffmpegLogs = [];
    this._recordedFrames = [];
    this._pipeline = "ffmpeg";
    this._dirHandle = null;
    this._pixelBuffer = null;
    this._renderFrameCount = 0;
    this._captureInterval = 1;
    this._frameLimit = 7200;
    this._tempCanvas = null;
    this._tempCtx = null;
    this._preRecordingWidth = null;
    this._preRecordingHeight = null;
    this._recordingWidth = null;
    this._recordingHeight = null;

    this._telemetry = {
      startTime: 0, stopTime: 0,
      capturesAttempted: 0, capturesSucceeded: 0, capturesErrored: 0,
      encodesStarted: 0, encodesCompleted: 0, encodesErrored: 0,
      writesQueued: 0, writesCompleted: 0, writesErrored: 0,
      frameSizes: [], captureTimings: [], encodeTimings: [], writeTimings: [],
      firstFrameTime: 0, lastFrameTime: 0, sequenceGaps: [],
      lastWrittenIndex: -1, glErrors: []
    };
  }
  
  setProgressCallback(callback) { this._onProgress = callback; }
  setFrameLimit(limit) { this._frameLimit = limit; }

  startRecording() {
    this._returnBlobDirectly = true;
    this._lastGeneratedBlob = null;
    this._blobPromise = new Promise((resolve, reject) => {
      this._resolveBlob = resolve;
      this._rejectBlob = reject;
    });
    this._onBlobGenerated = (blob) => {
      if (this._resolveBlob) {
        this._resolveBlob(blob);
        this._resolveBlob = null;
        this._rejectBlob = null;
      }
    };
    this._onAssemblyError = (err) => {
      if (this._rejectBlob) {
        this._rejectBlob(err);
        this._resolveBlob = null;
        this._rejectBlob = null;
      }
    };
    return this.start();
  }

  async stopRecording() {
    await this.stop();
    if (this._blobPromise) {
      return this._blobPromise;
    }
    return null;
  }

  async captureFrame() {
    return await this.captureAndWait();
  }

  getExportFilename(extension) {
    let name = this.config.exportFilename;
    if (!name) {
      let parentName = "";
      if (typeof document !== "undefined") {
        const docTitle = document.title || "";
        parentName = docTitle.split(/\s+v?\d+/)[0].trim();
      }
      if (!parentName) {
        parentName = "The Sine-Gordon Lab";
      }
      const sanitized = parentName.toLowerCase()
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      name = sanitized || "sine_gordon_lab";
    }
    return `${name}_render_${Date.now()}.${extension}`;
  }

  _telemetryReport() {
    var t = this._telemetry;
    const fps = this.config.exportFPS || 60;
    return {
      status: this.isRecording ? "recording" : this.isAssembling ? "assembling" : "idle",
      totalCaptureCalls: t.capturesAttempted,
      capturesSucceeded: t.capturesSucceeded,
      capturesErrored: t.capturesErrored,
      encodesStarted: t.encodesStarted,
      encodesCompleted: t.encodesCompleted,
      encodesErrored: t.encodesErrored,
      writesQueued: t.writesQueued,
      writesCompleted: t.writesCompleted,
      writesErrored: t.writesErrored,
      queuedNotWritten: t.writesQueued - t.writesCompleted,
      finalFrameCount: this._frameCount,
      durationMs: t.lastFrameTime - t.firstFrameTime,
      avgCaptureMs: t.captureTimings.length > 0 ? (t.captureTimings.reduce(function(a,b){return a+b;},0) / t.captureTimings.length).toFixed(2) : 0,
      avgEncodeMs: t.encodeTimings.length > 0 ? (t.encodeTimings.reduce(function(a,b){return a+b;},0) / t.encodeTimings.length).toFixed(2) : 0,
      avgWriteMs: t.writeTimings.length > 0 ? (t.writeTimings.reduce(function(a,b){return a+b;},0) / t.writeTimings.length).toFixed(2) : 0,
      frameSizeSample: t.frameSizes.length > 0 ? { min: Math.min.apply(null, t.frameSizes), max: Math.max.apply(null, t.frameSizes), avg: Math.round(t.frameSizes.reduce(function(a,b){return a+b;},0) / t.frameSizes.length) } : null,
      lastWrittenIndex: t.lastWrittenIndex,
      glErrors: t.glErrors,
      ffmpegLogs: this._ffmpegLogs ? this._ffmpegLogs.slice(-50) : [],
      canvasSize: this._canvas ? (this._canvas.width + "x" + this._canvas.height) : "none",
      pixelBufferBytes: this._pixelBuffer ? this._pixelBuffer.byteLength : 0,
      captureInterval: this._captureInterval,
      targetFPS: fps
    };
  }

  getTelemetry() {
    console.log("=== RECORDING TELEMETRY ===");
    var r = this._telemetryReport();
    console.log(JSON.stringify(r, null, 2));
    return r;
  }

  init(canvas, renderer) {
    this._canvas = canvas;
    this._renderer = renderer;
    this._gl = renderer.getContext();
    if (!this._gl) { console.error("WebGL context not available"); return; }
    if (!(this._gl.getContextAttributes() || {}).preserveDrawingBuffer) { console.warn("preserveDrawingBuffer not enabled!"); }
    this._calculateCaptureInterval();
    console.log("Recording engine initialized. Canvas:", canvas.width + "x" + canvas.height);
    if (typeof SharedArrayBuffer === "undefined") {
      console.warn("SharedArrayBuffer not available. MP4 will fall back to WebM.");
      if (this.config.exportFormat === "mp4") this.config.exportFormat = "webm";
      var mo = document.querySelector('#sel-format option[value="mp4"]');
      if (mo) mo.textContent = "MP4 (N/A)";
    }
  }

  _restoreCanvasSize() {
    const cam = this.config.camera || window.camera;
    restoreCanvasResolution(
      this._canvas,
      this._renderer,
      cam,
      this._preRecordingWidth,
      this._preRecordingHeight,
      document.getElementById("viewport")
    );
    if (this._savedStyleWidth !== undefined) {
      if (this._savedStyleWidth) {
        this._canvas.style.width = this._savedStyleWidth;
      } else {
        this._canvas.style.removeProperty("width");
      }
    }
    if (this._savedStyleHeight !== undefined) {
      if (this._savedStyleHeight) {
        this._canvas.style.height = this._savedStyleHeight;
      } else {
        this._canvas.style.removeProperty("height");
      }
    }
    this._preRecordingWidth = null;
    this._preRecordingHeight = null;
    
    // Dispatch a window resize event to completely flush, align, and sync any Three.js viewport and canvas layout states
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event('resize'));
    }
  }

  _calculateCaptureInterval() {
    if (this.isTesting) {
      this._captureInterval = 1;
    } else {
      const fps = this.config.exportFPS || 60;
      this._captureInterval = Math.max(1, Math.round(60 / fps));
    }
  }

  _ensureTempCanvas(rawW, rawH, tgtW, tgtH) {
    if (!this._tempCanvas || this._tempCanvas.width !== tgtW || this._tempCanvas.height !== tgtH) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this._tempCanvas = new OffscreenCanvas(tgtW, tgtH);
      } else {
        this._tempCanvas = document.createElement('canvas');
        this._tempCanvas.width = tgtW; this._tempCanvas.height = tgtH;
      }
      this._tempCtx = this._tempCanvas.getContext('2d');
    }
    if (!this._rawCanvas || this._rawCanvas.width !== rawW || this._rawCanvas.height !== rawH) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this._rawCanvas = new OffscreenCanvas(rawW, rawH);
      } else {
        this._rawCanvas = document.createElement('canvas');
        this._rawCanvas.width = rawW; this._rawCanvas.height = rawH;
      }
      this._rawCtx = this._rawCanvas.getContext('2d');
    }
  }

  async _prepareStorageDirectory(pipeline) {
    if (pipeline === "local") {
      if (!window.showDirectoryPicker) throw new Error("DirPicker unsupported");
      return await window.showDirectoryPicker({ id: "local-export", mode: "readwrite" });
    }

    try {
      const root = await navigator.storage.getDirectory();
      const folderName = (pipeline === "opfs" ? "sg_frames_" : pipeline === "zip" ? "sg_zip_tmp_" : "sg_ffmpeg_tmp_") + Date.now();
      return await root.getDirectoryHandle(folderName, { create: true });
    } catch (e) {
      if (pipeline === "zip") {
        console.warn("OPFS temporary storage unavailable. Fallback to in-memory JSZip initialized:", e.message);
        this._zip = new window.JSZip();
        return null;
      } else if (pipeline === "opfs") {
        throw new Error("OPFS Storage is disabled or inaccessible.");
      } else {
        console.warn("OPFS temporary storage unavailable for FFmpeg. Fallback to in-memory frame array buffer initialized:", e.message);
        this._recordedFrames = [];
        return null;
      }
    }
  }

  async start() {
    this._frameCount = 0;
    this._recordedFrames = [];
    this._renderFrameCount = 0;
    
    const txtRec = document.getElementById("txt-recording");
    if (txtRec) { txtRec.textContent = "REC: 0"; }
    this._ffmpegReady = false;
    this.isRecording = true;

    var viewport = document.getElementById("viewport");
    if (viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
      this._preRecordingWidth = Math.floor(viewport.clientWidth / 2) * 2;
      this._preRecordingHeight = Math.floor(viewport.clientHeight / 2) * 2;
    } else {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = this._canvas && this._canvas.width > 0 ? this._canvas.width : (1280 * dpr);
      var ch = this._canvas && this._canvas.height > 0 ? this._canvas.height : (720 * dpr);
      this._preRecordingWidth = Math.floor((cw / dpr) / 2) * 2;
      this._preRecordingHeight = Math.floor((ch / dpr) / 2) * 2;
    }

    // Failsafe non-zero defaults
    if (!this._preRecordingWidth || this._preRecordingWidth <= 0 || !this._preRecordingHeight || this._preRecordingHeight <= 0) {
      this._preRecordingWidth = (window.sgState && window.sgState.exportWidth) || 1280;
      this._preRecordingHeight = (window.sgState && window.sgState.exportHeight) || 720;
    }

    // Refresh configurations dynamically right at start of capture
    if (typeof window !== "undefined" && window.sgState) {
      this.config.exportPipeline = window.sgState.exportPipeline || "ffmpeg";
      this.config.exportFormat = window.sgState.exportFormat || "webm";
      this.config.exportFPS = window.sgState.exportFPS || 60;
      this.config.exportWidth = window.sgState.exportWidth || 1280;
      this.config.exportHeight = window.sgState.exportHeight || 720;
      this.config.exportFilename = window.sgState.exportFilename || "";
    }

    this._pipeline = this.config.exportPipeline || "ffmpeg";
    this._dirHandle = null;
    this._zip = null;
    
    this._telemetry = {
      startTime: performance.now(),
      stopTime: 0,
      capturesAttempted: 0,
      capturesSucceeded: 0,
      capturesErrored: 0,
      encodesStarted: 0,
      encodesCompleted: 0,
      encodesErrored: 0,
      writesQueued: 0,
      writesCompleted: 0,
      writesErrored: 0,
      frameSizes: [],
      captureTimings: [],
      encodeTimings: [],
      writeTimings: [],
      firstFrameTime: 0,
      lastFrameTime: 0,
      sequenceGaps: [],
      lastWrittenIndex: -1,
      glErrors: []
    };
    
    const recIndicator = document.getElementById("recording-indicator");
    if (recIndicator) recIndicator.style.display = "flex";

    try {
      this._dirHandle = await this._prepareStorageDirectory(this._pipeline);
      if (this._dirHandle) {
        console.log(`[Storage] Initialized temporary sandbox directory: ${this._dirHandle.name} for pipeline: ${this._pipeline}`);
      }
    } catch (err) {
      console.error("[Storage] Failed to prepare storage directory:", err);
      alert(err.message === "DirPicker unsupported" ? "Local Disk access not supported." : err.message);
      this.isRecording = false;
      if (recIndicator) recIndicator.style.display = "none";
      if (window.refreshUI) window.refreshUI();
      return;
    }

    const cam = this.config.camera || window.camera;
    this._savedStyleWidth = this._canvas.style.width || "";
    this._savedStyleHeight = this._canvas.style.height || "";

    var sizeData = changeCanvasToRecordingResolution(
      this._canvas,
      this._renderer,
      cam,
      this.config,
      document.getElementById("viewport") || document.querySelector(".main-canvas-container")
    );

    var aw = sizeData.width;
    var ah = sizeData.height;
    this._recordingWidth = aw;
    this._recordingHeight = ah;
    this._preRecordingWidth = sizeData.preRecordingWidth;
    this._preRecordingHeight = sizeData.preRecordingHeight;

    console.log("Recording started. Physics Canvas is updated internally to target format:", aw + "x" + ah);
    this._pixelBuffer = new Uint8Array(aw * ah * 4);
    this._ensureTempCanvas(aw, ah, aw, ah);
    this._calculateCaptureInterval();
    this._ffmpegReady = true;
    console.log("Recording ready. FPS:", this.config.exportFPS, "Interval:", this._captureInterval);
  }

  async stop() {
    this.isRecording = false; this._telemetry.stopTime = performance.now();
    const recIndicator = document.getElementById("recording-indicator");
    if (recIndicator) recIndicator.style.display = "none";
    var txtRec = document.getElementById("txt-recording");
    if (txtRec) { txtRec.textContent = "REC: 0"; }
    
    if (typeof window !== "undefined" && window.sgState) {
      window.sgState.paused = true;
    }
    
    var pb = document.getElementById("btn-play"); if (pb) pb.textContent = "▶ Run";
    console.log("Recording stopped. Frames:", this._frameCount);
    this.getTelemetry();
    this._restoreCanvasSize();
    if (this._pipeline === "ffmpeg") {
      const overlay = document.getElementById("processing-overlay");
      if (overlay) overlay.style.display = "flex";
      
      const statusEl = document.getElementById("assembly-status");
      if (statusEl) statusEl.innerHTML = "<strong>Mode:</strong> video-render<br><strong>Phase:</strong> Loading FFmpeg...";
      
      try {
        const format = this.config.exportFormat || "webm";
        this._ffmpeg = await loadFFmpeg(format, this, onFFmpegLog);
      } catch (e) {
        console.error("FFmpeg load failed", e);
        alert("FFmpeg could not load. Try ZIP export.");
        if (overlay) overlay.style.display = "none";
        this.isAssembling = false;
        if (window.refreshUI) window.refreshUI();
        return;
      }
      if (!this._ffmpeg) {
        if (overlay) overlay.style.display = "none";
        this.isAssembling = false;
        if (window.refreshUI) window.refreshUI();
        return;
      }
      
      await assemble(this._ffmpeg, this._frameCount, this._recordedFrames, this._recordingWidth, this._recordingHeight, this);
    } else if (this._pipeline === "zip" || this._pipeline === "local") {
      exportToZip(this._dirHandle, this._zip, document.getElementById("btn-video"), window.refreshUI || (() => {}), this);
    } else {
      console.log("Frames saved to", this._pipeline);
      var btnVideo = document.getElementById("btn-video");
      if (btnVideo) { btnVideo.textContent = "✓ Saved!"; btnVideo.classList.remove("btn-warn"); setTimeout(function() { if (window.refreshUI) window.refreshUI(); }, 2000); }
    }
  }

  async assembleFromStorage(pipeline) {
    await assembleFromStorage(pipeline, this);
  }

  async captureAndWait() {
    if (!this.isRecording || !this._ffmpegReady) return false;
    this._renderFrameCount++;
    if (this._renderFrameCount % this._captureInterval !== 0) return false;
    this._telemetry.capturesAttempted++;
    if (this._frameCount >= this._frameLimit) { this.stop(); return false; }
    var capStart = performance.now();
    try {
      var width = this._canvas.width; var height = this._canvas.height;
      var requiredLength = width * height * 4;
      if (!this._pixelBuffer || this._pixelBuffer.length !== requiredLength) {
        this._pixelBuffer = new Uint8Array(requiredLength);
      }
      this._gl.finish();
      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
      this._gl.readPixels(0, 0, width, height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, this._pixelBuffer);
      var error = this._gl.getError();
      if (error !== this._gl.NO_ERROR) {
        console.warn(`[RECORDING ANOMALY] WebGL error detected during readPixels: 0x${error.toString(16)} (Frame: ${this._frameCount})`);
        this._telemetry.glErrors.push({ frame: this._frameCount, error: error });
      }
      var frameIndex = this._frameCount;
      if (frameIndex === 0) {
        let isBlank = true;
        for (let idx = 0; idx < this._pixelBuffer.length; idx++) {
          if (this._pixelBuffer[idx] !== 0) {
            isBlank = false;
            break;
          }
        }
        if (isBlank) {
          console.warn("[RECORDING ANOMALY] First frame captured is completely blank (all RGBA values are 0). This indicates readPixels outside drawing flush.");
        } else {
          console.log("[RECORDING OK] First frame verified containing active pixel grid.");
        }
      }
      this._frameCount++;
      if (this._telemetry.firstFrameTime === 0) this._telemetry.firstFrameTime = performance.now();
      this._telemetry.lastFrameTime = performance.now();
      var pixelCopy = new Uint8Array(this._pixelBuffer);
      await this._encodeAndWriteFrameSync(pixelCopy, width, height, frameIndex);
      if (frameIndex % 10 === 0) this._telemetry.captureTimings.push(performance.now() - capStart);
      this._telemetry.capturesSucceeded++;
      var txtRec = document.getElementById("txt-recording");
      if (txtRec) txtRec.textContent = "REC: " + this._frameCount;
      return true;
    } catch (error) { this._telemetry.capturesErrored++; console.error("Capture error:", error); return false; }
  }

  async _encodeAndWriteFrameSync(pixels, rawW, rawH, frameIndex) {
    var encStart = performance.now();
    this._telemetry.encodesStarted++;
    
    var tgtW = this._recordingWidth || rawW;
    var tgtH = this._recordingHeight || rawH;

    try {
      this._ensureTempCanvas(rawW, rawH, tgtW, tgtH);
      var ctx = this._tempCtx;
      var rawCtx = this._rawCtx;
      
      var pixelCopy = new Uint8ClampedArray(pixels);
      var imageData = new ImageData(pixelCopy, rawW, rawH);
      rawCtx.putImageData(imageData, 0, 0);
      
      ctx.clearRect(0, 0, tgtW, tgtH);
      ctx.save();
      
      ctx.setTransform(1, 0, 0, -1, 0, tgtH);
      ctx.drawImage(this._rawCanvas, 0, 0, tgtW, tgtH);
      ctx.restore();

      if (this.isTesting || (typeof window !== "undefined" && window.recorder && window.recorder.isTesting)) {
        this._drawDiagnosticsOverlay(ctx, tgtW, tgtH, frameIndex);
      }
      
      var blob;
      if (this._tempCanvas.convertToBlob) {
        blob = await this._tempCanvas.convertToBlob({ type: 'image/png' });
      } else {
        blob = await new Promise(function(resolve) { this._tempCanvas.toBlob(resolve, 'image/png'); }.bind(this));
      }
      
      if (frameIndex % 5 === 0) {
        var previewCanvas = document.getElementById("preview-canvas");
        if (previewCanvas) {
          var tUrl = URL.createObjectURL(blob);
          var tImg = new Image();
          tImg.onload = function() {
            var tCtx = previewCanvas.getContext("2d");
            if (tCtx) {
              previewCanvas.width = tgtW;
              previewCanvas.height = tgtH;
              tCtx.drawImage(tImg, 0, 0, tgtW, tgtH);
            }
            URL.revokeObjectURL(tUrl);
          };
          tImg.onerror = function() {
            URL.revokeObjectURL(tUrl);
          };
          tImg.src = tUrl;
        }
      }
      
      var arrayBuffer = await blob.arrayBuffer();
      var bytes = new Uint8Array(arrayBuffer);
      if (frameIndex % 10 === 0) { this._telemetry.frameSizes.push(bytes.byteLength); this._telemetry.encodeTimings.push(performance.now() - encStart); }
      var filename = "frame_" + String(frameIndex).padStart(6, "0") + ".png";
      if (this._pipeline === "zip" && this._dirHandle) {
        var fh = await this._dirHandle.getFileHandle(filename, { create: true });
        var w = await fh.createWritable(); await w.write(bytes); await w.close();
      } else if (this._zip) { this._zip.file(filename, bytes); }
      else if (this._dirHandle) {
        var fh = await this._dirHandle.getFileHandle(filename, { create: true });
        var w = await fh.createWritable(); await w.write(bytes); await w.close();
      } else { this._recordedFrames.push(bytes); }
      this._telemetry.lastWrittenIndex = frameIndex;
      this._telemetry.writesCompleted++; this._telemetry.writesQueued++; this._telemetry.encodesCompleted++;
      if (frameIndex % 10 === 0) this._telemetry.writeTimings.push(performance.now() - encStart);
    } catch (error) { this._telemetry.encodesErrored++; console.error("Encode error:", error); throw error; }
  }

  _drawDiagnosticsOverlay(ctx, w, h, frameIndex) {
    ctx.fillStyle = "rgba(10, 10, 15, 0.82)";
    ctx.fillRect(0, 0, w, 45);
    ctx.fillRect(0, h - 35, w, 35);

    ctx.strokeStyle = "rgba(0, 255, 204, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 45); ctx.lineTo(w, 45);
    ctx.moveTo(0, h - 35); ctx.lineTo(w, h - 35);
    ctx.stroke();

    const monoFont = "bold 9px 'JetBrains Mono', Courier, monospace";
    const titleFont = "900 11px Arial, sans-serif";

    ctx.strokeStyle = "#ff0077";
    ctx.lineWidth = 2;
    const len = 12;
    ctx.beginPath();
    ctx.moveTo(10, 10 + len); ctx.lineTo(10, 10); ctx.lineTo(10 + len, 10);
    ctx.moveTo(10, h - 10 - len); ctx.lineTo(10, h - 10); ctx.lineTo(10 + len, h - 10);
    ctx.moveTo(w - 10, 10 + len); ctx.lineTo(w - 10, 10); ctx.lineTo(w - 10 - len, 10);
    ctx.moveTo(w - 10, h - 10 - len); ctx.lineTo(w - 10, h - 10); ctx.lineTo(w - 10 - len, h - 10);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = titleFont;
    ctx.fillText("🧪 SINE-GORDON LABORATORY PIPELINE DIAGNOSTICS", 20, 26);

    ctx.fillStyle = "#00ffcc";
    ctx.font = monoFont;
    ctx.fillText(`RESOLVED FRAME: #${String(frameIndex + 1).padStart(4, '0')}`, w - 165, 25);

    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.font = monoFont;
    ctx.fillText(`SCALE: ${w}x${h}`, 20, h - 15);
    ctx.fillText(`PIPELINE: ${this._pipeline.toUpperCase()}`, 110, h - 15);
    const fps = this.config.exportFPS || 30;
    ctx.fillText(`FPS: ${fps}`, 220, h - 15);
    ctx.fillText(`CLOCK: ${new Date().toISOString().substring(11, 23)}`, 280, h - 15);

    const dialX = w - 45;
    const dialY = h - 17;
    const dialRadius = 11;

    ctx.strokeStyle = "rgba(0, 255, 204, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialRadius, 0, Math.PI * 2);
    ctx.arc(dialX, dialY, dialRadius - 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 255, 204, 0.3)";
    ctx.beginPath();
    ctx.moveTo(dialX - dialRadius, dialY); ctx.lineTo(dialX + dialRadius, dialY);
    ctx.moveTo(dialX, dialY - dialRadius); ctx.lineTo(dialX, dialY + dialRadius);
    ctx.stroke();

    const angle = (frameIndex * (360 / 30) - 90) * Math.PI / 180;
    const handLength = dialRadius - 2;
    ctx.strokeStyle = "#ff0077";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dialX, dialY);
    ctx.lineTo(dialX + Math.cos(angle) * handLength, dialY + Math.sin(angle) * handLength);
    ctx.stroke();

    const barWidth = 8;
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", "#ffffff"];
    const barStartX = w - 110;
    const barY = h - 22;
    const barH = 10;
    for (let c = 0; c < colors.length; c++) {
      ctx.fillStyle = colors[c];
      ctx.fillRect(barStartX - (c * barWidth), barY, barWidth, barH);
    }
  }
}
