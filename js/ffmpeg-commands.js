// =============================================================================
// sine-gordon-lab — js/ffmpeg-commands.js
// Consolidated FFmpeg command line synthesis, structures and values.
// Decouples delicate command formulation from assembly pipeline.
// =============================================================================

import { sgState as appState } from "./state.js";
import {
  resolveRecordingResolution,
  getVideoFilterString,
} from "./video-filters.js";

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
  var scaleFilter = getVideoFilterString(
    alignedW,
    alignedH,
    targetRes.width,
    targetRes.height,
  );

  var resolutionScale = (targetRes.width * targetRes.height) / (1280 * 720);
  var webmBitrate = Math.max(2, Math.round(2 * resolutionScale)) + "M";
  // Always use standard realtime deadline and thread-friendly cpu-used settings to avoid WASM memory leaks / timeouts at high resolutions
  var webmDeadline = "realtime";
  var webmCpuUsed = resolutionScale > 2.0 ? "5" : "4";

  // Use ultrafast preset for ultra-high-density scales (at/above 4K) and veryfast for 1080p/1440p to prevent OOM
  var x264Preset = "medium";
  if (resolutionScale > 5.0) {
    x264Preset = "ultrafast";
  } else if (resolutionScale > 2.0) {
    x264Preset = "veryfast";
  }

  // For high-density scales at/above 1080p, restrict H.264 to 1 thread to avoid thread stack overhead and memory pressure.
  var x264Threads = resolutionScale > 2.0 ? "1" : "2";

  // For high-density scales at/above 1080p, cap-level is pinned at 5.1 to maximize device decoding and playability.
  var x264Level = "5.1";

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
    x264Preset,
    x264Threads,
    x264Level,
    targetRes,
  };
}

/**
 * Prepares the chunk encoding FFmpeg arguments array.
 * Double-buffered block encoding feeds here to create intermediate video segments.
 */
export function buildChunkArgs(
  framesInThisChunk,
  alignedW,
  alignedH,
  chunkName,
  framesOffset = 0,
) {
  const params = getEncodingParams(alignedW, alignedH);
  let args = [];

  if (params.format === "mp4") {
    args = [
      "-framerate",
      String(params.fps),
      "-start_number",
      "0",
      "-i",
      "frame_%06d.png",
      "-r",
      String(params.fps),
      "-vframes",
      String(framesInThisChunk),
      "-c:v",
      "libx264",
      "-preset",
      params.x264Preset,
      "-threads",
      params.x264Threads,
      "-rc-lookahead",
      params.resolutionScale > 5.0 ? "0" : (params.resolutionScale > 2.0 ? "5" : "15"),
      "-refs",
      params.resolutionScale > 2.0 ? "1" : "3",
      "-crf",
      params.crf,
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-level:v",
      params.x264Level,
      "-bf",
      "0",
      "-g",
      String(params.fps),
      "-video_track_timescale",
      "90000",
      "-muxdelay",
      "0",
      "-output_ts_offset",
      String((framesOffset / params.fps).toFixed(6)),
    ];
  } else {
    args = [
      "-framerate",
      String(params.fps),
      "-start_number",
      "0",
      "-i",
      "frame_%06d.png",
      "-r",
      String(params.fps),
      "-vframes",
      String(framesInThisChunk),
      "-c:v",
      "libvpx",
      "-crf",
      params.crf,
      "-b:v",
      params.webmBitrate,
      "-deadline",
      params.webmDeadline,
      "-cpu-used",
      params.webmCpuUsed,
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
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
      "-framerate",
      String(params.fps),
      "-start_number",
      "0",
      "-i",
      "frame_%06d.png",
      "-r",
      String(params.fps),
      "-c:v",
      "libx264",
      "-preset",
      params.x264Preset,
      "-threads",
      params.x264Threads,
      "-rc-lookahead",
      params.resolutionScale > 5.0 ? "0" : (params.resolutionScale > 2.0 ? "5" : "15"),
      "-refs",
      params.resolutionScale > 2.0 ? "1" : "3",
      "-crf",
      params.crf,
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-level:v",
      params.x264Level,
      "-bf",
      "0",
    ];
  } else {
    args = [
      "-framerate",
      String(params.fps),
      "-start_number",
      "0",
      "-i",
      "frame_%06d.png",
      "-r",
      String(params.fps),
      "-c:v",
      "libvpx",
      "-crf",
      params.crf,
      "-b:v",
      params.webmBitrate,
      "-deadline",
      params.webmDeadline,
      "-cpu-used",
      params.webmCpuUsed,
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
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
      "-fflags",
      "+genpts",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputFile,
    ];
  } else {
    return [
      "-fflags",
      "+genpts",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outputFile,
    ];
  }
}
