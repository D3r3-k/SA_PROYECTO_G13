CREATE TABLE season (
    season_id CHAR(36) PRIMARY KEY,
    content_id CHAR(36) NOT NULL,
    season_number INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(content_id)
        REFERENCES content(content_id)
);