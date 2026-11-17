import asyncio
import sys

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

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

    # TODO: Probably not needed, but for now for test reasons
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(
                    f"[Analysis Daemon] Error broadcasting to client: {e}",
                    file=sys.stderr,
                )


connection_manager = ConnectionManager()
background_task: asyncio.Task | None = None


class TogglePayload(BaseModel):
    enabled: bool


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


# TODO: Test task for auto background broadcast
async def background_analysis_worker():
    print("[Analysis Daemon] Background worker task initialized.")
    try:
        while True:
            await asyncio.sleep(10)
            if connection_manager.active_connections:
                print("[Analysis Daemon] Background task pushing update to UI...")
                await connection_manager.broadcast("Test")
    except asyncio.CancelledError:
        print("[Analysis Daemon] Background worker was cancelled.")
        raise


@router.post("/toggle-background-task")
async def toggle_background_task(payload: TogglePayload):
    global background_task

    if payload.enabled:
        if background_task is None or background_task.done():
            background_task = asyncio.create_task(background_analysis_worker())
            print("[Analysis Daemon] Checkbox checked -> Background task launched.")
        else:
            print("[Analysis Daemon] Checkbox checked, but task was already running.")
    else:
        if background_task and not background_task.done():
            background_task.cancel()
            background_task = None
            print("[Analysis Daemon] Checkbox unchecked -> Background task cancelled.")
        else:
            print("[Analysis Daemon] Checkbox unchecked, but task was already stopped.")

    return {
        "status": "ok",
        "task_running": background_task is not None and not background_task.done(),
    }
