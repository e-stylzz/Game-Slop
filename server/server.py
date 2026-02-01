import uuid
import random
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict

app = FastAPI()

# allow local clients to fetch the characters list during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# serve the client/ static files so this app can be deployed as a single unit
client_dir = Path(__file__).resolve().parent / "client"
if client_dir.exists():
    # serve static assets under /static so API routes are not shadowed
    app.mount("/static", StaticFiles(directory=str(client_dir), html=True), name="static")


@app.get("/")
async def root_index():
    """Return the SPA index.html so the app root loads the client UI."""
    index_file = client_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"msg": "No client UI found"}
WORLD_WIDTH = 100
WORLD_HEIGHT = 30

CHARACTER_DEFS = {
    "wizard": {"id": "wizard", "type": "Wizard", "emoji": "🧙", "health": 50, "attack_range": 3, "attack": 12, "speed": 2, "special": {"damage_mult": 2.0, "move_cost_mult": 2}},
    "elf": {"id": "elf", "type": "Elf", "emoji": "🧝", "health": 60, "attack_range": 2, "attack": 9, "speed": 3, "special": {"damage_mult": 1.75, "move_cost_mult": 2}},
    "barbarian": {"id": "barbarian", "type": "Barbarian", "emoji": "🪓", "health": 100, "attack_range": 1, "attack": 18, "speed": 1, "special": {"damage_mult": 2.0, "move_cost_mult": 2}},
    "snowbeast": {"id": "snowbeast", "type": "Snow Beast", "emoji": "🐺", "health": 120, "attack_range": 2, "attack": 15, "speed": 1, "special": {"damage_mult": 1.8, "move_cost_mult": 2}},
    "archer": {"id": "archer", "type": "Archer", "emoji": "🏹", "health": 40, "attack_range": 4, "attack": 7, "speed": 3, "special": {"damage_mult": 1.5, "move_cost_mult": 2}},
}

ITEM_DEFS = {
    "berry": {"id": "berry", "name": "Berry", "restore": 10, "move_cost": 3},
    "medkit": {"id": "medkit", "name": "Med Kit", "restore": 30, "move_cost": 6},
}


class Player:
    def __init__(self, name: str, ws: WebSocket, char_id: str = None):
        self.id = str(uuid.uuid4())
        self.name = name
        self.x = 0
        self.y = 0
        self.ws = ws
        self.char_id = char_id or "wizard"
        spec = CHARACTER_DEFS.get(self.char_id, CHARACTER_DEFS["wizard"])
        # optional emoji used for map rendering and client previews
        self.emoji = spec.get("emoji")
        self.char_type = spec["type"]
        self.max_health = spec["health"]
        self.health = spec["health"]
        self.attack_range = spec["attack_range"]
        self.attack = spec.get("attack", 5)
        self.speed = spec["speed"]
        special = spec.get("special", {})
        self.special_damage_mult = special.get("damage_mult", 1.5)
        self.special_move_cost_mult = special.get("move_cost_mult", 2)
        self.move_points = 0

players: Dict[str, Player] = {}
turn_order: list = []
current_turn_index = None


async def send(ws: WebSocket, msg: str):
    await ws.send_json({"type": "info", "msg": msg})


async def broadcast_at(x: int, y: int, msg: str, exclude: str = None):
    for p in players.values():
        if p.x == x and p.y == y and p.id != exclude:
            await send(p.ws, msg)


async def broadcast_all(msg: str, exclude: str = None):
    """Send a message to all connected players (optionally excluding one)."""
    for p in players.values():
        if exclude and p.id == exclude:
            continue
        try:
            await send(p.ws, msg)
        except Exception:
            pass



def render_map() -> str:
    grid = [["." for _ in range(WORLD_WIDTH)] for _ in range(WORLD_HEIGHT)]
    for p in players.values():
        # prefer character emoji when available, otherwise use first letter
        ch = (p.emoji or (p.name[0].upper() if p.name else "@"))
        grid[p.y][p.x] = ch
    return "\n".join("".join(row) for row in grid)


async def broadcast_map():
    map_str = render_map()
    for p in players.values():
        try:
            # include the recipient's own coordinates so the client can highlight their tile
            await p.ws.send_json({"type": "map", "map": map_str, "you": {"x": p.x, "y": p.y}})
        except Exception:
            pass


async def send_status(player: Player):
    try:
        await player.ws.send_json({
            "type": "status",
            "hp": max(0, player.health),
            "max_hp": player.max_health,
            "move_points": player.move_points,
        })
    except Exception:
        pass


async def broadcast_turn():
    """Notify all clients whose turn it is."""
    global current_turn_index
    if current_turn_index is None or not turn_order:
        return
    # build a queue of up to 10 upcoming turns starting from current
    queue = []
    n = len(turn_order)
    for i in range(min(10, n)):
        idx = (current_turn_index + i) % n
        pid = turn_order[idx]
        if pid in players:
            queue.append({"player_id": pid, "player_name": players[pid].name})
    # send turn info with queue
    for p in players.values():
        try:
            await p.ws.send_json({"type": "turn", "player_id": queue[0]["player_id"] if queue else None, "player_name": queue[0]["player_name"] if queue else "", "queue": queue})
        except Exception:
            pass


