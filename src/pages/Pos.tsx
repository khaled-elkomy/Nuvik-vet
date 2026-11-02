import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Minus, Plus, Printer, Search, Trash2, Wallet } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { catalogApi, customersApi, posApi } from '../lib/api';
import { useApp } from '../context/AppContext';

type CartLine = { key: string; variantId: string | null; serviceProductId: string | null; lotId: string | null; productName: string; variantName: string; quantity: string; price: string; onHand: string; trackLots: boolean; lots: any[]; currency: string };
const newKey = () => crypto.randomUUID();

export default function Pos() {
  const { currentUser, pushToast } = useApp();
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartKey, setCartKey] = useState(newKey);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [payments, setPayments] = useState<Array<{ method: string; amount: string }>>([]);
  const [shift, setShift] = useState<any | null>(null);
  const [shiftModal, setShiftModal] = useState<'open' | 'close' | null>(null);
  const [cashValue, setCashValue] = useState('0.00');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<any | null>(null);
  const [warnings, setWarnings] = useState<any[]>([]);
  const canSell = currentUser?.permissions.includes('invoices.finalize') ?? false;
  const canPrice = currentUser?.permissions.includes('catalog.prices.manage') ?? false;

  const refreshShift = useCallback(async () => { try { setShift(await posApi.shift()); } catch (e) { pushToast((e as Error).message, 'error'); } }, [pushToast]);
  useEffect(() => { refreshShift(); scanRef.current?.focus(); }, [refreshShift]);
  useEffect(() => { if (customerQuery.trim()) customersApi.list(customerQuery).then(setCustomers).catch(() => setCustomers([])); else setCustomers([]); }, [customerQuery]);

  const totalCents = useMemo(() => cart.reduce((sum, line) => sum + lineTotal(parseQty(line.quantity), parseMoney(line.price)), 0n), [cart]);
  const paidCents = useMemo(() => payments.reduce((sum, payment) => sum + safeMoney(payment.amount), 0n), [payments]);
  const remaining = totalCents - paidCents;

  function changeCart(update: (old: CartLine[]) => CartLine[]) { setCart((old) => update(old)); setCartKey(newKey()); }
  function focusScan() { requestAnimationFrame(() => scanRef.current?.focus()); }

  async function addVariant(product: any, variant: any, barcodeResult?: any) {
    let lots: any[] = [];
    const trackLots = Boolean(barcodeResult?.trackLots ?? product.trackLots);
    if (trackLots) {
      try { lots = await catalogApi.lots(variant.id); }
      catch (e) { pushToast((e as Error).message, 'error'); return; }
    }
    const lot = barcodeResult?.lotId ? lots.find((l) => l.id === barcodeResult.lotId) : lots.find((l) => parseQty(l.onHand) > 0n) ?? lots[0];
    if (trackLots && !lot) pushToast('لا توجد تشغيلة صالحة لهذا المنتج؛ أضف رصيدًا افتتاحيًا أولًا', 'error');
    const row: CartLine = { key: `${variant.id}:${lot?.id ?? ''}`, variantId: variant.id, serviceProductId: null, lotId: lot?.id ?? null, productName: product.name ?? barcodeResult?.productName, variantName: variant.name ?? barcodeResult?.variantName ?? variant.sku, quantity: '1.000', price: String(variant.price ?? barcodeResult?.price ?? '0.00'), onHand: String(lot?.onHand ?? variant.onHand ?? barcodeResult?.onHand ?? '0'), trackLots, lots, currency: variant.currency ?? barcodeResult?.currency };
    changeCart((old) => {
      const existing = old.find((item) => item.key === row.key);
      if (!existing) return [...old, row];
      return old.map((item) => item.key === row.key ? { ...item, quantity: addQty(item.quantity, '1.000') } : item);
    });
    setSearchResults([]); setScan(''); focusScan();
  }

  function addService(product: any) {
    const row: CartLine = { key: `service:${product.id}`, variantId: null, serviceProductId: product.id, lotId: null, productName: product.name, variantName: 'خدمة', quantity: '1.000', price: String(product.defaultUnitPrice ?? '0.00'), onHand: '0', trackLots: false, lots: [], currency: product.currency };
    changeCart((old) => [...old, row]); setSearchResults([]); setScan(''); focusScan();
  }

  async function lookup() {
    const text = scan.trim(); if (!text) return;
    try {
      const item = await catalogApi.barcode(text);
      await addVariant({ id: item.productId, name: item.productName, trackLots: item.trackLots }, { id: item.variantId, sku: item.sku, name: item.variantName, price: item.price, onHand: item.onHand, currency: item.currency }, item);
    } catch {
      try { const results = await catalogApi.products(text); setSearchResults(results); if (!results.length) pushToast('لم يُعثر على باركود أو اسم مطابق؛ جرّب البحث بالاسم', 'info'); }
      catch (e) { pushToast((e as Error).message, 'error'); }
    }
    focusScan();
  }

  function updateQuantity(index: number, quantity: string) { changeCart((old) => old.map((line, i) => i === index ? { ...line, quantity } : line)); }
  function updatePrice(index: number, price: string) { changeCart((old) => old.map((line, i) => i === index ? { ...line, price } : line)); }
  function updateLot(index: number, lotId: string) { changeCart((old) => old.map((line, i) => { if (i !== index) return line; const lot = line.lots.find((x) => x.id === lotId); return { ...line, key: `${line.variantId}:${lotId}`, lotId, onHand: lot?.onHand ?? '0' }; })); }

  function fullCash() { setPayments([{ method: 'cash', amount: centsText(totalCents) }]); }
  function addPayment() { setPayments((old) => [...old, { method: 'cash', amount: '' }]); }
  function updatePayment(index: number, field: 'method' | 'amount', value: string) { setPayments((old) => old.map((payment, i) => i === index ? { ...payment, [field]: value } : payment)); }

  async function finalize() {
    if (!canSell || cart.length === 0) return;
    setBusy(true);
    try {
      const result = await posApi.finalizeSale({
        customerId: customerId || null,
        lines: cart.map((line) => ({ variantId: line.variantId, serviceProductId: line.serviceProductId, lotId: line.lotId, quantity: line.quantity, ...(canPrice ? { unitPrice: line.price } : {}) })),
        payments: payments.filter((p) => safeMoney(p.amount) > 0n).map((p) => ({ method: p.method, amount: p.amount })),
      }, cartKey);
      setInvoice(result); setWarnings(result.stockWarnings || []); setCart([]); setPayments([]); setCustomerId(''); setCustomerQuery(''); setCartKey(newKey()); await refreshShift();
      pushToast(`تمت عملية البيع برقم ${result.invoiceNumber}`);
    } catch (e) { pushToast((e as Error).message, 'error'); }
    finally { setBusy(false); focusScan(); }
  }

  async function saveShift() {
    setBusy(true);
    try {
      if (shiftModal === 'open') { setShift(await posApi.openShift(cashValue)); pushToast('تم فتح وردية الصندوق'); }
      else if (shift) { const closed = await posApi.closeShift(shift.id, cashValue); setShift(null); pushToast(`تم إغلاق الوردية. المتوقع ${closed.expectedCash}، الفرق ${closed.variance}`); }
      setShiftModal(null); setCashValue('0.00');
    } catch (e) { pushToast((e as Error).message, 'error'); }
    finally { setBusy(false); focusScan(); }
  }

  const invalidQty = cart.some((line) => parseQty(line.quantity) <= 0n || !/^\d+(?:\.\d{1,3})?$/.test(line.quantity));
  const overpaid = paidCents > totalCents;
  const hasCash = payments.some((p) => p.method === 'cash' && safeMoney(p.amount) > 0n);

  return <Layout title="نقطة البيع">
    <div dir="rtl" className="space-y-4 pos-screen">
      <div className="bg-white rounded-xl2 border border-ink-100 p-4 flex items-center justify-between gap-3 no-print">
        <div><p className="font-bold text-ink-800">وردية الصندوق</p><p className="text-sm text-ink-500">{shift ? `مفتوحة منذ ${cairoDateTime(shift.openedAt)} · رصيد البداية ${shift.openingCash} ${shift.currency}` : 'لا توجد وردية مفتوحة'}</p></div>
        {!shift ? <button onClick={() => { setCashValue('0.00'); setShiftModal('open'); }} className="bg-brand-600 text-white px-4 py-2 rounded-lg">فتح وردية</button> : <button onClick={() => { setCashValue(''); setShiftModal('close'); }} className="border border-red-200 text-red-700 px-4 py-2 rounded-lg">إغلاق الوردية</button>}
      </div>

      <section className="bg-white rounded-xl2 border border-ink-100 p-4 no-print">
        <label className="block text-sm font-semibold text-ink-700 mb-2">مسح الباركود أو البحث بالاسم</label>
        <div className="relative"><Barcode size={19} className="absolute right-3 top-3 text-brand-600" /><input ref={scanRef} autoFocus value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} className="w-full pr-10 pl-3 py-3 border-2 border-brand-200 focus:border-brand-500 rounded-xl text-lg" placeholder="وجّه قارئ الباركود إلى هذا الحقل ثم Enter" /></div>
        {!!searchResults.length && <div className="mt-2 border rounded-xl divide-y max-h-64 overflow-auto">{searchResults.map((p) => <div key={p.id} className="p-3 flex items-center justify-between"><div><p className="font-semibold">{p.name}</p><p className="text-xs text-ink-500">{p.code}</p></div>{p.isService ? <button onClick={() => addService(p)} className="text-brand-700 border rounded-lg px-3 py-1.5">إضافة خدمة · {p.defaultUnitPrice}</button> : <div className="flex gap-2 flex-wrap">{(p.variants || []).map((v: any) => <button key={v.id} onClick={() => addVariant(p, v)} className="text-brand-700 border rounded-lg px-3 py-1.5 text-sm">{v.name} · {v.price}</button>)}</div>}</div>)}</div>}
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)] gap-4 no-print">
        <section className="bg-white rounded-xl2 border border-ink-100 overflow-hidden"><div className="p-4 border-b font-bold">السلة ({cart.length})</div><div className="divide-y">
          {cart.map((line, index) => <div className="p-4 grid md:grid-cols-[1fr_auto_auto] gap-3 items-center" key={line.key}>
            <div><p className="font-semibold text-ink-800">{line.productName}</p><p className="text-xs text-ink-500 mt-1">{line.variantName}</p>{line.trackLots && <select value={line.lotId ?? ''} onChange={(e) => updateLot(index, e.target.value)} className="mt-2 border rounded-lg px-2 py-1 text-sm"><option value="">اختر التشغيلة</option>{line.lots.map((lot) => <option value={lot.id} key={lot.id}>{lot.lotNumber} · متاح {lot.onHand}{lot.expiryDate ? ` · ${String(lot.expiryDate).slice(0,10)}` : ''}</option>)}</select>}</div>
            <div className="flex items-center gap-2"><button onClick={() => updateQuantity(index, decrementQty(line.quantity))} className="border rounded-md p-1"><Minus size={15} /></button><input value={line.quantity} onChange={(e) => updateQuantity(index,e.target.value)} inputMode="decimal" className="w-20 text-center border rounded-md py-1" /><button onClick={() => updateQuantity(index, addQty(line.quantity,'1.000'))} className="border rounded-md p-1"><Plus size={15} /></button></div>
            <div className="text-left min-w-28"><input disabled={!canPrice} value={line.price} onChange={(e) => updatePrice(index,e.target.value)} className="w-24 text-left border rounded-md px-2 py-1 disabled:border-transparent"/><p className="font-bold mt-1">{centsText(lineTotal(parseQty(line.quantity),safeMoney(line.price)))} {line.currency}</p>{line.variantId && parseQty(line.quantity) > parseQty(line.onHand) && <p className="text-xs text-amber-700">الرصيد الحالي {line.onHand}</p>}</div>
            <button onClick={() => { changeCart((old) => old.filter((_, i) => i !== index)); focusScan(); }} className="text-red-500" aria-label="إزالة"><Trash2 size={17} /></button>
          </div>)}
          {!cart.length && <p className="p-10 text-center text-ink-400">امسح منتجًا لإضافته إلى البيع</p>}
        </div></section>

        <section className="bg-white rounded-xl2 border border-ink-100 p-4 space-y-4">
          <div><label className="text-sm font-semibold">العميل (اختياري للبيع النقدي)</label><div className="relative mt-1"><Search size={15} className="absolute right-3 top-2.5 text-ink-400" /><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="ابحث عن العميل" className="w-full pr-8 border rounded-lg px-3 py-2" /></div>{customerId && <button onClick={() => { setCustomerId(''); setCustomerQuery(''); }} className="text-xs text-red-600 mt-1">إزالة العميل</button>}{!!customers.length && <div className="border rounded-lg mt-1 max-h-32 overflow-auto">{customers.map((c) => <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerQuery(c.name); setCustomers([]); }} className="block w-full text-right px-3 py-2 hover:bg-ink-50">{c.name} <span className="text-xs text-ink-400">{c.phone}</span></button>)}</div>}</div>
          <div className="flex items-center justify-between"><h3 className="font-bold">طرق الدفع</h3><button onClick={fullCash} className="text-sm text-brand-700">دفع نقدي كامل</button></div>
          {payments.map((p,index) => <div className="flex gap-2" key={index}><select value={p.method} onChange={(e) => updatePayment(index,'method',e.target.value)} className="border rounded-lg px-2"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option><option value="other">أخرى</option></select><input value={p.amount} onChange={(e) => updatePayment(index,'amount',e.target.value)} placeholder="0.00" inputMode="decimal" className="flex-1 min-w-0 border rounded-lg px-3 py-2"/><button onClick={() => setPayments((old) => old.filter((_,i) => i !== index))} className="text-red-500"><Trash2 size={16}/></button></div>)}
          <button onClick={addPayment} className="text-sm text-brand-700 inline-flex gap-1 items-center"><Plus size={15}/>إضافة دفعة</button>
          <div className="border-t pt-4 space-y-2"><Line label="الإجمالي" value={centsText(totalCents)} strong/><Line label="المدفوع" value={centsText(paidCents)}/><Line label={remaining < 0n ? 'زيادة' : 'المتبقي / آجل'} value={centsText(remaining < 0n ? -remaining : remaining)} strong={remaining > 0n}/>{remaining > 0n && <p className="text-xs text-amber-700">سيُسجل المتبقي كرصيد مستحق على العميل.</p>}</div>
          <button disabled={!canSell || busy || !cart.length || invalidQty || overpaid || (hasCash && !shift)} onClick={finalize} className="w-full rounded-xl bg-brand-600 text-white py-3 font-bold disabled:opacity-40">{busy ? 'جارِ إتمام البيع…' : 'تأكيد البيع'}</button>
          {hasCash && !shift && <p className="text-xs text-red-600">افتح وردية قبل تسجيل دفعة نقدية.</p>}
        </section>
      </div>
      {!canSell && <p className="text-sm text-red-600">لا تملك صلاحية إتمام البيع.</p>}
      {!!warnings.length && <section className="bg-amber-50 text-amber-800 rounded-xl p-3 no-print">تم السماح بمخزون سالب حسب إعداد العيادة لبعض البنود.</section>}
      {invoice && <section className="bg-white rounded-xl2 border p-6 max-w-2xl mx-auto receipt"><div className="text-center"><h2 className="text-xl font-bold">Nuvik Vet</h2><p className="mt-1">إيصال بيع</p><p className="font-bold mt-2">{invoice.invoiceNumber}</p><p className="text-sm text-ink-500">{invoice.customerName || 'عميل نقدي'} · {new Date(invoice.finalizedAt).toLocaleString('ar-EG')}</p></div><div className="divide-y my-4">{invoice.lines?.map((line: any) => <div className="py-2 flex justify-between gap-3" key={line.id}><span>{line.description} × {line.quantity}</span><strong>{line.lineTotal}</strong></div>)}</div><div className="border-t pt-3 flex justify-between font-bold"><span>الإجمالي</span><span>{invoice.total} {invoice.currency}</span></div><div className="flex justify-center gap-2 mt-5 no-print"><button onClick={() => window.print()} className="bg-brand-600 text-white px-4 py-2 rounded-lg flex gap-2"><Printer size={17}/>طباعة الإيصال</button><button onClick={() => { setInvoice(null); setWarnings([]); focusScan(); }} className="border px-4 py-2 rounded-lg">بيع جديد</button></div></section>}
      <div className="hidden"><Wallet /></div>
    </div>
    <Modal open={!!shiftModal} onClose={() => setShiftModal(null)} title={shiftModal === 'open' ? 'فتح وردية الصندوق' : 'إغلاق وردية الصندوق'}>
      <div className="space-y-4" dir="rtl">{shiftModal === 'close' && <><p className="text-sm text-ink-500">بدأت الوردية: {cairoDateTime(shift?.openedAt)}</p><Line label="المتوقع نقدًا" value={`${shift?.expectedCash ?? shift?.openingCash ?? '0.00'} ${shift?.currency ?? ''}`} /><p className="text-xs text-ink-500">المتوقع = النقدية الافتتاحية + المدفوعات النقدية المسجلة في هذه الوردية.</p></>}<label className="block text-sm">{shiftModal === 'open' ? 'النقدية الافتتاحية' : 'النقدية المعدودة'}<input autoFocus value={cashValue} onChange={(e) => setCashValue(e.target.value)} inputMode="decimal" className="block w-full border rounded-lg px-3 py-2 mt-1" /></label>{shiftModal === 'close' && /^\d+(?:\.\d{1,2})?$/.test(cashValue) && <Line label="الفرق بعد العدّ" value={`${centsText(parseMoney(cashValue)-parseMoney(shift?.expectedCash ?? shift?.openingCash ?? '0'))} ${shift?.currency ?? ''}`} strong />}<button disabled={busy} onClick={saveShift} className="w-full bg-brand-600 text-white rounded-lg py-2.5">تأكيد</button></div>
    </Modal>
  </Layout>;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between ${strong ? 'font-bold text-ink-900' : 'text-ink-600'}`}><span>{label}</span><span>{value}</span></div>; }
function cairoDateTime(value?: string) { return value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value)) : '—'; }
function parseMoney(value: string): bigint { if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(value).trim())) return 0n; const [whole, frac = ''] = String(value).trim().split('.'); return BigInt(whole) * 100n + BigInt(frac.padEnd(2,'0')); }
function safeMoney(value: string): bigint { return parseMoney(value); }
function centsText(cents: bigint): string { const sign = cents < 0n ? '-' : ''; const abs = cents < 0n ? -cents : cents; return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2,'0')}`; }
function parseQty(value: string): bigint { if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(String(value).trim())) return 0n; const [whole,frac='']=String(value).trim().split('.'); return BigInt(whole)*1000n+BigInt(frac.padEnd(3,'0')); }
function addQty(a: string, b: string): string { const milli=parseQty(a)+parseQty(b); return `${milli/1000n}.${String(milli%1000n).padStart(3,'0')}`; }
function decrementQty(value: string): string { const milli=parseQty(value); if(milli<=1000n)return '1.000'; const next=milli-1000n; return `${next/1000n}.${String(next%1000n).padStart(3,'0')}`; }
function lineTotal(quantityMilli: bigint, priceCents: bigint): bigint { return (quantityMilli*priceCents+500n)/1000n; }
