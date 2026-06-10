# Mockups — Quetxal TV

Representaciones visuales de las pantallas principales de la plataforma. El diseño sigue una identidad oscura inspirada en plataformas de streaming, con fondo negro espacial, tarjetas , acento primario rojo y acento de éxito verde.

---

## 1. Inicio de Sesión

**Ruta:** `/login`

Pantalla de acceso para usuarios existentes. Solicita correo electrónico y contraseña con validación mínima de 8 caracteres. Incluye enlace de navegación hacia el registro.

![Login](img/01_login.png)

---

## 2. Registro de Cuenta

**Ruta:** `/register`

Formulario de creación de cuenta nueva. Solicita nombre completo, correo electrónico y contraseña. Incluye enlace de navegación hacia el inicio de sesión.

![Registro](img/02_registro.png)

---

## 3. Selección de Perfiles

**Ruta:** `/profiles`

Pantalla de selección de perfil activo dentro de la cuenta. Muestra los perfiles existentes con avatares de color diferenciado y permite agregar un perfil nuevo (máximo 5). Incluye acceso a administración de perfiles.

![Perfiles](img/03_perfiles.png)

---

## 4. Catálogo

**Ruta:** `/catalog`

Vista principal de navegación de contenido. Incluye barra de navegación con búsqueda por texto, chips de filtro por género, y grillas de contenido organizadas por secciones (Tendencias, Series populares). Cada tarjeta muestra el porcentaje de recomendación calculado dinámicamente por la comunidad.

![Catálogo](img/04_catalogo.png)

---

## 5. Detalle de Contenido

**Ruta:** `/catalog/:id`

Vista completa de una película o serie. Muestra el hero con título, géneros, año, número de temporadas y episodios, porcentaje de recomendación y sinopsis. Incluye botones de reproducción, lista y calificación. Debajo presenta el reparto principal y el sistema de calificación comunitaria con pulgar arriba/abajo.

![Detalle](img/05_detalle.png)

---

## 6. Planes y Suscripción

**Ruta:** `/subscriptions`

Página de selección de plan con comparativa de tres niveles: Básico ($5 USD), Estándar ($8 USD, destacado) y Premium ($12 USD). Los precios se convierten automáticamente a la moneda local mediante el FX Service. El selector de moneda permite cambiar entre GTQ, USD, MXN y EUR. Al seleccionar un plan se abre un modal de pago con tarjeta de crédito.

![Suscripción](img/06_suscripcion.png)

---

## 7. Historial de Reproducción

**Ruta:** `/history`

Lista de contenido en progreso del perfil activo. Cada ítem muestra el título, la temporada, episodio y minuto exacto donde se detuvo el usuario, junto con una barra de progreso visual. El botón "Reanudar" inicia la reproducción desde el punto guardado.

![Historial](img/07_historial.png)

---

---
