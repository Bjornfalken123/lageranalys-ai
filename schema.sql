DROP TABLE IF EXISTS sold_vehicles;

CREATE TABLE sold_vehicles (
  id TEXT PRIMARY KEY,
  reg_number TEXT,
  raw_make_model TEXT,
  brand TEXT,
  model TEXT,
  model_year INTEGER,
  mileage INTEGER,
  sold_date TEXT,
  sold_month INTEGER,
  sale_price INTEGER,
  purchase_price INTEGER,
  product_cost INTEGER,
  gross_margin INTEGER,
  days_in_stock INTEGER,
  prep_days INTEGER,
  purchase_type TEXT,
  source TEXT,
  price_bucket TEXT,
  mileage_bucket TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sold_month ON sold_vehicles(sold_month);
CREATE INDEX idx_sold_price_bucket ON sold_vehicles(price_bucket);
CREATE INDEX idx_sold_mileage_bucket ON sold_vehicles(mileage_bucket);
CREATE INDEX idx_sold_brand ON sold_vehicles(brand);
