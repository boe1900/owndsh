/**
 * [INPUT]: 依赖模拟的 GitHub SHA 响应和 codeload 归档响应。
 * [OUTPUT]: 验证 ref 解析的媒体类型、归档 URL 固定 commit 与私库 Bearer 请求头。
 * [POS]: skill/application 的源码导入 HTTP 契约回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("dev")
class HttpSkillSourceClientTest {
    @Test
    void githubRequestsOnlyTheShaAndDownloadsTheResolvedCommit() throws Exception {
        String sha = "1f966c69d880defca2e516abe83b7484d8e86497";
        byte[] zip = {1, 2, 3};
        HttpClient http = mock(HttpClient.class);
        HttpResponse<InputStream> revision = mock();
        when(revision.statusCode()).thenReturn(200);
        when(revision.body()).thenReturn(new ByteArrayInputStream(sha.getBytes(StandardCharsets.US_ASCII)));
        HttpResponse<InputStream> archive = mock();
        when(archive.statusCode()).thenReturn(200);
        when(archive.body()).thenReturn(new ByteArrayInputStream(zip));
        when(http.<InputStream>send(any(), any())).thenReturn(revision, archive);
        HttpSkillSourceClient client = new HttpSkillSourceClient(http, JsonMapper.builder().build());

        var fetched = client.fetch(new SkillSourceClient.Source("https://github.com/example/skill", "v5.3.0"),
            "test-token".toCharArray());

        assertThat(fetched.resolvedCommit()).isEqualTo(sha);
        assertThat(fetched.archive()).containsExactly(zip);
        var requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http, times(2)).send(requests.capture(), any());
        HttpRequest commitRequest = requests.getAllValues().getFirst();
        HttpRequest archiveRequest = requests.getValue();
        assertThat(commitRequest.uri().toString()).isEqualTo("https://api.github.com/repos/example/skill/commits/v5.3.0");
        assertThat(commitRequest.headers().firstValue("Accept")).contains("application/vnd.github.sha");
        assertThat(archiveRequest.uri().toString()).isEqualTo("https://codeload.github.com/example/skill/zip/" + sha);
        assertThat(requests.getAllValues()).allSatisfy(request ->
            assertThat(request.headers().firstValue("Authorization")).contains("Bearer test-token"));
    }
}
