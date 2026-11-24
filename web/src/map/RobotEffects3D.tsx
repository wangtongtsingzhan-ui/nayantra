import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RobotVisualState } from "./robotVisualState";

/** 状态光效仅用于显示；机器人状态始终以 Core 上报的数据为准。 */
export function RobotEffects3D({ status, radius, animated }: { status: RobotVisualState; radius: number; animated: boolean }) {
  const ring = useRef<THREE.Mesh>(null!);
  const outer = useRef<THREE.Mesh>(null!);
  const sparks = useRef<THREE.Group>(null!);
  const color = status === "charging" ? "#42a5ff" : status === "error" ? "#ff5159" : status === "waiting" || status === "paused" ? "#ffb83e" : "#39e4b3";
  const visible = status !== "idle" && status !== "offline";
  useFrame(({ clock }) => {
    if (!visible || !ring.current || !outer.current) return;
    const t = animated ? clock.elapsedTime : 0;
    const pulse = animated ? (Math.sin(t * (status === "error" ? 3 : 2)) + 1) / 2 : 0.5;
    ring.current.scale.setScalar(1 + pulse * 0.16);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.32;
    outer.current.rotation.z = animated ? -t * (status === "charging" ? 0.9 : 0.5) : 0;
    if (sparks.current && animated) sparks.current.children.forEach((particle, i) => {
      const phase = (t * 0.48 + i / 4) % 1, a = i * Math.PI / 2 + t * 0.65;
      particle.position.set(Math.cos(a) * radius * 0.8, 0.3 + phase * radius * 2.4, Math.sin(a) * radius * 0.8);
      particle.scale.setScalar(0.7 + (1 - phase) * 0.6);
    });
  });
  if (!visible) return null;
  const r = Math.max(radius, 0.4);
  return <group raycast={() => null}>
    <mesh ref={ring} position-y={0.035} rotation-x={-Math.PI / 2} raycast={() => null}><ringGeometry args={[r * 1.35, r * 1.5, 40]} /><meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <mesh ref={outer} position-y={0.045} rotation-x={-Math.PI / 2} raycast={() => null}><ringGeometry args={[r * 1.75, r * 1.81, 48, 1, 0, Math.PI * 1.45]} /><meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    {status === "charging" && <group ref={sparks}>{[0,1,2,3].map(i => <mesh key={i} position={[Math.cos(i * Math.PI / 2) * r * 0.8, 0.4 + i * r * 0.45, Math.sin(i * Math.PI / 2) * r * 0.8]} raycast={() => null}><sphereGeometry args={[r * 0.1, 8, 6]} /><meshBasicMaterial color="#8be8ff" transparent opacity={0.9} depthWrite={false} /></mesh>)}</group>}
    {(status === "acting" || status === "moving") && <mesh position={[r * 1.15, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]} raycast={() => null}><coneGeometry args={[r * 0.2, r * 0.5, 4]} /><meshBasicMaterial color={color} /></mesh>}
  </group>;
}
