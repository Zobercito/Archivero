import { handleDemoRequest } from './api';
import { DEMO_UPLOAD_PREFIX, type PendingUpload } from './state';
import { demoState, resetDemoState } from './store';

let installed = false;

const nativeFetch = window.fetch.bind(window);
const nativeOpen = XMLHttpRequest.prototype.open;
const nativeSend = XMLHttpRequest.prototype.send;

const requestUrls = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

function demoResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, window.location.origin);

  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    return nativeFetch(input, init);
  }

  const method = request.method.toUpperCase();
  let body: unknown = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const text = await request.clone().text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
  }

  try {
    return await handleDemoRequest({ method, url, body });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado de la demo.';
    return demoResponse({ error: { code: 'DEMO_ERROR', message } }, 500);
  }
}

function reportProgress(xhr: XMLHttpRequest, loaded: number, total: number) {
  const handler = xhr.upload.onprogress;
  if (!handler) return;
  const event = new ProgressEvent('progress', {
    lengthComputable: true,
    loaded,
    total,
  }) as ProgressEvent<XMLHttpRequestEventTarget>;
  handler.call(xhr, event);
}

function finish(xhr: XMLHttpRequest, status: number, ticket: string | null) {
  const pending: PendingUpload | undefined = ticket ? demoState().pending.get(ticket) : undefined;
  const finalStatus = status === 200 && !pending?.blob ? 404 : status;

  Object.defineProperty(xhr, 'status', { value: finalStatus, configurable: true });
  Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(xhr, 'responseText', { value: '', configurable: true });
  Object.defineProperty(xhr, 'responseURL', {
    value: ticket ? `${DEMO_UPLOAD_PREFIX}${encodeURIComponent(ticket)}` : '',
    configurable: true,
  });

  xhr.dispatchEvent(new ProgressEvent('load'));
  xhr.dispatchEvent(new ProgressEvent('loadend'));
}

function simulateUpload(xhr: XMLHttpRequest, file: File) {
  const info = requestUrls.get(xhr);
  const ticket = info ? decodeURIComponent(info.url.slice(DEMO_UPLOAD_PREFIX.length)) : null;
  const pending = ticket ? demoState().pending.get(ticket) : undefined;

  if (!ticket || !pending) {
    window.setTimeout(() => finish(xhr, 404, ticket), 0);
    return;
  }

  pending.blob = file;
  const total = file.size;
  const steps = [0.3, 0.65, 1];
  let index = 0;

  const tick = () => {
    const ratio = steps[index] ?? 1;
    reportProgress(xhr, Math.round(total * ratio), total);
    index += 1;
    if (index < steps.length) {
      window.setTimeout(tick, 60 + Math.random() * 40);
    } else {
      window.setTimeout(() => finish(xhr, 200, ticket), 80);
    }
  };

  window.setTimeout(tick, 40);
}

function installFetch() {
  window.fetch = demoFetch as typeof window.fetch;
}

function installXhr() {
  XMLHttpRequest.prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    user?: string | null,
    password?: string | null,
  ) {
    requestUrls.set(this, { method, url: String(url) });
    return nativeOpen.call(this, method, url, async ?? true, user ?? null, password ?? null);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function send(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const info = requestUrls.get(this);
    if (info && info.method.toUpperCase() === 'PUT' && info.url.startsWith(DEMO_UPLOAD_PREFIX)) {
      if (body instanceof File) {
        simulateUpload(this, body);
      } else {
        window.setTimeout(() => finish(this, 400, null), 0);
      }
      return;
    }
    return nativeSend.call(this, body);
  };
}

export function installDemoBackend() {
  if (installed) return;
  installed = true;
  resetDemoState();
  installFetch();
  installXhr();
}
