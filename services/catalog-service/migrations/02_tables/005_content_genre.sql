CREATE TABLE content_genre (
    content_id CHAR(36),
    genre_id CHAR(36),

    PRIMARY KEY(content_id, genre_id),

    FOREIGN KEY(content_id)
        REFERENCES content(content_id),

    FOREIGN KEY(genre_id)
        REFERENCES genre(genre_id)
);