import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { TextureLoader, Mesh, AdditiveBlending, DoubleSide, Group, BufferAttribute, Vector3, PlaneGeometry, Quaternion } from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Points, PointMaterial, Text, Line } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';
import { HandTrackingState, RegionName } from '../types';
import { SoundService } from '../services/soundService';
import earthAtmosUrl from '@/assets/img/earth_atmos_2048.jpg';
import earthNormalUrl from '@/assets/img/earth_normal_2048.jpg';
import earthSpecUrl from '@/assets/img/earth_specular_2048.jpg';

interface HolographicEarthProps {
  handTrackingRef: React.MutableRefObject<HandTrackingState>;
  setRegion: (region: RegionName) => void;
}

// --- Tactical Terrain Component (Iron Man HUD Style) ---
const TerrainModel: React.FC<{ 
    expansionRef: React.MutableRefObject<number>;
}> = ({ expansionRef }) => {
    const groupRef = useRef<Group>(null);
    const spinRef = useRef<Group>(null);
    const meshRef = useRef<Mesh>(null);
    const fillMeshRef = useRef<Mesh>(null);
    const markersRef = useRef<Group>(null);
    const ringRef = useRef<Mesh>(null);
    const planesRef = useRef<Group>(null);
    const peopleRef = useRef<Group>(null);

    const planes = useMemo(() => {
        const list: { pos: Vector3; dir: number; speed: number; height: number; color: string }[] = [];
        const count = 20;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 10.0;
            const y = (Math.random() - 0.5) * 10.0;
            const h = 0.8 + Math.random() * 1.1;
            const s = 0.2 + Math.random() * 0.3;
            const d = Math.random() * Math.PI * 2;
            const col = '#00F0FF';
            list.push({ pos: new Vector3(x, y, 0), dir: d, speed: s, height: h, color: col });
        }
        return list;
    }, []);

    const people = useMemo(() => {
        const list: { base: Vector3; dir: number; speed: number; range: number; color: string }[] = [];
        const count = 30;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 10.0;
            const z = (Math.random() - 0.5) * 10.0;
            const dir = Math.random() * Math.PI * 2;
            const speed = 0.2 + Math.random() * 0.2;
            const range = 0.8 + Math.random() * 1.6;
            list.push({ base: new Vector3(x, 0, z), dir, speed, range, color: '#00F0FF' });
        }
        return list;
    }, []);

    const [terrainData, setTerrainData] = useState<{
        geometry: PlaneGeometry;
        maxHeights: Float32Array;
    } | null>(null);

    // 1. Generate Height Map Data (Procedural Terrain)
    const { viewport } = useThree();

    useEffect(() => {
        const size = Math.max(viewport.width, viewport.height) * 8;
        const segments = 200;

        const geom = new PlaneGeometry(size, size, segments, segments);
        
        // Safety check for attributes
        if (!geom.attributes.position) {
            console.error("PlaneGeometry attributes missing");
            return;
        }

        const count = geom.attributes.position.count;
        const posArray = geom.attributes.position.array;
        
        // Generate colors based on height for the wireframe
        const colorArray = new Float32Array(count * 3);

        // Simple FBM-like noise function for terrain shape
        const getElevation = (x: number, y: number) => {
            // Main ridge (Frequency adjusted for larger map)
            let z = Math.sin(x * 0.4) * Math.cos(y * 0.4) * 1.5; 
            // Detail noise
            z += Math.sin(x * 1.5 + y * 0.8) * 0.5;
            z += Math.cos(x * 2.0) * 0.2;
            // Valley flattening
            return Math.max(-0.5, z); 
        };

        // Pre-calculate max heights
        const maxHeights = new Float32Array(count);

        for (let i = 0; i < count; i++) {
             const x = posArray[i * 3];
             const y = posArray[i * 3 + 1]; // PlaneGeometry is XY, we rotate it later
             
             // Calculate target height
             const h = getElevation(x, y);
             maxHeights[i] = h > 0 ? h : h * 0.2; // Flatten valleys

             // Color logic: Cyan for peaks, darker blue for lowlands
             const intensity = 0.2 + (h + 1) / 3;
             colorArray[i*3] = 0;   // R
             colorArray[i*3+1] = intensity * 0.8; // G
             colorArray[i*3+2] = intensity * 1.0; // B
        }
        
        geom.setAttribute('color', new BufferAttribute(colorArray, 3));

        setTerrainData({ geometry: geom, maxHeights });
        
        return () => {
            geom.dispose();
        };
    }, [viewport.width, viewport.height]);

    // 2. Target Markers (Floating points above peaks)
    const markers = useMemo(() => {
        const items = [];
        const placeNames = ["SECTOR 7", "ALPHA BASE", "NORTH RIDGE", "OMEGA POINT", "ECHO STATION", "DELTA FORCE", "GRID 9", "ZERO NULL", "CYBER DOCK", "NEON CITY", "LUNA OUTPOST", "SOLAR ARRAY"];
        for(let i=0; i<12; i++) { // Increased marker count slightly
            const s = Math.max(viewport.width, viewport.height) * 8;
            const x = (Math.random() - 0.5) * s * 0.85;
            const z = (Math.random() - 0.5) * s * 0.85;
            items.push({ 
                position: new Vector3(x, 0, z), 
                label: `TGT-${i}`,
                name: placeNames[Math.floor(Math.random() * placeNames.length)]
            });
        }
        return items;
    }, [viewport.width, viewport.height]);

    useFrame((state) => {
        if (!groupRef.current || !meshRef.current || !fillMeshRef.current || !terrainData) return;
        
        const exp = expansionRef.current;
        const { maxHeights } = terrainData;
        
        // --- TRANSITION LOGIC ---
        // CHANGED: Terrain starts appearing at 0.5 (50%), Fully formed at 1.0
        let progress = (exp - 0.5) / 0.5;
        progress = Math.max(0, Math.min(1, progress));
        
        // Snap to avoid jitter at max
        if (progress > 0.99) progress = 1.0;

        groupRef.current.visible = progress > 0.01;
        if (!groupRef.current.visible) return;

        if (spinRef.current) {
            spinRef.current.rotation.z = -state.clock.elapsedTime * 0.05;
        }

        // --- ANIMATE GEOMETRY ---
        if (meshRef.current.geometry && meshRef.current.geometry.attributes.position) {
            const positionAttribute = meshRef.current.geometry.attributes.position;
            const positions = positionAttribute.array as Float32Array;
            
            for (let i = 0; i < positions.length / 3; i++) {
                // CHANGED: Reduced height multiplier from 2.0 to 0.8 for flatter look
                const targetH = maxHeights[i] * 0.8 * progress; 
                
                const x = positions[i*3];
                const wave = Math.sin(x * 2 + state.clock.elapsedTime * 2) * 0.1 * progress;
                
                const finalH = targetH + wave;

                positions[i*3 + 2] = finalH;
            }
            positionAttribute.needsUpdate = true;
        }

        // --- ANIMATE MARKERS ---
        if (markersRef.current) {
             markersRef.current.children.forEach((child, idx) => {
                 const m = markers[idx];
                 if (!m) return;
                 
                 const currentHeight = 0.5 + progress * 1.5;
                 
                 child.position.set(m.position.x, m.position.z, currentHeight);
                 
                 const head = child.children[1] as Group;
                 if (head) {
                     head.lookAt(state.camera.position);
                     const outerRing = head.children[0]; 
                     if (outerRing) {
                         outerRing.rotation.z -= 0.02;
                     }
                     const centerDot = head.children[2];
                     if (centerDot) {
                         const scale = 1 + Math.sin(state.clock.elapsedTime * 8 + idx) * 0.2;
                         centerDot.scale.setScalar(scale);
                     }
                 }
             });
        }

        // Radar Ring Animation
        if (ringRef.current) {
            ringRef.current.scale.setScalar(1 + (state.clock.elapsedTime % 2) * 0.5);
            (ringRef.current.material as any).opacity = 0.5 * (1 - (state.clock.elapsedTime % 2) / 2);
        }

        if (planesRef.current) {
            planesRef.current.visible = progress > 0.01;
            const dt = state.clock.getDelta();
            for (let i = 0; i < planes.length; i++) {
                const p = planes[i];
                p.dir += Math.sin(state.clock.elapsedTime * 0.25 + i) * 0.002; // slight wander
                p.pos.x += Math.cos(p.dir) * p.speed * dt * 3.0;
                p.pos.y += Math.sin(p.dir) * p.speed * dt * 3.0;
                // bounds
                const bound = 5.2;
                if (p.pos.x > bound || p.pos.x < -bound || p.pos.y > bound || p.pos.y < -bound) {
                    p.dir += Math.PI * 0.9;
                    p.pos.x = Math.max(-bound, Math.min(bound, p.pos.x));
                    p.pos.y = Math.max(-bound, Math.min(bound, p.pos.y));
                }
                const z = p.height + Math.sin(state.clock.elapsedTime * 1.6 + i) * 0.05;
                const g = planesRef.current.children[i] as Group;
                if (!g) continue;
                g.position.set(p.pos.x, p.pos.y, z);
                const dir = new Vector3(Math.cos(p.dir), Math.sin(p.dir), 0).normalize();
                const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
                g.quaternion.copy(quat);
                g.scale.setScalar(0.06);
            }
        }

        if (peopleRef.current) {
            peopleRef.current.visible = progress > 0.01;
            const t = state.clock.elapsedTime;
            const calcElevation = (x: number, y: number) => {
                let zz = Math.sin(x * 0.4) * Math.cos(y * 0.4) * 1.5;
                zz += Math.sin(x * 1.5 + y * 0.8) * 0.5;
                zz += Math.cos(x * 2.0) * 0.2;
                return Math.max(-0.5, zz);
            };
            for (let i = 0; i < people.length; i++) {
                const p = people[i];
                const offset = Math.sin(t * p.speed + i * 0.37) * p.range;
                const px = p.base.x + Math.cos(p.dir) * offset;
                const py = p.base.z + Math.sin(p.dir) * offset;
                const base = calcElevation(px, py);
                const flattened = base > 0 ? base : base * 0.2;
                const targetH = flattened * 0.8 * progress;
                const wave = Math.sin(px * 2 + t * 2) * 0.1 * progress;
                const finalH = targetH + wave + 0.04 + Math.sin(t * 6 + i) * 0.01;
                const g = peopleRef.current.children[i] as Group;
                if (!g) continue;
                g.position.set(px, py, finalH);
                g.scale.setScalar(0.06);
            }
        }
    });

    if (!terrainData) return null;

    return (
        <group ref={groupRef} visible={false}>
             {/* Slanted Tactical View */}
             <group rotation={[-Math.PI / 2.5, 0, 0]} position={[0, 0, 0]}> 
                
        <group ref={spinRef}>
            <gridHelper 
                args={[Math.max(viewport.width, viewport.height) * 8, 160, 0x001133, 0x000510]} 
                position={[0, 0, 0.1]} 
                rotation={[Math.PI/2, 0, 0]}
            />

                    {/* Wireframe Terrain */}
                    <mesh ref={meshRef} geometry={terrainData.geometry}>
                        <meshBasicMaterial 
                            vertexColors
                            wireframe
                            transparent 
                            opacity={0.6} 
                            blending={AdditiveBlending}
                        />
                    </mesh>

                    {/* Fill Terrain */}
                    <mesh ref={fillMeshRef} geometry={terrainData.geometry}>
                        <meshBasicMaterial 
                            color="#000000" 
                            transparent 
                            opacity={0.8}
                            side={DoubleSide}
                        />
                    </mesh>

                    {/* Floating Targets */}
                    <group ref={markersRef}>
                        {markers.map((m, i) => (
                            <group key={i} position={[m.position.x, m.position.z, 0]}>
                                {/* Tether */}
                                <mesh position={[0, 0, -1.5]} rotation={[Math.PI/2, 0, 0]}>
                                    <cylinderGeometry args={[0.005, 0.02, 3, 4]} /> 
                                    <meshBasicMaterial 
                                        color="#00F0FF" 
                                        transparent 
                                        opacity={0.3} 
                                        blending={AdditiveBlending} 
                                        depthWrite={false} 
                                    />
                                </mesh>

                                {/* Head */}
                                <group>
                                    <mesh rotation={[0,0, Math.random() * Math.PI]}>
                                        <ringGeometry args={[0.15, 0.16, 32, 1, 0, Math.PI * 1.5]} />
                                        <meshBasicMaterial color="#00F0FF" transparent opacity={0.6} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
                                    </mesh>
                                    
                                    <mesh rotation={[0,0,Math.PI/4]}>
                                        <ringGeometry args={[0.08, 0.09, 4]} />
                                        <meshBasicMaterial color="#00F0FF" transparent opacity={0.8} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
                                    </mesh>

                                    <mesh>
                                        <circleGeometry args={[0.03, 16]} />
                                        <meshBasicMaterial color="#FF2A2A" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
                                    </mesh>

                                    <group position={[0.25, 0.05, 0]}>
                                        <mesh position={[-0.1, -0.05, 0]} rotation={[0,0,Math.PI/4]}>
                                            <planeGeometry args={[0.1, 0.01]} />
                                            <meshBasicMaterial color="#00F0FF" opacity={0.5} transparent blending={AdditiveBlending} />
                                        </mesh>
                                        
                                        <mesh position={[0.3, 0, 0]}>
                                            <planeGeometry args={[0.8, 0.16]} />
                                            <meshBasicMaterial color="#000510" transparent opacity={0.8} />
                                        </mesh>
                                        
                                        <Text
                                            position={[0.3, 0, 0.01]}
                                            fontSize={0.08}
                                            color="#00F0FF"
                                            anchorX="center"
                                            anchorY="middle"
                                        >
                                            {m.name}
                                        </Text>
                                    </group>
                                </group>
                            </group>
                        ))}
                    </group>

                    {/* Radar Ring */}
                    <mesh ref={ringRef} position={[0,0,0.2]}>
                        <ringGeometry args={[1.5, 1.55, 64]} />
                        <meshBasicMaterial color="#00F0FF" transparent opacity={0.5} blending={AdditiveBlending} side={DoubleSide} />
                    </mesh>
                    <group ref={planesRef}>
                        {planes.map((p, i) => (
                            <group key={i} position={[0, 0, p.height]}>
                                <Line points={[
                                    new Vector3(0.0, -1.0, 0.0),
                                    new Vector3(0.0, 1.0, 0.0),
                                ]} color={p.color} linewidth={1.6} transparent opacity={0.95} />
                                <Line points={[
                                    new Vector3(0.0, 0.4, 0.0),
                                    new Vector3(0.7, -0.2, 0.0),
                                ]} color={p.color} linewidth={1.4} transparent opacity={0.95} />
                                <Line points={[
                                    new Vector3(0.0, 0.4, 0.0),
                                    new Vector3(-0.7, -0.2, 0.0),
                                ]} color={p.color} linewidth={1.4} transparent opacity={0.95} />
                                <Line points={[
                                    new Vector3(-0.35, -1.0, 0.0),
                                    new Vector3(0.35, -1.0, 0.0),
                                ]} color={p.color} linewidth={1.6} transparent opacity={0.95} />
                            </group>
                        ))}
                    </group>

                    <group ref={peopleRef}>
                        {people.map((m, i) => (
                            <group key={i} position={[m.base.x, m.base.z, 0]}>
                                <Line points={[
                                    new Vector3(0.0, 0.0, 0.2),
                                    new Vector3(0.0, 0.0, 1.6),
                                ]} color={m.color} linewidth={0.9} transparent opacity={0.85} />
                                <Line points={[
                                    new Vector3(-0.6, 0.0, 1.1),
                                    new Vector3(0.6, 0.0, 1.1),
                                ]} color={m.color} linewidth={0.8} transparent opacity={0.8} />
                                <Line points={[
                                    new Vector3(0.0, 0.0, 0.6),
                                    new Vector3(-0.6, 0.0, 0.0),
                                ]} color={m.color} linewidth={0.8} transparent opacity={0.75} />
                                <Line points={[
                                    new Vector3(0.0, 0.0, 0.6),
                                    new Vector3(0.6, 0.0, 0.0),
                                ]} color={m.color} linewidth={0.8} transparent opacity={0.75} />
                                <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]}>
                                    <circleGeometry args={[0.3, 16]} />
                                    <meshBasicMaterial color={m.color} transparent opacity={0.9} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
                                </mesh>
                            </group>
                        ))}
                    </group>
                </group>
             </group>
        </group>
    );
};


