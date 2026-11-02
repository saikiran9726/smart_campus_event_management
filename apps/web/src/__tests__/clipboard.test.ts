import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from '@/lib/clipboard';

describe('copyToClipboard Utility Suite', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    document.execCommand = originalExecCommand;
  });

  it('1. Utility success: returns true when navigator.clipboard.writeText resolves', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('https://example.com/events/hackathon');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/events/hackathon');
  });

  it('2. Permission denial: falls back gracefully without unhandled rejection when writeText rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(
      new DOMException("Failed to execute 'writeText' on 'Clipboard': Write permission denied.", 'NotAllowedError')
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    // Make execCommand return true for fallback
    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    const result = await copyToClipboard('test-token');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalled();
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('3. Missing API: falls back when navigator.clipboard is undefined', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    const result = await copyToClipboard('https://eventora.campus.edu');
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('4. Fallback success: cleans up temporary textarea and returns true', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    let appendedTextArea: HTMLTextAreaElement | null = null;
    const originalAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLTextAreaElement) {
        appendedTextArea = node;
      }
      return originalAppendChild(node);
    });

    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await copyToClipboard('content-to-copy');
    expect(result).toBe(true);
    // Verify textarea was appended and then cleaned up
    expect(appendedTextArea).not.toBeNull();
    expect(document.body.contains(appendedTextArea)).toBe(false);
  });

  it('5. Fallback failure: returns false and cleans up temporary textarea when execCommand fails or throws', async () => {
    // Both writeText and execCommand fail
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
      writable: true,
    });

    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('execCommand copy disabled in security sandbox');
    });

    const result = await copyToClipboard('secret-value');
    expect(result).toBe(false);
    // Ensure no residual textarea elements left in document.body
    const textareas = document.body.querySelectorAll('textarea[aria-hidden="true"]');
    expect(textareas.length).toBe(0);
  });
});
