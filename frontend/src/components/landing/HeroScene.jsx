import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTicketFace(state) {
  const w = 640;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const isSettled = state === 'settled';
  const base = isSettled ? '#123326' : '#16213a';
  const accent = isSettled ? '#1f9e6b' : '#e2a63b';
  const accentText = isSettled ? '#06170f' : '#1b1408';

  roundRectPath(ctx, 0, 0, w, h, 26);
  ctx.fillStyle = base;
  ctx.fill();

  // Top accent stripe
  ctx.fillStyle = accent;
  roundRectPath(ctx, 0, 0, w, 14, 6);
  ctx.fill();

  // Wordmark
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 34px "Space Grotesk", sans-serif';
  ctx.fillText('Trip Ledger', 40, 76);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 18px "IBM Plex Mono", monospace';
  ctx.fillText('GOA-2026 · 6 MEMBERS', 40, 106);

  // Perforation line
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 14]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(40, 250);
  ctx.lineTo(w - 40, 250);
  ctx.stroke();
  ctx.setLineDash([]);

  // Amount
  ctx.fillStyle = '#fff';
  ctx.font = '600 46px "IBM Plex Mono", monospace';
  ctx.fillText(isSettled ? '₹0.00' : '₹12,480.00', 40, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 18px "IBM Plex Mono", monospace';
  ctx.fillText(isSettled ? 'ALL SQUARE' : 'LIVE BALANCE', 40, 350);

  // Stamp
  ctx.save();
  ctx.translate(w - 130, 300);
  ctx.rotate(-0.22);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '700 22px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isSettled ? 'SETTLED' : 'OPEN', 0, 8);
  ctx.restore();
  ctx.textAlign = 'left';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { texture: tex, accent, accentText, base };
}

