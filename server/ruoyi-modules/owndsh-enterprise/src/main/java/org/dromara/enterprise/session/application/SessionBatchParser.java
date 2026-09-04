/**
 * [INPUT]: 依赖 Jackson 3、Base64 与 JCA SHA-256，接收未经信任的上传命令和路径 Session ID。
 * [OUTPUT]: 提供 canonical Base64/hash、精确 JSONL 字节、官方 v0 header、连续 envelope 与 rolling hash 校验。
 * [POS]: session/application 的协议闸门；hash 基于 raw line，不对事件重序列化后计算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.application;

import org.dromara.enterprise.session.domain.SessionReplica;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class SessionBatchParser {
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final Set<String> HEADER_FIELDS = Set.of(
        "version", "id", "createdAt", "cwd", "parentSession", "seedLength",
        "origin", "delegationDepth", "agentPreset"
    );

    private final JsonMapper json;
    private final int maxBatchBytes;

    public SessionBatchParser(JsonMapper json, int maxBatchBytes) {
        this.json = Objects.requireNonNull(json, "json");
        if (maxBatchBytes < 1 || maxBatchBytes > 64 * 1024 * 1024) {
            throw new IllegalArgumentException("maxBatchBytes 必须在 1..64MiB");
        }
        this.maxBatchBytes = maxBatchBytes;
    }

    public ParsedBatch parse(String sessionId, SessionBatchUpload upload) {
        requireSessionId(sessionId);
        Objects.requireNonNull(upload, "upload");
        requireText(upload.idempotencyKey(), "idempotencyKey", 255);
        requireSafe(upload.fromSeq(), "fromSeq");
        requireSafe(upload.toSeq(), "toSeq");
        if (upload.toSeq() < upload.fromSeq()) throw new IllegalArgumentException("批次范围非法");

        byte[] previous = decodeHash(upload.previousRollingHash(), "previousRollingHash");
        byte[] declaredPayloadHash = decodeHash(upload.payloadSha256(), "payloadSha256");
        byte[] payload = decodePayload(upload.payloadBase64());
        byte[] actualPayloadHash = sha256(payload);
        if (!MessageDigest.isEqual(declaredPayloadHash, actualPayloadHash)) {
            throw new IllegalArgumentException("payloadSha256 不匹配");
        }

        byte[] headerBytes = validateHeader(sessionId, upload.fromSeq(), upload.header());
        byte[] titleBytes = validateTitle(upload.title());
        List<ParsedEvent> events = parseEvents(payload, upload.fromSeq(), upload.toSeq(), previous);
        return new ParsedBatch(
            upload.idempotencyKey(), upload.fromSeq(), upload.toSeq(), previous, actualPayloadHash,
            headerBytes, titleBytes, events, events.getLast().rollingHash()
        );
    }

    private List<ParsedEvent> parseEvents(byte[] payload, long fromSeq, long toSeq, byte[] previous) {
        if (payload.length == 0 || payload[payload.length - 1] != '\n') {
            throw new IllegalArgumentException("payload 必须是以换行结尾的 JSONL");
        }
        long declaredCount = Math.addExact(Math.subtractExact(toSeq, fromSeq), 1L);
        if (declaredCount > Integer.MAX_VALUE) throw new SessionException(SessionException.Kind.BATCH_TOO_LARGE);

        List<ParsedEvent> events = new ArrayList<>((int) declaredCount);
        int start = 0;
        byte[] rolling = previous.clone();
        for (int index = 0; index < payload.length; index++) {
            if (payload[index] != '\n') continue;
            if (index == start || payload[index - 1] == '\r') {
                throw new IllegalArgumentException("payload 包含空行或 CRLF");
            }
            byte[] rawLine = Arrays.copyOfRange(payload, start, index);
            long expectedSeq = Math.addExact(fromSeq, events.size());
            JsonNode parsed = json.readTree(rawLine);
            if (parsed == null || !parsed.isObject()) throw new IllegalArgumentException("event 必须是 JSON object");
            ObjectNode event = parsed.asObject();
            long seq = requireSafeNode(event.get("seq"), "event.seq");
            if (seq != expectedSeq) throw new IllegalArgumentException("event.seq 不连续");
            long time = requireSafeNode(event.get("time"), "event.time");
            String type = requireTextNode(event.get("type"), "event.type", 64);
            if (!event.has("data")) throw new IllegalArgumentException("event.data 缺失");
            rolling = rollingHash(rolling, rawLine);
            events.add(new ParsedEvent(seq, type, Instant.ofEpochMilli(time), rawLine, rolling));
            start = index + 1;
        }
        if (events.size() != declaredCount) throw new IllegalArgumentException("事件数量与范围不一致");
        return List.copyOf(events);
    }

    private byte[] validateHeader(String sessionId, long fromSeq, JsonNode header) {
        if (fromSeq != 0) {
            if (header != null && !header.isNull()) throw new IllegalArgumentException("只有首批可以携带 header");
            return null;
        }
        if (header == null || !header.isObject()) throw new IllegalArgumentException("首批必须携带 header");
        ObjectNode object = header.asObject();
        for (String field : object.propertyNames()) {
            if (!HEADER_FIELDS.contains(field)) throw new IllegalArgumentException("header 包含未知字段");
        }
        JsonNode version = object.get("version");
        if (version == null || !version.isIntegralNumber() || version.longValue() != SessionReplica.FORMAT_VERSION) {
            throw new SessionException(SessionException.Kind.FORMAT_UNSUPPORTED);
        }
        if (!sessionId.equals(requireTextNode(object.get("id"), "header.id", 128))) {
            throw new IllegalArgumentException("header.id 与路径不一致");
        }
        requireSafeNode(object.get("createdAt"), "header.createdAt");
        optionalText(object.get("cwd"), "header.cwd", 4096, false);
        optionalText(object.get("parentSession"), "header.parentSession", 128, false);
        optionalSafe(object.get("seedLength"), "header.seedLength");
        JsonNode origin = object.get("origin");
        if (origin != null && (!origin.isString() || !"subagent".equals(origin.stringValue()))) {
            throw new IllegalArgumentException("header.origin 非法");
        }
        optionalSafe(object.get("delegationDepth"), "header.delegationDepth");
        optionalText(object.get("agentPreset"), "header.agentPreset", 255, false);
        return json.writeValueAsBytes(object);
    }

    private static byte[] validateTitle(String title) {
        if (title == null) return null;
        if (title.length() > 512) throw new IllegalArgumentException("title 过长");
        return title.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private byte[] decodePayload(String encoded) {
        requireText(encoded, "payloadBase64", encoded == null ? 0 : encoded.length());
        long maximumEncoded = ((long) maxBatchBytes + 2L) / 3L * 4L;
        if (encoded.length() > maximumEncoded) throw new SessionException(SessionException.Kind.BATCH_TOO_LARGE);
        try {
            byte[] payload = Base64.getDecoder().decode(encoded);
            if (payload.length > maxBatchBytes) throw new SessionException(SessionException.Kind.BATCH_TOO_LARGE);
            return payload;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("payloadBase64 非法", exception);
        }
    }

    private static byte[] decodeHash(String encoded, String name) {
        if (encoded == null || encoded.length() != 44 || encoded.charAt(43) != '=') {
            throw new IllegalArgumentException(name + " 非法");
        }
        try {
            byte[] value = Base64.getDecoder().decode(encoded);
            if (value.length != SessionReplica.HASH_BYTES
                || !Base64.getEncoder().encodeToString(value).equals(encoded)) {
                throw new IllegalArgumentException(name + " 长度或编码非法");
            }
            return value;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(name + " 非法", exception);
        }
    }

    private static long requireSafeNode(JsonNode value, String name) {
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong()) {
            throw new IllegalArgumentException(name + " 必须是整数");
        }
        long result = value.longValue();
        requireSafe(result, name);
        return result;
    }

    private static void optionalSafe(JsonNode value, String name) {
        if (value != null) requireSafeNode(value, name);
    }

    private static String requireTextNode(JsonNode value, String name, int maximum) {
        if (value == null || !value.isString()) throw new IllegalArgumentException(name + " 必须是字符串");
        return requireText(value.stringValue(), name, maximum);
    }

    private static void optionalText(JsonNode value, String name, int maximum, boolean allowEmpty) {
        if (value == null) return;
        if (!value.isString() || value.stringValue().length() > maximum
            || (!allowEmpty && value.stringValue().isBlank())) {
            throw new IllegalArgumentException(name + " 非法");
        }
    }

    private static String requireText(String value, String name, int maximum) {
        if (value == null || value.isBlank() || value.length() > maximum) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return value;
    }

    private static void requireSessionId(String value) {
        requireText(value, "sessionId", 128);
        if (value.chars().anyMatch(character -> Character.isISOControl(character))) {
            throw new IllegalArgumentException("sessionId 包含控制字符");
        }
    }

    private static void requireSafe(long value, String name) {
        if (value < 0 || value > MAX_SAFE_INTEGER) throw new IllegalArgumentException(name + " 不是非负安全整数");
    }

    private static byte[] rollingHash(byte[] previous, byte[] rawLine) {
        MessageDigest digest = digest();
        digest.update(previous);
        return digest.digest(rawLine);
    }

    private static byte[] sha256(byte[] value) {
        return digest().digest(value);
    }

    private static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM 缺少 SHA-256", exception);
        }
    }

    public record ParsedBatch(
        String idempotencyKey,
        long fromSeq,
        long toSeq,
        byte[] previousRollingHash,
        byte[] payloadSha256,
        byte[] headerBytes,
        byte[] titleBytes,
        List<ParsedEvent> events,
        byte[] resultHash
    ) {
        public ParsedBatch {
            previousRollingHash = previousRollingHash.clone();
            payloadSha256 = payloadSha256.clone();
            headerBytes = headerBytes == null ? null : headerBytes.clone();
            titleBytes = titleBytes == null ? null : titleBytes.clone();
            events = List.copyOf(events);
            resultHash = resultHash.clone();
        }

        @Override public byte[] previousRollingHash() { return previousRollingHash.clone(); }
        @Override public byte[] payloadSha256() { return payloadSha256.clone(); }
        @Override public byte[] headerBytes() { return headerBytes == null ? null : headerBytes.clone(); }
        @Override public byte[] titleBytes() { return titleBytes == null ? null : titleBytes.clone(); }
        @Override public byte[] resultHash() { return resultHash.clone(); }
    }

    public record ParsedEvent(long seq, String type, Instant time, byte[] rawLine, byte[] rollingHash) {
        public ParsedEvent {
            rawLine = rawLine.clone();
            rollingHash = rollingHash.clone();
        }

        @Override public byte[] rawLine() { return rawLine.clone(); }
        @Override public byte[] rollingHash() { return rollingHash.clone(); }
    }
}
