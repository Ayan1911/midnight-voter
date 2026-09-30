/**
 * toastNotifier.ts - Lightweight toast notification system for the auction DApp.
 *
 * Injects a toast container into the DOM on first use; no additional libraries needed.
 * Supports success, error, warning, and info severity levels with auto-dismiss.
 */

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** Duration in milliseconds before auto-dismiss. Default: 4500ms. Pass 0 to disable. */
  duration?: number;
  /** Whether to show a close button. Default: true. */
  closeable?: boolean;
  /** Optional action label and callback rendered as a button inside the toast. */
  action?: { label: string; onClick: () => void };
}

const CONTAINER_ID = 'toast-container';
const TOAST_STYLES: Record<ToastSeverity, string> = {
  success: 'border-color:#10b981;background:rgba(16,185,129,0.12);',
  error:   'border-color:#ef4444;background:rgba(239,68,68,0.12);',
  warning: 'border-color:#f59e0b;background:rgba(245,158,11,0.12);',
  info:    'border-color:#3b82f6;background:rgba(59,130,246,0.12);',
};
const TOAST_ICONS: Record<ToastSeverity, string> = {
  success: '✓', error: '✗', warning: '⚠', info: 'ℹ',
};

function ensureContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.style.cssText = [
      'position:fixed', 'bottom:1.5rem', 'right:1.5rem',
      'z-index:9999', 'display:flex', 'flex-direction:column', 'gap:0.75rem',
      'max-width:360px', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification.
 * Returns a dismiss function for programmatic removal.
 */
export function showToast(
  message: string,
  severity: ToastSeverity = 'info',
  options: ToastOptions = {}
): () => void {
  const { duration = 4500, closeable = true, action } = options;
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.style.cssText = [
    'display:flex', 'align-items:flex-start', 'gap:0.75rem',
    'padding:0.875rem 1rem', 'border-radius:0.625rem',
    'border:1px solid', 'backdrop-filter:blur(12px)',
    'color:#f8fafc', 'font-family:Inter,sans-serif', 'font-size:0.875rem',
    'pointer-events:all', 'transition:opacity 0.3s,transform 0.3s',
    'opacity:0', 'transform:translateX(1rem)',
    TOAST_STYLES[severity],
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = TOAST_ICONS[severity];
  icon.style.cssText = 'flex-shrink:0;font-weight:700;margin-top:1px;';
  toast.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = message;
  text.style.cssText = 'flex:1;line-height:1.4;';
  toast.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.style.cssText = [
      'background:none', 'border:none', 'color:#93c5fd', 'cursor:pointer',
      'font-size:0.8rem', 'font-weight:600', 'white-space:nowrap', 'padding:0',
    ].join(';');
    btn.addEventListener('click', () => { action.onClick(); dismiss(); });
    toast.appendChild(btn);
  }

  if (closeable) {
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.style.cssText = [
      'background:none', 'border:none', 'color:#94a3b8', 'cursor:pointer',
      'font-size:1.1rem', 'line-height:1', 'padding:0', 'flex-shrink:0',
    ].join(';');
    closeBtn.addEventListener('click', dismiss);
    toast.appendChild(closeBtn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  let timerId: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timerId = setTimeout(dismiss, duration);
  }

  function dismiss(): void {
    if (timerId) clearTimeout(timerId);
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(1rem)';
    setTimeout(() => toast.remove(), 320);
  }

  return dismiss;
}

/** Convenience wrappers. */
export const toast = {
  success: (msg: string, opts?: ToastOptions) => showToast(msg, 'success', opts),
  error:   (msg: string, opts?: ToastOptions) => showToast(msg, 'error',   opts),
  warning: (msg: string, opts?: ToastOptions) => showToast(msg, 'warning', opts),
  info:    (msg: string, opts?: ToastOptions) => showToast(msg, 'info',    opts),
};
