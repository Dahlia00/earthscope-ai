'use client';

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Stars, useTexture } from '@react-three/drei';
import { AdditiveBlending, BackSide, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float sun = dot(normal, sunDirection);
    float daylight = smoothstep(-0.15, 0.35, sun);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 color = day * (0.13 + max(sun, 0.0) * 1.35);
    color += night * pow(1.0 - daylight, 2.0) * 1.6;
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.5);
    color += vec3(0.03, 0.32, 0.75) * rim * (0.35 + daylight);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float rim = pow(max(0.0, 1.0 + dot(normalize(vNormal), viewDirection)), 5.0);
    gl_FragColor = vec4(0.015, 0.4, 1.0, rim * 0.55);
    #include <colorspace_fragment>
  }
`;

function Earth({ animated, children }: { animated: boolean; children?: ReactNode }) {
  const surface = useRef<Group>(null);
  const clouds = useRef<Mesh>(null);
  const [dayMap, nightMap, cloudMap] = useTexture(
    ['/textures/earth-day.jpg', '/textures/earth-night.jpg', '/textures/earth-clouds.jpg'],
    (textures) => {
      // Cloud alpha is linear data; color maps are sRGB photographs.
      textures[0].colorSpace = SRGBColorSpace;
      textures[1].colorSpace = SRGBColorSpace;
      textures.forEach((texture) => {
        texture.anisotropy = 4;
      });
    },
  );
  const uniforms = useMemo(
    () => ({
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      sunDirection: { value: new Vector3(3, 3, 5).normalize() },
    }),
    [dayMap, nightMap],
  );

  useFrame((_, delta) => {
    if (!animated) return;
    // Clamp the time step so returning from a background tab cannot jump the globe.
    const step = Math.min(delta, 0.05);
    if (surface.current) surface.current.rotation.y += step * 0.035;
    if (clouds.current) clouds.current.rotation.y += step * 0.045;
  });

  return (
    <group rotation={[0.15, 0, 0.12]}>
      <group ref={surface} rotation={[0, 0.12, 0]}>
        <mesh>
          <sphereGeometry args={[1.15, 80, 64]} />
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={surfaceFragment}
            uniforms={uniforms}
          />
        </mesh>
        {children}
      </group>
      <mesh ref={clouds} rotation={[0, 0.12, 0]}>
        <sphereGeometry args={[1.165, 64, 48]} />
        <meshPhongMaterial
          color="#ffffff"
          alphaMap={cloudMap}
          transparent
          opacity={0.58}
          depthWrite={false}
          shininess={4}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.18, 64, 48]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={atmosphereFragment}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function OrbitalPath({
  animated,
  tilt,
  offset,
}: {
  animated: boolean;
  tilt: [number, number, number];
  offset: number;
}) {
  const point = useRef<Group>(null);
  const phase = useRef(offset);
  const points = useMemo(
    () =>
      Array.from({ length: 129 }, (_, i): [number, number, number] => {
        const angle = (i / 128) * Math.PI * 2;
        return [Math.cos(angle) * 1.6, Math.sin(angle) * 1.6, 0];
      }),
    [],
  );
  useFrame((_, delta) => {
    if (animated) phase.current += Math.min(delta, 0.05) * 0.13;
    point.current?.position.set(Math.cos(phase.current) * 1.6, Math.sin(phase.current) * 1.6, 0);
  });
  return (
    <group rotation={tilt}>
      <Line points={points} color="#00dfff" lineWidth={0.7} transparent opacity={0.62} />
      <group ref={point} position={[Math.cos(offset) * 1.6, Math.sin(offset) * 1.6, 0]}>
        <mesh>
          <sphereGeometry args={[0.023, 12, 12]} />
          <meshBasicMaterial color="#b9ffff" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.052, 12, 12]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function ContextGuard({ onFailure }: { onFailure: () => void }) {
  const { gl, invalidate, size } = useThree();
  useEffect(() => {
    invalidate();
    const timer = setTimeout(() => invalidate(), 100);
    return () => clearTimeout(timer);
  }, [invalidate, size.width, size.height]);
  useEffect(() => {
    const canvas = gl.domElement;
    function lost(event: Event) {
      event.preventDefault();
      onFailure();
    }
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);
  return null;
}

export default function EarthScene({
  animated,
  onFailure,
  children,
}: {
  animated: boolean;
  onFailure: () => void;
  children?: ReactNode;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.6], fov: 42 }}
      dpr={[1, 1.5]}
      frameloop={animated ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ touchAction: 'pan-y' }}
      aria-label="Interactive 3D Earth. Drag horizontally to change the view."
    >
      <ContextGuard onFailure={onFailure} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 3, 5]} intensity={2.1} color="#dbefff" />
      <Suspense fallback={null}>
        <Earth animated={animated}>{children}</Earth>
      </Suspense>
      <OrbitalPath animated={animated} tilt={[1.05, 0.2, 0.3]} offset={0.4} />
      <OrbitalPath animated={animated} tilt={[1.15, -0.3, -0.3]} offset={3.2} />
      <Stars
        radius={30}
        depth={20}
        count={650}
        factor={2}
        saturation={0}
        fade
        speed={animated ? 0.15 : 0}
      />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={children ? 0.08 : 0.8}
        maxPolarAngle={children ? Math.PI - 0.08 : 2.2}
      />
    </Canvas>
  );
}
