// =============================================================================
// Browser Video Recorder Library — video-filters.js
// Consolidated canvas resolution scaling and FFmpeg filter utilities.
// =============================================================================

/**
 * Standard-compliant, high-performance FFmpeg resolution recipes.
 * Handles modulus constraints of H.264 (libx264) and VP8 (libvpx) to meet professional standards:
 */
export const FFMPEG_RESOLUTIONS_RECIPES = {
  "640x360": {
    width: 640,
    height: 360,
    filter: "scale=640:360:force_original_aspect_ratio=increase:flags=lanczos,crop=640:360,setsar=1"
  },
  "854x480": {
    width: 852,
    height: 480,
    filter: "scale=852:480:force_original_aspect_ratio=increase:flags=lanczos,crop=852:480,setsar=1"
  },
  "1280x720": {
    width: 1280,
    height: 720,
    filter: "scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720,setsar=1"
  },
  "1920x1080": {
    width: 1920,
    height: 1080,
    filter: "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1"
  },
  "2560x1440": {
    width: 2560,
    height: 1440,
    filter: "scale=2560:1440:force_original_aspect_ratio=increase:flags=bicubic,crop=2560:1440,setsar=1"
  },
  "3840x2160": {
    width: 3840,
    height: 2160,
    filter: "scale=3840:2160:force_original_aspect_ratio=increase:flags=bicubic,crop=3840:2160,setsar=1"
  }
};

/**
 * Resolves the selected recording/export resolution, enforcing a dense
 * modulus configuration or utilizing the pre-defined target specs recipe.
 * Accepts a config object: { exportWidth, exportHeight, exportFormat, exportTrim }
 */
export function resolveRecordingResolution(config = {}) {
  var w = config.exportWidth || 1280;
  var h = config.exportHeight || 720;

  if (config.exportFormat === "webm" && config.exportTrim && config.exportTrim !== "none") {
    var cropFactor = 1.0;
    if (config.exportTrim === "subtle") cropFactor = 0.80;
    else if (config.exportTrim === "snug") cropFactor = 0.67;
    else if (config.exportTrim === "max") cropFactor = 0.55;

    h = Math.floor((h * cropFactor) / 2) * 2;
  }

  var key = w + "x" + h;
  if (FFMPEG_RESOLUTIONS_RECIPES[key]) {
    return {
      width: FFMPEG_RESOLUTIONS_RECIPES[key].width,
      height: FFMPEG_RESOLUTIONS_RECIPES[key].height
    };
  }
  // Custom fallback: Enforce standard even dimensions (modulo-2 pixel grid)
  return {
    width: Math.floor(w / 2) * 2,
    height: Math.floor(h / 2) * 2
  };
}

/**
 * Formulates the optimized video filter string for FFmpeg to handle scaling, flags,
 * and cropping with minimal CPU computation. If the input matches target resolution,
 * no heavy trans-coding or Lanczos scaling is forced, boosting performance significantly.
 * Applies the precise crop-to-fit ratio to guarantee no aspect distortion on the grid.
 */
export function getVideoFilterString(srcW, srcH, dstW, dstH, config = {}) {
  var targetRes = resolveRecordingResolution(config);
  var alignedW = targetRes.width;
  var alignedH = targetRes.height;

  var srcAlignedW = Math.floor(srcW / 2) * 2;
  var srcAlignedH = Math.floor(srcH / 2) * 2;

  if (srcAlignedW === alignedW && srcAlignedH === alignedH) {
    // Exact pixel-to-pixel match. Normalize SAR (Sample Aspect Ratio) only
    return "setsar=1";
  }

  // Predefined standard recipe if available
  var key = dstW + "x" + dstH;
  if (FFMPEG_RESOLUTIONS_RECIPES[key]) {
    return FFMPEG_RESOLUTIONS_RECIPES[key].filter;
  }

  // Standard high-fidelity lanczos-based scale/crop-to-fit filter with square pixels
  return "scale=" + alignedW + ":" + alignedH + ":force_original_aspect_ratio=increase:flags=lanczos,crop=" + alignedW + ":" + alignedH + ",setsar=1";
}

/**
 * Physically resizes the WebGL canvas and renderer to the target video resolution
 * when commencing a recording process. Preserves the pre-recording sizes for restoration later.
 */
export function changeCanvasToRecordingResolution(canvas, renderer, camera, config = {}, viewportEl = null) {
  var aw = config.exportWidth || 1280;
  var ah = config.exportHeight || 720;
  
  var res = resolveRecordingResolution(config);
  aw = res.width;
  ah = res.height;

  var preW = null;
  var preH = null;

  if (viewportEl && viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0) {
    preW = Math.floor(viewportEl.clientWidth / 2) * 2;
    preH = Math.floor(viewportEl.clientHeight / 2) * 2;
  } else {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = canvas && canvas.width > 0 ? canvas.width : (1280 * dpr);
    var ch = canvas && canvas.height > 0 ? canvas.height : (720 * dpr);
    preW = Math.floor((cw / dpr) / 2) * 2;
    preH = Math.floor((ch / dpr) / 2) * 2;
  }

  // Ensure positive fallback dimensions
  if (!preW || preW <= 0 || !preH || preH <= 0) {
    preW = aw || 1280;
    preH = ah || 720;
  }

  // We use the EXACT target aspect ratio of the requested export resolution to prevent dimensional mismatches in ZIP archives
  var aspect = aw / ah;
  if (!aspect || isNaN(aspect) || !isFinite(aspect) || aspect <= 0) {
    preW = aw || 1280;
    preH = ah || 720;
    aspect = preW / preH;
  }

  var captureH = ah;
  var maxPhysicalH = 1080;
  if (captureH > maxPhysicalH) {
    captureH = maxPhysicalH;
  }
  var captureW = Math.floor((captureH * aspect) / 2) * 2;
  if (!captureW || captureW <= 0) captureW = Math.floor((captureH * (16 / 9)) / 2) * 2;

  console.log(`[Recording-Resolution] Post-aspect scale: viewport aspect is ${aspect.toFixed(4)}. Physical buffer is scaled to ${captureW}x${captureH} (target output resolution specifies ${aw}x${ah}).`);

  if (renderer) {
    renderer.setPixelRatio(1);
    renderer.setSize(captureW, captureH, false);
    if (camera) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }

  // Preserve the visual display bounds using CSS so that the canvas size on screen never shifts or shrinks
  canvas.style.width = preW + "px";
  canvas.style.height = preH + "px";

  console.log("Canvas physically scaled to target format:", captureW + "x" + captureH, "(target output render: " + aw + "x" + ah + ", was logical preset: " + preW + "x" + preH + ")");

  return {
    width: captureW,
    height: captureH,
    preRecordingWidth: preW,
    preRecordingHeight: preH
  };
}

/**
 * Restores the canvas, renderer, and camera to their native responsive client size.
 */
export function restoreCanvasResolution(canvas, renderer, camera, preRecordingWidth, preRecordingHeight, viewportEl = null) {
  if (!canvas) return;
  var w, h;
  if (viewportEl) {
    w = Math.floor(viewportEl.clientWidth / 2) * 2;
    h = Math.floor(viewportEl.clientHeight / 2) * 2;
  } else if (preRecordingWidth && preRecordingHeight) {
    w = preRecordingWidth;
    h = preRecordingHeight;
  } else {
    w = 1280;
    h = 720;
  }
  console.log("Restoring canvas physical and logical size back to:", w + "x" + h);
  if (renderer) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
}
