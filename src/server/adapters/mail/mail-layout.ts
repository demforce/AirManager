import type { Action } from './credential-action';
import type { AppLocale } from '@/i18n/routing';

export type EmailContent = { subject: string; text: string; html: string };

// Only this module constructs fragments. Every string inserted into markup,
// including translated text and attribute values, is escaped by the tag.
type Fragment = { markup: string };
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function html(parts: TemplateStringsArray, ...values: (string | Fragment | Fragment[])[]): Fragment {
  let markup = parts[0];
  for (const [index, value] of values.entries()) {
    if (typeof value === 'string') markup += value.replace(/[&<>"']/g, (char) => entities[char]);
    else if (Array.isArray(value)) markup += value.map((item) => item.markup).join('');
    else markup += value.markup;
    markup += parts[index + 1];
  }
  return { markup };
}

type DigestTable = { headers: [string, string]; rows: { name: string; details: string; flag: string }[] };

function withBreaks(text: string): Fragment[] {
  return text.split(/\r\n|\n|\r/).map((line, index) => index ? html`<br>${line}` : html`${line}`);
}

function paragraphs(text: string, action?: Action): Fragment[] {
  return text.split(/(?:\r?\n){2,}/).map((part) => part === action?.url
    ? html`<p style="margin:20px 0"><a href="${action.url}" style="display:inline-block;padding:12px 20px;background:#263746;color:#ffffff;border-radius:5px;font-weight:700;line-height:24px;text-decoration:underline">${action.label}</a></p>`
    : html`<p style="margin:0 0 16px;font-size:16px;line-height:1.55">${withBreaks(part)}</p>`);
}

function digestTable(table: DigestTable): Fragment {
  return html`<table width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:15px;line-height:1.5">
    <thead><tr><th scope="col" style="width:36%;padding:8px;background:#eff2f4">${table.headers[0]}</th><th scope="col" style="padding:8px;background:#eff2f4">${table.headers[1]}</th></tr></thead>
    <tbody>${table.rows.map((row) => html`<tr>
      <th scope="row" style="vertical-align:top;padding:12px 8px;border-bottom:1px solid #d5dce0">${withBreaks(row.name)}</th>
      <td style="vertical-align:top;padding:12px 8px;border-bottom:1px solid #d5dce0">${withBreaks(row.details)}${row.flag ? html`<p style="margin:4px 0 0;color:#485867">${row.flag.trim()}</p>` : ''}</td>
    </tr>`)}</tbody></table>`;
}

type MailBody = { action: Action } | { intro: string; table: DigestTable };

// The masthead is the single slot for future branding.
function layout(locale: AppLocale, subject: string, heading: string | Fragment, footer: string | Fragment, contents: Fragment[]): string {
  return html`<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title>
<style>@media only screen and (max-width:480px){.mail-outer{padding:12px 6px!important}.mail-inset{padding-left:18px!important;padding-right:18px!important}.mail-title{font-size:24px!important}}</style></head>
<body style="margin:0;padding:0;background:#eff2f4;color:#22303b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.55">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#eff2f4"><tr><td align="center" class="mail-outer" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;table-layout:fixed;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#ffffff;border:1px solid #d5dce0;border-top:4px solid #c18a34;border-radius:6px;overflow-wrap:anywhere;word-wrap:break-word">
<tr><td class="mail-inset" style="padding:18px 32px;border-bottom:1px solid #d5dce0;font-size:21px;font-weight:700;letter-spacing:-.5px;color:#263746">AirManager</td></tr>
<tr><td class="mail-inset" style="padding:26px 32px 18px"><h1 class="mail-title" style="margin:0 0 20px;color:#20303d;font-size:28px;line-height:1.2;letter-spacing:-.4px">${heading}</h1>${contents}</td></tr>
<tr><td class="mail-inset" style="padding:14px 32px;border-top:1px solid #d5dce0;background:#f8f9fa;color:#495967;font-size:13px">${footer}</td></tr>
</table></td></tr></table></body></html>`.markup;
}

export function renderEmail(locale: AppLocale, footer: string, subject: string, text: string, body?: MailBody): EmailContent {
  const contents = body && 'table' in body ? [...paragraphs(body.intro), digestTable(body.table)] : paragraphs(text, body?.action);
  return { subject, text, html: layout(locale, subject, subject, footer, contents) };
}

function bilingual(it: string, en: string) {
  return { text: it + ' / ' + en, formatted: html`${it} / <span lang="en">${en}</span>` };
}

export function renderClubProbe(itFooter: string, enFooter: string): EmailContent {
  const subject = bilingual('AirManager — Email di prova', 'Test email');
  const body = bilingual('Email di prova', 'SMTP test · AirManager.');
  const footer = bilingual(itFooter, enFooter);
  const paragraph = html`<p style="margin:0 0 16px;font-size:16px;line-height:1.55">${body.formatted}</p>`;
  return { subject: subject.text, text: body.text, html: layout('it', subject.text, subject.formatted, footer.formatted, [paragraph]) };
}
