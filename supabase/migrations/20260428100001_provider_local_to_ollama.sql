-- Unify provider enum with router code: 'local' is only the router tier name;
-- the runtime provider is 'ollama'. Wave 0 alias window keeps client payloads
-- accepting 'local' via aiProviderSchemaWithAlias until Wave 9.
UPDATE ai_provider_configs SET provider = 'ollama' WHERE provider = 'local';
