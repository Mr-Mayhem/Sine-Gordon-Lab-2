// =============================================================================
// sine-gordon-lab — js/recording.js
// Frame capture pipeline — canvas management, pixel readback, PNG encoding,
// frame writing to FFmpeg/OPFS/ZIP. No assembly or FFmpeg loading logic.
// =============================================================================

import { sgState as appState } from "./state.js";
import { loadFFmpeg } from "./ffmpeg-loader.js";
import { assemble, assembleFromStorage } from "./assembly.js";
import { exportToZip } from "./zip-export.js";

function resolveRecordingResolution() {
  var w = (typeof appState !== 'undefined' ? appState.exportWidth : 1280) || 1280;
  var h = (typeof appState !== 'undefined' ? appState.exportHeight : 720) || 720;
  return {
    width: Math.floor(w / 16) * 16,
    height: h
  };
}

export default class RecordingEngine {
  constructor() {
    this.isRecording = false;
    this.isAssembling = false;
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

  _telemetryReport() {
    var t = this._telemetry;
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
      targetFPS: appState.exportFPS
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
      if (appState.exportFormat === "mp4") appState.exportFormat = "webm";
      var mo = document.querySelector('#sel-format option[value="mp4"]');
      if (mo) mo.textContent = "MP4 (Not Supported)";
    }
  }

  _restoreCanvasSize() {
    if (!this._canvas) return;
    var w, h;
    if (this._preRecordingWidth && this._preRecordingHeight) {
      w = this._preRecordingWidth; h = this._preRecordingHeight;
    } else {
      var viewport = document.getElementById("viewport");
      if (!viewport) return;
      w = Math.floor(viewport.clientWidth / 16) * 16;
      h = Math.floor(viewport.clientHeight / 16) * 16;
    }
    console.log("Restoring canvas:", w + "x" + h);
    if (this._renderer) {
      this._renderer.setSize(w, h, true);
      if (window.camera) { window.camera.aspect = w / h; window.camera.updateProjectionMatrix(); }
    }
    this._preRecordingWidth = null; this._preRecordingHeight = null;
  }

  _calculateCaptureInterval() { this._captureInterval = Math.max(1, Math.round(60 / (appState.exportFPS || 60))); }

