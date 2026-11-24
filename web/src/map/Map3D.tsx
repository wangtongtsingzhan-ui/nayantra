import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Conflict, Fleet, MapDetail, Point2, Robot, RobotState, TrafficState } from "../api/types";
import type { LayerKey } from "../store/world";
import type { MapControl } from "./MapView";
import { robotRadius, wrapAngle } from "./geometry";
import { SceneLabel, SceneLayers3D } from "./SceneLayers3D";
import { RobotModel3D } from "./RobotModels3D";
import { MODE_META } from "../lib/format";
import { translateUI } from "../lib/language";
import { RobotEffects3D } from "./RobotEffects3D";
import { FlowingPath3D } from "./FlowingPath3D";
import { robotVisualState } from "./robotVisualState";
import { assignRouteColors } from "./routeColors";

interface Props {
  map: MapDetail;
  robots: Record<string, Robot>;
  states: Record<string, RobotState>;
  fleets: Record<string, Fleet>;
  traffic: TrafficState;
  trails: Record<string, Point2[]>;
  flashes: { conflict: Conflict; at: number }[];
  selectedWaypoint: string | null;
  onWaypoint: (id: string) => void;
  onCursor: (point: Point2 | null) => void;
  selected: string[];
  layers: Record<LayerKey, boolean>;
  theme: "dark" | "light";
  connected: boolean;
  control: React.MutableRefObject<MapControl | null>;
  onSelect: (id: string, additive: boolean) => void;
}

// 地图的 x/y 平面对应三维场景的 x/-z 平面，地图高度 z 对应场景的 y。
const point = ([x, y]: Point2, height = 0): [number, number, number] => [x, height, -y];

function Obstacle({ polygon }: { polygon: Point2[] }) {
  const geometry = useMemo(() => {
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0][0], polygon[0][1]);
    polygon.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false });
  }, [polygon]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh geometry={geometry} rotation-x={-Math.PI / 2} castShadow receiveShadow><meshStandardMaterial color="#53677c" roughness={0.8} /></mesh>;
}

function Wall({ a, b }: { a: Point2; b: Point2 }) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  return <mesh position={[(a[0] + b[0]) / 2, 0.65, -(a[1] + b[1]) / 2]} rotation-y={Math.atan2(dy, dx)} castShadow receiveShadow>
    <boxGeometry args={[length, 1.3, 0.12]} /><meshStandardMaterial color="#97a9bc" />
  </mesh>;
}

function colorFor(state: RobotState) {
  if (state.e_stop || state.mode === "emergency_stop" || state.mode === "error") return "#f87171";
  if (!state.online || state.mode === "offline") return "#8493a3";
  if (state.charging || state.mode === "charging") return "#60a5fa";
  if (state.mode === "waiting" || state.mode === "paused") return "#fbbf24";
  if (state.mode === "moving" || state.mode === "acting") return "#34d399";
  return "#e5c75a";
}

function Robot3D({ robot, state, selected, labels, onSelect, animated, routeColor }: { robot: Robot; state: RobotState; selected: boolean; labels: boolean; onSelect: Props["onSelect"]; animated: boolean; routeColor?: string }) {
  const group = useRef<THREE.Group>(null!);
  const target = useRef(state.pose);
  target.current = state.pose;
  const initial = useRef(state.pose);
  const radius = Math.max(0.3, robotRadius(robot));
  const color = colorFor(state);
  const status = robotVisualState(state);
  const mode = state.e_stop ? "emergency_stop" : state.mode === "emergency_stop" || state.mode === "error" ? state.mode : !state.online ? "offline" : state.charging ? "charging" : state.mode;
  const details = `${robot.name} · ${translateUI(MODE_META[mode].label)}${state.battery_pct == null ? "" : ` · ${Math.round(state.battery_pct)}%`}${state.current_task_id ? ` · ${state.current_task_id}` : ""}`;
  const showStatus = status !== "idle" && status !== "offline" && (status !== "moving" || Boolean(state.current_task_id));
  const statusText = `${translateUI(MODE_META[mode].label)}${status === "charging" && state.battery_pct != null ? ` · ${Math.round(state.battery_pct)}%` : ""}${status !== "error" && state.current_task_id && status !== "charging" ? ` · ${state.current_task_id}` : ""}`;
  const moving = animated && status === "moving" && Math.hypot(state.velocity.linear, state.velocity.vertical, state.velocity.angular) > 0.02;
  useFrame((_, dt) => {
    const g = group.current, p = target.current;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    // 大幅跳变通常来自重定位或重新同步，直接到达新位置；普通遥测则平滑过渡。
    if (Math.hypot(g.position.x - p.x, g.position.z + p.y) > 4) g.position.set(p.x, p.z, -p.y);
    else {
      g.position.x += (p.x - g.position.x) * k;
      g.position.y += (p.z - g.position.y) * k;
      g.position.z += (-p.y - g.position.z) * k;
    }
    g.rotation.y += wrapAngle(p.yaw - g.rotation.y) * k;
  });
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(robot.id, e.shiftKey || e.ctrlKey || e.metaKey); };
  return <group ref={group} position={[initial.current.x, initial.current.z, -initial.current.y]} rotation-y={initial.current.yaw} onClick={click}>
    <RobotModel3D type={robot.effective.robot_type} radius={radius} color={color} moving={moving} />
    <RobotEffects3D status={status} radius={radius} animated={animated} />
    {selected && <mesh rotation-x={-Math.PI / 2} position-y={0.025}><ringGeometry args={[radius * 1.18, radius * 1.28, 32]} /><meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} /></mesh>}
    {(labels || selected) && <SceneLabel name={selected ? details : robot.name} position={[0, Math.max(1.1, radius * 2.8), 0]} size={0.45} borderColor={routeColor} />}
    {labels && !selected && showStatus && <SceneLabel name={statusText} position={[0, Math.max(1.1, radius * 2.8) + 0.55, 0]} size={0.38} />}
  </group>;
}

