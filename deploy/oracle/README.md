# GymTracker en Oracle Cloud (gratis)

El mismo proceso de Node que corre en tu PC, en una máquina de Oracle que no se
apaga. Los datos siguen siendo libros de Excel en su disco; nada del código
cambia. Se publica con **Tailscale Funnel**, así que no hay que abrir puertos en
Oracle ni comprar dominio.

Lo que haces tú: crear la cuenta y la máquina (pasos 1–2) y entrar por SSH. Lo
demás es copiar y pegar.

## 1. Cuenta

1. Regístrate en <https://www.oracle.com/cloud/free/>. Pide tarjeta para
   verificar la identidad, pero los recursos **Always Free** no se cobran.
2. Elige una **región de origen** cercana (por ejemplo, Querétaro o Monterrey).
   No se puede cambiar después, y las máquinas gratuitas sólo existen en ella.

## 2. La máquina

En la consola: **Compute → Instances → Create instance**.

| Campo | Valor |
| ----- | ----- |
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere A1 (VM.Standard.A1.Flex)**: 1 OCPU y 6 GB bastan. Si no hay capacidad en la región, **VM.Standard.E2.1.Micro** (AMD) también sirve |
| SSH keys | «Paste public keys»: el contenido de tu `~/.ssh/id_ed25519.pub` (si no tienes: `ssh-keygen -t ed25519`) |
| Boot volume | El de omisión (≈ 47 GB) |

Al crearla, copia su **IP pública** y entra:

```bash
ssh ubuntu@IP_PUBLICA
```

No hace falta abrir ningún puerto: Tailscale sale de la máquina hacia fuera.

## 3. Instalar GymTracker

En la máquina:

```bash
curl -fsSL https://raw.githubusercontent.com/SalvadorRGDev/GymTracker/main/deploy/oracle/instala.sh | bash
```

Instala Node 22, clona el repositorio en `~/gymtracker`, compila, crea `.env`
(con un `SESSION_SECRET` nuevo) y deja dos servicios de usuario:
`gymtracker` (el servidor, que se reinicia solo) y `gymtracker-respaldo.timer`
(un respaldo completo diario a las 04:00 en `~/respaldos-completos`, se quedan
los 30 últimos). Todavía no arranca: faltan los datos.

## 4. Tailscale

En la máquina:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname gymtracker     # abre el enlace que imprime y entra con tu cuenta
sudo tailscale funnel --bg 3000
tailscale funnel status                      # te dice la dirección https://gymtracker.<tu-red>.ts.net
```

Pon esa dirección en `~/gymtracker/.env`, en `URL_PUBLICA=` (es la que va en el
`credencial.json` de los atajos).

> El nombre `gymtracker` ya no puede estar en uso en tu red de Tailscale. Si tu
> PC se llamaba así y quieres que la dirección pública **no cambie** (para que
> los atajos y los marcadores sigan valiendo), primero quita el PC en
> <https://login.tailscale.com/admin/machines> o cámbiale el nombre, y usa el
> nombre que tenía en `--hostname`.

## 5. Traer los datos de tu PC

En **tu PC**, desde el proyecto:

```bash
systemctl --user stop gymtracker 2>/dev/null; pkill -f 'dist/server/arranque.js'   # para el servidor de tu PC
bash deploy/respaldo.sh /tmp/migracion        # imprime la ruta del .tar.gz
scp /tmp/migracion/gymtracker-*.tar.gz ubuntu@IP_PUBLICA:~/
grep '^SESSION_SECRET=' .env                  # cópialo: va igual en la máquina
```

En **la máquina**:

```bash
cd ~/gymtracker
tar -xzf ~/gymtracker-*.tar.gz -C datos
nano .env       # SESSION_SECRET = el de tu PC; URL_PUBLICA = la del paso 4
npm run verifica -- datos                     # debe contar tus cuentas y sesiones
systemctl --user start gymtracker
curl -s http://127.0.0.1:3000/api/salud      # {"estado":"ok"}
```

Con el **mismo `SESSION_SECRET`** siguen valiendo las sesiones abiertas y las
credenciales de captura del iPhone. Si la dirección pública cambió, emite un
`credencial.json` nuevo desde **Dispositivos** y reemplázalo en
`iCloud Drive › Atajos › GymTracker`.

Abre la dirección de Funnel en el navegador y entra: ya no depende de tu PC.

## 6. Apagar lo de tu PC

Cuando todo funcione en la máquina, en tu PC: `tailscale funnel reset` (si lo
publicabas desde ahí) y no vuelvas a arrancar `npm start`. **Dos servidores
escribiendo libros distintos no se reconcilian**: el de verdad es el de la
máquina. Guarda la carpeta `datos/` de tu PC como copia hasta estar seguro.

## Día a día

| Qué | Cómo (en la máquina) |
| --- | -------------------- |
| Actualizar a la última versión de `main` | volver a ejecutar el `curl … instala.sh \| bash` del paso 3 |
| Ver si está vivo | `systemctl --user status gymtracker` |
| Ver sus mensajes | `journalctl --user -u gymtracker -n 50` |
| Reiniciarlo | `systemctl --user restart gymtracker` |
| Respaldo ahora mismo | `systemctl --user start gymtracker-respaldo` |
| Traer los respaldos a tu PC | `scp 'ubuntu@IP_PUBLICA:respaldos-completos/*' ~/respaldos-gymtracker/` |

**Los respaldos de la máquina viven en la misma máquina**: protegen de un error,
no de perderla. Bájalos a tu PC de vez en cuando (última fila), o cífralos con
`BACKUP_RECIPIENT` en `.env` (ver `deploy/README.md`) y súbelos a donde quieras.

## Si algo falla

| Síntoma | Causa probable |
| ------- | -------------- |
| `Out of capacity` al crear la A1 | No hay Ampere libre en tu región: reintenta más tarde o usa la E2.1.Micro |
| Entras y en seguida te saca (401) | Abres por `http://IP:3000`: la cookie es `Secure`, entra por la dirección https de Funnel |
| El servicio no arranca | `journalctl --user -u gymtracker -n 50`: casi siempre falta `SESSION_SECRET` o `datos/cuentas.xlsx` |
| Oracle avisa de «instancia inactiva» | Oracle puede reclamar máquinas gratuitas casi sin uso; con uso diario no pasa. Pasar la cuenta a «Pay As You Go» lo evita y sigue sin cobrar lo gratuito |
