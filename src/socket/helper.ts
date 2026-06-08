import io, { Socket } from "socket.io-client";

/**
 * Emit an event via socket and wait for an ack with a timeout.
 * If a type guard is provided, the ack payload is validated with it.
 * Otherwise the raw payload is returned as T (or undefined on timeout/invalid).
 */
export function emitEvent<T, A extends any[] = []>(
  socket: Socket,
  eventName: string,
  validator?: (p: unknown) => p is T,
  ...payload: [...A]
): Promise<T | undefined> {
    const ackTimeoutMs: number = 4000;
    return new Promise<T | undefined>((resolve) => {
        if (!socket || socket.disconnected) {
            resolve(undefined);
            return;
        }

        let ackCalled = false;

        // emit with payload and ack callback
        socket.emit(eventName, ...payload, (ackPayload?: unknown) => {
            ackCalled = true;

            if (validator) {
                // use provided type guard
                if (validator(ackPayload)) {
                    resolve(ackPayload);
                } else {
                    resolve(undefined);
                }
            } else {
                // no validator: return ack payload as-is (or undefined)
                if (typeof ackPayload === "undefined") {
                    resolve(undefined);
                } else {
                    resolve(ackPayload as T);
                }
            }
        });

        // fallback timeout
        setTimeout(() => {
            if (!ackCalled) {
                resolve(undefined);
            }
        }, ackTimeoutMs);
    });
}