async def advance_turn():
    """Advance to the next connected player in turn_order."""
    global current_turn_index
    if not turn_order:
        current_turn_index = None
        return
    n = len(turn_order)
    # move to next index
    if current_turn_index is None:
        current_turn_index = 0
    else:
        current_turn_index = (current_turn_index + 1) % n

    # find next connected player
    for _ in range(n):
        pid = turn_order[current_turn_index]
        if pid in players:
            await broadcast_turn()
            # notify the new current player of status
            try:
                await send_status(players[pid])
            except Exception:
                pass
            return
        current_turn_index = (current_turn_index + 1) % n

    # if no players connected
    current_turn_index = None


@app.get('/characters')
async def get_characters():
    """Return available character definitions."""
    return list(CHARACTER_DEFS.values())


@app.get('/items')
async def get_items():
    """Return available items."""
    return list(ITEM_DEFS.values())


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player = None

    try:
        # --- JOIN ---
        join = await ws.receive_text()
        if not join.startswith("join "):
            await ws.close()
            return

        parts = join.strip().split()
        # expect: join <name> [char_id]
        if len(parts) < 2:
            await ws.close()
            return

        name = parts[1]
        char_id = parts[2] if len(parts) > 2 else None
        player = Player(name, ws, char_id)

        # assign a random start position
        player.x = random.randint(0, WORLD_WIDTH - 1)
        player.y = random.randint(0, WORLD_HEIGHT - 1)

        players[player.id] = player
        # add to turn order
        turn_order.append(player.id)

        await ws.send_json({"type": "init", "player_id": player.id})
        await send(ws, f"Welcome, {name}! Character: {player.char_type} (HP {player.health}, atk {player.attack_range}, spd {player.speed})")
        await send(ws, f"You are at ({player.x},{player.y})")
        await send_status(player)
        await broadcast_at(player.x, player.y, f"{name} joined the tile.", exclude=player.id)
        await broadcast_map()

        # if no current turn chosen yet, pick a random starting player
        global current_turn_index
        if current_turn_index is None and turn_order:
            current_turn_index = random.randrange(len(turn_order))
            await broadcast_turn()

        # --- COMMAND LOOP ---
        while True:
            text = await ws.receive_text()
            parts = text.strip().split(" ", 1)
            cmd = parts[0]

            if cmd == "move":
                if len(parts) < 2:
                    await send(ws, "Usage: move north|south|east|west")
                    continue

                dx, dy = 0, 0
                if parts[1] == "north": dy = -1
                elif parts[1] == "south": dy = 1
                elif parts[1] == "west": dx = -1
                elif parts[1] == "east": dx = 1
                else:
                    await send(ws, "Invalid direction")
                    continue

                # only the current player may perform turn actions
                cur_id = turn_order[current_turn_index] if current_turn_index is not None and turn_order else None
                if cur_id is None or player.id != cur_id:
                    await send(ws, "Not your turn.")
                    continue

                # require move points for turn-based movement
                if player.move_points <= 0:
                    await send(ws, "No move points remaining. Use 'roll' to gain move points.")
                    continue

                old_x, old_y = player.x, player.y
                # factor in player speed: one move moves `speed` tiles
                step = max(1, getattr(player, 'speed', 1))
                new_x = max(0, min(WORLD_WIDTH - 1, player.x + dx * step))
                new_y = max(0, min(WORLD_HEIGHT - 1, player.y + dy * step))
                # if position changed, deduct one move point
                if new_x != player.x or new_y != player.y:
                    player.move_points -= 1
                player.x = new_x
                player.y = new_y

                await broadcast_at(old_x, old_y, f"{player.name} left the tile.", exclude=player.id)
                await broadcast_at(player.x, player.y, f"{player.name} entered the tile.", exclude=player.id)

                await send(ws, f"You moved to ({player.x},{player.y})")
                await send_status(player)
                await broadcast_map()
                # if player used up move points, advance turn
                if player.move_points <= 0:
                    await advance_turn()

            elif cmd == "roll":
                # only current player may roll
                cur_id = turn_order[current_turn_index] if current_turn_index is not None and turn_order else None
                if cur_id is None or player.id != cur_id:
                    await send(ws, "Not your turn.")
                    continue

                # prevent re-rolling while the player still has move points
                if player.move_points and player.move_points > 0:
                    await send(ws, "You already have move points and cannot roll again until your next turn.")
                    continue

                # roll 1-8 move points
                roll = random.randint(1, 8)
                player.move_points = roll
                await send(ws, f"You rolled {roll} move points.")
                # broadcast roll to all players
                try:
                    await broadcast_all(f"{player.name} rolled {roll} move points.")
                except Exception:
                    pass
                await send_status(player)
                continue

            elif cmd.startswith("use"):
                # usage: use <item_id>
                parts2 = text.strip().split(None, 1)
                if len(parts2) < 2:
                    await send(ws, "Usage: use <item_id>")
                    continue
                item_id = parts2[1].strip()
                item = ITEM_DEFS.get(item_id)
                if not item:
                    await send(ws, f"Unknown item: {item_id}")
                    continue
                # only current player may use items
                cur_id = turn_order[current_turn_index] if current_turn_index is not None and turn_order else None
                if cur_id is None or player.id != cur_id:
                    await send(ws, "Not your turn.")
                    continue

                if player.move_points < item["move_cost"]:
                    await send(ws, "Not enough move points to use that item.")
                    continue
                # consume move points and apply heal
                player.move_points -= item["move_cost"]
                old_hp = player.health
                player.health = min(player.max_health, player.health + item["restore"])
                await send(ws, f"You used {item['name']} and restored {player.health - old_hp} HP. HP now {player.health}.")
                await send_status(player)
                await broadcast_map()
                # if the item usage consumed the remaining move points, advance the turn
                if player.move_points <= 0:
                    await advance_turn()
                continue

            elif cmd == "attack":
                # determine if this is a special attack: "attack special"
                is_special = False
                if len(parts) > 1 and parts[1].strip().lower() == "special":
                    is_special = True

                # find targets within Manhattan distance <= attack_range
                targets = [
                    p for p in list(players.values())
                    if p.id != player.id and (abs(p.x - player.x) + abs(p.y - player.y)) <= player.attack_range
                ]
                if not targets:
                    await send(ws, "No targets in range.")
                    continue

                # only current player may attack
                cur_id = turn_order[current_turn_index] if current_turn_index is not None and turn_order else None
                if cur_id is None or player.id != cur_id:
                    await send(ws, "Not your turn.")
                    continue

                # move costs: basic attack costs 2, special costs 4
                cost = 4 if is_special else 2
                if player.move_points < cost:
                    await send(ws, f"Not enough move points to {'perform special attack' if is_special else 'attack'}. Need {cost}.")
                    continue

                # consume move points up front
                player.move_points -= cost

                # compute damage
                base_damage = player.attack
                damage = int(base_damage * player.special_damage_mult) if is_special else base_damage

                for t in targets:
                    t.health -= damage
                    # clamp health to not go negative
                    if t.health < 0:
                        t.health = 0
                    try:
                        await send(t.ws, f"You were hit by {player.name} for {damage} damage. HP now {t.health}")
                    except Exception:
                        pass
                    await send(ws, f"You {'performed a SPECIAL attack on' if is_special else 'hit'} {t.name} for {damage}. Target HP {t.health}")
                    await send_status(t)

                    if t.health <= 0:
                        # inform and disconnect target
                        try:
                            await t.ws.send_json({"type": "info", "msg": "You have been slain."})
                            await t.ws.close()
                        except Exception:
                            pass
                        if t.id in players:
                            del players[t.id]
                        # remove from turn order as well
                        if t.id in turn_order:
                            idx = turn_order.index(t.id)
                            del turn_order[idx]
                            # adjust current_turn_index if necessary
                            if current_turn_index is not None:
                                if idx < current_turn_index:
                                    current_turn_index -= 1
                                elif idx == current_turn_index:
                                    # current player died; current_turn_index now points to next player
                                    if turn_order:
                                        current_turn_index = current_turn_index % len(turn_order)
                                    else:
                                        current_turn_index = None
                            await broadcast_turn()
                        await broadcast_at(t.x, t.y, f"{t.name} was slain by {player.name}.")
                        await broadcast_map()

                # after attack, send status and map updates
                await send_status(player)
                await broadcast_map()

                # if the attacker has no move_points left, advance turn
                if player.move_points <= 0:
                    await advance_turn()

            elif cmd == "look":
                here = [
                    p.name for p in players.values()
                    if p.x == player.x and p.y == player.y and p.id != player.id
                ]
                if here:
                    await send(ws, "Players here: " + ", ".join(here))
                else:
                    await send(ws, "You are alone here.")

            elif cmd == "say":
                if len(parts) < 2:
                    continue
                # broadcast chat to all connected players
                await broadcast_all(f"{player.name}: {parts[1]}")

            else:
                await send(ws, "Unknown command")

    except WebSocketDisconnect:
        if player:
            if player.id in players:
                del players[player.id]
            # remove from turn order and adjust current_turn_index
            if player.id in turn_order:
                idx = turn_order.index(player.id)
                del turn_order[idx]
                if current_turn_index is not None:
                    if idx < current_turn_index:
                        current_turn_index -= 1
                    elif idx == current_turn_index:
                        # current player disconnected, advance to next
                        if turn_order:
                            current_turn_index = current_turn_index % len(turn_order)
                        else:
                            current_turn_index = None
            await broadcast_at(player.x, player.y, f"{player.name} disconnected.")
            await broadcast_map()
            await broadcast_turn()