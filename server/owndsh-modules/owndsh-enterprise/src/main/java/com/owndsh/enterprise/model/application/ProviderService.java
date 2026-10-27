/**
 * [INPUT]: 依赖事务、ProviderStore、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供供应商元信息 CRUD、状态 CAS 与后台生成 providerKey。
 * [POS]: model/application 的供应商元信息用例编排，连接密钥由 ProviderConnectionService 独立负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.*;
import com.owndsh.enterprise.model.domain.*;
import com.owndsh.enterprise.model.persistence.ProviderStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ProviderService {
    private final TransactionOperations transactions; private final ProviderStore providers; private final BootstrapRevisionStore revisions; private final AuditSink audit; private final LongSupplier ids; private final Clock clock;
    public ProviderService(TransactionOperations tx, ProviderStore stores, BootstrapRevisionStore revisions, AuditSink audit, LongSupplier ids){this(tx,stores,revisions,audit,ids,Clock.systemUTC());}
    ProviderService(TransactionOperations tx,ProviderStore stores,BootstrapRevisionStore revisions,AuditSink audit,LongSupplier ids,Clock clock){this.transactions=Objects.requireNonNull(tx);this.providers=Objects.requireNonNull(stores);this.revisions=Objects.requireNonNull(revisions);this.audit=Objects.requireNonNull(audit);this.ids=Objects.requireNonNull(ids);this.clock=Objects.requireNonNull(clock);}
    public List<ModelProvider> list(String tenant,long after,int limit){return providers.list(tenant,after,limit);}
    public ModelProvider get(String tenant,long id){return providers.find(tenant,id).orElseThrow(ModelResourceNotFoundException::new);}
    public ModelProvider create(ModelMutationContext context,ProviderSpec spec){long id=positiveId();ModelProvider p=new ModelProvider(id,context.tenantId(),"provider-"+id,spec.name(),spec.description(),ModelStatus.ACTIVE,0);try{return require(transactions.execute(s->{providers.insert(p);long r=revisions.increment(context.tenantId());audit(context,p,ProviderChangeMetadata.Operation.CREATE,r);return p;}));}catch(DataIntegrityViolationException e){throw new IllegalArgumentException("provider 名称冲突",e);}}
    public ModelProvider update(ModelMutationContext context,long id,long expected,ProviderSpec spec){ModelProvider current=get(context.tenantId(),id);requireRevision(current,expected);ModelProvider updated=new ModelProvider(id,current.tenantId(),current.providerKey(),spec.name(),spec.description(),current.status(),expected+1);return require(transactions.execute(s->{if(!providers.update(updated,expected))throw conflict(context.tenantId(),id,expected);long r=revisions.increment(context.tenantId());audit(context,updated,ProviderChangeMetadata.Operation.UPDATE,r);return updated;}));}
    public ModelProvider setStatus(ModelMutationContext context,long id,long expected,ModelStatus status){ModelProvider current=get(context.tenantId(),id);requireRevision(current,expected);ModelProvider updated=new ModelProvider(id,current.tenantId(),current.providerKey(),current.name(),current.description(),status,expected+1);return require(transactions.execute(s->{if(!providers.updateStatus(context.tenantId(),id,status,expected))throw conflict(context.tenantId(),id,expected);long r=revisions.increment(context.tenantId());audit(context,updated,status==ModelStatus.ACTIVE?ProviderChangeMetadata.Operation.ENABLE:ProviderChangeMetadata.Operation.DISABLE,r);return updated;}));}
    private void audit(ModelMutationContext c,ModelProvider p,ProviderChangeMetadata.Operation op,long rev){audit.append(new AuditEvent(positiveId(),c.tenantId(),Instant.now(clock),AuditActorType.USER,c.actorId(),null,AuditAction.PROVIDER_CHANGED,"MODEL_PROVIDER",Long.toString(p.id()),AuditResult.SUCCESS,null,c.requestId(),c.sourceIp(),c.userAgentHash(),new ProviderChangeMetadata(op,false,p.revision(),rev)));}
    private RevisionConflictException conflict(String t,long id,long e){return providers.find(t,id).map(p->new RevisionConflictException(e,p.revision())).orElseThrow(ModelResourceNotFoundException::new);}
    private static void requireRevision(ModelProvider p,long e){if(e<0||p.revision()!=e)throw new RevisionConflictException(e,p.revision());}
    private long positiveId(){long id=ids.getAsLong();if(id<=0)throw new IllegalStateException("ID generator 必须返回正数");return id;}
    private static <T>T require(T result){return Objects.requireNonNull(result,"provider 事务没有返回结果");}
}
