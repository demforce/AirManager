import { NextResponse } from 'next/server';

const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * Builds the binary PDF `NextResponse` (story 10.2, AC 2) — the PDF
 * counterpart of `adapters/excel/response.ts#xlsxResponse`, same
 * `Uint8Array` wrapping rationale (a `Buffer` is not structurally
 * assignable to the DOM `BodyInit` type).
 */
export function pdfResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': PDF_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
