[← Regresar](../../README.md)

# Engagement Service

Microservicio Python para calificaciones, porcentaje global de recomendacion, historial y reanudacion de reproduccion.

## Funcionalidades

- `RateContent`: guarda pulgar arriba/abajo por perfil y contenido.
- `GetContentRatingSummary`: calcula porcentaje global dinamicamente desde BD.
- `SaveProgress`: guarda temporada, capitulo y minuto exacto por perfil.
- `GetRecentHistory`: historial reciente por perfil.
- `ResumeContent`: devuelve el ultimo punto guardado de un contenido.

## Objetos BD

- `fn_recommendation_percentage(content_id)`
- `vw_recent_profile_history`
- `sp_save_watch_progress(...)`
- `trg_audit_rating_changes`

## Persistencia versionada

La estructura de base de datos y la logica SQL del dominio estan versionadas en:

```txt
services/engagement-service/migrations/001_init.sql
```

El servicio aplica estos archivos al iniciar. El codigo Python no contiene DDL ni SQL transaccional complejo; solamente llama procedimientos y funciones versionadas:

- `sp_rate_content`
- `sp_save_watch_progress`
- `fn_get_rating_summary`
- `fn_get_recent_history`
- `fn_resume_content`
- `fn_recommendation_percentage`

Si se requiere cambiar reglas de calificacion, porcentaje de recomendacion, historial o reanudacion, modificar primero el archivo SQL de migracion y luego reiniciar el servicio.
