/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 V46 ent_model_provider_connection schema。
 * [OUTPUT]: 对外提供连接 endpoint/协议/模型发现路径/密文的 keyset 查询与 revision/status CAS。
 * [POS]: model/persistence 的连接 PostgreSQL adapter，密钥只映射 bytea/nonce/version。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.model.domain.*;
import org.springframework.jdbc.core.JdbcOperations;
import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcProviderConnectionStore implements ProviderConnectionStore {
    private static final String COLUMNS = "c.id,c.tenant_id,c.provider_id,p.name provider_name,c.name,c.api_protocol,c.base_url,c.model_discovery_path,c.credential_ciphertext,c.credential_nonce,c.key_version,c.status,c.connect_timeout_ms,c.read_timeout_ms,c.last_probe_status,c.revision";
    private static final String FROM = " from ent_model_provider_connection c join ent_model_provider p on p.id=c.provider_id and p.tenant_id=c.tenant_id ";
    private final JdbcOperations jdbc;
    public JdbcProviderConnectionStore(JdbcOperations jdbc) { this.jdbc = Objects.requireNonNull(jdbc, "jdbc"); }
    public List<ProviderConnection> list(String tenantId,long providerId,long afterId,int limit){requirePage(afterId,limit);return jdbc.query("select "+COLUMNS+FROM+"where c.tenant_id=? and c.provider_id=? and c.id>? order by c.id limit ?",this::map,tenantId,providerId,afterId,limit);}
    public Optional<ProviderConnection> find(String tenantId,long id){return jdbc.query("select "+COLUMNS+FROM+"where c.tenant_id=? and c.id=?",this::map,tenantId,id).stream().findFirst();}
    public void insert(ProviderConnection c){EncryptedSecret s=c.encryptedCredential();jdbc.update("insert into ent_model_provider_connection(id,tenant_id,provider_id,name,api_protocol,base_url,model_discovery_path,credential_ciphertext,credential_nonce,key_version,status,connect_timeout_ms,read_timeout_ms,last_probe_status,revision) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",c.id(),c.tenantId(),c.providerId(),c.name(),c.apiProtocol().value(),c.baseUrl().toString(),c.modelDiscoveryPath(),s.ciphertext(),s.nonce(),s.keyVersion(),c.status().name(),c.connectTimeoutMs(),c.readTimeoutMs(),c.lastProbeStatus(),c.revision());}
    public boolean update(ProviderConnection c,long expected){EncryptedSecret s=c.encryptedCredential();return jdbc.update("update ent_model_provider_connection set name=?,api_protocol=?,base_url=?,model_discovery_path=?,credential_ciphertext=?,credential_nonce=?,key_version=?,connect_timeout_ms=?,read_timeout_ms=?,last_probe_status=?,revision=revision+1 where tenant_id=? and id=? and revision=?",c.name(),c.apiProtocol().value(),c.baseUrl().toString(),c.modelDiscoveryPath(),s.ciphertext(),s.nonce(),s.keyVersion(),c.connectTimeoutMs(),c.readTimeoutMs(),c.lastProbeStatus(),c.tenantId(),c.id(),expected)==1;}
    public boolean updateStatus(String tenantId,long id,ModelStatus status,long expected){return jdbc.update("update ent_model_provider_connection set status=?,revision=revision+1 where tenant_id=? and id=? and revision=?",status.name(),tenantId,id,expected)==1;}
    private ProviderConnection map(ResultSet r,int row)throws SQLException{return new ProviderConnection(r.getLong("id"),r.getString("tenant_id"),r.getLong("provider_id"),r.getString("provider_name"),r.getString("name"),ProviderApiProtocol.fromValue(r.getString("api_protocol")),URI.create(r.getString("base_url")),r.getString("model_discovery_path"),new EncryptedSecret(r.getBytes("credential_ciphertext"),r.getBytes("credential_nonce"),r.getInt("key_version")),ModelStatus.valueOf(r.getString("status")),r.getInt("connect_timeout_ms"),r.getInt("read_timeout_ms"),r.getString("last_probe_status"),r.getLong("revision"));}
    private static void requirePage(long after,int limit){if(after<0||limit<1||limit>201)throw new IllegalArgumentException("connection page 非法");}
}
