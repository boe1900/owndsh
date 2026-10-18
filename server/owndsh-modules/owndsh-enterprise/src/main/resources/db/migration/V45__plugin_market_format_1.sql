-- [INPUT]: 依赖 V44 的插件包、版本与安装配置事实。
-- [OUTPUT]: 为包级 market metadata、版本 source/engines/publishedAt 提供独立持久化列。
-- [POS]: DSH plugin market format 1 的前向迁移；旧 npm 登记转换为等价的最小官方来源。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_plugin_package
    add column market_metadata_json jsonb not null default '{}'::jsonb;

alter table ent_plugin_version
    add column source_json jsonb not null default '{"type":"npm"}'::jsonb,
    add column engines_json jsonb not null default '{}'::jsonb,
    add column published_at timestamptz;

update ent_plugin_package p
set market_metadata_json = jsonb_build_object(
    'title', p.display_name,
    'description', coalesce(v.installation_json->>'description', ''),
    'icon', '',
    'author', coalesce(v.installation_json->>'author', ''),
    'homepage', '',
    'repositoryUrl', coalesce(v.installation_json->>'repositoryUrl', ''),
    'repositoryDirectory', '',
    'category', coalesce(v.installation_json->>'category', ''),
    'keywords', '[]'::jsonb,
    'labels', '[]'::jsonb,
    'sortKeys', '{}'::jsonb
)
from ent_plugin_version v
where v.package_id = p.id
  and v.id = (
      select min(candidate.id)
      from ent_plugin_version candidate
      where candidate.package_id = p.id
  )
  and p.market_metadata_json = '{}'::jsonb;

update ent_plugin_version
set published_at = case when status = 'PUBLISHED' then created_at else null end;

alter table ent_plugin_package
    add constraint ck_ent_plugin_package_market_metadata
    check (jsonb_typeof(market_metadata_json) = 'object');

alter table ent_plugin_version
    add constraint ck_ent_plugin_version_source
    check (jsonb_typeof(source_json) = 'object'),
    add constraint ck_ent_plugin_version_engines
    check (jsonb_typeof(engines_json) = 'object');
