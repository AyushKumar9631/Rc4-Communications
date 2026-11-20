"""Backend: Flask + Flask-SocketIO ciphertext relay (educational).

The server never sees plaintext or keys. It validates payloads, checks room
membership server-side, and relays opaque Base64 `nonce`, `ciphertext` and
`mac` to the other members of the sender's room.
"""

import math
import os
import re
import secrets
import threading
import time

from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

from crypto.rc4 import from_base64, to_base64
from ratelimit import RateLimiter

ROOM_RE = re.compile(r"[A-Za-z0-9_-]{1,32}")
USERNAME_RE = re.compile(r"[A-Za-z0-9_-]{1,24}")

DEFAULT_CONFIG = {
    "MAX_ROOM_MEMBERS": 10,
    "MAX_ROOMS": 100,
    "MAX_CIPHERTEXT_BYTES": 4096,
    "MAX_ECHO_CHARS": 1024,
    "RATE_BURST": 30,
    "RATE_PER_SEC": 10,
}

NONCE_BYTES = 16
MAC_BYTES = 32


def _err(code, message):
    return {"ok": False, "error": code, "message": message}


def _now_ms():
    return int(time.time() * 1000)


def _sio_room(room):
    # Namespaced so a client can never join another client's private sid room.
    return "room:" + room


class ChatState:
    """In-memory room membership. All access goes through one lock."""

    def __init__(self):
        self._lock = threading.Lock()
        self.rooms = {}  # room -> {sid: username}
        self.sid_room = {}  # sid -> room

    def join(self, sid, room, username, max_members, max_rooms):
        with self._lock:
            if sid in self.sid_room:
                return _err("already_in_room", "Leave the current room first.")
            members = self.rooms.get(room)
            if members is None:
                if len(self.rooms) >= max_rooms:
                    return _err("room_limit", "Server room limit reached.")
                members = {}
            if username.casefold() in (u.casefold() for u in members.values()):
                return _err("username_taken", "Username already used in this room.")
            if len(members) >= max_members:
                return _err("room_full", "Room is full.")
            members[sid] = username
            self.rooms[room] = members
            self.sid_room[sid] = room
            return {"ok": True, "room": room, "username": username,
                    "members": sorted(members.values())}

    def remove(self, sid):
        """Remove sid. Return (room, username, members) or None if not joined."""
        with self._lock:
            room = self.sid_room.pop(sid, None)
            if room is None:
                return None
            members = self.rooms[room]
            username = members.pop(sid)
            if not members:
                del self.rooms[room]
            return room, username, sorted(members.values())

    def lookup(self, sid):
        """Return (room, username) for sid, or None."""
        with self._lock:
            room = self.sid_room.get(sid)
            if room is None:
                return None
            return room, self.rooms[room][sid]


def create_app(config=None):
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(config or {})

    max_ct = cfg["MAX_CIPHERTEXT_BYTES"]
    max_b64 = 4 * math.ceil(max_ct / 3)

    app = Flask(__name__)
    app.config.update(cfg)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_hex(32)

    socketio = SocketIO(
        app,
        async_mode="threading",
        max_http_buffer_size=max_b64 + 2048,
        # Optional: comma-separated allowed origins; unset keeps the same-origin default.
        cors_allowed_origins=[o.strip() for o in os.environ["ALLOWED_ORIGINS"].split(",")]
        if os.environ.get("ALLOWED_ORIGINS") else None,
    )
    state = ChatState()
    limiter = RateLimiter(cfg["RATE_BURST"], cfg["RATE_PER_SEC"])
    rate_error = _err("rate_limited", "Too many requests; slow down.")
    app.extensions["chat_state"] = state

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    def _check_b64(value, field, max_bytes=None, exact=None):
        code = "invalid_" + field
        limit = exact or max_bytes
        if not isinstance(value, str):
            return _err(code, f"{field} must be a Base64 string.")
        if len(value) > 4 * math.ceil(limit / 3):
            return _err("ciphertext_too_large" if exact is None else code,
                        f"{field}: max {limit} bytes.")
        try:
            raw = from_base64(value)
        except ValueError:
            return _err(code, f"{field} is not valid Base64.")
        if not raw or to_base64(raw) != value:
            return _err(code, f"{field} must be canonical, non-empty Base64.")
        if exact is not None and len(raw) != exact:
            return _err(code, f"{field} must be exactly {exact} bytes.")
        if exact is None and len(raw) > max_bytes:
            return _err("ciphertext_too_large", f"{field}: max {max_bytes} bytes.")
        return None

    def _depart(sid):
        left = state.remove(sid)
        if left:
            room, username, members = left
            emit("user_left", {"username": username, "members": members},
                 to=_sio_room(room), skip_sid=sid)
        return left

    @socketio.on("join")
    def on_join(data):
        if not limiter.allow(request.sid):
            return rate_error
        if not isinstance(data, dict):
            return _err("bad_payload", "Payload must be an object.")
        room, username = data.get("room"), data.get("username")
        if not isinstance(room, str) or not ROOM_RE.fullmatch(room):
            return _err("invalid_room", "Room: 1-32 chars of A-Z a-z 0-9 _ -")
        if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
            return _err("invalid_username", "Username: 1-24 chars of A-Z a-z 0-9 _ -")
        result = state.join(request.sid, room, username,
                            cfg["MAX_ROOM_MEMBERS"], cfg["MAX_ROOMS"])
        if result["ok"]:
            join_room(_sio_room(room))
            emit("user_joined", {"username": username, "members": result["members"]},
                 to=_sio_room(room), skip_sid=request.sid)
        return result

    @socketio.on("leave")
    def on_leave(data=None):
        sid = request.sid
        info = state.lookup(sid)
        if info is None:
            return _err("not_in_room", "You are not in a room.")
        leave_room(_sio_room(info[0]))
        _depart(sid)
        return {"ok": True, "room": info[0]}

    @socketio.on("disconnect")
    def on_disconnect(reason=None):
        limiter.forget(request.sid)
        _depart(request.sid)

    @socketio.on("encrypted_message")
    def on_encrypted_message(data):
        if not limiter.allow(request.sid):
            return rate_error
        if not isinstance(data, dict):
            return _err("bad_payload", "Payload must be an object.")
        info = state.lookup(request.sid)
        if info is None or data.get("room") != info[0]:
            return _err("not_in_room", "You are not a member of that room.")
        for field, kw in (("nonce", {"exact": NONCE_BYTES}),
                          ("ciphertext", {"max_bytes": max_ct}),
                          ("mac", {"exact": MAC_BYTES})):
            error = _check_b64(data.get(field), field, **kw)
            if error:
                return error
        room, username = info
        msg = {
            "id": secrets.token_hex(8),
            "room": room,
            "sender": username,
            "nonce": data["nonce"],
            "ciphertext": data["ciphertext"],
            "mac": data["mac"],
            "ts": _now_ms(),
        }
        emit("encrypted_message", msg, to=_sio_room(room), skip_sid=request.sid)
        return {"ok": True, "id": msg["id"], "ts": msg["ts"]}

    @socketio.on("echo")
    def on_echo(data):
        if not limiter.allow(request.sid):
            return rate_error
        text = data.get("data") if isinstance(data, dict) else None
        if not isinstance(text, str) or len(text) > cfg["MAX_ECHO_CHARS"]:
            return _err("bad_payload",
                        f"data must be a string up to {cfg['MAX_ECHO_CHARS']} chars.")
        return {"ok": True, "data": text, "ts": _now_ms()}

    return app, socketio


app, socketio = create_app()

if __name__ == "__main__":
    socketio.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        allow_unsafe_werkzeug=True,
    )
