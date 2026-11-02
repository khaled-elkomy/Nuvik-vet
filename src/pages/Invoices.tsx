import { useCallback, useEffect, useState } from 'react';
import { Search, ReceiptText } from 'lucide-react';
import Layout from '../components/Layout';
import { posApi } from '../lib/api';
import { useApp } from '../context/AppContext';

export default function Invoices() {
  const { pushToast } = useApp();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const refresh = useCallback(async () => setRows(await posApi.invoices(query)), [query]);
  useEffect(() => { refresh().catch((e) => pushToast((e as Error).message, 'error')); }, [refresh, pushToast]);
  async function open(id: string) { try { setSelected(await posApi.invoice(id)); } catch (e) { pushToast((e as Error).message, 'error'); } }
  return <Layout title="الفواتير">
    <div className="grid xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)] gap-5" dir="rtl">
      <section className="bg-white border border-ink-100 rounded-xl2 overflow-hidden"><div className="p-4 border-b relative"><Search size={16} className="absolute right-7 top-7 text-ink-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث برقم الفاتورة أو العميل" className="w-full border rounded-lg pr-9 pl-3 py-2"/></div><div className="divide-y max-h-[75vh] overflow-auto">{rows.map((row) => <button key={row.id} onClick={() => open(row.id)} className={`block w-full text-right p-4 hover:bg-ink-50 ${selected?.id === row.id ? 'bg-brand-50' : ''}`}><div className="flex justify-between"><strong>{row.invoiceNumber}</strong><span className={row.status === 'paid' ? 'text-brand-700' : 'text-amber-700'}>{row.status === 'paid' ? 'مدفوعة' : 'مستحقة'}</span></div><p className="text-xs text-ink-500 mt-1">{row.customerName || 'عميل نقدي'} · {row.total} {row.currency}</p></button>)}{!rows.length && <p className="p-8 text-center text-ink-400">لا توجد فواتير</p>}</div></section>
      <section className="bg-white border border-ink-100 rounded-xl2 p-5 min-h-64">{!selected ? <div className="grid place-items-center h-full text-ink-400"><div className="text-center"><ReceiptText size={30} className="mx-auto mb-2"/>اختر فاتورة لعرض التفاصيل</div></div> : <><div className="flex justify-between items-start"><div><h2 className="text-xl font-bold">{selected.invoiceNumber}</h2><p className="text-sm text-ink-500 mt-1">{selected.customerName || 'عميل نقدي'} · {selected.finalizedAt ? new Date(selected.finalizedAt).toLocaleString('ar-EG') : ''}</p></div><span className="rounded-full bg-ink-50 px-3 py-1 text-sm">{selected.status === 'paid' ? 'مدفوعة' : 'مفتوحة'}</span></div><div className="mt-5 divide-y">{selected.lines?.map((line: any) => <div key={line.id} className="py-3 flex justify-between gap-3"><span>{line.description} × {line.quantity}</span><strong>{line.lineTotal} {selected.currency}</strong></div>)}</div><div className="border-t pt-4 space-y-2 text-sm"><Metric label="الإجمالي" value={`${selected.total} ${selected.currency}`}/><Metric label="المدفوع" value={`${selected.paidAmount} ${selected.currency}`}/><Metric label="المتبقي" value={`${selected.remainingAmount} ${selected.currency}`}/></div><h3 className="font-bold mt-5">الدفعات</h3><div className="divide-y">{selected.payments?.map((payment: any) => <div key={`${payment.id}-${payment.allocatedAmount}`} className="py-2 flex justify-between text-sm"><span>{methodLabel(payment.method)} · {new Date(payment.capturedAt).toLocaleString('ar-EG')}</span><span>{payment.allocatedAmount} {selected.currency}</span></div>)}{!selected.payments?.length && <p className="text-xs text-ink-400 py-2">لم تُسجل دفعات</p>}</div></>}</section>
    </div>
  </Layout>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span>{label}</span><strong>{value}</strong></div>; }
function methodLabel(method: string) { return ({ cash: 'نقدي', card: 'بطاقة', wallet: 'محفظة', other: 'أخرى' } as Record<string,string>)[method] || method; }
