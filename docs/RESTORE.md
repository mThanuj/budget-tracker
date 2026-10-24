# Restoring a backup

Every night `.github/workflows/backup.yml` saves an encrypted copy of the
production database as a GitHub artifact and keeps 7 of them. This guide is for
**testing** a backup (do it once, then every few months) and for **recovering**
after something went wrong. The commands work on macOS, Linux and Windows.

You need:

- the **`BACKUP_PASSPHRASE`** from your password manager;
- access to the Neon project and the GitHub repository.

A decrypted backup holds every user's data. Keep it on your own computer and
delete it when you're done (step 6).

## 1. Install the tools

You need `openssl` (version 3) and the PostgreSQL 18 client tools (`pg_restore`,
`psql`). They must be version 18 or newer, because the backups are made with
PostgreSQL 18.

| | OpenSSL 3 | PostgreSQL 18 client |
|---|---|---|
| **macOS** | `brew install openssl@3` (the built-in LibreSSL may not support the options used) | `brew install libpq`, then use `$(brew --prefix libpq)/bin/pg_restore` and `.../psql` |
| **Linux** (Debian/Ubuntu) | already installed (`openssl version`) | `sudo apt install -y postgresql-common && sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`, then `sudo apt install -y postgresql-client-18` |
| **Windows** | comes with [Git for Windows](https://git-scm.com/download/win); run the commands in **Git Bash** | the [PostgreSQL 18 installer](https://www.postgresql.org/download/windows/), ticking only **Command Line Tools**; the programs are in `C:\Program Files\PostgreSQL\18\bin` |

The commands below are for a bash-style shell (macOS/Linux Terminal, Git Bash on
Windows). If `pg_restore` or `psql` isn't found, use its full path from the table.

Alternatively, with Docker on any OS, run each `pg_restore` or `psql` command as
`docker run --rm -it -v "$PWD:/work" -w /work postgres:18-alpine <command>`.

## 2. Download a backup

GitHub → the repository → **Actions → Nightly database backup** → the run you
want (the newest green one, unless you need an older copy) → **Artifacts** →
download `clearpaisa-db-<number>`. Unzip it into a new folder outside the
project, for example `clearpaisa-restore`, and open a terminal there:

```sh
cd ~/clearpaisa-restore     # Windows Git Bash: cd ~/Downloads/clearpaisa-restore
```

## 3. Decrypt it

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in clearpaisa.dump.enc -out clearpaisa.dump
```

It asks for the passphrase. Typing it at the prompt keeps it out of your shell
history. "bad decrypt" means the passphrase is wrong.

Check the file is readable (this doesn't need a database):

```sh
pg_restore --list clearpaisa.dump | head -20
```

You should see the app's tables (`"user"`, `transaction`, `wallet`, ...).

## 4. Restore into a throwaway database

In Neon, open the **production** project:

1. **Branches → New branch**, named `restore-test`, from the production branch.
   (Branches are instant copies; nothing you do there touches production.)
2. In that branch, **Databases → New database**, named `restore_test`.
3. **Connect**: pick branch `restore-test`, database `restore_test`, pooling
   **off**, and copy the connection string.

Put the connection string in a variable without it landing in your shell history.
Paste it at the prompt and press Enter (nothing is shown):

```sh
read -rs RESTORE_URL
```

Then restore:

```sh
pg_restore --no-owner --no-privileges --exit-on-error -d "$RESTORE_URL" clearpaisa.dump
```

No output means it worked.

## 5. Check the restored data

```sh
psql "$RESTORE_URL" -c 'select (select count(*) from "user") as users, (select count(*) from "transaction") as entries, (select count(*) from wallet) as wallets;'
```

Compare with production: **All users** on `/admin`, or the same query in Neon's
**SQL Editor** on the production branch. The numbers should match, apart from
anything added since the backup was taken.

## 6. Clean up

1. Neon: delete the `restore-test` branch.
2. Your computer: delete the folder (it holds every user's data), and the variable:

```sh
unset RESTORE_URL
cd ~ && rm -rf ~/clearpaisa-restore     # adjust the path if you used another folder
```

## Recovering for real

Something went wrong in production (data deleted by mistake, a bad migration):

1. **Within the last few hours?** Neon's own restore is fastest: the project →
   **Restore** (Branches), pick a time just before the problem. The free plan
   covers the last 6 hours. You don't need these backups at all.
2. **Older than that:** restore the newest backup from before the problem:
   1. Do steps 2–5 above, but name the branch and database for keeps (for
      example `recovered`), and restore into it.
   2. In Vercel, change `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the new
      database (from **Connect**: pooling on for the first, off for the second),
      then **Redeploy**.
   3. On GitHub, update the `DATABASE_URL_UNPOOLED` secret, so tonight's backup
      copies the new database.
   4. Anything recorded after the backup was taken is lost (at most about a day).
      If you can, tell users which day to re-check.

### Backups from your own server

On the Hetzner + Coolify setup (`deploy/backup.sh`), the backups are in
`/var/backups/clearpaisa` and aren't encrypted: skip step 3 and restore the
`.dump` file directly.

### If something fails

- **`unsupported version ... in file header`**: your `pg_restore` is older than 18; update it (step 1).
- **`bad decrypt`**: wrong passphrase, or the file didn't download completely.
- **`... already exists`**: the target database isn't empty. Create a fresh one (step 4) rather than restoring over data.
