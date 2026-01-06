import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  volume: number;
  isActive: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ 
    radius: 60, 
    outerRadius: 80, 
    pulse: 0,
    animationId: 0 
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const render = () => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Target radius physics
      const targetRadius = 60 + (volume * 140);
      stateRef.current.radius += (targetRadius - stateRef.current.radius) * 0.15;
      stateRef.current.outerRadius += (targetRadius * 1.2 - stateRef.current.outerRadius) * 0.1;
      stateRef.current.pulse += 0.05;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isActive) {
        // Outer Atmosphere
        const atmosphere = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, stateRef.current.outerRadius * 1.8);
        atmosphere.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
        atmosphere.addColorStop(0.5, 'rgba(14, 165, 233, 0.05)');
        atmosphere.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = atmosphere;
        ctx.beginPath();
        ctx.arc(centerX, centerY, stateRef.current.outerRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing Rings
        for(let i = 0; i < 3; i++) {
          const r = stateRef.current.radius * (1 + i * 0.2 + Math.sin(stateRef.current.pulse + i) * 0.1);
          ctx.strokeStyle = `rgba(14, 165, 233, ${0.3 / (i + 1)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Inner Core Glow
        const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, stateRef.current.radius);
        coreGradient.addColorStop(0, 'rgba(14, 165, 233, 0.8)');
        coreGradient.addColorStop(0.4, 'rgba(14, 165, 233, 0.4)');
        coreGradient.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, stateRef.current.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Idle State
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Static Center Orb
      ctx.beginPath();
      ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#0ea5e9' : '#1e293b';
      ctx.shadowBlur = isActive ? 20 : 0;
      ctx.shadowColor = '#0ea5e9';
      ctx.fill();
      
      stateRef.current.animationId = requestAnimationFrame(render);
    };

    stateRef.current.animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(stateRef.current.animationId);
  }, [volume, isActive]);

  return (
    <div className="relative w-full h-72 flex items-center justify-center">
      <div className={`absolute w-40 h-40 rounded-full blur-[60px] transition-all duration-1000 ${isActive ? 'bg-blue-500/20' : 'bg-transparent'}`}></div>
      <canvas ref={canvasRef} width={500} height={500} className="w-[400px] h-[400px]" />
    </div>
  );
};
