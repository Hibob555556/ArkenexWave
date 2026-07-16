#include <math.h>

#define MAX_CELLS 11760
static float next_heights[MAX_CELLS];
static float next_velocities[MAX_CELLS];

void water_step(float* heights, float* velocities, int width, int height, float pointerX, float pointerY, int pointerActive, float time) {
    int count = width * height;
    if (count > MAX_CELLS) return;
    for (int i = 0; i < count; i += 1) {
        next_heights[i] = heights[i];
        next_velocities[i] = velocities[i];
    }
    for (int y = 1; y < height - 1; y += 1) {
        for (int x = 1; x < width - 1; x += 1) {
            int idx = y * width + x;
            float left = heights[idx - 1];
            float right = heights[idx + 1];
            float up = heights[idx - width];
            float down = heights[idx + width];
            float laplacian = left + right + up + down - heights[idx] * 4.0f;
            float velocity = (velocities[idx] + laplacian * 0.065f) * 0.972f;

            if (pointerActive) {
                float dx = (float)x / (float)(width - 1) - pointerX;
                float dy = (float)y / (float)(height - 1) - pointerY;
                float dist = sqrtf(dx * dx + dy * dy);
                if (dist < 0.105f) {
                    float falloff = 1.0f - dist / 0.105f;
                    velocity -= falloff * falloff * 0.00072f;
                }
            }

            next_velocities[idx] = fmaxf(-0.003f, fminf(0.003f, velocity));
            next_heights[idx] = fmaxf(-0.025f, fminf(0.025f, heights[idx] + next_velocities[idx]));
        }
    }
    for (int i = 0; i < count; i += 1) {
        heights[i] = next_heights[i];
        velocities[i] = next_velocities[i];
    }
}

void water_render(float* heights, unsigned char* outPixels, int width, int height) {
    for (int y = 0; y < height; y += 1) {
        for (int x = 0; x < width; x += 1) {
            int idx = y * width + x;
            float h = heights[idx];
            float normalized = fmaxf(-1.0f, fminf(1.0f, h * 0.35f + 0.5f));
            unsigned char r = (unsigned char)(10 + normalized * 54.0f);
            unsigned char g = (unsigned char)(60 + normalized * 92.0f);
            unsigned char b = (unsigned char)(115 + normalized * 104.0f);
            unsigned char a = 255;
            int pixel = idx * 4;
            outPixels[pixel] = r;
            outPixels[pixel + 1] = g;
            outPixels[pixel + 2] = b;
            outPixels[pixel + 3] = a;
        }
    }
}
