/**
 * [INPUT]: 依赖 Nimbus Discovery/Authorization Code/PKCE/IDTokenValidator、SecretCipher 与端点安全策略。
 * [OUTPUT]: 对外提供 OIDC 授权 URI、code 交换、Discovery 算法/issuer/aud/nonce/JWKS 校验和白名单 principal 投影。
 * [POS]: IdentityAdapter 的 OIDC 实现，外部 Token 和原始 claims 在方法边界内终止。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.oauth2.sdk.AuthorizationCode;
import com.nimbusds.oauth2.sdk.AuthorizationCodeGrant;
import com.nimbusds.oauth2.sdk.ResponseType;
import com.nimbusds.oauth2.sdk.Scope;
import com.nimbusds.oauth2.sdk.TokenRequest;
import com.nimbusds.oauth2.sdk.TokenResponse;
import com.nimbusds.oauth2.sdk.auth.ClientSecretBasic;
import com.nimbusds.oauth2.sdk.auth.Secret;
import com.nimbusds.oauth2.sdk.id.ClientID;
import com.nimbusds.oauth2.sdk.id.Issuer;
import com.nimbusds.oauth2.sdk.id.State;
import com.nimbusds.oauth2.sdk.pkce.CodeChallenge;
import com.nimbusds.oauth2.sdk.pkce.CodeChallengeMethod;
import com.nimbusds.oauth2.sdk.pkce.CodeVerifier;
import com.nimbusds.openid.connect.sdk.AuthenticationRequest;
import com.nimbusds.openid.connect.sdk.Nonce;
import com.nimbusds.openid.connect.sdk.OIDCTokenResponse;
import com.nimbusds.openid.connect.sdk.OIDCTokenResponseParser;
import com.nimbusds.openid.connect.sdk.claims.IDTokenClaimsSet;
import com.nimbusds.openid.connect.sdk.op.OIDCProviderMetadata;
import com.nimbusds.openid.connect.sdk.validators.IDTokenValidator;
import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.OidcClaimMapping;
import org.dromara.enterprise.auth.domain.OidcCodeCredentials;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * Nimbus OIDC 身份适配器。
 */
public final class OidcIdentityAdapter implements IdentityAdapter {
    private static final int CONNECT_TIMEOUT_MILLIS = 5_000;
    private static final int READ_TIMEOUT_MILLIS = 10_000;

    private final SecretCipher secretCipher;
    private final IdentityEndpointPolicy endpointPolicy;

    public OidcIdentityAdapter(SecretCipher secretCipher, IdentityEndpointPolicy endpointPolicy) {
        this.secretCipher = Objects.requireNonNull(secretCipher, "secretCipher");
        this.endpointPolicy = Objects.requireNonNull(endpointPolicy, "endpointPolicy");
    }

    @Override
    public IdentitySourceType type() {
        return IdentitySourceType.OIDC;
    }

    /**
     * 使用 Nimbus 构建固定 code + S256 + nonce 授权请求。
     */
    public URI authorizationUri(
        IdentitySource source,
        URI redirectUri,
        String state,
        String nonce,
        String codeChallenge
    ) {
        OIDCProviderMetadata metadata = resolveMetadata(source);
        try {
            return new AuthenticationRequest.Builder(
                ResponseType.CODE,
                Scope.parse(source.oidc().scopes()),
                new ClientID(source.clientId()),
                Objects.requireNonNull(redirectUri, "redirectUri")
            )
                .endpointURI(metadata.getAuthorizationEndpointURI())
                .state(new State(requireText(state, "state")))
                .nonce(new Nonce(requireText(nonce, "nonce")))
                .codeChallenge(CodeChallenge.parse(requireText(codeChallenge, "codeChallenge")), CodeChallengeMethod.S256)
                .build()
                .toURI();
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("OIDC 授权请求配置非法", exception);
        }
    }

