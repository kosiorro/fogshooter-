import * as THREE from 'three';
import { CFG } from './config.js';

export class Weapon {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.group = new THREE.Group();

    const dark = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.55, metalness: 0.45 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7, metalness: 0.05 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.4, metalness: 0.7 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.42), dark);
    receiver.position.set(0, 0, -0.1);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.5), steel);
    upper.position.set(0, 0.06, -0.22);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.36, 10), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.045, -0.62);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.06, 10), dark);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.045, -0.8);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), wood);
    handguard.position.set(0, 0.02, -0.44);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.24), wood);
    stock.position.set(0, -0.03, 0.2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.06), wood);
    grip.position.set(0, -0.1, 0.02);
    grip.rotation.x = 0.35;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.08), steel);
    mag.position.set(0, -0.13, -0.12);
    mag.rotation.x = -0.25;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.045, 0.02), dark);
    sight.position.set(0, 0.115, -0.45);
    const sightRing = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16), dark);
    sightRing.position.set(0, 0.125, -0.15);
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.004), dark);
    frontPost.position.set(0, 0.135, -0.45);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.3), dark);
    rail.position.set(0, 0.088, -0.3);

    this.group.add(receiver, upper, barrel, muzzleBrake, handguard, stock, grip, mag, sight, sightRing, frontPost, rail);

    this.flashSprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0 })
    );
    this.flashSprite.position.set(0, 0.045, -0.85);
    this.group.add(this.flashSprite);
    this._flashUntil = 0;

    this.hipPos = new THREE.Vector3(0.22, -0.22, -0.45);
    this.adsPos = new THREE.Vector3(0, -0.115, -0.32);
    this.group.position.copy(this.hipPos);
    camera.add(this.group);

    this.ammo = CFG.magSize;
    this.reloading = false;
    this.reloadEnd = 0;
    this.lastShot = 0;
    this.sway = 0;
    this.aiming = false;
  }

  setAiming(v) {
    this.aiming = v;
    this.camera.fov = v ? 50 : 72;
    this.camera.updateProjectionMatrix();
  }

  tryFire(now, cb) {
    if (this.reloading) return false;
    if (now - this.lastShot < CFG.fireInterval * (this.aiming ? 1.15 : 1)) return false;
    if (this.ammo <= 0) { this.reload(now); return false; }
    this.lastShot = now;
    this.ammo--;
    this._flashUntil = now + 45;
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
    this.flashSprite.material.opacity = now < this._flashUntil ? 0.95 : 0;
    this.sway += dt * (isMoving ? 7 : 1.6);
    const bob = isMoving && !this.aiming ? 1 : 0.25;
    const target = (this.aiming ? this.adsPos : this.hipPos).clone();
    target.x += Math.sin(this.sway) * 0.006 * bob;
    target.y += Math.abs(Math.cos(this.sway)) * 0.008 * bob + player.recoil * 0.04;
    target.z += player.recoil * (this.aiming ? 0.05 : 0.11);
    if (this.reloading) {
      target.y -= 0.2;
      target.z += 0.05;
    }
    this.group.position.lerp(target, Math.min(1, dt * 14));
  }
}
