import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class PhysicsWorld {
  constructor(scene) {
    this.scene = scene;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.bodies = [];
    this.meshes = [];

    this.matGround = new CANNON.Material('ground');
    this.matObj = new CANNON.Material('obj');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matGround, this.matObj, {
      friction: 0.4, restitution: 0.3,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matObj, this.matObj, {
      friction: 0.3, restitution: 0.4,
    }));

    const groundBody = new CANNON.Body({ mass: 0, material: this.matGround, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(groundBody);

    this._ballGeo = new THREE.SphereGeometry(0.35, 12, 10);
    this._ballMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.4 });
    this._boxGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    this._boxMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.8 });
  }

  addObstacles(obstacles) {
    for (const b of obstacles) {
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      const h = b.h || 2.5;
      const body = new CANNON.Body({
        mass: 0,
        material: this.matGround,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
        position: new CANNON.Vec3(cx, h / 2, cz),
      });
      this.world.addBody(body);
    }
  }

  spawnBall(pos, vel) {
    const body = new CANNON.Body({
      mass: 1.2,
      material: this.matObj,
      shape: new CANNON.Sphere(0.35),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    body.velocity.set(vel.x, vel.y, vel.z);
    this.world.addBody(body);
    const mesh = new THREE.Mesh(this._ballGeo, this._ballMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.bodies.push(body);
    this.meshes.push(mesh);
    if (this.bodies.length > 40) this.removeOldest();
    return body;
  }

  spawnBox(pos) {
    const body = new CANNON.Body({
      mass: 2,
      material: this.matObj,
      shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.35)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    });
    body.quaternion.setFromEuler(Math.random(), Math.random(), Math.random());
    this.world.addBody(body);
    const mesh = new THREE.Mesh(this._boxGeo, this._boxMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.bodies.push(body);
    this.meshes.push(mesh);
    if (this.bodies.length > 40) this.removeOldest();
  }

  removeOldest() {
    const b = this.bodies.shift(), m = this.meshes.shift();
    this.world.removeBody(b);
    this.scene.remove(m);
  }

  update(dt) {
    this.world.step(1 / 60, dt, 3);
    for (let i = 0; i < this.bodies.length; i++) {
      this.meshes[i].position.copy(this.bodies[i].position);
      this.meshes[i].quaternion.copy(this.bodies[i].quaternion);
      if (this.bodies[i].position.y < -30) {
        this.world.removeBody(this.bodies[i]);
        this.scene.remove(this.meshes[i]);
        this.bodies.splice(i, 1);
        this.meshes.splice(i, 1);
        i--;
      }
    }
  }

  clear() {
    for (let i = 0; i < this.bodies.length; i++) {
      this.world.removeBody(this.bodies[i]);
      this.scene.remove(this.meshes[i]);
    }
    this.bodies = [];
    this.meshes = [];
  }
}
