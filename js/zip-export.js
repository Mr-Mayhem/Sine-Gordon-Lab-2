// =============================================================================
// sine-gordon-lab — js/zip-export.js
// ZIP file export pipeline — handles OPFS buffering, JSZip streaming,
// and File System Access API / FileSaver download triggers.
// Uses vendor/jszip/jszip.min.js (window.JSZip) and
// vendor/file-saver/FileSaver.min.js (window.saveAs).
// =============================================================================

export async function getLastZipHandle() {
  if (window._lastZipHandle) {
    console.log("[ZIP Cache] Retrieved window._lastZipHandle in-memory: " + window._lastZipHandle.name);
    return window._lastZipHandle;
  }
  try {
    const handle = await new Promise((resolve) => {
      const request = indexedDB.open("sine_gordon_lab_db", 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore("handles");
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        try {
          const tx = db.transaction("handles", "readonly");
          const store = tx.objectStore("handles");
          const getReq = store.get("lastZipHandle");
          getReq.onsuccess = () => {
            resolve(getReq.result || null);
          };
          getReq.onerror = () => resolve(null);
        } catch (_) { resolve(null); }
      };
      request.onerror = () => resolve(null);
    });
    if (handle) {
      console.log("[ZIP Cache] Retrieved handle from IndexedDB: " + handle.name);
    } else {
      console.log("[ZIP Cache] No handle stored in IndexedDB yet.");
    }
    return handle;
  } catch (e) {
    console.warn("[ZIP Cache] Failed to load handle from IndexedDB:", e);
    return null;
  }
}