  _ensureTempCanvas(width, height) {
    if (!this._tempCanvas || this._tempCanvas.width !== width || this._tempCanvas.height !== height) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this._tempCanvas = new OffscreenCanvas(width, height);
      } else {
        this._tempCanvas = document.createElement('canvas');
        this._tempCanvas.width = width; this._tempCanvas.height = height;
      }
      this._tempCtx = this._tempCanvas.getContext('2d');
    }
  }

  async start() {
    this._frameCount = 0; this._recordedFrames = []; this._renderFrameCount = 0;
    this._ffmpegReady = false; this.isRecording = true;
    this._preRecordingWidth = this._canvas.width; this._preRecordingHeight = this._canvas.height;
    this._pipeline = typeof appState !== 'undefined' ? appState.exportPipeline : "ffmpeg";
    if (!this._pipeline) this._pipeline = "ffmpeg";
    this._dirHandle = null;
    this._telemetry = { startTime: performance.now(), stopTime: 0, capturesAttempted: 0, capturesSucceeded: 0, capturesErrored: 0, encodesStarted: 0, encodesCompleted: 0, encodesErrored: 0, writesQueued: 0, writesCompleted: 0, writesErrored: 0, frameSizes: [], captureTimings: [], encodeTimings: [], writeTimings: [], firstFrameTime: 0, lastFrameTime: 0, sequenceGaps: [], lastWrittenIndex: -1, glErrors: [] };
    document.getElementById("recording-indicator").style.display = "flex";

    if (this._pipeline === "local") {
      try {
        if (!window.showDirectoryPicker) throw new Error("DirPicker unsupported");
        this._dirHandle = await window.showDirectoryPicker({ id: 'local-export', mode: 'readwrite' });
      } catch (e) {
        console.error("Local disk access aborted", e);
        alert(e.message === "DirPicker unsupported" ? "Local Disk access not supported." : "Directory selection aborted.");
        this.isRecording = false; document.getElementById("recording-indicator").style.display = "none";
        if (window.refreshUI) window.refreshUI(); return;
      }
    } else if (this._pipeline === "opfs") {
      try {
        var root = await navigator.storage.getDirectory();
        this._dirHandle = await root.getDirectoryHandle("sg_frames_" + Date.now(), { create: true });
      } catch (e) {
        console.error("OPFS access failed", e);
        alert("OPFS Storage disabled. Try FFmpeg option.");
        this.isRecording = false; document.getElementById("recording-indicator").style.display = "none";
        if (window.refreshUI) window.refreshUI(); return;
      }
    } else if (this._pipeline === "zip") {
      try {
        var root = await navigator.storage.getDirectory();
        this._dirHandle = await root.getDirectoryHandle("sg_zip_tmp_" + Date.now(), { create: true });
      } catch (e) { console.warn("OPFS failed, using memory buffer", e); this._zip = new window.JSZip(); }
    } else {
      try {
        this._ffmpeg = await loadFFmpeg(typeof appState !== 'undefined' ? appState.exportFormat : "webm", this);
      } catch (e) {
        console.error("FFmpeg load failed", e);
        alert("FFmpeg could not load. Try ZIP export.");
        this.isRecording = false; document.getElementById("recording-indicator").style.display = "none";
        if (window.refreshUI) window.refreshUI(); return;
      }
      if (!this._ffmpeg) { this.isRecording = false; document.getElementById("recording-indicator").style.display = "none"; return; }
    }

    var selRes = document.getElementById("sel-res");
    if (selRes && selRes.value) {
      var parts = selRes.value.split("x");
      if (parts.length === 2) { appState.exportWidth = Number(parts[0]); appState.exportHeight = Number(parts[1]); }
    }
    var res = resolveRecordingResolution(); var aw = res.width; var ah = res.height;
    this._recordingWidth = aw; this._recordingHeight = ah;
    this._canvas.width = aw; this._canvas.height = ah;
    this._renderer.setSize(aw, ah, false);
    if (window.camera) { window.camera.aspect = aw / ah; window.camera.updateProjectionMatrix(); }
    var width = this._canvas.width; var height = this._canvas.height;
    console.log("Recording resolution:", width + "x" + height, "(was: " + this._preRecordingWidth + "x" + this._preRecordingHeight + ")");
    this._pixelBuffer = new Uint8Array(width * height * 4);
    this._ensureTempCanvas(width, height);
    this._calculateCaptureInterval();
    this._ffmpegReady = true;
    console.log("Recording started. FPS:", appState.exportFPS, "Interval:", this._captureInterval);
  }

  async stop() {
    this.isRecording = false; this._telemetry.stopTime = performance.now();
    document.getElementById("recording-indicator").style.display = "none";
    appState.paused = true;
    var pb = document.getElementById("btn-play"); if (pb) pb.textContent = "▶ Run";
    console.log("Recording stopped. Frames:", this._frameCount);
    this.getTelemetry();
    this._restoreCanvasSize();
    if (this._pipeline === "ffmpeg") {
      assemble(this._ffmpeg, this._frameCount, this._recordedFrames, this._recordingWidth, this._recordingHeight, this);
    } else if (this._pipeline === "zip") {
      exportToZip(this._dirHandle, this._zip, document.getElementById("btn-video"), window.refreshUI, this);
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
      this._gl.finish();
      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
      this._gl.readPixels(0, 0, width, height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, this._pixelBuffer);
      var error = this._gl.getError();
      if (error !== this._gl.NO_ERROR) { this._telemetry.glErrors.push({ frame: this._frameCount, error: error }); }
      var frameIndex = this._frameCount; this._frameCount++;
      if (this._telemetry.firstFrameTime === 0) this._telemetry.firstFrameTime = performance.now();
      this._telemetry.lastFrameTime = performance.now();
      var pixelCopy = new Uint8Array(this._pixelBuffer);
      await this._encodeAndWriteFrameSync(pixelCopy, width, height, frameIndex);
      if (frameIndex % 10 === 0) this._telemetry.captureTimings.push(performance.now() - capStart);
      this._telemetry.capturesSucceeded++;
      document.getElementById("txt-recording").textContent = "REC: " + this._frameCount;
      return true;
    } catch (error) { this._telemetry.capturesErrored++; console.error("Capture error:", error); return false; }
  }

  async _encodeAndWriteFrameSync(pixels, width, height, frameIndex) {
    var encStart = performance.now();
    this._telemetry.encodesStarted++;
    try {
      this._ensureTempCanvas(width, height);
      var ctx = this._tempCtx;
      var pixelCopy = new Uint8ClampedArray(pixels);
      var imageData = new ImageData(pixelCopy, width, height);
      ctx.putImageData(imageData, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, -1, 0, height); ctx.drawImage(this._tempCanvas, 0, 0); ctx.restore();
      
      var blob;
      if (this._tempCanvas.convertToBlob) {
        blob = await this._tempCanvas.convertToBlob({ type: 'image/png' });
      } else {
        blob = await new Promise(function(resolve) { this._tempCanvas.toBlob(resolve, 'image/png'); }.bind(this));
      }
      
      // Update preview thumbnail every 5th frame during recording
      if (frameIndex % 5 === 0) {
        var previewCanvas = document.getElementById("preview-canvas");
        if (previewCanvas) {
          var tImg = new Image();
          tImg.onload = function() {
            var tCtx = previewCanvas.getContext("2d");
            previewCanvas.width = width;
            previewCanvas.height = height;
            tCtx.drawImage(tImg, 0, 0, width, height);
          };
          tImg.src = URL.createObjectURL(blob);
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
}