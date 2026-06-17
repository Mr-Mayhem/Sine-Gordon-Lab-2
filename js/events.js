// =============================================================================
// sine-gordon-lab — js/events.js (FIXED)
// All DOM event bindings — buttons, dropdowns, mode toggles
// No imports from constants.js or animation.js to avoid circular dependencies
// =============================================================================

import { sgState } from "./state.js";
import { generateTelemetry } from "./telemetry.js";
import { processFrame } from "./pipeline.js";
import { DiscSpaceEstimator } from "./disc-space-estimator.js";

export function bindEvents(physics, rendererRef, recorder, snapshotEngine) {
  // Safe event binding utilities to prevent null selector crashes
  function safeClick(id, fn) {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = fn;
    } else {
      console.warn(`[bindEvents] click target #${id} not found.`);
    }
  }

  function safeChange(id, fn) {
    const el = document.getElementById(id);
    if (el) {
      el.onchange = fn;
    } else {
      console.warn(`[bindEvents] change target #${id} not found.`);
    }
  }

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
    N: 100,
    kappa: 100,
    gravity: 10,
    gamma: 0,
    dt: 0.01,
    topo: "linear",
    linearWrap: false,
  };

  // Local topology change function (avoids circular dependency with animation.js)
  function localChangeTopology(topo) {
    sgState.physics.topo = topo;

    // Default elements for linear is 100, and for circ/lemniscate/ellipse is 120
    const newN = topo === "linear" ? 100 : 120;
    sgState.posA = Math.floor(newN * 0.75);
    sgState.posB = Math.floor(newN * 0.25);
    sgState.physics.N = newN;
    physics.syncParams(sgState.physics, true);
    if (rendererRef && rendererRef.current) {
      rendererRef.current.N = newN;
      rendererRef.current.resize(newN);
    }

    var lemForm = document.getElementById("sel-lemniscate-form");
    var elParams = document.getElementById("ellipse-params");
    var linearWrap = document.getElementById("btn-linear-wrap");
    if (lemForm) lemForm.style.display = topo === "lemniscate" ? "" : "none";
    if (elParams) elParams.style.display = topo === "ellipse" ? "" : "none";
    if (linearWrap) linearWrap.style.display = topo === "linear" ? "" : "none";

    var target = (topo === "circ" || topo === "ellipse") ? 1 : topo === "lemniscate" ? 2 : 0;
    sgState.morphTarget = target;
    sgState.isLerping = true;

    physics.reset();
    if (window.refreshUI) window.refreshUI();
  }

  function resetGimbals() {
    sgState.gimbalTime = 0;
    sgState.gimbalOuterOffset = 0;
    sgState.gimbalOuterVel = 0;
    sgState.gimbalMiddleOffset = 0;
    sgState.gimbalMiddleVel = 0;
    sgState.gimbalOuterNudge1 = 0;
    sgState.gimbalOuterNudge2 = 0;
    sgState.gimbalOuterNudge3 = 0;
    sgState.gimbalMiddleNudge1 = 0;
    sgState.gimbalMiddleNudge2 = 0;
    sgState.gimbalMiddleNudge3 = 0;
  }

  // Local factory reset function (avoids circular dependency with animation.js)
  function localFactoryReset() {
    resetGimbals();
    Object.assign(sgState.physics, DEFAULT_PHYSICS);
    physics.syncParams(sgState.physics, true);
    sgState.posA = Math.floor(sgState.physics.N * 0.75);
    sgState.posB = Math.floor(sgState.physics.N * 0.25);
    var target =
      (sgState.physics.topo === "circ" || sgState.physics.topo === "ellipse")
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
      if (document.getElementById("sel-trim"))
        document.getElementById("sel-trim").value = sgState.exportTrim || "none";
      var trimContainer = document.getElementById("trim-selection-container");
      if (trimContainer) {
        if (sgState.exportFormat === "webm") {
          trimContainer.style.display = "flex";
        } else {
          trimContainer.style.display = "none";
        }
      }
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
  safeClick("btn-play", function () {
    if (sgState.isLerping) return;
    sgState.paused = !sgState.paused;
    var l = sgState.paused ? "▶ Run" : "⏸ Pause";
    var i = sgState.paused ? "▶" : "⏸";
    var bp = document.getElementById("btn-play");
    var bsp = document.getElementById("btn-side-play");
    if (bp) bp.textContent = l;
    if (bsp) bsp.textContent = i;
  });
  safeClick("btn-side-play", function () {
    if (sgState.isLerping) return;
    sgState.paused = !sgState.paused;
    var l = sgState.paused ? "▶ Run" : "⏸ Pause";
    var i = sgState.paused ? "▶" : "⏸";
    var bp = document.getElementById("btn-play");
    var bsp = document.getElementById("btn-side-play");
    if (bp) bp.textContent = l;
    if (bsp) bsp.textContent = i;
  });

  // Fire Impulse
  safeClick("btn-fire", function () {
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
    var bp = document.getElementById("btn-play");
    var bsp = document.getElementById("btn-side-play");
    if (bp) bp.textContent = l;
    if (bsp) bsp.textContent = sgState.paused ? "▶" : "⏸";
  });

  // Reset / Step / Snapshot
  safeClick("btn-reset", function () {
    physics.reset();
    resetGimbals();
    sgState.paused = true;
    var bp = document.getElementById("btn-play");
    var bsp = document.getElementById("btn-side-play");
    if (bp) bp.textContent = "▶ Run";
    if (bsp) bsp.textContent = "▶";
    if (window.refreshUI) window.refreshUI();
  });
  safeClick("btn-rapid-reset", function () {
    physics.reset();
    resetGimbals();
    sgState.paused = true;
    var bp = document.getElementById("btn-play");
    var bsp = document.getElementById("btn-side-play");
    if (bp) bp.textContent = "▶ Run";
    if (bsp) bsp.textContent = "▶";
    if (window.refreshUI) window.refreshUI();
  });
  safeClick("btn-step", function () {
    physics.step(1);
    var sr = rendererRef.current;
    if (sr) {
      var fd = processFrame(
        sgState,
        physics.phi,
        physics.v,
        physics.acc,
        sr._glowPosAttr.array,
        sr._glowNegAttr.array,
        sr.maxAcc,
      );
      sr.render(fd, physics.phi);
    }
  });
  safeClick("btn-snapshot", function () {
    if (snapshotEngine) snapshotEngine.capture();
  });

  // Video Record / Assemble
  safeClick("btn-video", function () {
    if (sgState.exportAction === "assemble") {
      if (recorder && !recorder.isAssembling) {
        recorder.assembleFromStorage(sgState.exportPipeline);
      }
      return;
    }

    if (sgState.isRecording) {
      sgState.isRecording = false;
      sgState.paused = true;
      var bp = document.getElementById("btn-play");
      if (bp) bp.textContent = "▶ Run";
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

        if (navigator.storage && navigator.storage.estimate) {
          try {
            let est = await navigator.storage.estimate();
            let avail = Math.max(0, est.quota - est.usage);
            
            let width = 1280;
            let height = 720;
            const selRes = document.getElementById("sel-res");
            if (selRes && selRes.value) {
              const parts = selRes.value.split("x");
              if (parts.length === 2) {
                width = Number(parts[0]);
                height = Number(parts[1]);
              }
            }
            
            const pipeline = sgState.exportPipeline || "ffmpeg";
            const format = sgState.exportFormat || "webm";
            const selCrf = document.getElementById("sel-crf");
            const crf = selCrf ? Number(selCrf.value) : (sgState.exportCRF || 18);
            limit = DiscSpaceEstimator.estimateMaxFrames(pipeline, avail, width, height, fps, format, crf, isConstrained);
          } catch (estErr) {
            console.error("Failed to estimate storage for limit:", estErr);
            limit = isConstrained ? 30 * fps : 60 * fps;
          }
        } else {
          limit = isConstrained ? 1800 : 3600;
        }

        recorder.setFrameLimit(limit);
        recorder.start();
        var bv = document.getElementById("btn-video");
        if (bv) {
          bv.textContent = "⏹ Stop";
          bv.classList.add("btn-warn");
        }
      })();
    }
  });

  // Impulse Visibility
  safeClick("btn-impulse-master", function () {
    sgState.impulseVisible = !sgState.impulseVisible;
  });

  // Collapse/Expand Widgets
  safeClick("btn-collapse-launch", function () {
    var p = document.getElementById("launch-panel");
    if (!p) return;
    var c = p.querySelector(".widget-content");
    var b = document.getElementById("btn-collapse-launch");
    var miniFire = document.getElementById("btn-mini-fire");
    if (c) {
      if (c.style.display === "none") {
        c.style.display = "";
        if (b) {
          b.textContent = "▲";
          b.title = "Collapse Panel";
        }
        p.classList.remove("widget-collapsed");
        if (miniFire) miniFire.style.display = "none";
      } else {
        c.style.display = "none";
        if (b) {
          b.textContent = "▼";
          b.title = "Expand Panel";
        }
        p.classList.add("widget-collapsed");
        if (miniFire) miniFire.style.display = "inline-block";
      }
    }
  });
  safeClick("btn-collapse-bottom", function () {
    var p = document.getElementById("bottom-bar");
    if (!p) return;
    var c = p.querySelector(".bottom-bar-inner .widget-content");
    var b = document.getElementById("btn-collapse-bottom");
    var sep = p.querySelector(".bottom-bar-inner > .w-px");
    var thumbs = document.getElementById("physics-thumb-container");
    var miniActions = document.getElementById("mini-bottom-actions");
    if (c) {
      if (c.style.display === "none") {
        c.style.display = "";
        if (sep) sep.style.display = "";
        if (thumbs) thumbs.style.display = "";
        if (miniActions) miniActions.style.display = "none";
        if (b) {
          b.textContent = "▲";
          b.title = "Collapse Panel";
        }
        var inner = p.querySelector(".bottom-bar-inner");
        if (inner) inner.classList.remove("widget-collapsed");
      } else {
        c.style.display = "none";
        if (sep) sep.style.display = "none";
        if (thumbs) thumbs.style.display = "none";
        if (miniActions) miniActions.style.display = "flex";
        if (b) {
          b.textContent = "▼";
          b.title = "Expand Panel";
        }
        var inner = p.querySelector(".bottom-bar-inner");
        if (inner) inner.classList.add("widget-collapsed");
      }
    }
  });

  // Bind Miniature Helper Actions
  const miniFire = document.getElementById("btn-mini-fire");
  if (miniFire) {
    miniFire.onclick = function () {
      const parentFire = document.getElementById("btn-fire");
      if (parentFire) parentFire.click();
    };
  }
  const miniPlay = document.getElementById("btn-mini-play");
  if (miniPlay) {
    miniPlay.onclick = function () {
      const parentPlay = document.getElementById("btn-play");
      if (parentPlay) parentPlay.click();
    };
  }
  const miniReset = document.getElementById("btn-mini-reset");
  if (miniReset) {
    miniReset.onclick = function () {
      const parentReset = document.getElementById("btn-reset");
      if (parentReset) parentReset.click();
    };
  }

  // Linear Wrap
  safeClick("btn-linear-wrap", function () {
    sgState.physics.linearWrap = !sgState.physics.linearWrap;
    var b = document.getElementById("btn-linear-wrap");
    if (b) {
      if (sgState.physics.linearWrap) b.classList.add("active");
      else b.classList.remove("active");
    }
  });

  // Gimbal-Ring Mode (Nested Gimbal Rotation Mode)
  safeClick("btn-gimbal-ring", function () {
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
  });

  // Laser Screen Surround Toggle
  safeClick("btn-laser-screen", function () {
    sgState.laserScreenActive = !sgState.laserScreenActive;
    if (window.refreshUI) window.refreshUI();
  });

  // Nudge Gimbal Buttons click bindings
  safeClick("btn-nudge-outer-l", function () {
    sgState.gimbalOuterNudge1 += 0.15;
  });
  safeClick("btn-nudge-outer-r", function () {
    sgState.gimbalOuterNudge1 -= 0.15;
  });
  safeClick("btn-nudge-mid-f", function () {
    sgState.gimbalMiddleNudge1 += 0.15;
  });
  safeClick("btn-nudge-mid-b", function () {
    sgState.gimbalMiddleNudge1 -= 0.15;
  });

  // Factory Reset
  safeClick("btn-factory-reset", function () {
    if (confirm("Hard reset all parameters?")) {
      localFactoryReset();
    }
  });

  // Channel A/B on/off toggles
  safeClick("btn-a-on", function () {
    sgState.onA = !sgState.onA;
    applyChannelStyles("a");
  });
  safeClick("btn-b-on", function () {
    sgState.onB = !sgState.onB;
    applyChannelStyles("b");
  });

  // Palette buttons (skip other channel's color)
  safeClick("btn-a-palette", function () {
    var next = (sgState.colA + 1) % PALETTE.length;
    if (next === sgState.colB) next = (next + 1) % PALETTE.length;
    sgState.colA = next;
    applyChannelStyles("a");
  });
  safeClick("btn-b-palette", function () {
    var next = (sgState.colB + 1) % PALETTE.length;
    if (next === sgState.colA) next = (next + 1) % PALETTE.length;
    sgState.colB = next;
    applyChannelStyles("b");
  });

  // Processing overlay close button
  var btnClose = document.getElementById("btn-close-processing");
  if (btnClose) {
    btnClose.onclick = function (e) {
      if (e) e.stopPropagation();
      console.log("[Assembly Engine] Hiding overlay via onclick close button");
      var overlay = document.getElementById("processing-overlay");
      if (overlay) overlay.style.display = "none";
    };
    btnClose.addEventListener("click", function (e) {
      if (e) e.stopPropagation();
      console.log("[Assembly Engine] Hiding overlay via addEventListener close button");
      var overlay = document.getElementById("processing-overlay");
      if (overlay) overlay.style.display = "none";
    });
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

  var btnRunTests = document.getElementById("btn-run-tests");
  if (btnRunTests) {
    btnRunTests.onclick = async function () {
      try {
        console.log("[Test Suite] Dynamically importing laboratory-tester.js...");
        const { runLaboratoryDiagnostics } = await import("./laboratory-tester.js");
        runLaboratoryDiagnostics();
      } catch (err) {
        console.error("[Test Suite] Failed to load laboratory-tester.js dynamic module:", err);
      }
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
  safeChange("sel-topology", function () {
    localChangeTopology(this.value);
  });

  // Lemniscate Form Dropdown
  safeChange("sel-lemniscate-form", function () {
    sgState.lemniscateForm = this.value;
  });

  // Ellipse sliders
  var elSliderX = document.getElementById("slider-ellipse-x");
  if (elSliderX) {
    elSliderX.oninput = function() {
      sgState.ellipseX = parseFloat(this.value);
      var display = document.getElementById("val-ellipse-x");
      if (display) display.textContent = sgState.ellipseX.toFixed(3);
      if (window.refreshUI) window.refreshUI();
    };
  }
  var elSliderZ = document.getElementById("slider-ellipse-z");
  if (elSliderZ) {
    elSliderZ.oninput = function() {
      sgState.ellipseZ = parseFloat(this.value);
      var display = document.getElementById("val-ellipse-z");
      if (display) display.textContent = sgState.ellipseZ.toFixed(3);
      if (window.refreshUI) window.refreshUI();
    };
  }
  var elSliderTwist = document.getElementById("slider-ellipse-twist");
  if (elSliderTwist) {
    elSliderTwist.oninput = function() {
      sgState.ellipseTwist = parseFloat(this.value);
      var display = document.getElementById("val-ellipse-twist");
      if (display) display.textContent = sgState.ellipseTwist.toFixed(3);
      if (window.refreshUI) window.refreshUI();
    };
  }

  // Spacing density slider
  var spacingSlider = document.getElementById("slider-spacing-density");
  if (spacingSlider) {
    spacingSlider.oninput = function() {
      sgState.spacing = parseFloat(this.value);
      var display = document.getElementById("val-spacing-density");
      if (display) display.textContent = sgState.spacing.toFixed(2);
      if (window.refreshUI) window.refreshUI();
    };
  }

  // Other Dropdowns
  safeChange("sel-orientation", function () {
    sgState.orientationTarget = this.value;
  });
  safeChange("sel-format", function () {
    sgState.exportFormat = this.value;
    updateDiskSpaceUI();
    if (window.refreshUI) window.refreshUI();
  });
  var selTrimObj = document.getElementById("sel-trim");
  if (selTrimObj) {
    selTrimObj.onchange = function () {
      sgState.exportTrim = this.value;
      updateDiskSpaceUI();
      if (window.refreshUI) window.refreshUI();
    };
  }
  var selL = document.getElementById("sel-limit");
  if (selL)
    selL.onchange = function () {
      sgState.exportLimit = this.value;
    };
  var selC = document.getElementById("sel-crf");
  if (selC)
    selC.onchange = function () {
      sgState.exportCRF = parseInt(this.value);
      updateDiskSpaceUI();
    };
  var selPipeline = document.getElementById("sel-pipeline");
  var selAction = document.getElementById("sel-action");
  var btnVideo = document.getElementById("btn-video");

  if (selPipeline && selAction && btnVideo) {
    selPipeline.onchange = function () {
      sgState.exportPipeline = this.value;
      if (window.refreshUI) window.refreshUI();
      updateDiskSpaceUI();
    };

    selAction.onchange = function () {
      sgState.exportAction = this.value;
      if (window.refreshUI) window.refreshUI();
      updateDiskSpaceUI();
    };
  }

  // Resolution dropdown: update disk limit and remaining capacity on change
  var selRes = document.getElementById("sel-res");
  if (selRes) {
    selRes.onchange = function () {
      updateDiskSpaceUI();
      
      const pbPrev = document.getElementById("assembly-preview");
      if (pbPrev && this.value) {
        const parts = this.value.split("x");
        if (parts.length === 2) {
          const w = parseInt(parts[0], 10);
          const h = parseInt(parts[1], 10);
          if (w && h) {
            sgState.exportWidth = w;
            sgState.exportHeight = h;
            pbPrev.style.aspectRatio = `${w}/${h}`;
          }
        }
      }
    };
  }

  safeChange("sel-fps", function () {
    sgState.exportFPS = Number(this.value);
    updateDiskSpaceUI();
  });

  // Theory
  safeClick("btn-theory", function (e) {
    if (e) e.stopPropagation();
    var o = document.getElementById("theory-overlay");
    if (o) o.style.display = "block";
  });
  var btnCloseTheory = document.getElementById("btn-close-theory");
  if (btnCloseTheory) {
    btnCloseTheory.onclick = function (e) {
      if (e) e.stopPropagation();
      console.log("[Theory Panel] Hiding theory overlay via onclick close button");
      var overlay = document.getElementById("theory-overlay");
      if (overlay) overlay.style.display = "none";
    };
    btnCloseTheory.addEventListener("click", function (e) {
      if (e) e.stopPropagation();
      console.log("[Theory Panel] Hiding theory overlay via addEventListener close button");
      var overlay = document.getElementById("theory-overlay");
      if (overlay) overlay.style.display = "none";
    });
  }

  // Diagnostics
  safeClick("btn-diagnostics", async function () {
    try {
      const { getDiagnosticsManager } = await import("./diagnostics.js");
      getDiagnosticsManager().show();
    } catch (err) {
      console.error("[Diagnostics Loader] Failed to load diagnostics module:", err);
    }
  });



  // Mode & Direction
  ["kink", "anti", "breath", "wind"].forEach(function (m) {
    safeClick("btn-a-mode-" + m, function () {
      sgState.modeA = m;
      ["kink", "anti", "breath", "wind"].forEach(function (x) {
        var el = document.getElementById("btn-a-mode-" + x);
        if (el) el.classList.remove("active");
      });
      var btn = document.getElementById("btn-a-mode-" + m);
      if (btn) btn.classList.add("active");
    });
    safeClick("btn-b-mode-" + m, function () {
      sgState.modeB = m;
      ["kink", "anti", "breath", "wind"].forEach(function (x) {
        var el = document.getElementById("btn-b-mode-" + x);
        if (el) el.classList.remove("active");
      });
      var btn = document.getElementById("btn-b-mode-" + m);
      if (btn) btn.classList.add("active");
    });
  });
  safeClick("btn-a-dir-cw", function () {
    sgState.dirA = "cw";
    var cw = document.getElementById("btn-a-dir-cw");
    var ccw = document.getElementById("btn-a-dir-ccw");
    if (cw) cw.classList.add("active");
    if (ccw) ccw.classList.remove("active");
  });
  safeClick("btn-a-dir-ccw", function () {
    sgState.dirA = "ccw";
    var cw = document.getElementById("btn-a-dir-cw");
    var ccw = document.getElementById("btn-a-dir-ccw");
    if (ccw) ccw.classList.add("active");
    if (cw) cw.classList.remove("active");
  });
  safeClick("btn-b-dir-cw", function () {
    sgState.dirB = "cw";
    var cw = document.getElementById("btn-b-dir-cw");
    var ccw = document.getElementById("btn-b-dir-ccw");
    if (cw) cw.classList.add("active");
    if (ccw) ccw.classList.remove("active");
  });
  safeClick("btn-b-dir-ccw", function () {
    sgState.dirB = "ccw";
    var cw = document.getElementById("btn-b-dir-cw");
    var ccw = document.getElementById("btn-b-dir-ccw");
    if (ccw) ccw.classList.add("active");
    if (cw) cw.classList.remove("active");
  });

  // Perform initial disk space estimation
  updateDiskSpaceUI();

  // Unload Warning
  window.onbeforeunload = function (e) {
    if (recorder.isRecording || recorder.isAssembling) {
      var m =
        "A recording or assembly is currently in progress. Leaving this page will discard all captured frames.";
      e.returnValue = m;
      return m;
    }
  };

  // Initialize Mutation Observer to split and align the Assembly text blobs
  initAssemblyStatusObserver();
}

/**
 * Dynamically queries browser storage capacity via storage estimate API, 
 * computes actual frame budget size based on active dimensions & FPS variables,
 * and updates live readout UI counters in place of the old Max Duration selector.
 */
export async function updateDiskSpaceUI() {
  const diskLimitVal = document.getElementById("disk-limit-val");
  const diskFreeVal = document.getElementById("disk-free-val");
  if (!diskLimitVal || !diskFreeVal) return;

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const avail = Math.max(0, est.quota - est.usage); // Free bytes inside sandbox

      // Resolve current dimensions and FPS
      let width = 1280;
      let height = 720;
      const selRes = document.getElementById("sel-res");
      if (selRes && selRes.value) {
        const parts = selRes.value.split("x");
        if (parts.length === 2) {
          width = Number(parts[0]);
          height = Number(parts[1]);
        }
      }

      const selFps = document.getElementById("sel-fps");
      const fps = selFps ? Number(selFps.value) : (sgState.exportFPS || 60);

      const pipeline = sgState.exportPipeline || "ffmpeg";
      const format = sgState.exportFormat || "webm";
      const selCrf = document.getElementById("sel-crf");
      const crf = selCrf ? Number(selCrf.value) : (sgState.exportCRF || 18);

      if (pipeline === "local") {
        diskFreeVal.textContent = "Host Disk";
        diskLimitVal.textContent = "Unlimited Max";
        const diskContainer = document.getElementById("disk-space-container") || diskFreeVal.parentElement;
        if (diskContainer) {
          diskContainer.title = "Direct Host Directory Access: Frames are written directly to your actual physical local drive in real-time, completely bypassing browser sandbox space restrictions!";
          diskContainer.style.cursor = "help";
        }
        return;
      }

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia("(any-pointer: coarse)").matches;
      const memory = navigator.deviceMemory || (isMobile ? 2 : 8);
      const isConstrained = isMobile || memory <= 4;

      // Estimate max frames using our brand new estimator class, passing in crf!
      const limit = DiscSpaceEstimator.estimateMaxFrames(pipeline, avail, width, height, fps, format, crf, isConstrained);
      const durationSec = limit / fps;

      // Estimate PNG size for disk capacity rendering
      const sizePerFrame = DiscSpaceEstimator.estimatePngFrameSize(width, height);

      // Free space formatted in max recording time + available GB
      const totalCapacitySec = Math.floor(avail / sizePerFrame) / fps;
      const freeGB = avail / (1024 * 1024 * 1024);
      let freeCapacityText = "";
      if (totalCapacitySec >= 3600) {
        const hrs = Math.floor(totalCapacitySec / 3600);
        const mins = Math.floor((totalCapacitySec % 3600) / 60);
        freeCapacityText = mins > 0 ? `~${hrs}h ${mins}m (${freeGB.toFixed(1)} GB)` : `~${hrs}h (${freeGB.toFixed(1)} GB)`;
      } else if (totalCapacitySec >= 60) {
        const mins = Math.floor(totalCapacitySec / 60);
        const secs = Math.floor(totalCapacitySec % 60);
        freeCapacityText = secs > 0 ? `~${mins}m (${freeGB.toFixed(1)} GB)` : `~${mins}m (${freeGB.toFixed(1)} GB)`;
      } else {
        freeCapacityText = `~${Math.round(totalCapacitySec)}s (${(avail / (1024 * 1024)).toFixed(0)} MB)`;
      }
      diskFreeVal.textContent = freeCapacityText;

      // Dynamic Iframe / Sandbox helper tooltip to explain constraints
      const diskContainer = document.getElementById("disk-space-container") || diskFreeVal.parentElement;
      if (diskContainer) {
        if (freeGB < 5.0) {
          diskContainer.title = `Browser sandbox restricts origin storage to ${freeGB.toFixed(2)} GB inside this frame.\nTo unlock full disk space, launch the app in a New Tab.`;
          diskContainer.style.cursor = "help";
        } else {
          diskContainer.title = `Local Origin Sandbox Space: ${freeGB.toFixed(1)} GB available.`;
          diskContainer.style.cursor = "default";
        }
      }

      if (durationSec >= 60) {
        const mins = Math.floor(durationSec / 60);
        const secs = Math.floor(durationSec % 60);
        diskLimitVal.textContent = secs > 0 ? `~${mins}m ${secs}s Max` : `~${mins}m Max`;
      } else {
        diskLimitVal.textContent = `~${Math.round(durationSec)}s Max`;
      }
    } else {
      diskFreeVal.textContent = "Quota N/A";
      diskLimitVal.textContent = "Unlimited Limit";
    }
  } catch (err) {
    console.error("Failed to estimate storage quota:", err);
    diskFreeVal.textContent = "Quota Err";
    diskLimitVal.textContent = "Nominal (30s)";
  }
}

