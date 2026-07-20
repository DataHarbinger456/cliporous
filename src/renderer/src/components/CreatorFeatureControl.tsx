import { CheckCircle2, CircleOff, Info, LockKeyhole } from 'lucide-react';
import type * as React from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type FeatureAvailability = 'ready' | 'limited' | 'locked';

const AVAILABILITY_LABELS: Record<FeatureAvailability, string> = {
  ready: 'Ready',
  limited: 'Limited',
  locked: 'Locked',
};

const AVAILABILITY_ICONS = {
  ready: CheckCircle2,
  limited: Info,
  locked: LockKeyhole,
} as const;

export function FeatureAvailabilityLabel({
  availability,
  reason,
  className,
}: {
  availability: FeatureAvailability;
  reason: string;
  className?: string;
}): React.JSX.Element {
  const Icon = AVAILABILITY_ICONS[availability];
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-[11px] leading-4',
        availability === 'ready' ? 'text-muted-foreground' : 'text-warning-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">{AVAILABILITY_LABELS[availability]}.</span>{' '}
        {reason}
      </span>
    </p>
  );
}

interface CreatorFeatureControlProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  availability?: FeatureAvailability;
  reason: string;
  disabled?: boolean;
  locked?: boolean;
  children?: React.ReactNode;
}

export function CreatorFeatureControl({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  availability = 'ready',
  reason,
  disabled = false,
  locked = false,
  children,
}: CreatorFeatureControlProps): React.JSX.Element {
  const descriptionId = `${id}-description`;
  return (
    <section className="border-b border-border/70 px-3 py-3 last:border-b-0" aria-labelledby={id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label
            id={id}
            htmlFor={locked ? undefined : `${id}-toggle`}
            className="text-sm font-medium"
          >
            {title}
          </Label>
          <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {locked ? (
          <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 text-[11px] font-medium text-primary">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            On
          </span>
        ) : (
          <Switch
            id={`${id}-toggle`}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-describedby={descriptionId}
          />
        )}
      </div>
      <FeatureAvailabilityLabel availability={availability} reason={reason} className="mt-2" />
      {children && checked ? (
        <div className="mt-3 border-l-2 border-primary/30 pl-3">{children}</div>
      ) : null}
    </section>
  );
}

export type FeatureOverrideValue = 'preset' | 'on' | 'off';

export function FeatureOverrideSelect({
  id,
  label,
  value,
  onValueChange,
  reason,
}: {
  id: string;
  label: string;
  value: FeatureOverrideValue;
  onValueChange: (value: FeatureOverrideValue) => void;
  reason: string;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{reason}</p>
      </div>
      <Select value={value} onValueChange={(next) => onValueChange(next as FeatureOverrideValue)}>
        <SelectTrigger id={id} className="h-8 text-xs" aria-label={`${label} override`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="preset">Use preset</SelectItem>
          <SelectItem value="on">On for clip</SelectItem>
          <SelectItem value="off">Off for clip</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PreviewFeatureFeedback({
  title,
  detail,
  active,
  previewed,
}: {
  title: string;
  detail: string;
  active: boolean;
  previewed: boolean;
}): React.JSX.Element {
  const Icon = active ? CheckCircle2 : CircleOff;
  return (
    <li className="flex items-start gap-2 py-1.5">
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 text-[11px] leading-4">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground"> · {active ? detail : 'Off for this clip'}</span>
        {active ? (
          <span
            className={cn('ml-1 font-medium', previewed ? 'text-primary' : 'text-muted-foreground')}
          >
            {previewed ? 'Previewed' : 'Export only'}
          </span>
        ) : null}
      </div>
    </li>
  );
}
