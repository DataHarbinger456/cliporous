import { FileVideo, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatorProfiles } from '@/services/creator-profiles';

export interface NewProjectDraft {
  name: string;
  outputMode: 'short' | 'longform';
  source: { kind: 'file' | 'url'; value: string };
  profileId?: string;
  brief?: {
    audience: string;
    goal: string;
    callToAction: string;
  };
}

interface NewProjectDialogProps {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseFile: () => Promise<string | null>;
  onCreate: (draft: NewProjectDraft) => void;
}

function filenameStem(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? '';
  return filename.replace(/\.[^.]+$/, '');
}

export function NewProjectDialog({
  open,
  busy,
  onOpenChange,
  onChooseFile,
  onCreate,
}: NewProjectDialogProps): React.JSX.Element {
  const profiles = useCreatorProfiles();
  const [name, setName] = useState('');
  const [outputMode, setOutputMode] = useState<'short' | 'longform'>('short');
  const [filePath, setFilePath] = useState('');
  const [url, setUrl] = useState('');
  const [profileId, setProfileId] = useState('none');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setOutputMode('short');
    setFilePath('');
    setUrl('');
    setProfileId('none');
    setAudience('');
    setGoal('');
    setCallToAction('');
    setError(null);
  }, [open]);

  const chooseFile = async (): Promise<void> => {
    const selectedPath = await onChooseFile();
    if (!selectedPath) return;
    setFilePath(selectedPath);
    setUrl('');
    setName((current) => current || filenameStem(selectedPath));
    setError(null);
  };

  const create = (): void => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setError('Enter a project name.');
      return;
    }
    if (!filePath && !trimmedUrl) {
      setError('Choose a video or paste a YouTube URL.');
      return;
    }
    onCreate({
      name: trimmedName,
      outputMode,
      source: filePath ? { kind: 'file', value: filePath } : { kind: 'url', value: trimmedUrl },
      ...(profileId !== 'none' ? { profileId } : {}),
      ...(audience.trim() || goal.trim() || callToAction.trim()
        ? {
            brief: {
              audience: audience.trim(),
              goal: goal.trim(),
              callToAction: callToAction.trim(),
            },
          }
        : {}),
    });
  };

  const canCreate = name.trim().length > 0 && (filePath.length > 0 || url.trim().length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name the cut, choose its source, and pick the delivery shape. You can refine the brief
            after import.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Creator launch interview"
              autoFocus
              disabled={busy}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Source</legend>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 justify-start gap-3 px-3 py-2 text-left"
              disabled={busy}
              onClick={() => void chooseFile()}
            >
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {filePath ? 'Change video' : 'Choose video'}
                </span>
                <span className="text-muted-foreground block truncate text-xs" title={filePath}>
                  {filePath || 'MP4, MOV, MKV, WEBM, MTS, or M4V'}
                </span>
              </span>
            </Button>

            <div className="flex items-center gap-3 py-1" aria-hidden>
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">or</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <Label htmlFor="new-project-url">YouTube URL</Label>
            <div className="relative">
              <FileVideo
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="new-project-url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (event.target.value) setFilePath('');
                  setError(null);
                }}
                placeholder="https://youtube.com/watch?v=…"
                className="pl-9"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="new-project-output-mode">Output mode</Label>
            <Select
              value={outputMode}
              onValueChange={(value) => setOutputMode(value as 'short' | 'longform')}
              disabled={busy}
            >
              <SelectTrigger id="new-project-output-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short clips (9:16)</SelectItem>
                <SelectItem value="longform">Long-form edit (16:9)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {outputMode === 'short'
                ? 'Find and style multiple vertical moments for social.'
                : 'Build one landscape edit with section and phrase treatments.'}
            </p>
          </div>

          <details className="border-border rounded-lg border px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none">
              Add Creative Brief or Creator Profile (optional)
            </summary>
            <div className="grid gap-4 pt-4">
              {profiles.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="new-project-profile">Creator Profile</Label>
                  <Select value={profileId} onValueChange={setProfileId} disabled={busy}>
                    <SelectTrigger id="new-project-profile">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No reusable profile</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Applies reusable audience, tone, platform, safe-zone, and long-form defaults.
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="new-project-audience">Audience</Label>
                <Input
                  id="new-project-audience"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="Independent founders"
                  disabled={busy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-project-goal">Goal</Label>
                <Input
                  id="new-project-goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="Build trust before launch"
                  disabled={busy}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-project-cta">Call to action</Label>
                <Input
                  id="new-project-cta"
                  value={callToAction}
                  onChange={(event) => setCallToAction(event.target.value)}
                  placeholder="Join the launch list"
                  disabled={busy}
                />
              </div>
            </div>
          </details>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !canCreate} onClick={create}>
            {busy ? 'Creating project…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
