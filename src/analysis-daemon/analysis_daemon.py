import asyncio
import sys
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

app = FastAPI()

connected_clients: list[WebSocket] = []

@app.post("/trigger")
async def trigger_action():
    print("[Analysis Daemon] Button clicked! Received trigger from sidebar.")
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print("[Analysis Daemon] New client connected.")
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[Analysis Daemon] Received: {data}")

            response = '{"jsonrpc": "2.0", "result": "Acknowledge", "id": 1}'
            await websocket.send_text(response)

    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        print("[Analysis Daemon] Client disconnected.")

async def monitor_parent_process():
    loop = asyncio.get_running_loop()
    try:
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while True:
            line = await reader.readline()
            if not line:
                print("[Parent Monitor] Parent has closed stdin. Terminate Daemon...")
                break
    except Exception as e:
        print(f"[Parent Monitor] Error: {e}", file=sys.stderr)
    finally:
        asyncio.get_running_loop().stop()

async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    server_task = asyncio.create_task(server.serve())
    monitor_task = asyncio.create_task(monitor_parent_process())

    print(f"[Analysis Daemon] Started on port {port}")

    await asyncio.gather(server_task, monitor_task)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[Analysis Daemon] Cancelled manually.", file=sys.stderr)