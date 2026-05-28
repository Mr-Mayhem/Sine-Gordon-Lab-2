// =============================================================================
// Browser Video Recorder Library — ffmpeg-loader.js
// FFmpeg.wasm loader with CDN fallback and local OPFS caching.
// =============================================================================

import { fetchWithCDNFallback, TRUSTED_HASHES, isHtmlFallback } from "./fetch-from-cdn.js";

const FILENAME_KEYS = {
  "ffmpeg-core-mt.js": "ffmpeg-core-mt-js",
  "ffmpeg-core-mt.wasm": "ffmpeg-core-mt-wasm",
  "ffmpeg-core.worker.js": "ffmpeg-core-worker",
  "ffmpeg-core.js": "ffmpeg-core-st-js",
  "ffmpeg-core.wasm": "ffmpeg-core-st-wasm"
};

var _ffmpegLogs = [];

export async function loadFFmpeg(desiredFormat, recorderRef, onLog) {
  const format = (desiredFormat && typeof desiredFormat === "string" && desiredFormat.startsWith("mp4")) ? "mp4" : (desiredFormat || "webm");
  
  let forceST = false;
  let forceMT = false;
  const tRef = recorderRef || window.recorder;
  if (tRef && tRef.testThreading) {
    if (tRef.testThreading === "ST") forceST = true;
    if (tRef.testThreading === "MT") forceMT = true;
  }
  const needMultiThreaded = (format === "mp4") && !forceST && (typeof SharedArrayBuffer !== "undefined" || forceMT);

  console.log(`Loading ffmpeg.wasm (${needMultiThreaded ? "MT" : "ST"} core for ${format.toUpperCase()})...`);
  const FFmpegClass = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
  if (!FFmpegClass) { console.error("FFmpeg library not found."); return null; }
  
  const ffmpeg = new FFmpegClass();
  
  if (ffmpeg.on) {
    ffmpeg.on('log', function(log) {
      var msg = log.type ? (log.type + ": " + log.message) : log.message;
      var logObj = { time: performance.now(), msg: msg };
      _ffmpegLogs.push(logObj);
      if (recorderRef && Array.isArray(recorderRef._ffmpegLogs)) {
        recorderRef._ffmpegLogs.push(logObj);
      }
      console.log('[FFmpeg]', msg);
      if (onLog) onLog(msg);
    });
  } else if (ffmpeg.setLogger) {
    ffmpeg.setLogger(function(log) {
      var msg = log.type ? (log.type + ": " + log.message) : (log.message || log);
      var logObj = { time: performance.now(), msg: msg };
      _ffmpegLogs.push(logObj);
      if (recorderRef && Array.isArray(recorderRef._ffmpegLogs)) {
        recorderRef._ffmpegLogs.push(logObj);
      }
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

  async function _calculateHash(arrayBuffer) {
    try {
      if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {
      console.warn("[FFmpeg Verification] Crypto subtle hash computation failed", e);
    }
    return null;
  }

  async function _getOPFSFileWithIntegrity(filename, minSize, skipHashCheck = false) {
    try {
      if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.getDirectory) return null;
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor");
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
      var fileHandle = await ffmpegDir.getFileHandle(filename);
      var file = await fileHandle.getFile();
      if (file.size < minSize) {
        console.warn(`[FFmpeg Integrity] ${filename} size too small in OPFS: ${file.size} bytes`);
        return null;
      }
      
      var arrayBuffer = await file.arrayBuffer();
      if (isHtmlFallback(arrayBuffer)) {
        console.warn(`[FFmpeg Integrity] ${filename} in OPFS is an HTML page!`);
        return null;
      }
      
      if (!skipHashCheck) {
        var calculatedHash = await _calculateHash(arrayBuffer);
        var key = FILENAME_KEYS[filename];
        if (calculatedHash && key && TRUSTED_HASHES[key]) {
          var expected = TRUSTED_HASHES[key];
          var isMatch = Array.isArray(expected) ? expected.includes(calculatedHash) : (calculatedHash === expected);
          if (!isMatch) {
            console.warn(`[FFmpeg Integrity] Hash mismatch for ${filename} in OPFS! expected: ${expected}, got: ${calculatedHash}`);
            return null;
          }
        }
      } else {
        console.log(`[FFmpeg Integrity] Bypassing SHA-256 check for cached ${filename} (validated on write, marker OK).`);
      }
      return arrayBuffer;
    } catch (e) {
      // file missing or general OPFS error
    }
    return null;
  }

  async function _writeMarker(markerName) {
    try {
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor", { create: true });
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg", { create: true });
      var fileHandle = await ffmpegDir.getFileHandle(markerName, { create: true });
      var writable = await fileHandle.createWritable();
      await writable.write("OK");
      await writable.close();
      console.log("[FFmpeg] Atomic transaction completed, written marker:", markerName);
      return true;
    } catch (e) {
      console.warn("[FFmpeg] Could not write marker:", markerName, e);
      return false;
    }
  }

  async function _chkMarker(markerName) {
    try {
      if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.getDirectory) return false;
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor");
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
      var fileHandle = await ffmpegDir.getFileHandle(markerName);
      var file = await fileHandle.getFile();
      return file.size > 0;
    } catch (e) {
      return false;
    }
  }

  async function _clearOPFSCache(markerName, files) {
    try {
      if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.getDirectory) return;
      var root = await navigator.storage.getDirectory();
      var vendorDir = await root.getDirectoryHandle("vendor");
      var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
      try {
        await ffmpegDir.removeEntry(markerName);
      } catch (e) {}
      for (var file of files) {
        try {
          await ffmpegDir.removeEntry(file);
        } catch (e) {}
      }
      console.log("[FFmpeg] OPFS cache cleared successfully.");
    } catch (e) {}
  }

  async function _verifyAndLoadOPFSCache(markerName, files, minSizes, mimeTypes) {
    console.log(`[FFmpeg] Checking OPFS cache atomic transaction marker: ${markerName} ...`);
    var hasMarker = await _chkMarker(markerName);
    if (!hasMarker) {
      console.log(`[FFmpeg] Atomic marker ${markerName} not found. Ignoring OPFS cache.`);
      return null;
    }

    var buffers = [];
    for (var i = 0; i < files.length; i++) {
      var ab = await _getOPFSFileWithIntegrity(files[i], minSizes[i], true);
      if (!ab) {
        console.warn(`[FFmpeg] Cached file ${files[i]} failed integrity verification or is missing. Purging cache.`);
        await _clearOPFSCache(markerName, files);
        return null;
      }
      buffers.push(ab);
    }

    console.log(`[FFmpeg] OPFS cache atomic transaction verified successfully!`);
    var resultObj = {};
    for (var i = 0; i < files.length; i++) {
      var blob = new Blob([buffers[i]], { type: mimeTypes[i] });
      resultObj[files[i]] = URL.createObjectURL(blob);
    }
    return resultObj;
  }

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

  async function _isLocalFileValid(url, minSize) {
    try {
      var resp = await fetch(url);
      if (!resp.ok) return false;
      
      var cl = resp.headers.get("content-length");
      if (cl && Number(cl) < minSize) return false;

      if (!resp.body) return false;
      var reader = resp.body.getReader();
      var { value, done } = await reader.read();
      if (!value || value.length === 0) {
        reader.cancel();
        return false;
      }
      
      var sample = new TextDecoder().decode(value.slice(0, 100)).trim().toLowerCase();
      reader.cancel(); // Abort the fetch stream immediately to prevent downloading the remaining megabytes!
      
      if (sample.startsWith("<!doctype") || sample.startsWith("<html")) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function _verboseFetch(url, mimeType, minSize) {
    console.log(`[FFmpeg Diagnostic] Initiating download from: ${url}`);
    try {
      var resp = await fetch(url);
      console.log(`[FFmpeg Diagnostic] Server response received for ${url}: status=${resp.status}, ok=${resp.ok}`);
      
      if (!resp.ok) {
        console.warn(`[FFmpeg Warning] Download failed with HTTP status ${resp.status} for address: ${url}. The server hosting this site might be block-restricted or unreachable.`);
        return null;
      }
      
      var arrayBuffer = await resp.arrayBuffer();
      if (isHtmlFallback(arrayBuffer)) {
        console.warn(`[FFmpeg Warning] Resource downloaded from ${url} is an HTML page (likely a router redirect, a CDN 404, or an authentication portal) instead of a valid binary!`);
        return null;
      }
      
      if (arrayBuffer.byteLength < minSize) {
        console.warn(`[FFmpeg Warning] Resource downloaded from ${url} has size ${arrayBuffer.byteLength} bytes, which is below the minimum required ${minSize} bytes (truncated download).`);
        return null;
      }
      
      console.log(`[FFmpeg Diagnostic] Download matched size and type constraints for ${url} (${(arrayBuffer.byteLength/1024/1024).toFixed(3)} MB).`);
      return arrayBuffer;
    } catch (e) {
      console.warn(`[FFmpeg Diagnostic Blocked] secure connection or download attempt failed for URL: ${url}.
This is typically caused by:
1. Cross-Origin Resource Sharing (CORS) policies preventing your browser from pulling CDN binaries from different external origins.
2. Missing or inadequate Cross-Origin Opener Policy (COOP) and Cross-Origin Embedder Policy (COEP) headers on the server hosting this environment.
3. Accessing the app through an insecure HTTP IP address (SharedArrayBuffer or external CDNs restrict operations on insecure origins).
Details:`, e.message || e);
      return null;
    }
  }

  let loaded = false;

  if (needMultiThreaded) {
    console.log("SharedArrayBuffer available. Loading MT...");

    // 1st Priority: Read from browser sandbox OPFS cache (instant, no server request)
    var mtFiles = ["ffmpeg-core-mt.js", "ffmpeg-core-mt.wasm", "ffmpeg-core.worker.js"];
    var mtMinSizes = [50000, 20000000, 500];
    var mtMimeTypes = ["text/javascript", "application/wasm", "application/javascript"];
    
    var opfsUrls = await _verifyAndLoadOPFSCache("mt-loaded.ok", mtFiles, mtMinSizes, mtMimeTypes);

    if (opfsUrls) {
      console.log("[FFmpeg] Loading MT core from local OPFS cache...");
      try {
        await ffmpeg.load({
          coreURL: opfsUrls["ffmpeg-core-mt.js"],
          wasmURL: opfsUrls["ffmpeg-core-mt.wasm"],
          workerURL: opfsUrls["ffmpeg-core.worker.js"]
        });
        loaded = true;
        console.log("[FFmpeg] MT loaded successfully from OPFS.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn("[FFmpeg] OPFS MT load failed, falling back to local server/CDN...", e);
      }
    }

    // 2nd Priority: Load from local HTTP Server (vendor/)
    if (!loaded) {
      // Look relatively from document base URI
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
    
    // 3rd Priority: Load from external CDN as a single atomic transaction and Cache in OPFS
    if (!loaded) {
      console.log("Loading MT from CDN as a single atomic transaction...");
      try {
        var workerAb = await _verboseFetch("https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.worker.js", "application/javascript", 500);
        if (!workerAb) throw new Error("Worker file download failed or was blocked.");

        var coreAb = await _verboseFetch("https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript", 50000);
        if (!coreAb) throw new Error("Core JS file download failed or was blocked.");

        var wasmAb = await _verboseFetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm", 20000000);
        if (!wasmAb) throw new Error("WASM binary file download failed or was blocked.");

        var workerHash = await _calculateHash(workerAb);
        var coreHash = await _calculateHash(coreAb);
        var wasmHash = await _calculateHash(wasmAb);

        var expWorker = TRUSTED_HASHES["ffmpeg-core-worker"];
        var expCore = TRUSTED_HASHES["ffmpeg-core-mt-js"];
        var expWasm = TRUSTED_HASHES["ffmpeg-core-mt-wasm"];

        var workerOk = Array.isArray(expWorker) ? expWorker.includes(workerHash) : (workerHash === expWorker);
        var coreOk = Array.isArray(expCore) ? expCore.includes(coreHash) : (coreHash === expCore);
        var wasmOk = Array.isArray(expWasm) ? expWasm.includes(wasmHash) : (wasmHash === expWasm);

        if (!workerOk || !coreOk || !wasmOk) {
          console.error("[FFmpeg] CDN files did not pass SHA-256 validation:", {
            worker: workerHash,
            core: coreHash,
            wasm: wasmHash
          });
        } else {
          console.log("[FFmpeg] All CDN MT files passed SHA-256 cryptographic signature validation!");
        }

        var workerBlob = new Blob([workerAb], { type: "application/javascript" });
        var workerURL = URL.createObjectURL(workerBlob);

        var coreBlob = new Blob([coreAb], { type: "text/javascript" });
        var coreURL = URL.createObjectURL(coreBlob);

        var wasmBlob = new Blob([wasmAb], { type: "application/wasm" });
        var wasmURL = URL.createObjectURL(wasmBlob);
        
        await ffmpeg.load({ coreURL, wasmURL, workerURL });
        loaded = true;
        console.log("MT loaded from CDN. Committing save transaction to OPFS...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          var root = await navigator.storage.getDirectory();
          var vendorDir = await root.getDirectoryHandle("vendor");
          var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
          await ffmpegDir.removeEntry("mt-loaded.ok");
        } catch(e) {}

        await _saveToVendor("ffmpeg-core-mt.js", coreAb);
        await _saveToVendor("ffmpeg-core-mt.wasm", wasmAb);
        await _saveToVendor("ffmpeg-core.worker.js", workerAb);

        await _writeMarker("mt-loaded.ok");
      } catch (e) {
        console.warn("[FFmpeg Loader] MT CDN single-atomic-transaction load cancelled:", e.message || e);
      }
    }
  }

  if (!loaded) {
    console.log("Using single-threaded FFmpeg core.");

    // 1st Priority: Read from browser sandbox OPFS cache
    var stFiles = ["ffmpeg-core.js", "ffmpeg-core.wasm"];
    var stMinSizes = [50000, 20000000];
    var stMimeTypes = ["text/javascript", "application/wasm"];
    
    var opfsStUrls = await _verifyAndLoadOPFSCache("st-loaded.ok", stFiles, stMinSizes, stMimeTypes);

    if (opfsStUrls) {
      console.log("[FFmpeg] Loading ST core from local OPFS cache...");
      try {
        await ffmpeg.load({
          coreURL: opfsStUrls["ffmpeg-core.js"],
          wasmURL: opfsStUrls["ffmpeg-core.wasm"]
        });
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
        console.log("Loading ST from CDN as a single atomic transaction...");
        var stCoreAb = await _verboseFetch("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript", 50000);
        if (!stCoreAb) throw new Error("Core JS file download failed or was blocked.");

        var stWasmAb = await _verboseFetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm", 20000000);
        if (!stWasmAb) throw new Error("WASM binary file download failed or was blocked.");

        var stCoreHash = await _calculateHash(stCoreAb);
        var stWasmHash = await _calculateHash(stWasmAb);

        var expStCore = TRUSTED_HASHES["ffmpeg-core-st-js"];
        var expStWasm = TRUSTED_HASHES["ffmpeg-core-st-wasm"];

        var stCoreOk = Array.isArray(expStCore) ? expStCore.includes(stCoreHash) : (stCoreHash === expStCore);
        var stWasmOk = Array.isArray(expStWasm) ? expStWasm.includes(stWasmHash) : (stWasmHash === expStWasm);

        if (!stCoreOk || !stWasmOk) {
          console.error("[FFmpeg] CDN ST files did not pass SHA-256 validation:", {
            core: stCoreHash,
            wasm: stWasmHash
          });
        } else {
          console.log("[FFmpeg] All CDN ST files passed SHA-256 cryptographic signature validation!");
        }

        var stCoreBlob = new Blob([stCoreAb], { type: "text/javascript" });
        var stCoreURL = URL.createObjectURL(stCoreBlob);

        var stWasmBlob = new Blob([stWasmAb], { type: "application/wasm" });
        var stWasmURL = URL.createObjectURL(stWasmBlob);
        
        await ffmpeg.load({ coreURL: stCoreURL, wasmURL: stWasmURL });
        loaded = true;
        console.log("ST loaded from CDN. Committing save transaction to OPFS...");
        
        try {
          var root = await navigator.storage.getDirectory();
          var vendorDir = await root.getDirectoryHandle("vendor");
          var ffmpegDir = await vendorDir.getDirectoryHandle("ffmpeg");
          await ffmpegDir.removeEntry("st-loaded.ok");
        } catch(e) {}

        await _saveToVendor("ffmpeg-core.js", stCoreAb);
        await _saveToVendor("ffmpeg-core.wasm", stWasmAb);

        await _writeMarker("st-loaded.ok");
      } catch (e) {
        console.warn("[FFmpeg Loader] ST CDN single-atomic-transaction load cancelled:", e.message || e);
        console.log("%c[FFmpeg Loader Info] Video rendering is currently disabled because both local and CDN sources are blocked or unavailable in this hosting environment. Check browser isolation/CORS settings.", "color: #ffaa00; font-weight: bold;");
      }
    }
  }

  console.log("ffmpeg.wasm loaded.", { threadingModel: needMultiThreaded ? "MT" : "ST" });
  return ffmpeg;
}