function CameraControls({ map, states, control }: { map: MapDetail; states: Props["states"]; control: Props["control"] }) {
  const ref = useRef<OrbitControlsImpl>(null!);
  const { camera, size } = useThree();
  const currentData = useRef({ map, states, size });
  currentData.current = { map, states, size };
  useEffect(() => {
    const fit = () => {
      // 先清除旋转惯性，避免重置视角后继续漂移或倾斜。
      const controls = ref.current;
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      const { map: activeMap, states: activeStates, size: viewport } = currentData.current;
      const bounds = { ...activeMap.bounds };
      let maxHeight = 2;
      const include = (x: number, y: number) => {
        bounds.min_x = Math.min(bounds.min_x, x); bounds.max_x = Math.max(bounds.max_x, x);
        bounds.min_y = Math.min(bounds.min_y, y); bounds.max_y = Math.max(bounds.max_y, y);
      };
      activeMap.walls.concat(activeMap.obstacles, activeMap.zones.map((zone) => zone.polygon)).forEach((poly) => poly.forEach(([x, y]) => include(x, y)));
      activeMap.waypoints.forEach((wp) => { include(wp.x, wp.y); maxHeight = Math.max(maxHeight, wp.z + 1); });
      activeMap.lanes.forEach((lane) => { if (lane.altitude != null) maxHeight = Math.max(maxHeight, lane.altitude + 1); });
      Object.values(activeStates).filter((state) => state.map_id === activeMap.id).forEach((state) => {
        include(state.pose.x, state.pose.y); maxHeight = Math.max(maxHeight, state.pose.z + 3);
        state.path.forEach(([x, y]) => include(x, y));
      });
      if (activeMap.image) {
        const image = activeMap.image, [x, y, yaw = 0] = image.origin;
        const w = image.width_px * image.resolution, h = image.height_px * image.resolution;
        [[0, 0], [w, 0], [0, h], [w, h]].forEach(([dx, dy]) => include(x + dx * Math.cos(yaw) - dy * Math.sin(yaw), y + dx * Math.sin(yaw) + dy * Math.cos(yaw)));
      }
      const cx = (bounds.min_x + bounds.max_x) / 2, cz = -(bounds.min_y + bounds.max_y) / 2;
      const aspect = viewport.width / Math.max(viewport.height, 1);
      const perspective = camera as THREE.PerspectiveCamera;
      const angle = THREE.MathUtils.degToRad(50);
      const sin = Math.sin(angle), cos = Math.cos(angle), targetHeight = maxHeight / 2;
      const tanV = Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2));
      const tanH = tanV * aspect;
      // 将场景包围盒的八个角纳入透视视锥，同时覆盖前景地面与高处空中通道。
      let distance = 5;
      for (const x of [bounds.min_x, bounds.max_x]) {
        for (const z of [-bounds.max_y, -bounds.min_y]) {
          for (const y of [0, maxHeight]) {
            const dz = z - cz, dy = y - targetHeight;
            const towardCamera = dy * cos + dz * sin;
            const screenY = dy * sin - dz * cos;
            distance = Math.max(distance, towardCamera + Math.abs(x - cx) / tanH, towardCamera + Math.abs(screenY) / tanV);
          }
        }
      }
      distance *= 1.12;
      perspective.far = Math.max(3000, distance * 3);
      perspective.updateProjectionMatrix();
      camera.position.set(cx, targetHeight + distance * cos, cz + distance * sin);
      controls.target.set(cx, targetHeight, cz);
      controls.update();
      controls.enableDamping = damping;
    };
    fit();
    const current: MapControl = {
      fit,
      zoom: (factor) => { camera.position.sub(ref.current.target).multiplyScalar(factor).add(ref.current.target); ref.current.update(); },
      centerOn: (x, y) => { const next = new THREE.Vector3(x, 0, -y); camera.position.add(next.clone().sub(ref.current.target)); ref.current.target.copy(next); ref.current.update(); },
    };
    control.current = current;
    return () => { if (control.current === current) control.current = null; };
  }, [camera, control, map.id]);
  return <OrbitControls ref={ref} enableDamping maxPolarAngle={Math.PI / 2.05} minDistance={2} />;
}

