import asyncio
import sys

import uvicorn
from fastapi import FastAPI
from routers.analysis import router as analysis_router
from routers.socket import router as socket_router

SERVER_SETTINGS = {}

app = FastAPI(title="ExplorViz Analysis Daemon")

app.include_router(analysis_router)
app.include_router(socket_router)


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
    SERVER_SETTINGS.update({"port": int(sys.argv[1]) if len(sys.argv) > 1 else 8080})

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=SERVER_SETTINGS.get("port", 8080),
        log_level="warning",
    )
    server = uvicorn.Server(config)

    server_task = asyncio.create_task(server.serve())
    monitor_task = asyncio.create_task(monitor_parent_process())

    print(f"[Analysis Daemon] Started on port {SERVER_SETTINGS.get('port')}")

    await asyncio.gather(server_task, monitor_task)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[Analysis Daemon] Cancelled manually.", file=sys.stderr)
