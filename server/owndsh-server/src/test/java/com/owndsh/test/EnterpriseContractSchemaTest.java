/**
 * [INPUT]: 依赖 contracts/generated 的 fixture manifest、自包含 Draft 2020-12 JSON Schema 与原始 fixture
 * [OUTPUT]: 验证 Java 和 TypeScript 对 manifest 全部协议正反样例给出一致有效性结论
 * [POS]: owndsh-server 的跨语言协议门禁，按任务扩展 fixture manifest 而不维护第二份手写 schema
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.test;

import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("T02 企业协议 JSON Schema")
@Tag("dev")
class EnterpriseContractSchemaTest {

    private static final JsonMapper JSON_MAPPER = JsonMapper.builder().build();
    private static final SchemaRegistry SCHEMA_REGISTRY =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    @Test
    @DisplayName("Java 按 OpenAPI 声明验证全部正反 fixture")
    void validatesEveryOpenApiDeclaredFixture() throws IOException {
        Path manifestPath = CONTRACT_ROOT.resolve("generated/fixtures-manifest.json");
        JsonNode fixtures = JSON_MAPPER.readTree(Files.readString(manifestPath)).get("fixtures");

        assertTrue(fixtures.isArray() && !fixtures.isEmpty(), "fixture manifest 必须声明至少一个协议样例");
        for (JsonNode fixture : fixtures) {
            assertFixtureValidity(fixture);
        }
    }

    private static void assertFixtureValidity(JsonNode fixture) throws IOException {
        String relativeFixture = fixture.get("file").asString();
        String schemaName = fixture.get("schema").asString();
        boolean expectedValid = fixture.get("valid").asBoolean();

        Path fixturePath = CONTRACT_ROOT.resolve(relativeFixture).normalize();
        Path fixtureDirectory = CONTRACT_ROOT.resolve("fixtures").normalize();
        assertTrue(fixturePath.startsWith(fixtureDirectory), "fixture 必须位于 contracts/fixtures: " + relativeFixture);

        Path schemaPath = CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json");
        Schema schema = SCHEMA_REGISTRY.getSchema(Files.readString(schemaPath), InputFormat.JSON);
        List<Error> errors = schema.validate(Files.readString(fixturePath), InputFormat.JSON);

        assertEquals(expectedValid, errors.isEmpty(), () -> relativeFixture + " validation errors: " + errors);
    }

    private static Path findContractRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("contracts");
            if (Files.isRegularFile(candidate.resolve("enterprise-openapi.yaml"))) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("cannot locate contracts/enterprise-openapi.yaml from user.dir");
    }
}
