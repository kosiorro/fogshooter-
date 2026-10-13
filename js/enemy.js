import * as THREE from 'three';
import { CFG } from './config.js';
import { circleHitsAny } from './collision.js';
import { rayHitsOBB } from './collision.js';

const geoBody = new THREE.CapsuleGeometry(0.3, 0.9, 4, 10);
const geoHead = new THREE.SphereGeometry(0.19, 12, 10);
const matBody = new THREE.MeshStandardMaterial({ color: 0x8e2f2f, roughness: 0.8, emissive: 0x2a0808 });
const matHead = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.6 });

export class Enemy {
  constructor(scene, x, z, id) {
    this.id = id;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(geoBody, matBody);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new THREE.Mesh(geoHead, matHead);
    head.position.y = 1.62;
    head.name = 'head';
    body.name = 'body';
    this.group.add(body, head);
    this.group.position.set(x, 0, z);
    this.head = head;
    this.body = body;
    this.hp = CFG.enemyHP;
    this.dead = false;
    this.deathTime = 0;
    this.nextFire = performance.now() + 2000 + Math.random() * 3000;
    this.repositionAt = 0;
    this.muzzle = new THREE.PointLight(0xffa644, 0, 6);
    this.muzzle.position.set(0, 1.3, 0.3);
    this.group.add(this.muzzle);
    scene.add(this.group);
  }

  hitbox() {
    const p = this.group.position;
    return { minX: p.x - 0.32, maxX: p.x + 0.32, minZ: p.z - 0.32, maxZ: p.z + 0.32, h: 1.8 };
  }

  takeDamage(dmg, isHead) {
    this.hp -= dmg * (isHead ? 2.2 : 1);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.deathTime = performance.now();
      this.group.rotation.z = Math.PI / 2 * (0.9 + Math.random() * 0.2);
      this.group.position.y = 0.28;
      return true;
    }
    return false;
  }

  update(dt, now, playerPos, obstacles, onShoot) {
    if (this.dead) {
      if (now - this.deathTime > 9000) this.group.visible = false;
      return;
    }
    const p = this.group.position;
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
    const dist = Math.hypot(dx, dz);
    this.group.rotation.y = Math.atan2(dx, dz);

    let mx = 0, mz = 0;
    if (dist > 6) {
      mx = (dx / dist) * CFG.enemySpeed * dt;
      mz = (dz / dist) * CFG.enemySpeed * dt;
    } else {
      const tang = Math.atan2(dz, dx) + (this.id % 2 ? 1 : -1) * Math.PI / 2;
      mx = Math.cos(tang) * CFG.enemySpeed * 0.6 * dt;
      mz = Math.sin(tang) * CFG.enemySpeed * 0.6 * dt;
    }
    const nx = p.x + mx, nz = p.z + mz;
    if (!circleHitsAny(nx, p.z, 0.4, obstacles)) p.x = nx;
    if (!circleHitsAny(p.x, nz, 0.4, obstacles)) p.z = nz;
    const d = Math.hypot(p.x, p.z);
    if (d > 3.3) { p.x = p.x / d * 3.3; p.z = p.z / d * 3.3; }

    if (this.muzzle.intensity > 0) this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 40);

    if (now > this.nextFire && dist < 45) {
      let visible = true;
      const ray = { x: (playerPos.x - p.x) / dist, z: (playerPos.z - p.z) / dist, y: 0 };
      const origin = { x: p.x, z: p.z, y: 1.4 };
      for (const b of obstacles) {
        const t = rayHitsOBB(origin, ray, b);
        if (t && t < dist) { visible = false; break; }
      }
      if (visible) {
        this.nextFire = now + CFG.enemyFireInterval * 1000 * (0.75 + Math.random() * 0.6);
        this.muzzle.intensity = 5;
        onShoot(this, playerPos, dist);
      } else {
        this.nextFire = now + 600;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
