-- Per-shop catalog: categories a vendor creates to organize items, and the
-- items themselves (photo, price, optional brand, optional stock count).

CREATE TABLE shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);

CREATE INDEX shop_categories_shop_id_idx ON shop_categories(shop_id);

CREATE TABLE shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Deleting a category ungroups its items rather than deleting them.
  category_id uuid REFERENCES shop_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  -- NULL = vendor isn't tracking stock for this item (always purchasable,
  -- no stock indicator shown). A number is a manually vendor-set count —
  -- nothing here auto-decrements; Babuki never processes the actual
  -- buyer/vendor transaction, so there's no purchase event to hook.
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_items_shop_id_idx ON shop_items(shop_id);
CREATE INDEX shop_items_category_id_idx ON shop_items(category_id);
