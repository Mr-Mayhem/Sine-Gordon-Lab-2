// sine-gordon-lab — js/disc-space-estimator.js

/**
 * Highly granular, resolution-aware storage & time diagnostic estimator.
 * Predicts byte size footprints and max frame budgets across different laboratory pipelines:
 * - stills-to-zip (temp frame files + ZIP container storage)
 * - zip-to-video (ZIP unpack overhead + raw frame storage + compile output video)
 * - direct/ffmpeg (sequential frame streaming on OPFS + compile output video)
 */
export class DiscSpaceEstimator {
  /**
   * Estimate PNG frame size in bytes based on resolution.
   * Dark labs with non-linear physics grids render deep dark pixels, 
   * leading to extremely high PNG DEFLATE efficiency.
   * @param {number} width 
   * @param {number} height 
   * @returns {number} estimated size in bytes
   */
  static estimatePngFrameSize(width, height) {
    const pixels = width * height;
    // Dark canvas theme allows great PNG compression. Modulate coefficient for high resolution limits
    let coeff = 0.035;
    if (pixels > 2000000) { // 1080p+ and higher
      coeff = 0.025; // 1440p/4K have larger contiguous regions yielding even higher compressibility
    }
    return Math.floor(pixels * coeff) + 8000;
  }

  /**
   * Estimate video footprint (WebM or MP4) in bytes per second of recording.
   * @param {number} width 
   * @param {number} height 
   * @param {number} fps 
   * @param {string} format 'webm' | 'mp4'
   * @param {number} crf Constant Rate Factor (0 to 35) representing quality compression
   * @returns {number} estimated bytes/sec
   */
  static estimateVideoSizePerSecond(width, height, fps, format = 'webm', crf = 18) {
    const pixels = width * height;
    // Match against typical laboratory compiler pipeline bitrates (assuming CRF = 18)
    let kbps = 3000;
    if (pixels <= 921600) { // 720p (1280x720)
      kbps = format === 'mp4' ? 2500 : 1500;
    } else if (pixels <= 2073600) { // 1080p (1920x1080)
      kbps = format === 'mp4' ? 4500 : 3000;
    } else if (pixels <= 3686400) { // 1440p (2560x1440)
      kbps = format === 'mp4' ? 8000 : 5500;
    } else { // 4K (3840x2160)
      kbps = format === 'mp4' ? 16000 : 10000;
    }
    
    // Scale for High FPS
    if (fps > 30) {
      kbps *= 1.35;
    }

    // Apply CRF compression scaling factor
    // CRF = 18 is baseline (multiplier 1.0)
    let crfMultiplier = 1.0;
    const numericCrf = Number(crf);
    if (numericCrf === 0) {
      crfMultiplier = 6.0; // Lossless is massive
    } else if (numericCrf <= 5) {
      crfMultiplier = 3.0;
    } else if (numericCrf <= 12) {
      crfMultiplier = 1.6;
    } else if (numericCrf <= 18) {
      // Linear interpolation between 12 and 18 quality points
      crfMultiplier = 1.6 - ((numericCrf - 12) * 0.1);
    } else if (numericCrf <= 23) {
      // Linear interpolation between 18 and 23 quality points
      crfMultiplier = 1.0 - ((numericCrf - 18) * 0.06); // goes to 0.70
    } else if (numericCrf <= 28) {
      // Linear interpolation between 23 and 28 quality points
      crfMultiplier = 0.70 - ((numericCrf - 23) * 0.05); // goes to 0.45
    } else { // 35 or worse
      crfMultiplier = 0.25;
    }

    return ((kbps * crfMultiplier) * 1024) / 8;
  }

  /**
   * Estimates peak filesystem/memory footprint during compilation pipeline.
   * @param {string} pipeline 'zip' | 'ffmpeg' | 'opfs' | 'zip-to-video'
   * @param {number} frames 
   * @param {number} width 
   * @param {number} height 
   * @param {number} fps 
   * @param {string} format 'webm' | 'mp4'
   * @param {number} crf 
   * @returns {number} peak bytes required
   */
  static calculatePeakStorageBytes(pipeline, frames, width, height, fps, format = 'webm', crf = 18) {
    const pngSize = this.estimatePngFrameSize(width, height);
    const videoDuration = frames / fps;
    const videoSize = this.estimateVideoSizePerSecond(width, height, fps, format, crf) * videoDuration;

    switch (pipeline) {
      case 'zip':
        // stills-to-zip requires frame files (on OPFS raw state) + the growing transient ZIP stream
        // Usually, packing introduces around 1.8x overhead during compilation state
        return Math.floor(frames * pngSize * 1.8);

      case 'zip-to-video':
        // input ZIP upload loaded + unzipped frames inside OPFS sandbox + output compiled video
        return Math.floor((frames * pngSize * 2.0) + videoSize);

      case 'ffmpeg':
      case 'opfs':
      default:
        // direct stream setup: frames stored directly inside OPFS + output compiled video
        return Math.floor((frames * pngSize) + videoSize);
    }
  }

  /**
   * Solves resource limit equations to identify safe recording limits (max frames).
   * @param {string} pipeline 'zip' | 'ffmpeg' | 'opfs' | 'zip-to-video'
   * @param {number} availBytes 
   * @param {number} width 
   * @param {number} height 
   * @param {number} fps 
   * @param {string} format 'webm' | 'mp4'
   * @param {number} crf 
   * @param {boolean} isConstrained 
   * @returns {number} total frames permitted
   */
  static estimateMaxFrames(pipeline, availBytes, width, height, fps, format = 'webm', crf = 18, isConstrained = false) {
    const pngSize = this.estimatePngFrameSize(width, height);
    const videoSizePerFrame = this.estimateVideoSizePerSecond(width, height, fps, format, crf) / fps;

    let multiplier = 1.0;
    if (pipeline === 'zip') {
      // stills-to-zip only produces the raw frames and the ZIP archive
      multiplier = 1.8 * pngSize;
    } else if (pipeline === 'zip-to-video') {
      // requires dual-buffer footprint for frame extractions + transient video container creation
      multiplier = (2.0 * pngSize) + videoSizePerFrame;
    } else {
      // direct-to-video stores frames and compiles video consecutively on OPFS
      multiplier = pngSize + videoSizePerFrame;
    }

    const quotaTarget = isConstrained ? 0.40 : 0.90;
    const targetFrames = Math.floor((availBytes * quotaTarget) / multiplier);

    // Temporal ceiling safety constants (20 mins for low memory devices, 120 mins for desktop environments)
    const ceilingFrames = isConstrained ? 20 * 60 * fps : 120 * 60 * fps;

    let limit = Math.min(targetFrames, ceilingFrames);
    return Math.max(60, limit); // Always guarantee at least 60 frames runtime
  }
}
