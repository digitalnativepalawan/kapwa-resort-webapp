
-- Allow anon to update/insert/delete for admin operations (passkey validated client-side)
-- Settings: allow update
CREATE POLICY "Public update settings" ON public.settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Units: allow insert, update, delete
CREATE POLICY "Public insert units" ON public.units FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update units" ON public.units FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete units" ON public.units FOR DELETE TO anon, authenticated USING (true);

-- Tables: allow insert, update, delete
CREATE POLICY "Public insert tables" ON public.resort_tables FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update tables" ON public.resort_tables FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tables" ON public.resort_tables FOR DELETE TO anon, authenticated USING (true);

-- Menu items: allow insert, update, delete
CREATE POLICY "Public insert menu" ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update menu" ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete menu" ON public.menu_items FOR DELETE TO anon, authenticated USING (true);

-- Orders: allow update, delete for admin
CREATE POLICY "Public update orders" ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete orders" ON public.orders FOR DELETE TO anon, authenticated USING (true);
