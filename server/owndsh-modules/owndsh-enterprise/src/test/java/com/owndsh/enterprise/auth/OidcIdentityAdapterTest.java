/**
 * [INPUT]: 依赖 WireMock OIDC Discovery/token/JWKS、Nimbus RSA 签名与真实 SecretCipher AAD。
 * [OUTPUT]: 验证 code+PKCE、授权 URI、Discovery 算法/issuer/aud/nonce、claim 白名单、JWKS 轮换与 HTTPS 策略。
 * [POS]: T04 OIDC adapter 协议验收，覆盖外部 IdP 不可信响应的关键负例。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.owndsh.enterprise.auth.adapter.IdentityAuthenticationException;
import com.owndsh.enterprise.auth.adapter.IdentityEndpointPolicy;
import com.owndsh.enterprise.auth.adapter.IdentitySourceConfigurationException;
import com.owndsh.enterprise.auth.adapter.OidcIdentityAdapter;
import com.owndsh.enterprise.auth.domain.IdentityPrincipal;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceStatus;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.auth.domain.OidcClaimMapping;
import com.owndsh.enterprise.auth.domain.OidcCodeCredentials;
import com.owndsh.enterprise.auth.domain.OidcSettings;
import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretPurpose;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class OidcIdentityAdapterTest {
    private static final String CLIENT_ID = "enterprise-client";
    private static final String CLIENT_SECRET = "oidc-secret-value";
    private static final String NONCE = "nonce-01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    private static final URI REDIRECT_URI = URI.create("https://platform.example.org/enterprise/auth/v1/oidc/callback");
    private static final byte[] MASTER_KEY = new byte[32];

    private WireMockServer server;
    private SecretCipher cipher;
    private OidcIdentityAdapter adapter;
    private IdentitySource source;

    @BeforeEach
    void setUp() {
        server = new WireMockServer(wireMockConfig().dynamicPort());
        server.start();
        cipher = new SecretCipher(MASTER_KEY.clone());
        adapter = new OidcIdentityAdapter(cipher, new IdentityEndpointPolicy(true));
        source = source(issuer());
        stubDiscovery(issuer());
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop();
        }
    }

    @Test
    void exchangesCodeValidatesTokenAndProjectsOnlyMappedClaims() throws Exception {
        RSAKey key = key("key-1");
        stubJwks(key);
        stubToken(token(key, issuer(), CLIENT_ID, NONCE, "subject-42"));

        IdentityPrincipal principal = adapter.authenticate(source, credentials());

        assertThat(principal).isEqualTo(new IdentityPrincipal(
            Long.toString(source.id()),
            IdentitySourceType.OIDC,
            "subject-42",
            "alice",
            "Alice Example",
            "alice@example.org",
            List.of("engineering", "platform")
        ));
        server.verify(postRequestedForToken());
    }

    @Test
    void buildsAuthorizationRequestWithS256StateAndNonce() {
        RSAKey key;
        try {
            key = key("key-auth");
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
        stubJwks(key);
        URI authorization = adapter.authorizationUri(
            source,
            REDIRECT_URI,
            "state-01ARZ3NDEKTSV4RRFFQ69G5FAV",
            NONCE,
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        );

        assertThat(authorization.getPath()).isEqualTo("/authorize");
        assertThat(authorization.getRawQuery())
            .contains("response_type=code", "code_challenge_method=S256", "state=", "nonce=")
            .doesNotContain(CLIENT_SECRET);
    }

    @Test
    void rejectsWrongIssuerAudienceAndNonce() throws Exception {
        RSAKey key = key("key-negative");
        stubJwks(key);

        stubToken(token(key, issuer() + "/wrong", CLIENT_ID, NONCE, "subject"));
        assertThatThrownBy(() -> adapter.authenticate(source, credentials()))
            .isInstanceOf(IdentityAuthenticationException.class);

        stubToken(token(key, issuer(), "other-client", NONCE, "subject"));
        assertThatThrownBy(() -> adapter.authenticate(source, credentials()))
            .isInstanceOf(IdentityAuthenticationException.class);

        stubToken(token(key, issuer(), CLIENT_ID, "wrong-nonce", "subject"));
        assertThatThrownBy(() -> adapter.authenticate(source, credentials()))
            .isInstanceOf(IdentityAuthenticationException.class);
    }

    @Test
    void rejectsTokenAlgorithmNotAdvertisedByDiscovery() throws Exception {
        RSAKey key = key("key-algorithm");
        stubDiscovery(issuer(), "RS512");
        stubJwks(key);
        stubToken(token(key, issuer(), CLIENT_ID, NONCE, "subject"));

        assertThatThrownBy(() -> adapter.authenticate(source, credentials()))
            .isInstanceOf(IdentityAuthenticationException.class);
    }

    @Test
    void acceptsUnknownKidAfterJwksRotation() throws Exception {
        RSAKey first = key("key-before");
        stubJwks(first);
        stubToken(token(first, issuer(), CLIENT_ID, NONCE, "before"));
        assertThat(adapter.authenticate(source, credentials()).externalSubject()).isEqualTo("before");

        RSAKey rotated = key("key-after");
        stubJwks(rotated);
        stubToken(token(rotated, issuer(), CLIENT_ID, NONCE, "after"));
        assertThat(adapter.authenticate(source, credentials()).externalSubject()).isEqualTo("after");
    }

    @Test
    void rejectsHttpIssuerUnlessDevelopmentFlagIsExplicit() {
        OidcIdentityAdapter secureOnly = new OidcIdentityAdapter(cipher, new IdentityEndpointPolicy(false));
        assertThatThrownBy(() -> secureOnly.testConnection(source))
            .isInstanceOf(IdentitySourceConfigurationException.class)
            .hasMessageContaining("HTTPS");
    }

    private void stubDiscovery(String discoveredIssuer) {
        stubDiscovery(discoveredIssuer, "RS256");
    }

    private void stubDiscovery(String discoveredIssuer, String signingAlgorithm) {
        server.stubFor(get(urlEqualTo("/.well-known/openid-configuration")).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("""
                {
                  "issuer":"%s",
                  "authorization_endpoint":"%s/authorize",
                  "token_endpoint":"%s/token",
                  "jwks_uri":"%s/jwks",
                  "response_types_supported":["code"],
                  "subject_types_supported":["public"],
                  "id_token_signing_alg_values_supported":["%s"]
                }
                """.formatted(discoveredIssuer, issuer(), issuer(), issuer(), signingAlgorithm))));
    }

    private void stubJwks(RSAKey key) {
        server.stubFor(get(urlEqualTo("/jwks")).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody(new JWKSet(key.toPublicJWK()).toString())));
    }

    private void stubToken(String idToken) {
        server.stubFor(post(urlEqualTo("/token")).willReturn(aResponse()
            .withStatus(200)
            .withHeader("Content-Type", "application/json")
            .withBody("""
                {"access_token":"external-access-token","token_type":"Bearer","expires_in":300,"id_token":"%s"}
                """.formatted(idToken))));
    }

    private com.github.tomakehurst.wiremock.matching.RequestPatternBuilder postRequestedForToken() {
        return postRequestedFor(urlEqualTo("/token"))
            .withHeader("Authorization", equalTo("Basic " + Base64Value.clientCredentials(CLIENT_ID, CLIENT_SECRET)))
            .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing("grant_type=authorization_code"))
            .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing("code_verifier="));
    }

    private String token(RSAKey key, String tokenIssuer, String audience, String nonce, String subject) throws Exception {
        Instant now = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .issuer(tokenIssuer)
            .subject(subject)
            .audience(audience)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plusSeconds(300)))
            .claim("nonce", nonce)
            .claim("preferred_username", "alice")
            .claim("name", "Alice Example")
            .claim("email", "alice@example.org")
            .claim("groups", List.of("engineering", "platform"))
            .claim("raw_secret_claim", "must-not-escape")
            .build();
        SignedJWT jwt = new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),
            claims
        );
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private static RSAKey key(String id) throws Exception {
        return new RSAKeyGenerator(2048).keyID(id).generate();
    }

    private OidcCodeCredentials credentials() {
        return new OidcCodeCredentials("authorization-code", REDIRECT_URI, VERIFIER, NONCE);
    }

    private IdentitySource source(String issuer) {
        long id = 7300000000000000100L;
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.IDENTITY_SECRET,
            new SecretAad("000000", "ent_identity_source", Long.toString(id), "secret_ciphertext", 1),
            CLIENT_SECRET.getBytes(StandardCharsets.UTF_8)
        );
        Instant now = Instant.parse("2026-08-18T00:00:00Z");
        return new IdentitySource(
            id,
            "000000",
            IdentitySourceType.OIDC,
            "WireMock OIDC",
            URI.create(issuer),
            CLIENT_ID,
            encrypted,
            new OidcSettings(
                List.of("openid", "profile", "email"),
                new OidcClaimMapping("preferred_username", "name", "email", "groups")
            ),
            null,
            IdentitySourceStatus.ACTIVE,
            0,
            now,
            now
        );
    }

    private String issuer() {
        return "http://127.0.0.1:" + server.port();
    }

    private static final class Base64Value {
        private Base64Value() {
        }

        private static String clientCredentials(String clientId, String secret) {
            String value = clientId + ":" + secret;
            return java.util.Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
        }
    }
}
