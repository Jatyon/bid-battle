#!/bin/sh
set -e

echo "Waiting for MySQL to be ready..."

until mysqladmin ping -h "$DATABASE_HOST" -P "${DATABASE_PORT:-3306}" -u "$DATABASE_USER" --password="$DATABASE_PASSWORD" --skip-ssl >/dev/null 2>&1; do
  echo "  MySQL is not ready yet — retrying in 2s..."
  sleep 2
done

echo "MySQL is ready."

echo "Running database migrations..."
npm run migration:run || (echo "Migration failed, retrying in 5s..." && sleep 5 && npm run migration:run)

echo "Migrations complete. Starting application..."
exec npm run start:dev