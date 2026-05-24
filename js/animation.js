// =============================================================================
// sine-gordon-lab — js/animation.js (UPDATED)
// Animation loop with patient handshaking recording support
// =============================================================================

import * as THREE from 'three';
import { sgState } from "./state.js";
import { processFrame } from "./pipeline.js";

// Internal helpers
var _transitionTimer = null;

function _startTransition(target, rendererRef, physics, immediate) {
  sgState.morphTarget = target;
  sgState.isLerping = true;
  if (immediate) {
    sgState.morph = target;
    sgState.isLerping = false;
  }
}

function _finishTransition() {
  sgState.isLerping = false;
  if (_transitionTimer) {
    clearTimeout(_transitionTimer);
    _transitionTimer = null;
  }
}

export function changeElementCount(newN, rendererRef, physics, refreshUI) {
  // Scale positions proportionally before updating N
  const oldN = sgState.physics.N;
  const scale = newN / oldN;
  sgState.posA = Math.floor(newN * 0.75);
  sgState.posB = Math.floor(newN * 0.25);
  
  sgState.physics.N = newN;
  physics.syncParams(sgState.physics, true);
  
  rendererRef.current.N = newN;
  rendererRef.current.resize(newN);
  
  if (refreshUI) refreshUI();
}

export function factoryReset(rendererRef, physics, refreshUI, DEFAULT_PHYSICS) {
  Object.assign(sgState.physics, DEFAULT_PHYSICS);
  physics.syncParams(sgState.physics, true);
  sgState.posA = Math.floor(sgState.physics.N * 0.75);
  sgState.posB = Math.floor(sgState.physics.N * 0.25);
  var target = sgState.physics.topo === "circ" ? 1 : sgState.physics.topo === "lemniscate" ? 2 : 0;
  _startTransition(target, rendererRef, physics, true);
  if (refreshUI) refreshUI();
}

export function updatePlayButton() {
  var l = sgState.paused ? "▶ Run" : "⏸ Pause";
  var i = sgState.paused ? "▶" : "⏸";
  var pb = document.getElementById("btn-play");
  var sb = document.getElementById("btn-side-play");
  if (pb) pb.textContent = l;
  if (sb) sb.textContent = i;
}

export function changeTopology(topo, rendererRef, physics) {
  sgState.physics.topo = topo;
  
  var lemForm = document.getElementById("sel-lemniscate-form");
  var linearWrap = document.getElementById("btn-linear-wrap");
  if (lemForm) lemForm.style.display = topo === "lemniscate" ? "" : "none";
  if (linearWrap) linearWrap.style.display = topo === "linear" ? "" : "none";
  
  var target = topo === "circ" ? 1 : topo === "lemniscate" ? 2 : 0;
  _startTransition(target, rendererRef, physics, false);
  
  physics.reset();
}

export function animate(time, rendererRef, renderer, controls, physics, recorder, camera) {
  var sr = rendererRef.current;
  if (!sr) { 
    requestAnimationFrame(function(ts) { 
      animate(ts, rendererRef, renderer, controls, physics, recorder, camera); 
    }); 
    return; 
  }

  // Handle topology morphing transitions
  if (sgState.isLerping) {
    sgState.morph += (sgState.morphTarget - sgState.morph) * 0.15;
    if (Math.abs(sgState.morph - sgState.morphTarget) < 0.005) {
      sgState.morph = sgState.morphTarget;
      _finishTransition();
    }
    var fd = processFrame(sgState, physics.phi, physics.acc, sr._glowPosAttr.array, sr._glowNegAttr.array, sr.maxAcc);
    sr.render(fd, physics.phi);
    renderer.render(sr.scene, camera);
    controls.update();
    requestAnimationFrame(function(ts) {
      animate(ts, rendererRef, renderer, controls, physics, recorder, camera);
    });
    return;
  }

  // Smooth topology morph target
  if (!sgState.isLerping) {
    var tt = sgState.physics.topo === "circ" ? 1 : sgState.physics.topo === "lemniscate" ? 2 : 0;
    if (Math.abs(sgState.morph - tt) > 0.001) sgState.morph += (tt - sgState.morph) * 0.08;
    else sgState.morph = tt;
  }

  // Smooth orientation transition
  var ot = sgState.orientationTarget === "vertical" ? 1 : 0;
  sgState.orientationValue += (ot - sgState.orientationValue) * 0.08;

  // Physics always advances at normal rate for smooth real-time preview
  if (!sgState.paused) {
    physics.step(Math.max(1, Math.floor(5 * sgState.timeScale)));
  }
  
  // Always render the current state
  var fd = processFrame(sgState, physics.phi, physics.acc, sr._glowPosAttr.array, sr._glowNegAttr.array, sr.maxAcc);
  sr.render(fd, physics.phi);
  renderer.render(sr.scene, camera);
  
  // ========================================================================
  // THE PATIENT HANDSHAKE:
  // When recording, the renderer politely waits for the recorder to finish
  // processing the frame before starting the next one.
  // This is the gear meshing point between renderer and recorder.
  // No frames are dropped. No pushing. Pure patient handshaking.
  // ========================================================================
  if (recorder && recorder.isRecording) {
    try {
      // Await the full capture pipeline (GPU → Encode → Write)
      // The next animation frame will not start until this completes
      recorder.captureAndWait().then(() => {
        controls.update();
        requestAnimationFrame(function(ts) {
          animate(ts, rendererRef, renderer, controls, physics, recorder, camera);
        });
      });
    } catch (error) {
      console.error('Frame capture failed:', error);
      controls.update();
      requestAnimationFrame(function(ts) {
        animate(ts, rendererRef, renderer, controls, physics, recorder, camera);
      });
    }
  } else {
    // Normal non-recording path - no waiting needed
    controls.update();
    requestAnimationFrame(function(ts) {
      animate(ts, rendererRef, renderer, controls, physics, recorder, camera);
    });
  }
}
