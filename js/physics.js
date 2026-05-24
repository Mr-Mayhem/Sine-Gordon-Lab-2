// =============================================================================
// sine-gordon-lab — js/physics.js
// Discrete Sine-Gordon physics engine with adaptive injection
// COMPLETELY SELF-CONTAINED - no imports
// =============================================================================

const TAU = 2 * Math.PI;

class PhysicsEngine {
  constructor(p) {
    this.p = p;
    this.phi = new Float32Array(p.N);
    if (p.gravity < 0) {
      this.phi.fill(Math.PI);
    }
    this.v = new Float32Array(p.N);
    this.acc = new Float32Array(p.N);
    this.nv = new Float32Array(p.N);
    this.np = new Float32Array(p.N);
    this.lastGravity = p.gravity;
    this.tSim = 0;
    this.stateRef = null;
  }

  step(steps) {
    steps = steps || 1;
    var N = this.p.N, k = this.p.kappa, g = this.p.gravity;
    var gm = this.p.gamma, dt = this.p.dt, topo = this.p.topo;
    var phi = this.phi, v = this.v, nv = this.nv, np = this.np;
    var per = topo === "circ" || topo === "lemniscate" || (topo === "linear" && this.p.linearWrap);

    var gimbalActive = this.stateRef && this.stateRef.gimbalRingActive;
    var gimbalMode = (this.stateRef && this.stateRef.gimbalPhysicsMode) || "simplified";
    var morphVal = (this.stateRef && this.stateRef.morph) || 0;

    if (this.lastGravity === undefined) {
      this.lastGravity = g;
    }
    if ((this.lastGravity > 0 && g < 0) || (this.lastGravity < 0 && g > 0) || (this.lastGravity !== 0 && g === 0)) {
      for (var i = 0; i < N; i++) {
        phi[i] += (Math.random() - 0.5) * 0.04;
      }
    }
    this.lastGravity = g;

    for (var s = 0; s < steps; s++) {
      var t = 0;
      var hasGimbal = gimbalActive;
      if (hasGimbal) {
        if (this.tSim === undefined) this.tSim = 0;
        this.tSim += dt;
        t = this.tSim * 0.31;
        if (this.stateRef) {
          this.stateRef.gimbalTime = this.tSim;
          
          const steps_dt = dt / 0.01;
          
          // Outer gimbal cascaded S-curve nudge filter (gentle and smooth)
          this.stateRef.gimbalOuterNudge1 *= Math.pow(0.95, steps_dt);
          this.stateRef.gimbalOuterNudge2 += (this.stateRef.gimbalOuterNudge1 - this.stateRef.gimbalOuterNudge2) * (0.08 * steps_dt);
          this.stateRef.gimbalOuterNudge3 += (this.stateRef.gimbalOuterNudge2 - this.stateRef.gimbalOuterNudge3) * (0.08 * steps_dt);
          this.stateRef.gimbalOuterVel += this.stateRef.gimbalOuterNudge3 * steps_dt * 0.005;

          // Middle gimbal cascaded S-curve nudge filter (gentle and smooth)
          this.stateRef.gimbalMiddleNudge1 *= Math.pow(0.95, steps_dt);
          this.stateRef.gimbalMiddleNudge2 += (this.stateRef.gimbalMiddleNudge1 - this.stateRef.gimbalMiddleNudge2) * (0.08 * steps_dt);
          this.stateRef.gimbalMiddleNudge3 += (this.stateRef.gimbalMiddleNudge2 - this.stateRef.gimbalMiddleNudge3) * (0.08 * steps_dt);
          this.stateRef.gimbalMiddleVel += this.stateRef.gimbalMiddleNudge3 * steps_dt * 0.005;

          // Physical velocity decay and offset integration
          const damping_coeff = this.stateRef.gimbalDamping !== undefined ? this.stateRef.gimbalDamping : 0;
          const decay = Math.exp(-damping_coeff * steps_dt);
          this.stateRef.gimbalOuterVel *= decay;
          this.stateRef.gimbalMiddleVel *= decay;

          this.stateRef.gimbalOuterOffset += this.stateRef.gimbalOuterVel * steps_dt;
          this.stateRef.gimbalMiddleOffset += this.stateRef.gimbalMiddleVel * steps_dt;
        }
      }

      // Compute gimbal angular velocities and local gravity projections
      var G_x = 0, G_y = -g, G_z = 0;
      var O_x = 0, O_y = 0, O_z = 0;
      var dO_x = 0, dO_y = 0, dO_z = 0;

      if (hasGimbal) {
        var outerOffset = this.stateRef ? this.stateRef.gimbalOuterOffset : 0;
        var middleOffset = this.stateRef ? this.stateRef.gimbalMiddleOffset : 0;
        var outerVel = this.stateRef ? this.stateRef.gimbalOuterVel : 0;
        var middleVel = this.stateRef ? this.stateRef.gimbalMiddleVel : 0;

        // Precise dynamic angles of Y-axis rotation (psi) and X-axis tilt (theta)
        var psi = outerOffset;
        var theta = middleOffset;

        // Precise angular velocities (relative to simulation time dt)
        var dPsi = outerVel / 0.01;
        var dTheta = middleVel / 0.01;

        // Precise angular accelerations (relative to simulation time dt)
        var ddPsi = 0;
        var ddTheta = 0;

        // Projected gravity vector in local frame
        G_x = 0;
        G_y = -g * Math.cos(theta);
        G_z = g * Math.sin(theta);

        if (gimbalMode === "full") {
          O_x = dTheta;
          O_y = dPsi * Math.cos(theta);
          O_z = -dPsi * Math.sin(theta);

          dO_x = ddTheta;
          dO_y = ddPsi * Math.cos(theta) - dPsi * dTheta * Math.sin(theta);
          dO_z = -ddPsi * Math.sin(theta) - dPsi * dTheta * Math.cos(theta);
        } else {
          O_y = dPsi; // Simplified mode: steady Y-axis spin
        }
      }

      for (var i = 0; i < N; i++) {
        var im1 = i - 1, ip1 = i + 1, dR = 0, dL = 0, vR = 0, vL = 0;
        if (per) {
          if (im1 < 0) im1 = N - 1;
          if (ip1 >= N) ip1 = 0;
          dR = phi[ip1] - phi[i]; dR -= Math.round(dR / TAU) * TAU;
          dL = phi[i] - phi[im1]; dL -= Math.round(dL / TAU) * TAU;
          vR = v[ip1] - v[i]; vL = v[i] - v[im1];
        } else {
          if (ip1 < N) { dR = phi[ip1] - phi[i]; vR = v[ip1] - v[i]; }
          if (im1 >= 0) { dL = phi[i] - phi[im1]; vL = v[i] - v[im1]; }
        }

        // Base Sine-Gordon coupling + damping
        var f = k * (dR - dL) - gm * v[i] + 0.005 * (vR - vL);

        // Add correct physical gravity / inertial terms
        if (hasGimbal) {
          var th_i = (i / N) * TAU;
          var R_c = (N * 0.8) / TAU;
          var x_linear = -((N - 1) * 0.8) / 2.0 + i * 0.8;

          var gamma_i = (-th_i + 1.57079632679) * morphVal;
          var sin_g = Math.sin(gamma_i);
          var cos_g = Math.cos(gamma_i);

          var p_x = (1 - morphVal) * x_linear + morphVal * R_c * Math.cos(th_i);
          var p_z = morphVal * R_c * Math.sin(th_i);

          var R_axial = p_x * cos_g - p_z * sin_g;
          var R_trans = p_x * sin_g + p_z * cos_g;

          var O_x_prime = O_x * cos_g - O_z * sin_g;
          var O_y_prime = O_y;
          var O_z_prime = O_x * sin_g + O_z * cos_g;

          var dO_x_prime = dO_x * cos_g - dO_z * sin_g;
          var dO_y_prime = dO_y;
          var dO_z_prime = dO_x * sin_g + dO_z * cos_g;

          // Projected gravity torque term
          var gravityTerm = G_y * Math.sin(phi[i]) - (G_x * sin_g + G_z * cos_g) * Math.cos(phi[i]);
          f += gravityTerm;

          // Inertial terms
          var L = 3.0;

          if (gimbalMode === "full") {
            var u = R_trans - L * Math.sin(phi[i]);
            var omega_dot_r = u * O_z_prime - L * O_y_prime * Math.cos(phi[i]);
            var omega_dot_u = -Math.cos(phi[i]) * O_z_prime + O_y_prime * Math.sin(phi[i]);
            var omega_sq = O_x_prime * O_x_prime + O_y_prime * O_y_prime + O_z_prime * O_z_prime;
            
            var a_cent = omega_dot_r * omega_dot_u + omega_sq * R_trans * Math.cos(phi[i]);
            var a_Euler = (L - R_trans * Math.sin(phi[i])) * (-dO_x_prime);

            if (Math.abs(R_axial) > 1e-4) {
              var a_Euler_axial = -R_axial * (dO_y_prime * Math.cos(phi[i]) - dO_z_prime * Math.sin(phi[i]));
              var a_cent_axial = O_x_prime * R_axial * (O_y_prime * Math.sin(phi[i]) + O_z_prime * Math.cos(phi[i]));
              f += (a_cent + a_Euler + a_Euler_axial + a_cent_axial);
            } else {
              f += (a_cent + a_Euler);
            }
          } else {
            // Simplified mode: steady Y centrifugal outward drag
            var a_cent_simple = -O_y_prime * O_y_prime * Math.cos(phi[i]) * (R_trans - L * Math.sin(phi[i])) / L;
            f += a_cent_simple;
          }
        } else {
          // Standard gravity if gimbal is inactive
          f += -g * Math.sin(phi[i]);
        }

        this.acc[i] = f;
        nv[i] = v[i] + f * dt;
        np[i] = phi[i] + nv[i] * dt;
      }
      v.set(nv);
      phi.set(np);
    }
  }

