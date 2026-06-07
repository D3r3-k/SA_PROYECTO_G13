CREATE TABLE content_category (
    content_id CHAR(36),
    category_id CHAR(36),

    PRIMARY KEY(content_id, category_id),

    FOREIGN KEY(content_id)
        REFERENCES content(content_id),

    FOREIGN KEY(category_id)
        REFERENCES category(category_id)
);