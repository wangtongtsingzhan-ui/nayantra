import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Point2 } from "../api/types";

// 将各段长度累计到 UV 坐标中，让光带跨越拐点时沿实际路径连续流动。
function ribbonGeometry(points: Point2[], height: number) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const halfWidth = 0.38;
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    const nx = -dy / length * halfWidth, ny = dx / length * halfWidth;
    const index = positions.length / 3;
    positions.push(ax + nx, height, -(ay + ny), ax - nx, height, -(ay - ny), bx + nx, height, -(by + ny), bx - nx, height, -(by - ny));
    uv.push(distance, 0, distance, 1, distance + length, 0, distance + length, 1);
    indices.push(index, index + 1, index + 2, index + 2, index + 1, index + 3);
    distance += length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const vertexShader = `
  varying vec2 pathUv;
  void main() {
    pathUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform float time;
  uniform vec3 pathColor;
  varying vec2 pathUv;
  void main() {
    float edge = abs(pathUv.y * 2.0 - 1.0);
    float phase = fract((time * 2.4 - pathUv.x) / 4.5);
    float trail = pow(1.0 - phase, 2.0) * (1.0 - smoothstep(0.62, 0.9, phase));
    float head = 1.0 - smoothstep(0.02, 0.18, phase);
    float halo = (1.0 - smoothstep(0.1, 1.0, edge)) * trail;
    float core = (1.0 - smoothstep(0.05, 0.33, edge)) * (0.25 + 0.75 * trail);
    float alpha = clamp(0.46 * halo + 0.65 * core, 0.0, 0.92);
    vec3 light = mix(pathColor, vec3(0.86, 1.0, 0.98), head * core * 0.8);
    gl_FragColor = vec4(light, alpha);
    #include <colorspace_fragment>
  }
`;

/** 路径光带仅用于展示规划方向，不代表机器人实时位置。 */
export function FlowingPath3D({ points, height, color, animated }: { points: Point2[]; height: number; color: string; animated: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null!);
  const geometry = useMemo(() => ribbonGeometry(points, height + 0.055), [points, height]);
  const uniforms = useMemo(() => ({ time: { value: 0 }, pathColor: { value: new THREE.Color(color) } }), [color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // 断线或启用减少动态效果时停止推进时间，保留静态路径提示。
  useFrame((_, dt) => {
    if (animated && material.current) material.current.uniforms.time.value += Math.min(dt, 0.1);
  });
  if (geometry.getIndex()?.count === 0) return null;
  return <mesh geometry={geometry} raycast={() => null} renderOrder={2}>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
  </mesh>;
}
