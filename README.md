# YourMoney

YourMoney es una app web para llevar control de finanzas personales y saldos compartidos dentro de una misma cuenta, especialmente Binance.

La idea principal es simple: una cuenta puede tener dinero de varias personas, y la app ayuda a saber cuanto corresponde a cada una, registrar entradas y salidas, revisar metricas y mantener respaldo de la data.

## Funcionalidades

- Dashboard general con total acumulado, ingresos, egresos y balance.
- Saldos por persona recalculados desde los movimientos.
- Registro de ingresos, egresos, transferencias y ajustes.
- Historial con filtros por persona, tipo, fecha, categoria, cuenta y texto.
- Gestion de personas y cuentas.
- Metricas diarias, mensuales, anuales y de por vida.
- Grafico comparativo mensual/anual.
- Tabla mensual con ingresos, egresos, ajustes, balance y movimientos.
- Importacion desde CSV, Excel y tablas pegadas.
- Importador especial para el Excel original con hojas por persona.
- Exportacion de movimientos, resumen por persona y reportes.
- Backup JSON e importacion de backup.
- Borrado completo de la base local con confirmacion.
- Auditoria basica de actividad reciente.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- PapaParse
- XLSX
- LocalStorage

## Como correr el proyecto

Instala dependencias:

```bash
npm install
```

Levanta el servidor local:

```bash
npm run dev
```

Abre la app en:

```text
http://127.0.0.1:5173
```

En Windows, si PowerShell bloquea `npm.ps1`, usa:

```bash
npm.cmd run dev
```

## Comandos utiles

Compilar:

```bash
npm run build
```

Revisar lint:

```bash
npm run lint
```

Vista previa del build:

```bash
npm run preview
```

## Importar el Excel original

La app soporta un Excel con:

- Una hoja `Resumen`.
- Una hoja por persona, por ejemplo `Luis`, `MeLu`, `Mario`, `Yaya`, `Chicho`, `Juandi`.
- Columnas tipo:

```text
Fecha | Razon | Entra | Sale | Hay
```

Tambien soporta hojas donde el encabezado este partido entre dos filas.

Reglas de importacion:

- `Entra` se convierte en ingreso.
- `Sale` se convierte en egreso.
- `Razon` se usa como descripcion.
- `Hay` se usa como referencia de saldo acumulado.
- La hoja `Resumen` se ignora para movimientos.
- El nombre de la hoja se usa como persona.
- Si no existe la cuenta `Binance`, se crea automaticamente.

Antes de confirmar una importacion, la app muestra una vista previa y pide confirmacion para evitar duplicados.

## Datos locales

Esta primera version guarda todo en `LocalStorage` del navegador.

Eso significa:

- No necesitas servidor ni base de datos.
- Los datos viven en el navegador donde usas la app.
- Si importas el mismo Excel varias veces, los movimientos se duplican.
- Puedes borrar todo desde `Importar / Exportar` o `Configuracion`.

Para limpiar la app completamente:

1. Entra en `Importar / Exportar`.
2. Busca `Base local`.
3. Haz clic en `Borrar toda la base local`.
4. Confirma las alertas.

## Backup

Desde `Configuracion` puedes:

- Exportar un backup JSON.
- Importar un backup JSON.
- Restablecer la app.

El backup incluye personas, cuentas, movimientos y auditoria.

## Modelo de datos

La app trabaja con tres entidades principales:

```ts
type Person = {
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number;
  color?: string;
  isActive: boolean;
  createdAt: string;
};
```

```ts
type Transaction = {
  id: string;
  personId: string;
  toPersonId?: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  amount: number;
  date: string;
  description: string;
  category?: string;
  account?: string;
  toAccount?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};
```

```ts
type Account = {
  id: string;
  name: string;
  type: "binance" | "bank" | "cash" | "other";
  currency: "USD" | "VES" | "COP" | "EUR";
  createdAt: string;
};
```

## Calculo de saldos

El saldo de cada persona se recalcula desde su saldo inicial y sus movimientos:

```text
saldo actual = saldo inicial + ingresos - egresos + ajustes + transferencias
```

El saldo no depende de un valor editado manualmente, para que pueda reconstruirse desde el historial.

## Git

Flujo recomendado:

```bash
git status
git add .
git commit -m "Describe el cambio"
git push
```

## Nota

YourMoney no busca ser una app de contabilidad empresarial. Esta pensada para uso practico: registrar movimientos rapido, separar dinero por persona y tener claridad sobre saldos compartidos.
