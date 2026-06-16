// Shadow-DOM styles. Uses CSS variables set by theme.ts so runtime theme
// changes don't require restyling.

export const baseStyles = `
:host {
  all: initial;
  font-family: var(--ucw-font);
  color: var(--ucw-text);
}
[data-theme="dark"] {
  --ucw-background: #0f172a;
  --ucw-surface: #1e293b;
  --ucw-text: #f1f5f9;
  --ucw-muted: #94a3b8;
  --ucw-border: #334155;
  --ucw-asst-bg: #1e293b;
  --ucw-asst-text: #f1f5f9;
}
.ucw-root {
  position: fixed;
  z-index: 2147483647;
  font-family: var(--ucw-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ucw-text);
  box-sizing: border-box;
}
.ucw-root * { box-sizing: border-box; }
.ucw-root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
.ucw-root[data-position="bottom-left"]  { left: 20px;  bottom: 20px; }
.ucw-root[data-mode="inline"] {
  position: static;
  width: 100%;
}

.ucw-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border: none;
  border-radius: 9999px;
  background: var(--ucw-primary);
  color: var(--ucw-primary-text);
  font-family: var(--ucw-font);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--ucw-shadow);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.ucw-button:hover { transform: translateY(-1px); }
.ucw-button:focus-visible { outline: 2px solid var(--ucw-primary); outline-offset: 2px; }
.ucw-button svg { width: 18px; height: 18px; }

.ucw-panel {
  display: flex;
  flex-direction: column;
  width: var(--ucw-w, 380px);
  height: var(--ucw-h, 560px);
  max-height: 90vh;
  background: var(--ucw-background);
  border: 1px solid var(--ucw-border);
  border-radius: var(--ucw-radius);
  box-shadow: var(--ucw-shadow);
  overflow: hidden;
}
.ucw-root[data-mode="floating"] .ucw-panel {
  position: absolute;
  bottom: 64px;
}
.ucw-root[data-mode="floating"][data-position="bottom-right"] .ucw-panel { right: 0; }
.ucw-root[data-mode="floating"][data-position="bottom-left"]  .ucw-panel { left: 0; }
.ucw-root[data-mode="inline"] .ucw-panel { width: 100%; }

.ucw-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--ucw-primary);
  color: var(--ucw-primary-text);
  font-weight: 600;
}
.ucw-header img { width: 24px; height: 24px; border-radius: 6px; }
.ucw-header .ucw-title { flex: 1; }
.ucw-header button {
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 4px; border-radius: 6px; opacity: 0.85;
}
.ucw-header button:hover { opacity: 1; background: rgba(255,255,255,0.15); }
.ucw-header button svg { width: 16px; height: 16px; display: block; }

.ucw-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--ucw-background);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ucw-bubble {
  padding: 10px 12px;
  border-radius: 12px;
  max-width: 85%;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
}
.ucw-bubble.ucw-user {
  align-self: flex-end;
  background: var(--ucw-user-bg);
  color: var(--ucw-user-text);
  border-bottom-right-radius: 4px;
}
.ucw-bubble.ucw-assistant {
  align-self: flex-start;
  background: var(--ucw-asst-bg);
  color: var(--ucw-asst-text);
  border-bottom-left-radius: 4px;
}
.ucw-bubble.ucw-error {
  align-self: stretch;
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  font-size: 13px;
}
.ucw-bubble p:first-child { margin-top: 0; }
.ucw-bubble p:last-child { margin-bottom: 0; }
.ucw-bubble pre {
  background: rgba(0,0,0,0.06);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}
.ucw-bubble code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ucw-bubble a { color: var(--ucw-primary); }

.ucw-suggested {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.ucw-suggested button {
  border: 1px solid var(--ucw-border);
  background: var(--ucw-surface);
  color: var(--ucw-text);
  padding: 6px 10px;
  border-radius: 9999px;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--ucw-font);
}
.ucw-suggested button:hover { border-color: var(--ucw-primary); color: var(--ucw-primary); }

.ucw-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--ucw-border);
  background: var(--ucw-surface);
}
.ucw-composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.ucw-attach-btn {
  flex: 0 0 auto;
  background: transparent;
  color: var(--ucw-muted);
  border: 1px solid var(--ucw-border);
  border-radius: 10px;
  padding: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ucw-font);
}
.ucw-attach-btn:hover { color: var(--ucw-primary); border-color: var(--ucw-primary); }
.ucw-attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ucw-attach-btn svg { width: 18px; height: 18px; }
.ucw-attach-input { display: none; }

.ucw-pending {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ucw-pending-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ucw-background);
  border: 1px solid var(--ucw-border);
  border-radius: 8px;
  padding: 4px 6px 4px 8px;
  font-size: 12px;
  color: var(--ucw-text);
  max-width: 200px;
}
.ucw-pending-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ucw-pending-chip button {
  background: transparent;
  border: none;
  color: var(--ucw-muted);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
}
.ucw-pending-chip button:hover { color: var(--ucw-text); background: var(--ucw-border); }
.ucw-pending-chip button svg { width: 12px; height: 12px; }
.ucw-pending-chip.ucw-pending-uploading { opacity: 0.7; }
.ucw-pending-chip.ucw-pending-error { border-color: #dc2626; color: #dc2626; }

.ucw-tool-activity {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ucw-muted);
  margin-bottom: 6px;
}
.ucw-tool-activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ucw-primary);
  animation: ucw-tool-pulse 1s ease-in-out infinite;
}
@keyframes ucw-tool-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1); }
}

.ucw-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.ucw-attachment-image {
  display: block;
  max-width: 220px;
  max-height: 180px;
  border-radius: 8px;
  border: 1px solid var(--ucw-border);
  object-fit: cover;
  cursor: pointer;
}
.ucw-attachment-file {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--ucw-border);
  border-radius: 8px;
  background: var(--ucw-background);
  color: var(--ucw-text);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  max-width: 220px;
  font-family: var(--ucw-font);
}
.ucw-attachment-file:hover { border-color: var(--ucw-primary); color: var(--ucw-primary); }
.ucw-attachment-file svg { width: 14px; height: 14px; flex: 0 0 auto; }
.ucw-attachment-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ucw-composer textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--ucw-border);
  border-radius: 10px;
  padding: 8px 10px;
  font-family: var(--ucw-font);
  font-size: 14px;
  color: var(--ucw-text);
  background: var(--ucw-background);
  min-height: 36px;
  max-height: 120px;
}
.ucw-composer textarea:focus { outline: none; border-color: var(--ucw-primary); }
.ucw-composer button {
  background: var(--ucw-primary);
  color: var(--ucw-primary-text);
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--ucw-font);
}
.ucw-composer button:disabled { opacity: 0.5; cursor: not-allowed; }

.ucw-footer {
  padding: 6px 14px;
  font-size: 11px;
  color: var(--ucw-muted);
  text-align: center;
  border-top: 1px solid var(--ucw-border);
  background: var(--ucw-surface);
}

.ucw-typing {
  align-self: flex-start;
  font-size: 12px;
  color: var(--ucw-muted);
  font-style: italic;
}

/* ---- Thread switcher dropdown ---- */

.ucw-thread-trigger {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  margin: -4px -6px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.ucw-thread-trigger:hover { background: rgba(255,255,255,0.12); }
.ucw-thread-trigger .ucw-trigger-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.ucw-thread-trigger svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.ucw-thread-trigger[aria-expanded="true"] svg { transform: rotate(180deg); }

.ucw-dropdown {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ucw-background);
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.ucw-dropdown-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ucw-border);
  background: var(--ucw-surface);
}
.ucw-dropdown-search svg {
  width: 14px;
  height: 14px;
  color: var(--ucw-muted);
  flex-shrink: 0;
}
.ucw-dropdown-search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font: inherit;
  font-size: 13px;
  color: var(--ucw-text);
}
.ucw-dropdown-search input::placeholder { color: var(--ucw-muted); }

.ucw-new-conv {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: var(--ucw-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid var(--ucw-border);
}
.ucw-new-conv:hover { background: var(--ucw-surface); }
.ucw-new-conv svg {
  width: 14px;
  height: 14px;
  color: var(--ucw-primary);
}

.ucw-dropdown-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 12px;
}
.ucw-group-label {
  padding: 8px 12px 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ucw-muted);
  font-weight: 600;
}
.ucw-thread-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--ucw-text);
}
.ucw-thread-item:hover { background: var(--ucw-surface); }
.ucw-thread-item[aria-current="true"] {
  background: var(--ucw-surface);
  border-left-color: var(--ucw-primary);
}
.ucw-thread-item .ucw-thread-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ucw-thread-item .ucw-thread-meta {
  font-size: 11px;
  color: var(--ucw-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.ucw-thread-item .ucw-thread-preview {
  font-size: 12px;
  color: var(--ucw-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.ucw-thread-empty {
  padding: 32px 12px;
  text-align: center;
  color: var(--ucw-muted);
  font-size: 12px;
}
`;
