import * as THREE from '../vendor/three/three.module.js';
import { sgState } from './state.js';

export default class Gimbal {
  constructor(scene) {
    this.scene = scene;
    
    // Parent container for the gimbal system
    // Posited at the centers of the ring in world coordinates (Y = 1.5)
    this.container = new THREE.Group();
    this.container.position.set(0, 1.5, 0);
    this.scene.add(this.container);

    // Outer group (Y-rotation)
    this.outerGroup = new THREE.Group();
    this.container.add(this.outerGroup);

    // Middle group (X-rotation)
    this.middleGroup = new THREE.Group();
    this.outerGroup.add(this.middleGroup);

    // Inner group (Z-rotation)
    this.innerGroup = new THREE.Group();
    this.middleGroup.add(this.innerGroup);

    // High-contrast, shiny 3D materials with metallic sheen and highlights
    this.outerMat = new THREE.MeshStandardMaterial({
      color: 0x2e3f5f, // Steel Blue / Titanium hue
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x050e1a,
      emissiveIntensity: 0.8
    });

    this.middleMat = new THREE.MeshStandardMaterial({
      color: 0x5a2e2e, // Rust Red / Copper hue
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x180505,
      emissiveIntensity: 0.8
    });

    this.pivotMat = new THREE.MeshStandardMaterial({
      color: 0xe0b0ff, // Glowing Orchid pivot accents
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x3d0c3d,
      emissiveIntensity: 1.0
    });

    this.outerMesh = null;
    this.middleMesh = null;
    this.pins = [];
  }

  build(rr) {
    this.clear();
    this.rr = rr;

    // Responsive 3D thicknesses based on ring size
    const tubeThickOuter = Math.max(0.18, rr * 0.009);

    // 1. Outer Torus (Renders clearly in 3D)
    this.outerMesh = new THREE.Mesh(
      new THREE.TorusGeometry(rr * 1.15, tubeThickOuter, 16, 128),
      this.outerMat
    );
    this.outerMesh.rotateX(Math.PI / 2);
    this.outerGroup.add(this.outerMesh);

    // Cylindrical pins connecting outer ring to space/stand (along X-axis)
    const hostPinGeom = new THREE.CylinderGeometry(tubeThickOuter * 1.2, tubeThickOuter * 1.2, rr * 0.08, 16);
    hostPinGeom.rotateZ(Math.PI / 2);
    
    const pinL = new THREE.Mesh(hostPinGeom, this.pivotMat);
    pinL.position.set(-rr * 1.19, 0, 0);
    pinL.userData = { initialX: -rr * 1.19 };
    this.outerGroup.add(pinL);
    this.pins.push(pinL);

    const pinR = new THREE.Mesh(hostPinGeom, this.pivotMat);
    pinR.position.set(rr * 1.19, 0, 0);
    pinR.userData = { initialX: rr * 1.19 };
    this.outerGroup.add(pinR);
    this.pins.push(pinR);

    // Pins connecting outer ring directly to the combined inner ring/mount (along Z-axis)
    const midPinGeom = new THREE.CylinderGeometry(tubeThickOuter * 1.0, tubeThickOuter * 1.0, rr * 0.08, 16);
    midPinGeom.rotateX(Math.PI / 2);
    
    const pinF = new THREE.Mesh(midPinGeom, this.pivotMat);
    pinF.position.set(0, 0, -rr * 1.075);
    pinF.userData = { initialZ: -rr * 1.075 };
    this.middleGroup.add(pinF);
    this.pins.push(pinF);

    const pinB = new THREE.Mesh(midPinGeom, this.pivotMat);
    pinB.position.set(0, 0, rr * 1.075);
    pinB.userData = { initialZ: rr * 1.075 };
    this.middleGroup.add(pinB);
    this.pins.push(pinB);
  }

  update(gimbalRingActive, morph) {
    const visible = !!gimbalRingActive;
    this.container.visible = visible;

    if (visible) {
      // Calculate dynamic scale factor so support matches innermost gimbal circle
      // at morph = 0 (linear mode) and torus at morph = 1 (circular mode)
      const spacing = sgState.spacing !== undefined ? sgState.spacing : 0.8;
      const tw = (this.rr * Math.PI * 2) - spacing; // tw = (N - 1) * spacing
      const R_linear = (tw + 4.0) / 2.0;
      const R_circular = this.rr;

      const m = Math.max(0, Math.min(1, morph));
      const target_r = R_linear + (R_circular - R_linear) * m;
      const scale = target_r / R_circular;

      // Keep container/groups at scale 1.0 so nested modelGroup is NOT scaled,
      // but scale the individual gimbal meshes and pins to match target_r smoothly.
      if (this.outerMesh) {
        this.outerMesh.scale.set(scale, scale, scale);
      }
      this.pins.forEach(p => {
        p.scale.set(scale, scale, scale);
        if (p.userData && p.userData.initialX !== undefined) {
          p.position.x = p.userData.initialX * scale;
        }
        if (p.userData && p.userData.initialZ !== undefined) {
          p.position.z = p.userData.initialZ * scale;
        }
      });

      // Freeze alternative visual motion drive when paused. All updates happen via physics.step() on unpause.
      this._lastPerfTime = undefined;

      // Elegant, nested astronomical-gimbal physical behavior on Y (outer) and X (middle) axes
      this.outerGroup.rotation.set(0, sgState.gimbalOuterOffset, 0);
      this.middleGroup.rotation.set(sgState.gimbalMiddleOffset, 0, 0);
    } else {
      if (this.outerMesh) this.outerMesh.scale.set(1, 1, 1);
      this.pins.forEach(p => {
        p.scale.set(1, 1, 1);
        if (p.userData && p.userData.initialX !== undefined) p.position.x = p.userData.initialX;
        if (p.userData && p.userData.initialZ !== undefined) p.position.z = p.userData.initialZ;
      });
      this.outerGroup.rotation.set(0, 0, 0);
      this.middleGroup.rotation.set(0, 0, 0);
      this._lastPerfTime = undefined;
    }
  }

  getInnerGroup() {
    return this.middleGroup;
  }

  clear() {
    if (this.outerMesh) {
      this.outerMesh.geometry.dispose();
      this.outerGroup.remove(this.outerMesh);
      this.outerMesh = null;
    }
    this.pins.forEach(pin => {
      pin.geometry.dispose();
      if (pin.parent) {
        pin.parent.remove(pin);
      }
    });
    this.pins = [];
  }

  dispose() {
    this.clear();
    this.outerMat.dispose();
    this.middleMat.dispose();
    this.pivotMat.dispose();
    if (this.container.parent) {
      this.container.parent.remove(this.container);
    }
  }
}
