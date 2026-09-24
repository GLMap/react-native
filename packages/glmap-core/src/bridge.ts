import type { GLMapErrorCode } from "./index";
export function failure(code: GLMapErrorCode, message: string) {
  return Object.assign(new Error(message), { code });
}

/** Packed doubles are borrowed until the operation resolves; subarray views are supported. */
export type Coordinates = Float64Array | readonly number[];
export const packed = (values: Coordinates): Float64Array => values instanceof Float64Array ? values : Float64Array.from(values);
export function packLines(lines: Coordinates[]): Float64Array {
  if (lines.length === 1) return packed(lines[0]);
  const result = new Float64Array(lines.reduce((sum, line) => sum + line.length, 0));
  let offset = 0;
  for (const line of lines) { result.set(line, offset); offset += line.length; }
  return result;
}

let lastRequest = 0;
/** Aborting the signal cancels the native request; the promise then rejects with `cancelled`. */
export function cancellable<T>(
  native: { cancelRequest(id:number):Promise<void> },
  signal: AbortSignal | undefined,
  start: (requestId: number) => Promise<T>,
): Promise<T> {
  if (signal?.aborted)
    return Promise.reject(failure("cancelled", "Request was cancelled"));
  const requestId = ++lastRequest;
  const abort = () => void native.cancelRequest(requestId);
  signal?.addEventListener("abort", abort);
  return start(requestId).finally(() =>
    signal?.removeEventListener("abort", abort),
  );
}
