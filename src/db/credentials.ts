/**
 * Copying a long token out of a web dashboard can pick up invisible characters
 * — a U+2028 line separator where the text wrapped, a stray newline, a
 * non-breaking space. None can legitimately appear in a URL or a token, but any
 * of them makes the driver fail deep inside the HTTP layer with a message about
 * ByteString conversion that says nothing about the real problem.
 */
export function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const stripped = value.replace(/\s+/g, "");

  const bad = [...stripped].find((c) => c.codePointAt(0)! > 0xff);
  if (bad !== undefined) {
    throw new Error(
      `DATABASE_URL or DATABASE_AUTH_TOKEN contains the character ${JSON.stringify(bad)} ` +
        `(U+${bad.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}), which can't be sent ` +
        "in an HTTP request. Re-copy the value from Turso using its copy button rather than " +
        "selecting the text, and redeploy.",
    );
  }
  return stripped;
}
