-- Drop restrictive single-owner wallets policy
DROP POLICY IF EXISTS "Users can manage their wallets" ON wallets;

-- Create Member-inclusive general scope policy
CREATE POLICY "Members can manage wallets" ON wallets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = wallets.trip_id 
        AND t.members @> (('[{"userId":"'::text || (auth.uid())::text) || '"}]'::text)::jsonb
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = wallets.trip_id 
        AND t.members @> (('[{"userId":"'::text || (auth.uid())::text) || '"}]'::text)::jsonb
    )
  );

-- Reload schema caches
NOTIFY pgrst, 'reload schema';
