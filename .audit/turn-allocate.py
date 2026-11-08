#!/usr/bin/env python3
"""
[INPUT]: 依赖环境变量 TURN_HOST、TURN_PORT、TURN_USERNAME、TURN_CREDENTIAL 的短时 coturn REST 凭据。
[OUTPUT]: 向指定 TURN UDP 端点执行一次 STUN Allocate，并输出无密 JSON 结果。
[POS]: .audit 的原生 UDP TURN 验收器，被 NAS 跨机器部署脚本调用，不保存凭据。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
"""

import hashlib
import hmac
import json
import os
import socket
import struct
import sys
import time

MAGIC_COOKIE = 0x2112A442
ALLOCATE_REQUEST = 0x0003
ALLOCATE_SUCCESS = 0x0103
REFRESH_REQUEST = 0x0004
REFRESH_SUCCESS = 0x0104
ERROR_RESPONSE = 0x0113
REQUESTED_TRANSPORT = 0x0019
USERNAME = 0x0006
REALM = 0x0014
NONCE = 0x0015
ERROR_CODE = 0x0009
MESSAGE_INTEGRITY = 0x0008
XOR_RELAYED_ADDRESS = 0x0016
LIFETIME = 0x000D


def attribute(kind, value):
    padding = b"\x00" * ((4 - len(value) % 4) % 4)
    return struct.pack("!HH", kind, len(value)) + value + padding


def parse_attributes(packet):
    values = {}
    offset = 20
    end = 20 + struct.unpack("!H", packet[2:4])[0]
    while offset + 4 <= min(end, len(packet)):
        kind, length = struct.unpack("!HH", packet[offset:offset + 4])
        start = offset + 4
        values[kind] = packet[start:start + length]
        offset = start + length + ((4 - length % 4) % 4)
    return values


def request(transaction_id, attrs, integrity_key=None, message_type=ALLOCATE_REQUEST):
    body = b"".join(attrs)
    if integrity_key is None:
        return struct.pack("!HHI", message_type, len(body), MAGIC_COOKIE) + transaction_id + body
    length = len(body) + 24
    header = struct.pack("!HHI", message_type, length, MAGIC_COOKIE) + transaction_id
    digest = hmac.new(integrity_key, header + body, hashlib.sha1).digest()
    return header + body + attribute(MESSAGE_INTEGRITY, digest)


def decode_error(values):
    value = values.get(ERROR_CODE)
    if value is None or len(value) < 4:
        return None
    return value[2] * 100 + value[3]


def main():
    host = os.environ.get("TURN_HOST", "192.168.5.111")
    port = int(os.environ.get("TURN_PORT", "3478"))
    username = os.environ["TURN_USERNAME"]
    credential = os.environ["TURN_CREDENTIAL"]
    transaction_id = os.urandom(12)
    transport = b"\x11\x00\x00\x00"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(4)
    started = time.monotonic()
    try:
        sock.sendto(request(transaction_id, [attribute(REQUESTED_TRANSPORT, transport)]), (host, port))
        first, _ = sock.recvfrom(4096)
        values = parse_attributes(first)
        if struct.unpack("!H", first[:2])[0] != ERROR_RESPONSE or decode_error(values) != 401:
            raise RuntimeError(f"expected TURN 401 challenge, got type={struct.unpack('!H', first[:2])[0]:#x} error={decode_error(values)}")
        realm = values.get(REALM, b"")
        nonce = values.get(NONCE, b"")
        if not realm or not nonce:
            raise RuntimeError("TURN 401 response omitted realm or nonce")
        password_key = hashlib.md5(username.encode() + b":" + realm + b":" + credential.encode()).digest()
        attrs = [
            attribute(USERNAME, username.encode()),
            attribute(REALM, realm),
            attribute(NONCE, nonce),
            attribute(REQUESTED_TRANSPORT, transport),
        ]
        sock.sendto(request(transaction_id, attrs, password_key), (host, port))
        second, relay = sock.recvfrom(4096)
        second_type = struct.unpack("!H", second[:2])[0]
        second_values = parse_attributes(second)
        if second_type != ALLOCATE_SUCCESS:
            raise RuntimeError(f"TURN Allocate rejected type={second_type:#x} error={decode_error(second_values)}")
        lifetime = second_values.get(LIFETIME)
        refresh_id = os.urandom(12)
        refresh_attrs = [
            attribute(USERNAME, username.encode()),
            attribute(REALM, realm),
            attribute(NONCE, nonce),
            attribute(LIFETIME, b"\x00\x00\x00\x00"),
        ]
        sock.sendto(request(refresh_id, refresh_attrs, password_key, REFRESH_REQUEST), (host, port))
        refresh, _ = sock.recvfrom(4096)
        refresh_type = struct.unpack("!H", refresh[:2])[0]
        if refresh_type != REFRESH_SUCCESS:
            raise RuntimeError(f"TURN allocation cleanup rejected type={refresh_type:#x}")
        return {
            "status": "PASS",
            "server": f"{host}:{port}",
            "transport": "udp",
            "challengeReceived": True,
            "allocationSucceeded": True,
            "allocationCleanupSucceeded": True,
            "lifetimeSeconds": struct.unpack("!I", lifetime)[0] if lifetime and len(lifetime) == 4 else None,
            "responseBytes": len(second),
            "elapsedMs": round((time.monotonic() - started) * 1000, 1),
        }
    except Exception as exc:
        print(json.dumps({"status": "FAILED", "server": f"{host}:{port}", "transport": "udp", "error": str(exc)[:240]}))
        return 1
    finally:
        sock.close()


result = main()
if isinstance(result, dict):
    print(json.dumps(result, separators=(",", ":")))
    sys.exit(0)
sys.exit(result)
