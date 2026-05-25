// =============================================================================
// sine-gordon-lab — js/main.js (FIXED)
// Entry point — imports everything, initializes scene, builds UI, boots
// Default: 80 elements, circular topology
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { sgState, loadExportSettings, saveExportSettings } from "./state.js";
import PhysicsEngine from "./physics.js";
import SceneRenderer from "./scene-renderer.js";
import RecordingEngine from "./recording.js";
import SnapshotEngine from "./snapshot.js";
import UI from "./ui-thumbs.js";
import { bindEvents } from "./events.js";
import { animate, changeElementCount } from "./animation.js";

// Local constants to avoid import ambiguity
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

const DEFAULT_PHYSICS = {
  N: 120,
  kappa: 100,
  gravity: 10,
  gamma: 0,
  dt: 0.01,
  topo: "circ",
  linearWrap: false
};

var scene, camera, renderer, controls, physics, recorder, snapshotEngine;
var rendererRef = { current: null };

function ensureEvenDimensions(width, height) {
  return {
    width: Math.floor(width / 2) * 2,
    height: Math.floor(height / 2) * 2
  };
}

function updateRecordingUI(progress) {
  if (!progress) return;
  
  const indicator = document.getElementById("recording-indicator");
  const txtRec = document.getElementById("txt-recording");
  const btnVideo = document.getElementById("btn-video");
  
  switch (progress.type) {
    case 'capture':
      if (txtRec) {
        txtRec.textContent = `REC: ${progress.frameCount}`;
      }
      break;
      
    case 'progress':
      if (progress.captureFPS) {
        console.debug(`Recording: ${progress.frameCount}/${progress.frameLimit} frames @ ${progress.captureFPS} FPS, ${progress.remainingSeconds}s remaining`);
      }
      break;
      
    case 'error':
      console.error('Recording error:', progress.message);
      if (btnVideo) {
        btnVideo.textContent = '⏺ Error';
        btnVideo.style.borderColor = '#ef4444';
        setTimeout(() => {
          btnVideo.textContent = '⏺ Video';
          btnVideo.style.borderColor = '';
        }, 3000);
      }
      break;
      
    case 'complete':
      if (btnVideo) {
        btnVideo.disabled = false;
      }
      if (indicator) {
        indicator.style.display = 'none';
      }
      refreshUI();
      break;
  }
}

