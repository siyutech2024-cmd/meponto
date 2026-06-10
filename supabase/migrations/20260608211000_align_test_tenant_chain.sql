UPDATE app_test_accounts
SET name = 'SP Core Franchise Admin',
    organization = 'SP Core Franchise',
    tenant_id = 'tenant-fr-sp-core',
    updated_at = now()
WHERE id = 'acct-franchise';
