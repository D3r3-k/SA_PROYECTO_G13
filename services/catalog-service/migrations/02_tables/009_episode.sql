CREATE TABLE episode (
    episode_id CHAR(36) PRIMARY KEY,

    season_id CHAR(36) NOT NULL,

    episode_number INT NOT NULL,

    title VARCHAR(255) NOT NULL,

    description TEXT,

    duration_minutes INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(season_id)
        REFERENCES season(season_id)
);