/**
 * Safely copies text to the clipboard with modern API and legacy fallback support.
 * Guaranteed never to throw or produce an unhandled promise rejection.
 *
 * @param text The string to copy.
 * @returns Promise<boolean> true if copying succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  // 1. Primary path: Modern W3C Clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, unfocused document, or sandbox policy restriction.
      // Fall through to legacy DOM copy.
    }
  }

  // 2. Fallback path: document.execCommand('copy') with guaranteed DOM cleanup
  try {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
      return false;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    textArea.setAttribute('aria-hidden', 'true');

    document.body.appendChild(textArea);
    try {
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      return Boolean(successful);
    } finally {
      if (textArea.parentNode) {
        textArea.parentNode.removeChild(textArea);
      }
    }
  } catch {
    return false;
  }
}
