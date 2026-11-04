import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Badge, Button, Card, Divider, IconButton, Row, Screen, SectionTitle, SwitchRow, Text, TextField } from '@/components/ui';
import { useLiveQuery } from '@/db/events';
import { getHousehold, renameHousehold } from '@/data/household';
import { useAuth } from '@/services/auth';
import { getInviteCode, joinHousehold, listMembers, Member, publishHousehold, regenerateInviteCode, removeMember, renameRemoteHousehold, setMemberRole } from '@/services/householdRemote';
import { isCloudConfigured } from '@/services/supabase';
import { toast } from '@/services/toast';

export default function HouseholdSettings() {
  const session = useAuth((a) => a.session);
  const household = useLiveQuery(getHousehold, ['households']);
  const h = household.data;
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const isAdmin = h?.role === 'admin';

  useEffect(() => {
    if (h) setName(h.name);
  }, [h]);

  const loadRemote = useCallback(async () => {
    if (!h?.remote || !session) return;
    try {
      setMembers(await listMembers());
      setCode(await getInviteCode());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'danger');
    }
  }, [h?.remote, session]);

  useEffect(() => {
    loadRemote();
  }, [loadRemote]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
      await loadRemote();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Hogar y familia" back bottomInset="safe">
      <Card style={{ gap: 12 }}>
        <TextField label="Nombre del hogar" value={name} onChangeText={setName} editable={!h?.remote || isAdmin} />
        <Button
          title="Guardar nombre"
          variant="secondary"
          disabled={!h || !name.trim() || name === h.name}
          onPress={() =>
            run(async () => {
              if (h?.remote) await renameRemoteHousehold(name.trim());
              await renameHousehold(h!.id, name.trim());
            }, 'Nombre actualizado')
          }
        />
      </Card>

      {!isCloudConfigured ? (
        <Card tone="alt">
          <Text variant="body" color="textMuted">
            Para compartir el hogar con tu familia hace falta configurar la nube (Supabase). Mientras tanto todo funciona en este móvil.
          </Text>
        </Card>
      ) : !session ? (
        <Card tone="primary" style={{ gap: 10 }}>
          <Text variant="bodyStrong">Comparte la casa con tu familia</Text>
          <Text variant="caption" color="textMuted">
            Inicia sesión para que varias personas veáis y editéis el mismo inventario y las mismas listas.
          </Text>
          <Button title="Iniciar sesión o crear cuenta" onPress={() => router.push('/auth/login')} />
        </Card>
      ) : !h?.remote ? (
        <>
          <SectionTitle title="Compartir este hogar" />
          <Card style={{ gap: 10 }}>
            <Text variant="body">Sube tu hogar a la nube y obtén un código para invitar a tu familia. Tus datos se sincronizarán entre dispositivos.</Text>
            <Button title="Compartir mi hogar" icon="cloud-upload-outline" loading={busy} onPress={() => run(publishHousehold, 'Hogar compartido')} />
          </Card>
          <SectionTitle title="Unirme a otro hogar" />
          <Card style={{ gap: 10 }}>
            <TextField label="Código de invitación" placeholder="AB12CD34" value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} />
            <SwitchRow label="Llevarme mis datos" description="Añade tus productos y listas actuales al hogar al que te unes. Si lo desactivas, se borran de este móvil." value={merge} onChange={setMerge} />
            <Button
              title="Unirme"
              icon="enter-outline"
              disabled={joinCode.length < 6}
              loading={busy}
              onPress={() =>
                Alert.alert('¿Unirte a este hogar?', merge ? 'Tus datos se combinarán con los del hogar.' : 'Tus datos actuales se borrarán de este móvil.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Unirme', onPress: () => run(async () => toast(`Te has unido a «${await joinHousehold(joinCode, merge)}»`)) },
                ])
              }
            />
          </Card>
        </>
      ) : (
        <>
          <SectionTitle title="Invitar" />
          <Card style={{ gap: 10, alignItems: 'center' }}>
            <Text variant="caption" color="textMuted">
              Código de invitación
            </Text>
            <Text variant="display" style={{ letterSpacing: 4 }} selectable>
              {code ?? '········'}
            </Text>
            <Row>
              <Button title="Copiar" size="sm" variant="secondary" icon="copy-outline" disabled={!code} onPress={async () => { await Clipboard.setStringAsync(code!); toast('Código copiado'); }} />
              <Button title="Compartir" size="sm" icon="share-social-outline" disabled={!code} onPress={() => Share.share({ message: `Únete a nuestro hogar en HomeStock con el código ${code}` })} />
            </Row>
            {isAdmin ? <Button title="Generar un código nuevo" size="sm" variant="ghost" onPress={() => run(async () => setCode(await regenerateInviteCode()), 'El código anterior ya no sirve')} /> : null}
          </Card>
          <SectionTitle title={`Miembros (${members.length})`} />
          <Card style={{ gap: 0 }}>
            {members.map((m, i) => (
              <View key={m.user_id}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ paddingVertical: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodyStrong">
                      {m.display_name ?? 'Sin nombre'}
                      {m.user_id === session.user.id ? ' (tú)' : ''}
                    </Text>
                    <Badge label={m.role === 'admin' ? 'Administrador' : 'Miembro'} tone={m.role === 'admin' ? 'primary' : 'neutral'} />
                  </View>
                  {isAdmin && m.user_id !== session.user.id ? (
                    <>
                      <IconButton icon={m.role === 'admin' ? 'arrow-down-circle-outline' : 'shield-checkmark-outline'} label={m.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'} onPress={() => run(() => setMemberRole(m.user_id, m.role === 'admin' ? 'member' : 'admin'), 'Rol actualizado')} />
                      <IconButton icon="person-remove-outline" tone="danger" label={`Expulsar a ${m.display_name ?? 'miembro'}`} onPress={() => Alert.alert('¿Quitar del hogar?', undefined, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', style: 'destructive', onPress: () => run(() => removeMember(m.user_id), 'Miembro eliminado') }])} />
                    </>
                  ) : null}
                </Row>
              </View>
            ))}
          </Card>
          <Text variant="caption" color="textFaint">
            Administradores: cambian el nombre, gestionan miembros y regeneran el código. Todos los miembros pueden editar el inventario y las listas.
          </Text>
        </>
      )}
    </Screen>
  );
}
