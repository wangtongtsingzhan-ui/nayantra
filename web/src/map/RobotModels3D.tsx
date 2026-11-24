import type { RobotType } from "../api/types";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// 此组件只负责默认外形；位姿、选择和状态由 Map3D 管理，便于未来接入资产模型。
export function RobotModel3D({ type, radius, color, moving }: { type: RobotType; radius: number; color: string; moving: boolean }) {
  const r = radius;
  const legs = useRef<(THREE.Group | null)[]>([]);
  const rotors = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    for (const rotor of rotors.current) if (rotor && moving) rotor.rotation.y += Math.min(dt, 0.1) * 12;
    for (let i = 0; i < legs.current.length; i++) {
      const leg = legs.current[i];
      const phase = type === "quadruped" ? (Math.floor(i / 2) + i % 2) % 2 : i % 2;
      if (leg) leg.rotation.z = moving ? Math.sin(clock.elapsedTime * 5.5 + phase * Math.PI) * 0.28 : 0;
    }
  });
  const material = <meshStandardMaterial color={color} metalness={0.25} roughness={0.5} />;
  if (type === "uav") return <group>
    <mesh position-y={0.2}>{<sphereGeometry args={[r * 0.36, 12, 8]} />}{material}</mesh>
    {[45, 135, 225, 315].map((deg, i) => {
      const a = deg * Math.PI / 180, x = Math.cos(a) * r * 0.68, z = Math.sin(a) * r * 0.68;
      return <group key={deg}>
        <mesh position={[x / 2, 0.2, z / 2]} rotation-y={-a}><boxGeometry args={[r * 0.7, 0.06, 0.07]} />{material}</mesh>
        <mesh position={[x, 0.23, z]} rotation-x={-Math.PI / 2}><ringGeometry args={[r * 0.18, r * 0.29, 18]} /><meshStandardMaterial color={color} side={2} /></mesh>
        <group ref={el => { rotors.current[i] = el; }} position={[x, 0.24, z]}><mesh><boxGeometry args={[r * 0.48, 0.025, 0.045]} /><meshBasicMaterial color="#d7f8ff" /></mesh></group>
      </group>;
    })}
    <mesh position={[r * 0.36, 0.22, 0]}><sphereGeometry args={[0.08, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
  </group>;
  if (type === "quadruped") return <group>
    <mesh position-y={r * 0.75}><boxGeometry args={[r * 1.4, r * 0.55, r * 0.72]} />{material}</mesh>
    {[-1, 1].flatMap((x, xi) => [-1, 1].map((z, zi) => <group key={`${x}-${z}`} ref={el => { legs.current[xi * 2 + zi] = el; }} position={[x * r * 0.48, r * 0.6, z * r * 0.27]}><mesh position-y={-r * 0.3}><boxGeometry args={[r * 0.18, r * 0.6, r * 0.18]} />{material}</mesh></group>))}
    <mesh position={[r * 0.72, r * 0.9, 0]}><boxGeometry args={[r * 0.35, r * 0.32, r * 0.5]} /><meshStandardMaterial color="#e8f5ff" /></mesh>
  </group>;
  if (type === "humanoid") return <group>
    <mesh position-y={r * 1.45}><boxGeometry args={[r * 0.55, r * 0.9, r * 0.8]} />{material}</mesh>
    <mesh position-y={r * 2.2}><sphereGeometry args={[r * 0.27, 12, 10]} />{material}</mesh>
    {[-1, 1].map((z, i) => <group key={z}>
      <group ref={el => { legs.current[i] = el; }} position={[0, r, z * r * 0.22]}><mesh position-y={-r * 0.5}><boxGeometry args={[r * 0.22, r, r * 0.24]} />{material}</mesh></group>
      <mesh position={[0, r * 1.45, z * r * 0.53]}><boxGeometry args={[r * 0.22, r * 0.8, r * 0.22]} />{material}</mesh>
    </group>)}
    <mesh position={[r * 0.28, r * 2.2, 0]}><boxGeometry args={[0.03, r * 0.12, r * 0.35]} /><meshBasicMaterial color="white" /></mesh>
  </group>;
  return <group>
    <mesh position-y={0.24}><boxGeometry args={[r * 1.9, 0.45, r * 1.4]} />{material}</mesh>
    <mesh position={[r * 0.53, 0.48, 0]}><boxGeometry args={[r * 0.3, 0.06, r * 0.8]} /><meshBasicMaterial color="#effbff" /></mesh>
    {[-1, 1].map((z) => <mesh key={z} position={[0, 0.14, z * r * 0.72]}><boxGeometry args={[r * 1.2, 0.22, 0.12]} /><meshStandardMaterial color="#1b2733" /></mesh>)}
  </group>;
}
