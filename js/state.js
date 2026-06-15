// =============================================================================
// sine-gordon-lab — js/sgState.js
// Global mutable application state
// COMPLETELY SELF-CONTAINED - no imports
// =============================================================================

// Default physics configuration
const DEFAULT_PHYSICS = {
  N: 120,
  kappa: 100,
  gravity: 10,
  gamma: 0,
  dt: 0.01,
  topo: "circ",
  linearWrap: false
};

export const sgState = {
  physics: { ...DEFAULT_PHYSICS },
  paused: true,
  hasFiredAtLeastOnce: false,
  laserScreenActive: false,
  timeScale: 1.6,
  morph: 1,
  morphTarget: 1,
  isLerping: false,
  lerpSpeed: 0.08,
  lerpFastSpeed: 0.15,
  posA: Math.floor(DEFAULT_PHYSICS.N * 0.75),
  posB: Math.floor(DEFAULT_PHYSICS.N * 0.25),
  sharp: 3,
  amp: 1,
  vel: 7,
  modeA: "kink",
  modeB: "anti",
  dirA: "cw",
  dirB: "cw",
  onA: true,
  onB: true,
  colA: 1,
  colB: 0,
  isRecording: false,
  assemblingProgress: 0,
  impulseVisible: true,
  dirtyGhosts: true,
  lemniscateForm: "gerono",
  widgetsCollapsed: false,
  orientation: "horizontal",
  orientationTarget: "horizontal",
  orientationValue: 0,
  exportFormat: (typeof SharedArrayBuffer !== "undefined") ? "mp4" : "webm",
  exportPipeline: "ffmpeg",
  exportAction: "record",
  exportWidth: 1280,
  exportHeight: 720,
  exportFPS: 30,
  exportCRF: 5,
  exportLimit: "default",
  exportTrim: "none",
  recStepsPerFrame: 1,
  gimbalRingActive: false,
  gimbalPhysicsMode: "simplified",
  gimbalDamping: 0.001,
  gimbalTime: 0,
  gimbalOuterOffset: 0,
  gimbalOuterVel: 0,
  gimbalMiddleOffset: 0,
  gimbalMiddleVel: 0,
  gimbalOuterNudge1: 0,
  gimbalOuterNudge2: 0,
  gimbalOuterNudge3: 0,
  gimbalMiddleNudge1: 0,
  gimbalMiddleNudge2: 0,
  gimbalMiddleNudge3: 0
};

// Persistence removed — all settings always start fresh on page load
export function saveExportSettings() {
  // No-op: settings are not persisted between sessions
}

export function loadExportSettings() {
  // No-op: settings always use hardcoded defaults
}