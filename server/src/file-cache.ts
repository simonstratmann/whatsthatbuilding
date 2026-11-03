// Writing downloads into the GML file cache, which both images (and the import commands) share.
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

/**
 * Writes the response's body to `path`. The file only appears, by renaming, once it is
 * complete, so a file in the cache is always whole; a download that breaks off leaves nothing.
 * Each download writes its own part file, so two processes fetching the same file don't clash.
 */
export async function saveBody(response: Response, path: string): Promise<void> {
  if (!response.body) throw new Error(`The answer for ${path} has no body`);
  const part = `${path}.${randomUUID()}.part`;
  try {
    // The DOM's stream type, when the web package's type check reaches this file, isn't Node's.
    await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), createWriteStream(part));
    await rename(part, path);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

export async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}