function Scene({ map, robots, states, fleets, traffic, trails, flashes, selected, selectedWaypoint, onWaypoint, onCursor, layers, control, onSelect, theme, connected, reducedMotion }: Props & { reducedMotion: boolean }) {
  const b = map.bounds;
  const width = Math.max(0.01, b.max_x - b.min_x), depth = Math.max(0.01, b.max_y - b.min_y);
  const onMap = Object.values(states).filter((s) => s.map_id === map.id && robots[s.robot_id]);
  // 颜色在当前三维视图会话内保持稳定，不随任务状态或实时遥测变化。
  const assignedColors = useRef(new Map<string, string>());
  const routeColors = assignRouteColors(Object.keys(robots), assignedColors.current);
  const gridStep = Math.max(2, Math.ceil(Math.max(width, depth) / 100));
  const grid: React.ReactNode[] = [];
  if (layers.grid) {
    for (let x = Math.ceil(b.min_x / gridStep) * gridStep; x <= b.max_x; x += gridStep)
      grid.push(<Line key={`x${x}`} points={[[x, 0.005, -b.min_y], [x, 0.005, -b.max_y]]} color={theme === "light" ? "#aabac7" : "#405568"} />);
    for (let y = Math.ceil(b.min_y / gridStep) * gridStep; y <= b.max_y; y += gridStep)
      grid.push(<Line key={`y${y}`} points={[[b.min_x, 0.005, -y], [b.max_x, 0.005, -y]]} color={theme === "light" ? "#aabac7" : "#405568"} />);
  }
  return <>
    <color attach="background" args={[theme === "light" ? "#f1f1f4" : "#000000"]} />
    <ambientLight intensity={1.1} /><hemisphereLight args={["#d7eaff", "#384354", 1.3]} />
    <directionalLight position={[b.min_x + width * 0.4, Math.max(width, depth), -b.min_y]} intensity={2} />
    <mesh position={[(b.min_x + b.max_x) / 2, -0.06, -(b.min_y + b.max_y) / 2]} receiveShadow><boxGeometry args={[width, 0.1, depth]} /><meshStandardMaterial color={theme === "light" ? "#d5dfe6" : "#263747"} roughness={0.9} /></mesh>
    <Line points={[[b.min_x, 0.01, -b.min_y], [b.max_x, 0.01, -b.min_y], [b.max_x, 0.01, -b.max_y], [b.min_x, 0.01, -b.max_y], [b.min_x, 0.01, -b.min_y]]} color="#7c9db6" />
    {grid}
    <mesh rotation-x={-Math.PI / 2} position={[(b.min_x + b.max_x) / 2, 0.001, -(b.min_y + b.max_y) / 2]} onPointerMove={e => onCursor([e.point.x, -e.point.z])} onPointerOut={() => onCursor(null)}><planeGeometry args={[width, depth]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <SceneLayers3D map={map} layers={layers} robots={robots} fleets={fleets} states={states} traffic={traffic} trails={trails} flashes={flashes} selectedWaypoint={selectedWaypoint} onWaypoint={onWaypoint} />
    {layers.walls && <>{map.walls.flatMap((wall, i) => wall.slice(1).map((p, j) => <Wall key={`${i}-${j}`} a={wall[j]} b={p} />))}{map.obstacles.map((polygon, i) => <Obstacle key={i} polygon={polygon} />)}</>}
    {layers.paths && onMap.map((s) => {
      if (!s.path.length) return null;
      // Core 的路径点只有二维坐标；空中路径暂以当前报告高度呈现，不代表真实三维航迹。
      const height = robots[s.robot_id].effective.layer === "air" ? Math.max(s.pose.z, 0.08) : 0.08;
      const end = s.path[s.path.length - 1];
      const routeColor = routeColors.get(s.robot_id) ?? "#20bfa9";
      return <group key={`path-${s.robot_id}`}><Line points={[[s.pose.x, height, -s.pose.y], ...s.path.map((p) => point(p, height))]} color={routeColor} lineWidth={2} /><mesh position={point(end, height)} rotation-x={-Math.PI / 2}><ringGeometry args={[0.25, 0.36, 16]} /><meshBasicMaterial color={routeColor} side={THREE.DoubleSide} /></mesh>{robotVisualState(s) === "moving" && <FlowingPath3D points={[[s.pose.x, s.pose.y], ...s.path]} height={height} color={routeColor} animated={connected && !reducedMotion} />}</group>;
    })}
    {layers.robots && onMap.map((s) => <Robot3D key={s.robot_id} robot={robots[s.robot_id]} state={s} selected={selected.includes(s.robot_id)} labels={layers.labels} onSelect={onSelect} animated={connected && !reducedMotion} routeColor={layers.paths && s.path.length ? routeColors.get(s.robot_id) : undefined} />)}
    <CameraControls map={map} states={states} control={control} />
  </>;
}

export default function Map3D(props: Props) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <Canvas className="map-3d" dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 45, near: 0.1, far: 3000 }}>
    <Scene {...props} reducedMotion={reducedMotion} />
  </Canvas>;
}
