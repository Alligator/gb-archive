// string -> gzip -> Uint8Array -> base64
export async function compress(str: string): Promise<string> {
  try {
    const stream = new Blob([str]).stream();
    const compStream = stream.pipeThrough<Uint8Array>(new CompressionStream('gzip'));
    const reader = compStream.getReader();

    const chars: string[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        for (const b of value) {
          chars.push(String.fromCharCode(b));
        }
      }

      if (done) {
        break;
      }
    }

    return btoa(chars.join(''));
  } catch (e) {
    // bail out and don't compress
    console.error('compression failed', e);
    return str;
  }
}

// base64 -> Uint8Array -> ungzip -> string
export async function decompress(b64: string): Promise<string> {
  try {
    const b64decoded = atob(b64);
    const data = new Uint8Array(b64decoded.length);
    for (let i = 0; i < b64decoded.length; i++) {
      data[i] = b64decoded.charCodeAt(i);
    }

    const stream = new Blob([data]).stream();
    const decompStream = stream.pipeThrough<Uint8Array>(new DecompressionStream('gzip'));
    const reader = decompStream.getReader();

    const chunks: Uint8Array[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        chunks.push(value);
      }

      if (done) {
        break;
      }
    }

    const blob = new Blob(chunks);
    const buf = await blob.arrayBuffer();
    const u8decoded = new Uint8Array(buf);
    return new TextDecoder().decode(u8decoded);
  } catch (e) {
    // bail out and don't decompress
    console.error('decompression failed', e);
    return b64;
  }
}