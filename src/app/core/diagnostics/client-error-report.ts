// What the app tells our own API about one of its unhandled errors (API: POST /api/client-telemetry/errors).
//
// Privacy by construction, mirrored by the server (ClientErrorSanitizer): only the fields below leave the device;
// no account id, no token, no form content, no URL query. The server also cuts and scrubs everything again, so
// this file is the first filter, not the only one. See docs/privacy/analytics-inventory.md in the API repo.

import { isChunkLoadError } from '../services/stale-chunk-reload';

export type ClientErrorKind = 'js' | 'promise' | 'render' | 'chunk' | 'http' | 'native' | 'other';
export type ClientPlatform = 'web' | 'android' | 'ios';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  platform: ClientPlatform;
  appVersion: string;
  route: string;
  name: string;
  message: string;
  source: string;
  line: number | null;
  column: number | null;
  stack: string;
}

export const MAX_REPORTS_PER_PAGE = 10;
export const MAX_REPORTS_PER_REQUEST = 5;
const MAX_MESSAGE = 500;
const MAX_STACK = 1500;

/** Path only: the server also drops ids, but a query string or fragment must never leave the device. */
export function routeOf(url: string): string {
  const cut = url.search(/[?#]/);
  const path = cut >= 0 ? url.slice(0, cut) : url;
  return path || '/';
}

export function kindOf(error: unknown, fromPromise: boolean): ClientErrorKind {
  if (isChunkLoadError(error)) {
    return 'chunk';
  }
  return fromPromise ? 'promise' : 'js';
}

/** Name, message and a first-frame location from whatever was thrown (Error, string, object, anything). */
export function describeError(error: unknown): Pick<ClientErrorReport, 'name' | 'message' | 'stack' | 'source' | 'line' | 'column'> {
  let name = 'Error';
  let message = '';
  let stack = '';

  if (error instanceof Error) {
    name = error.name || 'Error';
    message = error.message;
    stack = error.stack ?? '';
  } else if (typeof error === 'string') {
    message = error;
  } else if (error !== null && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; stack?: unknown };
    name = typeof candidate.name === 'string' ? candidate.name : 'Object';
    message = typeof candidate.message === 'string' ? candidate.message : '';
    stack = typeof candidate.stack === 'string' ? candidate.stack : '';
  } else if (error !== undefined) {
    message = String(error);
  }

  const frame = firstFrame(stack);
  return {
    name: name.slice(0, 120),
    message: message.slice(0, MAX_MESSAGE),
    stack: stack.slice(0, MAX_STACK),
    source: frame?.source ?? '',
    line: frame?.line ?? null,
    column: frame?.column ?? null
  };
}

const FRAME_PATTERN = /(https?:\/\/[^\s)]+|[\w./-]+\.(?:js|mjs|ts)):(\d+):(\d+)/;

/** A script address reduced to its path: the host and query of our own bundle are of no use in a report. */
function pathOnly(address: string): string {
  if (/^https?:\/\//i.test(address)) {
    try {
      return new URL(address).pathname || '/';
    } catch {
      return '/';
    }
  }
  return routeOf(address);
}

function firstFrame(stack: string): { source: string; line: number; column: number } | null {
  const match = FRAME_PATTERN.exec(stack);
  if (!match) {
    return null;
  }
  return { source: pathOnly(match[1]), line: Number(match[2]), column: Number(match[3]) };
}

/** Same error, same place: one report is enough. Message digits are dropped so "item 12" and "item 13" collapse. */
export function fingerprint(report: Pick<ClientErrorReport, 'kind' | 'name' | 'message' | 'route'>): string {
  return [report.kind, report.name, report.message.replace(/\d+/g, '#').slice(0, 120), report.route].join('|');
}
