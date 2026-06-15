// =============================================================================
// sine-gordon-lab — js/scene-renderer.js
// Three.js 3D scene — pre-allocated for max N, resizable via instance count
// COMPLETELY SELF-CONTAINED - only imports three.js
// =============================================================================

import * as THREE from '../vendor/three/three.module.js';
import Gimbal from './gimbal.js';
import LaserScreen from './laser-screen.js';
import { sgState } from './state.js';

const PI = Math.PI;
const TAU = 2 * Math.PI;


export default class SceneRenderer {
  constructor(scene, maxN, initialMorph) {
    initialMorph = initialMorph || 0;
    this.scene = scene;
    this.maxN = maxN;
    this.N = maxN;

    // Instantiate Gimbal system using object separation of concerns
    this.gimbal = new Gimbal(scene);

    this.rodGeom = new THREE.CylinderGeometry(0.06, 0.06, 3).translate(0, -1.5, 0);
    this.bobGeom = new THREE.SphereGeometry(0.22, 32, 32);
    this.ghostGeom = new THREE.SphereGeometry(0.12, 8, 8);
    this.ticGeom = new THREE.CylinderGeometry(0.06, 0.06, 1, 8).translate(0, 0.5, 0);

    this.rodMat = this._createTechnoMaterial(0, false, initialMorph);

    this._phiAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1);
    this._glowPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1);
    this._glowNegAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1);
    this._indexAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxN), 1);
    for (var i = 0; i < maxN; i++) this._indexAttr.setX(i, i);

    this.maxAcc = { val: 0.1 };

    this._colorGhost = new THREE.Color();
    this._instanceMatrix = new THREE.Matrix4();
  }

  _createTechnoMaterial(color, isBob, initialMorph) {
    initialMorph = initialMorph || 0;
    var self = this;
    var mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.1,
      roughness: 0.1,
      emissive: isBob ? 0 : 0x010101,
      emissiveIntensity: 1
    });

    mat.onBeforeCompile = function(shader) {
      Object.assign(shader.uniforms, {
        uMorph: { value: initialMorph },
        uSp: { value: 0.8 },
        uRad: { value: 1 },
        uKWraps: { value: 2 },
        uRMinor: { value: 3.5 },
        uN: { value: self.N },
        uIsBob: { value: isBob ? 1 : 0 },
        uLemnForm: { value: 0 }
      });
      mat.userData.shader = shader;

      shader.vertexShader =
        "attribute float aIndex;\n" +
        "attribute float aPhi;\n" +
        "attribute float aGlowPos;\n" +
        "attribute float aGlowNeg;\n" +
        "uniform float uMorph, uSp, uRad, uKWraps, uRMinor, uN, uIsBob, uLemnForm;\n" +
        "varying float vGlow, vGlowPos, vGlowNeg;\n" +
        "vec3 getPivot(float idx, float N, float sp, float rad, float morph, float rMinor, float lemnForm) {\n" +
        "  float i_wrapped;\n" +
        "  if (morph < 0.01) {\n" +
        "    i_wrapped = clamp(idx, 0.0, N - 1.0);\n" +
        "  } else {\n" +
        "    i_wrapped = mod(idx + N, N);\n" +
        "  }\n" +
        "  float th = (i_wrapped / N) * 6.28318530718;\n" +
        "  float sx = -((N - 1.0) * sp) / 2.0;\n" +
        "  vec3 p0 = vec3(sx + i_wrapped * sp, 1.5, 0.0);\n" +
        "  vec3 p1 = vec3(rad * cos(th), 1.5, rad * sin(th));\n" +
        "  vec3 p2;\n" +
        "  if (lemnForm < 0.5) {\n" +
        "    p2 = vec3(rad * 1.3 * cos(th), 1.5 + rMinor * sin(th * 2.0), rad * 1.3 * sin(th) * cos(th));\n" +
        "  } else {\n" +
        "    float d = 1.0 + sin(th) * sin(th);\n" +
        "    p2 = vec3(rad * 1.3 * cos(th) / d, 1.5, rad * 1.3 * sin(th) * cos(th) / d);\n" +
        "  }\n" +
        "  return morph <= 1.0 ? mix(p0, p1, morph) : mix(p1, p2, morph - 1.0);\n" +
        "}\n" +
        shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "\n" +
        "vec3 piv = getPivot(aIndex, uN, uSp, uRad, uMorph, uRMinor, uLemnForm);\n" +
        "vec3 piv_prev = getPivot(aIndex - 1.0, uN, uSp, uRad, uMorph, uRMinor, uLemnForm);\n" +
        "vec3 piv_next = getPivot(aIndex + 1.0, uN, uSp, uRad, uMorph, uRMinor, uLemnForm);\n" +
        "vec3 u = normalize(piv_next - piv_prev);\n" +
        "vec3 g_vec = vec3(0.0, -1.0, 0.0);\n" +
        "vec3 v_unnorm = g_vec - dot(g_vec, u) * u;\n" +
        "vec3 v = normalize(v_unnorm);\n" +
        "vec3 w = cross(u, v);\n" +
        "vec3 pos = position;\n" +
        "if(uIsBob > 0.5) pos.y -= 3.0;\n" +
        "vec3 rotated_local;\n" +
        "rotated_local.x = pos.x;\n" +
        "rotated_local.y = pos.y * cos(aPhi) - pos.z * sin(aPhi);\n" +
        "rotated_local.z = pos.y * sin(aPhi) + pos.z * cos(aPhi);\n" +
        "vec3 transformed = piv + rotated_local.x * u - rotated_local.y * v - rotated_local.z * w;\n" +
        "vGlowPos = aGlowPos;\n" +
        "vGlowNeg = aGlowNeg;\n" +
        "vGlow = max(aGlowPos, aGlowNeg);\n"
      );

      shader.fragmentShader =
        "\nvarying float vGlow,vGlowPos,vGlowNeg;\nvec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }\n" +
        shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "\n#include <emissivemap_fragment>\nfloat i=pow(min(1.,vGlow),1.5),sPos=pow(min(1.,vGlowPos),1.5),sNeg=pow(min(1.,vGlowNeg),1.5); float hue=0.55; float hueShift=(sPos-sNeg)*0.65; hue+=hueShift; hue=mod(hue+1.,1.); float sat=0.8+i*0.2; float val=0.01+i*0.99; vec3 rb=hsv2rgb(vec3(hue,sat,val)); vec3 rest=vec3(0.005,0.02,0.005); totalEmissiveRadiance=rb*6.*i+rest; diffuseColor.rgb=mix(vec3(0.005,0.015,0.005),rb,i);\n"
      );
    };

    return mat;
  }

  resize(newN) {
    this.N = newN;
    this.rodInst.count = newN;
    this.bobInst.count = newN;
    [this.rodMat, this.bobInst.material].forEach(function(mat) {
      if (mat.userData.shader) {
        mat.userData.shader.uniforms.uN.value = newN;
      }
    });
    var spacing = 0.8;
    var rr = (newN * spacing) / TAU;
    var tw = (newN - 1) * spacing;
    if (this.ring) {
      this.ring.geometry.dispose();
      this.ring.geometry = new THREE.TorusGeometry(rr, 0.08, 16, 128);
    }
    if (this.support) {
      this.support.geometry.dispose();
      this.support.geometry = new THREE.CylinderGeometry(0.1, 0.1, tw + 4);
    }
    if (this.gimbal) {
      this.gimbal.build(rr);
    }
    if (this.laserScreen) {
      this.laserScreen.resize(newN, spacing);
    }
  }

  build(settings, spacing, morph) {
    spacing = spacing || 0.8;
    morph = morph || 0;
    var rr = (this.N * spacing) / TAU;
    var tw = (this.N - 1) * spacing;

    // Delegate gimbal construction to Gimbal system
    this.gimbal.build(rr);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this.laserScreen = new LaserScreen(this.modelGroup, this.N, spacing);

    this.support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, tw + 4),
      new THREE.MeshStandardMaterial({ color: 0x0A0A0A, metalness: 0.9 })
    );
    this.support.rotateZ(PI / 2);
    this.support.position.y = 1.5;
    this.modelGroup.add(this.support);

    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x0F0F0F,
      metalness: 0.9,
      roughness: 0.15
    });
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(rr, 0.08, 16, 128),
      this.ringMat
    );
    this.ring.rotateX(PI / 2);
    this.ring.position.y = 1.5;
    this.modelGroup.add(this.ring);

    this.rodInst = new THREE.InstancedMesh(this.rodGeom, this.rodMat, this.maxN);
    this.bobInst = new THREE.InstancedMesh(
      this.bobGeom,
      this._createTechnoMaterial(0x121212, true, morph),
      this.maxN
    );

    var self = this;
    [this.rodGeom, this.bobGeom].forEach(function(g) {
      g.setAttribute("aIndex", self._indexAttr);
      g.setAttribute("aPhi", self._phiAttr);
      g.setAttribute("aGlowPos", self._glowPosAttr);
      g.setAttribute("aGlowNeg", self._glowNegAttr);
    });
    this.modelGroup.add(this.rodInst, this.bobInst);

    this.ghostMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });

    this.ticMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      roughness: 0.2,
      metalness: 0.1
    });

    this.ghostInst = new THREE.InstancedMesh(this.ghostGeom, this.ghostMat, this.maxN);
    this.ghostInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ghostInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxN * 3), 3);
    this.ghostInst.count = 0;
    this.modelGroup.add(this.ghostInst);

    this.ticInst = new THREE.InstancedMesh(this.ticGeom, this.ticMat, this.maxN);
    this.ticInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ticInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxN * 3), 3);
    this.ticInst.count = 0;
    this.modelGroup.add(this.ticInst);

    this.counterA = this._createCounterSprite();
    this.counterB = this._createCounterSprite();
    this.modelGroup.add(this.counterA);
    this.modelGroup.add(this.counterB);

    this.rodInst.count = this.N;
    this.bobInst.count = this.N;
  }

  _createCounterSprite() {
    var canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var idxMap = { canvas: canvas, ctx: ctx, lastCount: null, lastColor: "" };
    
    var tex = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.0, 1.2, 1);
    sprite.renderOrder = 999;
    sprite.userData = idxMap;
    sprite.visible = false;
    return sprite;
  }

  _updateCounterSprite(sprite, count, colorHex, pos, ghostY, phiVal, m, posInArray, spacing, rr, orientationVal, N) {
    if (sprite.userData.lastCount !== count || sprite.userData.lastColor !== colorHex) {
      sprite.userData.lastCount = count;
      sprite.userData.lastColor = colorHex;
      var ctx = sprite.userData.ctx;
      var canvas = sprite.userData.canvas;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, 16);
      ctx.fill();
      ctx.fillStyle = colorHex;
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count.toString(), canvas.width / 2, canvas.height / 2 + 4);
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 4;
      ctx.stroke();
      sprite.material.map.needsUpdate = true;
    }
    
    var th = (posInArray / N) * 6.2831853;
    var rx = pos.x, ry = ghostY + 1.2, rz = pos.z;
    if (m > 1) {
      // already curved, just place
    } else {
      // morph between straight and ring
      var sx = -((N - 1) * spacing) / 2.0;
      var p0x = sx + posInArray * spacing, p0y = ghostY + 1.2, p0z = 0;
      // Wait, the pivot logic morphs locally!
      // In JS, frameData.positions already handles morph for basic mesh layout
      // Let's just use frameData.positions and add Y offset
      rx = pos.x; 
      ry = pos.y + ghostY - 1.5 + 1.2; // roughly
      rz = pos.z;
    }
    
    // since the shader does the morphing in GPU, frameData.positions.x/y/z is ALREADY Morphed on CPU?
    // Let's check frameData.positions in pipeline.js!
    // frameData.positions is morphed! yes. `y: m <= 1 ? 1.5 : lerp(1.5, ly, m - 1)`
    // So we just use pos.x, pos.y, pos.z, and add our hover offset.
    sprite.position.set(pos.x, ghostY + 1.2, pos.z);
    
    // We optionally want the counter to stand upright, but sprites do that by default.
  }

  _calculatePhysicsBasis(i, frameData, N, m) {
    var prev_idx, next_idx;
    if (m < 0.01) {
      prev_idx = Math.max(0, i - 1);
      next_idx = Math.min(N - 1, i + 1);
    } else {
      prev_idx = (i - 1 + N) % N;
      next_idx = (i + 1) % N;
    }
    var p_prev = frameData.positions[prev_idx];
    var p_next = frameData.positions[next_idx];
    
    var u = new THREE.Vector3(p_next.x - p_prev.x, p_next.y - p_prev.y, p_next.z - p_prev.z);
    if (u.lengthSq() > 1e-8) {
      u.normalize();
    } else {
      u.set(1, 0, 0);
    }
    
    var g_vec = new THREE.Vector3(0, -1, 0);
    var u_dot_g = u.dot(g_vec);
    var v_unnorm = new THREE.Vector3().copy(g_vec).addScaledVector(u, -u_dot_g);
    var v = new THREE.Vector3();
    if (v_unnorm.lengthSq() > 1e-8) {
      v.copy(v_unnorm).normalize();
    } else {
      v.set(0, -1, 0);
    }
    
    var w = new THREE.Vector3().crossVectors(u, v);
    return { u: u, v: v, w: w };
  }

  render(frameData, phiValues) {
    this.lastPositions = frameData.positions;
    this.lastPhi = phiValues;
    this.lastMorph = frameData.morph;
    
    var N = Math.min(this.N, phiValues.length, frameData.positions.length, frameData.glowPos.length);
    if (N === 0) return;
    var m = frameData.morph;

    if (this.support) {
      if (frameData.gimbalRingActive) {
        this.support.visible = m < 0.99;
        const tw = (frameData.ringRadius * Math.PI * 2) - 0.8;
        const R_linear = (tw + 4.0) / 2.0;
        const target_r = R_linear + (frameData.ringRadius - R_linear) * Math.max(0, Math.min(1, m));
        const thicknessScale = Math.max(0.001, 1 - m);
        const lengthScale = m <= 1 ? (target_r / R_linear) : 0.001;
        this.support.scale.set(thicknessScale, lengthScale, thicknessScale);
      } else {
        this.support.visible = m < 0.5;
        this.support.scale.set(Math.max(0.001, 1 - m), 1, Math.max(0.001, 1 - m));
      }
    }
    if (this.ring) {
      if (frameData.gimbalRingActive) {
        this.ring.visible = true;
        const tw = (frameData.ringRadius * Math.PI * 2) - 0.8;
        const R_linear = (tw + 4.0) / 2.0;
        const target_r = R_linear + (frameData.ringRadius - R_linear) * Math.max(0, Math.min(1, m));
        const ringScale = m <= 1 ? (target_r / frameData.ringRadius) : 1.0;
        this.ring.scale.set(ringScale, ringScale, ringScale);
        if (this.ringMat) {
          this.ringMat.color.setHex(0x9e2a2b);
          this.ringMat.emissive.setHex(0x230000);
          this.ringMat.emissiveIntensity = 1.0;
        }
      } else {
        this.ring.visible = m > 0.01 && m <= 1;
        this.ring.scale.set(m > 1 ? 1 : m, m > 1 ? 1 : m, m > 1 ? 1 : m);
        if (this.ringMat) {
          this.ringMat.color.setHex(0x0F0F0F);
          this.ringMat.emissive.setHex(0x000000);
          this.ringMat.emissiveIntensity = 0.0;
        }
      }
    }

    [this.rodMat, this.bobInst.material].forEach(function(mat) {
      if (mat.userData.shader) {
        var u = mat.userData.shader.uniforms;
        u.uMorph.value = m;
        u.uSp.value = frameData.spacing;
        u.uRad.value = frameData.ringRadius;
        u.uLemnForm.value = frameData.lemniscateForm === "bernoulli" ? 1 : 0;
      }
    });

    var gimbalRingActive = frameData.gimbalRingActive;
    var gVis = gimbalRingActive;

    // Use object separation of concerns to update Gimbal state
    this.gimbal.update(gimbalRingActive, m);

    // Dynamically manage modelGroup parenting so nested gimbals actually rotate the ring 
    // and pendulums cleanly in 3D about the center of rotation (Y = 1.5)
    if (gVis) {
      if (this.modelGroup.parent !== this.gimbal.getInnerGroup()) {
        this.gimbal.getInnerGroup().add(this.modelGroup);
        this.modelGroup.position.set(0, -1.5, 0); // Translate center of ring (1.5) to gimbal local origin (0)
      }
      this.modelGroup.rotation.set(0, 0, -frameData.orientationValue * PI / 2);
    } else {
      if (this.modelGroup.parent !== this.scene) {
        this.scene.add(this.modelGroup);
        this.modelGroup.position.set(0, 0, 0); // Restore original root position
      }
      this.modelGroup.rotation.set(0, 0, -frameData.orientationValue * PI / 2);
    }

    var ghostCount = 0;
    var ghostColorArr = this.ghostInst.instanceColor.array;

    var m = frameData.morph;

    if (frameData.ghostVisible) {
      for (var i = 0; i < N; i++) {
        this._phiAttr.setX(i, phiValues[i]);
        this._glowPosAttr.setX(i, frameData.glowPos[i]);
        this._glowNegAttr.setX(i, frameData.glowNeg[i]);

        var pos = frameData.positions[i];
        var phiVal = phiValues[i];
        var gY = frameData.ghostY[i];
        var gCol = frameData.ghostColor[i];

        var basis = this._calculatePhysicsBasis(i, frameData, N, m);
        var u = basis.u;
        var v = basis.v;
        var w = basis.w;

        var mRot = new THREE.Matrix4().set(
          u.x, -v.x, -w.x, 0,
          u.y, -v.y, -w.y, 0,
          u.z, -v.z, -w.z, 0,
          0,   0,   0,   1
        );
        var mLocal = new THREE.Matrix4().makeRotationX(phiVal);
        this._instanceMatrix.multiplyMatrices(mRot, mLocal);
        this._instanceMatrix.setPosition(pos.x, gY, pos.z);
        this.ghostInst.setMatrixAt(ghostCount, this._instanceMatrix);

        ghostColorArr[ghostCount * 3] = gCol.r;
        ghostColorArr[ghostCount * 3 + 1] = gCol.g;
        ghostColorArr[ghostCount * 3 + 2] = gCol.b;
        ghostCount++;
      }
    }

    this.ghostInst.count = ghostCount;
    if (ghostCount > 0) {
      this.ghostInst.instanceMatrix.needsUpdate = true;
      this.ghostInst.instanceColor.needsUpdate = true;
    }

    var ticCount = 0;
    var ticColorArr = this.ticInst.instanceColor.array;

    if (frameData.ticVisible) {
      for (var i = 0; i < N; i++) {
        if (frameData.ticActive[i] === 1) {
          var pos = frameData.positions[i];
          var phiVal = phiValues[i];
          var tCol = frameData.ticColor[i];

          var basis = this._calculatePhysicsBasis(i, frameData, N, m);
          var u = basis.u;
          var v = basis.v;
          var w = basis.w;

          var mRot = new THREE.Matrix4().set(
            u.x, -v.x, -w.x, 0,
            u.y, -v.y, -w.y, 0,
            u.z, -v.z, -w.z, 0,
            0,   0,   0,   1
          );
          var mLocal = new THREE.Matrix4().makeRotationX(phiVal);
          this._instanceMatrix.multiplyMatrices(mRot, mLocal);
          this._instanceMatrix.setPosition(pos.x, frameData.ghostY[i], pos.z);
          this.ticInst.setMatrixAt(ticCount, this._instanceMatrix);

          if (!this.ticInst.userData.indexMap) this.ticInst.userData.indexMap = [];
          this.ticInst.userData.indexMap[ticCount] = i;
          ticColorArr[ticCount * 3] = tCol.r;
          ticColorArr[ticCount * 3 + 1] = tCol.g;
          ticColorArr[ticCount * 3 + 2] = tCol.b;
          ticCount++;
        }
      }
    }

    this.ticInst.count = ticCount;
    if (ticCount > 0) {
      this.ticInst.instanceMatrix.needsUpdate = true;
      this.ticInst.instanceColor.needsUpdate = true;
    }

    this._phiAttr.needsUpdate = true;
    this._glowPosAttr.needsUpdate = true;
    this._glowNegAttr.needsUpdate = true;

    if (frameData.onA && frameData.posA >= 0 && frameData.posA < N && frameData.ticVisible) {
      var pA = Math.round(frameData.posA);
      this.counterA.visible = true;
      var countA = (phiValues[pA] / (2 * Math.PI)).toFixed(1);
      this._updateCounterSprite(this.counterA, countA, frameData.colorA, frameData.positions[pA], frameData.ghostY[pA], phiValues[pA], frameData.morph, pA, frameData.spacing, frameData.ringRadius, frameData.orientationValue, N);
    } else {
      this.counterA.visible = false;
    }

    if (frameData.onB && frameData.posB >= 0 && frameData.posB < N && frameData.ticVisible) {
      var pB = Math.round(frameData.posB);
      this.counterB.visible = true;
      var countB = (phiValues[pB] / (2 * Math.PI)).toFixed(1);
      this._updateCounterSprite(this.counterB, countB, frameData.colorB, frameData.positions[pB], frameData.ghostY[pB], phiValues[pB], frameData.morph, pB, frameData.spacing, frameData.ringRadius, frameData.orientationValue, N);
    } else {
      this.counterB.visible = false;
    }

    if (this.laserScreen) {
      this.laserScreen.update(sgState, phiValues, frameData);
    }
  }
}
