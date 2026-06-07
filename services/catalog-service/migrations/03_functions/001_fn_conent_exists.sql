DELIMITER $$

CREATE FUNCTION fn_content_exists(
    p_content_id CHAR(36)
)
RETURNS BOOLEAN
DETERMINISTIC
BEGIN

    DECLARE total INT;

    SELECT COUNT(*)
    INTO total
    FROM content
    WHERE content_id = p_content_id;

    RETURN total > 0;

END$$

DELIMITER ;