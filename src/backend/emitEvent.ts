import { Socket } from "socket.io-client";

export function emitEvent<T, A extends unknown[] = []>(
  socket: Socket,
  eventName: string,
  validator?: (p: unknown) => p is T,
  ...payload: A
): Promise<T | undefined> {
  const ackTimeoutMs = 4000;

  return new Promise<T | undefined>((resolve) => {
    if (!socket || socket.disconnected) {
      resolve(undefined);
      return;
    }

    let ackCalled = false;

    socket.emit(eventName, ...payload, (ackPayload?: unknown) => {
      ackCalled = true;

      if (validator) {
        resolve(validator(ackPayload) ? ackPayload : undefined);
        return;
      }

      resolve(typeof ackPayload === "undefined" ? undefined : (ackPayload as T));
    });

    setTimeout(() => {
      if (!ackCalled) {
        resolve(undefined);
      }
    }, ackTimeoutMs);
  });
}