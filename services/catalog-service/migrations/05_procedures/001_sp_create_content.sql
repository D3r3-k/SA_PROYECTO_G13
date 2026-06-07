DELIMITER $$

CREATE PROCEDURE sp_create_content(
    IN p_content_id CHAR(36),
    IN p_title VARCHAR(255),
    IN p_description TEXT,
    IN p_type VARCHAR(20)
)
BEGIN

    INSERT INTO content(
        content_id,
        title,
        description,
        content_type
    )
    VALUES(
        p_content_id,
        p_title,
        p_description,
        p_type
    );

END$$

DELIMITER ;