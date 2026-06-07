CREATE VIEW vw_catalog AS
SELECT
    c.content_id,
    c.title,
    c.content_type,
    c.poster_url,
    c.release_date
FROM content c
WHERE c.active = TRUE;