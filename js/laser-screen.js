// =============================================================================
// sine-gordon-lab — js/laser-screen.js
// Modular translucent cylinder screen with phosphor memory effect (laser trace)
// COMPLETELY SELF-CONTAINED - only imports Three.js
// =============================================================================

import * as THREE from '../vendor/three/three.module.js';

const TAU = 2 * Math.PI;

function hsvToRgb(h, s, v) {
  let r, g, b;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = t; break;
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

export default class LaserScreen {
  constructor(scene, N, spacing) {
    this.scene = scene;
    this.N = N;
    this.spacing = spacing;
    this.mesh = null;
    this.radius = 3.22; // Exactly matches the outer tip of the pendulum bobs

    // Create a dynamic drawing canvas for laser trails
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048; // Width is circumference angle (U mapping)
    this.canvas.height = 1024; // Height is length along X component (V mapping)
    this.ctx = this.canvas.getContext('2d');
    
    // Fill initially with completely transparent black
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Create canvas texture mapping
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;     // Circumference wraps seamlessly
    this.texture.wrapT = THREE.ClampToEdgeWrapping; // End coordinates clamped
    this.texture.minFilter = THREE.LinearFilter;   // Pure linear filtering for maximum crispness
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;                   // Prevent blurriness when viewing at oblique angles
    this.texture.generateMipmaps = false;          // No expensive/blurry mipmap generation on dynamic canvas

    // Translucent glass screen material with additive blending for glowing neon trace
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevent depth issues when rendering inside/outside
      blending: THREE.AdditiveBlending
    });

    this.buildGeometry();
  }

  buildGeometry() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    const tw = (this.N - 1) * this.spacing;
    const length = tw + 1.2; // Extend slightly past bobs
    const radius = this.radius; // Exactly matches the outer tip of the pendulum bobs (3.22)

    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded)
    // Create plenty of heightSegments to allow clean, localized radial bulging matching color/amplitude mapping
    const geom = new THREE.CylinderGeometry(radius, radius, length, 64, 64, true);
    
    // Rotate 90 degrees around Z axis such that the cylinder axis aligns with X-axis (the support tube)
    geom.rotateZ(Math.PI / 2);

    // Cache the original pristine vertex positions for high-performance frame updates
    this.origPositions = geom.attributes.position.array.slice();

    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.position.set(0, 1.5, 0); // Position matching the pivot bar's center
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  resize(newN, spacing) {
    this.N = newN;
    this.spacing = spacing;
    this.buildGeometry();
  }

  _calculatePhysicsBasis(i, frameData, N, m) {
    let prev_idx, next_idx;
    if (m < 0.01) {
      prev_idx = Math.max(0, i - 1);
      next_idx = Math.min(N - 1, i + 1);
    } else {
      prev_idx = (i - 1 + N) % N;
      next_idx = (i + 1) % N;
    }
    const p_prev = frameData.positions[prev_idx];
    const p_next = frameData.positions[next_idx];
    
    const u = new THREE.Vector3(p_next.x - p_prev.x, p_next.y - p_prev.y, p_next.z - p_prev.z);
    if (u.lengthSq() > 1e-8) {
      u.normalize();
    } else {
      u.set(1, 0, 0);
    }
    
    const g_vec = new THREE.Vector3(0, -1, 0);
    const u_dot_g = u.dot(g_vec);
    const v_unnorm = new THREE.Vector3().copy(g_vec).addScaledVector(u, -u_dot_g);
    const v = new THREE.Vector3();
    if (v_unnorm.lengthSq() > 1e-8) {
      v.copy(v_unnorm).normalize();
    } else {
      v.set(0, -1, 0);
    }
    
    const w = new THREE.Vector3().crossVectors(u, v);
    return { u, v, w };
  }

  // =========================================================================
  // update() - PASSIVE DERIVATION WITH ZERO SIDE-CHANNEL OR CAUSAL FEEDBACK
  // This method only reads phiValues and frameData, treating them as completely
  // immutable. Absolutely no mutations or modifications are ever applied to 
  // the physical state arrays of the Sine-Gordon engine.
  // =========================================================================
  update(sgState, phiValues, frameData) {
    const active = sgState.laserScreenActive;
    const targetOpacity = active ? 0.75 : 0.0;

    // Smooth ease transition for screen transparency
    this.material.opacity += (targetOpacity - this.material.opacity) * 0.15;
    
    if (this.mesh) {
      this.mesh.visible = this.material.opacity > 0.005;
    }

    // Capture trail drawing
    if (this.mesh && this.mesh.visible) {
      const tw = (this.N - 1) * this.spacing;
      const length = tw + 1.2;

      if (this.origPositions) {
        // Deform cylinder geometry representation to scale outward where active wave/glowing colors exist
        const posAttr = this.mesh.geometry.attributes.position;
        const arr = posAttr.array;
        const orig = this.origPositions;
        const count = posAttr.count;

        const radiusMin = this.radius;              // Exactly matches the outer tip of the pendulum bobs (3.22)
        const radiusMax = this.radius * 2.2;        // Outer dynamic bulge maximum limit proportional to color/velocity

        const m = frameData.morph !== undefined ? frameData.morph : 0;
        const N = Math.min(this.N, phiValues.length, frameData.positions.length);

        // Precompute pivots and bases for the N physical points to optimize update speed
        const pivots = [];
        const bases = [];
        for (let i = 0; i < N; i++) {
          pivots.push(frameData.positions[i]);
          bases.push(this._calculatePhysicsBasis(i, frameData, N, m));
        }

        for (let j = 0; j < count; j++) {
          const idx = j * 3;
          const ox = orig[idx];
          const oy = orig[idx + 1];
          const oz = orig[idx + 2];

          // Compute normalized longitudinal position pct [0, 1]
          const pct = (ox + length / 2) / length;
          const clampedPct = Math.max(0, Math.min(1, pct));
          const idxFloat = clampedPct * (N - 1);

          // Linear interpolation of the glow intensity at the fractional index
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(N - 1, Math.ceil(idxFloat));
          const t = idxFloat - i0;

          const g0 = Math.max(frameData.glowPos[i0] || 0, frameData.glowNeg[i0] || 0);
          const g1 = Math.max(frameData.glowPos[i1] || 0, frameData.glowNeg[i1] || 0);
          const interpolatedGlow = g0 * (1 - t) + g1 * t;
          const iVal = Math.pow(Math.min(1.0, interpolatedGlow), 1.2);

          // Re-scale cross-sectional Y and Z based on our dynamic radius mapping
          const r_orig = Math.sqrt(oy * oy + oz * oz);
          const r_new = radiusMin + (radiusMax - radiusMin) * iVal;
          const scale = r_orig > 0.0001 ? (r_new / r_orig) : 1.0;

          const oy_scaled = oy * scale;
          const oz_scaled = oz * scale;

          // Interpolate the precomputed pivot and basis vectors
          const p_i0 = pivots[i0];
          const p_i1 = pivots[i1];
          const piv_x = p_i0.x * (1 - t) + p_i1.x * t;
          const piv_y = p_i0.y * (1 - t) + p_i1.y * t;
          const piv_z = p_i0.z * (1 - t) + p_i1.z * t;

          const v_val0 = bases[i0].v;
          const v_val1 = bases[i1].v;
          const vx = v_val0.x * (1 - t) + v_val1.x * t;
          const vy = v_val0.y * (1 - t) + v_val1.y * t;
          const vz = v_val0.z * (1 - t) + v_val1.z * t;

          const w_val0 = bases[i0].w;
          const w_val1 = bases[i1].w;
          const wx = w_val0.x * (1 - t) + w_val1.x * t;
          const wy = w_val0.y * (1 - t) + w_val1.y * t;
          const wz = w_val0.z * (1 - t) + w_val1.z * t;

          // Set final morphed vertex position. Subtract 1.5 because mesh.position.y is 1.5
          arr[idx] = piv_x + oy_scaled * vx + oz_scaled * wx;
          arr[idx + 1] = piv_y + oy_scaled * vy + oz_scaled * wy - 1.5; 
          arr[idx + 2] = piv_z + oy_scaled * vz + oz_scaled * wz;
        }
        posAttr.needsUpdate = true;
      }

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      // Calculate the physical conversion metric (3D units per canvas pixel)
      const cellU = (Math.PI * 2 * 3.5) / w; // 3D units along circumference
      const cellV = length / h;             // 3D units along longitudinal length

      // Phosphor memory decay using destination-out composite mode
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.048)';
      ctx.fillRect(0, 0, w, h);

      // Return to standard over composition for active drawing
      ctx.globalCompositeOperation = 'source-over';

      const N = Math.min(this.N, phiValues.length, frameData.positions.length);

      const twistVal = frameData.ellipseTwist !== undefined ? frameData.ellipseTwist : 0.0;
      const isEllipse = (sgState.physics.topo === "ellipse");

      for (let i = 0; i < N; i++) {
        const twistAngle = isEllipse ? (i / N) * twistVal * TAU * Math.min(1.0, frameData.morph) : 0.0;
        const phi = phiValues[i] + twistAngle;
        
        // Map directional angle phi (unit circle rotation in v-w plane) directly to texture U
        const theta = Math.atan2(Math.cos(phi), Math.sin(phi));
        const u = (((theta / TAU) % 1) + 1) % 1;

        // V maps along length of the cylinder (height parameter)
        // Mirror the mapping index to align physical indices from left-to-right correctly
        const v = (N - 1 - i) / (N - 1);

        const canvasX = u * w;
        // In canvas coordinate space (0,0) is top-left. So (1 - v) flips height properly.
        const canvasY = (1 - v) * h;

        const gPos = frameData.glowPos[i] || 0;
        const gNeg = frameData.glowNeg[i] || 0;
        const vGlow = Math.max(gPos, gNeg);
        const sPos = Math.pow(Math.min(1.0, gPos), 1.2);
        const sNeg = Math.pow(Math.min(1.0, gNeg), 1.2);
        const iVal = Math.pow(Math.min(1.0, vGlow), 1.2);

        // Make low-intensity/low-value tic-marks completely invisible
        if (iVal < 0.05) {
          continue;
        }

        // Core physics palette mapping (matches bobs, with Solar/Fire vs Deep Space/Neon Violet)
        let hue = 0.55;
        if (sPos > 0.0 || sNeg > 0.0) {
          if (sPos >= sNeg) {
            // Solar / Fire warm spectrum (positive torque direction)
            hue = 0.0 + sPos * 0.18;
          } else {
            // Deep Space / Neon Violet cool spectrum (negative torque direction)
            hue = 0.50 + sNeg * 0.33;
          }
        }
        hue = ((hue % 1) + 1) % 1;

        const sat = 0.8 + iVal * 0.2;
        const val = iVal;

        const rgb = hsvToRgb(hue, sat, val);
        const colorStr = `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;

        // Determine target spot size in physical 3D coordinate space dimensions (scaled down for smaller, finer dots)
        const targetR3DOuter = 0.05 + 0.07 * iVal;
        const targetR3DInner = 0.015 + 0.02 * iVal;

        // Convert the physical 3D size into pixel coordinates back on the 2K canvas
        const rxOuter = targetR3DOuter / cellU;
        const ryOuter = targetR3DOuter / cellV;
        const rxInner = targetR3DInner / cellU;
        const ryInner = targetR3DInner / cellV;

        const drawSpot = (cx, cy) => {
          // 1. Draw glowing outer color halo as horizontal ellipse
          ctx.fillStyle = colorStr;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rxOuter, ryOuter, 0, 0, TAU);
          ctx.fill();

          // 2. Draw sharp white high-intensity inner laser beam core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(cx, cy, rxInner, ryInner, 0, 0, TAU);
          ctx.fill();
        };

        // Draw laser spotlight (glow dot) on the phosphorescent screen
        drawSpot(canvasX, canvasY);

        // Stitch the left/right seam wrap perfectly to avoid half-dot cuts at boundary edges
        if (canvasX < rxOuter) {
          drawSpot(canvasX + w, canvasY);
        } else if (canvasX > w - rxOuter) {
          drawSpot(canvasX - w, canvasY);
        }
      }

      this.texture.needsUpdate = true;
    }
  }

  destroy() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.material.dispose();
    this.texture.dispose();
    if (this.canvas) {
      this.canvas.remove();
    }
  }
}
