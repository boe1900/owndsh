/**
 * [INPUT]: 依赖 ModelGatewayController、统一异常边界、真实 parser、可信设备 context 与派生 JSON Schema。
 * [OUTPUT]: 验证 gateway SSE operation、UUID/体积/严格请求和全部首字节前稳定错误映射。
 * [POS]: T10 Server/OpenAPI 同步门禁，生命周期服务使用 mock 以隔离 HTTP commit 边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.common.api.EnterpriseExceptionHandler;
import org.dromara.enterprise.common.api.EnterpriseRequestIdFilter;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T10GatewayApiContractTest {
    private static final String IDEMPOTENCY = "123e4567-e89b-42d3-a456-426614174000";
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private ModelGatewayService gateway;
    private ModelGatewayService.GatewayStream stream;
    private MockMvc mvc;

    @BeforeEach
    void setUp() throws Exception {
        gateway = mock(ModelGatewayService.class);
        stream = mock(ModelGatewayService.GatewayStream.class);
        doAnswer(invocation -> {
            var output = (java.io.OutputStream) invocation.getArgument(0);
            output.write("data: [DONE]\n\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return null;
        }).when(stream).writeTo(any());
        when(gateway.open(any(), any(), any())).thenReturn(stream);
        DeviceRequestContextResolver contexts = request -> new DeviceCallContext(
            "000000", new PlatformSession(
                101, PlatformClient.DSH_DESKTOP, "harness", "123e4567-e89b-42d3-a456-426614174010"
            ),
            org.dromara.enterprise.common.api.EnterpriseRequestIds.current(request),
            "127.0.0.1", new byte[32]
        );
        EnterpriseGatewayProperties properties = new EnterpriseGatewayProperties();
        properties.setMaxRequestBytes(256);
        ModelGatewayController controller = new ModelGatewayController(
            contexts, new GatewayChatRequestParser(JsonMapper.builder().build()), gateway, properties
        );
        mvc = standaloneSetup(controller)
            .setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();
    }

    @Test
    void servesTheSingleOpenApiOperationAsSse() throws Exception {
        MvcResult pending = mvc.perform(post("/enterprise/gateway/v1/chat/completions")
                .header("Idempotency-Key", IDEMPOTENCY)
                .contentType(MediaType.APPLICATION_JSON)
                .content(validRequest()))
            .andExpect(request().asyncStarted())
            .andReturn();
        mvc.perform(asyncDispatch(pending))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
            .andExpect(header().exists("X-Request-Id"))
            .andExpect(content().string("data: [DONE]\n\n"));

        String openApi = Files.readString(CONTRACT_ROOT.resolve("enterprise-openapi.yaml"));
        assertThat(openApi).contains("/enterprise/gateway/v1/chat/completions:");
        assertSchema(Files.readString(CONTRACT_ROOT.resolve("fixtures/gateway-request-success.json")),
            "ChatCompletionRequest");
    }

    @Test
    void rejectsInvalidUuidUnknownFieldsMultimodalAndChunkedOversizeBeforeService() throws Exception {
        assertError("not-a-uuid", validRequest(), 400, "ENT_INVALID_REQUEST");
        assertError(IDEMPOTENCY,
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}],\"stream\":true,\"base_url\":\"https://x\"}",
            400, "ENT_INVALID_REQUEST");
        assertError(IDEMPOTENCY,
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image_url\"}]}],\"stream\":true}",
            400, "ENT_INVALID_REQUEST");
        assertError(IDEMPOTENCY, "{\"padding\":\"" + "x".repeat(300) + "\"}",
            413, "ENT_REQUEST_TOO_LARGE");
    }

    @Test
    void mapsEveryPreByteGatewayFailureToStableJsonStatusAndSchema() throws Exception {
        Map<GatewayException.Kind, Integer> statuses = Map.of(
            GatewayException.Kind.MODEL_NOT_ASSIGNED, 403,
            GatewayException.Kind.REQUEST_TOO_LARGE, 413,
            GatewayException.Kind.UPSTREAM_AUTH_FAILED, 502,
            GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, 502,
            GatewayException.Kind.PLATFORM_UNAVAILABLE, 503,
            GatewayException.Kind.UPSTREAM_UNAVAILABLE, 503,
            GatewayException.Kind.UPSTREAM_TIMEOUT, 504
        );
        for (var entry : statuses.entrySet()) {
            reset(gateway);
            when(gateway.open(any(), any(), any())).thenThrow(new GatewayException(entry.getKey()));
            assertError(IDEMPOTENCY, validRequest(), entry.getValue(), entry.getKey().code());
        }
    }

    private void assertError(String idempotency, String body, int status, String code) throws Exception {
        var response = mvc.perform(post("/enterprise/gateway/v1/chat/completions")
                .header("Idempotency-Key", idempotency)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is(status))
            .andReturn().getResponse();
        String json = response.getContentAsString();
        assertThat(json).contains("\"code\":\"" + code + "\"");
        assertSchema(json, "EnterpriseErrorResponse");
    }

    private static String validRequest() {
        return "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"stream\":true}";
    }

    private static void assertSchema(String json, String schemaName) throws Exception {
        Schema schema = SCHEMAS.getSchema(Files.readString(
            CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json")
        ));
        assertThat(schema.validate(json, InputFormat.JSON)).as(json).isEmpty();
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }
}
