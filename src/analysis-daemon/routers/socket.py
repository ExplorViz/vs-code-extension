import sys

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(
            f"[Analysis Daemon] Client connected. Total active: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(
                f"[Analysis Daemon] Client disconnected. Total active: {len(self.active_connections)}"
            )

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception as e:
                print(
                    f"[Analysis Daemon] Error broadcasting to client: {e}",
                    file=sys.stderr,
                )
                self.disconnect(connection)


connection_manager = ConnectionManager()


@router.websocket("/ws/analysis")
async def analysis_websocket(websocket: WebSocket):
    await connection_manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            print(f"[Analysis Daemon] Received via WebSocket: {data}")

            await connection_manager.send_personal_message(
                '{"jsonrpc": "2.0", "result": "Acknowledge", "id": 1}', websocket
            )

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