function drawCoinFace(state) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const isSettled = state === 'settled';
  const accent = isSettled ? '#1f9e6b' : '#e2a63b';
  const accentSoft = isSettled ? '#8fd6b8' : '#f3d9a3';

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = accentSoft;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isSettled ? '#06170f' : '#1b1408';
  ctx.font = '700 108px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₹', size / 2, size / 2 + 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function drawStubFace(state) {
  const w = 260;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const isSettled = state === 'settled';
  const accent = isSettled ? '#1f9e6b' : '#e2a63b';

  roundRectPath(ctx, 0, 0, w, h, 14);
  ctx.fillStyle = '#f6f5f1';
  ctx.fill();

  ctx.fillStyle = accent;
  roundRectPath(ctx, 0, 0, w, 10, 4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(22,33,58,0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  ctx.moveTo(18, 96);
  ctx.lineTo(w - 18, 96);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#16213a';
  ctx.font = '600 26px "IBM Plex Mono", monospace';
  ctx.fillText(isSettled ? '₹0' : '₹840', 18, 70);
  ctx.fillStyle = 'rgba(22,33,58,0.55)';
  ctx.font = '500 14px "IBM Plex Mono", monospace';
  ctx.fillText(isSettled ? 'SQUARE' : 'DINNER · SPLIT 4', 18, 122);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cardMaterials(frontTexture, edgeHex, backHex) {
  const edge = new THREE.MeshStandardMaterial({ color: edgeHex, roughness: 0.6, metalness: 0.05 });
  const back = new THREE.MeshStandardMaterial({ color: backHex, roughness: 0.7, metalness: 0.05 });
  const front = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.45, metalness: 0.08 });
  return [edge, edge, edge, edge, front, back];
}

function worldUnitsPerPixel(camera, zPlane) {
  const dist = camera.position.z - zPlane;
  const vFov = (camera.fov * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
  return visibleHeight / window.innerHeight;
}

function visibleExtentAt(camera, zPlane) {
  const dist = camera.position.z - zPlane;
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * Math.tan(vFov / 2) * dist;
  const width = height * camera.aspect;
  return { width, height };
}

const particleDefs = [
  { layer: 'fg', type: 'coin', xFrac: -0.6, yFrac: 0.42, z: 60, size: 22 },
  { layer: 'fg', type: 'stub', xFrac: -0.66, yFrac: -0.46, z: 45, size: 0.5 },
  { layer: 'fg', type: 'coin', xFrac: 0.62, yFrac: -0.38, z: 80, size: 28 },
  { layer: 'fg', type: 'stub', xFrac: 0.58, yFrac: 0.48, z: 50, size: 0.55 },
  { layer: 'fg', type: 'coin', xFrac: -0.3, yFrac: -0.6, z: 70, size: 15 },
  { layer: 'fg', type: 'stub', xFrac: 0.32, yFrac: 0.58, z: 55, size: 0.42 },
  // bg layer: subtle depth particles, least noticeable when hidden - the
  // first to go on small screens (see hideBelow, used in fitScene()).
  { layer: 'bg', type: 'coin', xFrac: -0.22, yFrac: 0.48, z: -200, size: 12, hideBelow: 640 },
  { layer: 'bg', type: 'coin', xFrac: 0.26, yFrac: -0.46, z: -180, size: 11, hideBelow: 640 },
  { layer: 'bg', type: 'stub', xFrac: -0.4, yFrac: -0.1, z: -220, size: 0.32, hideBelow: 640 },
];

/*
 * Tablet/mobile scale multiplier for the hero card + particle spread.
 * 1 for anything >=1200px (the existing desktop/tablet breakpoint used
 * throughout LandingPage.css) so desktop math is untouched; tapers down
 * to 0.62 by 480px so the scene reads as proportionally sized once the
 * layout below 1200px switches to the stacked single-column hero instead
 * of just clamping at whatever fitScene()'s aspect-ratio-only math would
 * otherwise produce for very narrow/tall viewports.
 */
function responsiveSceneScale() {
  const w = window.innerWidth;
  if (w >= 1200) return 1;
  if (w <= 480) return 0.62;
  return 0.62 + ((w - 480) / (1200 - 480)) * (1 - 0.62);
}

export function HeroScene({ heroState, view }) {
  const bgCanvasRef = useRef(null);
  const fgCanvasRef = useRef(null);
  const bubblesRef = useRef(null);
  const sceneStateRef = useRef({
    heroState,
    isSwitching: false,
    switchSpin: 0,
    mouse: { x: 0, y: 0, px: window.innerWidth / 2, py: window.innerHeight / 2 },
    currentMouse: { x: 0, y: 0 },
  });

  const refs = useRef({
    heroCard: null,
    particles: [],
    bgRenderer: null,
    fgRenderer: null,
    bgScene: null,
    fgScene: null,
    bgCamera: null,
    fgCamera: null,
    animFrameId: null,
    punchInterval: null,
    clock: new THREE.Clock(),
    projectVec: new THREE.Vector3(),
  });

  // Track state in ref for animation loop
  useEffect(() => {
    sceneStateRef.current.heroState = heroState;
  }, [heroState]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;

    function makeRenderer(canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 640 ? 1.5 : 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return renderer;
    }

    const bgRenderer = makeRenderer(bgCanvas);
    const fgRenderer = makeRenderer(fgCanvas);
    const bgScene = new THREE.Scene();
    const fgScene = new THREE.Scene();

    function makeCamera() {
      const cam = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 3000);
      cam.position.z = 620;
      return cam;
    }
    const bgCamera = makeCamera();
    const fgCamera = makeCamera();

    [bgScene, fgScene].forEach((scene) => {
      const ambient = new THREE.AmbientLight(0xffffff, 0.65);
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(200, 260, 400);
      const rim = new THREE.DirectionalLight(0xfff1d0, 0.5);
      rim.position.set(-260, -120, 200);
      scene.add(ambient, key, rim);
    });

    // Hero Ticket Card
    const initialState = sceneStateRef.current.heroState;
    const heroBaseHalfWidth = 150;
    const heroGeo = new THREE.BoxGeometry(300, 180, 8, 1, 1, 1);
    const face = drawTicketFace(initialState);
    const heroCard = new THREE.Mesh(
      heroGeo,
      cardMaterials(face.texture, initialState === 'settled' ? 0x1f9e6b : 0xe2a63b, 0x0c1220)
    );
    heroCard.position.set(0, 0, 0);
    bgScene.add(heroCard);

    // Floating Particles
    const particles = [];
    particleDefs.forEach((def, index) => {
      const scene = def.layer === 'fg' ? fgScene : bgScene;
      let mesh;
      let baseRotX;
      let baseRotY;
      let baseRotZ;

      if (def.type === 'coin') {
        const tex = drawCoinFace(initialState);
        const geo = new THREE.CylinderGeometry(def.size, def.size, def.size * 0.22, 40);
        const sideColor = initialState === 'settled' ? 0x1f9e6b : 0xe2a63b;
        const side = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.35, metalness: 0.6 });
        const cap = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.3 });
        mesh = new THREE.Mesh(geo, [side, cap, cap]);
        mesh.userData.tex = tex;
        mesh.userData.sideMat = side;
        baseRotX = Math.PI / 2 + (Math.random() - 0.5) * 0.24;
        baseRotY = (Math.random() - 0.5) * 0.3;
        baseRotZ = Math.random() * Math.PI * 2;
      } else {
        const tex = drawStubFace(initialState);
        const geo = new THREE.BoxGeometry(70 * def.size, 44 * def.size, 4);
        mesh = new THREE.Mesh(geo, cardMaterials(tex, 0xd8d3c4, 0xe9e6dc));
        mesh.userData.tex = tex;
        baseRotX = (Math.random() - 0.5) * 0.22;
        baseRotY = (Math.random() - 0.5) * 0.3;
        baseRotZ = (Math.random() - 0.5) * 0.3;
      }
      scene.add(mesh);

      const camera = def.layer === 'fg' ? fgCamera : bgCamera;
      const extent = visibleExtentAt(camera, def.z);
      const baseX = def.xFrac * (extent.width / 2);
      const baseY = def.yFrac * (extent.height / 2);

      mesh.position.set(baseX, baseY, def.z);
      mesh.rotation.set(baseRotX, baseRotY, baseRotZ);

      particles.push({
        def,
        mesh,
        baseX,
        baseY,
        baseRotX,
        baseRotY,
        baseRotZ,
        rx: 0,
        ry: 0,
        floatDur: [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10][index % 9],
        floatSeed: index,
      });
    });

    function fitScene() {
      const aspect = window.innerWidth / window.innerHeight;
      [bgCamera, fgCamera].forEach((cam) => {
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      });

      const responsiveScale = responsiveSceneScale();

      const zeroExtent = visibleExtentAt(bgCamera, 0);
      const targetHalfWidth = 0.22 * zeroExtent.width;
      const currentHeroScale =
        Math.min(0.85, Math.max(0.35, targetHalfWidth / heroBaseHalfWidth)) * responsiveScale;
      heroCard.scale.setScalar(currentHeroScale);

      particles.forEach((p) => {
        const camera = p.def.layer === 'fg' ? fgCamera : bgCamera;
        const extent = visibleExtentAt(camera, p.def.z);
        p.baseX = p.def.xFrac * (extent.width / 2) * responsiveScale;
        p.baseY = p.def.yFrac * (extent.height / 2) * responsiveScale;
        if (p.def.hideBelow) {
          p.mesh.visible = window.innerWidth >= p.def.hideBelow;
        }
      });
    }

    fitScene();

    // Event listeners
    const handleMouseMove = (e) => {
      sceneStateRef.current.mouse.x = e.clientX / window.innerWidth - 0.5;
      sceneStateRef.current.mouse.y = e.clientY / window.innerHeight - 0.5;
      sceneStateRef.current.mouse.px = e.clientX;
      sceneStateRef.current.mouse.py = e.clientY;
    };

    const handleTouchMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      sceneStateRef.current.mouse.x = t.clientX / window.innerWidth - 0.5;
      sceneStateRef.current.mouse.y = t.clientY / window.innerHeight - 0.5;
      sceneStateRef.current.mouse.px = t.clientX;
      sceneStateRef.current.mouse.py = t.clientY;
    };

    const handleResize = () => {
      bgRenderer.setSize(window.innerWidth, window.innerHeight);
      fgRenderer.setSize(window.innerWidth, window.innerHeight);
      fitScene();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('resize', handleResize);

    // Punch hole particles
    const spawnPunch = () => {
      if (!bubblesRef.current || view !== 'home') return;
      const el = document.createElement('div');
      el.className = 'punch';
      const size = Math.random() * 10 + 6;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${Math.random() * 100}%`;
      el.style.bottom = '-40px';
      const duration = Math.random() * 6 + 5;
      el.style.animation = `floatUp ${duration}s linear forwards`;
      bubblesRef.current.appendChild(el);
      setTimeout(() => el.remove(), duration * 1000);
    };

    const punchInterval = setInterval(spawnPunch, 450);

    // Screen position helper
    const projectVec = refs.current.projectVec;
    function screenPosOf(mesh, camera) {
      projectVec.set(mesh.position.x, mesh.position.y, mesh.position.z);
      projectVec.project(camera);
      return {
        x: (projectVec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-projectVec.y * 0.5 + 0.5) * window.innerHeight,
      };
    }

    // Animation Render Loop
    function animate() {
      if (view !== 'home') {
        // Stop the loop entirely instead of scheduling a no-op frame every
        // tick. This effect depends on [view] (see below), so navigating
        // back to 'home' re-runs this whole setup and calls animate()
        // again, restarting the loop - no separate restart path needed.
        return;
      }

      const time = refs.current.clock.getElapsedTime();
      const state = sceneStateRef.current;
      const mouse = state.mouse;
      const currentMouse = state.currentMouse;

      currentMouse.x += (mouse.x - currentMouse.x) * 0.06;
      currentMouse.y += (mouse.y - currentMouse.y) * 0.06;

      heroCard.rotation.y = currentMouse.x * 0.7 + (state.switchSpin * Math.PI) / 180;
      heroCard.rotation.x = -currentMouse.y * 0.4;
      heroCard.position.y = Math.sin(time * 0.9) * 12;

      if (!state.isSwitching) {
        particles.forEach((p) => {
          const camera = p.def.layer === 'fg' ? fgCamera : bgCamera;
          const scale = worldUnitsPerPixel(camera, p.def.z);
          const screen = screenPosOf(p.mesh, camera);

          const diffX = mouse.px - screen.x;
          const diffY = mouse.py - screen.y;
          const distance = Math.sqrt(diffX * diffX + diffY * diffY) || 1;

          let targetRx = 0;
          let targetRy = 0;
          let speedMult = 1;
          if (distance < 320) {
            const force = (320 - distance) / 320;
            targetRx = (diffX / distance) * force * -70;
            targetRy = (diffY / distance) * force * -70;
            speedMult = 1 + force * 4;
          }

          p.rx += (targetRx - p.rx) * 0.1;
          p.ry += (targetRy - p.ry) * 0.1;

          const phase = (time + p.floatSeed * 0.7) * ((Math.PI * 2) / p.floatDur);
          const floatY = Math.sin(phase) * 10;

          p.mesh.position.x = p.baseX + p.rx * scale;
          p.mesh.position.y = p.baseY - p.ry * scale + floatY;

          const swayDur = p.floatDur * 1.3;
          const swayPhase = (time + p.floatSeed * 0.5) * ((Math.PI * 2) / swayDur);
          p.mesh.rotation.z = p.baseRotZ + Math.sin(swayPhase) * (0.12 + speedMult * 0.05);
          p.mesh.rotation.y = p.baseRotY + Math.cos(swayPhase * 0.8) * (0.08 + speedMult * 0.03);
          p.mesh.rotation.x = p.baseRotX + Math.sin(swayPhase * 0.6) * 0.05;
        });
      }

      fgScene.position.x = currentMouse.x * 26;
      fgScene.position.y = -currentMouse.y * 26;
      bgScene.position.x = currentMouse.x * -14;
      bgScene.position.y = currentMouse.y * -14;

      bgRenderer.render(bgScene, bgCamera);
      fgRenderer.render(fgScene, fgCamera);
      refs.current.animFrameId = requestAnimationFrame(animate);
    }

    animate();

    // Store refs for cleanup and state transitions
    const refVal = refs.current;
    refVal.heroCard = heroCard;
    refVal.particles = particles;
    refVal.bgRenderer = bgRenderer;
    refVal.fgRenderer = fgRenderer;
    refVal.bgScene = bgScene;
    refVal.fgScene = fgScene;
    refVal.bgCamera = bgCamera;
    refVal.fgCamera = fgCamera;

    return () => {
      cancelAnimationFrame(refVal.animFrameId);
      clearInterval(punchInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('resize', handleResize);

      bgRenderer.dispose();
      fgRenderer.dispose();
      heroGeo.dispose();
      heroCard.material.forEach((m) => m.dispose());
      particles.forEach((p) => {
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach((m) => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
      });
    };
  }, [view]);

  // Handle heroState changes with GSAP card flip & particle explosion
  const prevStateRef = useRef(heroState);
  useEffect(() => {
    if (prevStateRef.current === heroState) return;
    prevStateRef.current = heroState;

    const heroCard = refs.current.heroCard;
    const particles = refs.current.particles;
    if (!heroCard) return;

    sceneStateRef.current.isSwitching = true;

    // Card 360 Spin + Texture swap halfway through spin
    const spinObj = { angle: sceneStateRef.current.switchSpin };
    const targetAngle = sceneStateRef.current.switchSpin + 360;
    let textureSwapped = false;

    gsap.to(spinObj, {
      angle: targetAngle,
      duration: 1.1,
      ease: 'back.inOut(1.4)',
      onUpdate: () => {
        sceneStateRef.current.switchSpin = spinObj.angle;
        const progress = (spinObj.angle - (targetAngle - 360)) / 360;
        if (progress >= 0.5 && !textureSwapped) {
          textureSwapped = true;
          const newFace = drawTicketFace(heroState);
          heroCard.material[4].map.dispose();
          heroCard.material[4].map = newFace.texture;
          heroCard.material[4].needsUpdate = true;
          heroCard.material[0].color.setHex(heroState === 'settled' ? 0x1f9e6b : 0xe2a63b);
          heroCard.material[1].color.setHex(heroState === 'settled' ? 0x1f9e6b : 0xe2a63b);
          heroCard.material[2].color.setHex(heroState === 'settled' ? 0x1f9e6b : 0xe2a63b);
          heroCard.material[3].color.setHex(heroState === 'settled' ? 0x1f9e6b : 0xe2a63b);
        }
      },
      onComplete: () => {
        sceneStateRef.current.isSwitching = false;
      },
    });

    // Particle implode/explode animation + texture swap
    particles.forEach((p) => {
      gsap.to(p.mesh.scale, {
        x: 0.1,
        y: 0.1,
        z: 0.1,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          if (p.def.type === 'coin') {
            const newTex = drawCoinFace(heroState);
            p.mesh.material[1].map.dispose();
            p.mesh.material[1].map = newTex;
            p.mesh.material[1].needsUpdate = true;
            p.mesh.material[2].map = newTex;
            p.mesh.material[2].needsUpdate = true;
            p.mesh.material[0].color.setHex(heroState === 'settled' ? 0x1f9e6b : 0xe2a63b);
          } else {
            const newTex = drawStubFace(heroState);
            p.mesh.material[4].map.dispose();
            p.mesh.material[4].map = newTex;
            p.mesh.material[4].needsUpdate = true;
          }
          gsap.to(p.mesh.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.6,
            ease: 'back.out(1.7)',
          });
        },
      });
    });
  }, [heroState]);

  return (
    <>
      <div id="bubbles-container" ref={bubblesRef} />
      <canvas id="scene-bg" ref={bgCanvasRef} />
      <canvas id="scene-fg" ref={fgCanvasRef} />
    </>
  );
}
