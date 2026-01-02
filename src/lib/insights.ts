import { supabase } from './supabase';

// Types for insights
export type Insight = {
  id: string;
  shop_id: string;
  type: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggested_action: string;
  data_snapshot: any;
  created_at: string;
};

// Fetch insights for a shop
export async function getInsights(shop_id: string): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('shop_id', shop_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// TODO: Add insight generation logic
