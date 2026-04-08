#!/bin/sh
set -e

echo "Waiting for MySQL to be ready..."

until mysqladmin ping -h "$DATABASE_HOST" -P "${DATABASE_PORT:-3306}" -u "$DATABASE_USER" --password="$DATABASE_PASSWORD" --skip-ssl >/dev/null 2>&1; do
  echo "  MySQL is not ready yet — retrying in 2s..."
  sleep 2
done

echo "MySQL is ready."

echo "Running database migrations..."

node -e "
const { DataSource } = require('typeorm');
const path = require('path');

const ds = new DataSource({
  type: 'mysql',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '3306'),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  migrations: [path.join(process.cwd(), 'dist/database/migrations/*.js')],
  logging: ['error', 'warn'],
  connectorPackage: 'mysql2',
  extra: {
    ssl: { rejectUnauthorized: false }
  }
});

ds.initialize()
  .then(() => ds.runMigrations({ transaction: 'all' }))
  .then((migrations) => {
    console.log('Migrations executed:', migrations.length ? migrations.map(m => m.name).join(', ') : 'none (already up to date)');
    return ds.destroy();
  })
  .catch((err) => { 
    console.error('Migration failed:', err.message); 
    process.exit(1); 
  });
"

echo "Migrations complete. Starting application..."
exec node dist/main