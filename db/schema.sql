-- ════════════════════════════════════════════════
-- RESET COMPLET
-- ════════════════════════════════════════════════
DROP TABLE IF EXISTS file_attente CASCADE;
DROP TABLE IF EXISTS attributions CASCADE;
DROP TABLE IF EXISTS criteres_attribution CASCADE;
DROP TABLE IF EXISTS navires CASCADE;
DROP TABLE IF EXISTS quais CASCADE;

-- ════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════

CREATE TABLE quais (
  id SERIAL PRIMARY KEY,
  numero VARCHAR(10),
  longueur FLOAT,
  tirant_eau_max FLOAT,
  etat VARCHAR(20) DEFAULT 'DISPONIBLE',
  equipements TEXT[],
  est_dispo BOOLEAN DEFAULT TRUE
);

CREATE TABLE navires (
  id VARCHAR(20) PRIMARY KEY,
  nom VARCHAR(100),
  type VARCHAR(30),
  longueur FLOAT,
  tirant_eau FLOAT,
  type_cargaison VARCHAR(50),
  capacite FLOAT,

  latitude FLOAT,
  longitude FLOAT,

  vitesse FLOAT,
  cap FLOAT,

  etat_navigation VARCHAR(20) DEFAULT 'EN_APPROCHE',
  distance_max FLOAT DEFAULT 300
);

CREATE TABLE criteres_attribution (
  id SERIAL PRIMARY KEY,
  type_navire VARCHAR(30),
  priorite INT,
  longueur_min FLOAT,
  tirant_eau_min FLOAT,
  types_cargaison TEXT[],
  equipements_requis TEXT[]
);

CREATE TABLE attributions (
  id SERIAL PRIMARY KEY,
  navire_id VARCHAR(20),
  quai_id INT,
  date_heure TIMESTAMP DEFAULT NOW(),
  duree_simulation INT,
  statut VARCHAR(20),
  score FLOAT,
  temps_traitement INT
);

CREATE TABLE file_attente (
  id SERIAL PRIMARY KEY,
  navire_id VARCHAR(20),
  heure_entree TIMESTAMP DEFAULT NOW(),
  priorite INT,
  raison_priorite VARCHAR(100),
  statut VARCHAR(20) DEFAULT 'EN_ATTENTE'
);

-- ════════════════════════════════════════════════
-- QUAI
-- ════════════════════════════════════════════════

INSERT INTO quais (numero, longueur, tirant_eau_max, etat, equipements, est_dispo) VALUES
('Q1', 300, 16, 'DISPONIBLE', ARRAY['conteneurs','hydrocarbures'], TRUE),
('Q2', 250, 14, 'DISPONIBLE', ARRAY['conteneurs','cereales'], TRUE),
('Q3', 200, 12, 'DISPONIBLE', ARRAY['passagers','cereales'], TRUE),
('Q4', 180, 10, 'DISPONIBLE', ARRAY['passagers'], TRUE),
('Q5', 320, 17, 'DISPONIBLE', ARRAY['hydrocarbures'], TRUE);

-- ════════════════════════════════════════════════
-- CRITÈRES
-- ════════════════════════════════════════════════

INSERT INTO criteres_attribution (type_navire, priorite, longueur_min, tirant_eau_min, types_cargaison, equipements_requis) VALUES
('Ferry', 1, 150, 7, ARRAY['passagers'], ARRAY['passagers']),
('Pétrolier', 1, 250, 14, ARRAY['hydrocarbures'], ARRAY['hydrocarbures']),
('PorteConteneurs', 2, 200, 12, ARRAY['conteneurs'], ARRAY['conteneurs']),
('Vraquier', 3, 170, 10, ARRAY['cereales'], ARRAY['cereales']);

-- ════════════════════════════════════════════════
-- NAVIRES (IMPORTANT : DISTANCES RÉALISTES)
-- Port approx: 36.7667 / 3.0500
-- Tous placés à 200–400 km du port
-- ════════════════════════════════════════════════

-- ═══════════════════════════════════════
-- NAVIRES (150 à 200 km du port)
-- ═══════════════════════════════════════

-- ═══════════════════════════════════════
-- NAVIRES ESPACÉS (150 → 200 km)
-- Port: 36.7667 / 3.0500
-- ═══════════════════════════════════════

INSERT INTO navires (
  id, nom, type, longueur, tirant_eau, type_cargaison,
  capacite, latitude, longitude, vitesse, cap,
  etat_navigation, distance_max
) VALUES

-- 🟢 ~150 km (le plus proche)
('IMO2001', 'Skikda Pearl', 'Pétrolier', 280, 15, 'hydrocarbures', 80000,
  35.95, 3.10, 16, 180, 'EN_APPROCHE', 170),

-- 🟡 ~160 km
('IMO2002', 'Annaba Star', 'Ferry', 160, 8, 'passagers', 1200,
  35.80, 3.40, 18, 180, 'EN_APPROCHE', 180),

-- 🟠 ~175 km
('IMO2003', 'Mostaganem', 'PorteConteneurs', 220, 13, 'conteneurs', 50000,
  35.60, 2.80, 14, 180, 'EN_APPROCHE', 190),

-- 🔴 ~190 km
('IMO2004', 'Oran Cargo', 'Vraquier', 200, 11, 'cereales', 30000,
  35.40, 3.60, 13, 180, 'EN_APPROCHE', 200);

SELECT * FROM navires;



 CREATE TABLE IF NOT EXISTS signaux_ais (
  navire_id   VARCHAR(20) PRIMARY KEY,
  latitude    FLOAT NOT NULL,
  longitude   FLOAT NOT NULL,
  vitesse     FLOAT,
  cap         FLOAT,
  recu_a      TIMESTAMP DEFAULT NOW()
);
ALTER TABLE signaux_ais ADD COLUMN IF NOT EXISTS est_estime BOOLEAN DEFAULT FALSE;
TRUNCATE TABLE signaux_ais;
CREATE INDEX IF NOT EXISTS idx_signaux_ais_recu ON signaux_ais (recu_a DESC);