CREATE TABLE content_audit (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,

    content_id CHAR(36),

    action_type VARCHAR(20),

    action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);