"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitEvent = void 0;
function emitEvent(socket, eventName, validator, ...payload) {
    const ackTimeoutMs = 4000;
    return new Promise((resolve) => {
        if (!socket || socket.disconnected) {
            resolve(undefined);
            return;
        }
        let ackCalled = false;
        socket.emit(eventName, ...payload, (ackPayload) => {
            ackCalled = true;
            if (validator) {
                resolve(validator(ackPayload) ? ackPayload : undefined);
                return;
            }
            resolve(typeof ackPayload === "undefined" ? undefined : ackPayload);
        });
        setTimeout(() => {
            if (!ackCalled) {
                resolve(undefined);
            }
        }, ackTimeoutMs);
    });
}
exports.emitEvent = emitEvent;
//# sourceMappingURL=emitEvent.js.map