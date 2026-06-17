## V4 — Vista de Componentes / Desarrollo

La vista de componentes describe la estructura del repositorio de codigo fuente y como se organiza el trabajo del equipo de desarrollo. Muestra las carpetas principales, el lenguaje de cada componente, los Dockerfiles, los contratos proto y las politicas de integracion de codigo.

![Vista de componentes](<../00_assets/diagrams/03_arquitectura/vistacomponentes.png>)

---

### Estructura

| Carpeta | Contenido | Proposito |
| :------ | :-------- | :-------- |
| apps/ | api-gateway (TypeScript), web (React + TypeScript) | Punto de entrada al sistema y frontend |
| services/ | identity, catalog, subscription, fx, engagement, notification | Microservicios de negocio |
| proto/ | identity, catalog, subscription, fx, engagement, notification .proto | Contratos gRPC compartidos entre todos los servicios |
| infra/ | docker-compose.local.yml, docker-compose.cloud.yml | Orquestacion de contenedores por entorno |
| docs/ | requerimientos, casos-uso, arquitectura, diagramas/ | Documentacion tecnica del proyecto |
| .github/ | pull_request_template.md | Plantilla obligatoria para Pull Requests |

---

### Distribucion de lenguajes por componente

| Componente | Lenguaje | Framework / Runtime |
| :--------- | :------- | :------------------ |
| api-gateway | TypeScript | Node.js + Express |
| web | TypeScript | React + Vite + Nginx |
| identity-service | TypeScript | Node.js + gRPC |
| catalog-service | Go | Go + gRPC |
| subscription-service | Python | Python 3 + gRPC asyncio |
| fx-service | Python | Python 3 + gRPC asyncio + httpx |
| engagement-service | Go o Python | Go o Python + gRPC |
| notification-service | Python | Python 3 + gRPC asyncio + aiosmtplib |

---
