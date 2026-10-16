#!/bin/bash
# Inicijalizacija MongoDB baza za Voyra (users_db, trips_db, integration_db)
# Pokretanje: ./scripts/init-mongo.sh
# Zahteva: mongosh u PATH-u i pokrenut MongoDB na localhost:27017

set -e

MONGO_HOST="${MONGO_HOST:-localhost:27017}"

echo "[INIT-MONGO] Inicijalizacija users_db..."
mongosh "mongodb://${MONGO_HOST}/users_db" --quiet <<'EOJS'
  db.createCollection('users');
  db.users.createIndex({ email: 1 }, { unique: true });
  db.users.createIndex({ korisnickoIme: 1 }, { unique: true });
  db.users.createIndex({ status: 1 });
  db.users.createIndex({ kreirano: -1 });
  print("users_db initialized");
EOJS

echo "[INIT-MONGO] Inicijalizacija trips_db..."
mongosh "mongodb://${MONGO_HOST}/trips_db" --quiet <<'EOJS'
  db.createCollection('trips');
  db.trips.createIndex({ korisnikId: 1 });
  db.trips.createIndex({ korisnikId: 1, status: 1 });
  db.trips.createIndex({ status: 1 });
  db.createCollection('destinations');
  db.destinations.createIndex({ istaknuta: 1, redosled: 1 });
  db.createCollection('attractions');
  db.attractions.createIndex({ grad: 1 });
  db.attractions.createIndex({ grad: 1, kategorija: 1 });
  db.createCollection('search_stats');
  db.search_stats.createIndex({ odrediste: 1 }, { unique: true });
  print("trips_db initialized");
EOJS

echo "[INIT-MONGO] Inicijalizacija integration_db..."
mongosh "mongodb://${MONGO_HOST}/integration_db" --quiet <<'EOJS'
  db.createCollection('api_cache');
  db.api_cache.createIndex({ istice: 1 }, { expireAfterSeconds: 0 });
  db.api_cache.createIndex({ kljuc: 1, provajder: 1 });
  print("integration_db initialized");
EOJS

echo "[INIT-MONGO] All databases initialized"
