# JavaScript vs WebAssembly: What a Water Simulation Actually Teaches Us

WebAssembly is often introduced with a simple promise: compile C, run it in the browser, and get native-like performance. That promise is directionally useful, but incomplete. This interactive water demo provides a better way to discuss what WASM improves, what it does not, and how to measure the difference honestly.

The demo runs the same height-field water simulation twice. One solver is written in JavaScript with typed arrays. The other is written in C and compiled to WebAssembly. Both feed their height data into the same WebGL renderer, which draws the ocean, atmosphere, reflections, and sunlight.

That shared renderer is important. If one version used a simpler visual effect, its frame rate would say little about the simulation language. Keeping the rendering path identical leaves one meaningful variable: the cost of updating the water state.

## Why FPS Was the Wrong Metric

The first version displayed frames per second. Both implementations usually reported the same value because they used `requestAnimationFrame`. A browser schedules those callbacks around the display refresh rate, so two renderers on the same page naturally tend to report the same FPS.

Frame rate also combines several unrelated costs:

- Updating the height field
- Uploading simulation data to the GPU
- Running the WebGL shaders
- Compositing the page
- Waiting for the display refresh cycle

Most of those costs are identical in this comparison. Counting completed frames therefore hides the relatively small section we actually want to examine.

The improved benchmark times only the solver call. It reports a rolling average in microseconds per simulation step. Both progress bars use a fixed zero-to-500-microsecond scale, and values above 500 microseconds are marked red. A fixed scale makes the bars directly comparable over time; neither bar quietly rescales itself to make small changes appear dramatic.

## What the Solvers Do

Each solver maintains two arrays: surface height and vertical velocity. For every interior cell, it samples four neighboring heights and calculates a discrete Laplacian. That value approximates local surface curvature and accelerates the cell toward its neighbors.

Velocity damping removes energy over time, preventing ripples from oscillating forever. Pointer movement applies a localized impulse. The solver writes into separate next-state buffers so every cell in a step reads the same previous state. Updating the grid in place would create directional artifacts because later cells would read partially updated neighbors.

The JavaScript and C implementations use the same:

- Grid dimensions
- Initial conditions
- Wave coefficient
- Velocity damping
- Pointer radius and impulse strength
- Height and velocity limits
- Double-buffered update strategy

That parity matters more than the language labels. A faster algorithm will usually beat a slower algorithm regardless of whether it is implemented in JavaScript or WASM.

## Where WebAssembly Can Win

The solver is a favorable WASM workload. It performs predictable numeric work over contiguous memory with few branches and no DOM access. C compilers can optimize such loops aggressively, and WASM gives the browser a compact, typed instruction stream.

WASM becomes increasingly attractive when a workload has:

- Large numeric loops
- Stable memory layouts
- Existing C, C++, or Rust code
- Substantial computation per call
- Limited communication with JavaScript

The water grid is intentionally modest, so the absolute difference may be measured in tens or hundreds of microseconds. Increasing the grid size or running multiple substeps per frame would make solver cost more significant and may make the relative advantage clearer.

## Why WASM Does Not Automatically Win

Modern JavaScript engines optimize typed-array loops well. For a small grid, JavaScript can be surprisingly competitive. Calling across the JavaScript/WASM boundary also has a cost, although one call per complete simulation step keeps that overhead small.

Data movement can erase a WASM advantage. This demo allocates the height and velocity fields inside WASM memory and lets WebGL consume a view of the resulting height data. Copying large arrays back and forth on every step would produce a benchmark of memory transfer rather than numerical computation.

Results also vary by browser, CPU, power mode, background activity, and thermal state. A rolling browser measurement is useful for exploration, not a universal performance claim. Serious evaluation should include warm-up, repeated trials, multiple grid sizes, percentile timings, and several browsers and devices.

## The Practical Lesson

The strongest reason to use WebAssembly is not a belief that it makes every function faster. It is the ability to bring optimized systems-language code and predictable numeric workloads to the web while keeping the surrounding interface in JavaScript.

This water demo illustrates a sensible division of labor:

- JavaScript manages the page, input, animation scheduling, and presentation.
- JavaScript or C/WASM updates the simulation state.
- WebGL performs the shared, GPU-heavy rendering.

Measure the narrow operation you intend to optimize, keep every other part of the comparison identical, and report absolute time alongside relative speed. When WASM wins under those conditions, the result means something. When JavaScript is close—or faster—that result is equally valuable.
