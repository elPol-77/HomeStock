import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { addDays, formatDate, isValidISODate, todayISO } from '@/domain/dates';
import { ExpiryKind } from '@/domain/expiry';
import { STORE_CHAINS } from '@/services/catalog/stores';

import { Chip, Segmented, Text, TextField } from './ui';

function toDisplay(iso: string | null): string {
  return iso ? formatDate(iso) : '';
}

function parseDisplay(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

/** Campo de fecha sin dependencias nativas: atajos rápidos + escritura DD/MM/AAAA. */
export function DateField({
  label,
  value,
  onChange,
  quick = [3, 7, 14, 30, 180],
  allowClear = true,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  quick?: number[];
  allowClear?: boolean;
}) {
  const [text, setText] = useState(toDisplay(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);
  const today = todayISO();
  const label2 = (d: number) => (d < 7 ? `+${d} días` : d === 7 ? '+1 semana' : d === 14 ? '+2 semanas' : d === 30 ? '+1 mes' : d === 180 ? '+6 meses' : `+${d} días`);
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={label}
        placeholder="DD/MM/AAAA"
        keyboardType="numbers-and-punctuation"
        value={text}
        icon="calendar-outline"
        error={error}
        onChangeText={(t) => {
          setText(t);
          setError(null);
          const iso = parseDisplay(t);
          if (iso) onChange(iso);
          else if (!t) onChange(null);
        }}
        onBlur={() => {
          if (text && !parseDisplay(text)) setError('Fecha no válida (usa DD/MM/AAAA)');
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {quick.map((d) => {
          const iso = addDays(today, d);
          return <Chip key={d} label={label2(d)} selected={value === iso} onPress={() => onChange(iso)} />;
        })}
        {allowClear && value ? <Chip label="Sin fecha" icon="close" onPress={() => onChange(null)} /> : null}
      </ScrollView>
    </View>
  );
}

export function ExpiryKindPicker({ value, onChange }: { value: ExpiryKind | null; onChange: (k: ExpiryKind) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Segmented
        options={[
          { value: 'use_by', label: 'Caducidad' },
          { value: 'best_before', label: 'Consumo preferente' },
        ]}
        value={value ?? 'use_by'}
        onChange={(v) => onChange(v as ExpiryKind)}
      />
      <Text variant="caption" color="textFaint">
        {value === 'best_before'
          ? 'Pasada la fecha puede perder calidad, pero no significa que sea inseguro.'
          : 'Pasada la fecha de caducidad no debe consumirse.'}
      </Text>
    </View>
  );
}

export function StorePicker({ value, onChange, label = 'Supermercado' }: { value: string | null; onChange: (s: string | null) => void; label?: string }) {
  const known = STORE_CHAINS.some((s) => s.id === value);
  const [other, setOther] = useState(!known && value ? value : '');
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {STORE_CHAINS.slice(0, 9).map((s) => (
          <Chip key={s.id} label={s.name} selected={value === s.id} onPress={() => onChange(value === s.id ? null : s.id)} />
        ))}
      </ScrollView>
      <TextField
        placeholder="Otra tienda"
        value={other}
        onChangeText={(t) => {
          setOther(t);
          onChange(t.trim() ? t.trim().toLowerCase() : null);
        }}
      />
    </View>
  );
}
