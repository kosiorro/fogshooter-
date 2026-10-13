import * as THREE from 'three';
import { CFG } from './config.js';

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 1.7, 0);
    this.vel = new THREE.Vector3();
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.hp = CFG.startHP;
    this.alive = true;
    this.keys = {};
    this.sensitivity = 0.0022;
    this.bobPhase = 0;
    this._locked = false;
    this.recoil = 0;
    this._initInput();
  }

  _initInput() {
    document.addEventListener('keydown', e => { this.keys[e.code] = true; });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', e => {
      if (!this._locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === this.dom;
    });
    this.dom.addEventListener('click', () => {
      if (!this._locked) this.dom.requestPointerLock();
    });
  }

  isLocked() { return this._locked; }

  update(dt, obstacles, collideFn) {
    if (!this.alive) return;
    const k = this.keys;
    const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sprint = k.ShiftLeft || k.ShiftRight;
    const speed = CFG.playerSpeed * (sprint ? CFG.sprintMul : 1) * (k.ControlLeft ? 0.45 : 1);

    const dir = new THREE.Vector3(strafe, 0, -fwd);
    if (dir.lengthSq() > 0) dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const nextX = this.pos.x + dir.x * speed * dt;
    const nextZ = this.pos.z + dir.z * speed * dt;

    if (!collideFn(nextX, this.pos.z, CFG.playerRadius, obstacles)) this.pos.x = nextX;
    if (!collideFn(this.pos.x, nextZ, CFG.playerRadius, obstacles)) this.pos.z = nextZ;

    const lim = CFG.mapRadius - 2;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > lim) {
      this.pos.x = this.pos.x / d * lim;
      this.pos.z = this.pos.z / d * lim;
    }

    if (this.onGround && k.Space) {
      this.vel.y = CFG.jumpVel;
      this.onGround = false;
    }
    this.vel.y -= CFG.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= CFG.playerHeight) {
      this.pos.y = CFG.playerHeight;
      this.vel.y = 0;
      this.onGround = true;
    }

    const moving = dir.lengthSq() > 0 && this.onGround;
    this.bobPhase += dt * (sprint ? 13 : 8) * (moving ? 1 : 0);
    const bob = moving ? Math.sin(this.bobPhase) * (sprint ? 0.05 : 0.028) : 0;

    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);

    this.camera.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil * 0.06, this.yaw, 0, 'YXZ');
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    return this.hp <= 0;
  }
}
