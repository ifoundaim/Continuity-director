// Very light pinhole camera helpers for top-down (room in ft)
// Coordinates: X=width (0..room.width), Y=depth (0..room.depth), Z=height (0..room.height)
export type CameraPose = {
  pos: { x:number; y:number; z:number };      // camera position in ft
  lookAt: { x:number; y:number; z:number };   // target point in ft
  up?: { x:number; y:number; z:number };      // default (0,0,1)
  fovDeg: number;                              // vertical FOV
  imgW: number; imgH: number;                 // output plate size
};

export function normalize(v:{x:number;y:number;z:number}){ const l=Math.hypot(v.x,v.y,v.z)||1; return {x:v.x/l,y:v.y/l,z:v.z/l}; }
export function sub(a:any,b:any){ return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}; }
export function cross(a:any,b:any){ return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}; }
export function dot(a:any,b:any){ return a.x*b.x+a.y*b.y+a.z*b.z; }

export function viewProj(cam: CameraPose){
  const up = cam.up ?? {x:0,y:0,z:1};
  const f = normalize(sub(cam.lookAt, cam.pos));          // forward
  const s = normalize(cross(f, up));                       // right
  const u = cross(s, f);                                   // true up
  const V = { s, u, f, pos:cam.pos };

  const fov = cam.fovDeg*Math.PI/180;
  const fy = 1/Math.tan(fov/2);
  const aspect = cam.imgW/cam.imgH;
  const fx = fy*aspect;
  return { V, fx, fy, aspect };
}

// World (ft) -> image px. Returns null if behind camera.
export function projectPt(cam: CameraPose, W:{x:number;y:number;z:number}){
  const { V, fx, fy } = viewProj(cam);
  // move to camera space
  const r = V.s, u = V.u, f = V.f, p=V.pos;
  const dx = W.x - p.x, dy = W.y - p.y, dz = W.z - p.z;
  const xc = dot({x:dx,y:dy,z:dz}, r);
  const yc = dot({x:dx,y:dy,z:dz}, u);
  const zc = dot({x:dx,y:dy,z:dz}, f);
  if (zc <= 0.1) return null; // behind or too close
  const xndc = (fx * (xc/zc));
  const yndc = (fy * (yc/zc));
  // map to px (0,0 top-left)
  const xpx = cam.imgW/2 + xndc * cam.imgW/2;
  const ypx = cam.imgH/2 - yndc * cam.imgH/2;
  return { x:xpx, y:ypx, z:zc };
}


