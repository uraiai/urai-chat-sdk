"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Load a Blob once per `key`. `load` is read through a ref so an inline
 * closure does not refetch on every render — only a new key does.
 *
 * Previews go through blobs rather than URLs because every widget read
 * needs the `X-Widget-User-Id` header: the path-embedded widget token
 * alone would let any visitor of the same widget read another visitor's
 * files.
 */
export function useBlob(
  key: unknown,
  load: () => Promise<Blob | null> | Blob | null,
): Blob | null {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    void Promise.resolve()
      .then(() => loadRef.current())
      .catch(() => null)
      .then((b) => {
        if (!cancelled) setBlob(b);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return blob;
}

/** An object URL for `blob`, revoked when the blob changes or on unmount. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
