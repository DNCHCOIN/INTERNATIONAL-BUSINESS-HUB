BEGIN;
CREATE SCHEMA IF NOT EXISTS identity;
REVOKE ALL ON SCHEMA identity FROM PUBLIC;
CREATE TABLE IF NOT EXISTS identity.companies (
 id uuid PRIMARY KEY, country text NOT NULL CHECK(country IN ('BG','CN')),
 registration_number text NOT NULL, name_native text NOT NULL, name_latin text NOT NULL,
 legal_form text NOT NULL, vat_number text NOT NULL DEFAULT '', address jsonb NOT NULL,
 profile jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','suspended')),
 review_note text NOT NULL DEFAULT '', reviewed_by uuid, reviewed_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(country,registration_number)
);
CREATE TABLE IF NOT EXISTS identity.users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK(email=lower(email)),
 display_name text NOT NULL, password_hash text NOT NULL,
 system_role text NOT NULL DEFAULT 'company' CHECK(system_role IN ('company','administrator')),
 active boolean NOT NULL DEFAULT true, email_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity.memberships (
 user_id uuid NOT NULL REFERENCES identity.users(id), company_id uuid NOT NULL REFERENCES identity.companies(id),
 role text NOT NULL CHECK(role IN ('owner','trader','dispatcher','viewer')),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(user_id,company_id), UNIQUE(user_id)
);
CREATE TABLE IF NOT EXISTS identity.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES identity.users(id), csrf text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON identity.sessions(expires_at);
CREATE TABLE IF NOT EXISTS identity.invitations (
 token_hash text PRIMARY KEY, company_id uuid NOT NULL REFERENCES identity.companies(id), email text NOT NULL,
 role text NOT NULL CHECK(role IN ('trader','dispatcher','viewer')), expires_at timestamptz NOT NULL, used_at timestamptz,
 invited_by uuid NOT NULL REFERENCES identity.users(id)
);
CREATE TABLE IF NOT EXISTS identity.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, company_id uuid, actor_id uuid,
 action text NOT NULL, entity_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity.documents (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES identity.companies(id), kind text NOT NULL,
 parent_id uuid, name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=5242880),
 sha256 text NOT NULL, storage_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'quarantined' CHECK(status IN ('quarantined','reviewed','rejected')),
 visibility text NOT NULL DEFAULT 'company' CHECK(visibility='company'),
 review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE identity.companies ADD COLUMN IF NOT EXISTS legal_revision integer NOT NULL DEFAULT 1;
ALTER TABLE identity.documents ADD COLUMN IF NOT EXISTS legal_revision integer NOT NULL DEFAULT 1;
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM PUBLIC;
COMMIT;
