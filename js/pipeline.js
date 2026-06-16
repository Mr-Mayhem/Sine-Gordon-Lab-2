// =============================================================================
// sine-gordon-lab — js/pipeline.js
// Math pipeline: processes physics state into frame data for the renderer
// Bernoulli lemniscate: flat (no vertical oscillation), pure mathematical form
// Gerono lemniscate: vertical oscillation via sin(2θ)
// =============================================================================

function lerp(a, b, t) { return a + (b - a) * t; }

// Local constants to avoid import ambiguity
const PI = Math.PI;
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

export function processFrame(sgState, phiV, vV, accV, prevGlowPos, prevGlowNeg, maxAcc) {
  var N = phiV.length;
  var spacing = 0.8;
  var rr = (N * spacing) / TAU;
  var tw = (N - 1) * spacing;
  var m = sgState.morph;
  var hw = -tw / 2;

  var phys = sgState.physics;
  var per = phys.topo === "circ" || phys.topo === "lemniscate" || phys.topo === "ellipse" || (phys.topo === "linear" && phys.linearWrap);

  var hA = accV && accV.length === N;
  var accVSmooth = null;
  if (hA) {
    accVSmooth = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var im1 = i - 1;
      var ip1 = i + 1;
      if (per) {
        if (im1 < 0) im1 = N - 1;
        if (ip1 >= N) ip1 = 0;
      } else {
        if (im1 < 0) im1 = 0;
        if (ip1 >= N) ip1 = N - 1;
      }
      accVSmooth[i] = 0.25 * accV[im1] + 0.5 * accV[i] + 0.25 * accV[ip1];
    }

    var mv = 0.001;
    for (var i = 0; i < N; i++) {
      var av = Math.abs(accVSmooth[i]);
      if (av > mv) mv = av;
    }
    maxAcc.val = Math.max(0.001, maxAcc.val * 0.95 + mv * 0.05);
  }

  var atRest = true;
  for (var j = 0; j < N; j++) {
    if (Math.abs(phiV[j]) > 0.001) { atRest = false; break; }
  }

  var glowPos = new Float32Array(N);
  var glowNeg = new Float32Array(N);

  for (var i = 0; i < N; i++) {
    if (atRest) {
      glowPos[i] = 0;
      glowNeg[i] = 0;
    } else {
      glowPos[i] = prevGlowPos[i] * 0.85;
      glowNeg[i] = prevGlowNeg[i] * 0.85;
    }

    if (hA && !atRest) {
      // Primary driving variable: Net Torque (represented by smoothed angular acceleration)
      var torque = accVSmooth[i];
      var n = torque / (maxAcc.val + 1e-5);
      var torqueIntensity = Math.pow(Math.min(1.0, Math.abs(n)), 1.2);

      if (torque > 0) {
        glowPos[i] = Math.max(glowPos[i], torqueIntensity);
      } else if (torque < 0) {
        glowNeg[i] = Math.max(glowNeg[i], torqueIntensity);
      }
    }
  }

  var ellipseX = sgState.ellipseX !== undefined ? sgState.ellipseX : 1.0;
  var ellipseZ = sgState.ellipseZ !== undefined ? sgState.ellipseZ : 1.0;
  var ellipseTwist = sgState.ellipseTwist !== undefined ? sgState.ellipseTwist : 0.0;

  var positions = new Array(N);
  for (var i = 0; i < N; i++) {
    var ang = (i / N) * TAU;
    var lx, ly, lz;
    if (sgState.lemniscateForm === "bernoulli") {
      var d = 1 + Math.sin(ang) * Math.sin(ang);
      lx = rr * 1.3 * Math.cos(ang) / d;
      ly = 1.5;
      lz = rr * 1.3 * Math.sin(ang) * Math.cos(ang) / d;
    } else {
      lx = rr * 1.3 * Math.cos(ang);
      ly = 1.5 + 3.5 * Math.sin(ang * 2);
      lz = rr * 1.3 * Math.sin(ang) * Math.cos(ang);
    }

    var rrX = rr * Math.cos(ang);
    var rrY = 1.5;
    var rrZ = rr * Math.sin(ang);
    if (phys.topo === "ellipse") {
      var a = rr * ellipseX;
      var b = rr * ellipseZ;
      var eccentricity = Math.abs(ellipseX - ellipseZ) / Math.max(ellipseX, ellipseZ, 0.001);
      var twistFade = Math.min(1.0, eccentricity / 0.15);
      var effectiveTwist = ellipseTwist * twistFade;
      var tAngle = ang * effectiveTwist;
      if (ellipseX >= ellipseZ) {
        rrX = a * Math.cos(ang);
        rrY = 1.5 + b * Math.sin(ang) * Math.sin(tAngle);
        rrZ = b * Math.sin(ang) * Math.cos(tAngle);
      } else {
        rrX = a * Math.cos(ang) * Math.cos(tAngle);
        rrY = 1.5 + a * Math.cos(ang) * Math.sin(tAngle);
        rrZ = b * Math.sin(ang);
      }
    }

    positions[i] = {
      x: m <= 1 ? lerp(hw + i * spacing, rrX, m) : lerp(rrX, lx, m - 1),
      y: m <= 1 ? lerp(1.5, rrY, m) : lerp(rrY, ly, m - 1),
      z: m <= 1 ? lerp(0, rrZ, m) : lerp(rrZ, lz, m - 1)
    };
  }

  var onA = sgState.onA, onB = sgState.onB, iv = sgState.impulseVisible;
  var sh = sgState.sharp, pA = sgState.posA, pB = sgState.posB, amp = sgState.amp;
  var cA = sgState.colA, cB = sgState.colB;
  var kw = Math.max(0.6, sh);
  var cAh = PALETTE[cA].hex, cBh = PALETTE[cB].hex;
  var iw = 0.5 / kw, aT = amp * 4, iR = kw * 4;

  var ghostVisible = (onA || onB) && iv;
  var ticVisible = (onA || onB) && iv;

  var ghostY = new Float32Array(N);
  var ghostOpacity = new Float32Array(N);
  var ghostColor = new Array(N);
  var ticActive = new Uint8Array(N);
  var ticColor = new Array(N);

  for (var i = 0; i < N; i++) {
    var ga = 0;
    if (onA) {
      var dx = i - pA;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      if (Math.abs(dx) < iR) ga += aT * Math.atan(Math.exp(dx * iw));
    }
    if (onB) {
      var dx = i - pB;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      if (Math.abs(dx) < iR) ga -= aT * Math.atan(Math.exp(dx * iw));
    }

    var waveContribution = 0; // Removed phiV[i] * 0.15; to prevent height drift from accumulated twists
    ghostY[i] = 3 + ga * 0.2 + waveContribution;

    var gc = "#555555", hi = false;
    if (onA) {
      var dx = i - pA;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      if (Math.abs(dx) <= kw * 2) { gc = cAh; hi = true; }
    }
    if (onB) {
      var dx = i - pB;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      if (Math.abs(dx) <= kw * 2) { gc = hi ? "#ffffff" : cBh; hi = true; }
    }
    ghostOpacity[i] = hi ? 0.95 : 0.35;
    ghostColor[i] = hexToRGB(gc);

    var isSpotA = onA && i === Math.round(pA);
    var isSpotB = onB && i === Math.round(pB);
    var rA = false, rB = false;
    if (onA) {
      var dx = i - pA;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      rA = Math.abs(Math.abs(dx) - kw * 2) < 0.5;
    }
    if (onB) {
      var dx = i - pB;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      rB = Math.abs(Math.abs(dx) - kw * 2) < 0.5;
    }
    ticActive[i] = (isSpotA || isSpotB || rA || rB) ? 1 : 0;
    if (isSpotA || rA) {
      ticColor[i] = hexToRGB(cAh);
    } else if (isSpotB || rB) {
      ticColor[i] = hexToRGB(cBh);
    } else {
      ticColor[i] = hexToRGB("#ffffff");
    }
  }

  return {
    positions: positions,
    glowPos: glowPos,
    glowNeg: glowNeg,
    velocities: vV,
    ghostVisible: ghostVisible,
    ghostY: ghostY,
    ghostColor: ghostColor,
    ghostOpacity: ghostOpacity,
    ticVisible: ticVisible,
    ticActive: ticActive,
    ticColor: ticColor,
    onA: onA,
    onB: onB,
    posA: pA,
    posB: pB,
    colorA: cAh,
    colorB: cBh,
    morph: m,
    gimbalRingActive: sgState.gimbalRingActive,
    spacing: spacing,
    ringRadius: rr,
    orientationValue: sgState.orientationValue,
    lemniscateForm: sgState.lemniscateForm,
    ellipseX: ellipseX,
    ellipseZ: ellipseZ,
    ellipseTwist: ellipseTwist,
    colA: sgState.colA,
    colB: sgState.colB,
    topology: phys.topo
  };
}

function hexToRGB(hex) {
  var h = hex.charAt(0) === "#" ? hex.substring(1) : hex;
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255
  };
}
