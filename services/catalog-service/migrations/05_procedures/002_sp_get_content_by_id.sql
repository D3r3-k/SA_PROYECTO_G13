DELIMITER $$

-- SP: Obtener contenido por ID con actores y temporadas
CREATE PROCEDURE sp_get_content_by_id(IN p_content_id VARCHAR(36))
BEGIN
    -- Detalle principal
    SELECT
        c.content_id,
        c.title,
        c.description,
        c.content_type,
        c.poster_url,
        c.release_date,
        g.name  AS genre,
        cat.name AS category
    FROM content c
    JOIN genre g      ON c.genre_id    = g.genre_id
    JOIN categorie cat ON c.category_id = cat.category_id
    WHERE c.content_id = p_content_id;

    -- Actores
    SELECT
        a.actor_id,
        a.full_name,
        a.photo_url
    FROM actors a
    JOIN content_actors ca ON a.actor_id = ca.actor_id
    WHERE ca.content_id = p_content_id;

    -- Temporadas y episodios
    SELECT
        s.season_id,
        s.number        AS season_number,
        e.episode_id,
        e.title         AS episode_title,
        e.duration_minutes
    FROM seasons s
    JOIN episodes e ON s.season_id = e.season_id
    WHERE s.content_id = p_content_id
    ORDER BY s.number, e.episode_id;
END$$

DELIMITER ;