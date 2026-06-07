DELIMITER $$

CREATE TRIGGER trg_content_insert
AFTER INSERT
ON content
FOR EACH ROW
BEGIN

    INSERT INTO content_audit(
        content_id,
        action_type
    )
    VALUES(
        NEW.content_id,
        'INSERT'
    );

END$$

DELIMITER ;