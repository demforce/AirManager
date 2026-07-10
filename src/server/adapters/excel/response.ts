import { NextResponse } from 'next/server';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Builds the binary xlsx `NextResponse` (story 10.1, AC 1): the two headers
 * a browser needs to save it as a real `.xlsx` file download (`Content-Type`
 * + `Content-Disposition: attachment`). `apiRoute`'s pass-through
 * (`src/lib/api/handler.ts`) returns this untouched — no JSON envelope
 * wraps it.
 */
export function xlsxResponse(buffer: Buffer, filename: string): NextResponse {
  // `Buffer` (Node's `Uint8Array` subclass) isn't structurally assignable to
  // the DOM `BodyInit` type `NextResponse`'s constructor expects — wrapping
  // it in a plain `Uint8Array` (a real, zero-copy view over the same bytes)
  // satisfies the type without re-allocating the buffer.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