const HolographicEarth: React.FC<HolographicEarthProps> = ({ handTrackingRef, setRegion }) => {
  const earthGroupRef = useRef<Group>(null); 
  const earthRef = useRef<Mesh>(null);
  const cloudsRef = useRef<Mesh>(null);
  const wireframeRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const particlesRef = useRef<any>(null);
  
  const smoothExpansionRef = useRef(0);
  const wasTerrainModeRef = useRef(false);

  // Load Color, Normal, and Specular maps for realistic texture
  const [colorMap, normalMap, specularMap] = useLoader(TextureLoader, [
    earthAtmosUrl,
    earthNormalUrl,
    earthSpecUrl
  ]);
  
  const satelliteData = useMemo(() => {
     try {
         return random.inSphere(new Float32Array(1500), { radius: 2.2 }) as Float32Array;
     } catch (e) {
         return new Float32Array(1500);
     }
  }, []);

  useFrame((state, delta) => {
    if (!earthRef.current || !earthGroupRef.current) return;

    const leftHand = handTrackingRef.current.leftHand;
    const rightHand = handTrackingRef.current.rightHand;
    let targetExpansion = 0;

    // 1. 360 Rotation & Scrolling Control (Right Hand)
    let currentSpeedX = 0.0005; // Default ambient spin
    let currentSpeedY = 0;
    
    if (rightHand) {
        const { x, y } = rightHand.rotationControl;
        
        // X-Axis Control (Spinning Left/Right)
        if (Math.abs(x) > 0.1) {
            currentSpeedX = x * 0.05;
        }
        
        // Y-Axis Control (Tilting/Scrolling Up/Down)
        // We apply this to the entire group for a tumbling effect
        if (Math.abs(y) > 0.1) {
            currentSpeedY = y * 0.05;
        }
    }
    
    // Apply Spin (Y-axis) to individual components to maintain opposing wireframe rotation
    earthRef.current.rotation.y += currentSpeedX;
    if (cloudsRef.current) cloudsRef.current.rotation.y += currentSpeedX * 1.1;
    // Wireframe rotates counter to earth for tech effect
    if (wireframeRef.current) wireframeRef.current.rotation.y -= (currentSpeedX * 0.5);
    
    // Apply Tilt (X-axis) to the container group
    earthGroupRef.current.rotation.x += currentSpeedY;


    // 2. Expansion/Zoom Control (Left Hand)
    if (leftHand) {
      targetExpansion = leftHand.expansionFactor;

      const movementDelta = Math.abs(targetExpansion - smoothExpansionRef.current);
      if (movementDelta > 0.002) {
          SoundService.playServo(movementDelta);
      }
    }

    smoothExpansionRef.current += (targetExpansion - smoothExpansionRef.current) * 0.08;
    const exp = smoothExpansionRef.current;

    // --- VISIBILITY & TRANSITION CONTROL ---
    
    // CHANGED: Earth starts fading earlier (0.4) to separate from Terrain (0.5+)
    // Fade out range: 0.4 to 0.6
    let earthOpacity = 1;
    if (exp > 0.4) {
        earthOpacity = 1 - ((exp - 0.4) / 0.2); 
        earthOpacity = Math.max(0, Math.min(1, earthOpacity));
    }
    
    earthGroupRef.current.visible = earthOpacity > 0.01;

    if (earthGroupRef.current.visible) {
        if (earthRef.current.material) (earthRef.current.material as any).opacity = 0.9 * earthOpacity;
        if (cloudsRef.current?.material) (cloudsRef.current.material as any).opacity = 0.15 * earthOpacity;
        if (wireframeRef.current?.material) (wireframeRef.current.material as any).opacity = 0.2 * earthOpacity;
        if (ringRef.current?.material) (ringRef.current.material as any).opacity = 0.1 * earthOpacity;
        if (particlesRef.current) particlesRef.current.visible = earthOpacity > 0.5;
    }

    // CHANGED: Adjusted sound trigger to match new 50% threshold
    if (exp > 0.55) {
        if (!wasTerrainModeRef.current) {
            SoundService.playMapSwitch();
            wasTerrainModeRef.current = true;
        }
    } else {
        wasTerrainModeRef.current = false;
    }

    // --- Earth Animations (Only if visible) ---
    if (earthGroupRef.current.visible) {
        const baseScale = 1.5;
        const coreScale = baseScale * (1 - Math.max(0, exp - 0.3) * 0.5); 
        earthRef.current.scale.set(coreScale, coreScale, coreScale);

        const cloudScale = baseScale * 1.02 + (exp * 1.0); 
        if (cloudsRef.current) {
            cloudsRef.current.scale.set(cloudScale, cloudScale, cloudScale);
            // Cloud rotation handled above in shared block
            cloudsRef.current.rotation.y += (exp * 0.01);
        }

        const wireScale = baseScale * 1.2 + (exp * 2.0);
        if (wireframeRef.current) {
            wireframeRef.current.scale.set(wireScale, wireScale, wireScale);
             // Wireframe rotation handled above in shared block
             wireframeRef.current.rotation.y -= (exp * 0.02);
        }

        if (ringRef.current) {
            ringRef.current.scale.set(1 + exp, 1 + exp, 1 + exp);
            ringRef.current.rotation.z -= currentSpeedX * 1.5;
            ringRef.current.rotation.x = (Math.PI / 2) + (Math.sin(state.clock.elapsedTime * 0.2) * 0.1) + (exp * 0.5);
        }

        if (particlesRef.current) {
            particlesRef.current.rotation.y += 0.001;
            particlesRef.current.scale.set(1 + exp * 1.5, 1 + exp * 1.5, 1 + exp * 1.5);
        }

        const rotationY = earthRef.current.rotation.y % (Math.PI * 2);
        const normalizedRotation = rotationY < 0 ? rotationY + Math.PI * 2 : rotationY;
        const degrees = (normalizedRotation * 180) / Math.PI;
        
        if (degrees > 30 && degrees < 100) setRegion(RegionName.AMERICAS);
        else if (degrees >= 100 && degrees < 190) setRegion(RegionName.PACIFIC);
        else if (degrees >= 190 && degrees < 280) setRegion(RegionName.ASIA);
        else if (degrees >= 280 && degrees < 330) setRegion(RegionName.AFRICA);
        else setRegion(RegionName.EUROPE);
    }
  });

  return (
    <group position={[0, 0, 0]}>
        <EffectComposer enableNormalPass={false}>
           <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.6} />
        </EffectComposer>

        {/* EARTH GROUP */}
        <group ref={earthGroupRef}>
            <mesh ref={earthRef}>
                <sphereGeometry args={[1, 64, 64]} />
                <meshPhongMaterial 
                    map={colorMap} 
                    normalMap={normalMap}
                    specularMap={specularMap}
                    color="#0066ff"
                    emissive="#001133"
                    emissiveMap={colorMap} // Continents will glow
                    emissiveIntensity={0.5}
                    specular="#111111"
                    shininess={15}
                    transparent={true}
                    opacity={0.95}
                    blending={AdditiveBlending}
                />
            </mesh>

            <mesh ref={cloudsRef}>
                <sphereGeometry args={[1.01, 64, 64]} />
                <meshBasicMaterial 
                    map={colorMap}
                    color="#00F0FF"
                    transparent
                    opacity={0.2}
                    blending={AdditiveBlending}
                />
            </mesh>

            <mesh ref={wireframeRef}>
                <icosahedronGeometry args={[1, 2]} />
                <meshBasicMaterial 
                    color="#002FA7" 
                    wireframe 
                    transparent 
                    opacity={0.2} 
                    blending={AdditiveBlending}
                />
            </mesh>

            <group ref={particlesRef} rotation={[0,0,Math.PI/4]}>
                <Points positions={satelliteData} stride={3} frustumCulled={false}>
                    <PointMaterial
                        transparent
                        color="#00F0FF"
                        size={0.015}
                        sizeAttenuation={true}
                        depthWrite={false}
                        blending={AdditiveBlending}
                    />
                </Points>
            </group>

            <mesh ref={ringRef} rotation={[Math.PI / 2.3, 0, 0]}>
                <ringGeometry args={[2.0, 2.4, 128]} />
                <meshBasicMaterial 
                    color="#00F0FF" 
                    side={DoubleSide} 
                    transparent 
                    opacity={0.1} 
                    blending={AdditiveBlending}
                />
            </mesh>
        </group>
        
        {/* TERRAIN MODEL OVERLAY */}
        <TerrainModel expansionRef={smoothExpansionRef} />
        
        <ambientLight intensity={0.2} color="#002FA7" />
        <pointLight position={[10, 10, 10]} intensity={2} color="#00F0FF" />
        <pointLight position={[-10, -10, -5]} intensity={1} color="#FF00FF" />
    </group>
  );
};

export default HolographicEarth;
