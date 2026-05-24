// =============================================================================
// sine-gordon-lab — js/snapshot.js
// Standalone snapshot capture — takes a single frame from the WebGL canvas
// and saves it as a PNG. No dependencies on the recording engine.
// =============================================================================

export default class SnapshotEngine {
    constructor() {
      this._canvas = null;
      this._renderer = null;
      this._gl = null;
      this._pixelBuffer = null;
      this._tempCanvas = null;
      this._tempCtx = null;
    }
  
    init(canvas, renderer) {
      this._canvas = canvas;
      this._renderer = renderer;
      this._gl = renderer.getContext();
  
      if (!this._gl) {
        console.error("SnapshotEngine: WebGL context not available");
        return;
      }
  
      // Allocate pixel buffer at current canvas size
      this._ensurePixelBuffer(canvas.width, canvas.height);
      
      // Create reusable temp canvas for PNG encoding
      this._ensureTempCanvas(canvas.width, canvas.height);
    }
  
    _ensurePixelBuffer(width, height) {
      var needed = width * height * 4;
      if (!this._pixelBuffer || this._pixelBuffer.length !== needed) {
        this._pixelBuffer = new Uint8Array(needed);
      }
    }
  
    _ensureTempCanvas(width, height) {
      if (!this._tempCanvas || this._tempCanvas.width !== width || this._tempCanvas.height !== height) {
        if (typeof OffscreenCanvas !== 'undefined') {
          this._tempCanvas = new OffscreenCanvas(width, height);
        } else {
          this._tempCanvas = document.createElement('canvas');
          this._tempCanvas.width = width;
          this._tempCanvas.height = height;
        }
        this._tempCtx = this._tempCanvas.getContext('2d');
      }
    }
  
    async capture() {
      if (!this._canvas || !this._gl) {
        console.error("SnapshotEngine: not initialized. Call init() first.");
        return;
      }
  
      const width = this._canvas.width;
      const height = this._canvas.height;
  
      // Ensure buffers are sized correctly
      this._ensurePixelBuffer(width, height);
      this._ensureTempCanvas(width, height);
  
      // Politely wait for the GPU to finish rendering
      this._gl.finish();
  
      // Read pixels from the framebuffer
      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
      this._gl.readPixels(
        0, 0, width, height,
        this._gl.RGBA,
        this._gl.UNSIGNED_BYTE,
        this._pixelBuffer
      );
  
      const error = this._gl.getError();
      if (error !== this._gl.NO_ERROR) {
        console.error("SnapshotEngine: WebGL error during readPixels:", error);
        return;
      }
  
      // Flip vertically (WebGL reads bottom-up)
      const ctx = this._tempCtx;
      const pixelCopy = new Uint8ClampedArray(this._pixelBuffer);
      const imageData = new ImageData(pixelCopy, width, height);
  
      ctx.putImageData(imageData, 0, 0);
  
      ctx.save();
      ctx.setTransform(1, 0, 0, -1, 0, height);
      ctx.drawImage(this._tempCanvas, 0, 0);
      ctx.restore();
  
      // Encode as PNG and trigger download
      var blob;
      if (this._tempCanvas.convertToBlob) {
        blob = await this._tempCanvas.convertToBlob({ type: 'image/png' });
      } else {
        blob = await new Promise(resolve => {
          this._tempCanvas.toBlob(resolve, 'image/png');
        });
      }
  
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sine_gordon_snap_" + Date.now() + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
  
      console.log("Snapshot saved:", a.download);
    }
  }


