"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitEvent = void 0;
/**
 * Emit an event via socket and wait for an ack with a timeout.
 * If a type guard is provided, the ack payload is validated with it.
 * Otherwise the raw payload is returned as T (or undefined on timeout/invalid).
 */
function emitEvent(socket, eventName, validator, ...payload) {
    const ackTimeoutMs = 4000;
    return new Promise((resolve) => {
        if (!socket || socket.disconnected) {
            resolve(undefined);
            return;
        }
        let ackCalled = false;
        // emit with payload and ack callback
        socket.emit(eventName, ...payload, (ackPayload) => {
            ackCalled = true;
            if (validator) {
                // use provided type guard
                if (validator(ackPayload)) {
                    resolve(ackPayload);
                }
                else {
                    resolve(undefined);
                }
            }
            else {
                // no validator: return ack payload as-is (or undefined)
                if (typeof ackPayload === "undefined") {
                    resolve(undefined);
                }
                else {
                    resolve(ackPayload);
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
exports.emitEvent = emitEvent;
//# sourceMappingURL=helper.js.map