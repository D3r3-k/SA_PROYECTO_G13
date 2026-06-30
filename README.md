<div align="center">

# Quetxal TV
Proyecto de Software Avanzado - Seccion P

</div>

## Integrantes

<div align="center">

|   Carne   | Nombre Completo                 |
| :-------: | :------------------------------ |
| 201403946 | Victor Abdiel Lux Juracan       |
| 201900364 | Tomas Alexander Morales Saquic  |
| 202001151 | Derek Francisco Orellana Ibanez |
| 202201405 | Johan Moises Cardona Rosales    |

</div>

## Introduccion

Quetxal TV es una plataforma de streaming de video bajo demanda desarrollada con una arquitectura de microservicios. El sistema integra autenticacion, perfiles, catalogo multimedia, suscripciones, pagos, conversion de divisas, calificaciones, historial de reproduccion y notificaciones por correo.

La solucion utiliza un API Gateway como punto unico de entrada, comunicacion interna mediante gRPC y Protocol Buffers, bases de datos independientes por dominio, Redis para cache y cola de notificaciones, contenedores Docker y despliegue orientado a Google Cloud Platform.

## Indice

- [1. Requerimientos del Sistema](docs/requerimientos.md)
  - [1.1 Requerimientos Funcionales](docs/01_requerimientos/RF.md)
  - [1.2 Requerimientos No Funcionales](docs/01_requerimientos/RNF.md)

- [2. Casos de Uso](docs/02_casos_de_uso/)
  - [2.1 Casos de Uso de Alto Nivel](docs/02_casos_de_uso/CU_alto_nivel.md)

- [3. Arquitectura](docs/arquitectura.md)
  - [3.1 Vista de Escenarios](docs/03_arquitectura/V1_escenarios.md)
  - [3.2 Vista Lógica](docs/03_arquitectura/V2_logica.md)
  - [3.3 Vista de Procesos](docs/03_arquitectura/V3_procesos.md)
  - [3.4 Vista de Componentes](docs/03_arquitectura/V4_componentes.md)
  - [3.5 Vista Física](docs/03_arquitectura/V5_fisica.md)

- [4. Diagramas](docs/04_diagramas/)
  - [4.1 Arquitectura General](docs/04_diagramas/arquitectura-general.md)
  - [4.2 Componentes](docs/04_diagramas/diagrama_componentes.md)
  - [4.3 Despliegue](docs/04_diagramas/diagrama_despliegue.md)
  - [4.4 Actividades](docs/04_diagramas/diagrama_actividades.md)
  - [4.5 Secuencia](docs/04_diagramas/diagrama_secuencia.md)
  - [4.6 Ciclo CI/CD](docs/04_diagramas/diagrama_cicd.md)
  - [4.7 Entidad Relación](docs/04_diagramas/entidad-relacion.md)

- [5. Principios SOLID](docs/05_principios_solid/)
  - [5.1 S - Responsabilidad Única](docs/05_principios_solid/S_responsabilidad.md)
  - [5.2 O - Abierto/Cerrado](docs/05_principios_solid/O_abierto_cerrado.md)
  - [5.3 L - Sustitución de Liskov](docs/05_principios_solid/L_liskov.md)
  - [5.4 I - Segregación de Interfaces](docs/05_principios_solid/I_segregacion.md)
  - [5.5 D - Inversión de Dependencias](docs/05_principios_solid/D_inversion.md)

- [6. Decisiones de Diseño y Justificaciones](docs/06_justificaciones/justificacion_y_decision.md)

- [7. Pruebas](docs/pruebas.md)

- [8. Infraestructura](docs/07_kubernetes/entorno_kubernetes.md)
  - [8.1 Configuración de Entorno Local y Cloud](docs/configuraciones.md)
  - [8.2 Entorno Kubernetes](docs/07_kubernetes/entorno_kubernetes.md)
  - [8.3 Observabilidad y Monitoreo (Métricas)](docs/08_observabilidad/grafana_prometeus.md)

- [9. Contratos gRPC](proto)

- [10. Microservicios (Backend)](services)
  - [10.1 Identity Service](services/identity-service/README.md)
  - [10.2 Catalog Service](services/catalog-service/README.md)
  - [10.3 Subscription Service](services/subscription-service/README.md)
  - [10.4 FX Service](services/fx-service/README.md)
  - [10.5 Engagement Service](services/engagement-service/README.md)
  - [10.6 Notification Service](services/notification-service/README.md)

- [11. Aplicaciones (Gateway/Frontend)](apps)
  - [11.1 API Gateway](apps/api-gateway/README.md)

- [12. Guías de Flujo y Desarrollo]()
  - [12.1 Flujo de Trabajo (Git Flow)](docs/instrucciones_flow_git.md)
  - [12.2 Integración de Identity](docs/instrucciones_integracion_identity.md)

## Conclusiones

- La arquitectura implementada separa responsabilidades por dominio y reduce el acoplamiento entre componentes mediante microservicios, gRPC y contratos `.proto`.
- El patron de base de datos por microservicio permite aislar usuarios, catalogo, suscripciones y engagement, manteniendo reglas de negocio y objetos programables cerca de cada dominio.
- Redis cumple un rol clave como cache para tasas de cambio y como cola asincrona para notificaciones, evitando bloquear los flujos principales del sistema.
- El API Gateway centraliza el acceso externo, la validacion de sesion y la traduccion de solicitudes HTTP a llamadas internas gRPC.
- La documentacion y los diagramas permiten mantener trazabilidad entre requerimientos, arquitectura, despliegue, flujos y modelo de datos.