function refreshUI() {
  window.refreshUI = refreshUI;
  document.getElementById("val-pos-a").textContent = Math.round(sgState.posA);
  document.getElementById("val-pos-b").textContent = Math.round(sgState.posB);
  document.getElementById("val-sharp").textContent = sgState.sharp.toFixed(1);
  document.getElementById("val-vel").textContent = sgState.vel.toFixed(1);
  document.getElementById("val-speed").textContent = sgState.timeScale.toFixed(1) + "x";
  document.getElementById("val-kappa").textContent = sgState.physics.kappa.toFixed(0);
  document.getElementById("val-grav").textContent = sgState.physics.gravity.toFixed(1);
  document.getElementById("val-gamma").textContent = sgState.physics.gamma.toFixed(3);
  if (document.getElementById("val-gimbal-damping")) {
    document.getElementById("val-gimbal-damping").textContent = sgState.gimbalDamping.toFixed(3);
  }
  document.getElementById("val-nodes").textContent = sgState.physics.N;
  document.getElementById("sel-format").value = sgState.exportFormat;
  var mo = document.querySelector('#sel-format option[value="mp4"]');
  if (mo && typeof SharedArrayBuffer === "undefined") mo.textContent = "MP4 (Not Supported)";
  document.getElementById("sel-fps").value = sgState.exportFPS;
  if (document.getElementById("sel-crf")) document.getElementById("sel-crf").value = sgState.exportCRF;
  if (document.getElementById("sel-limit")) document.getElementById("sel-limit").value = sgState.exportLimit;
  
  var tpl = document.getElementById("sel-pipeline");
  var taction = document.getElementById("sel-action");
  var btnVideo = document.getElementById("btn-video");

  if (tpl && taction && btnVideo) {
    tpl.value = sgState.exportPipeline || "ffmpeg";
    
    // Hide/show action dropdown (Assemble/Record) with visibility rather than display to prevent layout jump
    if (tpl.value !== "zip") {
      taction.style.visibility = "hidden";
      taction.style.pointerEvents = "none";
      sgState.exportAction = "record";
      taction.value = "record";
    } else {
      taction.style.visibility = "visible";
      taction.style.pointerEvents = "auto";
      taction.value = sgState.exportAction || "record";
    }
    
    var localOp = tpl.querySelector('option[value="local"]');
    if (localOp && !window.showDirectoryPicker) {
      localOp.textContent = "Disk Frames (N/A)";
      localOp.disabled = true;
      if (tpl.value === "local") {
        tpl.value = "ffmpeg";
        sgState.exportPipeline = "ffmpeg";
      }
    }

    if (recorder && recorder.isAssembling) {
      btnVideo.textContent = "⏳ Assembly...";
      btnVideo.style.borderColor = "var(--accent)";
      btnVideo.style.color = "var(--accent)";
      btnVideo.disabled = true;
      btnVideo.classList.remove("btn-warn");
    } else if (recorder && recorder.isRecording) {
      btnVideo.textContent = "⏹ Stop";
      btnVideo.style.borderColor = "#ef4444";
      btnVideo.style.color = "#ef4444";
      btnVideo.disabled = false;
      btnVideo.classList.add("btn-warn");
    } else {
      btnVideo.disabled = false;
      btnVideo.classList.remove("btn-warn");
      if (sgState.exportAction === "assemble" && tpl.value === "zip") {
        btnVideo.textContent = "🛠 Assemble";
        btnVideo.style.borderColor = "var(--accent)";
        btnVideo.style.color = "var(--accent)";
      } else {
        btnVideo.textContent = "⏺ Record";
        btnVideo.style.borderColor = "";
        btnVideo.style.color = "";
      }
    }
  }
  
  document.getElementById("firing-solution-list").innerHTML = "A:" + Math.round(sgState.posA) + " B:" + Math.round(sgState.posB);

  const pbContainer = document.getElementById("playback-controls-container");
  if (pbContainer) {
    pbContainer.style.display = sgState.hasFiredAtLeastOnce ? "flex" : "none";
  }
  const btnFire = document.getElementById("btn-fire");
  if (btnFire) {
    if (sgState.hasFiredAtLeastOnce) {
      btnFire.classList.remove("animate-fire-onboarding");
    } else {
      btnFire.classList.add("animate-fire-onboarding");
    }
  }

  var uc = function(ch) {
    var isA = ch === "a", active = isA ? sgState.onA : sgState.onB;
    var idx = isA ? sgState.colA : sgState.colB, hex = PALETTE[idx].hex;
    var b = document.getElementById("btn-" + ch + "-on");
    if (b) { b.style.background = active ? hex + "33" : "transparent"; b.style.borderColor = active ? hex : "rgba(255,255,255,0.1)"; b.style.color = active ? hex : "rgba(255,255,255,0.2)"; }
    var p = document.getElementById("btn-" + ch + "-palette"); if (p) p.style.background = hex;
    var card = document.getElementById("spot-" + ch + "-card");
    if (card) { card.style.borderColor = hex + "55"; card.style.background = hex + "0d"; }
  };
  uc("a"); uc("b");

  ["kink", "anti", "breath", "wind"].forEach(function(m) {
    document.getElementById("btn-a-mode-" + m).classList.remove("active");
    document.getElementById("btn-b-mode-" + m).classList.remove("active");
  });
  document.getElementById("btn-a-mode-" + sgState.modeA).classList.add("active");
  document.getElementById("btn-b-mode-" + sgState.modeB).classList.add("active");

  document.getElementById("btn-a-dir-cw").classList.remove("active");
  document.getElementById("btn-a-dir-ccw").classList.remove("active");
  document.getElementById("btn-b-dir-cw").classList.remove("active");
  document.getElementById("btn-b-dir-ccw").classList.remove("active");
  document.getElementById("btn-a-dir-" + sgState.dirA).classList.add("active");
  document.getElementById("btn-b-dir-" + sgState.dirB).classList.add("active");

  var btnGimbal = document.getElementById("btn-gimbal-ring");
  if (btnGimbal) {
    if (sgState.gimbalRingActive) {
      btnGimbal.classList.add("active");
      if (sgState.gimbalPhysicsMode === "full") {
        btnGimbal.textContent = "🪐 Gimbal: Full";
        btnGimbal.setAttribute("title", "Gimbal-Ring Full physical dynamics is active");
      } else {
        btnGimbal.textContent = "🪐 Gimbal: Simple";
        btnGimbal.setAttribute("title", "Gimbal-Ring Simplified dynamics is active");
      }
    } else {
      btnGimbal.classList.remove("active");
      btnGimbal.textContent = "🪐 Gimbal: Off";
      btnGimbal.setAttribute("title", "Activate Gimbal-Ring relative frame physical forces");
    }
  }
  var elNudges = document.getElementById("gimbal-nudges");
  if (elNudges) {
    elNudges.style.display = sgState.gimbalRingActive ? "flex" : "none";
  }
  var elGimbalDamp = document.getElementById("gimbal-damping-column");
  if (elGimbalDamp) {
    elGimbalDamp.style.display = sgState.gimbalRingActive ? "flex" : "none";
  }
}

