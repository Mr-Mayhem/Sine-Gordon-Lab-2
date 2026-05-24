// =============================================================================
// sine-gordon-lab — js/ffmpeg-loader.js
// FFmpeg.wasm loader with CDN fallback and local OPFS caching.
// After first successful CDN load, files are saved to vendor/ for future use.
// MT (multi-threaded): all Blob URLs from CDN for pthread origin matching.
// ST (single-threaded): direct local URLs or CDN Blobs.
// =============================================================================

import { fetchWithCDNFallback } from "./fetch-from-cdn.js";

var _ffmpegLogs = [];

export async function loadFFmpeg(desiredFormat, recorderRef, onLog) {
  const format = desiredFormat || "webm";
  const needMultiThreaded = (format === "mp4") && (typeof SharedArrayBuffer !== "undefined");

  console.log(`Loading ffmpeg.wasm (${needMultiThreaded ? "MT" : "ST"} core for ${format.toUpperCase()})...`);
  const FFmpegClass = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
  if (!FFmpegClass) { console.error("FFmpeg library not found."); return null; }
  
  const ffmpeg = new FFmpegClass();
  
  if (ffmpeg.on && onLog) {
    ffmpeg.on('log', function(log) {
      var msg = log.type ? (log.type + ": " + log.message) : log.message;
      _ffmpegLogs.push({ time: performance.now(), msg: msg });
      console.log('[FFmpeg]', msg);
      if (onLog) onLog(msg);
    });
  } else if (ffmpeg.setLogger && onLog) {
    ffmpeg.setLogger(function(log) {
      var msg = log.type ? (log.type + ": " + log.message) : log;
      _ffmpegLogs.push({ time: performance.now(), msg: msg });
      console.log('[FFmpeg]', msg);
      if (onLog) onLog(msg);
    });
  }

  window.showHUDToast = function(message, type) {
    var prefix = type === 'success' ? '✓' : type === 'error' || type === 'security-alert' ? '🚨' : type === 'warn' ? '⚠' : 'ℹ';
    console.log('[FFmpeg Integrity]', prefix, message);
  };

  window.paintLog = function(message, type) {
    var prefix = type === 'success' ? '[✓ OK]' : type === 'error' || type === 'security-alert' ? '[🚨 FAIL]' : type === 'warn' ? '[warn]' : '[info]';
    console.log('[FFmpeg Diagnostic]', prefix, message);
  };

  async function _saveToVendor(filename, data) {
    try {
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor", { create: true });
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg", { create: true });
      var fileHandle = await ffmpegDir.getFileHandle(filename, { create: true });
      var writable = await fileHandle.createWritable();
      if (typeof data === "string") {
        await writable.write(data);
      } else {
        await writable.write(data);
      }
      await writable.close();
      console.log("[FFmpeg] Cached to vendor:", filename);
      return true;
    } catch (e) {
      console.warn("[FFmpeg] Could not cache to vendor:", filename, e);
      return false;
    }
  }

  async function _getOPFSFileBlobURL(filename, mimeType, minSize) {
    try {
      if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.getDirectory) return null;
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor");
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
      var fileHandle = await ffmpegDir.getFileHandle(filename);
      var file = await fileHandle.getFile();
      if (file.size >= minSize) {
        console.log(`[FFmpeg] Found ${filename} in browser OPFS storage.`);
        return URL.createObjectURL(file);
      }
    } catch (e) {
      // not cached in OPFS
    }
    return null;
  }

  async function _isLocalFileValid(url, minSize) {
    try {
      var resp = await fetch(url);
      if (!resp.ok) return false;
      var ab = await resp.arrayBuffer();
      if (ab.byteLength < minSize) return false;
      var sample = new TextDecoder().decode(new Uint8Array(ab.slice(0, 100))).trim().toLowerCase();
      if (sample.startsWith("<!doctype") || sample.startsWith("<html")) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  let loaded = false;

  if (needMultiThreaded) {
    console.log("SharedArrayBuffer available. Loading MT...");

    // 1st Priority: Read from browser sandbox OPFS cache (instant, no server request)
    var opfsCore = await _getOPFSFileBlobURL("ffmpeg-core-mt.js", "text/javascript", 50000);
    var opfsWasm = await _getOPFSFileBlobURL("ffmpeg-core-mt.wasm", "application/wasm", 20000000);
    var opfsWorker = await _getOPFSFileBlobURL("ffmpeg-core.worker.js", "application/javascript", 1000);

    if (opfsCore && opfsWasm && opfsWorker) {
      console.log("[FFmpeg] Loading MT core from local OPFS cache...");
      try {
        await ffmpeg.load({ coreURL: opfsCore, wasmURL: opfsWasm, workerURL: opfsWorker });
        loaded = true;
        console.log("[FFmpeg] MT loaded successfully from OPFS.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn("[FFmpeg] OPFS MT load failed, falling back to local server/CDN...", e);
      }
    }

    // 2nd Priority: Load from local HTTP Server (vendor/)
    if (!loaded) {
      var mtCoreJsLocal = new URL("vendor/ffmpeg/ffmpeg-core-mt.js?v=fresh10", document.baseURI).href;
      var mtWasmLocal = new URL("vendor/ffmpeg/ffmpeg-core-mt.wasm?v=fresh12", document.baseURI).href;
      var mtWorkerLocal = new URL("vendor/ffmpeg/ffmpeg-core.worker.js?v=fresh11", document.baseURI).href;
      
      var localCoreJsOk = await _isLocalFileValid(mtCoreJsLocal, 50000);
      var localWasmOk = await _isLocalFileValid(mtWasmLocal, 20000000);
      var localWorkerOk = await _isLocalFileValid(mtWorkerLocal, 1000);
      
      if (localCoreJsOk && localWasmOk && localWorkerOk) {
        console.log("All MT files valid locally. Loading from vendor...");
        try {
          await ffmpeg.load({ coreURL: mtCoreJsLocal, wasmURL: mtWasmLocal, workerURL: mtWorkerLocal });
          loaded = true;
          console.log("MT loaded from local server.");
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          console.warn("Local MT server load failed:", e);
        }
      }
    }
    
    // 3rd Priority: Load from external CDN and Cache in OPFS
    if (!loaded) {
      console.log("Loading MT from CDN and caching...");
      try {
        var workerResp = await fetch("https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.worker.js");
        var workerText = await workerResp.text();
        var workerBlob = new Blob([workerText], { type: "application/javascript" });
        var workerURL = URL.createObjectURL(workerBlob);
        
        var coreResp = await fetch("https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.js");
        var coreAb = await coreResp.arrayBuffer();
        var coreBlob = new Blob([coreAb], { type: "text/javascript" });
        var coreURL = URL.createObjectURL(coreBlob);
        
        var wasmResp = await fetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.wasm");
        var wasmAb = await wasmResp.arrayBuffer();
        var wasmBlob = new Blob([wasmAb], { type: "application/wasm" });
        var wasmURL = URL.createObjectURL(wasmBlob);
        
        await ffmpeg.load({ coreURL, wasmURL, workerURL });
        loaded = true;
        console.log("MT loaded from CDN. Caching to vendor...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        _saveToVendor("ffmpeg-core-mt.js", coreAb);
        _saveToVendor("ffmpeg-core-mt.wasm", wasmAb);
        _saveToVendor("ffmpeg-core.worker.js", workerText);
      } catch (e) {
        console.warn("MT CDN load failed:", e);
      }
    }
  }

  if (!loaded) {
    console.log("Using single-threaded FFmpeg core.");

    // 1st Priority: Read from browser sandbox OPFS cache
    var opfsStCore = await _getOPFSFileBlobURL("ffmpeg-core.js", "text/javascript", 50000);
    var opfsStWasm = await _getOPFSFileBlobURL("ffmpeg-core.wasm", "application/wasm", 20000000);

    if (opfsStCore && opfsStWasm) {
      console.log("[FFmpeg] Loading ST core from local OPFS cache...");
      try {
        await ffmpeg.load({ coreURL: opfsStCore, wasmURL: opfsStWasm });
        loaded = true;
        console.log("[FFmpeg] ST loaded successfully from OPFS.");
      } catch (e) {
        console.warn("[FFmpeg] OPFS ST load failed, falling back...", e);
      }
    }
    
    // 2nd Priority: Load from local HTTP Server (vendor/)
    if (!loaded) {
      var stCoreJsLocal = new URL("vendor/ffmpeg/ffmpeg-core.js?v=fresh10", document.baseURI).href;
      var stWasmLocal = new URL("vendor/ffmpeg/ffmpeg-core.wasm", document.baseURI).href;
      
      var stCoreJsOk = await _isLocalFileValid(stCoreJsLocal, 50000);
      var stWasmOk = await _isLocalFileValid(stWasmLocal, 20000000);
      
      if (stCoreJsOk && stWasmOk) {
        try {
          await ffmpeg.load({ coreURL: stCoreJsLocal, wasmURL: stWasmLocal });
          loaded = true;
          console.log("ST loaded from local server.");
        } catch (e) {
          console.warn("Local ST server load failed:", e);
        }
      }
    }
    
    // 3rd Priority: Load from external CDN and Cache in OPFS
    if (!loaded) {
      try {
        var stCoreResp = await fetch("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js");
        var stCoreAb = await stCoreResp.arrayBuffer();
        var stCoreBlob = new Blob([stCoreAb], { type: "text/javascript" });
        var stCoreURL = URL.createObjectURL(stCoreBlob);
        
        var stWasmResp = await fetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm");
        var stWasmAb = await stWasmResp.arrayBuffer();
        var stWasmBlob = new Blob([stWasmAb], { type: "application/wasm" });
        var stWasmURL = URL.createObjectURL(stWasmBlob);
        
        await ffmpeg.load({ coreURL: stCoreURL, wasmURL: stWasmURL });
        loaded = true;
        console.log("ST loaded from CDN. Caching to vendor...");
        
        _saveToVendor("ffmpeg-core.js", stCoreAb);
        _saveToVendor("ffmpeg-core.wasm", stWasmAb);
      } catch (e) {
        console.error("All FFmpeg loading configurations failed!");
        throw e;
      }
    }
  }

  console.log("ffmpeg.wasm loaded.", { threadingModel: needMultiThreaded ? "MT" : "ST" });
  return ffmpeg;
}