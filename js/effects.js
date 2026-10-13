import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.max = 120;
    const pos = new Float32Array(this.max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo = geo;
    this.material = new THREE.PointsMaterial({ color: 0xffcf8f, size: 0.05, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.sparks = [];
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe4a8, transparent: true, opacity: 0.7, depthWrite: false });
  }

  sparkAt(x, y, z, n = 8, color = 0xffcf8f) {
    for (let i = 0; i < n; this.sparks.length >= this.max ? i += 1 : i++) {
      if (this.sparks.length >= this.max) break;
      this.sparks.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 3.5,
        vy: Math.random() * 2.8 + 0.5,
        vz: (Math.random() - 0.5) * 3.5,
        life: 0.5 + Math.random() * 0.3, t: 0,
      });
    }
    this.material.color.setHex(color);
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const geo = new THREE.BoxGeometry(0.012, 0.012, len);
    const m = new THREE.Mesh(geo, this.tracerMat.clone());
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ mesh: m, t: 0, max: 0.07 });
  }

  update(dt) {
    const pos = this.geo.attributes.position.array;
    let w = 0;
    for (const s of this.sparks) {
      s.t += dt;
      if (s.t >= s.life) continue;
      s.vy -= 9.8 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.y < 0.01) { s.y = 0.01; s.vy *= -0.3; }
      pos[w * 3] = s.x; pos[w * 3 + 1] = s.y; pos[w * 3 + 2] = s.z;
      w++;
    }
    this.sparks = this.sparks.filter(s => s.t < s.life);
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;

    for (const tr of this.tracers) {
      tr.t += dt;
      tr.mesh.material.opacity = 0.7 * (1 - tr.t / tr.max);
      if (tr.t >= tr.max) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mesh.material.dispose();
      }
    }
    this.tracers = this.tracers.filter(t => t.t < t.max);
  }
}
