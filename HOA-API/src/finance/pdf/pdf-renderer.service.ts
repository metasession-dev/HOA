import { Injectable } from '@nestjs/common';
import * as React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { BoardPackPDF, BoardPackData } from './board-pack-pdf';

/**
 * Thin wrapper around @react-pdf/renderer so the controller doesn't import
 * React directly. Returns a Node Buffer suitable for `res.send(...)`.
 *
 * `renderToBuffer` is async — it spawns a worker to lay out the document.
 * Don't call inside a request hot path; use the queue for large packs.
 */
@Injectable()
export class PdfRendererService {
  async renderBoardPack(data: BoardPackData): Promise<Buffer> {
    return renderToBuffer(React.createElement(BoardPackPDF, { data }) as any);
  }
}
