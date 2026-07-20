import { Check, Clapperboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type CompletionCelebrationKind,
  subscribeToCompletionCelebrations,
} from '@/services/completion-celebrations';

interface Particle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
}

const COLORS = ['#9f75ff', '#c4aaFF', '#f6ecd9', '#6d43d8'];
const PARTICLE_COUNT = 54;
const LIFE_MS = 1_250;
const FADE_AFTER_MS = 650;

function AccentBurst({ celebrationId }: { celebrationId: number }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void celebrationId;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    context.scale(pixelRatio, pixelRatio);

    const originX = width / 2;
    const originY = Math.min(height * 0.38, 330);
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, index): Particle => {
      const angle = Math.PI * (1.08 + Math.random() * 0.84);
      const speed = 4.5 + Math.random() * 6;
      return {
        x: originX,
        y: originY,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed - 2.5,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.28,
        size: 4 + (index % 4),
        color: COLORS[index % COLORS.length] ?? '#9f75ff',
      };
    });

    const startedAt = performance.now();
    let frame = 0;
    const paint = (now: number): void => {
      const elapsed = now - startedAt;
      context.clearRect(0, 0, width, height);
      const opacity =
        elapsed <= FADE_AFTER_MS
          ? 1
          : Math.max(0, 1 - (elapsed - FADE_AFTER_MS) / (LIFE_MS - FADE_AFTER_MS));

      for (const particle of particles) {
        particle.velocityX *= 0.986;
        particle.velocityY = particle.velocityY * 0.986 + 0.16;
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.rotation += particle.rotationSpeed;
        context.save();
        context.globalAlpha = opacity;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size * 0.58,
        );
        context.restore();
      }

      if (elapsed < LIFE_MS) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [celebrationId]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}

const COPY: Record<CompletionCelebrationKind, { title: string; detail: string }> = {
  'first-export': {
    title: 'Your first export is ready',
    detail: 'That finished cut is ready to watch and share.',
  },
  'clean-batch': {
    title: 'Clean export pack ready',
    detail: 'Every queued cut finished successfully.',
  },
};

export function CompletionCelebration(): React.JSX.Element | null {
  const [active, setActive] = useState<{
    id: number;
    kind: CompletionCelebrationKind;
  } | null>(null);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(
    () =>
      subscribeToCompletionCelebrations((kind) => {
        if (reduceMotion) return;
        setActive({ id: Date.now(), kind });
      }),
    [reduceMotion],
  );

  useEffect(() => {
    if (!active) return;
    const timeout = window.setTimeout(() => setActive(null), LIFE_MS + 350);
    return () => window.clearTimeout(timeout);
  }, [active]);

  if (!active || reduceMotion) return null;
  const copy = COPY[active.kind];

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite" role="status">
      <AccentBurst celebrationId={active.id} />
      <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-lg border border-primary/35 bg-card px-4 py-3 text-card-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          {active.kind === 'first-export' ? (
            <Clapperboard className="h-4 w-4" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{copy.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{copy.detail}</span>
        </span>
      </div>
    </div>
  );
}
