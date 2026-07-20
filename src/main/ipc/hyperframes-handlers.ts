// ---------------------------------------------------------------------------
// HyperFrames IPC handlers — renderer-facing overlay rendering API
// ---------------------------------------------------------------------------

import { Ch } from '@shared/ipc-channels';
import { ipcMain } from 'electron';
import { renderOverlay } from '../hyperframes/renderer';
import type {
  BaseOverlayProps,
  OverlayBlockName,
  OverlayRequest,
  OverlayTiming,
} from '../hyperframes/types';
import { wrapHandler } from '../ipc-error-handler';

/** Payload the renderer sends to request a single overlay render. */
interface RenderOverlayPayload {
  block: OverlayBlockName;
  props: BaseOverlayProps;
  timing: OverlayTiming;
}

export function registerHyperFramesHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.HYPERFRAMES_RENDER_OVERLAY,
    wrapHandler(
      Ch.Invoke.HYPERFRAMES_RENDER_OVERLAY,
      async (_event, payload: RenderOverlayPayload) => {
        const request: OverlayRequest = {
          block: payload.block,
          props: payload.props,
          timing: payload.timing,
        };
        return renderOverlay(request);
      },
    ),
  );
}
