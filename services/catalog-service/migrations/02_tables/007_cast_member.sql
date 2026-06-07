CREATE TABLE cast_member (
    content_id CHAR(36),
    actor_id CHAR(36),
    role_name VARCHAR(255),

    PRIMARY KEY(content_id, actor_id),

    FOREIGN KEY(content_id)
        REFERENCES content(content_id),

    FOREIGN KEY(actor_id)
        REFERENCES actor(actor_id)
);