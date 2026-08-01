import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";
import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";

describe("useIsMobile", () => {
  let matchMediaListeners: Record<string, Function[]> = {};
  let removeEventListenerMock: any;

  beforeEach(() => {
    matchMediaListeners = {};
    removeEventListenerMock = vi.fn((event, listener) => {
      if (matchMediaListeners[event]) {
        matchMediaListeners[event] = matchMediaListeners[event].filter(
          l => l !== listener
        );
      }
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event, listener) => {
          if (!matchMediaListeners[event]) {
            matchMediaListeners[event] = [];
          }
          matchMediaListeners[event].push(listener);
        }),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should return false for desktop", async () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());

    // Wait for the setTimeout in useEffect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current).toBe(false);
  });

  test("should return true for mobile", async () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current).toBe(true);
  });

  test("should update when resize event triggers", async () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current).toBe(false);

    window.innerWidth = 500;

    act(() => {
      if (matchMediaListeners["change"]) {
        matchMediaListeners["change"].forEach(listener => listener({} as any));
      }
    });

    expect(result.current).toBe(true);
  });

  test("should cleanup event listener on unmount", async () => {
    const { unmount } = renderHook(() => useIsMobile());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(matchMediaListeners["change"]?.length).toBe(1);

    unmount();

    expect(removeEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
    expect(matchMediaListeners["change"]?.length).toBe(0);
  });
});
