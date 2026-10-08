import { onScopeDispose, shallowRef, watch, type ShallowRef } from "vue";

/**
 * Load a Blob once per `key`. Only a new key refetches.
 *
 * Previews go through blobs rather than URLs because every widget read
 * needs the `X-Widget-User-Id` header: the path-embedded widget token alone
 * would let any visitor of the same widget read another visitor's files.
 */
export function useBlob(
  key: () => unknown,
  load: () => Promise<Blob | null> | Blob | null,
): Readonly<ShallowRef<Blob | null>> {
  const blob = shallowRef<Blob | null>(null);
  watch(
    key,
    (_k, _old, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      blob.value = null;
      void Promise.resolve()
        .then(() => load())
        .catch(() => null)
        .then((b) => {
          if (!cancelled) blob.value = b;
        });
    },
    { immediate: true },
  );
  return blob;
}

/** An object URL for `blob`, revoked when the blob changes or on unmount. */
export function useObjectUrl(
  blob: () => Blob | null,
): Readonly<ShallowRef<string | null>> {
  const url = shallowRef<string | null>(null);
  let current: string | null = null;
  const revoke = () => {
    if (current) URL.revokeObjectURL(current);
    current = null;
  };
  watch(
    blob,
    (b) => {
      revoke();
      current = b ? URL.createObjectURL(b) : null;
      url.value = current;
    },
    { immediate: true },
  );
  onScopeDispose(revoke);
  return url;
}
