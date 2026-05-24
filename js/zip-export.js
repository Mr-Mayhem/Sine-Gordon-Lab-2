// =============================================================================
// sine-gordon-lab — js/zip-export.js
// ZIP file export pipeline — handles OPFS buffering, JSZip streaming,
// and File System Access API / FileSaver download triggers.
// Uses vendor/jszip/jszip.min.js (window.JSZip) and
// vendor/file-saver/FileSaver.min.js (window.saveAs).
// =============================================================================

export async function exportToZip(dirHandle, zip, btnVideo, refreshUI) {
  if (dirHandle) {
    console.log("Generating ZIP file(s) from OPFS buffer...");
    if (btnVideo) btnVideo.textContent = "Zipping... 0%";
    
    let zipFilename = `frames_${Date.now()}.zip`;
    let saveHandle = null;
    if (window.showSaveFilePicker) {
        try {
            saveHandle = await window.showSaveFilePicker({
                suggestedName: zipFilename,
                id: 'zip-export-single',
                types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }]
            });
        } catch (e) {
            if (e.name !== "AbortError") {
                console.warn("showSaveFilePicker failed early, will fallback to Blob download.", e);
            } else {
                if (btnVideo) btnVideo.textContent = "Canceled";
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
          if(btnVideo) btnVideo.textContent = "Error: No frames";
          return;
      }
      
      if (btnVideo) btnVideo.textContent = `Zipping...`;
      let zip = new window.JSZip();
      Object.defineProperty(zip, "comment", { get: () => "Sine-Gordon Lab recording" });
      
      for (let f of frameFiles) {
          const file = await f.handle.getFile();
          zip.file(f.name, file);
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
                  });
                  window.saveAs(content, zipFilename);
              }
          }
      } else {
          let content = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
              if (btnVideo) btnVideo.textContent = "Zipping... " + meta.percent.toFixed(0) + "%";
          });
          window.saveAs(content, zipFilename);
      }
      
      try {
         const root = await navigator.storage.getDirectory();
         await root.removeEntry(dirHandle.name, { recursive: true });
      } catch(e) {}
      
      if (btnVideo) {
          btnVideo.textContent = "✓ Saved!";
          btnVideo.classList.remove("btn-warn");
          setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      }
    } catch (e) {
        console.error("ZIP Generation error:", e);
        if (btnVideo) btnVideo.textContent = "Error!";
        setTimeout(() => { if (refreshUI) refreshUI(); }, 2000);
    }
  } else if (zip) {
    console.log("Generating ZIP file from memory buffer...");
    var btnVideo = document.getElementById("btn-video");
    
    if (btnVideo) {
      btnVideo.textContent = "Zipping... 0%";
    }
    
    zip.generateAsync({ 
      type: "blob",
      compression: "STORE"
    }, function updateCallback(metadata) {
      if (btnVideo) {
        btnVideo.textContent = "Zipping... " + metadata.percent.toFixed(0) + "%";
      }
    }).then(async function(content) {
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: "frames_" + Date.now() + ".zip",
            id: 'zip-export',
            types: [{ description: 'ZIP Files', accept: { 'application/zip': ['.zip'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          console.log("ZIP saved with File System Access API.");
        } catch (e) {
          console.warn("Save file picker aborted/failed, falling back", e);
          window.saveAs(content, "frames_" + Date.now() + ".zip");
        }
      } else {
        window.saveAs(content, "frames_" + Date.now() + ".zip");
        console.log("ZIP downloaded.");
      }
      if (btnVideo) {
        btnVideo.textContent = "✓ Saved!";
        btnVideo.classList.remove("btn-warn");
        setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      }
    }).catch(function(err) {
      console.error("ZIP Generation error:", err);
      if (btnVideo) btnVideo.textContent = "Error!";
      setTimeout(function() { if (refreshUI) refreshUI(); }, 2000);
      alert("Failed to create ZIP: " + err.message);
    });
  }
}