function init() {
  loadExportSettings();
  
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia("(any-pointer: coarse)").matches;
  const memory = navigator.deviceMemory || (isMobile ? 2 : 8);
  const isConstrained = isMobile || memory <= 4;
  
  const dpr = window.devicePixelRatio || 1;
  const screenW = window.screen.width * dpr;
  const screenH = window.screen.height * dpr;
  const maxScreenDim = Math.max(screenW, screenH);
  const minScreenDim = Math.min(screenW, screenH);

  const selRes = document.getElementById("sel-res");
  
  if (selRes) {
    Array.from(selRes.options).forEach(opt => {
      const [w, h] = opt.value.split("x").map(Number);
      const optMax = Math.max(w, h);
      const optMin = Math.min(w, h);
      
      let disableInfo = null;
      if (optMax > maxScreenDim || optMin > minScreenDim) {
        disableInfo = "(Exceeds Screen)";
      } else if (isConstrained && (w >= 1920 || h >= 1080)) {
        disableInfo = "(PC Only)";
      }
      
      if (disableInfo) {
        opt.disabled = true;
        if (!opt.textContent.includes(disableInfo)) opt.textContent += ` ${disableInfo}`;
      }
    });
  }

  if (isConstrained) {
    const selFps = document.getElementById("sel-fps");
    if (selFps) {
      Array.from(selFps.options).forEach(opt => {
         if (Number(opt.value) >= 120) {
            opt.disabled = true;
            if (!opt.textContent.includes("(PC Only)")) opt.textContent += " (PC Only)";
         }
      });
      if (sgState.exportFPS >= 120) {
         sgState.exportFPS = 60;
         saveExportSettings();
      }
    }
  }
  
  var viewport = document.getElementById("viewport");

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, viewport.clientWidth / viewport.clientHeight, 0.1, 2000);
  camera.position.set(30, 20, 50);
  window.camera = camera;
  
  const dims = ensureEvenDimensions(viewport.clientWidth, viewport.clientHeight);
  
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.setSize(dims.width, dims.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);
  
  recorder = new RecordingEngine();
  recorder.init(renderer.domElement, renderer);
  
  snapshotEngine = new SnapshotEngine();
  snapshotEngine.init(renderer.domElement, renderer);
  
  recorder.setProgressCallback(updateRecordingUI);
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  var pl = new THREE.PointLight(0xffffff, 2.5, 100); 
  pl.position.set(15, 25, 15); 
  scene.add(pl);

  var viewDistance = 60;
  var viewTarget = new THREE.Vector3(0, 1.5, 0);

  function animateCamera(pos, target) {
    var startPos = camera.position.clone();
    var startTarget = controls.target.clone();
    var endPos = pos.clone();
    var endTarget = target ? target.clone() : viewTarget.clone();
    var startTime = performance.now();
    var duration = 500;

    function step(now) {
      var elapsed = now - startTime;
      var t = Math.min(1, elapsed / duration);
      t = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      camera.position.lerpVectors(startPos, endPos, t);
      controls.target.lerpVectors(startTarget, endTarget, t);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  document.getElementById("btn-view-front").onclick = function() {
    animateCamera(new THREE.Vector3(0, 1.5, viewDistance), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-back").onclick = function() {
    animateCamera(new THREE.Vector3(0, 1.5, -viewDistance), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-left").onclick = function() {
    animateCamera(new THREE.Vector3(-viewDistance, 1.5, 0), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-right").onclick = function() {
    animateCamera(new THREE.Vector3(viewDistance, 1.5, 0), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-top").onclick = function() {
    animateCamera(new THREE.Vector3(0, viewDistance + 1.5, 0.01), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-bottom").onclick = function() {
    animateCamera(new THREE.Vector3(0, -viewDistance + 1.5, 0.01), new THREE.Vector3(0, 1.5, 0));
  };
  document.getElementById("btn-view-reset").onclick = function() {
    animateCamera(new THREE.Vector3(30, 20, 50), new THREE.Vector3(0, 1.5, 0));
  };

  physics = new PhysicsEngine(sgState.physics);
  physics.stateRef = sgState;
  rendererRef.current = new SceneRenderer(scene, 720, sgState.morph);
  rendererRef.current.N = sgState.physics.N;
  rendererRef.current.build(sgState, undefined, sgState.morph);
  rendererRef.current.resize(sgState.physics.N);

  var gridSize = 160, gridDivisions = 40, gridY = -5;
  var halfSize = gridSize / 2, step = gridSize / gridDivisions;
  var dimColor = new THREE.Color("#335577"), brightColor = new THREE.Color("#66bbff");

  var modVerts = [];
  modVerts.push(-halfSize, 0, 0, halfSize, 0, 0);
  modVerts.push(0, 0, -halfSize, 0, 0, halfSize);
  var modGeom = new THREE.BufferGeometry();
  modGeom.setAttribute("position", new THREE.Float32BufferAttribute(modVerts, 3));
  var modMat = new THREE.LineBasicMaterial({ color: brightColor, transparent: true, opacity: 0.35, depthWrite: false });
  var modGrid = new THREE.LineSegments(modGeom, modMat);
  modGrid.position.y = gridY; scene.add(modGrid);

  var edgeVerts = [];
  edgeVerts.push(-halfSize, 0, -halfSize, -halfSize, 0, halfSize);
  edgeVerts.push(halfSize, 0, -halfSize, halfSize, 0, halfSize);
  edgeVerts.push(-halfSize, 0, -halfSize, halfSize, 0, -halfSize);
  edgeVerts.push(-halfSize, 0, halfSize, halfSize, 0, halfSize);
  var edgeGeom = new THREE.BufferGeometry();
  edgeGeom.setAttribute("position", new THREE.Float32BufferAttribute(edgeVerts, 3));
  var edgeMat = new THREE.LineBasicMaterial({ color: brightColor, transparent: true, opacity: 0.35, depthWrite: false });
  var edgeGrid = new THREE.LineSegments(edgeGeom, edgeMat);
  edgeGrid.position.y = gridY; scene.add(edgeGrid);

  var innerVerts = [], mid = Math.floor(gridDivisions / 2);
  for (var i = 0; i <= gridDivisions; i++) {
    var z = -halfSize + i * step, x = -halfSize + i * step;
    if (i !== 0 && i !== gridDivisions && i !== mid) {
      innerVerts.push(-halfSize, 0, z, halfSize, 0, z);
      innerVerts.push(x, 0, -halfSize, x, 0, halfSize);
    }
  }
  var innerGeom = new THREE.BufferGeometry();
  innerGeom.setAttribute("position", new THREE.Float32BufferAttribute(innerVerts, 3));
  var innerMat = new THREE.LineBasicMaterial({ color: dimColor, transparent: true, opacity: 0.15, depthWrite: false });
  var innerGrid = new THREE.LineSegments(innerGeom, innerMat);
  innerGrid.position.y = gridY; scene.add(innerGrid);

  document.getElementById("thumb-pos-a-container").innerHTML = UI.template("pos-a", "Node", "h", "val-pos-a");
  document.getElementById("thumb-pos-b-container").innerHTML = UI.template("pos-b", "Node", "h", "val-pos-b");
  document.getElementById("thumb-shared-container").innerHTML = UI.template("sharp", "Sharp", "h", "val-sharp") + UI.template("vel", "Vel", "h", "val-vel");
  document.getElementById("physics-thumb-container").innerHTML = 
    '<div class="flex flex-col gap-1">' +
      UI.template("speed", "Speed", "h", "val-speed") +
      UI.template("kappa", "Coupling", "h", "val-kappa") +
      UI.template("grav", "Gravity", "h", "val-grav") +
    '</div>' +
    '<div class="flex flex-col gap-1">' +
      UI.template("gamma", "Damping", "h", "val-gamma") +
      '<div id="gimbal-damping-column" class="flex" style="display: none;">' +
        UI.template("gimbal-damping", "G-Damp", "h", "val-gimbal-damping") +
      '</div>' +
    '</div>';
  document.getElementById("thumb-nodes-container").innerHTML = UI.template("nodes", "ELEMENTS", "v", "val-nodes");

  UI.setup("pos-a", "posA", 0, sgState.physics.N, 1, true, refreshUI, 10, function() { sgState.posA = Math.floor(sgState.physics.N * 0.75); });
  UI.setup("pos-b", "posB", 0, sgState.physics.N, 1, true, refreshUI, 10, function() { sgState.posB = Math.floor(sgState.physics.N * 0.25); });
  UI.setup("sharp", "sharp", 0.5, 8, 0.5, false, refreshUI, 0, function() { sgState.sharp = 3; });
  UI.setup("vel", "vel", 0.5, 15, 0.1, false, refreshUI, 0, function() { sgState.vel = 7; });
  UI.setup("speed", "timeScale", 0.1, 5, 0.1, false, refreshUI);
  UI.setup("kappa", "physics.kappa", 1, 1000, 10, true, refreshUI);
  UI.setup("grav", "physics.gravity", -10, 10, 0.5, false, refreshUI, 0, function() { sgState.physics.gravity = 1; });
  UI.setup("gamma", "physics.gamma", 0, 0.5, 0.005, false, refreshUI);
  UI.setup("gimbal-damping", "gimbalDamping", 0, 0.5, 0.001, false, refreshUI, 0, function() { sgState.gimbalDamping = 0.001; });
  UI.setup("nodes", "physics.N", 20, 720, 1, true, function() {
    changeElementCount(sgState.physics.N, rendererRef, physics, refreshUI);
  }, 0, function() { 
    changeElementCount(180, rendererRef, physics, refreshUI); 
  });

  if (sgState.physics.linearWrap) document.getElementById("btn-linear-wrap").classList.add("active");
  if (sgState.gimbalRingActive) document.getElementById("btn-gimbal-ring").classList.add("active");

  bindEvents(physics, rendererRef, recorder, snapshotEngine);
  refreshUI();
  
  // Hover Raycaster integration
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var hoverWidget = document.getElementById("hover-id-widget");
  var hoverValue = document.getElementById("hover-id-value");

  renderer.domElement.addEventListener('pointermove', function(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (camera && rendererRef.current && rendererRef.current.lastPositions) {
      raycaster.setFromCamera(mouse, camera);
      var sr = rendererRef.current;
      var N = sr.N;
      var bestDistSq = Infinity;
      var bestId = -1;
      var bestType = "";
      
      var m = sr.lastMorph;
      var modelMat = sr.modelGroup.matrixWorld;
      var ray = raycaster.ray;

      var pivot = new THREE.Vector3();
      var bob = new THREE.Vector3();
      var ptOnRay = new THREE.Vector3();
      var ptOnSeg = new THREE.Vector3();

      for (var i = 0; i < N; i++) {
        var pos = sr.lastPositions[i];
        var phiVal = sr.lastPhi[i];
        
        var th = (i / N) * 2 * Math.PI;
        var ry = -th + 1.5707963268;
        if (m <= 1.0) ry *= m;
        
        pivot.set(pos.x, pos.y, pos.z);
        
        var bx = 3 * Math.sin(phiVal) * Math.sin(ry);
        var by = -3 * Math.cos(phiVal);
        var bz = 3 * Math.sin(phiVal) * Math.cos(ry);
        
        bob.set(pos.x + bx, pos.y + by, pos.z + bz);
        
        pivot.applyMatrix4(modelMat);
        bob.applyMatrix4(modelMat);
        
        var dSqSeg = ray.distanceSqToSegment(pivot, bob, ptOnRay, ptOnSeg);
        var dSqBob = ray.distanceSqToPoint(bob);
        
        var radiusRod = 0.3;
        var radiusBob = 0.5; 
        
        if (dSqBob < radiusBob * radiusBob && dSqBob < bestDistSq) {
          bestDistSq = dSqBob;
          bestId = i;
          bestType = "Bob";
        } else if (dSqSeg < radiusRod * radiusRod && dSqSeg < bestDistSq) {
          bestDistSq = dSqSeg;
          bestId = i;
          bestType = "Rod";
        }
      }

      var distThreshold = Math.sqrt(bestDistSq);
      
      var standardObjs = [];
      if (sr.ghostInst && sr.ghostInst.count > 0) standardObjs.push(sr.ghostInst);
      if (sr.ticInst && sr.ticInst.count > 0) standardObjs.push(sr.ticInst);
      if (sr.support && sr.support.visible) standardObjs.push(sr.support);
      if (sr.ring && sr.ring.visible) standardObjs.push(sr.ring);
      
      var hits = raycaster.intersectObjects(standardObjs, false);
      if (hits.length > 0 && hits[0].distance < distThreshold) {
        var hit = hits[0];
        bestDistSq = hit.distance * hit.distance;
        if (hit.object === sr.ghostInst) { bestType = "Ghost"; bestId = hit.instanceId; }
        else if (hit.object === sr.ticInst) { bestType = "Tic"; bestId = (sr.ticInst.userData.indexMap ? sr.ticInst.userData.indexMap[hit.instanceId] : hit.instanceId); }
        else if (hit.object === sr.support) { bestType = "SupportBracket"; bestId = "-"; }
        else if (hit.object === sr.ring) { bestType = "RingBracket"; bestId = "-"; }
        else { bestType = "Unknown"; bestId = "-"; }
      }

      if (bestId !== -1 || bestType !== "") {
        hoverWidget.style.display = "block";
        hoverWidget.style.left = (event.clientX + 15) + "px";
        hoverWidget.style.top = (event.clientY - 15) + "px";
        hoverValue.textContent = bestType + (bestId !== "-" ? "[" + bestId + "]" : "");
      } else {
        hoverWidget.style.display = "none";
      }
    }
  });

  animate(0, rendererRef, renderer, controls, physics, recorder, camera);
}

window.addEventListener('resize', function() {
  if (!renderer || !camera) return;
  
  if (recorder && recorder.isRecording) {
    console.log("Window resized during active recording. Postponing canvas resize until recording stops.");
    return;
  }
  
  const viewport = document.getElementById("viewport");
  const dims = ensureEvenDimensions(viewport.clientWidth, viewport.clientHeight);
  
  camera.aspect = dims.width / dims.height;
  camera.updateProjectionMatrix();
  renderer.setSize(dims.width, dims.height);
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden && recorder && recorder.isRecording) {
    console.warn('Tab hidden during recording - frames may be lost');
  }
});

init();