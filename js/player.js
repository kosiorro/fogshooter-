import * as THREE from 'three';
import { CFG } from './config.js';
import { circleHitsAny } from './collision.js';

export class Player {
  constructor(camera, dom, scene) {
    this.camera = camera;
    this.dom = dom;
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 6);
    this.vel = new THREE.Vector3();
    this.onGround = true;
    this.facing = 0;
    this.hp = CFG.startHP;
    this.alive = true;
    this.keys = {};
    this.buttons = {};
    this.recoil = 0;
    this.mouse = new THREE.Vector2(0, 0);
    this.aimPoint = new THREE.Vector3(0, 0, 0);
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f5a8e, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd8b58e, roughness: 0.8 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.5, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 10), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), headMat);
    head.position.y = 1.62;
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), gunMat);
    barrel.position.set(0, 1.15, -0.4);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), gunMat);
    grip.position.set(0, 1.05, -0.12);
    gun.add(barrel, grip);
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 1.15, -0.8);
    gun.add(this.muzzlePoint);
    this.group.add(body, head, gun);
    this.gun = gun;
    scene.add(this.group);

    this._initInput();
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  _initInput() {
    document.addEventListener('keydown', e => { this.keys[e.code] = true; });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', e => {
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    });
    document.addEventListener('mousedown', e => { this.buttons[e.button] = true; });
    document.addEventListener('mouseup', e => { this.buttons[e.button] = false; });
  }

  update(dt, obstacles) {
    if (!this.alive) return;
    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const sprint = k.ShiftLeft || k.ShiftRight;
    const speed = CFG.playerSpeed * (sprint ? CFG.sprintMul : 1);

    const dir = new THREE.Vector3(strafe, 0, -fwd);
    if (dir.lengthSq() > 0) {
      dir.normalize();
      const nextX = this.pos.x + dir.x * speed * dt;
      const nextZ = this.pos.z + dir.z * speed * dt;
      if (!circleHitsAny(nextX, this.pos.z, CFG.playerRadius, obstacles)) this.pos.x = nextX;
      if (!circleHitsAny(this.pos.x, nextZ, CFG.playerRadius, obstacles)) this.pos.z = nextZ;
    }

    const lim = (window.__fogMapRadius || CFG.mapRadius) - 2;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > lim) {
      this.pos.x = this.pos.x / d * lim;
      this.pos.z = this.pos.z / d * lim;
    }

    if (this.onGround && k.Space) {
      this.vel.y = CFG.jumpVel * 0.6;
      this.onGround = false;
    }
    this.vel.y -= CFG.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }

    this._raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, new THREE.Vector3());
    if (hit) {
      this.aimPoint.set(hit.x, 0, hit.z);
      this.facing = Math.atan2(hit.x - this.pos.x, hit.z - this.pos.z);
    }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing + Math.PI;

    if (!this.aimRing) {
      const ringGeo = new THREE.RingGeometry(0.35, 0.5, 24);
      ringGeo.rotateX(-Math.PI / 2);
      this.aimRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.85, depthWrite: false }));
      this.scene.add(this.aimRing);
    }
    this.aimRing.position.set(this.aimPoint.x, 0.06, this.aimPoint.z);

    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);

    const camAngle = this.facing;
    const camDist = 13;
    const camH = 10.5;
    const back = new THREE.Vector3(Math.sin(camAngle), 0, Math.cos(camAngle)).multiplyScalar(camDist);
    const target = new THREE.Vector3(this.pos.x - back.x, camH + this.pos.y, this.pos.z - back.z);
    this.camera.position.lerp(target, Math.min(1, dt * 8));
    this.camera.lookAt(this.pos.x, this.pos.y + 1, this.pos.z);
  }

  aimDir() {
    const d = new THREE.Vector3(this.aimPoint.x - this.pos.x, 0, this.aimPoint.z - this.pos.z);
    return d.lengthSq() > 0 ? d.normalize() : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  muzzleWorldPos() {
    const v = new THREE.Vector3();
    this.muzzlePoint.getWorldPosition(v);
    return v;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    return this.hp <= 0;
  }
}
