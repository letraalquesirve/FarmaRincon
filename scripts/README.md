# scripts/

## migrar_pocketbase_a_sqlite.py

Migración única (one-time): descarga los datos en vivo de PocketBase
(medicamentos, pedidos, entregas, usuarios, history, categorias) y genera
un archivo SQLite con el mismo esquema que usa la app en la rama
`sqlite-local` (ver `src/services/SQLiteService.js`).

Pensado para correr en un GitHub Codespace o en cualquier máquina con
Python 3 estándar (no requiere `pip install` de nada).

### Uso

```bash
python3 scripts/migrar_pocketbase_a_sqlite.py
```

Al final pregunta si quieres subir el archivo generado (`farmacia_migrada.db`)
directo al VPS, con el mismo formato de nombre que usa la app
(`UNLOCK-BDSQLite-...`), para que el botón "Cargar desde servidor" del
login lo encuentre y lo descargue como si la app misma lo hubiera subido.

Si prefieres revisarlo antes de subirlo, responde que no y ábrelo con un
visor de SQLite (por ejemplo "DB Browser for SQLite").

### Si alguna colección da error 401/403

Significa que esa colección de PocketBase no permite lectura pública.
Pon tu token de acceso en la variable `PB_AUTH_TOKEN` al inicio del
script.
