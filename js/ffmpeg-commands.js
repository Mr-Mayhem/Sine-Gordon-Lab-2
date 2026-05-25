// =============================================================================
// sine-gordon-lab — js/ffmpeg-commands.js
// Consolidated FFmpeg command line synthesis, structures and values.
// Decouples delicate command formulation from assembly pipeline.
// =============================================================================

import { sgState as appState } from "./state.js";
import { resolveRecordingResolution, getVideoFilterString } from "./video-filters.js";

/**
 * Derives and bundles all standard synthesis parameters from current state and active configurations.
 * Crucial values mapped dynamically:
 * - FPS: Frame frequency parameter.
 * - CRF: Constant Rate Factor (H.264 / VP8 quality slider mapping).
 * - Target resolution mapping.
 * - VPX-specific bitrate constraints, scheduling deadline flags, and target CPU threads.
 */
export function getEncodingParams(alignedW, alignedH) {
  const format = appState.exportFormat || "webm";
  const fps = appState.exportFPS || 60;
  const crf = String(appState.exportCRF || 18);
  const outputFile = "output." + (format === "mp4" ? "mp4" : "webm");

  var targetRes = resolveRecordingResolution();
  var scaleFilter = getVideoFilterString(alignedW, alignedH, targetRes.width, targetRes.height);

  var resolutionScale = (alignedW * alignedH) / (1280 * 720);
  var webmBitrate = Math.max(2, Math.round(2 * resolutionScale)) + "M";
  var webmDeadline = resolutionScale > 2.0 ? "good" : "realtime";
  var webmCpuUsed = resolutionScale > 2.0 ? "2" : "4";

  return {
    format,
    fps,
    crf,
    outputFile,
    scaleFilter,
    resolutionScale,
    webmBitrate,
    webmDeadline,
    webmCpuUsed,
    targetRes
  };
}

/**
 * Prepares the chunk encoding FFmpeg arguments array.
 * Double-buffered block encoding feeds here to create intermediate video segments.
 */
export function buildChunkArgs(framesInThisChunk, alignedW, alignedH, chunkName) {
  const params = getEncodingParams(alignedW, alignedH);
  let args = [];

  if (params.format === "mp4") {
    args = [
      "-framerate", String(params.fps),
      "-start_number", "0",
      "-i", "frame_%06d.png",
      "-vframes", String(framesInThisChunk),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", params.crf,
      "-pix_fmt", "yuv420p",
      "-bf", "0",
      "-g", String(params.fps),
      "-video_track_timescale", "90000"
    ];
  } else {
    args = [
      "-framerate", String(params.fps),
      "-start_number", "0",
      "-i", "frame_%06d.png",
      "-vframes", String(framesInThisChunk),
      "-c:v", "libvpx",
      "-crf", params.crf,
      "-b:v", params.webmBitrate,
      "-deadline", params.webmDeadline,
      "-cpu-used", params.webmCpuUsed,
      "-threads", "1",
      "-pix_fmt", "yuv420p"
    ];
  }

  if (params.scaleFilter) {
    args.push("-vf", params.scaleFilter);
  }
  args.push(chunkName);

  return args;
}

/**
 * Prepares the direct single-pass or fast whole assembly arguments array.
 * Fast pipeline with < 150 frames triggers direct to final file.
 */
export function buildAssemblyArgs(alignedW, alignedH, outputFile) {
  const params = getEncodingParams(alignedW, alignedH);
  let args = [];

  if (params.format === "mp4") {
    args = [
      "-framerate", String(params.fps),
      "-start_number", "0",
      "-i", "frame_%06d.png",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", params.crf,
      "-pix_fmt", "yuv420p",
      "-bf", "0"
    ];
  } else {
    args = [
      "-framerate", String(params.fps),
      "-start_number", "0",
      "-i", "frame_%06d.png",
      "-c:v", "libvpx",
      "-crf", params.crf,
      "-b:v", params.webmBitrate,
      "-deadline", params.webmDeadline,
      "-cpu-used", params.webmCpuUsed,
      "-threads", "1",
      "-pix_fmt", "yuv420p"
    ];
  }

  if (params.scaleFilter) {
    args.push("-vf", params.scaleFilter);
  }
  args.push(outputFile);

  return args;
}

/**
 * Prepares concat/merge command line inputs depending on target formats.
 * Consolidates the COPY codec rules without re-encoding to preserve CPU.
 */
export function buildConcatArgs(listFile, format, outputFile) {
  if (format === "mp4") {
    return [
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      "-movflags", "+faststart",
      outputFile
    ];
  } else {
    return [
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      outputFile
    ];
  }
}
