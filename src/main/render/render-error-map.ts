import {
  createStructuredError,
  type ErrorRecoveryAction,
  type StructuredError,
} from '@shared/errors';

interface Signature {
  match: RegExp;
  headline: string;
  whatHappened: string;
  whatToDoNext: string;
  recoveryAction: ErrorRecoveryAction;
}

const SIGNATURES: Signature[] = [
  {
    match: /no space left on device|ENOSPC|disk (?:is )?full/i,
    headline: 'There is not enough disk space',
    whatHappened: 'BatchClip ran out of room while writing this output.',
    whatToDoNext: 'Free up space or choose another output folder, then retry.',
    recoveryAction: 'free-space',
  },
  {
    match: /permission denied|EACCES|EROFS|read-only file system/i,
    headline: "BatchClip couldn't write this output",
    whatHappened: 'The selected output location did not allow BatchClip to create the file.',
    whatToDoNext: 'Choose a writable output folder, then retry.',
    recoveryAction: 'open-settings',
  },
  {
    match:
      /matches no streams|does not contain any stream|stream specifier.*matches no|cannot find audio|audio stream.*not found/i,
    headline: 'This source has no usable audio',
    whatHappened: 'The video engine could not find the audio track needed for this clip.',
    whatToDoNext: 'Use a source with audio, or re-export it with an audio track.',
    recoveryAction: 'relink',
  },
  {
    match:
      /unknown encoder|encoder.*not found|unknown decoder|decoder.*not found|unsupported codec|codec not currently supported|could not find tag for codec/i,
    headline: 'This video format is not supported',
    whatHappened: 'The video engine could not decode or encode this media format.',
    whatToDoNext: 'Convert the source to a standard H.264 MP4, relink it, then retry.',
    recoveryAction: 'relink',
  },
  {
    match:
      /moov atom not found|invalid data found when processing input|error (?:while )?opening input|could not (?:open|find codec parameters)|no such file or directory|ENOENT|end of file/i,
    headline: 'The source media could not be read',
    whatHappened: 'The source may be missing, incomplete, or damaged.',
    whatToDoNext: 'Relink a healthy copy of the source video, then retry.',
    recoveryAction: 'relink',
  },
];

export function classifyRenderError(rawError: string): StructuredError {
  const raw = (rawError ?? '').trim();
  const signature = SIGNATURES.find((candidate) => candidate.match.test(raw));

  return createStructuredError({
    source: 'render',
    message: raw,
    failedStage: 'rendering',
    whatIsSafe: 'Completed outputs and your clip edits are still safe.',
    retryable: true,
    ...(signature
      ? {
          headline: signature.headline,
          whatHappened: signature.whatHappened,
          whatToDoNext: signature.whatToDoNext,
          recoveryAction: signature.recoveryAction,
        }
      : {}),
  });
}