export async function setLastZipHandle(handle) {
  window._lastZipHandle = handle;
  if (handle) {
    console.log("[ZIP Cache] Saving last ZIP handle to memory/DB: " + handle.name);
  }
  try {
    await new Promise((resolve) => {
      const request = indexedDB.open("sine_gordon_lab_db", 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore("handles");
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        try {
          const tx = db.transaction("handles", "readwrite");
          const store = tx.objectStore("handles");
          store.put(handle, "lastZipHandle");
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) { resolve(); }
      };
      request.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("[ZIP Cache] Failed to save handle to IndexedDB:", e);
  }
}

export async function exportToZip(dirHandle, zip, btnVideo, refreshUI, recorderRef) {
  if (recorderRef) recorderRef.isAssembling = true;
  if (dirHandle) {
    console.log("Generating ZIP file(s) from OPFS buffer...");
    if (btnVideo) btnVideo.textContent = "Zipping... 0%";
    
    let zipFilename = `frames_${Date.now()}.zip`;
    let saveHandle = null;
    if (window.showSaveFilePicker) {
        try {
            const lastHandle = await getLastZipHandle();
            const pickerOpts = {
                suggestedName: zipFilename,
                types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }]
            };
            if (lastHandle) {
                console.log("[ZIP Picker] Direct save startIn handle named: " + lastHandle.name);
                pickerOpts.startIn = lastHandle;
            } else {
                console.log("[ZIP Picker] Direct save startIn fallback: downloads");
                pickerOpts.startIn = 'downloads';
            }
            saveHandle = await window.showSaveFilePicker(pickerOpts);
            if (saveHandle) {
                console.log("[ZIP Picker] Chosen file name: " + saveHandle.name);
                try { await setLastZipHandle(saveHandle); } catch (_) {}
            }
        } catch (e) {
            if (e.name !== "AbortError") {
                console.warn("showSaveFilePicker failed early, will fallback to Blob download.", e);
            } else {
                console.log("[ZIP Picker] Save file picker canceled by user.");
                if (btnVideo) btnVideo.textContent = "Canceled";
                if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
                    console.log("[ZIP Export] Returning canvas size back to normal viewing resolution.");
                    recorderRef._restoreCanvasSize();
                }
                if (recorderRef) recorderRef.isAssembling = false;
                const overlay = document.getElementById("processing-overlay");
                if (overlay) overlay.style.display = "none";
                setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
                return;
            }
        }
    }
    
    try {
      let frameFiles = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file" && name.startsWith("frame_") && name.endsWith(".png")) {
          frameFiles.push({ name, handle });
        }
      }
      frameFiles.sort((a,b) => a.name.localeCompare(b.name));
      
      if (frameFiles.length === 0) {
          if (btnVideo) btnVideo.textContent = "Error: No frames";
          const overlay = document.getElementById("processing-overlay");
          if (overlay) overlay.style.display = "none";
          return;
      }
      
      const overlay = document.getElementById("processing-overlay");
      if (overlay) overlay.style.display = "flex";
      const statusEl = document.getElementById("assembly-status");
      if (statusEl) statusEl.innerHTML = "<strong>Mode:</strong> stills-to-zip<br><strong>Phase:</strong> Packaging ZIP...";
      const percentEl = document.getElementById("assembly-percent");
      const fill = document.getElementById("progress-fill");
      if (percentEl) percentEl.textContent = "0%";
      if (fill) fill.style.width = "0%";
      const previewCanvas = document.getElementById("preview-canvas");

      console.log("[ZIP Export] Activity Mode: stills-to-zip (OPFS to ZIP)");
      if (btnVideo) btnVideo.textContent = `Zipping...`;
      let zip = new window.JSZip();
      Object.defineProperty(zip, "comment", { get: () => "Sine-Gordon Lab recording" });
      
      for (let i = 0; i < frameFiles.length; i++) {
          let f = frameFiles[i];
          const file = await f.handle.getFile();
          zip.file(f.name, file);
          
          if (i % 10 === 0 && previewCanvas) {
              try {
                  const tUrl = URL.createObjectURL(file);
                  const tImg = new Image();
                  tImg.onload = function() {
                      const ctx = previewCanvas.getContext("2d");
                      if (ctx) {
                          previewCanvas.width = tImg.naturalWidth;
                          previewCanvas.height = tImg.naturalHeight;
                          ctx.drawImage(tImg, 0, 0, tImg.naturalWidth, tImg.naturalHeight);
                      }
                      URL.revokeObjectURL(tUrl);
                  };
                  tImg.src = tUrl;
              } catch (err) {
                  console.error("[ZIP Export] Upstream thumbnail generation failed:", err);
              }
          }
          
          if (percentEl) {
              const pct = Math.floor(((i + 1) / frameFiles.length) * 100);
              percentEl.textContent = pct + "%";
              if (fill) fill.style.width = pct + "%";
          }
      }
      
      if (saveHandle) {
          try {
              const writable = await saveHandle.createWritable();
              
              await new Promise((resolve, reject) => {
                  const BUFFER_SIZE = 10 * 1024 * 1024;
                  const doubleBuffer = [new Uint8Array(BUFFER_SIZE), new Uint8Array(BUFFER_SIZE)];
                  let activeBufferIdx = 0;
                  let ptr = 0;
                  
                  let writePromise = Promise.resolve();
                  let chunkCount = 0;
                  let stageDataCount = 0;
                  let totalBytesWritten = 0;
 
                  let zipStream = zip.generateInternalStream({ type: "uint8array", compression: "STORE" });
                  
                  zipStream.on('data', async function(data, metadata) {
                      zipStream.pause();
                      try {
                          stageDataCount++;
                          
                          if (ptr + data.byteLength > BUFFER_SIZE) {
                              await writePromise;
                              
                              const bytesToWrite = ptr;
                              const bufferToWriteIdx = activeBufferIdx;
                              chunkCount++;
                              
                              console.log(`[ZIP Export] Writing chunk ${chunkCount}: ${(bytesToWrite/1024/1024).toFixed(2)} MB (${metadata.percent.toFixed(1)}%)`);
                              
                              writePromise = writable.write(doubleBuffer[bufferToWriteIdx].subarray(0, bytesToWrite));
                              totalBytesWritten += bytesToWrite;
                              
                              activeBufferIdx = (activeBufferIdx + 1) % 2;
                              ptr = 0;
                          }
                          
                          if (data.byteLength > BUFFER_SIZE) {
                              await writePromise;
                              chunkCount++;
                              console.log(`[ZIP Export] Direct write chunk ${chunkCount}: ${(data.byteLength/1024/1024).toFixed(2)} MB`);
                              writePromise = writable.write(data);
                              totalBytesWritten += data.byteLength;
                          } else {
                              doubleBuffer[activeBufferIdx].set(data, ptr);
                              ptr += data.byteLength;
                          }
                          
                          if (btnVideo) {
                              btnVideo.textContent = "Zipping... " + metadata.percent.toFixed(0) + "%";
                          }
                          if (percentEl) {
                              percentEl.textContent = metadata.percent.toFixed(0) + "%";
                              if (fill) fill.style.width = metadata.percent.toFixed(0) + "%";
                          }
                          zipStream.resume();
                      } catch(e) { reject(e); }
                  })
                  .on('end', async function() {
                      try {
                          await writePromise;
                          if (ptr > 0) {
                              chunkCount++;
                              console.log(`[ZIP Export] Final chunk ${chunkCount}: ${(ptr/1024/1024).toFixed(2)} MB (100%)`);
                              await writable.write(doubleBuffer[activeBufferIdx].subarray(0, ptr));
                              totalBytesWritten += ptr;
                          }
                          await writable.close();
                          console.log(`[ZIP Export] Complete: ${chunkCount} writes, ${(totalBytesWritten/1024/1024).toFixed(2)} MB total`);
                          if (saveHandle) {
                              try { await setLastZipHandle(saveHandle); } catch (eh) {}
                          }
                          resolve();
                      } catch(e) { reject(e); }
                  })
                  .on('error', reject);
                  
                  zipStream.resume();
              });
              
          } catch (e) {
              if (e.name !== "AbortError") {
                  console.warn("showSaveFilePicker failed, trying Blob approach", e);
                  let content = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
                      if (btnVideo) btnVideo.textContent = "Zipping... " + meta.percent.toFixed(0) + "%";
                      if (percentEl) {
                          percentEl.textContent = meta.percent.toFixed(0) + "%";
                          if (fill) fill.style.width = meta.percent.toFixed(0) + "%";
                      }
                  });
                  window.saveAs(content, zipFilename);
              }
          }
      } else {
          let content = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
              if (btnVideo) btnVideo.textContent = "Zipping... " + meta.percent.toFixed(0) + "%";
              if (percentEl) {
                  percentEl.textContent = meta.percent.toFixed(0) + "%";
                  if (fill) fill.style.width = meta.percent.toFixed(0) + "%";
              }
          });
          window.saveAs(content, zipFilename);
      }
      
      try {
         const root = await navigator.storage.getDirectory();
         await root.removeEntry(dirHandle.name, { recursive: true });
      } catch(e) {}
      
      if (recorderRef) recorderRef.isAssembling = false;
      if (btnVideo) {
          btnVideo.textContent = "✓ Saved!";
          btnVideo.classList.remove("btn-warn");
          if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
              console.log("[ZIP Export] Returning canvas size back to normal viewing resolution.");
              recorderRef._restoreCanvasSize();
          }
          const overlay = document.getElementById("processing-overlay");
          if (overlay) overlay.style.display = "none";
          setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      }
    } catch (e) {
        console.error("ZIP Generation error:", e);
        if (recorderRef) recorderRef.isAssembling = false;
        if (btnVideo) btnVideo.textContent = "Error!";
        if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
            console.log("[ZIP Export] Returning canvas size back to normal viewing resolution on error.");
            recorderRef._restoreCanvasSize();
        }
        const overlay = document.getElementById("processing-overlay");
        if (overlay) overlay.style.display = "none";
        setTimeout(() => { if (refreshUI) refreshUI(); }, 2000);
    }
  } else if (zip) {
    console.log("Generating ZIP file from memory buffer...");
    var btnVideo = document.getElementById("btn-video");
    
    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "flex";
    const statusEl = document.getElementById("assembly-status");
    if (statusEl) statusEl.innerHTML = "<strong>Mode:</strong> stills-to-zip<br><strong>Phase:</strong> Packaging memory ZIP...";
    const percentEl = document.getElementById("assembly-percent");
    const fill = document.getElementById("progress-fill");
    if (percentEl) percentEl.textContent = "0%";
    if (fill) fill.style.width = "0%";
    const previewCanvas = document.getElementById("preview-canvas");

    console.log("[ZIP Export] Activity Mode: stills-to-zip (RAM to ZIP)");
    if (btnVideo) {
      btnVideo.textContent = "Zipping... 0%";
    }
    
    // Grab the frame names and show 1 in 10 frames max
    let frameNames = Object.keys(zip.files).filter(name => name.startsWith("frame_") && name.endsWith(".png"));
    frameNames.sort((a, b) => a.localeCompare(b));
    
    for (let i = 0; i < frameNames.length; i++) {
        if (i % 10 === 0) {
            try {
                let name = frameNames[i];
                let zi = zip.file(name);
                if (zi && previewCanvas) {
                    let ab = await zi.async("arraybuffer");
                    let fileBlob = new Blob([ab], { type: "image/png" });
                    let tUrl = URL.createObjectURL(fileBlob);
                    let tImg = new Image();
                    await new Promise((resolve) => {
                        tImg.onload = function() {
                            const ctx = previewCanvas.getContext("2d");
                            if (ctx) {
                                previewCanvas.width = tImg.naturalWidth;
                                previewCanvas.height = tImg.naturalHeight;
                                ctx.drawImage(tImg, 0, 0, tImg.naturalWidth, tImg.naturalHeight);
                            }
                            URL.revokeObjectURL(tUrl);
                            resolve();
                        };
                        tImg.onerror = () => { URL.revokeObjectURL(tUrl); resolve(); };
                        tImg.src = tUrl;
                    });
                }
            } catch (err) {
                console.error("[ZIP Export] Memory ZIP preview error:", err);
            }
        }
        if (percentEl) {
            const pct = Math.floor(((i + 1) / frameNames.length) * 100);
            percentEl.textContent = pct + "%";
            if (fill) fill.style.width = pct + "%";
        }
    }
    
    zip.generateAsync({ 
      type: "blob",
      compression: "STORE"
    }, function updateCallback(metadata) {
      if (btnVideo) {
        btnVideo.textContent = "Zipping... " + metadata.percent.toFixed(0) + "%";
      }
      if (percentEl) {
        percentEl.textContent = metadata.percent.toFixed(0) + "%";
        if (fill) fill.style.width = metadata.percent.toFixed(0) + "%";
      }
    }).then(async function(content) {
      if (window.showSaveFilePicker) {
        try {
          const lastHandle = await getLastZipHandle();
          const pickerOpts = {
            suggestedName: "frames_" + Date.now() + ".zip",
            types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }],
          };
          if (lastHandle) {
            console.log("[ZIP Picker] Memory ZIP save startIn handle named: " + lastHandle.name);
            pickerOpts.startIn = lastHandle;
          } else {
            console.log("[ZIP Picker] Memory ZIP save startIn fallback: downloads");
            pickerOpts.startIn = 'downloads';
          }
          const handle = await window.showSaveFilePicker(pickerOpts);
          if (handle) {
            console.log("[ZIP Picker] Chosen file name: " + handle.name);
          }
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          try { await setLastZipHandle(handle); } catch (eh) {}
          console.log("ZIP saved with File System Access API.");
        } catch (e) {
          if (e.name === "AbortError") {
            console.log("[ZIP Picker] Save file picker canceled by user.");
          } else {
            console.warn("Save file picker aborted/failed, falling back", e);
          }
          window.saveAs(content, "frames_" + Date.now() + ".zip");
        }
      } else {
        window.saveAs(content, "frames_" + Date.now() + ".zip");
        console.log("ZIP downloaded.");
      }
      if (btnVideo) {
        btnVideo.textContent = "✓ Saved!";
        btnVideo.classList.remove("btn-warn");
        if (recorderRef) recorderRef.isAssembling = false;
        if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
          console.log("[ZIP Export] Returning canvas size back to normal viewing resolution.");
          recorderRef._restoreCanvasSize();
        }
        const overlay = document.getElementById("processing-overlay");
        if (overlay) overlay.style.display = "none";
        setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      }
    }).catch(function(err) {
      console.error("ZIP Generation error:", err);
      if (recorderRef) recorderRef.isAssembling = false;
      if (btnVideo) btnVideo.textContent = "Error!";
      if (recorderRef && typeof recorderRef._restoreCanvasSize === "function") {
        console.log("[ZIP Export] Returning canvas size back to normal viewing resolution on error.");
        recorderRef._restoreCanvasSize();
      }
      const overlay = document.getElementById("processing-overlay");
      if (overlay) overlay.style.display = "none";
      setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      alert("Failed to create ZIP: " + err.message);
    });
  }
}