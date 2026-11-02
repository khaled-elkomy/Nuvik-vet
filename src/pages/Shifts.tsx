import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { posApi } from '../lib/api';
import { useApp } from '../context/AppContext';

const money = (value?: string | null, currency?: string) => value == null ? '—' : `${value} ${currency ?? ''}`;
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value)) : '—';
const methodNames: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', wallet: 'محفظة', other: 'أخرى' };

export default function Shifts() {
  const { pushToast } = useApp();
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { setLoading(true); try { setRows(await posApi.shifts(date)); } catch (e) { pushToast((e as Error).message, 'error'); } finally { setLoading(false); } }, [date, pushToast]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Layout title="الورديات">
    <section className="bg-white border border-ink-100 rounded-xl2 overflow-hidden" dir="rtl">
      <div className="p-4 border-b flex flex-wrap items-center gap-3"><label className="text-sm font-medium">تاريخ الفتح<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mr-2 border rounded-lg px-3 py-2" /></label>{date && <button onClick={() => setDate('')} className="text-sm text-brand-700">مسح التاريخ</button>}</div>
      {loading ? <p className="p-6 text-center text-ink-500">جارِ التحميل…</p> : !rows.length ? <p className="p-10 text-center text-ink-400">لا توجد ورديات في هذا التاريخ.</p> : <div className="overflow-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="bg-ink-50 text-ink-600"><tr>{['أمين الصندوق','وقت الفتح','النقدية الافتتاحية','وقت الإغلاق','المتوقع','المعدود','الفرق','الحالة','تفاصيل الدفعات'].map((label) => <th key={label} className="text-right p-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.id}><td className="p-3 font-medium">{row.cashierName}</td><td className="p-3">{dateTime(row.openedAt)}</td><td className="p-3">{money(row.openingCash,row.currency)}</td><td className="p-3">{dateTime(row.closedAt)}</td><td className="p-3">{money(row.expectedCash,row.currency)}</td><td className="p-3">{money(row.countedCash,row.currency)}</td><td className="p-3">{money(row.difference,row.currency)}</td><td className="p-3">{row.status === 'open' ? 'مفتوحة' : 'مغلقة'}</td><td className="p-3"><div className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(row.paymentTotals ?? {}).map(([method,total]) => <span key={method}>{methodNames[method] ?? method}: {total as string} {row.currency}</span>)}{!Object.keys(row.paymentTotals ?? {}).length && <span className="text-ink-400">لا توجد دفعات</span>}</div></td></tr>)}</tbody></table></div>}
    </section>
  </Layout>;
}
