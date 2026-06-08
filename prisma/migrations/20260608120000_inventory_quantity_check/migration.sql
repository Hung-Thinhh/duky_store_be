-- Prevent negative inventory at database level
ALTER TABLE "inventories"
ADD CONSTRAINT "check_quantity_non_negative" CHECK ("quantity" >= 0);
