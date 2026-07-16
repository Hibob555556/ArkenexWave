import { createWasmWaterRenderer } from './wasm-demo.js';
import { createWaterVisuals } from './water-visuals.js';

const jsCanvas = document.getElementById('js-canvas');
const wasmCanvas = document.getElementById('wasm-canvas');
const jsFps = document.getElementById('js-fps');
const wasmFps = document.getElementById('wasm-fps');
const jsBar = document.getElementById('js-bar');
const wasmBar = document.getElementById('wasm-bar');
const status = document.getElementById('status');

const solverTimings = { js: 0, wasm: 0 };

function createSpeedMeter(name, target, bar) {
  let samples = 0;
  let totalMs = 0;
  let lastUpdate = performance.now();
  return (stepMs) => {
    samples += 1;
    totalMs += stepMs;
    if (performance.now() - lastUpdate >= 400) {
      const averageMs = totalMs / samples;
      const averageUs = averageMs * 1000;
      solverTimings[name] = averageMs;
      target.textContent = `${Math.round(averageUs)} µs/step`;
      bar.style.width = `${Math.min(100, averageUs / 500 * 100).toFixed(1)}%`;
      bar.classList.toggle('over-limit', averageUs > 500);
      if (solverTimings.js && solverTimings.wasm) {
        const faster = solverTimings.js < solverTimings.wasm ? 'JavaScript' : 'C/WASM';
        const ratio = Math.max(solverTimings.js, solverTimings.wasm) / Math.min(solverTimings.js, solverTimings.wasm);
        status.textContent = `${faster} is ${ratio.toFixed(2)}× faster in the rolling solver sample. Lower time is better.`;
      }
      samples = 0;
      totalMs = 0;
      lastUpdate = performance.now();
    }
  };
}

function createJsWaterRenderer(canvas, fpsTracker) {
  const ctx = canvas.getContext('2d');
  const cols = 140;
  const rows = 84;
  const heights = new Float32Array(cols * rows);
  const velocities = new Float32Array(cols * rows);
  const nextHeights = new Float32Array(cols * rows);
  const nextVelocities = new Float32Array(cols * rows);
  let width = 0;
  let height = 0;
  let dpr = 1;
  const pointer = { x: 0.5, y: 0.5, active: false };
  const renderWater = createWaterVisuals(ctx, cols, rows);

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
    for (let i = 0; i < heights.length; i += 1) heights[i] = (random() - 0.5) * 0.002;
    const scratch = new Float32Array(heights.length);
    for (let pass = 0; pass < 7; pass += 1) {
      scratch.set(heights);
      for (let y = 1; y < rows - 1; y += 1) {
        for (let x = 1; x < cols - 1; x += 1) {
          const i = y * cols + x;
          scratch[i] = (heights[i] * 4 + heights[i - 1] + heights[i + 1] + heights[i - cols] + heights[i + cols]) / 8;
        }
      }
      heights.set(scratch);
    }
  }

  function step(now) {
    const time = now * 0.001;
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        const idx = y * cols + x;
        const left = heights[idx - 1];
        const right = heights[idx + 1];
        const up = heights[idx - cols];
        const down = heights[idx + cols];
        const laplacian = left + right + up + down - heights[idx] * 4;
        let velocity = (velocities[idx] + laplacian * 0.065) * 0.972;
        if (pointer.active) {
          const dx = x / (cols - 1) - pointer.x;
          const dy = y / (rows - 1) - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.105) {
            const falloff = 1 - dist / 0.105;
            velocity -= falloff * falloff * 0.00072;
          }
        }
        nextVelocities[idx] = Math.max(-0.003, Math.min(0.003, velocity));
        nextHeights[idx] = Math.max(-0.025, Math.min(0.025, heights[idx] + nextVelocities[idx]));
      }
    }
    heights.set(nextHeights);
    velocities.set(nextVelocities);
    pointer.active = false;
  }

  function draw(now) {
    renderWater(heights, width, height, now);
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

  let lastTime = performance.now();
  function animate(now) {
    const delta = now - lastTime;
    lastTime = now;
    const stepStart = performance.now();
    step(now);
    fpsTracker(performance.now() - stepStart);
    draw(now);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

const jsFpsMeter = createSpeedMeter('js', jsFps, jsBar);
createJsWaterRenderer(jsCanvas, jsFpsMeter);

await createWasmWaterRenderer(wasmCanvas, createSpeedMeter('wasm', wasmFps, wasmBar));
status.textContent = 'Measuring rolling solver time. Lower time per step is better.';