  _stepWithDamping(steps, damping) {
    var savedGamma = this.p.gamma;
    this.p.gamma = damping;
    this.step(steps);
    this.p.gamma = savedGamma;
  }

  inject(pos, sh, amp, mode, vel) {
    var N = this.phi.length, phi = this.phi, v = this.v, p = this.p;
    var lf = 1 / Math.sqrt(Math.max(0.01, 1 - vel * vel / Math.max(0.1, p.kappa)));
    var w = Math.max(0.6, sh / lf);
    var wEff = Math.max(w, 1.5);
    var per = p.topo === "circ" || p.topo === "lemniscate" || (p.topo === "linear" && p.linearWrap);

    for (var i = 0; i < N; i++) {
      var dx = i - pos;
      if (per) dx = ((dx + N / 2) % N + N) % N - N / 2;
      var arg = dx / wEff;
      if (mode === "cw" || mode === "ccw") {
        phi[i] += amp * 4 * Math.atan(Math.exp(arg));
        v[i] += (mode === "cw" ? -vel : vel) * amp * (2 / wEff) / Math.cosh(arg);
      } else if (mode === "breather") {
        var a1 = (dx - 2) / wEff, a2 = (dx + 2) / wEff;
        phi[i] += amp * 4 * (Math.atan(Math.exp(a1)) - Math.atan(Math.exp(a2)));
      }
    }

    // Light pre-relaxation: 4 steps at γ=0.3 to settle the kink
    this._stepWithDamping(4, 0.3);
  }

  reset() {
    var initAngle = this.p.gravity < 0 ? Math.PI : 0;
    this.phi.fill(initAngle);
    this.v.fill(0);
  }

  wind(dir) {
    for (var i = 0; i < this.phi.length; i++) {
      this.phi[i] += dir * TAU * (i / this.phi.length);
    }
  }

  syncParams(p, force) {
    if (this.phi.length !== p.N || force) {
      var oN = this.phi.length, nN = p.N, oP = this.phi, oV = this.v;
      this.phi = new Float32Array(nN);
      this.v = new Float32Array(nN);
      this.acc = new Float32Array(nN);
      this.nv = new Float32Array(nN);
      this.np = new Float32Array(nN);
      if (oN > 0 && nN > 0) {
        for (var i = 0; i < nN; i++) {
          var si = (i / nN) * oN, sl = Math.floor(si);
          var sh = Math.min(sl + 1, oN - 1), f = si - sl;
          this.phi[i] = oP[sl] + (oP[sh] - oP[sl]) * f;
          this.v[i] = oV[sl] + (oV[sh] - oV[sl]) * f;
        }
      }
    }
    this.p = p;
  }
}

export default PhysicsEngine;
