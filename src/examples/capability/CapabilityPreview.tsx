import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function CapabilityPreview(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    camera.position.set(4, 3, 6);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xb8fff2, 0x26313a, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 8, 4);
    scene.add(key);

    const group = new THREE.Group();
    scene.add(group);

    const torus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.1, 0.12, 160, 12),
      new THREE.MeshStandardMaterial({
        color: 0x10a68a,
        metalness: 0.2,
        roughness: 0.34,
      }),
    );
    group.add(torus);

    const rays = new THREE.Group();
    const rayMaterial = new THREE.LineBasicMaterial({ color: 0xf3b43f, transparent: true, opacity: 0.72 });
    for (let i = 0; i < 22; i += 1) {
      const angle = (i / 22) * Math.PI * 2;
      const radius = i % 2 === 0 ? 2.2 : 2.8;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle * 1.7) * 0.34, Math.sin(angle) * radius),
        ]),
        rayMaterial,
      );
      rays.add(line);
    }
    group.add(rays);

    const resize = (): void => {
      const { clientWidth, clientHeight } = host;
      const width = Math.max(1, clientWidth);
      const height = Math.max(1, clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frameId = 0;
    const animate = (): void => {
      frameId = requestAnimationFrame(animate);
      group.rotation.y += 0.008;
      rays.rotation.z -= 0.004;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
      });
      rayMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={hostRef} className="three-host" data-testid="capability-canvas" />;
}
