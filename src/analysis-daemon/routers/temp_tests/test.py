import asyncio
import sys

import websockets


async def test():
    if len(sys.argv) < 2:
        print("Error: Please enter port!")
        print("Usage: python test_client.py <PORT>")
        sys.exit(1)

    port = sys.argv[1]
    uri = f"ws://127.0.0.1:{port}/ws/analysis"

    print(f"Connect to {uri}...")

    try:
        async with websockets.connect(uri) as websocket:
            print("Successfully connected to the Websocket Daemon!")

            test_msg = "Hello from dynamic Python terminal test!"
            print(f"Sende: {test_msg}")
            await websocket.send(test_msg)

            response = await websocket.recv()
            print(f"Vom Server empfangen: {response}")

            print("Wait 12 seconds for possible broadcasts...")
            try:
                while True:
                    broadcast = await asyncio.wait_for(websocket.recv(), timeout=12.0)
                    print(f"Received Broadcast: {broadcast}")
            except asyncio.TimeoutError:
                print("No further messages received. Terminate test.")

    except Exception as e:
        print(f"Connection error: {e}")


if __name__ == "__main__":
    asyncio.run(test())
