import { supabase } from "@/lib/supabase";

export async function getActionableInsights(shopId: string) {
  const { data, error } = await supabase
    .from("insights")
    .select("type,title,description,severity,suggested_action")
    .eq("shop_id", shopId)
    .in("severity", ["high", "medium", "low"])
    .order("severity", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
