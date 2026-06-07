CREATE VIEW vw_content_detail AS
SELECT
    c.content_id,
    c.title,
    c.description,
    c.content_type,
    c.release_date
FROM content c;