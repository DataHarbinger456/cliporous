import { Clipboard, FolderOpen, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { revealItemLabel } from '@/lib/platform';
import type { RenderProgress } from '@/store/types';

let activeCompletedOutput: HTMLVideoElement | null = null;

interface CompletedOutputCardProps {
  item: RenderProgress;
  poster?: string;
  onRenderAgain: (clipId: string) => void | Promise<void>;
}

function mediaUrl(nativePath: string): string {
  if (nativePath.startsWith('file://')) return nativePath;
  const normalized = nativePath.replace(/\\/g, '/');
  const withLead = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLead).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function fileName(nativePath: string): string {
  return nativePath.split(/[/\\]/).pop() || nativePath;
}

export function CompletedOutputCard({
  item,
  poster,
  onRenderAgain,
}: CompletedOutputCardProps): React.JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(
    () => () => {
      if (activeCompletedOutput === videoRef.current) activeCompletedOutput = null;
    },
    [],
  );

  if (!item.outputPath) return null;

  const togglePlayback = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (activeCompletedOutput && activeCompletedOutput !== video) {
        activeCompletedOutput.pause();
      }
      activeCompletedOutput = video;
      await video.play();
    } else {
      video.pause();
    }
  };

  const copyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(item.outputPath as string);
      toast.success('Output path copied');
    } catch {
      toast.error("Couldn't copy the output path");
    }
  };

  return (
    <Card className="media-list-item overflow-hidden border-border/80 bg-card/85">
      <div className="aspect-video bg-muted">
        <video
          ref={videoRef}
          src={mediaUrl(item.outputPath)}
          poster={poster}
          preload="none"
          muted
          playsInline
          className="h-full w-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            if (activeCompletedOutput === videoRef.current) activeCompletedOutput = null;
          }}
          aria-label={`Completed output: ${item.label ?? fileName(item.outputPath)}`}
        />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-foreground">
          {item.label ?? fileName(item.outputPath)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={item.outputPath}>
          {fileName(item.outputPath)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void togglePlayback()}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.showItemInFolder(item.outputPath as string)}
          >
            <FolderOpen aria-hidden />
            {revealItemLabel()}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyPath()}>
            <Clipboard aria-hidden /> Copy path
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onRenderAgain(item.clipId)}>
            <RotateCcw aria-hidden /> Render again
          </Button>
        </div>
      </div>
    </Card>
  );
}
