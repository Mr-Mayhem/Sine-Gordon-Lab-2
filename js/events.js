// =============================================================================
// sine-gordon-lab — js/events.js (FIXED)
// All DOM event bindings — buttons, dropdowns, mode toggles
// No imports from constants.js or animation.js to avoid circular dependencies
// =============================================================================

import { sgState } from "./state.js";
import { generateTelemetry } from "./telemetry.js";
import { processFrame } from "./pipeline.js";

export function bindEvents(physics, rendererRef, recorder, snapshotEngine) {
  // Local constants to avoid import ambiguity
  const PALETTE = [
    { hex: "#00ff88" },
    { hex: "#00ccff" },
    { hex: "#ffb000" },
    { hex: "#ff66cc" },
    { hex: "#88aaff" },
    { hex: "#ff8844" },
    { hex: "#aa88ff" },
    { hex: "#e8e8e8" },
  ];

  // Local DEFAULT_PHYSICS for factory reset
  const DEFAULT_PHYSICS = {
    N: 120,
    kappa: 100,
    gravity: 10,
    gamma: 0,
    dt: 0.01,
    topo: "circ",
    linearWrap: false,
  };

  // Local topology change function (avoids circular dependency with animation.js)
  function localChangeTopology(topo) {
    sgState.physics.topo = topo;

    var lemForm = document.getElementById("sel-lemniscate-form");
    var linearWrap = document.getElementById("btn-linear-wrap");
    if (lemForm) lemForm.style.display = topo === "lemniscate" ? "" : "none";
    if (linearWrap) linearWrap.style.display = topo === "linear" ? "" : "none";

    var target = topo === "circ" ? 1 : topo === "lemniscate" ? 2 : 0;
    sgState.morphTarget = target;
    sgState.isLerping = true;

    physics.reset();
  }

  // Local factory reset function (avoids circular dependency with animation.js)
  function localFactoryReset() {
    Object.assign(sgState.physics, DEFAULT_PHYSICS);
    physics.syncParams(sgState.physics, true);
    sgState.posA = Math.floor(sgState.physics.N * 0.75);
    sgState.posB = Math.floor(sgState.physics.N * 0.25);
    var target =
      sgState.physics.topo === "circ"
        ? 1
        : sgState.physics.topo === "lemniscate"
          ? 2
          : 0;
    sgState.morph = target;
    sgState.isLerping = false;
    var refreshUIFn = function () {
      document.getElementById("val-pos-a").textContent = Math.round(
        sgState.posA,
      );
      document.getElementById("val-pos-b").textContent = Math.round(
        sgState.posB,
      );
      document.getElementById("val-sharp").textContent =
        sgState.sharp.toFixed(1);
      document.getElementById("val-vel").textContent = sgState.vel.toFixed(1);
      document.getElementById("val-speed").textContent =
        sgState.timeScale.toFixed(1) + "x";
      document.getElementById("val-kappa").textContent =
        sgState.physics.kappa.toFixed(0);
      document.getElementById("val-grav").textContent =
        sgState.physics.gravity.toFixed(1);
      document.getElementById("val-gamma").textContent =
        sgState.physics.gamma.toFixed(3);
      document.getElementById("val-nodes").textContent = sgState.physics.N;
      document.getElementById("sel-format").value = sgState.exportFormat;
      var selP = document.getElementById("sel-pipeline");
      var selA = document.getElementById("sel-action");
      var btnV = document.getElementById("btn-video");
      if (selP && selA && btnV) {
        selP.value = sgState.exportPipeline;

        if (sgState.exportPipeline !== "zip") {
          selA.style.visibility = "hidden";
          selA.style.pointerEvents = "none";
          sgState.exportAction = "record";
          selA.value = "record";
        } else {
          selA.style.visibility = "visible";
          selA.style.pointerEvents = "auto";
          selA.value = sgState.exportAction;
        }

        if (
          sgState.exportAction === "assemble" &&
          sgState.exportPipeline === "zip"
        ) {
          btnV.textContent = "🛠 Assemble";
          btnV.style.borderColor = "var(--accent)";
          btnV.style.color = "var(--accent)";
        } else {
          btnV.textContent = "⏺ Record";
          btnV.style.borderColor = "";
          btnV.style.color = "";
        }
      }
      document.getElementById("sel-fps").value = sgState.exportFPS;
      if (document.getElementById("sel-crf"))
        document.getElementById("sel-crf").value = sgState.exportCRF;
      document.getElementById("firing-solution-list").innerHTML =
        "A:" + Math.round(sgState.posA) + " B:" + Math.round(sgState.posB);

      var btnGimbal = document.getElementById("btn-gimbal-ring");
      if (btnGimbal) {
        if (sgState.gimbalRingActive) {
          btnGimbal.classList.add("active");
          if (sgState.gimbalPhysicsMode === "full") {
            btnGimbal.textContent = "🪐 Gimbal: Full";
            btnGimbal.setAttribute(
              "title",
              "Gimbal-Ring Full physical dynamics is active",
            );
          } else {
            btnGimbal.textContent = "🪐 Gimbal: Simple";
            btnGimbal.setAttribute(
              "title",
              "Gimbal-Ring Simplified dynamics is active",
            );
          }
        } else {
          btnGimbal.classList.remove("active");
          btnGimbal.textContent = "🪐 Gimbal: Off";
          btnGimbal.setAttribute(
            "title",
            "Activate Gimbal-Ring relative frame physical forces",
          );
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
    };
    refreshUIFn();
  }

  function applyChannelStyles(ch) {
    var isA = ch === "a";
    var idx = isA ? sgState.colA : sgState.colB;
    var active = isA ? sgState.onA : sgState.onB;
    var hex = PALETTE[idx].hex;
    var btnOn = document.getElementById("btn-" + ch + "-on");
    if (btnOn) {
      btnOn.style.background = active ? hex + "33" : "transparent";
      btnOn.style.borderColor = active ? hex : "rgba(255,255,255,0.1)";
      btnOn.style.color = active ? hex : "rgba(255,255,255,0.2)";
    }
    var palette = document.getElementById("btn-" + ch + "-palette");
    if (palette) palette.style.background = hex;
    var card = document.getElementById("spot-" + ch + "-card");
    if (card) {
      card.style.borderColor = active ? hex + "55" : "rgba(255,255,255,0.1)";
      card.style.background = active ? hex + "0d" : "rgba(255,255,255,0.03)";
    }
  }

  // Play / Pause
  document.getElementById("btn-play").onclick = function () {
    if (sgState.isLerping) return;
    sgState.paused = !sgState.paused;
    var l = sgState.paused ? "▶ Run" : "⏸ Pause";
    var i = sgState.paused ? "▶" : "⏸";
    document.getElementById("btn-play").textContent = l;
    document.getElementById("btn-side-play").textContent = i;
  };
  document.getElementById("btn-side-play").onclick = function () {
    if (sgState.isLerping) return;
    sgState.paused = !sgState.paused;
    var l = sgState.paused ? "▶ Run" : "⏸ Pause";
    var i = sgState.paused ? "▶" : "⏸";
    document.getElementById("btn-play").textContent = l;
    document.getElementById("btn-side-play").textContent = i;
  };

  // Fire Impulse
  document.getElementById("btn-fire").onclick = function () {
    if (sgState.onA) {
      if (sgState.modeA === "kink")
        physics.inject(
          sgState.posA,
          sgState.sharp,
          sgState.amp,
          sgState.dirA,
          sgState.vel,
        );
      else if (sgState.modeA === "anti")
        physics.inject(
          sgState.posA,
          sgState.sharp,
          -sgState.amp,
          sgState.dirA,
          sgState.vel,
        );
      else if (sgState.modeA === "breath")
        physics.inject(
          sgState.posA,
          sgState.sharp,
          sgState.amp,
          "breather",
          sgState.vel,
        );
      else if (sgState.modeA === "wind")
        physics.wind(sgState.dirA === "cw" ? 1 : -1);
    }
    if (sgState.onB) {
      if (sgState.modeB === "kink")
        physics.inject(
          sgState.posB,
          sgState.sharp,
          sgState.amp,
          sgState.dirB,
          sgState.vel,
        );
      else if (sgState.modeB === "anti")
        physics.inject(
          sgState.posB,
          sgState.sharp,
          -sgState.amp,
          sgState.dirB,
          sgState.vel,
        );
      else if (sgState.modeB === "breath")
        physics.inject(
          sgState.posB,
          sgState.sharp,
          sgState.amp,
          "breather",
          sgState.vel,
        );
      else if (sgState.modeB === "wind")
        physics.wind(sgState.dirB === "cw" ? 1 : -1);
    }
    sgState.paused = false;
    sgState.hasFiredAtLeastOnce = true;
    if (window.refreshUI) window.refreshUI();
    var l = sgState.paused ? "▶ Run" : "⏸ Pause";
    document.getElementById("btn-play").textContent = l;
    document.getElementById("btn-side-play").textContent = sgState.paused
      ? "▶"
      : "⏸";
  };

  // Reset / Step / Snapshot
  document.getElementById("btn-reset").onclick = function () {
    physics.reset();
    sgState.paused = true;
    document.getElementById("btn-play").textContent = "▶ Run";
    document.getElementById("btn-side-play").textContent = "▶";
  };
  document.getElementById("btn-rapid-reset").onclick = function () {
    physics.reset();
    sgState.paused = true;
    document.getElementById("btn-play").textContent = "▶ Run";
    document.getElementById("btn-side-play").textContent = "▶";
  };
  document.getElementById("btn-step").onclick = function () {
    physics.step(1);
    var sr = rendererRef.current;
    var fd = processFrame(
      sgState,
      physics.phi,
      physics.acc,
      sr._glowPosAttr.array,
      sr._glowNegAttr.array,
      sr.maxAcc,
    );
    sr.render(fd, physics.phi);
  };
  document.getElementById("btn-snapshot").onclick = function () {
    if (snapshotEngine) snapshotEngine.capture();
  };

  // Video Record / Assemble
  document.getElementById("btn-video").onclick = function () {
    if (sgState.exportAction === "assemble") {
      if (recorder && !recorder.isAssembling) {
        recorder.assembleFromStorage(sgState.exportPipeline);
      }
      return;
    }

    if (sgState.isRecording) {
      sgState.isRecording = false;
      sgState.paused = true;
      document.getElementById("btn-play").textContent = "▶ Run";
      recorder.stop();
      if (window.refreshUI) window.refreshUI();
    } else {
      sgState.isRecording = true;
      (async () => {
        let fps = sgState.exportFPS || 60;
        let limit = 1800;

        const isMobile =
          /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
          window.matchMedia("(any-pointer: coarse)").matches;
        const memory = navigator.deviceMemory || (isMobile ? 2 : 8);
        const isConstrained = isMobile || memory <= 4;

        if (sgState.exportLimit === "min") {
          limit = 5 * fps;
        } else if (sgState.exportLimit === "max") {
          if (navigator.storage && navigator.storage.estimate) {
            let est = await navigator.storage.estimate();
            let avail = est.quota - est.usage;
            let pixels = sgState.exportWidth * sgState.exportHeight;
            let sizePerFrame = pixels * 4 + 200000;

            let quotaTarget = isConstrained ? 0.15 : 0.4;
            let targetFrames = Math.floor((avail * quotaTarget) / sizePerFrame);

            let ceilingFrames = isConstrained ? 5 * 60 * fps : 10 * 60 * fps;

            limit = Math.min(targetFrames, ceilingFrames);
            if (limit < 60) limit = 60;
          } else {
            limit = isConstrained ? 3600 : 7200;
          }
        } else {
          limit = 30 * fps;
        }

        recorder.setFrameLimit(limit);
        recorder.start();
        document.getElementById("btn-video").textContent = "⏹ Stop";
        document.getElementById("btn-video").classList.add("btn-warn");
      })();
    }
  };

  // Impulse Visibility
  document.getElementById("btn-impulse-master").onclick = function () {
    sgState.impulseVisible = !sgState.impulseVisible;
  };

  // Collapse/Expand Widgets
  document.getElementById("btn-collapse-launch").onclick = function () {
    var p = document.getElementById("launch-panel");
    var c = p.querySelector(".widget-content");
    var b = document.getElementById("btn-collapse-launch");
    if (c.style.display === "none") {
      c.style.display = "";
      b.textContent = "▲";
      b.title = "Collapse Panel";
      p.classList.remove("widget-collapsed");
    } else {
      c.style.display = "none";
      b.textContent = "▼";
      b.title = "Expand Panel";
      p.classList.add("widget-collapsed");
    }
  };
  document.getElementById("btn-collapse-bottom").onclick = function () {
    var p = document.getElementById("bottom-bar");
    var c = p.querySelector(".bottom-bar-inner .widget-content");
    var b = document.getElementById("btn-collapse-bottom");
    if (c.style.display === "none") {
      c.style.display = "";
      b.textContent = "▲";
      b.title = "Collapse Panel";
      p.querySelector(".bottom-bar-inner").classList.remove("widget-collapsed");
    } else {
      c.style.display = "none";
      b.textContent = "▼";
      b.title = "Expand Panel";
      p.querySelector(".bottom-bar-inner").classList.add("widget-collapsed");
    }
  };

  // Linear Wrap
  document.getElementById("btn-linear-wrap").onclick = function () {
    sgState.physics.linearWrap = !sgState.physics.linearWrap;
    var b = document.getElementById("btn-linear-wrap");
    if (sgState.physics.linearWrap) b.classList.add("active");
    else b.classList.remove("active");
  };

  // Gimbal-Ring Mode (Nested Gimbal Rotation Mode)
  document.getElementById("btn-gimbal-ring").onclick = function () {
    if (!sgState.gimbalRingActive) {
      sgState.gimbalRingActive = true;
      sgState.gimbalPhysicsMode = "simplified";
    } else if (sgState.gimbalPhysicsMode === "simplified") {
      sgState.gimbalRingActive = true;
      sgState.gimbalPhysicsMode = "full";
      sgState.physics.gravity = 0;
    } else {
      sgState.gimbalRingActive = false;
      sgState.gimbalPhysicsMode = "simplified";
    }
    if (window.refreshUI) window.refreshUI();
  };

  // Nudge Gimbal Buttons click bindings
  document.getElementById("btn-nudge-outer-l").onclick = function () {
    sgState.gimbalOuterNudge1 += 0.15;
  };
  document.getElementById("btn-nudge-outer-r").onclick = function () {
    sgState.gimbalOuterNudge1 -= 0.15;
  };
  document.getElementById("btn-nudge-mid-f").onclick = function () {
    sgState.gimbalMiddleNudge1 += 0.15;
  };
  document.getElementById("btn-nudge-mid-b").onclick = function () {
    sgState.gimbalMiddleNudge1 -= 0.15;
  };

  // Factory Reset
  document.getElementById("btn-factory-reset").onclick = function () {
    if (confirm("Hard reset all parameters?")) {
      localFactoryReset();
    }
  };

  // Channel A/B on/off toggles
  document.getElementById("btn-a-on").onclick = function () {
    sgState.onA = !sgState.onA;
    applyChannelStyles("a");
  };
  document.getElementById("btn-b-on").onclick = function () {
    sgState.onB = !sgState.onB;
    applyChannelStyles("b");
  };

  // Palette buttons (skip other channel's color)
  document.getElementById("btn-a-palette").onclick = function () {
    var next = (sgState.colA + 1) % PALETTE.length;
    if (next === sgState.colB) next = (next + 1) % PALETTE.length;
    sgState.colA = next;
    applyChannelStyles("a");
  };
  document.getElementById("btn-b-palette").onclick = function () {
    var next = (sgState.colB + 1) % PALETTE.length;
    if (next === sgState.colA) next = (next + 1) % PALETTE.length;
    sgState.colB = next;
    applyChannelStyles("b");
  };

  // Processing overlay
  var btnClose = document.getElementById("btn-close-processing");
  if (btnClose) {
    btnClose.onclick = function () {
      document.getElementById("processing-overlay").style.display = "none";
    };
  }
  var btnCopy = document.getElementById("btn-copy-telemetry-ready");
  if (btnCopy) {
    btnCopy.onclick = function () {
      var t = generateTelemetry(physics);
      navigator.clipboard.writeText(t).then(function () {
        var b = document.getElementById("btn-copy-telemetry-ready");
        var o = b.innerHTML;
        b.innerHTML = "✓";
        setTimeout(function () {
          b.innerHTML = o;
        }, 1500);
      });
    };
  }

  var btnCopyLogs = document.getElementById("btn-copy-logs");
  if (btnCopyLogs) {
    btnCopyLogs.onclick = function () {
      if (window.copyAssemblyLogsToClipboard) {
        window.copyAssemblyLogsToClipboard();
      }
    };
  }

  // Topology Dropdown
  document.getElementById("sel-topology").onchange = function () {
    localChangeTopology(this.value);
  };

  // Lemniscate Form Dropdown
  document.getElementById("sel-lemniscate-form").onchange = function () {
    sgState.lemniscateForm = this.value;
  };

  // Other Dropdowns
  document.getElementById("sel-orientation").onchange = function () {
    sgState.orientationTarget = this.value;
  };
  document.getElementById("sel-format").onchange = function () {
    sgState.exportFormat = this.value;
  };
  var selL = document.getElementById("sel-limit");
  if (selL)
    selL.onchange = function () {
      sgState.exportLimit = this.value;
    };
  var selC = document.getElementById("sel-crf");
  if (selC)
    selC.onchange = function () {
      sgState.exportCRF = parseInt(this.value);
    };
  var selPipeline = document.getElementById("sel-pipeline");
  var selAction = document.getElementById("sel-action");
  var btnVideo = document.getElementById("btn-video");

  if (selPipeline && selAction && btnVideo) {
    selPipeline.onchange = function () {
      sgState.exportPipeline = this.value;
      if (window.refreshUI) window.refreshUI();
    };

    selAction.onchange = function () {
      sgState.exportAction = this.value;
      if (window.refreshUI) window.refreshUI();
    };
  }

  // Resolution dropdown: no onchange handler — value is read directly at record time
  document.getElementById("sel-fps").onchange = function () {
    sgState.exportFPS = Number(this.value);
  };
  if (document.getElementById("sel-crf"))
    document.getElementById("sel-crf").onchange = function () {
      sgState.exportCRF = this.value;
    };

  // Theory
  document.getElementById("btn-theory").onclick = function () {
    document.getElementById("theory-overlay").style.display = "block";
  };
  document.getElementById("btn-close-theory").onclick = function () {
    document.getElementById("theory-overlay").style.display = "none";
  };

  // Mode & Direction
  ["kink", "anti", "breath", "wind"].forEach(function (m) {
    document.getElementById("btn-a-mode-" + m).onclick = function () {
      sgState.modeA = m;
      ["kink", "anti", "breath", "wind"].forEach(function (x) {
        document.getElementById("btn-a-mode-" + x).classList.remove("active");
      });
      document.getElementById("btn-a-mode-" + m).classList.add("active");
    };
    document.getElementById("btn-b-mode-" + m).onclick = function () {
      sgState.modeB = m;
      ["kink", "anti", "breath", "wind"].forEach(function (x) {
        document.getElementById("btn-b-mode-" + x).classList.remove("active");
      });
      document.getElementById("btn-b-mode-" + m).classList.add("active");
    };
  });
  document.getElementById("btn-a-dir-cw").onclick = function () {
    sgState.dirA = "cw";
    document.getElementById("btn-a-dir-cw").classList.add("active");
    document.getElementById("btn-a-dir-ccw").classList.remove("active");
  };
  document.getElementById("btn-a-dir-ccw").onclick = function () {
    sgState.dirA = "ccw";
    document.getElementById("btn-a-dir-ccw").classList.add("active");
    document.getElementById("btn-a-dir-cw").classList.remove("active");
  };
  document.getElementById("btn-b-dir-cw").onclick = function () {
    sgState.dirB = "cw";
    document.getElementById("btn-b-dir-cw").classList.add("active");
    document.getElementById("btn-b-dir-ccw").classList.remove("active");
  };
  document.getElementById("btn-b-dir-ccw").onclick = function () {
    sgState.dirB = "ccw";
    document.getElementById("btn-b-dir-ccw").classList.add("active");
    document.getElementById("btn-b-dir-cw").classList.remove("active");
  };

  // Unload Warning
  window.onbeforeunload = function (e) {
    if (recorder.isRecording || recorder.isAssembling) {
      var m =
        "A recording or assembly is currently in progress. Leaving this page will discard all captured frames.";
      e.returnValue = m;
      return m;
    }
  };
}
