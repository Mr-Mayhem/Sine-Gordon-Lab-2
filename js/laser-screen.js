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
        const rr = frameData.ringRadius !== undefined ? frameData.ringRadius : ((this.N * this.spacing) / (Math.PI * 2));
        const lemniscateForm = frameData.lemniscateForm || "gerono";

        for (let j = 0; j < count; j++) {
          const idx = j * 3;
          const ox = orig[idx];
          const oy = orig[idx + 1];
          const oz = orig[idx + 2];

          // Compute normalized longitudinal position pct [0, 1]
          const pct = (ox + length / 2) / length;
          const clampedPct = Math.max(0, Math.min(1, pct));
          const idxFloat = clampedPct * (this.N - 1);

          // Linear interpolation of the glow intensity at the fractional index
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(this.N - 1, Math.ceil(idxFloat));
          const t = idxFloat - i0;

          let interpolatedGlow = 0;
          if (frameData.velocities) {
            const v0 = Math.abs(frameData.velocities[i0] || 0);
            const v1 = Math.abs(frameData.velocities[i1] || 0);
            const interpolatedVel = v0 * (1 - t) + v1 * t;
            interpolatedGlow = Math.min(1.0, interpolatedVel / 5.5);
          } else {
            const g0 = Math.max(frameData.glowPos[i0] || 0, frameData.glowNeg[i0] || 0);
            const g1 = Math.max(frameData.glowPos[i1] || 0, frameData.glowNeg[i1] || 0);
            interpolatedGlow = g0 * (1 - t) + g1 * t;
          }
          const iVal = Math.pow(Math.min(1.0, interpolatedGlow), 1.2);

          // Re-scale cross-sectional Y and Z based on our dynamic radius mapping
          const r_orig = Math.sqrt(oy * oy + oz * oz);
          const r_new = radiusMin + (radiusMax - radiusMin) * iVal;
          const scale = r_orig > 0.0001 ? (r_new / r_orig) : 1.0;

          const oy_scaled = oy * scale;
          const oz_scaled = oz * scale;

          // Compute topological bent/morphed position
          const ang = clampedPct * Math.PI * 2;
          const p0 = new THREE.Vector3(ox, 1.5, 0);
          const p1 = new THREE.Vector3(rr * Math.cos(ang), 1.5, rr * Math.sin(ang));
          
          let p2;
          if (lemniscateForm === "bernoulli") {
            const d = 1 + Math.sin(ang) * Math.sin(ang);
            p2 = new THREE.Vector3(rr * 1.3 * Math.cos(ang) / d, 1.5, rr * 1.3 * Math.sin(ang) * Math.cos(ang) / d);
          } else {
            p2 = new THREE.Vector3(rr * 1.3 * Math.cos(ang), 1.5 + 3.5 * Math.sin(ang * 2), rr * 1.3 * Math.sin(ang) * Math.cos(ang));
          }
          
          const piv = m <= 1 ? p0.clone().lerp(p1, m) : p1.clone().lerp(p2, m - 1);

          // Compute rotation angle ry for the cross segment
          let ry = -ang + Math.PI / 2;
          if (m <= 1) {
            ry *= m;
          }

          // Transform local cross-section of the cylinder
          const rx = oz_scaled * Math.sin(ry);
          const ry_val = oy_scaled;
          const rz = oz_scaled * Math.cos(ry);

          // Set final vertex position (note original cylinder mesh position is set to (0, 1.5, 0))
          arr[idx] = piv.x + rx;
          arr[idx + 1] = piv.y + ry_val - 1.5; 
          arr[idx + 2] = piv.z + rz;
        }
        posAttr.needsUpdate = true;
      }

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      // Calculate the physical conversion metric (3D units per canvas pixel)
      const cellU = (Math.PI * 2 * 3.5) / w; // 3D units along circumference
      const cellV = length / h;             // 3D units along longitudinal length

      // Phosphor memory decay using destination-out composite mode.
      // An aggressive decay rate (e.g., 4.8%) ensures old wavefronts and tails fade away smoothly
      // while still briefly integrating active passes.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.048)';
      ctx.fillRect(0, 0, w, h);

      // Return to standard over composition for active drawing
      ctx.globalCompositeOperation = 'source-over';

      const N = Math.min(this.N, phiValues.length, frameData.positions.length);
      for (let i = 0; i < N; i++) {
        const phi = phiValues[i];
        
        // Map rotational angle to Circumference U coord [0, 2*PI] -> [0, 1]
        // Perfectly sync the laser projection with the physical pendulum pointing angle on the screen: theta = -phi - Math.PI / 2
        const theta = (((-phi - Math.PI / 2) % TAU) + TAU) % TAU;
        const u = theta / TAU;

        // V maps along length of the cylinder (height parameter)
        // Mirror the mapping index to align physical indices from left-to-right correctly
        const v = (N - 1 - i) / (N - 1);

        const canvasX = u * w;
        // In canvas coordinate space (0,0) is top-left. So (1 - v) flips height properly.
        const canvasY = (1 - v) * h;

         let iVal = 0;
         let sPos = 0;
         let sNeg = 0;

         if (frameData.velocities) {
           const vel = frameData.velocities[i] || 0;
           const absVel = Math.abs(vel);
           iVal = Math.pow(Math.min(1.0, absVel / 5.5), 1.2);
           sPos = vel > 0 ? iVal : 0;
           sNeg = vel < 0 ? iVal : 0;
         } else {
           const gPos = frameData.glowPos[i] || 0;
           const gNeg = frameData.glowNeg[i] || 0;
           const vGlow = Math.max(gPos, gNeg);
           sPos = Math.pow(Math.min(1.0, gPos), 1.2);
           sNeg = Math.pow(Math.min(1.0, gNeg), 1.2);
           iVal = Math.pow(Math.min(1.0, vGlow), 1.2);
         }

        // Make low-intensity/low-value tic-marks completely invisible
        if (iVal < 0.05) {
          continue;
        }

        // Core physics palette mapping (matches bobs)
        let hue = 0.55; // Core cyan
        const hueShift = (sPos - sNeg) * 0.65;
        hue += hueShift;
        hue = ((hue % 1) + 1) % 1;

        const sat = 0.8 + iVal * 0.2;
        const val = iVal; // Zero baseline brightness to keep low values fully invisible

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
