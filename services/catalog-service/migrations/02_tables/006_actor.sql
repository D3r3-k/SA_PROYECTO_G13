CREATE TABLE actor (
    actor_id CHAR(36) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    birth_date DATE NULL,
    nationality VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);