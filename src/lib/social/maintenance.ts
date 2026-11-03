import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { changeSocialConnection } from './connections';
import type { SocialProvider } from './policy';

export async function maintainSocialConnections(client: SupabaseClient) {
  const due = await client.from('social_connections').select('organization_id,provider')
    .eq('status', 'connected').lt('checked_at', new Date(Date.now() - 86400000).toISOString())
    .order('checked_at').limit(20);
  if (due.error) throw Error('Não foi possível consultar autorizações para manutenção.');
  let verified = 0, reconnect = 0;
  // Bound concurrency and never return tokens, profiles or raw provider errors.
  const rows = due.data ?? [];
  for (let index = 0; index < rows.length; index += 4) {
    await Promise.all(rows.slice(index, index + 4).map(async row => {
      try {
        await changeSocialConnection(client, row.organization_id, row.provider as SocialProvider, 'check');
        verified++;
      } catch { reconnect++; }
    }));
  }
  const expired = await client.rpc('expire_social_api_data');
  if (expired.error) throw Error('A limpeza de dados sociais não foi concluída.');
  return { verified, reconnect, cleanup: expired.data };
}
