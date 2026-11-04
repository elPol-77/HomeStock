// Supabase Edge Function (Deno): avisa a los demás miembros del hogar cuando alguien
// añade algo a la lista de la compra o cuando un producto se agota.
// Se dispara con un Database Webhook (ver README → "Notificaciones push").
// Usa la clave service_role, que SOLO existe en el servidor (variable de entorno de Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2';

type Payload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const WEBHOOK_SECRET = Deno.env.get('HOMESTOCK_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get('x-homestock-secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const payload = (await req.json()) as Payload;
  const rec = payload.record;
  if (!rec || rec.deleted) return new Response('ignored');

  let title = '';
  let body = '';
  let url = '/shop';
  if (payload.table === 'list_items' && payload.type === 'INSERT') {
    title = 'Lista de la compra';
    body = `Se ha añadido «${rec.name}» a la lista.`;
  } else {
    return new Response('ignored');
  }

  const householdId = rec.household_id as string;
  const author = rec.created_by as string | null;
  const { data: members } = await supabase.from('household_members').select('user_id').eq('household_id', householdId);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== author);
  if (recipients.length === 0) return new Response('no recipients');
  const { data: tokens } = await supabase.from('push_tokens').select('token').in('user_id', recipients);
  if (!tokens?.length) return new Response('no tokens');

  const messages = tokens.map((t) => ({ to: t.token, title, body, data: { url }, channelId: 'household', sound: null }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  return new Response(await res.text(), { status: res.status });
});
