import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export class SceneManager {
  constructor(canvas, labelContainer) {
    this.canvas = canvas;
    this.labelContainer = labelContainer;
    this._tweens = [];
    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._initLighting();
    this._initLabelRenderer();
    this._bindResize();
    this._startLoop();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // needed for export
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0d0d0d, 1);
    this._resize();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.meshes = []; // { mesh, record }
  }

  _initCamera() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 50000);
    this.camera.position.set(0, 0, 1200);
    this._defaultCameraPos = this.camera.position.clone();
    this._defaultTarget = new THREE.Vector3(0, 0, 0);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 8000;
    this.controls.minPolarAngle = Math.PI * 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
  }

  _initLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.4);
    dir.position.set(1, 2, 3);
    this.scene.add(dir);
  }

  _initLabelRenderer() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this.labelContainer.appendChild(this.labelRenderer.domElement);
  }

  _bindResize() {
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.canvas.parentElement);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h);
    if (this.labelRenderer) this.labelRenderer.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _startLoop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const now = performance.now();
      this._tweens = this._tweens.filter(t => {
        const elapsed = now - t.startTime;
        const progress = Math.min(elapsed / t.duration, 1);
        const eased = t.ease ? t.ease(progress) : progress;
        t.update(eased);
        return progress < 1;
      });
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    tick();
  }

  addTween({ duration, ease, update, onDone }) {
    const t = { startTime: performance.now(), duration, ease, update };
    this._tweens.push(t);
    if (onDone) {
      setTimeout(onDone, duration);
    }
  }

  resetCamera(animated = true) {
    if (!animated) {
      this.camera.position.copy(this._defaultCameraPos);
      this.controls.target.copy(this._defaultTarget);
      return;
    }
    const from = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.addTween({
      duration: 500,
      ease: easeInOut,
      update: t => {
        this.camera.position.lerpVectors(from, this._defaultCameraPos, t);
        this.controls.target.lerpVectors(fromTarget, this._defaultTarget, t);
      },
    });
  }

  frameObject(mesh, animated = true) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = size * 2.5;
    const targetPos = new THREE.Vector3(center.x, center.y, center.z + dist);

    if (!animated) {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(center);
      return;
    }
    const from = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.addTween({
      duration: 600,
      ease: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
      update: t => {
        this.camera.position.lerpVectors(from, targetPos, t);
        this.controls.target.lerpVectors(fromTarget, center, t);
      },
    });
  }

  clear() {
    for (const { mesh } of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
    this.meshes = [];
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this.renderer.dispose();
    this.labelRenderer.domElement.remove();
  }
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function easeSpring(t) {
  // gentle spring overshoot
  return 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 2);
}
