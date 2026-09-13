/**
 * Hand a Blob to the browser's download manager under `fileName`.
 *
 * Widget reads are fetched with the visitor header, so a download can
 * never be a plain link to the server; this is the one place a fetched
 * blob becomes a saved file. The object URL is revoked after the click
 * has had a turn to start the download.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
