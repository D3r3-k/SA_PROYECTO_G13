DELIMITER $$
CREATE PROCEDURE sp_get_featured()
BEGIN
    SELECT
        c.content_id,
        c.title,
        c.poster_url,
        c.content_type,
        g.name  AS genre,
        cat.name AS category
    FROM content c
    JOIN genres g       ON c.genre_id    = g.genre_id
    JOIN categories cat ON c.category_id = cat.category_id
    ORDER BY c.release_date DESC
    LIMIT 20;
END$$
DELIMITER ;