// Wire helper up to global scope to allow external triggers to refresh readouts
window.updateDiskSpaceUI = updateDiskSpaceUI;

/**
 * MutationObserver to automatically keep the top-level Left (Details) and Right (Diagnostics)
 * informational blobs completely synchronized with writes to the legacy hidden `#assembly-status` element.
 * This guarantees consistent layout presentation without vertical shift or resizing.
 */
export function initAssemblyStatusObserver() {
  const target = document.getElementById("assembly-status");
  const leftCol = document.getElementById("assembly-status-left");
  const rightCol = document.getElementById("assembly-status-right");
  if (!target || !leftCol || !rightCol) return;

  const observer = new MutationObserver(() => {
    const html = target.innerHTML;

    // Synchronize subheader information bar
    const infoSpan = document.getElementById("assembly-subheader-info");
    const isZip = html.includes("stills-to-zip") || sgState.exportAction === "zip";
    let operation = "Idle";

    if (html && html !== "Ready" && html.trim() !== "") {
      if (isZip) {
        operation = "ZIP Packaging";
      } else {
        const phaseMatch = html.match(/Phase:\s*([^<]+)/i) || html.match(/<strong>Phase:<\/strong>\s*([^<]+)/i);
        const modeMatch = html.match(/Mode:\s*([^<]+)/i) || html.match(/<strong>Mode:<\/strong>\s*([^<]+)/i);
        if (phaseMatch) {
          operation = phaseMatch[1].trim();
        } else if (modeMatch) {
          operation = modeMatch[1].trim();
        } else {
          operation = "Processing";
        }
      }
    }

    if (infoSpan) {
      infoSpan.textContent = `Operation: ${operation} | Res: ${sgState.exportWidth}x${sgState.exportHeight}`;
    }

    // Read running frame count from the running process and sync to the bottom
    if (html && html !== "Ready" && html.trim() !== "") {
      const cleanText = html.replace(/<[^>]+>/g, " ");
      const framesMatch = cleanText.match(/Frames?\s*:\s*([0-9]+\s*(?:\/|of)\s*[0-9]+)/i);
      if (framesMatch) {
        const val = framesMatch[1].trim();
        if (val && val !== "0/0" && val !== "0 / 0" && val !== "0") {
          const bottomFramesEl = document.getElementById("assembly-bottom-frames");
          if (bottomFramesEl) {
            bottomFramesEl.textContent = `${val} frames`;
          }
        }
      }
      const bottomPhaseEl = document.getElementById("assembly-bottom-phase");
      if (bottomPhaseEl && operation && operation !== "Idle") {
        bottomPhaseEl.textContent = operation;
      }
    }

    // Parse details for Left Column (Assembly Details) - Always exactly 5 unified rows
    let version = "v1.7.0-hybrid-ts";
    let mode = "Idle";
    let phase = "Ready for stream compilation";
    let frames = "0 / 0";
    let metrics = "N/A";

    if (html && html.trim() !== "" && html !== "Ready") {
      const versionMatch = html.match(/(?:Version|Project Version):\s*([^<]+)/i) || html.match(/<strong>Project Version:<\/strong>\s*([^<]+)/i);
      if (versionMatch) {
        version = versionMatch[1].trim();
      }

      if (isZip) {
        mode = "Stills ZIP Packaging";
      } else {
        const modeMatch = html.match(/Mode:\s*([^<]+)/i) || html.match(/<strong>Mode:<\/strong>\s*([^<]+)/i);
        if (modeMatch) {
          mode = modeMatch[1].trim();
          if (mode === "video-render") mode = "Video Transcode";
        } else {
          mode = "Video Transcode";
        }
      }

      const phaseMatch = html.match(/Phase:\s*([^<]+)/i) || html.match(/<strong>Phase:<\/strong>\s*([^<]+)/i);
      if (phaseMatch) {
        phase = phaseMatch[1].trim();
      } else if (html.includes("Loading FFmpeg")) {
        phase = "Loading FFmpeg";
      } else {
        phase = "Processing";
      }

      const framesMatch = html.match(/Frames:\s*([^<]+)/i) || html.match(/Frames?\s*:\s*([0-9]+\s*(?:\/|of)\s*[0-9]+)/i);
      if (framesMatch) {
        frames = framesMatch[1].trim();
      } else {
        const bottomFramesEl = document.getElementById("assembly-bottom-frames");
        if (bottomFramesEl && bottomFramesEl.textContent && bottomFramesEl.textContent !== "0 / 0 frames" && bottomFramesEl.textContent !== "0 / 0") {
          frames = bottomFramesEl.textContent.replace(" frames", "");
        } else if (isZip) {
          const pbPercent = document.getElementById("assembly-percent");
          if (pbPercent && pbPercent.textContent && pbPercent.textContent !== "0%") {
            frames = `In progress (${pbPercent.textContent})`;
          }
        }
      }

      let elapsedVal = "";
      let remainingVal = "";
      let outputSizeVal = "";

      const elapsedMatch = html.match(/Elapsed:\s*([^<]+)/i);
      if (elapsedMatch) elapsedVal = elapsedMatch[1].trim();

      const remainingMatch = html.match(/Remaining:\s*([^<]+)/i);
      if (remainingMatch) remainingVal = remainingMatch[1].trim();

      const outputMatch = html.match(/Output:\s*([^<]+)/i);
      if (outputMatch) outputSizeVal = outputMatch[1].trim();

      if (outputSizeVal) {
        metrics = "Output Size: " + outputSizeVal;
      } else if (elapsedVal || remainingVal) {
        metrics = "Elapsed: " + (elapsedVal || "0s") + (remainingVal ? " | Rem: ~" + remainingVal.replace("~", "") : "");
      } else {
        metrics = "Pending...";
      }
    }

    leftCol.innerHTML = `
      <span class="text-[#00ffcc] uppercase tracking-widest text-[8px] font-bold block mb-1">Assembly Details</span>
      <div class="py-0.5 border-b border-white/[0.02]"><strong>Active Phase:</strong> <span class="text-amber-300 font-bold font-mono text-[9px]">${phase}</span></div>
      <div class="py-0.5 border-b border-white/[0.02]"><strong>Progress:</strong> <span class="text-[#00ffcc] font-bold font-mono text-[9px]">${frames} frames</span></div>
      <div class="py-0.5 last:border-b-0"><strong>Live Metrics:</strong> <span class="text-[#00aaff] font-bold font-mono text-[9px]">${metrics}</span> &nbsp;<span class="text-white/30 font-normal">(${version})</span></div>
    `;

    // Parse Diagnostics for Right Column (Diagnostic Report) - Always exactly 3 unified rows
    if (isZip) {
      rightCol.innerHTML = `
        <span class="text-[#00ffcc] uppercase tracking-widest text-[8px] font-bold block mb-1">Diagnostic Report</span>
        <div class="flex justify-between items-center py-0.5 border-b border-white/[0.03]"><span class="text-white/40">Compression:</span><span class="text-white font-medium">ZIP Deflate (Fast)</span></div>
        <div class="flex justify-between items-center py-0.5 border-b border-white/[0.03]"><span class="text-white/40">Resolution:</span><span class="text-[#00ffcc] font-medium font-mono">${sgState.exportWidth}x${sgState.exportHeight}</span></div>
        <div class="flex justify-between items-center py-0.5"><span class="text-white/40">Target File:</span><span class="text-emerald-400 font-medium font-mono">sg_render_*.zip</span></div>
      `;
    } else {
      const formatLabel = sgState.exportFormat === "mp4" ? "MP4 (H.264)" : "WebM (VP8)";
      const coopCoepSatisfied = typeof SharedArrayBuffer !== "undefined";
      const threadingLabel = (sgState.exportFormat === "mp4" && coopCoepSatisfied) ? "Multi-Threaded (MT)" : "Single-Threaded (ST)";
      const crfLabel = sgState.exportCRF === 0 ? "0 (Lossless)" : sgState.exportCRF === 5 ? "5 (Ultra Quality)" : sgState.exportCRF === 12 ? "12 (High Quality)" : sgState.exportCRF === 18 ? "18 (Typical Default)" : `${sgState.exportCRF}`;

      rightCol.innerHTML = `
        <span class="text-[#00ffcc] uppercase tracking-widest text-[8px] font-bold block mb-1">Diagnostic Report</span>
        <div class="flex justify-between items-center py-0.5 border-b border-white/[0.03]"><span class="text-white/40">Format / Core:</span><span class="text-white font-medium">${formatLabel} (${threadingLabel})</span></div>
        <div class="flex justify-between items-center py-0.5 border-b border-white/[0.03]"><span class="text-white/40">Resolution:</span><span class="text-[#00ffcc] font-medium font-mono">${sgState.exportWidth}x${sgState.exportHeight} @ ${sgState.exportFPS} FPS</span></div>
        <div class="flex justify-between items-center py-0.5"><span class="text-white/40">Quality / CRF:</span><span class="text-amber-400 font-bold font-mono">${crfLabel}</span></div>
      `;
    }
  });

  observer.observe(target, { childList: true, subtree: true, characterData: true });
}

