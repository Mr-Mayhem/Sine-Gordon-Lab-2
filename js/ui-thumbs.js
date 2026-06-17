// =============================================================================
// sine-gordon-lab — js/ui-thumbs.js
// UI thumb control factory — template generation + event binding
// Enlarged controls (2 font sizes up), precision fix for value skipping
// =============================================================================

import { sgState } from "./state.js";

var UI = {
  template: function(id, label, layout, valueId, withFine, withReset) {
    layout = layout || "h";
    var vid = valueId || "val-" + id;
    if (layout === "h-compact") {
      var labelHtmlCompact = '<span class="label-micro text-white/50 select-none uppercase" style="font-size: 8px; letter-spacing: 0.05em; margin-right: 2px;">' + label + '</span>';
      var controlHtmlCompact = '<div class="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded h-[28px] px-1">' +
        '<button id="btn-' + id + '-mm" class="w-[22px] h-5 flex items-center justify-center font-bold text-[10px] text-white/40 hover:text-white hover:bg-white/10 rounded transition-all select-none">−−</button>' +
        '<button id="btn-' + id + '-m" class="w-[16px] h-5 flex items-center justify-center font-bold text-[12px] text-white/60 hover:text-white hover:bg-white/10 rounded transition-all select-none">−</button>' +
        '<span id="' + vid + '" class="font-mono font-bold text-[10px] text-[var(--accent)] min-w-[30px] text-center select-none">--</span>' +
        '<button id="btn-' + id + '-p" class="w-[16px] h-5 flex items-center justify-center font-bold text-[12px] text-white/60 hover:text-white hover:bg-white/10 rounded transition-all select-none">+</button>' +
        '<button id="btn-' + id + '-pp" class="w-[22px] h-5 flex items-center justify-center font-bold text-[10px] text-white/40 hover:text-white hover:bg-white/10 rounded transition-all select-none">++</button>' +
        '</div>';
      return '<div class="flex items-center gap-1.5 ml-1">' + labelHtmlCompact + controlHtmlCompact + '</div>';
    }
    var fm = withFine ? '<button id="btn-' + id + '-mm" class="btn-thumb" style="font-size:13px;opacity:0.5">−−</button>' : "";
    var fp = withFine ? '<button id="btn-' + id + '-pp" class="btn-thumb" style="font-size:13px;opacity:0.5">++</button>' : "";
    var rb = withReset ? '<button id="btn-' + id + '-reset" class="btn-thumb-reset">↺</button>' : "";
    var labelHtml = '<span class="thumb-label">' + label + '</span>';
    var c = '<div class="thumb-controls">' + fm +
      '<button id="btn-' + id + '-m" class="btn-thumb">−</button>' +
      '<div class="thumb-value-box"><span class="text-[12px] opacity-20 mr-1">[</span>' +
      '<span id="' + vid + '" class="display-value display-value-sm">--</span>' +
      '<span class="text-[12px] opacity-20 ml-1">]</span></div>' +
      '<button id="btn-' + id + '-p" class="btn-thumb">+</button>' + fp + rb + '</div>';
    return layout === "v"
      ? '<div class="thumb-v">' + labelHtml + c + '</div>'
      : '<div class="thumb-row w-full px-1">' + labelHtml + c + '</div>';
  },

  setup: function(id, key, min, max, step, integer, refreshFn, coarseStep, resetFn) {
    coarseStep = coarseStep || 0;
    var bM = document.getElementById("btn-" + id + "-m");
    var bP = document.getElementById("btn-" + id + "-p");
    var bMM = document.getElementById("btn-" + id + "-mm");
    var bPP = document.getElementById("btn-" + id + "-pp");
    var bR = document.getElementById("btn-" + id + "-reset");

    // Per-thumb state for precision tracking
    var _accumulator = 0;
    var _lastApplyTime = 0;
    var _repeatTimer = null;

    var getObjAndProp = function() {
      var isN = key.includes(".");
      var obj = isN ? sgState.physics : sgState;
      var prop = isN ? key.split(".")[1] : key;
      return { obj: obj, prop: prop };
    };

    var applyDelta = function(delta) {
      if (sgState.isLerping) return;
      var op = getObjAndProp();
      var effectiveMax = (key === "posA" || key === "posB") ? sgState.physics.N : max;
      var nv = op.obj[op.prop] + delta;
      op.obj[op.prop] = Math.max(min, Math.min(effectiveMax, integer ? Math.round(nv) : nv));
      refreshFn();
    };

    var onDown = function(delta) {
      if (sgState.isLerping) return;
      _accumulator = 0;
      _lastApplyTime = performance.now();
      applyDelta(delta);
      // Start repeating after a short initial delay
      clearTimeout(_repeatTimer);
      _repeatTimer = setTimeout(function() {
        _repeat(delta);
      }, 200);
    };

    var _repeat = function(delta) {
      if (sgState.isLerping) { _repeatTimer = setTimeout(function() { _repeat(delta); }, 50); return; }
      var now = performance.now();
      var elapsed = now - _lastApplyTime;
      // Accumulate fractional steps based on time elapsed
      // At 50ms intervals with step size, this tracks partial progress
      var interval = 50; // ms between repeats
      var steps = elapsed / interval;
      _accumulator += steps * delta;

      // Apply whole accumulated steps
      if (Math.abs(_accumulator) >= Math.abs(delta) * 0.5) {
        var wholeSteps = Math.round(_accumulator / delta);
        if (wholeSteps !== 0) {
          applyDelta(wholeSteps * delta);
          _accumulator -= wholeSteps * delta;
        }
      }
      _lastApplyTime = now;
      _repeatTimer = setTimeout(function() { _repeat(delta); }, interval);
    };

    var onUp = function() {
      clearTimeout(_repeatTimer);
      _repeatTimer = null;
      // Apply any remaining accumulated value
      if (Math.abs(_accumulator) >= Math.abs(step) * 0.5) {
        var finalSteps = Math.round(_accumulator / step);
        if (finalSteps !== 0) {
          applyDelta(finalSteps * step);
        }
      }
      _accumulator = 0;
    };

    bM.onpointerdown = function(e) { e.preventDefault(); onDown(-step); };
    bP.onpointerdown = function(e) { e.preventDefault(); onDown(step); };
    bM.onpointerup = bM.onpointerleave = bP.onpointerup = bP.onpointerleave = onUp;
    bM.onpointercancel = bP.onpointercancel = onUp;

    if (bMM) {
      bMM.onpointerdown = function(e) { e.preventDefault(); onDown(-coarseStep); };
      bMM.onpointerup = bMM.onpointerleave = bMM.onpointercancel = onUp;
    }
    if (bPP) {
      bPP.onpointerdown = function(e) { e.preventDefault(); onDown(coarseStep); };
      bPP.onpointerup = bPP.onpointerleave = bPP.onpointercancel = onUp;
    }
    if (bR) {
      bR.onclick = function() {
        if (resetFn) { resetFn(); refreshFn(); }
      };
    }
  }
};

export default UI;
