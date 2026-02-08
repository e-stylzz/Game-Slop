# Game Slot (FastAPI WebSocket)

A AI experiment building an online game for fun.  

Prerequisites
- Docker (for building and running the container)
- (optional) Python 3.11 to run locally

Build the Docker image (from the `server` directory):

```bash
cd server
docker build -t game-server:latest .
```

Run the container (exposes port 8000):

```bash
docker run --rm -p 8000:8000 game-server:latest
```


Run locally (without Docker)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Testing the WebSocket

Connect with `wscat` (install via `npm i -g wscat`):

```bash
wscat -c ws://localhost:8000/ws
# then type: join Alice
# afterwards try: move north
# or: say Hello everyone
```

Notes
- The WebSocket endpoint is `/ws` (ws://localhost:8000/ws).
- `server.py` contains the game logic and uses FastAPI + WebSocket.



Build:
az acr login --name gametui
docker build --platform=linux/amd64 -t game-server:latest .
docker tag game-server:latest gametui.azurecr.io/game-server:latest
docker push gametui.azurecr.io/game-server:latest