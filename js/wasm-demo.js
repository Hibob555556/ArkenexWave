import { createWaterVisuals } from './water-visuals.js';

export async function createWasmWaterRenderer(canvas, fpsTracker) {
  const moduleFactory = (await import('../build/water.js')).default;
  const wasm = await moduleFactory();

  const ctx = canvas.getContext('2d');
  const cols = 140;
  const rows = 84;
  const heightField = new Float32Array(cols * rows);
  const velocityField = new Float32Array(cols * rows);
  let width = 0;
  let height = 0;
  let dpr = 1;
  const pointer = { x: 0.5, y: 0.5, active: false };
  const renderWater = createWaterVisuals(ctx, cols, rows);

  const heightsPtr = wasm._malloc(heightField.byteLength);
  const velocitiesPtr = wasm._malloc(velocityField.byteLength);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    let state = 0x6d2b79f5;
    const random = () => {
      state = Math.imul(state ^ (state >>> 15), state | 1);
      state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
      return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < heightField.length; i += 1) heightField[i] = (random() - 0.5) * 0.002;
    const scratch = new Float32Array(heightField.length);
    for (let pass = 0; pass < 7; pass += 1) {
      scratch.set(heightField);
      for (let y = 1; y < rows - 1; y += 1) {
        for (let x = 1; x < cols - 1; x += 1) {
          const i = y * cols + x;
          scratch[i] = (heightField[i] * 4 + heightField[i - 1] + heightField[i + 1] + heightField[i - cols] + heightField[i + cols]) / 8;
        }
      }
      heightField.set(scratch);
    }
  }

  function syncState() {
    wasm.HEAPF32.set(heightField, heightsPtr >> 2);
    wasm.HEAPF32.set(velocityField, velocitiesPtr >> 2);
  }

  function step(deltaMs) {
    const time = performance.now() * 0.001;
    const pointerX = pointer.active ? pointer.x : 0.5;
    const pointerY = pointer.active ? pointer.y : 0.5;
    const active = pointer.active ? 1 : 0;

    wasm._water_step(heightsPtr, velocitiesPtr, cols, rows, pointerX, pointerY, active, time);
    const start = heightsPtr >> 2;
    const liveHeights = wasm.HEAPF32.subarray(start, start + cols * rows);
    pointer.active = false;
    return liveHeights;
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = 1 - (event.clientY - rect.top) / rect.height;
    const qx = (u * 2 - 1) * (rect.width / rect.height);
    const rayY = v * 2 - 1 - 0.22;
    if (rayY >= -0.015) {
      pointer.active = false;
      return;
    }
    const distance = Math.min(1.15 / -rayY, 32);
    pointer.x = Math.max(0, Math.min(1, (qx * 0.72 * distance) / 20 + 0.5));
    pointer.y = Math.max(0, Math.min(1, (1.35 * distance) / 32));
    pointer.active = true;
  }

  canvas.addEventListener('pointermove', (event) => {
    updatePointer(event);
  });

  canvas.addEventListener('pointerleave', () => {
    pointer.active = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    updatePointer(event);
  });

  resize();
  seed();
  syncState();

  let lastTime = performance.now();
  function animate(now) {
    const delta = now - lastTime;
    lastTime = now;
    const stepStart = performance.now();
    const liveHeights = step(delta);
    fpsTracker(performance.now() - stepStart);
    renderWater(liveHeights, width, height, now);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
