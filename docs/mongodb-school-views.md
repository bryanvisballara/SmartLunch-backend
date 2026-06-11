# MongoDB school databases

MongoDB Compass solo navega con esta jerarquia:

```text
cluster -> database -> collection
```

Por eso la separacion visual correcta por colegio es una base de datos por colegio, no una carpeta intermedia dentro de una sola base.

Estado actual del proyecto:

- Base legacy/control: `mercanciasvisbal_db_user`
- Bases por colegio:
	- `comergio_demo`
	- `international_berckley_school`
	- `millennium_school`

Runtime backend:

- El backend ya resuelve modelos por colegio usando contexto de `schoolId` y conexiones `useDb(...)`.
- Los requests autenticados toman `schoolId` desde el JWT.
- Los flujos publicos sin auth directa, como callbacks/webhooks de pagos, hacen busqueda cross-school y luego ejecutan la reconciliacion dentro del contexto del colegio encontrado.

Migracion inicial:

```bash
npm run migrate:school-dbs
```

Ese comando copia los documentos filtrados por `schoolId` desde `mercanciasvisbal_db_user` hacia la base dedicada de cada colegio y vuelve a sincronizar indices en destino.

Notas operativas:

- `admin` y `local` son bases internas de MongoDB y no se deben tocar.
- `mercanciasvisbal_db_user` se conserva como base legacy/control mientras se valida totalmente el corte hacia las bases por colegio.
- Si en el futuro se crea un colegio nuevo, hay que migrar su data a una nueva base con el slug del `schoolId`.