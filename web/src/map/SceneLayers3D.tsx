import { useEffect, useMemo, useState } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Conflict, Fleet, Lane, MapDetail, MapImage, Point2, Robot, RobotState, TrafficState, Waypoint, Zone } from "../api/types";
import type { LayerKey } from "../store/world";
import { centroid, WP_COLOR } from "./geometry";

export const scenePoint = ([x, y]: Point2, h = 0): [number, number, number] => [x, h, -y];

// 标签使用精灵而不是 DOM 覆盖层，切换地图或卸载画布时随纹理一起释放。
export function SceneLabel({ name, position, size = 0.42, borderColor }: { name: string; position: [number, number, number]; size?: number; borderColor?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
    context.font = "bold 24px sans-serif";
    canvas.width = Math.ceil(context.measureText(name).width) + 24;
    canvas.height = 40;
    context.fillStyle = "rgba(9,18,28,0.88)"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = borderColor ?? "#7892a8"; context.lineWidth = borderColor ? 4 : 1;
    context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, canvas.width - context.lineWidth, canvas.height - context.lineWidth);
    context.fillStyle = "white"; context.font = "bold 24px sans-serif"; context.textBaseline = "middle"; context.fillText(name, 12, 20);
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace; return result;
  }, [name, borderColor]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={position} scale={[Math.max(size * 2, texture.image.width / 40 * size), size, 1]} raycast={() => null} renderOrder={10}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>;
}

function MapBackground({ image }: { image: MapImage }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    const loader = new THREE.TextureLoader();
    let loaded: THREE.Texture | undefined;
    setTexture(null);
    // 异步加载可能在地图切换后完成，失效纹理仍需释放。
    loader.load(image.url, (tex) => {
      loaded = tex;
      if (!active) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; setTexture(tex);
    }, undefined, () => { if (active) setTexture(null); });
    return () => { active = false; loaded?.dispose(); };
  }, [image.url]);
  if (!texture) return null;
  const w = image.width_px * image.resolution, h = image.height_px * image.resolution;
  return <group position={[image.origin[0], 0.002, -image.origin[1]]} rotation-y={image.origin[2] || 0}>
    <mesh rotation-x={-Math.PI / 2} position={[w / 2, 0, -h / 2]} raycast={() => null}><planeGeometry args={[w, h]} /><meshBasicMaterial map={texture} opacity={image.opacity} transparent depthWrite={false} /></mesh>
  </group>;
}

