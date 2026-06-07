DELIMITER $$

CREATE PROCEDURE sp_get_genres()
BEGIN
    SELECT genre_id, name FROM genres ORDER BY name;
END$$

DELIMITER ;