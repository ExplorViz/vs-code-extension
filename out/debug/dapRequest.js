"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dapRequest = void 0;
async function dapRequest(session, command, args) {
    return session.customRequest(command, args);
}
exports.dapRequest = dapRequest;
//# sourceMappingURL=dapRequest.js.map