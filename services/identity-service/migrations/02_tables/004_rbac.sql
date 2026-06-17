CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

INSERT INTO roles (name, description)
VALUES
    ('user', 'Usuario final de la plataforma'),
    ('admin', 'Administrador de catálogo, auditoría, reportes y métricas')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP;

INSERT INTO permissions (code, description)
VALUES
    ('catalog:read', 'Consultar catálogo visible'),
    ('catalog:admin', 'Crear, editar, eliminar y programar contenido'),
    ('media:upload', 'Generar URLs firmadas de carga y confirmar media'),
    ('audit:read', 'Consultar auditoría transaccional'),
    ('reports:export', 'Exportar reportes CSV/PDF'),
    ('metrics:read', 'Consultar métricas administrativas'),
    ('roles:admin', 'Administrar roles y permisos')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('catalog:read')
WHERE r.name = 'user'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'catalog:read', 'catalog:admin', 'media:upload', 'audit:read',
    'reports:export', 'metrics:read', 'roles:admin'
)
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
