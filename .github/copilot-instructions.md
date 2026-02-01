## Quick Context (address: "Game Master")

- Address the user as "Game Master" when asking questions or requesting clarification.
- Do NOT prompt the user to run or compile the server — they keep it running locally.

## Big-picture architecture

- Backend: FastAPI app in `server/server.py` — single-process game server implementing game state, turn order and WebSocket handling. REST endpoints: `/characters`, `/items`. WebSocket endpoint: `/ws`.
- Frontend: a minimal SPA under `server/client` (served as static files at `/static`) — entry is `server/client/index.html` and client logic in `server/client/main.js`.
- Static serving: the FastAPI app mounts the `server/client` directory and serves files under `/static`; the root `/` returns the SPA `index.html` when present.

## Core runtime patterns & data flows

- WebSocket protocol is plain-text command-based from client to server and JSON messages from server to client.
  - Client -> Server commands: `join <name> [char_id]`, `move <dir>`, `roll`, `use <item_id>`, `attack`, `attack special`, `say <message>`, `look`.
  - Server -> Client JSON messages: `type` values include `init`, `info`, `map`, `status`, `turn`.
- Server state is held in module-level globals in `server/server.py`: `players`, `turn_order`, `current_turn_index`. Changes to turn logic must respect these structures.
- Map rendering and broadcasts: `render_map()` -> `broadcast_map()`; turn changes use `broadcast_turn()` and `advance_turn()`.

## Developer workflows (how to run / build / inspect)

- Local (venv + uvicorn): from repository root

  python -m venv .venv
  source .venv/bin/activate
  pip install -r server/requirements.txt
  uvicorn server:app --reload --host 0.0.0.0 --port 8000

- Docker: see README for `docker build` and `docker run` examples; the `server/Dockerfile` builds the FastAPI app and serves the static client.

## Project-specific conventions & gotchas

- The client expects the server to be the same origin; static assets are referenced via `/static/main.js` in `server/client/index.html`.
- Movement/attack costs and status semantics are authoritative on the server. Client uses constants (e.g. `ATTACK_COST`, `SPECIAL_COST` in `server/client/main.js`) — keep these in sync if changing mechanics.
- The server uses simple, resilient send/broadcast helpers that catch exceptions (silent failures on send). When modifying, preserve exception handling to avoid crashing on disconnected sockets.
- The server's command loop expects the first text frame to be `join ...` — changes to connection handshake must preserve backward compatibility or update the client.

## Integration points to check when editing

- `server/server.py` — main game logic, WebSocket handlers, REST endpoints.
- `server/client/main.js` — client WebSocket handling, UI update logic, and the command shapes sent to the server.
- `server/client/index.html` — UI scaffolding and where `main.js` is included via `/static/main.js`.
- `README.md` — contains Docker and local-run examples; useful to copy exact commands into tickets or PRs.

## When making changes, prioritize

- Keep the text protocol stable or update both server and `main.js` together.
- Preserve server-side move/turn invariants (`move_points`, `turn_order`, `current_turn_index`) to avoid desyncs.
- Avoid refactoring module-level globals into distributed state without a clear migration plan (tests or small incremental PRs).

If anything in this summary is unclear or you want more detail (examples or call traces), tell me which area to expand. Game Master — feedback?
Front end code is stored in the client server/client folder.  I refer to this a frontend or client interchangeably.

Backend Code is store in server and is using phython currently.

The backend server is a FastAPI server that exposes a WebSocket endpoint at ws://localhost:8000/ws. The backend handles game logic and real-time communication with clients.

If you talk to me, address me as "Game Master", mostly so i know that you are picking this up.

Never prompt me to run the sever or complile.  I also have the server running and watch changes.