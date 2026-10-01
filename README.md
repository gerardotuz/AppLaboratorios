# Soporte CBTis 272

Aplicación web responsiva para registrar, consultar y administrar incidencias de los laboratorios de cómputo. Incluye selección visual de equipos, seguimiento por estados y notificaciones en tiempo real mediante Server-Sent Events.

## Ejecutar localmente

```bash
npm start
```

Abre `http://localhost:3000`. Usuarios de demostración:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@cbtis272.edu.mx` | `Admin272!` |
| Docente | `docente@cbtis272.edu.mx` | `Docente272!` |

> Cambia estas credenciales antes de un despliegue real. La variable `SESSION_SECRET` debe tener un valor secreto.

## Base de datos MongoDB

La aplicación **sí está preparada para almacenar usuarios, tickets e historiales en MongoDB Atlas**. Cuando existe `MONGODB_URI`, crea automáticamente las colecciones `users` y `tickets`, sus índices y los usuarios iniciales. Sin esa variable usa `data/db.json` para desarrollo local.

1. Crea una cuenta y un clúster gratuito en [MongoDB Atlas](https://www.mongodb.com/atlas/database).
2. En **Database Access**, crea un usuario con permiso de lectura y escritura.
3. En **Network Access**, permite las conexiones desde Render (`0.0.0.0/0`). Usa una contraseña robusta, porque esta regla permite conectarse desde cualquier dirección.
4. Pulsa **Connect > Drivers** y copia la cadena similar a:

   ```text
   mongodb+srv://USUARIO:CONTRASEÑA@cluster.mongodb.net/?retryWrites=true&w=majority
   ```

5. No guardes esta cadena en GitHub; se configura como variable secreta en Render.

## Desplegar en Render, paso a paso

1. Sube el repositorio a GitHub.
2. En Render selecciona **New > Blueprint** y conecta el repositorio.
3. Render detectará `render.yaml`. Confirma la creación del servicio `soporte-cbtis-272`.
4. Cuando Render solicite `MONGODB_URI`, pega la cadena de conexión de Atlas.
5. Verifica que `MONGODB_DB` tenga el valor `cbtis272_soporte`. `SESSION_SECRET` se genera automáticamente.
6. Pulsa **Apply** y espera a que el health check `/api/health` aparezca como disponible.
7. Abre la URL de Render e inicia sesión con una de las cuentas de demostración.

Si decides no usar MongoDB en Render, necesitarás contratar y montar un disco persistente para `data/db.json`; el sistema de archivos del servicio web puede reiniciarse y perder los cambios. MongoDB Atlas es la opción recomendada.

### Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `MONGODB_URI` | Sí en producción | Cadena privada de conexión a MongoDB Atlas. |
| `MONGODB_DB` | No | Nombre de la base; por defecto `cbtis272_soporte`. |
| `SESSION_SECRET` | Sí | Secreto largo para firmar sesiones; Render lo genera. |
| `PORT` | Automática | Puerto proporcionado por Render. |

## Funciones

- Acceso por rol para docentes y administradores.
- Alta de reportes de falla, daño, software, instalación y anomalías.
- Mapa interactivo para 32 equipos en Laboratorio 1 y 37 en Laboratorio 2.
- Panel con métricas, filtros, búsqueda, detalle y cambio de estado.
- Historial completo de cada ticket.
- Alertas en tiempo real para todas las sesiones conectadas.
- Diseño mobile-first, accesible y sin dependencias externas.
