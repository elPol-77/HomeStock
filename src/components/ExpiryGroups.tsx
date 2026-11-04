import { View } from 'react-native';

import { DateField } from './Pickers';
import { Button, Card, IconButton, Row, Stepper, Text } from './ui';

import { ExpiryGroup, totalUnits } from '@/domain/expiryGroups';

export { mergeExpiryGroups, totalUnits } from '@/domain/expiryGroups';
export type { ExpiryGroup } from '@/domain/expiryGroups';

/**
 * Unidades + fecha de caducidad. Si tienes varias y no caducan el mismo día
 * («2 yogures del día 10 y 1 del 15»), se separan en grupos con su propia fecha.
 */
export function ExpiryGroupsEditor({
  groups,
  onChange,
  minTotal = 0,
  dateLabel = 'Fecha de caducidad o consumo preferente',
  onScan,
}: {
  groups: ExpiryGroup[];
  onChange: (g: ExpiryGroup[]) => void;
  minTotal?: number;
  dateLabel?: string;
  /** Leer la fecha con la cámara para el grupo indicado. */
  onScan?: (index: number) => void;
}) {
  const set = (i: number, patch: Partial<ExpiryGroup>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  if (groups.length <= 1) {
    const g = groups[0] ?? { qty: minTotal, date: null };
    return (
      <View style={{ gap: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">Unidades</Text>
          <Stepper value={g.qty} onChange={(v) => onChange([{ ...g, qty: v }])} min={minTotal} label="unidades" />
        </Row>
        <DateField label={g.qty > 1 ? `${dateLabel} (todas)` : dateLabel} value={g.date} onChange={(d) => onChange([{ ...g, date: d }])} />
        {onScan ? <Button title="Leer la fecha con la cámara" variant="secondary" icon="scan-outline" onPress={() => onScan(0)} /> : null}
        {g.qty > 1 ? (
          <Button
            title="No caducan todas el mismo día"
            variant="ghost"
            size="sm"
            icon="calendar-number-outline"
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
            onPress={() => onChange([{ qty: g.qty - 1, date: g.date }, { qty: 1, date: null }])}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text variant="caption" color="textMuted">
        Separa las unidades según su fecha. Total: {totalUnits(groups)} {totalUnits(groups) === 1 ? 'unidad' : 'unidades'}.
      </Text>
      {groups.map((g, i) => (
        <Card key={i} tone="alt" style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">
              {g.qty} {g.qty === 1 ? 'unidad' : 'unidades'}
            </Text>
            <Row gap={6}>
              <Stepper value={g.qty} onChange={(v) => set(i, { qty: v })} min={1} size="sm" label={`unidades del grupo ${i + 1}`} />
              <IconButton
                icon="trash-outline"
                tone="danger"
                label={`Quitar grupo ${i + 1}`}
                onPress={() => {
                  const rest = groups.filter((_, j) => j !== i);
                  onChange(rest.length ? rest : [{ qty: minTotal, date: null }]);
                }}
              />
            </Row>
          </Row>
          <DateField label="Caducan el" value={g.date} onChange={(d) => set(i, { date: d })} quick={[3, 7, 14, 30]} />
          {onScan ? <Button title="Leer con la cámara" variant="ghost" size="sm" icon="scan-outline" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => onScan(i)} /> : null}
        </Card>
      ))}
      <Button title="Añadir otra fecha" variant="secondary" icon="add" onPress={() => onChange([...groups, { qty: 1, date: null }])} />
    </View>
  );
}
