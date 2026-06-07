DELIMITER $$

CREATE PROCEDURE sp_get_categories()
BEGIN
    SELECT category_id, name FROM categories ORDER BY name;
END$$

DELIMITER ;