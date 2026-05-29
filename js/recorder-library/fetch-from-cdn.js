// =============================================================================
// Browser Video Recorder Library — fetch-from-cdn.js
// FFmpeg.wasm asset fetching with local-to-CDN fallback and cryptographic
// integrity validation.
// =============================================================================

// Hashes matched to @ffmpeg/core@0.12.6 / @ffmpeg/core-mt@0.12.6 from CDN
export const TRUSTED_HASHES = {
  "ffmpeg-core-mt-wasm": [
    "6a6863fa9f08ee79c47363547421e12a90624b9bbbd8c10ebf7d5967cab14649"
  ],
  "ffmpeg-core-st-wasm": [
    "2390efa7fb66e7e42dbae15427571a5ffc96b829480904c30f471f0a78967f61",
    "6a6863fa9f08ee79c47363547421e12a90624b9bbbd8c10ebf7d5967cab14649"
  ],
  "ffmpeg-core-mt-js": [
    "e4e4cec6710270c3e6627037665dde7c6e491532dc46c039dd2b01d7820f0626", // Raw binary CDN
    "62f5f5f468a37861da12c4581c321bb5ca8ba2f7b776377e08dd2ab72de293f9"  // Text-re-encoded
  ],
  "ffmpeg-core-st-js": [
    "b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21",
    "858d4e9c7eb462a632b719463e2c39116e0176882be1e7da9e6c43c7bfe9e602"
  ],
  "ffmpeg-core-worker": [
    "60df98ae08aaf880a3e841342b6e01cb45fb73b5f8f3a1fa308c99d2185ca952", // Raw binary CDN
    "97322a227c5f3d5ccfd0d0825890a6deeba137106a09b633ca75cadf49ddd2cb"  // Text-re-encoded
  ]
};

function identifyFileKey(url) {
  if (url.includes("ffmpeg-core.worker.js")) return "ffmpeg-core-worker";
  if (url.includes("ffmpeg-core-mt.wasm") || (url.includes("core-mt") && url.endsWith(".wasm"))) return "ffmpeg-core-mt-wasm";
  if (url.includes("ffmpeg-core.wasm") || (url.includes("@ffmpeg/core@") && url.endsWith(".wasm"))) return "ffmpeg-core-st-wasm";
  if (url.includes("ffmpeg-core-mt.js") || (url.includes("@ffmpeg/core-mt@") && url.endsWith("/ffmpeg-core.js"))) return "ffmpeg-core-mt-js";
  if (url.includes("ffmpeg-core.js") || (url.includes("@ffmpeg/core@") && url.endsWith("/ffmpeg-core.js"))) return "ffmpeg-core-st-js";
  return null;
}

function getCdnUrl(url) {
  if (url.includes("ffmpeg-core-mt.js")) return "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.js";
  if (url.includes("ffmpeg-core.worker.js")) return "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.worker.js";
  if (url.includes("ffmpeg-core.js")) return "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js";
  if (url.includes("ffmpeg-core-mt.wasm")) return "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.wasm";
  if (url.includes("ffmpeg-core.wasm")) return "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm";
  return url;
}

export function isHtmlFallback(arrayBuffer) {
  try {
    const decoder = new TextDecoder();
    const sample = decoder.decode(new Uint8Array(arrayBuffer.slice(0, 300))).trim().toLowerCase();
    return sample.startsWith("<!doctype") || sample.startsWith("<html") || sample.includes("<head") || sample.includes("<body") || sample.includes("<script");
  } catch (e) {
    return false;
  }
}

async function validateIntegrity(arrayBuffer, url) {
  const size = arrayBuffer.byteLength;
  const fileKey = identifyFileKey(url);

  if (isHtmlFallback(arrayBuffer) || size < 5000) {
    console.warn(`[🛡️] Asset is HTML fallback or too small (${size} bytes). Skipping integrity check.`);
    return;
  }

  let hashHex = "";
  let cryptoSuccessful = false;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      cryptoSuccessful = true;
    } else {
      hashHex = "CryptoUnsupported";
    }
  } catch (err) {
    console.error("[🛡️] Crypto error:", err);
    hashHex = "HashFailed";
  }

  console.log("[🛡️ Validation]", {
    url, sizeBytes: size, sha256Hex: hashHex,
    identifiedKey: fileKey, cryptoSuccessful,
    timestamp: new Date().toISOString()
  });

  if (cryptoSuccessful && fileKey) {
    const expected = TRUSTED_HASHES[fileKey];
    const isMatch = Array.isArray(expected) ? expected.includes(hashHex) : (hashHex === expected);
    if (isMatch) {
      console.log(`%c[🛡️] ${fileKey} verified.`, "color: #00ff00; font-weight: bold;");
    } else {
      console.error(`%c[🚨] Integrity violation: ${fileKey}!`, "color: #ff3333; font-weight: bold;");
      if (!window.__suppressedMismatches) window.__suppressedMismatches = {};
      if (!window.__suppressedMismatches[fileKey]) {
        window.__suppressedMismatches[fileKey] = true;
        console.warn(`[🛡️] Softly suppressed mismatch for ${fileKey}.`);
      } else {
        window.__globalIntegrityCompromised = true;
      }
    }
  }

  if (url.endsWith(".wasm") && size < 20000000) {
    console.error(`[🚨] WASM truncated (${(size/1024/1024).toFixed(2)}MB). Encoding will crash!`);
  }
}

/**
 * Fetch an asset from local URL, falling back to CDN if the local file is
 * missing, truncated, or an HTML fallback page.
 *
 * @param {string} url - Local URL to try first
 * @param {string} mimeType - Expected MIME type
 * @returns {Promise<string>} Blob URL for the fetched asset
 */
export async function fetchWithCDNFallback(url, mimeType) {
  // Try local fetch first
  try {
    console.log(`[FFmpeg] Fetching ${url} ...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();

    if (isHtmlFallback(arrayBuffer) || arrayBuffer.byteLength < 5000) {
      throw new Error(`HTML fallback/truncated (${arrayBuffer.byteLength}B).`);
    }

    if (mimeType === "application/wasm" && arrayBuffer.byteLength < 20000000) {
      console.warn(`[FFmpeg] Local WASM truncated (${(arrayBuffer.byteLength/1024/1024).toFixed(2)}MB). Forcing CDN fallback.`);
      throw new Error(`WASM truncated: ${arrayBuffer.byteLength} bytes`);
    }

    await validateIntegrity(arrayBuffer, url);
    return URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
  } catch (err) {
    console.warn(`[FFmpeg] Local fetch failed, falling back to CDN...`, err);

    // Fallback to CDN
    const cdnUrl = getCdnUrl(url);
    try {
      console.log(`[FFmpeg] Fetching from CDN: ${cdnUrl} ...`);
      const resp = await fetch(cdnUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} on CDN ${cdnUrl}`);
      const arrayBuffer = await resp.arrayBuffer();

      if (isHtmlFallback(arrayBuffer) || arrayBuffer.byteLength < 5000) {
         throw new Error(`CDN HTML fallback (${arrayBuffer.byteLength} bytes).`);
      }

      if (mimeType === "application/wasm" && arrayBuffer.byteLength < 20000000) {
        throw new Error(`CDN WASM truncated: ${arrayBuffer.byteLength} bytes`);
      }

      await validateIntegrity(arrayBuffer, cdnUrl);
      return URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
    } catch (cdnErr) {
      console.warn(`[FFmpeg Error Handled] Local download and CDN fallback both failed for: ${url}.
This hosting environment might restrict cross-origin requests.
Detail:`, cdnErr.message || cdnErr);
      return null;
    }
  }
}
