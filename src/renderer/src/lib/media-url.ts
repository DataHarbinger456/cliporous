/** Convert a native media path into an encoded file URL for renderer media elements. */
export function toMediaFileUrl(nativePath: string): string {
  if (/^(?:file|https?|blob|data):/i.test(nativePath)) return nativePath;
  const normalized = nativePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}
