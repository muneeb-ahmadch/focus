import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = 1_000_000
MAX_JSON_DEPTH = 32


def json_depth(body: bytes) -> int:
    """Max bracket nesting, string-aware, single linear pass — computed WITHOUT
    a recursive parse so a pathological body can't crash json.loads before
    validation runs."""
    depth = 0
    deepest = 0
    in_str = False
    escaped = False
    for byte in body:
        char = chr(byte)
        if in_str:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_str = False
            continue
        if char == '"':
            in_str = True
        elif char in "[{":
            depth += 1
            if depth > deepest:
                deepest = depth
        elif char in "]}":
            depth -= 1
    return deepest


async def _send_json(send: Send, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class BodyGuardMiddleware:
    """Caps request-body size and JSON nesting depth for POSTs before anything
    reads or recursively parses the body. Findings SEC-2 / SEC-5."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES, max_depth: int = MAX_JSON_DEPTH):
        self.app = app
        self.max_bytes = max_bytes
        self.max_depth = max_depth

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        body = b""
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                continue
            body += message.get("body", b"")
            if len(body) > self.max_bytes:
                await _send_json(send, 413, {"detail": "payload too large"})
                return
            more_body = message.get("more_body", False)

        if json_depth(body) > self.max_depth:
            await _send_json(send, 422, {"detail": "payload too deeply nested"})
            return

        sent = False

        async def replay() -> Message:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(scope, replay, send)
