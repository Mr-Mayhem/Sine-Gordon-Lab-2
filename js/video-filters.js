// =============================================================================
// sine-gordon-lab — js/video-filters.js
// Consolidated canvas resolution scaling and FFmpeg filter utilities.
// Prevents AI overrides by keeping delicate layout & video filters separate.
// =============================================================================

import { sgState as appState } from "./state.js";

/**
 * Standard-compliant, high-performance FFmpeg resolution recipes.
 * Handles modulus constraints of H.264 (libx264) and VP8 (libvpx) to meet professional standards:
 * - 360p (640x360): Divisible by 8, keeps perfect 16:9.
 * - 480p (854x480): 854 is not a multiple of 4, causing warning/padding on some decoders. 
 *   Remapped to 852x480 which is a standard Mod-4 widescreen boundaries definition (aspect 1.775:1).
 * - 720p (1280x720): Divisible by 16, perfect 16:9.
 * - 1080p (1920x1080): Divisible by 8 (vertical macroblocks), perfect 16:9.
 * - 1440p (2560x1440): Divisible by 16, perfect 16:9.
 * - 4K (3840x2160): Divisible by 16, perfect 16:9.
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
    filter: "scale=2560:1440:force_original_aspect_ratio=increase:flags=lanczos,crop=2560:1440,setsar=1"
  },
  "3840x2160": {
    width: 3840,
    height: 2160,
    filter: "scale=3840:2160:force_original_aspect_ratio=increase:flags=lanczos,crop=3840:2160,setsar=1"
  }
};

/**
 * Resolves the selected recording/export resolution, enforcing a dense
 * modulus configuration or utilizing the pre-defined target specs recipe.
 */
export function resolveRecordingResolution() {
  var w = (typeof appState !== 'undefined' ? appState.exportWidth : 1280) || 1280;
  var h = (typeof appState !== 'undefined' ? appState.exportHeight : 720) || 720;
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
export function getVideoFilterString(srcW, srcH, dstW, dstH) {
  var targetRes = resolveRecordingResolution();
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
export function changeCanvasToRecordingResolution(canvas, renderer, camera) {
  var selRes = document.getElementById("sel-res");
  if (selRes && selRes.value) {
    var parts = selRes.value.split("x");
    if (parts.length === 2) {
      appState.exportWidth = Number(parts[0]);
      appState.exportHeight = Number(parts[1]);
    }
  }
  var res = resolveRecordingResolution();
  var aw = res.width;
  var ah = res.height;

  var preW = null;
  var preH = null;

  var viewport = document.getElementById("viewport");
  if (viewport) {
    preW = Math.floor(viewport.clientWidth / 2) * 2;
    preH = Math.floor(viewport.clientHeight / 2) * 2;
  } else {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    preW = Math.floor((canvas.width / dpr) / 2) * 2;
    preH = Math.floor((canvas.height / dpr) / 2) * 2;
  }

  if (renderer) {
    renderer.setPixelRatio(1);
    renderer.setSize(aw, ah, false);
    if (camera) {
      camera.aspect = aw / ah;
      camera.updateProjectionMatrix();
    }
  }
  canvas.width = aw;
  canvas.height = ah;

  console.log("Canvas physically scaled to target format:", aw + "x" + ah, "(was logical preset:", preW + "x" + preH + ")");

  return {
    width: aw,
    height: ah,
    preRecordingWidth: preW,
    preRecordingHeight: preH
  };
}

/**
 * Restores the canvas, renderer, and camera to their native responsive client size.
 */
export function restoreCanvasResolution(canvas, renderer, camera, preRecordingWidth, preRecordingHeight) {
  if (!canvas) return;
  var w, h;
  var viewport = document.getElementById("viewport");
  if (viewport) {
    w = Math.floor(viewport.clientWidth / 2) * 2;
    h = Math.floor(viewport.clientHeight / 2) * 2;
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
