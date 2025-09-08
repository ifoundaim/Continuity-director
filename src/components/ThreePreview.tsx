import React, { useEffect, useRef } from "react";
import * as THREE from "three";
// Orbit controls from three examples (works in browser only)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SceneModel } from "../lib/scene_model";

type Props = { model: SceneModel; width: number; height: number; onPick?: (id:string)=>void; onEditLabel?: (id:string, clientX:number, clientY:number)=>void; onDrag?: (id:string, cx:number, cy:number)=>void };

export default function ThreePreview({ model, width, height, onPick, onEditLabel, onDrag }: Props){
  const mountRef = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    if(!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1217);
    const camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height);
    mountRef.current.innerHTML = ""; // clear
    mountRef.current.appendChild(renderer.domElement);

    // simple lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.6); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(10,15,8); scene.add(dir);

    // room box (wireframe)
    const room = model.room;
    const roomGeo = new THREE.BoxGeometry(room.width, room.height, room.depth);
    const roomMat = new THREE.MeshBasicMaterial({ color:0x3a4255, wireframe:true });
    const roomMesh = new THREE.Mesh(roomGeo, roomMat);
    roomMesh.position.set(room.width/2, room.height/2, room.depth/2);
    scene.add(roomMesh);

    // grid on floor for orientation
    const grid = new THREE.GridHelper(Math.max(room.width, room.depth), Math.max(10, Math.max(room.width, room.depth)));
    grid.position.set(room.width/2, 0, room.depth/2);
    scene.add(grid);

    // helper: y is vertical; convert plan (cx,cy) to 3D (x,z)
    function addBox(x:number,y:number,z:number,w:number,h:number,d:number,color:number){
      const geo = new THREE.BoxGeometry(w,h,d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness:0.8, metalness:0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + w/2, y + h/2, z + d/2);
      scene.add(mesh);
      return mesh;
    }
    const toX = (ft:number)=> ft;
    const toZ = (ft:number)=> ft;

    const spriteGroup = new THREE.Group();
    scene.add(spriteGroup);

    function labelFor(text:string){
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const pad = 6; ctx.font = '12px ui-sans-serif';
      const textW = Math.ceil(ctx.measureText(text).width);
      canvas.width = textW + pad*2; canvas.height = 22;
      ctx.fillStyle = '#1b2333'; ctx.strokeStyle = '#2a3650'; ctx.lineWidth = 1;
      ctx.roundRect(0.5,0.5, canvas.width-1, canvas.height-1, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8ebf1'; ctx.font = '12px ui-sans-serif';
      ctx.fillText(text, pad, 14);
      const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent:true });
      const spr = new THREE.Sprite(mat);
      const scaleX = (canvas.width/100); const scaleY = (canvas.height/100);
      spr.scale.set(scaleX, scaleY, 1);
      return spr;
    }

    const pickables: THREE.Object3D[] = [];
    const idToMesh: Record<string, THREE.Object3D & { userData: any }> = {};
    const idToLabel: Record<string, THREE.Sprite & { userData: any }> = {};

    // objects
    for(const o of model.objects){
      const L = (o.layer||"floor");
      if (L === "wall"){
        const h = o.h || 1; const mount = o.mount_h || (h/2);
        const y = mount - h/2;
        const w = o.w||0.2; const d = (o.d||0.2);
        let mx = toX(o.cx - w/2), mz = toZ(o.cy - d/2);
        const m = addBox(mx, y, mz, w, h, d, 0x6b88ff);
        (m as any).userData = { ...(m as any).userData, id: o.id, layer: L, w, d, h, baseY: y };
        idToMesh[o.id] = m as any; pickables.push(m);
        const label = labelFor(o.label || o.kind);
        label.position.set(toX(o.cx), y + h + 0.4, toZ(o.cy)); spriteGroup.add(label);
        (label as any).userData = { id: o.id }; idToLabel[o.id] = label as any; pickables.push(label);
      } else if (L === "ceiling"){
        const w = o.w||1, d = o.d||1, h = o.h||0.2;
        const y = (room.height - (h));
        const m = addBox(toX(o.cx - w/2), y, toZ(o.cy - d/2), w, h, d, 0xfff0aa);
        (m as any).userData = { ...(m as any).userData, id: o.id, layer: L, w, d, h, baseY: y };
        idToMesh[o.id] = m as any; pickables.push(m);
        const label = labelFor(o.label || o.kind);
        label.position.set(toX(o.cx), y + h + 0.4, toZ(o.cy)); spriteGroup.add(label);
        (label as any).userData = { id: o.id }; idToLabel[o.id] = label as any; pickables.push(label);
      } else if (L === "surface"){
        const w = o.w||0.5, d = o.d||0.5, h = o.h||0.2;
        const y = 2.5; // approx tabletop
        const m = addBox(toX(o.cx - w/2), y, toZ(o.cy - d/2), w, h, d, 0x90e0c6);
        (m as any).userData = { ...(m as any).userData, id: o.id, layer: L, w, d, h, baseY: y };
        idToMesh[o.id] = m as any; pickables.push(m);
        const label = labelFor(o.label || o.kind);
        label.position.set(toX(o.cx), y + h + 0.4, toZ(o.cy)); spriteGroup.add(label);
        (label as any).userData = { id: o.id }; idToLabel[o.id] = label as any; pickables.push(label);
      } else {
        // floor objects
        const w = o.w||1, d = o.d||1, h = o.h||1;
        const y = 0; const mesh = addBox(toX(o.cx - w/2), y, toZ(o.cy - d/2), w, h, d, 0x7aa2ff);
        (mesh as any).userData = { ...(mesh as any).userData, id: o.id, layer: L, w, d, h, baseY: y };
        idToMesh[o.id] = mesh as any; pickables.push(mesh);
        const label = labelFor(o.label || o.kind);
        label.position.set(toX(o.cx), y + h + 0.4, toZ(o.cy)); spriteGroup.add(label);
        (label as any).userData = { id: o.id }; idToLabel[o.id] = label as any; pickables.push(label);
      }
    }

    // camera positioning
    camera.position.set(room.width*0.8, room.height*0.9, room.depth*1.2);
    camera.lookAt(new THREE.Vector3(room.width/2, room.height/3, room.depth/2));

    // orbit controls for navigation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(room.width/2, 1.2, room.depth/2);
    controls.minDistance = 6;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI/2 - 0.05; // stay above the floor

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let draggingId: string | null = null;
    let lastDragCx = 0, lastDragCy = 0;
    const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0); // y=0
    const surfacePlane = new THREE.Plane(new THREE.Vector3(0,1,0), -2.5); // y=2.5
    function setMouse(ev: MouseEvent){
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function onClick(ev: MouseEvent){
      setMouse(ev);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pickables, true);
      if(intersects.length){
        let obj: any = intersects[0].object; let id: string | null = null;
        while(obj){ if (obj.userData && obj.userData.id){ id = String(obj.userData.id); break; } obj = obj.parent; }
        if (id && onPick) onPick(id);
      }
    }
    function onDblClick(ev: MouseEvent){
      setMouse(ev);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pickables, true);
      if(intersects.length){
        let obj: any = intersects[0].object; let id: string | null = null; let isLabel = false;
        if (obj instanceof THREE.Sprite) isLabel = true;
        while(obj){ if (obj.userData && obj.userData.id){ id = String(obj.userData.id); break; } obj = obj.parent; }
        if (isLabel && id && onEditLabel) onEditLabel(id, ev.clientX, ev.clientY);
      }
    }
    function onMouseDown(ev: MouseEvent){
      setMouse(ev);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pickables, true);
      if(intersects.length){
        let obj: any = intersects[0].object; let id: string | null = null;
        while(obj){ if (obj.userData && obj.userData.id){ id = String(obj.userData.id); break; } obj = obj.parent; }
        if (id && idToMesh[id]){ draggingId = id; (controls as any).enabled = false; }
      }
    }
    function onMouseMove(ev: MouseEvent){
      if (!draggingId) return;
      setMouse(ev); raycaster.setFromCamera(mouse, camera);
      const mesh = idToMesh[draggingId]; if(!mesh) return;
      const layer = (mesh as any).userData.layer as string;
      const plane = (layer === "surface") ? surfacePlane : groundPlane;
      const pt = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, pt);
      // clamp into room bounds
      lastDragCx = Math.max(0, Math.min(room.width, pt.x));
      lastDragCy = Math.max(0, Math.min(room.depth, pt.z));
      const w = (mesh as any).userData.w || 1; const d = (mesh as any).userData.d || 1; const h = (mesh as any).userData.h || 1; const y = (mesh as any).userData.baseY || 0;
      mesh.position.set(lastDragCx, y + h/2, lastDragCy);
      const label = idToLabel[draggingId]; if(label){ label.position.set(lastDragCx, y + h + 0.4, lastDragCy); }
    }
    function onMouseUp(){
      if (draggingId){ if (onDrag) onDrag(draggingId, lastDragCx, lastDragCy); draggingId = null; (controls as any).enabled = true; }
    }
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('dblclick', onDblClick);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const animate = ()=>{ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    // handle resize if parent re-renders with new size
    function onResize(){
      camera.aspect = width/height; camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);

    return ()=>{ renderer.domElement.removeEventListener('click', onClick); renderer.domElement.removeEventListener('dblclick', onDblClick); renderer.domElement.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); window.removeEventListener("resize", onResize); controls.dispose(); renderer.dispose(); };
  }, [model, width, height]);

  return <div ref={mountRef} style={{ width, height }} />;
}


