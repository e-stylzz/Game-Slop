# Game Server (FastAPI WebSocket)

Minimal FastAPI WebSocket game server. This directory contains `server.py`, a `Dockerfile`, and `requirements.txt`.

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

Run in detached mode:

```bash
docker run -d --name game-server -p 8000:8000 game-server:latest
```

Build from repository root (alternative):

```bash
docker build -t game-server:latest -f server/Dockerfile server
```

Docker Compose (optional `docker-compose.yml`):

```yaml
version: '3.8'
services:
  game-server:
    build: .
    ports:
      - '8000:8000'
    restart: unless-stopped
```

Run locally without Docker

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
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



Run Locally:
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000



Build:
docker build --platform=linux/amd64 -t game-server:latest .
docker tag game-server:latest gametui.azurecr.io/game-server:latest
docker push gametui.azurecr.io/game-server:latest