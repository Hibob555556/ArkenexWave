const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D heightMap;
uniform float time;
uniform vec2 resolution;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
}
float fbm(vec2 p) {
  float f=0.0, a=0.5;
  for(int i=0;i<5;i++){ f+=a*noise(p); p=mat2(.8,-.6,.6,.8)*p*2.03+7.1; a*=.5; }
  return f;
}
float sea(vec2 p) {
  vec2 drift=vec2(time*.024,-time*.015);
  float broad=(fbm(p*.18+drift)-.5)*.42;
  float medium=(fbm(p*.55-drift*.7)-.5)*.16;
  return broad+medium;
}
vec3 sky(vec3 r) {
  vec3 horizon=vec3(.52,.70,.82), zenith=vec3(.035,.13,.27);
  vec3 c=mix(horizon,zenith,pow(clamp(r.y,0.0,1.0),.55));
  vec3 sunDir=normalize(vec3(-.38,.34,.86));
  float sun=pow(max(dot(r,sunDir),0.0),900.0);
  float glow=pow(max(dot(r,sunDir),0.0),18.0);
  c+=vec3(1.0,.72,.39)*sun*5.0+vec3(1.0,.55,.24)*glow*.18;
  float clouds=smoothstep(.55,.75,fbm(r.xz*3.0/max(r.y+.25,.18)+vec2(time*.006,0)));
  c=mix(c,vec3(.82,.86,.88),clouds*.38*smoothstep(.02,.35,r.y));
  return c;
}
void main(){
  float aspect=resolution.x/resolution.y;
  vec2 q=(uv*2.0-1.0)*vec2(aspect,1.0);
  vec3 ray=normalize(vec3(q.x*.72,q.y-.22,1.35));
  if(ray.y>=0.0){
    vec3 c=sky(ray);
    c=pow(c/(c+.65),vec3(.9));
    gl_FragColor=vec4(c,1.0); return;
  }
  float rawDistance=1.15/max(-ray.y,.018);
  float distance=min(rawDistance,32.0);
  vec2 p=ray.xz*distance;
  float eps=mix(.025,.16,smoothstep(3.0,25.0,distance));
  float h=sea(p);
  vec2 grad=vec2(sea(p+vec2(eps,0.0))-sea(p-vec2(eps,0.0)),sea(p+vec2(0.0,eps))-sea(p-vec2(0.0,eps)))/(2.0*eps);
  vec2 texel=vec2(1.0/140.0,1.0/84.0);
  vec2 simUv=vec2(p.x/20.0+.5,p.y/32.0);
  vec2 inside=step(vec2(0.0),simUv)*step(simUv,vec2(1.0));
  vec2 sim=vec2(texture2D(heightMap,simUv-vec2(texel.x,0.0)).r-texture2D(heightMap,simUv+vec2(texel.x,0.0)).r,
                texture2D(heightMap,simUv-vec2(0.0,texel.y)).r-texture2D(heightMap,simUv+vec2(0.0,texel.y)).r)*inside.x*inside.y;
  grad+=sim*1.35;
  float horizonWaveFade=smoothstep(.012,.105,-ray.y);
  grad*=horizonWaveFade;
  vec3 n=normalize(vec3(-grad.x,1.0,-grad.y));
  vec3 reflected=reflect(ray,n); reflected.y=abs(reflected.y);
  float fresnel=.025+.975*pow(1.0-max(dot(n,-ray),0.0),5.0);
  vec3 water=mix(vec3(.005,.055,.075),vec3(.01,.16,.19),clamp(n.y*.55+h*.28,0.0,1.0));
  vec3 c=mix(water,sky(reflected),fresnel*.88+.08);
  vec3 sunDir=normalize(vec3(-.38,.34,.86));
  float spec=pow(max(dot(reflect(ray,n),sunDir),0.0),260.0);
  c+=vec3(1.0,.78,.48)*spec*3.2;
  float haze=smoothstep(7.0,30.0,distance);
  vec3 horizonColor=sky(normalize(vec3(ray.x,.012,ray.z)));
  c=mix(c,horizonColor,haze*.72);
  float horizonBlend=smoothstep(.008,.055,-ray.y);
  c=mix(horizonColor,c,horizonBlend);
  c*=1.0-dot(uv-.5,uv-.5)*.18;
  c=pow(c/(c+.62),vec3(.88));
  gl_FragColor=vec4(c,1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function createWaterVisuals(ctx, cols, rows) {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL is required for the water renderer.');
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const encoded = new Uint8Array(cols * rows);
  const timeLocation = gl.getUniformLocation(program, 'time');
  const resolutionLocation = gl.getUniformLocation(program, 'resolution');
  gl.uniform1i(gl.getUniformLocation(program, 'heightMap'), 0);

  return function render(field, width, height, now) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    if (surface.width !== w || surface.height !== h) {
      surface.width = w;
      surface.height = h;
      gl.viewport(0, 0, w, h);
    }
    for (let i = 0; i < encoded.length; i += 1) encoded[i] = Math.max(0, Math.min(255, 128 + field[i] * 1800));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, encoded);
    gl.uniform1f(timeLocation, now * 0.001);
    gl.uniform2f(resolutionLocation, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(surface, 0, 0, width, height);
  };
}
