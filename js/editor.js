import * as THREE from 'three';
import { CFG } from './config.js';

const DEFAULTS = {
  fogDensity: 0.007,
  fogColor: '#b9c3cc',
  glbScale: 1, glbOffsetY: 0, glbRotY: 0,
  groundTexURL: '',
  playerSpeed: 6.5, jumpVel: 5.0, gunDmg: 30, fireInterval: 110,
  enemySpeed: 2.1, enemyHP: 60, enemyCount: 18,
};

export class Editor {
  constructor(getState) {
    this.getState = getState;
    this.visible = false;
    this.settings = { ...DEFAULTS, ...loadSaved() };
    this.panel = null;
    this.build();
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE' && !e.repeat && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
        this.toggle();
      }
    });
    this.applyAll();
  }

  build() {
    const p = document.createElement('div');
    p.id = 'editor';
    p.style.cssText = `position:fixed;top:60px;right:12px;width:290px;max-height:82vh;overflow-y:auto;z-index:30;background:rgba(10,14,18,.94);border:1px solid #2a3a4a;border-radius:10px;padding:14px;font:12px/1.5 'Segoe UI',sans-serif;color:#dfe6ec;display:none;pointer-events:auto`;
    p.innerHTML = `
      <div style="font-weight:800;letter-spacing:2px;margin-bottom:8px">EDYTOR MAPY <span style="color:#7fb2e5;font-weight:400">(E — ukryj)</span></div>
      <div class="sec">MGŁA</div>
      <label>Gęstość <span id="v-fog"></span></label>
      <input type="range" id="ed-fogDensity" min="0.0005" max="0.03" step="0.0005">
      <label>Kolor</label>
      <input type="color" id="ed-fogColor" style="width:100%;height:26px;background:none;border:none">
      <div class="sec">MODEL 3D (GLB)</div>
      <label>Skala <span id="v-scale"></span></label>
      <input type="range" id="ed-glbScale" min="0.1" max="4" step="0.05">
      <label>Wysokość Y <span id="v-offy"></span></label>
      <input type="range" id="ed-glbOffsetY" min="-20" max="20" step="0.1">
      <label>Obrót Y <span id="v-rot"></span></label>
      <input type="range" id="ed-glbRotY" min="0" max="6.28" step="0.02">
      <div class="sec">TEKSTURA PODŁOŻA</div>
      <input type="file" id="ed-groundTex" accept="image/*" style="font-size:11px">
      <button class="btn" id="ed-groundReset">Przywróć satelitarną</button>
      <div class="sec">ROZGRYWKA</div>
      <label>Prędkość gracza <span id="v-speed"></span></label>
      <input type="range" id="ed-playerSpeed" min="2" max="15" step="0.5">
      <label>Skok <span id="v-jump"></span></label>
      <input type="range" id="ed-jumpVel" min="2" max="12" step="0.5">
      <label>Obrażenia broni <span id="v-dmg"></span></label>
      <input type="range" id="ed-gunDmg" min="5" max="100" step="1">
      <label>Szybkostrzelność (ms) <span id="v-fire"></span></label>
      <input type="range" id="ed-fireInterval" min="40" max="500" step="10">
      <label>Prędkość wrogów <span id="v-espeed"></span></label>
      <input type="range" id="ed-enemySpeed" min="0.5" max="8" step="0.1">
      <label>HP wroga <span id="v-ehp"></span></label>
      <input type="range" id="ed-enemyHP" min="10" max="300" step="5">
      <label>Liczba wrogów <span id="v-ecount"></span></label>
      <input type="range" id="ed-enemyCount" min="0" max="40" step="1">
      <div class="sec">AKCJE</div>
      <button class="btn" id="ed-respawn">Przenieś mnie na wolne miejsce</button>
      <button class="btn" id="ed-save">Zapisz ustawienia</button>
      <button class="btn" id="ed-defaults" style="color:#e08585">Przywróć domyślne</button>
    `;
    const style = document.createElement('style');
    style.textContent = `
      #editor label{display:block;margin:7px 0 2px;color:#9fb8cc}
      #editor input[type=range]{width:100%}
      #editor .sec{margin:12px 0 4px;font-weight:700;letter-spacing:1px;color:#7fb2e5;border-bottom:1px solid #2a3a4a;padding-bottom:2px}
      #editor .btn{display:block;width:100%;margin:6px 0;padding:7px;background:#243447;color:#dfe6ec;border:none;border-radius:6px;cursor:pointer;font-size:12px}
      #editor .btn:hover{background:#2f4763}
    `;
    document.head.appendChild(style);
    document.body.appendChild(p);
    this.panel = p;

    const bind = (key, el, fmt, onChange) => {
      const input = p.querySelector('#ed-' + el);
      input.value = this.settings[key];
      const upd = () => {
        this.settings[key] = +input.value;
        const lbl = p.querySelector('#v-' + el.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (lbl) lbl.textContent = fmt ? fmt(+input.value) : input.value;
        onChange(+input.value);
      };
      input.addEventListener('input', upd);
      upd();
    };

    const s = this.settings;
    bind('fogDensity', 'fogDensity', v => v.toFixed(4), v => {
      if (this.getState().scene) this.getState().scene.fog.density = v;
    });
    bind('fogColor', 'fogColor', null, v => {
      const sc = this.getState().scene;
      if (sc) { sc.fog.color.set(v); sc.background.set(v); }
    });
    p.querySelector('#ed-fogColor').value = s.fogColor;
    p.querySelector('#ed-fogColor').addEventListener('input', e => {
      s.fogColor = e.target.value;
      const sc = this.getState().scene;
      if (sc) { sc.fog.color.set(s.fogColor); sc.background.set(s.fogColor); }
    });

    bind('glbScale', 'glbScale', v => '×' + v.toFixed(2), v => this.applyModel());
    bind('glbOffsetY', 'glbOffsetY', v => v.toFixed(1) + ' m', v => this.applyModel());
    bind('glbRotY', 'glbRotY', v => (v * 57.3).toFixed(0) + '°', v => this.applyModel());

    p.querySelector('#ed-groundTex').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      this.setGroundTexture(url);
    });
    p.querySelector('#ed-groundReset').addEventListener('click', () => {
      const g = this.getState().ground;
      if (g && g.userData.satURL) this.setGroundTexture(g.userData.satURL, true);
    });

    bind('playerSpeed', 'playerSpeed', v => v + ' m/s', v => CFG.playerSpeed = v);
    bind('jumpVel', 'jumpVel', v => v + ' m/s', v => CFG.jumpVel = v);
    bind('gunDmg', 'gunDmg', v => v + ' dmg', v => CFG.gunDmg = v);
    bind('fireInterval', 'fireInterval', v => v + ' ms', v => CFG.fireInterval = v);
    bind('enemySpeed', 'enemySpeed', v => v + ' m/s', v => CFG.enemySpeed = v);
    bind('enemyHP', 'enemyHP', v => v + ' hp', v => CFG.enemyHP = v);
    bind('enemyCount', 'enemyCount', v => String(v), v => { CFG.enemyCount = v; });

    p.querySelector('#ed-respawn').addEventListener('click', () => this.respawnPlayer());
    p.querySelector('#ed-save').addEventListener('click', () => {
      localStorage.setItem('fogshooter.settings', JSON.stringify(this.settings));
      this.toast('Zapisano ustawienia');
    });
    p.querySelector('#ed-defaults').addEventListener('click', () => {
      localStorage.removeItem('fogshooter.settings');
      this.settings = { ...DEFAULTS };
      this.panel.remove();
      this.build();
      this.show();
      this.toast('Przywrócono domyślne');
    });
  }

  toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:150px;left:50%;transform:translateX(-50%);background:#243447;color:#dfe6ec;padding:8px 18px;border-radius:8px;z-index:40;font-size:13px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  show() { this.panel.style.display = 'block'; this.visible = true; }
  hide() { this.panel.style.display = 'none'; this.visible = false; }
  toggle() { this.visible ? this.hide() : this.show(); }

  applyModel() {
    const api = window.__fogGLBApi;
    if (!api || !api.root) return;
    const s = this.settings;
    api.root.scale.setScalar(api.baseScale * s.glbScale);
    api.root.position.y = api.baseY + s.glbOffsetY;
    api.root.rotation.y = s.glbRotY;
    api.rebuild();
    if (this.getState().player) this.respawnPlayer();
  }

  applyAll() {
    const s = this.settings;
    CFG.playerSpeed = s.playerSpeed;
    CFG.jumpVel = s.jumpVel;
    CFG.gunDmg = s.gunDmg;
    CFG.fireInterval = s.fireInterval;
    CFG.enemySpeed = s.enemySpeed;
    CFG.enemyHP = s.enemyHP;
    CFG.enemyCount = s.enemyCount;
  }

  setGroundTexture(url, isSat = false) {
    const st = this.getState();
    const loader = new THREE.TextureLoader();
    loader.load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (st.ground) {
        const rep = st.ground.userData.repeat || 1;
        tex.repeat.set(rep, rep);
        st.ground.material.map = tex;
        st.ground.material.needsUpdate = true;
        if (isSat) st.ground.userData.satURL = url;
      }
      this.toast('Tekstura podłoża zmieniona');
    });
  }

  respawnPlayer() {
    const st = this.getState();
    if (!st.player || !st.obstacles) return;
    const spot = findFreeSpot(st.obstacles, st.mapRadius || CFG.mapRadius);
    st.player.pos.set(spot.x, CFG.playerHeight, spot.z);
    st.player.vel.set(0, 0, 0);
    this.toast('Przeniesiono na wolne miejsce');
  }
}

export function findFreeSpot(obstacles, maxR) {
  for (let r = 2; r < maxR; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let hit = false;
      for (const b of obstacles) {
        if (x + 0.7 > b.minX && x - 0.7 < b.maxX && z + 0.7 > b.minZ && z - 0.7 < b.maxZ) { hit = true; break; }
      }
      if (!hit) return { x, z };
    }
  }
  return { x: 0, z: 0 };
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('fogshooter.settings')) || {}; } catch (e) { return {}; }
}
