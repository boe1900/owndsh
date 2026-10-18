-- [INPUT]: V34 plugin installation JSON objects with the legacy categories array.
-- [OUTPUT]: A single DSH-compatible category string and a database invariant for new rows.
-- [POS]: plugin installation metadata migration; the DSH market format exposes metadata.category as one value.
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

update ent_plugin_version
set installation_json = (installation_json - 'categories' - 'category') || jsonb_build_object(
    'category', coalesce(installation_json->'category', installation_json->'categories'->0, to_jsonb(''::text))
)
where installation_json ? 'categories' or not (installation_json ? 'category');

alter table ent_plugin_version
    drop constraint ck_ent_plugin_version_installation,
    add constraint ck_ent_plugin_version_installation check (
        jsonb_typeof(installation_json) = 'object'
        and jsonb_typeof(installation_json->'category') = 'string'
    );
