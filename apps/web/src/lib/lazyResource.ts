import { useEffect, useState } from "react";

export interface LazyResource<T> {
  /** Starts loading once; a failed load is retried on the next call. */
  load: () => Promise<T>;
  /** The loaded value, for synchronous renderers, or null until it has loaded. */
  peek: () => T | null;
}

/** A large module or dataset fetched on first use and shared by every caller. */
export function lazyResource<T>(loader: () => Promise<T>): LazyResource<T> {
  let promise: Promise<T> | null = null;
  let value: T | null = null;

  return {
    load() {
      promise ??= loader().then(
        (loaded) => (value = loaded),
        (error: unknown) => {
          promise = null;
          throw error;
        }
      );
      return promise;
    },
    peek: () => value
  };
}

/** Renders with the resource once loaded; starts loading while `enabled`. */
export function useLazyResource<T>(resource: LazyResource<T>, enabled = true): T | null {
  const [value, setValue] = useState<T | null>(resource.peek);

  useEffect(() => {
    if (!enabled || value) return;
    let active = true;
    void resource.load().then((loaded) => {
      if (active) setValue(loaded);
    }, () => undefined);
    return () => {
      active = false;
    };
  }, [enabled, resource, value]);

  return value;
}
