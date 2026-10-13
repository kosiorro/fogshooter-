import * as THREE from 'three';
import { CFG } from './config.js';

export class Weapon {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.6, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x252b30, roughness: 0.7, metalness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.5), dark);
    body.position.set(0, -0.012, -0.12);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.34, 8), accent);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.008, -0.5);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.22), accent);
    stock.position.set(0, -0.045, 0.2);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.13, -0.02);
    mag.rotation.x = 0.18;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.1), dark);
    sight.position.set(0, 0.075, -0.15);
    this.group.add(body, barrel, stock, mag, sight);

    this.flash = new THREE.PointLight(0xffb35c, 0, 4);
    this.flash.position.set(0, 0.01, -0.68);
    this.group.add(this.flash);

    this.basePos = new THREE.Vector3(0.24, -0.21, -0.42);
    this.group.position.copy(this.basePos);
    camera.add(this.group);

    this.ammo = CFG.magSize;
    this.reloading = false;
    this.reloadEnd = 0;
    this.lastShot = 0;
    this.sway = 0;
  }

  tryFire(now, cb) {
    if (this.reloading) return false;
    if (now - this.lastShot < CFG.fireInterval) return false;
    if (this.ammo <= 0) { this.reload(now); return false; }
    this.lastShot = now;
    this.ammo--;
    this.flash.intensity = 6;
    cb();
    return true;
  }

  reload(now) {
    if (this.reloading || this.ammo === CFG.magSize) return;
    this.reloading = true;
    this.reloadEnd = now + CFG.reloadTime * 1000;
  }

  update(dt, now, player, isMoving, onReloaded) {
    if (this.reloading && now >= this.reloadEnd) {
      this.reloading = false;
      this.ammo = CFG.magSize;
      onReloaded();
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
    this.sway += dt * (isMoving ? 7 : 1.6);
    const bob = isMoving ? 1 : 0.25;
    const target = this.basePos.clone();
    target.x += Math.sin(this.sway) * 0.006 * bob;
    target.y += Math.abs(Math.cos(this.sway)) * 0.008 * bob + player.recoil * 0.04;
    target.z += player.recoil * 0.11;
    if (this.reloading) {
      const k = Math.sin((now / (CFG.reloadTime * 1000)) * Math.PI);
      target.y -= 0.18 * Math.abs(k);
      target.rotation = 0;
    }
    this.group.position.lerp(target, Math.min(1, dt * 14));
  }
}
