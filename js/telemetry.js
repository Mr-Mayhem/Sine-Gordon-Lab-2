// =============================================================================
// sine-gordon-lab — js/telemetry.js
// Telemetry snapshot generation + clipboard export
// =============================================================================

import { sgState } from "./state.js";

// Local constants to avoid import ambiguity
const TAU = 2 * Math.PI;
const PALETTE = [
  { hex: "#00ff88" },
  { hex: "#00ccff" },
  { hex: "#ffb000" },
  { hex: "#ff66cc" },
  { hex: "#88aaff" },
  { hex: "#ff8844" },
  { hex: "#aa88ff" },
  { hex: "#e8e8e8" }
];

export function generateTelemetry(physics) {
  var phi = physics.phi;
  var winding = 0;

  if (phi && phi.length > 0) {
    for (var i = 0; i < phi.length; i++) {
      var diff = (i === phi.length - 1
        ? (sgState.physics.topo === "circ" || sgState.physics.topo === "lemniscate" || sgState.physics.topo === "ellipse" ? phi[0] : phi[i])
        : phi[i + 1]) - phi[i];
      if (sgState.physics.topo === "circ" || sgState.physics.topo === "lemniscate" || sgState.physics.topo === "ellipse") {
        diff -= Math.round(diff / TAU) * TAU;
      }
      winding += diff;
    }
    winding /= TAU;
  }

  return JSON.stringify({
    version: "11.10.0",
    timestamp: new Date().toISOString(),
    physics: sgState.physics,
    windingNumber: winding.toFixed(4),
    simState: {
      paused: sgState.paused,
      timeScale: sgState.timeScale,
      morph: sgState.morph.toFixed(4),
      orientation: sgState.orientationTarget
    },
    channelA: { on: sgState.onA, pos: sgState.posA, mode: sgState.modeA, dir: sgState.dirA, color: PALETTE[sgState.colA].hex },
    channelB: { on: sgState.onB, pos: sgState.posB, mode: sgState.modeB, dir: sgState.dirB, color: PALETTE[sgState.colB].hex }
  }, null, 2);
}
