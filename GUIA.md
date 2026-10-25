# Mi tracker: puesta en marcha

App web (se instala en el celu como una app) con agenda de Google Calendar, hábitos, comidas para la nutri, plata y tiempo en pantalla.

**Privacidad:** la app habla directo con tu Google desde tu navegador. Los permisos los das vos, en tu cuenta personal; Claude no tiene acceso a nada. Tus datos (hábitos, gastos, comidas) se guardan en el celu y en una carpeta oculta de tu propio Google Drive (`appDataFolder`), que solo esta app puede leer. Así ves lo mismo en el celu y en la compu.

## Probarla ya (modo demo)

Sin configurar nada, la app anda en modo demo: la agenda es tu rutina v17 y todo queda en ese navegador. En la compu: server `mi-tracker` (http://localhost:5200).

## 1. Crear tu "llave" de Google (una sola vez, ~10 min)

Con tu cuenta **personal** de Gmail:

1. Entrá a https://console.cloud.google.com → arriba, **Crear proyecto** → nombre "Mi tracker".
2. Menú → **APIs y servicios → Biblioteca**: buscá y habilitá **Google Calendar API** y **Google Drive API**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform"):
   - Tipo de usuario: **Externo**. Nombre de la app: Mi tracker. Tu mail como soporte y contacto.
   - En **Público / Usuarios de prueba**, agregá tu mail personal. La app queda "en prueba" y solo vos podés entrar: está bien así, no hace falta publicarla ni que Google la verifique.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: `http://localhost:5200` y la dirección donde la publiquemos (por ejemplo `https://<usuario>.github.io`).
   - No hace falta "URI de redireccionamiento".
5. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) y pegalo en `sitio/config.js`:
   ```js
   CLIENT_ID: '1234-abc.apps.googleusercontent.com'
   ```

Al entrar la primera vez, Google te va a avisar que "la app no está verificada": tocá **Continuar**. Es tu propia app. Tildá los permisos de Calendar y Drive.

## 2. Publicarla

Tiene que estar en una dirección https para instalarla en el celu. La más simple es GitHub Pages: se sube la carpeta `sitio/` a un repo y queda en `https://<usuario>.github.io/<repo>/`. El ID de cliente no es secreto (solo funciona desde los orígenes que autorizaste), así que puede ir en un repo público.

Cada vez que se cambie la app: subir el número `?v=` en `index.html` y `VERSION` en `sw.js`.

## 3. Instalarla en el celu

- **iPhone (Safari):** abrí la dirección → botón Compartir → **Agregar a inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar app**.

## 4. Cargar la rutina en tu calendario

1. En calendar.google.com (compu): **Otros calendarios → + → Crear calendario** → "Rutina". Conviene separado para poder ocultarlo.
2. En la app: ⚙ → **Cargar la rutina en el calendario** → elegí `rutina-semanal-v17.ics` y el calendario "Rutina".
   Si después llega una v18, subila igual: actualiza los mismos eventos en vez de duplicarlos (siempre que mantenga los UID).
3. ⚙ → **Elegir calendarios**: tildá Rutina + tu calendario personal. La estrella marca dónde se crean las reuniones rápidas.

Las comidas de cada día salen de los eventos que empiezan con Desayuno / Almuerzo / Merienda / Cena (el texto "HOY:" es el plan, "VARIANTES:" son las opciones para marcar "Cambié"). Si un día no hay eventos de comida, usa la rutina base de `rutina.js`.

## Cómo se usa

- **Hoy:** lo que sigue en la agenda, hábitos para tildar, comidas (✓ la hice · ↺ cambié · ✗ no) y lo gastado.
- **Agenda:** semana por días. Tocá un evento para moverlo (±15 min, +1 h, mañana, o fecha/hora). En eventos que se repiten podés mover "solo este día" o "todas las semanas" (solo la hora).
- **Hábitos:** grilla semanal. Un toque ✓, dos ✗, tres lo borra. Racha 🔥. Abajo, tiempo en pantalla.
- **Comidas:** marcar cada comida, contar intercambios (metas del primer cuadro del plan), resumen **Para la nutri** (compartir por WhatsApp o imprimir a PDF) y medidas.
- **Plata:** + para cargar gasto / ingreso / inversión en pesos o dólares, por categoría. Resumen del mes y gastos por categoría. El dólar para convertir se carga en ⚙.

## Límites conocidos

- **Tiempo en pantalla:** ni iPhone ni Android dejan que una web lo lea. Se carga a mano desde Ajustes → Tiempo en pantalla / Bienestar digital (30 s por día). Medirlo solo requeriría una app nativa de Android.
- **Sesión de Google:** dura 1 hora. Después aparece "Reconectar" (un toque). Mientras tanto la app sigue andando y guarda en el celu; sincroniza al reconectar.
- **Sin señal:** abre igual y muestra la última agenda guardada.