    @Override
    public IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential) {
        requireSource(source);
        if (!(credential instanceof OidcCodeCredentials codeCredentials)) {
            throw new IdentityAuthenticationException();
        }
        OIDCProviderMetadata metadata = resolveMetadata(source);
        byte[] secretBytes = decryptSecret(source);
        try {
            OIDCTokenResponse tokenResponse = exchangeCode(source, metadata, codeCredentials, secretBytes);
            IDTokenClaimsSet claims = validateIdToken(source, metadata, tokenResponse, codeCredentials.expectedNonce());
            return toPrincipal(source, claims);
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentityAuthenticationException(exception);
        } finally {
            Arrays.fill(secretBytes, (byte) 0);
        }
    }

    @Override
    public IdentitySourceConnection testConnection(IdentitySource source) {
        resolveMetadata(source);
        return IdentitySourceConnection.ready(type());
    }

    private OIDCTokenResponse exchangeCode(
        IdentitySource source,
        OIDCProviderMetadata metadata,
        OidcCodeCredentials credentials,
        byte[] secretBytes
    ) throws Exception {
        ClientID clientId = new ClientID(source.clientId());
        AuthorizationCodeGrant grant = new AuthorizationCodeGrant(
            new AuthorizationCode(credentials.authorizationCode()),
            credentials.redirectUri(),
            new CodeVerifier(credentials.codeVerifier())
        );
        TokenRequest request = new TokenRequest(
            metadata.getTokenEndpointURI(),
            new ClientSecretBasic(clientId, new Secret(new String(secretBytes, StandardCharsets.UTF_8))),
            grant
        );
        var httpRequest = request.toHTTPRequest();
        httpRequest.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
        httpRequest.setReadTimeout(READ_TIMEOUT_MILLIS);
        httpRequest.setFollowRedirects(false);
        TokenResponse parsed = OIDCTokenResponseParser.parse(httpRequest.send());
        if (!(parsed instanceof OIDCTokenResponse oidcResponse)) {
            throw new IdentityAuthenticationException();
        }
        return oidcResponse;
    }

    private IDTokenClaimsSet validateIdToken(
        IdentitySource source,
        OIDCProviderMetadata metadata,
        OIDCTokenResponse tokenResponse,
        String expectedNonce
    ) throws Exception {
        var idToken = tokenResponse.getOIDCTokens().getIDToken();
        if (idToken == null || !(idToken.getHeader().getAlgorithm() instanceof JWSAlgorithm algorithm)) {
            throw new IdentityAuthenticationException();
        }
        List<JWSAlgorithm> advertisedAlgorithms = metadata.getIDTokenJWSAlgs();
        boolean asymmetric = JWSAlgorithm.Family.RSA.contains(algorithm)
            || JWSAlgorithm.Family.EC.contains(algorithm)
            || JWSAlgorithm.Family.ED.contains(algorithm);
        if (!asymmetric || advertisedAlgorithms == null || !advertisedAlgorithms.contains(algorithm)) {
            throw new IdentityAuthenticationException();
        }
        IDTokenValidator validator = new IDTokenValidator(
            new Issuer(source.issuer().toString()),
            new ClientID(source.clientId()),
            algorithm,
            metadata.getJWKSetURI().toURL()
        );
        validator.setMaxClockSkew(60);
        return validator.validate(idToken, new Nonce(expectedNonce));
    }

    private IdentityPrincipal toPrincipal(IdentitySource source, IDTokenClaimsSet claims) {
        OidcClaimMapping mapping = source.oidc().claims();
        String username = requiredClaim(claims, mapping.username());
        String displayName = requiredClaim(claims, mapping.displayName());
        String email = optionalStringClaim(claims, mapping.email());
        List<String> groups = optionalGroupsClaim(claims, mapping.groups());
        return new IdentityPrincipal(
            Long.toString(source.id()),
            type(),
            claims.getSubject().getValue(),
            username,
            displayName,
            email,
            groups
        );
    }

    private OIDCProviderMetadata resolveMetadata(IdentitySource source) {
        requireSource(source);
        endpointPolicy.requireOidcEndpoint(source.issuer(), "OIDC issuer");
        try {
            OIDCProviderMetadata metadata = OIDCProviderMetadata.resolve(
                new Issuer(source.issuer().toString()),
                CONNECT_TIMEOUT_MILLIS,
                READ_TIMEOUT_MILLIS
            );
            if (!source.issuer().toString().equals(metadata.getIssuer().getValue())) {
                throw new IdentitySourceConfigurationException("OIDC Discovery issuer 不匹配");
            }
            endpointPolicy.requireOidcEndpoint(metadata.getAuthorizationEndpointURI(), "OIDC authorization endpoint");
            endpointPolicy.requireOidcEndpoint(metadata.getTokenEndpointURI(), "OIDC token endpoint");
            endpointPolicy.requireOidcEndpoint(metadata.getJWKSetURI(), "OIDC JWKS URI");
            return metadata;
        } catch (IdentitySourceConfigurationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IdentitySourceConfigurationException("OIDC Discovery 失败", exception);
        }
    }

    private byte[] decryptSecret(IdentitySource source) {
        EncryptedSecret encryptedSecret = Objects.requireNonNull(source.encryptedSecret(), "encryptedSecret");
        return secretCipher.decrypt(
            SecretPurpose.IDENTITY_SECRET,
            new SecretAad(
                source.tenantId(),
                "ent_identity_source",
                Long.toString(source.id()),
                "secret_ciphertext",
                encryptedSecret.keyVersion()
            ),
            encryptedSecret
        );
    }

    private static String requiredClaim(IDTokenClaimsSet claims, String name) {
        String value = optionalStringClaim(claims, name);
        if (value == null || value.isBlank()) {
            throw new IdentitySourceConfigurationException("OIDC 必填 claim 缺失");
        }
        return value;
    }

    private static String optionalStringClaim(IDTokenClaimsSet claims, String name) {
        if (name == null) return null;
        Object value = claims.getClaim(name);
        if (value == null) return null;
        if (!(value instanceof String text)) {
            throw new IdentitySourceConfigurationException("OIDC claim 类型错误");
        }
        return text.isBlank() ? null : text;
    }

    private static List<String> optionalGroupsClaim(IDTokenClaimsSet claims, String name) {
        if (name == null || claims.getClaim(name) == null) return List.of();
        List<String> groups = claims.getStringListClaim(name);
        if (groups == null || groups.stream().anyMatch(group -> group == null || group.isBlank())) {
            throw new IdentitySourceConfigurationException("OIDC groups claim 类型错误");
        }
        return List.copyOf(groups);
    }

    private static void requireSource(IdentitySource source) {
        Objects.requireNonNull(source, "source");
        if (source.type() != IdentitySourceType.OIDC) {
            throw new IllegalArgumentException("OIDC adapter 收到错误身份源类型");
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
