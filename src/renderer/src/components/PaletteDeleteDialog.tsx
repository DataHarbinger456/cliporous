import type { Palette } from '@shared/palettes';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

export interface PaletteDeleteDialogProps {
  palette: Palette | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (palette: Palette) => void;
}

/** Shared destructive state for palette cards and the palette editor. */
export function PaletteDeleteDialog({
  palette,
  open,
  onOpenChange,
  onConfirm,
}: PaletteDeleteDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {palette?.name ?? 'this palette'}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the palette from every picker. The open project and Creator Profiles using
            it return to Brand Default so future renders stay valid.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep palette</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className={buttonVariants({ variant: 'destructive' })}
            onClick={() => {
              if (palette) onConfirm(palette);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete palette
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
