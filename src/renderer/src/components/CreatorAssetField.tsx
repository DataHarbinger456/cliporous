import { FileImage, FolderSearch, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface CreatorAssetFieldProps {
  label: string;
  description: string;
  kind: 'logo' | 'evidence' | 'cta' | 'reference';
  paths: string[];
  onChange: (paths: string[]) => void;
  single?: boolean;
  missingPaths?: ReadonlySet<string>;
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function CreatorAssetField({
  label,
  description,
  kind,
  paths,
  onChange,
  single = false,
  missingPaths = new Set<string>(),
}: CreatorAssetFieldProps): React.JSX.Element {
  const [adding, setAdding] = useState(false);

  const addAsset = async (): Promise<void> => {
    setAdding(true);
    try {
      const path = await window.api.selectCreatorAsset(kind);
      if (!path) return;
      onChange(single ? [path] : Array.from(new Set([...paths, path])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Couldn't add ${label.toLowerCase()}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="grid min-w-0 gap-2" aria-labelledby={`creator-assets-${kind}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={`creator-assets-${kind}`} className="text-sm font-medium">
            {label}
          </h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 shrink-0"
          disabled={adding}
          onClick={() => void addAsset()}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {adding ? 'Adding…' : paths.length && single ? 'Replace' : 'Add'}
        </Button>
      </div>

      {paths.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          No {label.toLowerCase()} saved.
        </div>
      ) : (
        <ul className="grid gap-1.5">
          {paths.map((path) => (
            <li
              key={path}
              className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-muted/35 px-2"
            >
              <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs" title={path}>
                {basename(path)}
              </span>
              {missingPaths.has(path) && (
                <span className="shrink-0 text-[11px] font-medium text-destructive">Missing</span>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={`Reveal ${basename(path)}`}
                onClick={() => void window.api.showItemInFolder(path)}
              >
                <FolderSearch className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                aria-label={`Remove ${basename(path)} from profile`}
                onClick={() => onChange(paths.filter((item) => item !== path))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
