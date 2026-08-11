/**
 * Serialize an object as safe JSON-LD. Imported/untrusted strings can contain
 * `</script>`, which would terminate the JSON-LD script element. Escaping
 * `<`, `>`, `&` and the unicode line separators to unicode escapes keeps the
 * JSON valid and the surrounding markup intact.
 */
export function safeJsonLd (value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
