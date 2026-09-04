/**
 * [INPUT]: 依赖 SessionBatchParser、Jackson 3 与独立 JCA SHA-256 期望值。
 * [OUTPUT]: 验证 canonical Base64、精确 payload/raw-line hash、v0 header、连续 envelope 与恶意输入拒绝。
 * [POS]: T16 字节协议的快速单元门禁，数据库并发和密文事实由 SessionServerIntegrationTest 覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session;

import org.dromara.enterprise.session.application.SessionBatchParser;
import org.dromara.enterprise.session.application.SessionBatchUpload;
import org.dromara.enterprise.session.application.SessionException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class SessionBatchParserTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final byte[] ZERO = new byte[32];

    @Test
    void hashesExactJsonlBytesAndRawLinesWithoutReserialization() throws Exception {
        String first = "{ \"type\" : \"future/event\", \"seq\" : 0, \"time\" : 1, \"data\" : {\"x\":1} }";
        String second = "{\"type\":\"turn/end\",\"seq\":1,\"time\":2,\"data\":null,\"ignorable\":true}";
        byte[] payload = (first + "\n" + second + "\n").getBytes(StandardCharsets.UTF_8);
        SessionBatchParser parser = new SessionBatchParser(JSON,4096);

        SessionBatchParser.ParsedBatch parsed = parser.parse("session-raw",new SessionBatchUpload(
            "device:session-raw:0:1",0,1,b64(ZERO),b64(sha(payload)),b64(payload),
            header("session-raw",0),"Raw title"
        ));

        byte[] firstHash = sha(concat(ZERO,first.getBytes(StandardCharsets.UTF_8)));
        byte[] secondHash = sha(concat(firstHash,second.getBytes(StandardCharsets.UTF_8)));
        assertThat(parsed.payloadSha256()).isEqualTo(sha(payload));
        assertThat(parsed.events()).hasSize(2);
        assertThat(parsed.events().getFirst().rawLine()).isEqualTo(first.getBytes(StandardCharsets.UTF_8));
        assertThat(parsed.events().getFirst().rollingHash()).isEqualTo(firstHash);
        assertThat(parsed.resultHash()).isEqualTo(secondHash);
        assertThat(JSON.readTree(parsed.headerBytes())).isEqualTo(header("session-raw",0));
    }

    @Test
    void rejectsUnsupportedHeaderMalformedEnvelopeHashCrlfAndOversize() throws Exception {
        byte[] valid = "{\"type\":\"turn/start\",\"seq\":0,\"time\":1,\"data\":{}}\n"
            .getBytes(StandardCharsets.UTF_8);
        SessionBatchParser parser = new SessionBatchParser(JSON,valid.length);
        SessionBatchUpload upload = new SessionBatchUpload(
            "key",0,0,b64(ZERO),b64(sha(valid)),b64(valid),header("s",0),null
        );
        assertThat(parser.parse("s",upload).events()).hasSize(1);

        assertThatThrownBy(() -> parser.parse("s",new SessionBatchUpload(
            "key",0,0,b64(ZERO),b64(sha(valid)),b64(valid),header("s",1),null
        ))).isInstanceOf(SessionException.class)
            .extracting(exception -> ((SessionException) exception).kind())
            .isEqualTo(SessionException.Kind.FORMAT_UNSUPPORTED);
        assertThatThrownBy(() -> parser.parse("s",new SessionBatchUpload(
            "key",0,0,b64(ZERO),b64(new byte[32]),b64(valid),header("s",0),null
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("不匹配");
        assertThatThrownBy(() -> parser.parse("s",new SessionBatchUpload(
            "key",0,0,b64(ZERO).substring(0,43),b64(sha(valid)),b64(valid),header("s",0),null
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("previousRollingHash");

        byte[] crlf = "{\"type\":\"x\",\"seq\":0,\"time\":1,\"data\":{}}\r\n"
            .getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> parser.parse("s",new SessionBatchUpload(
            "key",0,0,b64(ZERO),b64(sha(crlf)),b64(crlf),header("s",0),null
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("CRLF");

        byte[] oversized = (new String(valid,StandardCharsets.UTF_8) + " ").getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> parser.parse("s",new SessionBatchUpload(
            "key",0,0,b64(ZERO),b64(sha(oversized)),b64(oversized),header("s",0),null
        ))).isInstanceOf(SessionException.class)
            .extracting(exception -> ((SessionException) exception).kind())
            .isEqualTo(SessionException.Kind.BATCH_TOO_LARGE);
    }

    private static JsonNode header(String id,int version) {
        return JSON.readTree("""
            {"version":%d,"id":"%s","createdAt":1786900000000,"cwd":"/work","delegationDepth":0}
            """.formatted(version,id));
    }

    private static byte[] sha(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static byte[] concat(byte[] left,byte[] right) {
        byte[] result = new byte[left.length + right.length];
        System.arraycopy(left,0,result,0,left.length);
        System.arraycopy(right,0,result,left.length,right.length);
        return result;
    }

    private static String b64(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }
}
