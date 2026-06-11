// Per-(widget_token, widget_user_id) thread persistence in localStorage.
// This lets the same visitor resume their thread on page reload without
// requiring a network round-trip first.

const STORAGE_KEY = "urai_chat_widget";

interface Snapshot {
  [widgetToken: string]: {
    [widgetUserId: string]: { thread_id: string };
  };
}

function readAll(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : {};
  } catch {
    return {};
  }
}

function writeAll(snap: Snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Quota exceeded or storage disabled — silently skip.
  }
}

export function loadThread(token: string, userId: string): string | null {
  const snap = readAll();
  return snap[token]?.[userId]?.thread_id ?? null;
}

export function saveThread(token: string, userId: string, threadId: string) {
  const snap = readAll();
  snap[token] = snap[token] ?? {};
  snap[token][userId] = { thread_id: threadId };
  writeAll(snap);
}

export function clearThread(token: string, userId: string) {
  const snap = readAll();
  if (snap[token]) {
    delete snap[token][userId];
    if (Object.keys(snap[token]).length === 0) delete snap[token];
    writeAll(snap);
  }
}