const zoneColors: Record<string, string> = { receiving: "#38bdf8", storage: "#a78bfa", charging: "#34d399", loading: "#2dd4bf", restricted: "#ef4444", no_fly: "#fbbf24", slow: "#60a5fa", pickup: "#38bdf8", dropoff: "#a78bfa", fleet_boundary: "#94a3b8", custom: "#94a3b8" };
function Zone3D({ zone, labels }: { zone: Zone; labels: boolean }) {
  const geometry = useMemo(() => {
    if (zone.polygon.length < 3) return null;
    const s = new THREE.Shape(); s.moveTo(...zone.polygon[0]); zone.polygon.slice(1).forEach(([x,y]) => s.lineTo(x,y)); s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [zone.polygon]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  const color = zoneColors[zone.type] ?? zoneColors.custom, center = centroid(zone.polygon);
  return <group>
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={0.012} raycast={() => null}><meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <Line points={[...zone.polygon, zone.polygon[0]].map(p => scenePoint(p, 0.025))} color={color} transparent opacity={0.8} lineWidth={1.5} />
    {labels && <SceneLabel name={zone.name} position={scenePoint(center, 0.55)} size={0.5} />}
  </group>;
}

function Lane3D({ lane, a, b, labels }: { lane: Lane; a: Waypoint; b: Waypoint; labels: boolean }) {
  // 优先使用空中通道的高度；未提供时使用两端路径点高度作为显示参考。
  const air = lane.layer === "air", h = air ? lane.altitude ?? Math.max(a.z, b.z) : 0.045;
  const color = lane.closed ? "#f87171" : air ? "#e8b955" : "#71b9d1";
  const start = scenePoint([a.x, a.y], h), end = scenePoint([b.x, b.y], h);
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  return <group>
    <Line points={[start, end]} color={color} lineWidth={air ? 1.3 : 1.5} dashed={air || lane.closed} dashSize={0.45} gapSize={0.3} />
    {!lane.bidirectional && length > 0.01 && <mesh position={[(a.x+b.x)/2,h+0.04,-(a.y+b.y)/2]} rotation={[0, Math.atan2(dy,dx), -Math.PI/2]}><coneGeometry args={[0.16,0.4,4]} /><meshBasicMaterial color={color} /></mesh>}
    {air && labels && lane.altitude != null && <SceneLabel name={`${lane.altitude} m`} position={[(a.x+b.x)/2,h+0.4,-(a.y+b.y)/2]} size={0.3} />}
  </group>;
}

interface Props {
  map: MapDetail; layers: Record<LayerKey, boolean>; robots: Record<string, Robot>; fleets: Record<string, Fleet>;
  states: Record<string, RobotState>; traffic: TrafficState; trails: Record<string, Point2[]>;
  flashes: { conflict: Conflict; at: number }[]; selectedWaypoint: string | null; onWaypoint: (id: string) => void;
}
export function SceneLayers3D({ map, layers, robots, fleets, states, traffic, trails, flashes, selectedWaypoint, onWaypoint }: Props) {
  const wp = useMemo(() => Object.fromEntries(map.waypoints.map(w => [w.id,w])), [map.waypoints]);
  const lanes = useMemo(() => Object.fromEntries(map.lanes.map(l => [l.id,l])), [map.lanes]);
  const colorOf = (id: string) => fleets[robots[id]?.fleet_id]?.color ?? "#94a3b8";
  // 同一冲突可能同时出现在实时交通状态和短暂提示中，按 ID 合并。
  const visibleConflicts = new Map<string, Conflict>();
  for (const c of traffic.conflicts) if (c.map_id === map.id && c.status !== "resolved") visibleConflicts.set(c.id, c);
  for (const f of flashes) if (f.conflict.map_id === map.id && Date.now() - f.at < 12000) visibleConflicts.set(f.conflict.id, f.conflict);
  return <>
    {layers.image && map.image && <MapBackground image={map.image} />}
    {layers.zones && map.zones.filter(z => z.type !== "no_fly" || layers.airLanes).map(z => <Zone3D key={z.id} zone={z} labels={layers.labels} />)}
    {map.lanes.filter(l => l.layer === "air" ? layers.airLanes : layers.lanes).map(l => wp[l.from_id] && wp[l.to_id] && <Lane3D key={l.id} lane={l} a={wp[l.from_id]} b={wp[l.to_id]} labels={layers.labels} />)}
    {layers.waypoints && map.waypoints.filter(w => w.layer !== "air" || layers.airLanes).map(w => {
      const color = WP_COLOR[w.type] ?? WP_COLOR.location, h = w.layer === "air" ? w.z : 0.07;
      const selected = selectedWaypoint === w.id;
      return <group key={w.id} position={scenePoint([w.x,w.y],h)} onClick={e => { e.stopPropagation(); onWaypoint(w.id); }}>
        <mesh position-y={0.12}><sphereGeometry args={[0.34, 8, 6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[selected ? 0.27 : 0.13, selected ? 0.38 : 0.24, 16]} /><meshBasicMaterial color={selected ? "white" : color} side={THREE.DoubleSide} /></mesh>
        <mesh position-y={0.1}><cylinderGeometry args={[0.12,0.12,0.2,10]} /><meshBasicMaterial color={color} /></mesh>
        {(selected || (layers.labels && w.type !== "intersection")) && <SceneLabel name={w.name} position={[0,0.55,0]} size={0.35} />}
      </group>;
    })}
    {layers.trails && Object.entries(trails).map(([id,pts]) => states[id]?.map_id === map.id && pts.length > 1 && <Line key={`trail-${id}`} points={pts.map(p => scenePoint(p,0.06))} color={colorOf(id)} transparent opacity={0.5} lineWidth={1.5} />)}
    {layers.reservations && traffic.reservations.filter(r => r.map_id === map.id).map((r,i) => {
      const lane = lanes[r.element_id], a = lane && wp[lane.from_id], b = lane && wp[lane.to_id], node = wp[r.element_id], color = colorOf(r.robot_id);
      if (r.kind === "lane" && a && b) { const h = lane.layer === "air" ? lane.altitude ?? Math.max(a.z,b.z) : 0.09; return <Line key={`r${i}`} points={[scenePoint([a.x,a.y],h),scenePoint([b.x,b.y],h)]} color={color} lineWidth={4} transparent opacity={0.8} />; }
      if (r.kind === "node" && node) return <mesh key={`r${i}`} position={scenePoint([node.x,node.y],(node.layer === "air" ? node.z : 0) + 0.1)} rotation-x={-Math.PI/2}><ringGeometry args={[0.4,0.55,20]} /><meshBasicMaterial color={color} side={THREE.DoubleSide} /></mesh>;
      return null;
    })}
    {layers.conflicts && traffic.waits.map(w => { const a=states[w.robot_id], b=w.holder && states[w.holder]; return a && b && a.map_id === map.id && b.map_id === map.id ? <Line key={`wait-${w.robot_id}`} points={[scenePoint([a.pose.x,a.pose.y],a.pose.z+0.2),scenePoint([b.pose.x,b.pose.y],b.pose.z+0.2)]} color="#fbbf24" dashed dashSize={0.3} gapSize={0.2} /> : null; })}
    {layers.conflicts && [...visibleConflicts.values()].map(c => <group key={c.id} position={scenePoint(c.point,0.2)}><mesh rotation-x={-Math.PI/2}><ringGeometry args={[0.5,0.7,24]} /><meshBasicMaterial color="#fb923c" side={THREE.DoubleSide} /></mesh><SceneLabel name={`⚠ ${c.location_name || c.kind}`} position={[0,0.65,0]} size={0.5} /></group>)}
  </>;
}
